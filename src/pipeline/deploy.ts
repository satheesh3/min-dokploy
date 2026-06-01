import path from 'path'
import fs from 'fs/promises'
import os from 'os'
import simpleGit from 'simple-git'
import { docker } from '@/lib/docker'
import { emitLog, emitDone, closeBus } from '@/lib/logBus'
import { imageTag, getRegistryHost } from '@/lib/registry'
import { deploymentDomain } from '@/lib/ids'
import { db } from '@/db'
import { deployments, deploymentLogs } from '@/db/schema'
import { eq, and, notInArray, sql } from 'drizzle-orm'
import type { DeploymentStatus } from '@/db/schema'
import type Dockerode from 'dockerode'

export interface DeployOptions {
  deploymentId: string
  gitUrl: string
  dockerfilePath: string
  exposedPort: number
  customLabels: Record<string, string>
  envVars: Record<string, string>
  healthCheckPath: string | null
}

const SWARM_NETWORK = process.env.SWARM_NETWORK ?? 'mini-dokploy_traefik-net'
const MAX_LOG_LINES = 2000

async function setStatus(id: string, status: DeploymentStatus) {
  await db
    .update(deployments)
    .set({ status, updatedAt: new Date() })
    .where(eq(deployments.id, id))
}

async function appendLog(
  deploymentId: string,
  seqRef: { n: number },
  line: string
): Promise<void> {
  const seq = seqRef.n++
  const now = new Date()

  await db.insert(deploymentLogs).values({ deploymentId, line, seq, createdAt: now })

  // Emit to live subscribers immediately after insert — don't wait for the cap cleanup
  emitLog(deploymentId, { seq, line })

  // Cap at MAX_LOG_LINES in the background — fire and forget
  db.select({ id: deploymentLogs.id })
    .from(deploymentLogs)
    .where(eq(deploymentLogs.deploymentId, deploymentId))
    .orderBy(sql`${deploymentLogs.seq} DESC`)
    .limit(MAX_LOG_LINES)
    .then((oldest) => {
      if (oldest.length === MAX_LOG_LINES) {
        const keepIds = oldest.map((r) => r.id)
        return db
          .delete(deploymentLogs)
          .where(
            and(
              eq(deploymentLogs.deploymentId, deploymentId),
              notInArray(deploymentLogs.id, keepIds)
            )
          )
      }
    })
    .catch(() => {})
}

function maskCredentials(url: string): string {
  try {
    const u = new URL(url)
    if (u.password) {
      u.password = '***'
      u.username = u.username ? '***' : ''
    }
    return u.toString()
  } catch {
    return url
  }
}

async function cloneRepo(gitUrl: string, dir: string): Promise<void> {
  const git = simpleGit()
  await git.clone(gitUrl, dir, ['--depth', '1'])
}

async function buildImage(
  contextDir: string,
  dockerfilePath: string,
  tag: string,
  deploymentId: string,
  seqRef: { n: number }
): Promise<void> {
  return new Promise((resolve, reject) => {
    docker.buildImage(
      { context: contextDir, src: ['.'] },
      { t: tag, dockerfile: dockerfilePath, forcerm: true },
      (err, stream) => {
        if (err) return reject(err)
        if (!stream) return reject(new Error('No build stream returned'))

        docker.modem.followProgress(
          stream,
          (finishErr: Error | null) => {
            if (finishErr) return reject(finishErr)
            resolve()
          },
          (event: { stream?: string; error?: string }) => {
            const line = event.stream ?? event.error ?? ''
            const trimmed = line.replace(/\n$/, '').trim()
            if (trimmed) {
              appendLog(deploymentId, seqRef, trimmed).catch(() => {})
            }
          }
        )
      }
    )
  })
}

async function pushImage(
  tag: string,
  deploymentId: string,
  seqRef: { n: number }
): Promise<void> {
  return new Promise((resolve, reject) => {
    const image = docker.getImage(tag)
    image.push(
      { authconfig: {} },
      (err: Error | null, stream: NodeJS.ReadableStream | undefined) => {
        if (err) return reject(err)
        if (!stream) return reject(new Error('No push stream returned'))

        docker.modem.followProgress(
          stream as any,
          (finishErr: Error | null) => {
            if (finishErr) return reject(finishErr)
            resolve()
          },
          (event: { status?: string; progressDetail?: unknown; error?: string }) => {
            const line = event.status ?? event.error ?? ''
            const trimmed = line.trim()
            if (trimmed && !trimmed.includes('Waiting') && !trimmed.includes('Layer already')) {
              appendLog(deploymentId, seqRef, trimmed).catch(() => {})
            }
          }
        )
      }
    )
  })
}

function buildServiceSpec(
  id: string,
  tag: string,
  exposedPort: number,
  customLabels: Record<string, string>,
  envVars: Record<string, string>,
  healthCheckPath: string | null
): Dockerode.CreateServiceOptions {
  const domain = deploymentDomain(id)
  const routerName = `dep-${id}`

  const traefikLabels: Record<string, string> = {
    'traefik.enable': 'true',
    [`traefik.http.routers.${routerName}.rule`]: `Host(\`${domain}\`)`,
    [`traefik.http.services.${routerName}.loadbalancer.server.port`]: String(exposedPort),
  }

  const labels = { ...traefikLabels, ...customLabels }

  return {
    Name: routerName,
    Labels: labels,
    TaskTemplate: {
      ContainerSpec: {
        Image: tag,
        Env: [
          `PORT=${exposedPort}`,
          ...Object.entries(envVars).map(([k, v]) => `${k}=${v}`),
        ],
        ...(healthCheckPath && {
          HealthCheck: {
            Test: ['CMD-SHELL', `wget -qO- http://localhost:${exposedPort}${healthCheckPath} || exit 1`],
            Interval: 30_000_000_000,
            Timeout: 10_000_000_000,
            Retries: 3,
            StartPeriod: 30_000_000_000,
          },
        }),
      },
      RestartPolicy: {
        Condition: 'on-failure',
        MaxAttempts: 3,
        Delay: 5_000_000_000,  // 5 seconds in nanoseconds
        Window: 120_000_000_000, // reset attempt counter after 2 min of healthy uptime
      },
    },
    EndpointSpec: {
      Mode: 'vip' as const,
    },
    Networks: [{ Target: SWARM_NETWORK }],
  }
}

async function createOrUpdateService(
  id: string,
  existingServiceId: string | null | undefined,
  tag: string,
  exposedPort: number,
  customLabels: Record<string, string>,
  envVars: Record<string, string>,
  healthCheckPath: string | null
): Promise<string> {
  const spec = buildServiceSpec(id, tag, exposedPort, customLabels, envVars, healthCheckPath)

  if (existingServiceId) {
    try {
      const service = docker.getService(existingServiceId)
      const info = await service.inspect()
      await service.update({
        ...spec,
        version: info.Version.Index,
      })
      return existingServiceId
    } catch {
      // Service no longer exists — create fresh
    }
  }

  const service = await docker.createService(spec)
  return service.id
}

export async function runDeployPipeline(opts: DeployOptions): Promise<void> {
  const { deploymentId, gitUrl, dockerfilePath, exposedPort, customLabels, envVars, healthCheckPath } = opts
  const seqRef = { n: 0 }
  let tmpDir: string | null = null

  try {
    await setStatus(deploymentId, 'building')
    await appendLog(deploymentId, seqRef, `=== Cloning ${maskCredentials(gitUrl)} ===`)

    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'dep-'))
    await cloneRepo(gitUrl, tmpDir)
    await appendLog(deploymentId, seqRef, 'Clone complete')

    const tag = imageTag(deploymentId)
    await appendLog(deploymentId, seqRef, `=== Building image ${tag} ===`)
    await buildImage(tmpDir, dockerfilePath, tag, deploymentId, seqRef)
    await appendLog(deploymentId, seqRef, 'Build complete')

    await setStatus(deploymentId, 'pushing')
    await appendLog(deploymentId, seqRef, `=== Pushing to ${getRegistryHost()} ===`)
    await pushImage(tag, deploymentId, seqRef)
    await appendLog(deploymentId, seqRef, 'Push complete')

    await setStatus(deploymentId, 'deploying')
    await appendLog(deploymentId, seqRef, '=== Creating Swarm service ===')

    const [deployment] = await db
      .select()
      .from(deployments)
      .where(eq(deployments.id, deploymentId))
      .limit(1)

    const serviceId = await createOrUpdateService(
      deploymentId,
      deployment?.serviceId,
      tag,
      exposedPort,
      customLabels,
      envVars,
      healthCheckPath
    )

    await db
      .update(deployments)
      .set({ serviceId, status: 'running', updatedAt: new Date() })
      .where(eq(deployments.id, deploymentId))

    const domain = deploymentDomain(deploymentId)
    await appendLog(deploymentId, seqRef, `=== Deployed! http://${domain} ===`)

    emitDone(deploymentId, 'running')
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    await appendLog(deploymentId, seqRef, `ERROR: ${msg}`).catch(() => {})
    await setStatus(deploymentId, 'failed').catch(() => {})
    emitDone(deploymentId, 'failed')
  } finally {
    closeBus(deploymentId)
    if (tmpDir) {
      await fs.rm(tmpDir, { recursive: true, force: true }).catch(() => {})
    }
  }
}

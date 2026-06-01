import { router, protectedProc } from '../trpc'
import { TRPCError } from '@trpc/server'
import { z } from 'zod'
import { eq, desc, gt, and } from 'drizzle-orm'
import { deployments, deploymentLogs } from '@/db/schema'
import { generateId, deploymentDomain } from '@/lib/ids'
import { runDeployPipeline } from '@/pipeline/deploy'
import { docker } from '@/lib/docker'

const CreateDeploymentInput = z.object({
  name: z.string().min(1).max(60),
  gitUrl: z.string().url(),
  dockerfilePath: z.string().default('Dockerfile'),
  exposedPort: z.number().int().min(1).max(65535),
  customLabels: z.record(z.string()).optional().default({}),
  envVars: z.record(z.string()).optional().default({}),
  healthCheckPath: z.string().nullable().optional().default(null),
})

export const deploymentRouter = router({
  create: protectedProc
    .input(CreateDeploymentInput)
    .mutation(async ({ ctx, input }) => {
      const id = generateId()
      const domain = deploymentDomain(id)
      const now = new Date()

      await ctx.db.insert(deployments).values({
        id,
        userId: ctx.session.user.id,
        name: input.name,
        gitUrl: input.gitUrl,
        dockerfilePath: input.dockerfilePath,
        exposedPort: input.exposedPort,
        customLabels: JSON.stringify(input.customLabels),
        envVars: JSON.stringify(input.envVars),
        healthCheckPath: input.healthCheckPath,
        status: 'pending',
        domain,
        createdAt: now,
        updatedAt: now,
      })

      // Fire-and-forget build pipeline
      setImmediate(() => {
        runDeployPipeline({
          deploymentId: id,
          gitUrl: input.gitUrl,
          dockerfilePath: input.dockerfilePath,
          exposedPort: input.exposedPort,
          customLabels: input.customLabels,
          envVars: input.envVars,
          healthCheckPath: input.healthCheckPath,
        }).catch(console.error)
      })

      return { id, domain }
    }),

  list: protectedProc.query(async ({ ctx }) => {
    const rows = await ctx.db
      .select()
      .from(deployments)
      .where(eq(deployments.userId, ctx.session.user.id))
      .orderBy(desc(deployments.createdAt))

    return rows.map((r) => ({
      id: r.id,
      name: r.name,
      status: r.status,
      domain: r.domain,
      gitUrl: r.gitUrl,
      dockerfilePath: r.dockerfilePath,
      exposedPort: r.exposedPort,
      customLabels: parseLabels(r.customLabels),
      envVars: parseLabels(r.envVars),
      healthCheckPath: r.healthCheckPath,
      serviceId: r.serviceId,
      createdAt: r.createdAt,
      updatedAt: r.updatedAt,
    }))
  }),

  get: protectedProc
    .input(z.object({ id: z.string() }))
    .query(async ({ ctx, input }) => {
      const [dep] = await ctx.db
        .select()
        .from(deployments)
        .where(eq(deployments.id, input.id))
        .limit(1)

      if (!dep) throw new TRPCError({ code: 'NOT_FOUND' })
      if (dep.userId !== ctx.session.user.id) throw new TRPCError({ code: 'FORBIDDEN' })

      return {
        id: dep.id,
        name: dep.name,
        status: dep.status,
        domain: dep.domain,
        gitUrl: dep.gitUrl,
        dockerfilePath: dep.dockerfilePath,
        exposedPort: dep.exposedPort,
        customLabels: parseLabels(dep.customLabels),
        envVars: parseLabels(dep.envVars),
        healthCheckPath: dep.healthCheckPath,
        serviceId: dep.serviceId,
        createdAt: dep.createdAt,
        updatedAt: dep.updatedAt,
      }
    }),

  getLogs: protectedProc
    .input(z.object({ id: z.string(), since: z.number().optional() }))
    .query(async ({ ctx, input }) => {
      await assertOwner(ctx, input.id)

      const rows = await ctx.db
        .select()
        .from(deploymentLogs)
        .where(
          and(
            eq(deploymentLogs.deploymentId, input.id),
            input.since !== undefined ? gt(deploymentLogs.seq, input.since) : undefined
          )
        )
        .orderBy(deploymentLogs.seq)

      return rows.map((r) => ({
        seq: r.seq,
        line: r.line,
        createdAt: r.createdAt,
      }))
    }),

  redeploy: protectedProc
    .input(z.object({ id: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const dep = await assertOwner(ctx, input.id)

      const active: string[] = ['building', 'pushing', 'deploying']
      if (active.includes(dep.status)) {
        throw new TRPCError({
          code: 'CONFLICT',
          message: 'Deployment is already in progress',
        })
      }

      await ctx.db
        .update(deployments)
        .set({ status: 'pending', updatedAt: new Date() })
        .where(eq(deployments.id, input.id))

      setImmediate(() => {
        runDeployPipeline({
          deploymentId: dep.id,
          gitUrl: dep.gitUrl,
          dockerfilePath: dep.dockerfilePath,
          exposedPort: dep.exposedPort,
          customLabels: parseLabels(dep.customLabels),
          envVars: parseLabels(dep.envVars),
          healthCheckPath: dep.healthCheckPath,
        }).catch(console.error)
      })

      return { ok: true }
    }),

  stop: protectedProc
    .input(z.object({ id: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const dep = await assertOwner(ctx, input.id)

      if (dep.serviceId) {
        try {
          await docker.getService(dep.serviceId).remove()
        } catch {
          // Already gone
        }
      }

      await ctx.db
        .update(deployments)
        .set({ status: 'stopped', updatedAt: new Date() })
        .where(eq(deployments.id, input.id))

      return { ok: true }
    }),

  delete: protectedProc
    .input(z.object({ id: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const dep = await assertOwner(ctx, input.id)

      if (dep.serviceId) {
        try {
          const service = docker.getService(dep.serviceId)
          await service.remove()
        } catch {
          // Service may already be gone
        }
      }

      await ctx.db.delete(deployments).where(eq(deployments.id, input.id))

      return { ok: true }
    }),
})

async function assertOwner(
  ctx: { db: typeof import('@/db').db; session: { user: { id: string } } },
  deploymentId: string
) {
  const [dep] = await ctx.db
    .select()
    .from(deployments)
    .where(eq(deployments.id, deploymentId))
    .limit(1)

  if (!dep) throw new TRPCError({ code: 'NOT_FOUND' })
  if (dep.userId !== ctx.session.user.id) throw new TRPCError({ code: 'FORBIDDEN' })

  return dep
}

function parseLabels(raw: string | null): Record<string, string> {
  try {
    return JSON.parse(raw ?? '{}') as Record<string, string>
  } catch {
    return {}
  }
}

"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.runDeployPipeline = runDeployPipeline;
const path_1 = __importDefault(require("path"));
const promises_1 = __importDefault(require("fs/promises"));
const os_1 = __importDefault(require("os"));
const simple_git_1 = __importDefault(require("simple-git"));
const docker_1 = require("../lib/docker");
const logBus_1 = require("../lib/logBus");
const registry_1 = require("../lib/registry");
const ids_1 = require("../lib/ids");
const db_1 = require("../db");
const schema_1 = require("../db/schema");
const drizzle_orm_1 = require("drizzle-orm");
const SWARM_NETWORK = process.env.SWARM_NETWORK ?? 'mini-dokploy_traefik-net';
const MAX_LOG_LINES = 2000;
async function setStatus(id, status) {
    await db_1.db
        .update(schema_1.deployments)
        .set({ status, updatedAt: new Date() })
        .where((0, drizzle_orm_1.eq)(schema_1.deployments.id, id));
}
async function appendLog(deploymentId, seqRef, line) {
    const seq = seqRef.n++;
    const now = new Date();
    await db_1.db.insert(schema_1.deploymentLogs).values({ deploymentId, line, seq, createdAt: now });
    // Cap at MAX_LOG_LINES — delete oldest rows beyond the limit
    const oldest = await db_1.db
        .select({ id: schema_1.deploymentLogs.id })
        .from(schema_1.deploymentLogs)
        .where((0, drizzle_orm_1.eq)(schema_1.deploymentLogs.deploymentId, deploymentId))
        .orderBy((0, drizzle_orm_1.sql) `${schema_1.deploymentLogs.seq} DESC`)
        .limit(MAX_LOG_LINES);
    if (oldest.length === MAX_LOG_LINES) {
        const keepIds = oldest.map((r) => r.id);
        await db_1.db
            .delete(schema_1.deploymentLogs)
            .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(schema_1.deploymentLogs.deploymentId, deploymentId), (0, drizzle_orm_1.notInArray)(schema_1.deploymentLogs.id, keepIds)));
    }
    (0, logBus_1.emitLog)(deploymentId, { seq, line });
}
function maskCredentials(url) {
    try {
        const u = new URL(url);
        if (u.password) {
            u.password = '***';
            u.username = u.username ? '***' : '';
        }
        return u.toString();
    }
    catch {
        return url;
    }
}
async function cloneRepo(gitUrl, dir) {
    const git = (0, simple_git_1.default)();
    await git.clone(gitUrl, dir, ['--depth', '1']);
}
async function buildImage(contextDir, dockerfilePath, tag, deploymentId, seqRef) {
    return new Promise((resolve, reject) => {
        docker_1.docker.buildImage({ context: contextDir, src: ['.'] }, { t: tag, dockerfile: dockerfilePath, forcerm: true }, (err, stream) => {
            if (err)
                return reject(err);
            if (!stream)
                return reject(new Error('No build stream returned'));
            docker_1.docker.modem.followProgress(stream, (finishErr) => {
                if (finishErr)
                    return reject(finishErr);
                resolve();
            }, (event) => {
                const line = event.stream ?? event.error ?? '';
                const trimmed = line.replace(/\n$/, '').trim();
                if (trimmed) {
                    appendLog(deploymentId, seqRef, trimmed).catch(() => { });
                }
            });
        });
    });
}
async function pushImage(tag, deploymentId, seqRef) {
    return new Promise((resolve, reject) => {
        const image = docker_1.docker.getImage(tag);
        image.push({ authconfig: {} }, (err, stream) => {
            if (err)
                return reject(err);
            if (!stream)
                return reject(new Error('No push stream returned'));
            docker_1.docker.modem.followProgress(stream, (finishErr) => {
                if (finishErr)
                    return reject(finishErr);
                resolve();
            }, (event) => {
                const line = event.status ?? event.error ?? '';
                const trimmed = line.trim();
                if (trimmed && !trimmed.includes('Waiting') && !trimmed.includes('Layer already')) {
                    appendLog(deploymentId, seqRef, trimmed).catch(() => { });
                }
            });
        });
    });
}
function buildServiceSpec(id, tag, exposedPort, customLabels) {
    const domain = (0, ids_1.deploymentDomain)(id);
    const routerName = `dep-${id}`;
    const traefikLabels = {
        'traefik.enable': 'true',
        [`traefik.http.routers.${routerName}.rule`]: `Host(\`${domain}\`)`,
        [`traefik.http.services.${routerName}.loadbalancer.server.port`]: String(exposedPort),
    };
    const labels = { ...traefikLabels, ...customLabels };
    return {
        Name: routerName,
        Labels: labels,
        TaskTemplate: {
            ContainerSpec: {
                Image: tag,
            },
            RestartPolicy: {
                Condition: 'on-failure',
                MaxAttempts: 3,
                Delay: 5_000_000_000, // 5 seconds in nanoseconds
                Window: 120_000_000_000, // reset attempt counter after 2 min of healthy uptime
            },
        },
        EndpointSpec: {
            Mode: 'vip',
        },
        Networks: [{ Target: SWARM_NETWORK }],
    };
}
async function createOrUpdateService(id, existingServiceId, tag, exposedPort, customLabels) {
    const spec = buildServiceSpec(id, tag, exposedPort, customLabels);
    if (existingServiceId) {
        try {
            const service = docker_1.docker.getService(existingServiceId);
            const info = await service.inspect();
            await service.update({
                ...spec,
                version: info.Version.Index,
            });
            return existingServiceId;
        }
        catch {
            // Service no longer exists — create fresh
        }
    }
    const service = await docker_1.docker.createService(spec);
    return service.ID ?? service.id;
}
async function runDeployPipeline(opts) {
    const { deploymentId, gitUrl, dockerfilePath, exposedPort, customLabels } = opts;
    const seqRef = { n: 0 };
    let tmpDir = null;
    try {
        await setStatus(deploymentId, 'building');
        await appendLog(deploymentId, seqRef, `=== Cloning ${maskCredentials(gitUrl)} ===`);
        tmpDir = await promises_1.default.mkdtemp(path_1.default.join(os_1.default.tmpdir(), 'dep-'));
        await cloneRepo(gitUrl, tmpDir);
        await appendLog(deploymentId, seqRef, 'Clone complete');
        const tag = (0, registry_1.imageTag)(deploymentId);
        await appendLog(deploymentId, seqRef, `=== Building image ${tag} ===`);
        await buildImage(tmpDir, dockerfilePath, tag, deploymentId, seqRef);
        await appendLog(deploymentId, seqRef, 'Build complete');
        await setStatus(deploymentId, 'pushing');
        await appendLog(deploymentId, seqRef, `=== Pushing to ${(0, registry_1.getRegistryHost)()} ===`);
        await pushImage(tag, deploymentId, seqRef);
        await appendLog(deploymentId, seqRef, 'Push complete');
        await setStatus(deploymentId, 'deploying');
        await appendLog(deploymentId, seqRef, '=== Creating Swarm service ===');
        const [deployment] = await db_1.db
            .select()
            .from(schema_1.deployments)
            .where((0, drizzle_orm_1.eq)(schema_1.deployments.id, deploymentId))
            .limit(1);
        const serviceId = await createOrUpdateService(deploymentId, deployment?.serviceId, tag, exposedPort, customLabels);
        await db_1.db
            .update(schema_1.deployments)
            .set({ serviceId, status: 'running', updatedAt: new Date() })
            .where((0, drizzle_orm_1.eq)(schema_1.deployments.id, deploymentId));
        const domain = (0, ids_1.deploymentDomain)(deploymentId);
        await appendLog(deploymentId, seqRef, `=== Deployed! http://${domain} ===`);
        (0, logBus_1.emitDone)(deploymentId, 'running');
    }
    catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        await appendLog(deploymentId, seqRef, `ERROR: ${msg}`).catch(() => { });
        await setStatus(deploymentId, 'failed').catch(() => { });
        (0, logBus_1.emitDone)(deploymentId, 'failed');
    }
    finally {
        (0, logBus_1.closeBus)(deploymentId);
        if (tmpDir) {
            await promises_1.default.rm(tmpDir, { recursive: true, force: true }).catch(() => { });
        }
    }
}

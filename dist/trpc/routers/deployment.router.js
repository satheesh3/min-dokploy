"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.deploymentRouter = void 0;
const trpc_1 = require("../trpc");
const server_1 = require("@trpc/server");
const zod_1 = require("zod");
const drizzle_orm_1 = require("drizzle-orm");
const schema_1 = require("../../db/schema");
const ids_1 = require("../../lib/ids");
const deploy_1 = require("../../pipeline/deploy");
const docker_1 = require("../../lib/docker");
const CreateDeploymentInput = zod_1.z.object({
    name: zod_1.z.string().min(1).max(60),
    gitUrl: zod_1.z.string().url(),
    dockerfilePath: zod_1.z.string().default('Dockerfile'),
    exposedPort: zod_1.z.number().int().min(1).max(65535),
    customLabels: zod_1.z.record(zod_1.z.string()).optional().default({}),
});
exports.deploymentRouter = (0, trpc_1.router)({
    create: trpc_1.protectedProc
        .input(CreateDeploymentInput)
        .mutation(async ({ ctx, input }) => {
        const id = (0, ids_1.generateId)();
        const domain = (0, ids_1.deploymentDomain)(id);
        const now = new Date();
        await ctx.db.insert(schema_1.deployments).values({
            id,
            userId: ctx.session.user.id,
            name: input.name,
            gitUrl: input.gitUrl,
            dockerfilePath: input.dockerfilePath,
            exposedPort: input.exposedPort,
            customLabels: JSON.stringify(input.customLabels),
            status: 'pending',
            domain,
            createdAt: now,
            updatedAt: now,
        });
        // Fire-and-forget build pipeline
        setImmediate(() => {
            (0, deploy_1.runDeployPipeline)({
                deploymentId: id,
                gitUrl: input.gitUrl,
                dockerfilePath: input.dockerfilePath,
                exposedPort: input.exposedPort,
                customLabels: input.customLabels,
            }).catch(console.error);
        });
        return { id, domain };
    }),
    list: trpc_1.protectedProc.query(async ({ ctx }) => {
        const rows = await ctx.db
            .select()
            .from(schema_1.deployments)
            .where((0, drizzle_orm_1.eq)(schema_1.deployments.userId, ctx.session.user.id))
            .orderBy((0, drizzle_orm_1.desc)(schema_1.deployments.createdAt));
        return rows.map((r) => ({
            id: r.id,
            name: r.name,
            status: r.status,
            domain: r.domain,
            gitUrl: r.gitUrl,
            dockerfilePath: r.dockerfilePath,
            exposedPort: r.exposedPort,
            customLabels: parseLabels(r.customLabels),
            serviceId: r.serviceId,
            createdAt: r.createdAt,
            updatedAt: r.updatedAt,
        }));
    }),
    get: trpc_1.protectedProc
        .input(zod_1.z.object({ id: zod_1.z.string() }))
        .query(async ({ ctx, input }) => {
        const [dep] = await ctx.db
            .select()
            .from(schema_1.deployments)
            .where((0, drizzle_orm_1.eq)(schema_1.deployments.id, input.id))
            .limit(1);
        if (!dep)
            throw new server_1.TRPCError({ code: 'NOT_FOUND' });
        if (dep.userId !== ctx.session.user.id)
            throw new server_1.TRPCError({ code: 'FORBIDDEN' });
        return {
            id: dep.id,
            name: dep.name,
            status: dep.status,
            domain: dep.domain,
            gitUrl: dep.gitUrl,
            dockerfilePath: dep.dockerfilePath,
            exposedPort: dep.exposedPort,
            customLabels: parseLabels(dep.customLabels),
            serviceId: dep.serviceId,
            createdAt: dep.createdAt,
            updatedAt: dep.updatedAt,
        };
    }),
    getLogs: trpc_1.protectedProc
        .input(zod_1.z.object({ id: zod_1.z.string(), since: zod_1.z.number().optional() }))
        .query(async ({ ctx, input }) => {
        await assertOwner(ctx, input.id);
        const rows = await ctx.db
            .select()
            .from(schema_1.deploymentLogs)
            .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(schema_1.deploymentLogs.deploymentId, input.id), input.since !== undefined ? (0, drizzle_orm_1.gt)(schema_1.deploymentLogs.seq, input.since) : undefined))
            .orderBy(schema_1.deploymentLogs.seq);
        return rows.map((r) => ({
            seq: r.seq,
            line: r.line,
            createdAt: r.createdAt,
        }));
    }),
    redeploy: trpc_1.protectedProc
        .input(zod_1.z.object({ id: zod_1.z.string() }))
        .mutation(async ({ ctx, input }) => {
        const dep = await assertOwner(ctx, input.id);
        const active = ['building', 'pushing', 'deploying'];
        if (active.includes(dep.status)) {
            throw new server_1.TRPCError({
                code: 'CONFLICT',
                message: 'Deployment is already in progress',
            });
        }
        await ctx.db
            .update(schema_1.deployments)
            .set({ status: 'pending', updatedAt: new Date() })
            .where((0, drizzle_orm_1.eq)(schema_1.deployments.id, input.id));
        setImmediate(() => {
            (0, deploy_1.runDeployPipeline)({
                deploymentId: dep.id,
                gitUrl: dep.gitUrl,
                dockerfilePath: dep.dockerfilePath,
                exposedPort: dep.exposedPort,
                customLabels: parseLabels(dep.customLabels),
            }).catch(console.error);
        });
        return { ok: true };
    }),
    delete: trpc_1.protectedProc
        .input(zod_1.z.object({ id: zod_1.z.string() }))
        .mutation(async ({ ctx, input }) => {
        const dep = await assertOwner(ctx, input.id);
        if (dep.serviceId) {
            try {
                const service = docker_1.docker.getService(dep.serviceId);
                await service.remove();
            }
            catch {
                // Service may already be gone
            }
        }
        await ctx.db.delete(schema_1.deployments).where((0, drizzle_orm_1.eq)(schema_1.deployments.id, input.id));
        return { ok: true };
    }),
});
async function assertOwner(ctx, deploymentId) {
    const [dep] = await ctx.db
        .select()
        .from(schema_1.deployments)
        .where((0, drizzle_orm_1.eq)(schema_1.deployments.id, deploymentId))
        .limit(1);
    if (!dep)
        throw new server_1.TRPCError({ code: 'NOT_FOUND' });
    if (dep.userId !== ctx.session.user.id)
        throw new server_1.TRPCError({ code: 'FORBIDDEN' });
    return dep;
}
function parseLabels(raw) {
    try {
        return JSON.parse(raw ?? '{}');
    }
    catch {
        return {};
    }
}

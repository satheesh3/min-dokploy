"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.authRouter = void 0;
const trpc_1 = require("../trpc");
const auth_1 = require("../../lib/auth");
const zod_1 = require("zod");
exports.authRouter = (0, trpc_1.router)({
    getSession: trpc_1.publicProc.query(({ ctx }) => {
        return ctx.session;
    }),
    signUp: trpc_1.publicProc
        .input(zod_1.z.object({
        email: zod_1.z.string().email(),
        password: zod_1.z.string().min(8),
        name: zod_1.z.string().optional(),
    }))
        .mutation(async ({ ctx, input }) => {
        const result = await auth_1.auth.api.signUpEmail({
            body: {
                email: input.email,
                password: input.password,
                name: input.name ?? input.email.split('@')[0],
            },
            headers: ctx.req.headers,
            asResponse: false,
        });
        return result;
    }),
    signIn: trpc_1.publicProc
        .input(zod_1.z.object({
        email: zod_1.z.string().email(),
        password: zod_1.z.string(),
    }))
        .mutation(async ({ ctx, input }) => {
        const result = await auth_1.auth.api.signInEmail({
            body: {
                email: input.email,
                password: input.password,
            },
            headers: ctx.req.headers,
            asResponse: false,
        });
        return result;
    }),
    signOut: trpc_1.publicProc.mutation(async ({ ctx }) => {
        await auth_1.auth.api.signOut({
            headers: ctx.req.headers,
        });
        return { success: true };
    }),
});

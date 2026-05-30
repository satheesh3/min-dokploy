"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.authRouter = void 0;
const trpc_1 = require("../trpc");
const server_1 = require("@trpc/server");
const auth_1 = require("../../lib/auth");
const zod_1 = require("zod");
// Forward every Set-Cookie header from a BetterAuth Response onto the
// Next.js ServerResponse so the browser actually receives the session cookie.
function forwardCookies(response, res) {
    const cookies = response.headers.getSetCookie?.() ?? [];
    if (cookies.length > 0) {
        res.setHeader('Set-Cookie', cookies);
    }
    else {
        const single = response.headers.get('set-cookie');
        if (single)
            res.setHeader('Set-Cookie', single);
    }
}
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
        const response = await auth_1.auth.api.signUpEmail({
            body: {
                email: input.email,
                password: input.password,
                name: input.name ?? input.email.split('@')[0],
            },
            headers: ctx.req.headers,
            asResponse: true,
        });
        forwardCookies(response, ctx.res);
        if (!response.ok) {
            const err = await response.json().catch(() => ({ message: 'Sign-up failed' }));
            throw new server_1.TRPCError({ code: 'BAD_REQUEST', message: err.message ?? 'Sign-up failed' });
        }
        return response.json();
    }),
    signIn: trpc_1.publicProc
        .input(zod_1.z.object({
        email: zod_1.z.string().email(),
        password: zod_1.z.string(),
    }))
        .mutation(async ({ ctx, input }) => {
        const response = await auth_1.auth.api.signInEmail({
            body: {
                email: input.email,
                password: input.password,
            },
            headers: ctx.req.headers,
            asResponse: true,
        });
        forwardCookies(response, ctx.res);
        if (!response.ok) {
            const err = await response.json().catch(() => ({ message: 'Invalid credentials' }));
            throw new server_1.TRPCError({ code: 'UNAUTHORIZED', message: err.message ?? 'Invalid credentials' });
        }
        return response.json();
    }),
    signOut: trpc_1.publicProc.mutation(async ({ ctx }) => {
        const response = await auth_1.auth.api.signOut({
            headers: ctx.req.headers,
            asResponse: true,
        });
        forwardCookies(response, ctx.res);
        return { success: true };
    }),
});

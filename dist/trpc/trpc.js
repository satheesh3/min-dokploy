"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.protectedProc = exports.publicProc = exports.router = void 0;
const server_1 = require("@trpc/server");
const superjson_1 = __importDefault(require("superjson"));
const t = server_1.initTRPC.context().create({
    transformer: superjson_1.default,
});
exports.router = t.router;
exports.publicProc = t.procedure;
exports.protectedProc = t.procedure.use(({ ctx, next }) => {
    if (!ctx.session) {
        throw new server_1.TRPCError({ code: 'UNAUTHORIZED', message: 'Not authenticated' });
    }
    return next({
        ctx: {
            ...ctx,
            session: ctx.session,
        },
    });
});

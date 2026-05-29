"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.userRouter = void 0;
const trpc_1 = require("../trpc");
exports.userRouter = (0, trpc_1.router)({
    me: trpc_1.protectedProc.query(({ ctx }) => {
        const { id, email, name, createdAt } = ctx.session.user;
        return { id, email, name, createdAt };
    }),
});

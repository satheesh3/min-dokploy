"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.appRouter = void 0;
const trpc_1 = require("../trpc");
const auth_router_1 = require("./auth.router");
const deployment_router_1 = require("./deployment.router");
const user_router_1 = require("./user.router");
exports.appRouter = (0, trpc_1.router)({
    auth: auth_router_1.authRouter,
    deployment: deployment_router_1.deploymentRouter,
    user: user_router_1.userRouter,
});

"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.trpc = void 0;
const next_1 = require("@trpc/next");
const client_1 = require("@trpc/client");
const superjson_1 = __importDefault(require("superjson"));
function getBaseUrl() {
    if (typeof window !== 'undefined')
        return '';
    return `http://localhost:${process.env.PORT ?? 3000}`;
}
exports.trpc = (0, next_1.createTRPCNext)({
    transformer: superjson_1.default,
    config() {
        return {
            links: [
                (0, client_1.httpBatchLink)({
                    url: `${getBaseUrl()}/api/trpc`,
                    transformer: superjson_1.default,
                }),
            ],
        };
    },
    ssr: false,
});

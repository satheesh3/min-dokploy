"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const http_1 = __importDefault(require("http"));
const url_1 = require("url");
const next_1 = __importDefault(require("next"));
const ws_1 = require("ws");
const index_1 = require("./db/index");
const docker_1 = require("./lib/docker");
const handler_1 = require("./ws/handler");
const dev = process.env.NODE_ENV !== 'production';
const port = parseInt(process.env.PORT ?? '3000', 10);
const app = (0, next_1.default)({ dev, dir: process.cwd() });
const handle = app.getRequestHandler();
async function main() {
    await (0, index_1.runMigrations)();
    await (0, docker_1.assertDockerConnected)();
    await app.prepare();
    const server = http_1.default.createServer((req, res) => {
        const parsedUrl = (0, url_1.parse)(req.url ?? '/', true);
        handle(req, res, parsedUrl);
    });
    const wss = new ws_1.WebSocketServer({ noServer: true });
    (0, handler_1.attachWebSocketServer)(wss);
    server.on('upgrade', (req, socket, head) => {
        const { pathname } = (0, url_1.parse)(req.url ?? '/');
        if (pathname === '/ws/logs') {
            wss.handleUpgrade(req, socket, head, (ws) => {
                wss.emit('connection', ws, req);
            });
        }
        else {
            socket.destroy();
        }
    });
    server.listen(port, () => {
        console.log(`> Ready on http://localhost:${port}`);
    });
}
main().catch((err) => {
    console.error('Fatal startup error:', err);
    process.exit(1);
});

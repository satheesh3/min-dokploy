"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.attachWebSocketServer = attachWebSocketServer;
const ws_1 = require("ws");
const url_1 = require("url");
const auth_1 = require("../lib/auth");
const db_1 = require("../db");
const schema_1 = require("../db/schema");
const drizzle_orm_1 = require("drizzle-orm");
const logBus_1 = require("../lib/logBus");
function send(ws, msg) {
    if (ws.readyState === ws_1.WebSocket.OPEN) {
        ws.send(JSON.stringify(msg));
    }
}
function attachWebSocketServer(wss) {
    wss.on('connection', async (ws, req) => {
        const { query } = (0, url_1.parse)(req.url ?? '', true);
        const deploymentId = query.deploymentId;
        if (!deploymentId) {
            ws.close(4000, 'Missing deploymentId');
            return;
        }
        // Authenticate via session cookie sent with upgrade request
        const cookie = req.headers.cookie ?? '';
        let session = null;
        try {
            session = await auth_1.auth.api.getSession({
                headers: { cookie },
            });
        }
        catch {
            // ignore
        }
        if (!session) {
            ws.close(4001, 'Unauthorized');
            return;
        }
        // Check deployment ownership
        const [dep] = await db_1.db
            .select()
            .from(schema_1.deployments)
            .where((0, drizzle_orm_1.eq)(schema_1.deployments.id, deploymentId))
            .limit(1);
        if (!dep) {
            ws.close(4004, 'Not found');
            return;
        }
        if (dep.userId !== session.user.id) {
            ws.close(4003, 'Forbidden');
            return;
        }
        // Send historical logs first
        const historicalLogs = await db_1.db
            .select()
            .from(schema_1.deploymentLogs)
            .where((0, drizzle_orm_1.eq)(schema_1.deploymentLogs.deploymentId, deploymentId))
            .orderBy((0, drizzle_orm_1.asc)(schema_1.deploymentLogs.seq));
        for (const log of historicalLogs) {
            send(ws, { type: 'log', seq: log.seq, line: log.line });
        }
        // If deployment is already in a terminal state, send done and close
        const terminalStatuses = ['running', 'failed', 'stopped'];
        if (terminalStatuses.includes(dep.status)) {
            send(ws, { type: 'done', finalStatus: dep.status });
            ws.close();
            return;
        }
        // Subscribe to live log events
        const seen = new Set(historicalLogs.map((l) => l.seq));
        const unsubLog = (0, logBus_1.onLog)(deploymentId, (event) => {
            if (!seen.has(event.seq)) {
                seen.add(event.seq);
                send(ws, { type: 'log', seq: event.seq, line: event.line });
            }
        });
        const unsubDone = (0, logBus_1.onDone)(deploymentId, (finalStatus) => {
            send(ws, { type: 'done', finalStatus });
            ws.close();
        });
        ws.on('close', () => {
            unsubLog();
            unsubDone();
        });
        ws.on('error', () => {
            unsubLog();
            unsubDone();
        });
    });
}

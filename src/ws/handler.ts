import type { IncomingMessage } from 'http'
import { WebSocket, WebSocketServer } from 'ws'
import { parse } from 'url'
import { auth } from '@/lib/auth'
import { db } from '@/db'
import { deployments, deploymentLogs } from '@/db/schema'
import { eq, asc } from 'drizzle-orm'
import { onLog, onDone } from '@/lib/logBus'

export interface WsLogMessage {
  type: 'log'
  seq: number
  line: string
}

export interface WsDoneMessage {
  type: 'done'
  finalStatus: string
}

function send(ws: WebSocket, msg: WsLogMessage | WsDoneMessage) {
  if (ws.readyState === WebSocket.OPEN) {
    ws.send(JSON.stringify(msg))
  }
}

export function attachWebSocketServer(wss: WebSocketServer): void {
  wss.on('connection', async (ws: WebSocket, req: IncomingMessage) => {
    const { query } = parse(req.url ?? '', true)
    const deploymentId = query.deploymentId as string | undefined

    if (!deploymentId) {
      ws.close(4000, 'Missing deploymentId')
      return
    }

    // Authenticate via session cookie sent with upgrade request
    const cookie = req.headers.cookie ?? ''
    let session: Awaited<ReturnType<typeof auth.api.getSession>> | null = null
    try {
      session = await auth.api.getSession({
        headers: { cookie } as unknown as Headers,
      })
    } catch {
      // ignore
    }

    if (!session) {
      ws.close(4001, 'Unauthorized')
      return
    }

    // Check deployment ownership
    const [dep] = await db
      .select()
      .from(deployments)
      .where(eq(deployments.id, deploymentId))
      .limit(1)

    if (!dep) {
      ws.close(4004, 'Not found')
      return
    }

    if (dep.userId !== session.user.id) {
      ws.close(4003, 'Forbidden')
      return
    }

    // Send historical logs first
    const historicalLogs = await db
      .select()
      .from(deploymentLogs)
      .where(eq(deploymentLogs.deploymentId, deploymentId))
      .orderBy(asc(deploymentLogs.seq))

    for (const log of historicalLogs) {
      send(ws, { type: 'log', seq: log.seq, line: log.line })
    }

    // If deployment is already in a terminal state, send done and close
    const terminalStatuses = ['running', 'failed', 'stopped']
    if (terminalStatuses.includes(dep.status)) {
      send(ws, { type: 'done', finalStatus: dep.status })
      ws.close()
      return
    }

    // Subscribe to live log events
    const seen = new Set(historicalLogs.map((l) => l.seq))

    const unsubLog = onLog(deploymentId, (event) => {
      if (!seen.has(event.seq)) {
        seen.add(event.seq)
        send(ws, { type: 'log', seq: event.seq, line: event.line })
      }
    })

    const unsubDone = onDone(deploymentId, (finalStatus) => {
      send(ws, { type: 'done', finalStatus })
      ws.close()
    })

    ws.on('close', () => {
      unsubLog()
      unsubDone()
    })

    ws.on('error', () => {
      unsubLog()
      unsubDone()
    })
  })
}

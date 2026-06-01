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

    // Subscribe to live events IMMEDIATELY before any async work so we don't
    // miss events emitted between the historical-log fetch and subscription setup.
    const liveBuffer: Array<{ seq: number; line: string }> = []
    let flushed = false
    const seen = new Set<number>()

    const unsubLog = onLog(deploymentId, (event) => {
      if (seen.has(event.seq)) return
      seen.add(event.seq)
      if (!flushed) {
        liveBuffer.push(event)
      } else {
        send(ws, { type: 'log', seq: event.seq, line: event.line })
      }
    })

    const unsubDone = onDone(deploymentId, (finalStatus) => {
      send(ws, { type: 'done', finalStatus })
      ws.close()
    })

    // Keep the connection alive through Traefik's idle-connection timeout
    const pingInterval = setInterval(() => {
      if (ws.readyState === WebSocket.OPEN) ws.ping()
    }, 15_000)

    const cleanup = () => {
      clearInterval(pingInterval)
      unsubLog()
      unsubDone()
    }

    ws.on('close', (code, reason) => {
      cleanup()
    })
    ws.on('error', (err) => {
      console.error(`[WS-server] error deploymentId=${deploymentId}`, err)
      cleanup()
    })

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

    // Send historical logs, then flush the buffer of live events received above
    const historicalLogs = await db
      .select()
      .from(deploymentLogs)
      .where(eq(deploymentLogs.deploymentId, deploymentId))
      .orderBy(asc(deploymentLogs.seq))

    for (const log of historicalLogs) {
      seen.add(log.seq)
      send(ws, { type: 'log', seq: log.seq, line: log.line })
    }

    // Switch live handler from buffer → direct, flush what we buffered
    flushed = true
    for (const event of liveBuffer) {
      send(ws, { type: 'log', seq: event.seq, line: event.line })
    }

    // If deployment is already terminal, send done and close
    const terminalStatuses = ['running', 'failed', 'stopped']
    if (terminalStatuses.includes(dep.status)) {
      send(ws, { type: 'done', finalStatus: dep.status })
      ws.close()
    }
  })
}

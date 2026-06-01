import http from 'http'

import next from 'next'
import { WebSocketServer } from 'ws'
import { runMigrations } from './db/index'
import { assertDockerConnected } from './lib/docker'
import { attachWebSocketServer } from './ws/handler'

const dev = process.env.NODE_ENV !== 'production'
const port = parseInt(process.env.PORT ?? '3000', 10)

const app = next({ dev, dir: process.cwd() })
const handle = app.getRequestHandler()

async function main() {
  await runMigrations()
  await assertDockerConnected()
  await app.prepare()

  const server = http.createServer((req, res) => {
    handle(req, res)
  })

  const wss = new WebSocketServer({ noServer: true })
  attachWebSocketServer(wss)

  server.on('upgrade', (req, socket, head) => {
    const { pathname } = new URL(req.url ?? '/', 'http://localhost')
    if (pathname === '/ws/logs') {
      wss.handleUpgrade(req, socket as import('net').Socket, head, (ws) => {
        wss.emit('connection', ws, req)
      })
    } else {
      socket.destroy()
    }
  })

  server.listen(port, () => {
    console.log(`> Ready on http://localhost:${port}`)
  })
}

main().catch((err) => {
  console.error('Fatal startup error:', err)
  process.exit(1)
})

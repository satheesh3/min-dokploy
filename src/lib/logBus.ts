import { EventEmitter } from 'events'

export interface LogEvent {
  line: string
  seq: number
}

// Next.js API routes run in a separate webpack module context from the custom
// server, so a plain module-level Map produces two separate instances — one for
// ws/handler.ts and one for deploy.ts — and they never see each other's events.
// Pinning to globalThis guarantees a single shared Map across both contexts.
const g = globalThis as typeof globalThis & { __logBuses?: Map<string, EventEmitter> }
if (!g.__logBuses) g.__logBuses = new Map()
const buses = g.__logBuses

export function getBus(deploymentId: string): EventEmitter {
  if (!buses.has(deploymentId)) {
    const emitter = new EventEmitter()
    emitter.setMaxListeners(50)
    buses.set(deploymentId, emitter)
  }
  return buses.get(deploymentId)!
}

export function emitLog(deploymentId: string, event: LogEvent): void {
  const bus = getBus(deploymentId)
  const listenerCount = bus.listenerCount('log')
  bus.emit('log', event)
}

export function emitDone(deploymentId: string, finalStatus: string): void {
  const bus = getBus(deploymentId)
  bus.emit('done', finalStatus)
}

export function closeBus(deploymentId: string): void {
  const bus = buses.get(deploymentId)
  if (bus) {
    bus.removeAllListeners()
    buses.delete(deploymentId)
  }
}

export function onLog(
  deploymentId: string,
  callback: (event: LogEvent) => void
): () => void {
  const bus = getBus(deploymentId)
  bus.on('log', callback)
  return () => bus.off('log', callback)
}

export function onDone(
  deploymentId: string,
  callback: (finalStatus: string) => void
): () => void {
  const bus = getBus(deploymentId)
  bus.once('done', callback)
  return () => bus.off('done', callback)
}

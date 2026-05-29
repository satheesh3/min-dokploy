import { EventEmitter } from 'events'

export interface LogEvent {
  line: string
  seq: number
}

const buses = new Map<string, EventEmitter>()

export function getBus(deploymentId: string): EventEmitter {
  if (!buses.has(deploymentId)) {
    const emitter = new EventEmitter()
    emitter.setMaxListeners(50)
    buses.set(deploymentId, emitter)
  }
  return buses.get(deploymentId)!
}

export function emitLog(deploymentId: string, event: LogEvent): void {
  getBus(deploymentId).emit('log', event)
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

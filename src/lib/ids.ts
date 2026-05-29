import { customAlphabet } from 'nanoid'

const nanoid = customAlphabet('abcdefghijklmnopqrstuvwxyz0123456789', 8)

export function generateId(): string {
  return nanoid()
}

export function deploymentDomain(id: string): string {
  return `dep-${id}.127.0.0.1.sslip.io`
}

import { useEffect, useRef, useState, useCallback } from 'react'
import { useRouter } from 'next/router'
import Link from 'next/link'
import { trpc } from '@/lib/trpc-client'

const STATUS_COLORS: Record<string, string> = {
  pending: 'bg-yellow-500/20 text-yellow-300 border-yellow-700',
  building: 'bg-blue-500/20 text-blue-300 border-blue-700',
  pushing: 'bg-blue-500/20 text-blue-300 border-blue-700',
  deploying: 'bg-purple-500/20 text-purple-300 border-purple-700',
  running: 'bg-green-500/20 text-green-300 border-green-700',
  failed: 'bg-red-500/20 text-red-300 border-red-700',
  stopped: 'bg-gray-500/20 text-gray-300 border-gray-700',
}

const ACTIVE_STATUSES = ['pending', 'building', 'pushing', 'deploying']

export default function DeploymentDetailPage() {
  const router = useRouter()
  const id = router.query.id as string | undefined

  const session = trpc.auth.getSession.useQuery()
  const utils = trpc.useUtils()
  const dep = trpc.deployment.get.useQuery({ id: id! }, { enabled: !!id })
  const redeploy = trpc.deployment.redeploy.useMutation({
    onSuccess: () => {
      dep.refetch()
      setLogs([])
    },
  })
  const deleteMutation = trpc.deployment.delete.useMutation({
    onSuccess: () => router.push('/'),
  })

  const [logs, setLogs] = useState<string[]>([])
  const logsEndRef = useRef<HTMLDivElement>(null)
  const seenRef = useRef(new Set<number>())
  const wsRef = useRef<WebSocket | null>(null)

  // Auto-scroll
  useEffect(() => {
    logsEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [logs])

  useEffect(() => {
    if (session.isSuccess && !session.data) {
      router.push('/login')
    }
  }, [session.isSuccess, session.data, router])

  const connectWs = useCallback(() => {
    if (!id) return
    if (wsRef.current) {
      wsRef.current.close()
    }

    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:'
    const ws = new WebSocket(`${protocol}//${window.location.host}/ws/logs?deploymentId=${id}`)
    wsRef.current = ws

    ws.onmessage = (e) => {
      try {
        const msg = JSON.parse(e.data as string) as
          | { type: 'log'; seq: number; line: string }
          | { type: 'done'; finalStatus: string }

        if (msg.type === 'log') {
          if (!seenRef.current.has(msg.seq)) {
            seenRef.current.add(msg.seq)
            setLogs((prev) => [...prev, msg.line])
          }
        } else if (msg.type === 'done') {
          ws.close()
          dep.refetch()
        }
      } catch {
        // ignore parse errors
      }
    }

    ws.onerror = () => {
      ws.close()
    }

    return () => {
      ws.close()
    }
  }, [id, dep])

  // Connect WS when deployment becomes active
  useEffect(() => {
    if (!id || !dep.data) return

    if (ACTIVE_STATUSES.includes(dep.data.status)) {
      return connectWs()
    }
  }, [id, dep.data?.status, connectWs])

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      wsRef.current?.close()
    }
  }, [])

  if (!id || dep.isLoading) {
    return <LoadingScreen />
  }

  if (dep.error) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <p className="text-red-400">Deployment not found</p>
      </div>
    )
  }

  const deployment = dep.data!
  const isActive = ACTIVE_STATUSES.includes(deployment.status)

  return (
    <div className="min-h-screen flex flex-col">
      {/* Header */}
      <header className="border-b border-gray-800 px-6 py-4 flex items-center gap-4 shrink-0">
        <Link href="/" className="text-gray-400 hover:text-white transition-colors text-sm">
          ← Back
        </Link>
        <div className="flex-1 flex items-center gap-3">
          <h1 className="text-lg font-semibold text-white">{deployment.name}</h1>
          <span
            className={`text-xs px-2 py-0.5 rounded-full border font-medium ${STATUS_COLORS[deployment.status] ?? STATUS_COLORS.stopped} ${isActive ? 'animate-pulse' : ''}`}
          >
            {deployment.status}
          </span>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => redeploy.mutate({ id: deployment.id })}
            disabled={isActive}
            className="px-3 py-1.5 text-sm text-indigo-400 hover:text-indigo-300 border border-indigo-800 hover:border-indigo-600 rounded-lg transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
          >
            Redeploy
          </button>
          <button
            onClick={() => {
              if (confirm(`Delete "${deployment.name}"?`)) {
                deleteMutation.mutate({ id: deployment.id })
              }
            }}
            className="px-3 py-1.5 text-sm text-red-400 hover:text-red-300 border border-red-900 hover:border-red-700 rounded-lg transition-colors"
          >
            Delete
          </button>
        </div>
      </header>

      {/* Info bar */}
      <div className="border-b border-gray-800 px-6 py-3 flex flex-wrap gap-6 text-sm shrink-0">
        <InfoItem label="Domain">
          {deployment.domain && deployment.status === 'running' ? (
            <a
              href={`http://${deployment.domain}`}
              target="_blank"
              rel="noopener noreferrer"
              className="text-indigo-400 hover:text-indigo-300"
            >
              http://{deployment.domain}
            </a>
          ) : (
            <span className="text-gray-500">{deployment.domain ?? '—'}</span>
          )}
        </InfoItem>
        <InfoItem label="Repo">
          <span className="text-gray-300 font-mono text-xs truncate max-w-xs">
            {deployment.gitUrl}
          </span>
        </InfoItem>
        <InfoItem label="Dockerfile">
          <span className="text-gray-300 font-mono text-xs">{deployment.dockerfilePath}</span>
        </InfoItem>
        <InfoItem label="Port">
          <span className="text-gray-300">{deployment.exposedPort}</span>
        </InfoItem>
        {Object.keys(deployment.customLabels).length > 0 && (
          <InfoItem label="Labels">
            <div className="flex flex-wrap gap-1">
              {Object.entries(deployment.customLabels).map(([k, v]) => (
                <span key={k} className="text-xs bg-gray-800 px-2 py-0.5 rounded font-mono text-gray-300">
                  {k}={v}
                </span>
              ))}
            </div>
          </InfoItem>
        )}
      </div>

      {/* Log terminal */}
      <div className="flex-1 overflow-auto bg-black p-4 font-mono text-sm">
        {logs.length === 0 ? (
          <p className="text-gray-600">
            {isActive ? 'Waiting for logs…' : 'No logs available.'}
          </p>
        ) : (
          logs.map((line, i) => (
            <div key={i} className="text-green-300 leading-5 whitespace-pre-wrap break-all">
              {line}
            </div>
          ))
        )}
        <div ref={logsEndRef} />
      </div>
    </div>
  )
}

function InfoItem({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-center gap-2">
      <span className="text-gray-500">{label}:</span>
      {children}
    </div>
  )
}

function LoadingScreen() {
  return (
    <div className="min-h-screen flex items-center justify-center">
      <div className="text-gray-500 text-sm animate-pulse">Loading…</div>
    </div>
  )
}

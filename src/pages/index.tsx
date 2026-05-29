import { useEffect } from 'react'
import { useRouter } from 'next/router'
import Link from 'next/link'
import { trpc } from '@/lib/trpc-client'

const STATUS_COLORS: Record<string, string> = {
  pending: 'bg-yellow-500/20 text-yellow-300 border-yellow-700',
  building: 'bg-blue-500/20 text-blue-300 border-blue-700 animate-pulse',
  pushing: 'bg-blue-500/20 text-blue-300 border-blue-700 animate-pulse',
  deploying: 'bg-purple-500/20 text-purple-300 border-purple-700 animate-pulse',
  running: 'bg-green-500/20 text-green-300 border-green-700',
  failed: 'bg-red-500/20 text-red-300 border-red-700',
  stopped: 'bg-gray-500/20 text-gray-300 border-gray-700',
}

export default function DashboardPage() {
  const router = useRouter()
  const session = trpc.auth.getSession.useQuery()
  const deploymentList = trpc.deployment.list.useQuery(undefined, {
    refetchInterval: 5000,
  })
  const deleteDeployment = trpc.deployment.delete.useMutation({
    onSuccess: () => deploymentList.refetch(),
  })
  const redeployMutation = trpc.deployment.redeploy.useMutation({
    onSuccess: () => deploymentList.refetch(),
  })
  const signOut = trpc.auth.signOut.useMutation({
    onSuccess: () => router.push('/login'),
  })

  useEffect(() => {
    if (session.isSuccess && !session.data) {
      router.push('/login')
    }
  }, [session.isSuccess, session.data, router])

  if (session.isLoading) {
    return <LoadingScreen />
  }

  if (!session.data) return null

  return (
    <div className="min-h-screen">
      {/* Header */}
      <header className="border-b border-gray-800 px-6 py-4 flex items-center justify-between">
        <h1 className="text-lg font-semibold">
          <span className="text-indigo-400">mini</span>
          <span className="text-white">dokploy</span>
        </h1>
        <div className="flex items-center gap-4">
          <span className="text-sm text-gray-400">{session.data.user.email}</span>
          <button
            onClick={() => signOut.mutate()}
            className="text-sm text-gray-400 hover:text-white transition-colors"
          >
            Sign out
          </button>
        </div>
      </header>

      <main className="max-w-5xl mx-auto px-6 py-8">
        {/* Title row */}
        <div className="flex items-center justify-between mb-6">
          <h2 className="text-xl font-semibold text-white">Deployments</h2>
          <Link
            href="/deployments/new"
            className="px-4 py-2 bg-indigo-600 hover:bg-indigo-500 text-white text-sm font-medium rounded-lg transition-colors"
          >
            + New deployment
          </Link>
        </div>

        {/* Deployment list */}
        {deploymentList.isLoading ? (
          <div className="text-center text-gray-500 py-12">Loading…</div>
        ) : deploymentList.data?.length === 0 ? (
          <EmptyState />
        ) : (
          <div className="space-y-3">
            {deploymentList.data?.map((dep) => (
              <div
                key={dep.id}
                className="bg-gray-900 border border-gray-800 rounded-lg px-5 py-4 flex items-center gap-4"
              >
                {/* Status dot */}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-3 mb-1">
                    <Link
                      href={`/deployments/${dep.id}`}
                      className="font-medium text-white hover:text-indigo-400 transition-colors truncate"
                    >
                      {dep.name}
                    </Link>
                    <span
                      className={`text-xs px-2 py-0.5 rounded-full border font-medium ${STATUS_COLORS[dep.status] ?? STATUS_COLORS.stopped}`}
                    >
                      {dep.status}
                    </span>
                  </div>
                  {dep.domain && dep.status === 'running' ? (
                    <a
                      href={`http://${dep.domain}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-sm text-indigo-400 hover:text-indigo-300 transition-colors"
                    >
                      http://{dep.domain}
                    </a>
                  ) : (
                    <p className="text-sm text-gray-500 truncate">{dep.gitUrl}</p>
                  )}
                </div>

                {/* Actions */}
                <div className="flex items-center gap-2 shrink-0">
                  <Link
                    href={`/deployments/${dep.id}`}
                    className="px-3 py-1.5 text-sm text-gray-400 hover:text-white border border-gray-700 hover:border-gray-500 rounded-lg transition-colors"
                  >
                    Logs
                  </Link>
                  <button
                    onClick={() => redeployMutation.mutate({ id: dep.id })}
                    disabled={['building', 'pushing', 'deploying'].includes(dep.status)}
                    className="px-3 py-1.5 text-sm text-indigo-400 hover:text-indigo-300 border border-indigo-800 hover:border-indigo-600 rounded-lg transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                  >
                    Redeploy
                  </button>
                  <button
                    onClick={() => {
                      if (confirm(`Delete "${dep.name}"?`)) {
                        deleteDeployment.mutate({ id: dep.id })
                      }
                    }}
                    className="px-3 py-1.5 text-sm text-red-400 hover:text-red-300 border border-red-900 hover:border-red-700 rounded-lg transition-colors"
                  >
                    Delete
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </main>
    </div>
  )
}

function EmptyState() {
  return (
    <div className="text-center py-16 border border-dashed border-gray-700 rounded-xl">
      <p className="text-gray-400 text-lg mb-2">No deployments yet</p>
      <p className="text-gray-600 text-sm mb-6">Deploy your first app to get started</p>
      <Link
        href="/deployments/new"
        className="px-4 py-2 bg-indigo-600 hover:bg-indigo-500 text-white text-sm font-medium rounded-lg transition-colors"
      >
        + New deployment
      </Link>
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

import { useState, useEffect } from 'react'
import { useRouter } from 'next/router'
import Link from 'next/link'
import { trpc } from '@/lib/trpc-client'

interface LabelEntry {
  key: string
  value: string
}

export default function NewDeploymentPage() {
  const router = useRouter()
  const session = trpc.auth.getSession.useQuery()

  const [name, setName] = useState('')
  const [gitUrl, setGitUrl] = useState('')
  const [dockerfilePath, setDockerfilePath] = useState('Dockerfile')
  const [exposedPort, setExposedPort] = useState('3000')
  const [labels, setLabels] = useState<LabelEntry[]>([])
  const [error, setError] = useState('')

  const create = trpc.deployment.create.useMutation({
    onSuccess: (data) => router.push(`/deployments/${data.id}`),
    onError: (e) => setError(e.message),
  })

  useEffect(() => {
    if (session.isSuccess && !session.data) {
      router.push('/login')
    }
  }, [session.isSuccess, session.data, router])

  function addLabel() {
    setLabels([...labels, { key: '', value: '' }])
  }

  function removeLabel(i: number) {
    setLabels(labels.filter((_, idx) => idx !== i))
  }

  function updateLabel(i: number, field: 'key' | 'value', val: string) {
    const next = [...labels]
    next[i] = { ...next[i], [field]: val }
    setLabels(next)
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError('')

    const port = parseInt(exposedPort, 10)
    if (isNaN(port) || port < 1 || port > 65535) {
      setError('Port must be a number between 1 and 65535')
      return
    }

    const customLabels: Record<string, string> = {}
    for (const { key, value } of labels) {
      if (key.trim()) customLabels[key.trim()] = value
    }

    create.mutate({
      name,
      gitUrl,
      dockerfilePath: dockerfilePath || 'Dockerfile',
      exposedPort: port,
      customLabels,
    })
  }

  return (
    <div className="min-h-screen">
      <header className="border-b border-gray-800 px-6 py-4 flex items-center gap-4">
        <Link href="/" className="text-gray-400 hover:text-white transition-colors text-sm">
          ← Back
        </Link>
        <h1 className="text-lg font-semibold text-white">New Deployment</h1>
      </header>

      <main className="max-w-2xl mx-auto px-6 py-8">
        <form onSubmit={handleSubmit} className="space-y-6">
          {/* Name */}
          <Field label="Name" hint="A human-readable label for this deployment">
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="my-app"
              required
              maxLength={60}
              className={inputCls}
            />
          </Field>

          {/* Git URL */}
          <Field label="Git repository URL" hint="Public or private HTTPS/SSH URL">
            <input
              type="url"
              value={gitUrl}
              onChange={(e) => setGitUrl(e.target.value)}
              placeholder="https://github.com/user/repo.git"
              required
              className={inputCls}
            />
          </Field>

          {/* Dockerfile path */}
          <Field label="Dockerfile path" hint="Relative path from the repo root">
            <input
              type="text"
              value={dockerfilePath}
              onChange={(e) => setDockerfilePath(e.target.value)}
              placeholder="Dockerfile"
              className={inputCls}
            />
          </Field>

          {/* Exposed port */}
          <Field label="Exposed port" hint="The port your app listens on inside the container">
            <input
              type="number"
              value={exposedPort}
              onChange={(e) => setExposedPort(e.target.value)}
              min={1}
              max={65535}
              required
              className={inputCls}
            />
          </Field>

          {/* Custom labels */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <span className="text-sm font-medium text-gray-300">
                Custom Docker labels
                <span className="ml-2 text-xs text-gray-500">(optional)</span>
              </span>
              <button
                type="button"
                onClick={addLabel}
                className="text-xs text-indigo-400 hover:text-indigo-300 transition-colors"
              >
                + Add label
              </button>
            </div>
            <div className="space-y-2">
              {labels.map((lbl, i) => (
                <div key={i} className="flex gap-2">
                  <input
                    type="text"
                    value={lbl.key}
                    onChange={(e) => updateLabel(i, 'key', e.target.value)}
                    placeholder="key"
                    className={`${inputCls} flex-1`}
                  />
                  <input
                    type="text"
                    value={lbl.value}
                    onChange={(e) => updateLabel(i, 'value', e.target.value)}
                    placeholder="value"
                    className={`${inputCls} flex-1`}
                  />
                  <button
                    type="button"
                    onClick={() => removeLabel(i)}
                    className="px-2 text-gray-500 hover:text-red-400 transition-colors"
                  >
                    ✕
                  </button>
                </div>
              ))}
            </div>
          </div>

          {error && (
            <p className="text-red-400 text-sm bg-red-900/20 border border-red-800 rounded-lg px-3 py-2">
              {error}
            </p>
          )}

          <button
            type="submit"
            disabled={create.isPending}
            className="w-full py-2.5 bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white font-medium rounded-lg transition-colors"
          >
            {create.isPending ? 'Creating…' : 'Deploy'}
          </button>
        </form>
      </main>
    </div>
  )
}

const inputCls =
  'w-full px-3 py-2 bg-gray-800 border border-gray-700 rounded-lg text-white placeholder-gray-500 focus:outline-none focus:border-indigo-500 text-sm'

function Field({
  label,
  hint,
  children,
}: {
  label: string
  hint?: string
  children: React.ReactNode
}) {
  return (
    <div>
      <label className="block text-sm font-medium text-gray-300 mb-1">{label}</label>
      {hint && <p className="text-xs text-gray-500 mb-2">{hint}</p>}
      {children}
    </div>
  )
}

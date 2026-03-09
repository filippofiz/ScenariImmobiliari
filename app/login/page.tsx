'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'

export default function LoginPage() {
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const router = useRouter()

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')
    setLoading(true)

    try {
      const res = await fetch('/api/auth', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, password }),
      })

      if (!res.ok) {
        const data = await res.json()
        setError(data.error || 'Errore di autenticazione')
        return
      }

      const { role } = await res.json()
      router.push(role === 'admin' ? '/admin' : '/')
      router.refresh()
    } catch {
      setError('Errore di connessione')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen bg-white flex items-center justify-center px-4 font-sans relative overflow-hidden">
      {/* Subtle background pattern */}
      <div className="absolute inset-0 opacity-[0.03]" style={{
        backgroundImage: `radial-gradient(circle at 1px 1px, #4E8EA7 1px, transparent 0)`,
        backgroundSize: '40px 40px',
      }} />

      {/* Soft gradient blob */}
      <div className="absolute top-1/4 left-1/2 -translate-x-1/2 w-[500px] h-[500px] bg-teal/[0.04] rounded-full blur-[120px] pointer-events-none" />

      <div className="relative w-full max-w-[400px] animate-fade-up">
        <div className="bg-white rounded-2xl border border-border shadow-xl shadow-black/[0.04] p-8">
          {/* Accent line top */}
          <div className="absolute top-0 left-8 right-8 h-[2px] bg-gradient-to-r from-transparent via-brand-red/60 to-transparent rounded-full" />

          {/* Logo */}
          <div className="text-center mb-8 pt-2">
            <img src="/logo.png" alt="Scenari Immobiliari" className="h-[50px] w-auto mx-auto" />
            <div className="mt-4 inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-teal/[0.06] border border-teal/15">
              <div className="w-1.5 h-1.5 rounded-full bg-teal animate-pulse" />
              <span className="text-[10px] font-mono text-teal uppercase tracking-[0.1em]">AI Platform</span>
            </div>
          </div>

          {/* Form */}
          <form onSubmit={handleSubmit} className="space-y-5">
            <div>
              <label className="block text-[11px] font-medium text-text-secondary mb-1.5">
                Username
              </label>
              <input
                type="text"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                className="w-full bg-bg-elevated border border-border rounded-xl px-4 py-3 text-sm
                  text-text-primary placeholder-text-muted/50 font-sans
                  focus:outline-none focus:border-teal/50 focus:ring-2 focus:ring-teal/10
                  transition-all"
                placeholder="Inserisci username"
                autoComplete="username"
                required
              />
            </div>

            <div>
              <label className="block text-[11px] font-medium text-text-secondary mb-1.5">
                Password
              </label>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full bg-bg-elevated border border-border rounded-xl px-4 py-3 text-sm
                  text-text-primary placeholder-text-muted/50 font-sans
                  focus:outline-none focus:border-teal/50 focus:ring-2 focus:ring-teal/10
                  transition-all"
                placeholder="Inserisci password"
                autoComplete="current-password"
                required
              />
            </div>

            {error && (
              <div className="bg-red-50 border border-red-200 rounded-xl px-4 py-2.5">
                <p className="text-sm text-red-600">{error}</p>
              </div>
            )}

            <button
              type="submit"
              disabled={loading}
              className="w-full bg-teal hover:bg-teal-dim text-white font-medium text-sm
                rounded-xl px-4 py-3 transition-all duration-200
                disabled:opacity-50 disabled:cursor-not-allowed
                shadow-md shadow-teal/15 hover:shadow-lg hover:shadow-teal/20"
            >
              {loading ? (
                <span className="flex items-center justify-center gap-2">
                  <svg className="animate-spin w-4 h-4" viewBox="0 0 24 24" fill="none">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                  </svg>
                  Accesso in corso...
                </span>
              ) : (
                'Accedi'
              )}
            </button>
          </form>

          {/* Footer */}
          <div className="mt-8 pt-5 border-t border-border/60 text-center">
            <p className="text-[10px] text-text-muted/50 font-mono">
              Powered by AI &middot; Scenari Immobiliari
            </p>
          </div>
        </div>
      </div>
    </div>
  )
}

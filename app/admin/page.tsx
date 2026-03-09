'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import UploadZone from '../components/UploadZone'

interface DocInfo {
  id: string
  filename: string
  created_at: string
  chunks: number
}

export default function AdminPage() {
  const [documents, setDocuments] = useState<DocInfo[]>([])
  const [loading, setLoading] = useState(true)
  const router = useRouter()

  const loadDocuments = () => {
    fetch('/api/documents')
      .then(r => {
        if (r.status === 401) { router.push('/login'); return null }
        return r.json()
      })
      .then(docs => { if (docs) setDocuments(docs) })
      .catch(() => {})
      .finally(() => setLoading(false))
  }

  useEffect(() => { loadDocuments() }, [])

  const handleUploadComplete = () => {
    loadDocuments()
  }

  const handleLogout = async () => {
    await fetch('/api/auth', { method: 'DELETE' })
    router.push('/login')
  }

  return (
    <div className="min-h-screen bg-bg font-sans">
      {/* Header */}
      <header className="border-b border-border bg-bg-card">
        <div className="max-w-5xl mx-auto px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-lg bg-teal/10 border border-teal/20 flex items-center justify-center">
              <svg className="w-4 h-4 text-teal" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                <path strokeLinecap="round" strokeLinejoin="round"
                  d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.066 2.573c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.573 1.066c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.066-2.573c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z"
                />
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
              </svg>
            </div>
            <div>
              <h1 className="font-heading text-lg font-bold text-text-primary">Admin Panel</h1>
              <p className="text-[9px] text-text-muted font-mono uppercase tracking-[0.12em]">Scenari Immobiliari</p>
            </div>
          </div>

          <div className="flex items-center gap-4">
            <button
              onClick={() => router.push('/')}
              className="text-[10px] text-teal hover:text-teal-dim font-mono uppercase tracking-[0.1em] transition-colors"
            >
              Vedi Chat &rarr;
            </button>
            <button onClick={handleLogout} className="text-[10px] text-text-muted hover:text-text-primary transition-colors font-mono uppercase tracking-[0.1em]">
              Esci
            </button>
          </div>
        </div>
      </header>

      <div className="max-w-5xl mx-auto px-6 py-8 space-y-8">
        {/* Upload Section */}
        <section className="bg-bg-card border border-border rounded-xl p-6">
          <h2 className="font-heading text-xl font-bold text-text-primary mb-1">Carica Documento</h2>
          <p className="text-sm text-text-secondary mb-4">
            Carica un PDF del Rapporto Fondi Immobiliari. Il sistema estrarrà il testo, creerà i chunks e genererà gli embedding.
          </p>
          <UploadZone onUploadComplete={handleUploadComplete} />
        </section>

        {/* Documents List */}
        <section className="bg-bg-card border border-border rounded-xl p-6">
          <h2 className="font-heading text-xl font-bold text-text-primary mb-4">Documenti Indicizzati</h2>

          {loading ? (
            <div className="flex items-center gap-2 text-text-muted py-4">
              <svg className="animate-spin w-4 h-4 text-teal" viewBox="0 0 24 24" fill="none">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
              </svg>
              <span className="text-[10px] font-mono text-text-muted uppercase tracking-wider">Caricamento...</span>
            </div>
          ) : documents.length === 0 ? (
            <div className="text-center py-8">
              <p className="text-text-muted text-sm">Nessun documento caricato</p>
            </div>
          ) : (
            <div className="space-y-3">
              {documents.map(doc => (
                <div key={doc.id} className="flex items-center justify-between bg-bg-elevated border border-border rounded-lg px-4 py-3">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-lg bg-teal/10 border border-teal/20 flex items-center justify-center">
                      <svg className="w-5 h-5 text-teal" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                        <path strokeLinecap="round" strokeLinejoin="round"
                          d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"
                        />
                      </svg>
                    </div>
                    <div>
                      <p className="text-sm text-text-primary font-medium">{doc.filename}</p>
                      <p className="text-[10px] text-text-muted font-mono">
                        {new Date(doc.created_at).toLocaleDateString('it-IT')} &middot; {doc.chunks} chunks
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-3">
                    <div className="flex items-center gap-2">
                      <div className="w-1.5 h-1.5 rounded-full bg-success" />
                      <span className="text-[9px] text-success/70 font-mono uppercase tracking-wider">Attivo</span>
                    </div>
                    <button
                      onClick={async (e) => {
                        e.stopPropagation()
                        if (!confirm(`Eliminare "${doc.filename}" e tutti i suoi ${doc.chunks} chunks?`)) return
                        await fetch('/api/documents', {
                          method: 'DELETE',
                          headers: { 'Content-Type': 'application/json' },
                          body: JSON.stringify({ id: doc.id }),
                        })
                        loadDocuments()
                      }}
                      className="text-[10px] text-danger/50 hover:text-danger font-mono uppercase tracking-wider transition-colors"
                    >
                      Elimina
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>

        <section className="text-center text-[9px] text-text-muted/30 font-mono uppercase tracking-[0.15em] py-4">
          Il documento più recente viene automaticamente usato per la chat dei clienti.
        </section>
      </div>
    </div>
  )
}

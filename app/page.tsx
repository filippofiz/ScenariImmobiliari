'use client'

import { useState } from 'react'
import UploadZone from './components/UploadZone'
import ChatInterface from './components/ChatInterface'

interface DocInfo {
  id: string
  filename: string
  pages: number
  chunks: number
}

export default function Home() {
  const [docInfo, setDocInfo] = useState<DocInfo | null>(null)

  const handleUploadComplete = (documentId: string, filename: string, pages: number, chunks: number) => {
    setDocInfo({ id: documentId, filename, pages, chunks })
  }

  return (
    <div className="h-screen flex">
      {/* Left Sidebar */}
      <aside className="w-[280px] flex-shrink-0 bg-bg-card border-r border-border flex flex-col">
        {/* Logo / Title */}
        <div className="px-5 py-6 border-b border-border">
          <h1 className="font-heading text-xl font-semibold text-text-primary leading-tight">
            Scenari<br />Immobiliari
          </h1>
          <p className="text-xs text-text-muted mt-1 font-mono">RAG Dashboard</p>
        </div>

        {/* Upload Section */}
        <div className="px-4 py-5 border-b border-border">
          <h2 className="text-xs font-mono text-text-muted uppercase tracking-wider mb-3">
            Documento
          </h2>
          <UploadZone onUploadComplete={handleUploadComplete} />
        </div>

        {/* Document Stats */}
        {docInfo && (
          <div className="px-4 py-5 border-b border-border">
            <h2 className="text-xs font-mono text-text-muted uppercase tracking-wider mb-3">
              Statistiche
            </h2>
            <div className="space-y-3">
              <div className="flex items-center gap-3">
                <div className="w-8 h-8 rounded-lg bg-accent/10 flex items-center justify-center">
                  <svg className="w-4 h-4 text-accent" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                      d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"
                    />
                  </svg>
                </div>
                <div>
                  <p className="text-xs text-text-muted">File</p>
                  <p className="text-sm text-text-primary truncate max-w-[180px]">
                    {docInfo.filename}
                  </p>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div className="bg-bg rounded-lg px-3 py-2">
                  <p className="text-xs text-text-muted font-mono">Pagine</p>
                  <p className="text-lg font-heading text-text-primary">{docInfo.pages}</p>
                </div>
                <div className="bg-bg rounded-lg px-3 py-2">
                  <p className="text-xs text-text-muted font-mono">Chunks</p>
                  <p className="text-lg font-heading text-text-primary">{docInfo.chunks}</p>
                </div>
              </div>

              <div className="flex items-center gap-2">
                <div className="w-2 h-2 rounded-full bg-green-400 animate-pulse" />
                <p className="text-xs text-text-muted">Pronto per le query</p>
              </div>
            </div>
          </div>
        )}

        {/* Footer */}
        <div className="mt-auto px-4 py-4 border-t border-border">
          <div className="flex items-center gap-2 text-xs text-text-muted/50">
            <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                d="M13 10V3L4 14h7v7l9-11h-7z"
              />
            </svg>
            <span className="font-mono">Claude + Voyage AI + Supabase</span>
          </div>
        </div>
      </aside>

      {/* Main Chat Area */}
      <main className="flex-1 flex flex-col bg-bg min-w-0">
        {/* Header bar */}
        <div className="px-6 py-4 border-b border-border flex items-center justify-between">
          <div>
            <h2 className="font-heading text-lg text-text-primary">
              {docInfo ? 'Analisi Documento' : 'Benvenuto'}
            </h2>
            <p className="text-xs text-text-muted font-mono mt-0.5">
              {docInfo
                ? `Interroga il ${docInfo.filename}`
                : 'Carica un rapporto per iniziare l\'analisi'
              }
            </p>
          </div>
          {docInfo && (
            <div className="flex items-center gap-2 text-xs text-text-muted bg-bg-card border border-border rounded-lg px-3 py-1.5">
              <div className="w-1.5 h-1.5 rounded-full bg-accent" />
              <span className="font-mono">{docInfo.chunks} frammenti indicizzati</span>
            </div>
          )}
        </div>

        {/* Chat */}
        <div className="flex-1 min-h-0">
          <ChatInterface documentId={docInfo?.id || null} />
        </div>
      </main>
    </div>
  )
}

'use client'

import { useState, useRef, useCallback } from 'react'

interface UploadProgress {
  status: string
  pages_processed?: number
  total_pages?: number
  chunks_embedded?: number
  total_chunks?: number
  document_id?: string
  error?: string
}

interface Props {
  onUploadComplete: (documentId: string, filename: string, pages: number, chunks: number) => void
}

export default function UploadZone({ onUploadComplete }: Props) {
  const [isDragging, setIsDragging] = useState(false)
  const [progress, setProgress] = useState<UploadProgress | null>(null)
  const [isUploading, setIsUploading] = useState(false)
  const [logs, setLogs] = useState<string[]>([])
  const fileInputRef = useRef<HTMLInputElement>(null)
  const logsEndRef = useRef<HTMLDivElement>(null)

  const addLog = (msg: string) => {
    const ts = new Date().toLocaleTimeString('it-IT', { hour: '2-digit', minute: '2-digit', second: '2-digit' })
    setLogs(prev => [...prev, `[${ts}] ${msg}`])
    setTimeout(() => logsEndRef.current?.scrollIntoView({ behavior: 'smooth' }), 50)
  }

  const handleUpload = useCallback(async (file: File) => {
    if (!file.name.endsWith('.pdf')) {
      alert('Seleziona un file PDF')
      return
    }

    setIsUploading(true)
    setLogs([])
    setProgress({ status: 'uploading' })
    addLog(`File selezionato: ${file.name} (${(file.size / 1024 / 1024).toFixed(2)} MB)`)
    addLog('Invio file al server...')

    try {
      const formData = new FormData()
      formData.append('file', file)

      const response = await fetch('/api/ingest', {
        method: 'POST',
        body: formData,
      })

      addLog(`Risposta server: HTTP ${response.status}`)

      if (!response.ok) {
        const text = await response.text()
        addLog(`ERRORE: ${text}`)
        throw new Error(`HTTP ${response.status}: ${text}`)
      }

      const reader = response.body?.getReader()
      const decoder = new TextDecoder()
      if (!reader) throw new Error('No response stream')

      addLog('Stream SSE connesso, in attesa di eventi...')

      let buffer = ''
      while (true) {
        const { done, value } = await reader.read()
        if (done) {
          addLog('Stream terminato')
          break
        }

        buffer += decoder.decode(value, { stream: true })
        const lines = buffer.split('\n\n')
        buffer = lines.pop() || ''

        for (const line of lines) {
          if (line.startsWith('data: ')) {
            const raw = line.slice(6)
            let data: UploadProgress
            try {
              data = JSON.parse(raw) as UploadProgress
            } catch {
              addLog(`Evento non parsabile: ${raw}`)
              continue
            }

            setProgress(data)

            if (data.error) {
              addLog(`ERRORE: ${data.error}`)
              throw new Error(data.error)
            } else if (data.status === 'started') {
              addLog('Elaborazione avviata')
            } else if (data.status === 'pdf_stored') {
              addLog('PDF salvato in Supabase Storage')
            } else if (data.status === 'parsed') {
              addLog(`Testo estratto: ${data.total_pages} pagine trovate`)
            } else if (data.status === 'document_created') {
              addLog(`Documento creato: ${data.document_id}`)
            } else if (data.status === 'chunked') {
              addLog(`Chunking completato: ${data.total_chunks} frammenti da ${data.total_pages} pagine`)
            } else if (data.status === 'rate_limited') {
              addLog(`Rate limit raggiunto, attesa ${(data as unknown as Record<string,number>).wait_seconds}s (tentativo ${(data as unknown as Record<string,number>).attempt})...`)
            } else if (data.status === 'embedding') {
              const d = data as unknown as Record<string, number>
              addLog(`Embedding: ${data.chunks_embedded}/${data.total_chunks} frammenti (batch ${d.batch}/${d.total_batches}, ~${d.eta_minutes} min rimasti)`)
            } else if (data.status === 'complete') {
              addLog(`COMPLETATO: ${data.total_chunks} frammenti indicizzati da ${data.pages_processed} pagine`)
              if (data.document_id) {
                onUploadComplete(
                  data.document_id,
                  file.name,
                  data.pages_processed || 0,
                  data.total_chunks || 0
                )
              }
            } else {
              addLog(`Evento: ${JSON.stringify(data)}`)
            }
          }
        }
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Errore sconosciuto'
      addLog(`ERRORE FATALE: ${msg}`)
      setProgress({ status: 'error', error: msg })
    } finally {
      setIsUploading(false)
    }
  }, [onUploadComplete])

  const progressPercent = (() => {
    if (!progress) return 0
    if (progress.status === 'uploading') return 5
    if (progress.status === 'parsed') return 15
    if (progress.status === 'chunked') return 25
    if (progress.status === 'embedding' && progress.total_chunks) {
      return 25 + ((progress.chunks_embedded || 0) / progress.total_chunks) * 75
    }
    if (progress.status === 'complete') return 100
    return 0
  })()

  const statusText = (() => {
    if (!progress) return ''
    switch (progress.status) {
      case 'uploading': return 'Invio file...'
      case 'started': return 'Avvio elaborazione...'
      case 'parsed': return `Testo estratto da ${progress.total_pages} pagine`
      case 'document_created': return 'Documento registrato...'
      case 'chunked': return `${progress.total_chunks} frammenti creati da ${progress.total_pages} pagine`
      case 'rate_limited': return `Rate limit, attesa...`
      case 'embedding': {
        const p = progress as unknown as Record<string, number>
        return `Indicizzazione ${progress.chunks_embedded || 0}/${progress.total_chunks} (batch ${p.batch || '?'}/${p.total_batches || '?'}, ~${p.eta_minutes || '?'} min)`
      }
      case 'complete': return `Completato! ${progress.total_chunks} frammenti indicizzati.`
      case 'error': return `Errore: ${progress.error}`
      default: return progress.status
    }
  })()

  return (
    <div className="space-y-3">
      <div
        className={`
          relative border-2 border-dashed rounded-xl p-6 text-center cursor-pointer
          transition-all duration-200
          ${isDragging
            ? 'border-teal bg-teal/5 upload-active'
            : 'border-border hover:border-teal/40 hover:bg-bg-elevated/50'
          }
          ${isUploading ? 'pointer-events-none opacity-60' : ''}
        `}
        onDragOver={(e) => { e.preventDefault(); setIsDragging(true) }}
        onDragLeave={() => setIsDragging(false)}
        onDrop={(e) => {
          e.preventDefault()
          setIsDragging(false)
          const file = e.dataTransfer.files[0]
          if (file) handleUpload(file)
        }}
        onClick={() => fileInputRef.current?.click()}
      >
        <input
          ref={fileInputRef}
          type="file"
          accept=".pdf"
          className="hidden"
          onChange={(e) => {
            const file = e.target.files?.[0]
            if (file) handleUpload(file)
          }}
        />
        <div className="flex flex-col items-center gap-2">
          <svg className="w-8 h-8 text-text-muted" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
              d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12"
            />
          </svg>
          <p className="text-sm text-text-secondary">
            Trascina il PDF qui o <span className="text-teal">sfoglia</span>
          </p>
          <p className="text-xs text-text-muted/60">
            Rapporto Fondi Immobiliari (.pdf)
          </p>
        </div>
      </div>

      {progress && (
        <div className="space-y-2">
          <div className="w-full bg-bg-elevated rounded-full h-1.5 overflow-hidden">
            <div
              className="progress-bar h-full rounded-full"
              style={{ width: `${progressPercent}%` }}
            />
          </div>
          <p className={`text-xs font-mono ${progress.status === 'error' ? 'text-danger' : 'text-text-muted'}`}>
            {statusText}
          </p>
        </div>
      )}

      {/* Log panel */}
      {logs.length > 0 && (
        <div className="bg-bg border border-border rounded-xl overflow-hidden">
          <div className="flex items-center justify-between px-3 py-1.5 border-b border-border">
            <span className="text-[10px] font-mono text-text-muted uppercase tracking-[0.12em]">Log</span>
            <button
              onClick={() => setLogs([])}
              className="text-[9px] font-mono text-text-muted/50 hover:text-text-muted transition-colors uppercase tracking-wider"
            >
              Cancella
            </button>
          </div>
          <div className="max-h-48 overflow-y-auto p-2 space-y-0.5">
            {logs.map((log, i) => (
              <p
                key={i}
                className={`text-[11px] font-mono leading-relaxed ${
                  log.includes('ERRORE')
                    ? 'text-danger'
                    : log.includes('COMPLETATO')
                    ? 'text-success'
                    : 'text-text-muted/70'
                }`}
              >
                {log}
              </p>
            ))}
            <div ref={logsEndRef} />
          </div>
        </div>
      )}
    </div>
  )
}

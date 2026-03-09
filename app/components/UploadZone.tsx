'use client'

import { useState, useRef, useCallback } from 'react'

interface UploadProgress {
  status: string
  pages_processed?: number
  total_pages?: number
  chunks_so_far?: number
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
  const fileInputRef = useRef<HTMLInputElement>(null)

  const renderPdfPages = useCallback(async (file: File): Promise<string[]> => {
    // We load PDF.js from CDN to render pages as images
    const pdfjsLib = await loadPdfJs()
    const arrayBuffer = await file.arrayBuffer()
    const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise
    const pages: string[] = []

    for (let i = 1; i <= pdf.numPages; i++) {
      const page = await pdf.getPage(i)
      const viewport = page.getViewport({ scale: 2.0 })
      const canvas = document.createElement('canvas')
      canvas.width = viewport.width
      canvas.height = viewport.height
      const ctx = canvas.getContext('2d')!
      await page.render({ canvasContext: ctx, viewport }).promise
      // Get base64 without the data:image/png;base64, prefix
      const dataUrl = canvas.toDataURL('image/png')
      pages.push(dataUrl.split(',')[1])
      setProgress({
        status: 'rendering',
        pages_processed: i,
        total_pages: pdf.numPages,
      })
    }

    return pages
  }, [])

  const handleUpload = useCallback(async (file: File) => {
    if (!file.name.endsWith('.pdf')) {
      alert('Seleziona un file PDF')
      return
    }

    setIsUploading(true)
    setProgress({ status: 'rendering', pages_processed: 0, total_pages: 0 })

    try {
      // Render PDF pages to images client-side
      const pages = await renderPdfPages(file)

      setProgress({ status: 'uploading', total_pages: pages.length })

      // Send to API
      const formData = new FormData()
      formData.append('file', file)
      formData.append('pages', JSON.stringify(pages))

      const response = await fetch('/api/ingest', {
        method: 'POST',
        body: formData,
      })

      const reader = response.body?.getReader()
      const decoder = new TextDecoder()

      if (!reader) throw new Error('No response stream')

      let buffer = ''
      while (true) {
        const { done, value } = await reader.read()
        if (done) break

        buffer += decoder.decode(value, { stream: true })
        const lines = buffer.split('\n\n')
        buffer = lines.pop() || ''

        for (const line of lines) {
          if (line.startsWith('data: ')) {
            const data = JSON.parse(line.slice(6)) as UploadProgress
            setProgress(data)

            if (data.status === 'complete' && data.document_id) {
              onUploadComplete(
                data.document_id,
                file.name,
                data.pages_processed || 0,
                data.total_chunks || 0
              )
            }

            if (data.error) {
              throw new Error(data.error)
            }
          }
        }
      }
    } catch (err) {
      setProgress({
        status: 'error',
        error: err instanceof Error ? err.message : 'Errore sconosciuto',
      })
    } finally {
      setIsUploading(false)
    }
  }, [onUploadComplete, renderPdfPages])

  const progressPercent = (() => {
    if (!progress) return 0
    if (progress.status === 'rendering' && progress.total_pages) {
      return ((progress.pages_processed || 0) / progress.total_pages) * 30
    }
    if (progress.status === 'processing' && progress.total_pages) {
      return 30 + ((progress.pages_processed || 0) / progress.total_pages) * 40
    }
    if (progress.status === 'embedding' && progress.total_chunks) {
      return 70 + ((progress.chunks_embedded || 0) / progress.total_chunks) * 30
    }
    if (progress.status === 'complete') return 100
    return 0
  })()

  const statusText = (() => {
    if (!progress) return ''
    switch (progress.status) {
      case 'rendering':
        return `Rendering pagina ${progress.pages_processed} di ${progress.total_pages}...`
      case 'uploading':
        return 'Invio al server...'
      case 'started':
        return 'Avvio elaborazione...'
      case 'document_created':
        return 'Documento registrato...'
      case 'processing':
        return `Analisi pagina ${progress.pages_processed} di ${progress.total_pages}...`
      case 'embedding':
        return `Indicizzazione ${progress.chunks_embedded || 0} di ${progress.total_chunks} frammenti...`
      case 'complete':
        return `Completato! ${progress.total_chunks} frammenti indicizzati.`
      case 'error':
        return `Errore: ${progress.error}`
      default:
        return progress.status
    }
  })()

  return (
    <div className="space-y-3">
      <div
        className={`
          relative border-2 border-dashed rounded-xl p-6 text-center cursor-pointer
          transition-all duration-200
          ${isDragging
            ? 'border-accent bg-accent/5 upload-active'
            : 'border-border hover:border-accent/40 hover:bg-bg-card/50'
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
          <p className="text-sm text-text-muted">
            Trascina il PDF qui o <span className="text-accent">sfoglia</span>
          </p>
          <p className="text-xs text-text-muted/60">
            Rapporto Fondi Immobiliari (.pdf)
          </p>
        </div>
      </div>

      {progress && (
        <div className="space-y-2">
          <div className="w-full bg-bg rounded-full h-1.5 overflow-hidden">
            <div
              className="progress-bar h-full rounded-full"
              style={{ width: `${progressPercent}%` }}
            />
          </div>
          <p className={`text-xs font-mono ${progress.status === 'error' ? 'text-red-400' : 'text-text-muted'}`}>
            {statusText}
          </p>
        </div>
      )}
    </div>
  )
}

// Load PDF.js from CDN
async function loadPdfJs(): Promise<any> {
  if ((window as any).pdfjsLib) return (window as any).pdfjsLib

  return new Promise((resolve, reject) => {
    const script = document.createElement('script')
    script.src = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.min.js'
    script.onload = () => {
      const lib = (window as any).pdfjsLib
      lib.GlobalWorkerOptions.workerSrc =
        'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js'
      resolve(lib)
    }
    script.onerror = reject
    document.head.appendChild(script)
  })
}

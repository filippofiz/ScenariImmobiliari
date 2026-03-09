'use client'

import { useState, useEffect, useRef, useCallback } from 'react'
import { useRouter } from 'next/navigation'

interface Citation {
  page_number: number
}

interface Message {
  role: 'user' | 'assistant'
  content: string
  citations?: Citation[]
  toolCalls?: string[]
}

interface DocInfo {
  id: string
  filename: string
  chunks: number
}

const SUGGESTED_QUESTIONS = [
  'Qual è il patrimonio complessivo dei fondi immobiliari italiani?',
  'Come si è evoluto il mercato dei fondi immobiliari nell\'ultimo anno?',
  'Quali sono le principali tipologie di investimento?',
  'Qual è il rendimento medio dei fondi immobiliari?',
]

export default function ClientChat() {
  const [messages, setMessages] = useState<Message[]>([])
  const [input, setInput] = useState('')
  const [isLoading, setIsLoading] = useState(false)
  const [docInfo, setDocInfo] = useState<DocInfo | null>(null)
  const [loadingDoc, setLoadingDoc] = useState(true)
  const messagesEndRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLTextAreaElement>(null)
  const router = useRouter()

  // Load latest document on mount
  useEffect(() => {
    fetch('/api/documents')
      .then(r => {
        if (r.status === 401) { router.push('/login'); return null }
        return r.json()
      })
      .then(docs => {
        if (docs && docs.length > 0) {
          setDocInfo({ id: docs[0].id, filename: docs[0].filename, chunks: docs[0].chunks })
        }
      })
      .catch(() => {})
      .finally(() => setLoadingDoc(false))
  }, [router])

  const scrollToBottom = useCallback(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [])

  useEffect(() => { scrollToBottom() }, [messages, scrollToBottom])

  const sendMessage = async (text: string) => {
    if (!text.trim() || !docInfo || isLoading) return

    const userMessage: Message = { role: 'user', content: text.trim() }
    setMessages(prev => [...prev, userMessage])
    setInput('')
    setIsLoading(true)

    const history = [...messages, userMessage]
      .slice(-10)
      .map(m => ({ role: m.role, content: m.content }))

    try {
      const response = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message: text.trim(),
          document_id: docInfo.id,
          history: history.slice(0, -1),
        }),
      })

      const reader = response.body?.getReader()
      const decoder = new TextDecoder()
      if (!reader) throw new Error('No stream')

      let assistantText = ''
      let citations: Citation[] = []
      let currentToolCalls: string[] = []
      setMessages(prev => [...prev, { role: 'assistant', content: '', citations: [], toolCalls: [] }])

      const updateMessage = () => {
        setMessages(prev => {
          const u = [...prev]
          u[u.length - 1] = { role: 'assistant', content: assistantText, citations, toolCalls: [...currentToolCalls] }
          return u
        })
      }

      let buffer = ''
      while (true) {
        const { done, value } = await reader.read()
        if (done) break
        buffer += decoder.decode(value, { stream: true })
        const lines = buffer.split('\n\n')
        buffer = lines.pop() || ''

        for (const line of lines) {
          if (!line.startsWith('data: ')) continue
          const data = JSON.parse(line.slice(6))
          if (data.type === 'citations') {
            citations = data.citations
            updateMessage()
          } else if (data.type === 'tool_call') {
            const label = data.tool === 'search_chunks'
              ? `Ricerca: "${data.input.query}"`
              : `Visualizzazione pagine: ${data.input.page_numbers?.join(', ')}`
            currentToolCalls.push(label)
            updateMessage()
          } else if (data.type === 'text') {
            assistantText += data.text
            updateMessage()
          }
        }
      }

      updateMessage()
    } catch (err) {
      setMessages(prev => [
        ...prev.filter(m => m.content !== ''),
        { role: 'assistant', content: `Errore: ${err instanceof Error ? err.message : 'sconosciuto'}` },
      ])
    } finally {
      setIsLoading(false)
    }
  }

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    sendMessage(input)
  }

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendMessage(input) }
  }

  const handleLogout = async () => {
    await fetch('/api/auth', { method: 'DELETE' })
    router.push('/login')
  }

  // Render text with citation badges
  const renderText = (text: string) => {
    const parts = text.split(/(\[p\.\d+\])/g)
    return parts.map((part, i) => {
      const m = part.match(/^\[p\.(\d+)\]$/)
      if (m) return <span key={i} className="citation-badge">p.{m[1]}</span>
      return <span key={i}>{part}</span>
    })
  }

  return (
    <div className="h-screen flex flex-col bg-bg relative overflow-hidden">
      {/* Ambient background effects */}
      <div className="fixed top-0 right-0 w-[600px] h-[600px] bg-accent/[0.03] rounded-full blur-[150px] pointer-events-none" />
      <div className="fixed bottom-0 left-0 w-[400px] h-[400px] bg-accent/[0.02] rounded-full blur-[120px] pointer-events-none" />

      {/* Header */}
      <header className="relative z-10 border-b border-border/60 backdrop-blur-xl bg-bg/80">
        <div className="max-w-4xl mx-auto px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-accent/10 border border-accent/20 flex items-center justify-center">
              <svg className="w-5 h-5 text-accent" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
                  d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4"
                />
              </svg>
            </div>
            <div>
              <h1 className="font-heading text-lg font-semibold text-text-primary leading-tight">
                Scenari Immobiliari
              </h1>
              <p className="text-[11px] text-text-muted font-mono">Analisi documentale AI</p>
            </div>
          </div>

          <div className="flex items-center gap-3">
            {docInfo && (
              <div className="hidden sm:flex items-center gap-2 text-xs text-text-muted bg-bg-card/60 border border-border/60 rounded-lg px-3 py-1.5 backdrop-blur">
                <div className="w-1.5 h-1.5 rounded-full bg-green-400 animate-pulse" />
                <span className="font-mono">{docInfo.chunks} frammenti indicizzati</span>
              </div>
            )}
            <button onClick={handleLogout} className="text-xs text-text-muted hover:text-text-primary transition-colors font-mono">
              Esci
            </button>
          </div>
        </div>
      </header>

      {/* Chat area */}
      <div className="flex-1 overflow-y-auto relative z-10">
        <div className="max-w-4xl mx-auto px-6 py-6">
          {/* Empty state */}
          {messages.length === 0 && !loadingDoc && (
            <div className="flex flex-col items-center justify-center min-h-[60vh] text-center">
              <div className="w-20 h-20 rounded-3xl bg-gradient-to-br from-accent/20 to-accent/5 border border-accent/20 flex items-center justify-center mb-6">
                <svg className="w-10 h-10 text-accent" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1}
                    d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z"
                  />
                </svg>
              </div>

              <h2 className="font-heading text-3xl font-semibold text-text-primary mb-2">
                {docInfo ? 'Esplora il Rapporto' : 'Nessun documento'}
              </h2>
              <p className="text-text-muted max-w-md mb-8 leading-relaxed">
                {docInfo
                  ? 'Fai una domanda sul Rapporto Fondi Immobiliari. Ogni risposta includerà i riferimenti alle pagine del documento originale.'
                  : 'Nessun documento è stato ancora caricato. Contatta l\'amministratore.'}
              </p>

              {docInfo && (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 w-full max-w-lg">
                  {SUGGESTED_QUESTIONS.map((q, i) => (
                    <button
                      key={i}
                      onClick={() => sendMessage(q)}
                      className="text-left bg-bg-card/60 hover:bg-bg-card border border-border/60 hover:border-accent/30
                        rounded-xl px-4 py-3 text-sm text-text-muted hover:text-text-primary
                        transition-all duration-200 backdrop-blur group"
                    >
                      <span className="text-accent/60 group-hover:text-accent mr-1.5">&rarr;</span>
                      {q}
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* Loading doc state */}
          {loadingDoc && (
            <div className="flex items-center justify-center min-h-[60vh]">
              <div className="flex items-center gap-3 text-text-muted">
                <svg className="animate-spin w-5 h-5 text-accent" viewBox="0 0 24 24" fill="none">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                </svg>
                <span className="font-mono text-sm">Caricamento...</span>
              </div>
            </div>
          )}

          {/* Messages */}
          <div className="space-y-5">
            {messages.map((msg, i) => (
              <div key={i} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                <div className={`max-w-[85%] ${msg.role === 'user' ? '' : 'flex gap-3'}`}>
                  {/* AI avatar */}
                  {msg.role === 'assistant' && (
                    <div className="flex-shrink-0 w-8 h-8 rounded-lg bg-accent/10 border border-accent/20 flex items-center justify-center mt-1">
                      <svg className="w-4 h-4 text-accent" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9.75 3.104v5.714a2.25 2.25 0 01-.659 1.591L5 14.5M9.75 3.104c-.251.023-.501.05-.75.082m.75-.082a24.301 24.301 0 014.5 0m0 0v5.714c0 .597.237 1.17.659 1.591L19.8 15.3M14.25 3.104c.251.023.501.05.75.082M19.8 15.3l-1.57.393A9.065 9.065 0 0112 15a9.065 9.065 0 00-6.23.693L5 14.5m14.8.8l1.402 1.402c1.232 1.232.65 3.318-1.067 3.611A48.309 48.309 0 0112 21c-2.773 0-5.491-.235-8.135-.687-1.718-.293-2.3-2.379-1.067-3.61L5 14.5" />
                      </svg>
                    </div>
                  )}

                  <div className={`rounded-2xl px-5 py-3.5 ${
                    msg.role === 'user'
                      ? 'bg-accent text-white rounded-br-md shadow-lg shadow-accent/10'
                      : 'bg-bg-card/80 border border-border/60 rounded-bl-md backdrop-blur'
                  }`}>
                    <div className="text-sm leading-relaxed whitespace-pre-wrap">
                      {msg.role === 'assistant' ? renderText(msg.content) : msg.content}
                    </div>

                    {/* Tool calls activity */}
                    {msg.toolCalls && msg.toolCalls.length > 0 && (
                      <div className="mt-3 pt-3 border-t border-border/40 space-y-1">
                        <p className="text-[11px] text-text-muted font-mono uppercase tracking-wider mb-1">Analisi effettuata</p>
                        {msg.toolCalls.map((tc, j) => (
                          <div key={j} className="flex items-center gap-2 text-xs text-text-muted">
                            <svg className="w-3 h-3 text-accent flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                            </svg>
                            <span className="font-mono truncate">{tc}</span>
                          </div>
                        ))}
                      </div>
                    )}

                    {/* Page citations */}
                    {msg.citations && msg.citations.length > 0 && (
                      <div className="mt-2 pt-2 border-t border-border/40">
                        <div className="flex flex-wrap gap-1.5">
                          <span className="text-[11px] text-text-muted font-mono">Pagine consultate:</span>
                          {msg.citations.map((c, j) => (
                            <span key={j} className="citation-badge">p.{c.page_number}</span>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            ))}

            {isLoading && messages[messages.length - 1]?.role === 'user' && (
              <div className="flex justify-start">
                <div className="flex gap-3">
                  <div className="flex-shrink-0 w-8 h-8 rounded-lg bg-accent/10 border border-accent/20 flex items-center justify-center mt-1">
                    <svg className="w-4 h-4 text-accent" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9.75 3.104v5.714a2.25 2.25 0 01-.659 1.591L5 14.5M9.75 3.104c-.251.023-.501.05-.75.082m.75-.082a24.301 24.301 0 014.5 0m0 0v5.714c0 .597.237 1.17.659 1.591L19.8 15.3M14.25 3.104c.251.023.501.05.75.082M19.8 15.3l-1.57.393A9.065 9.065 0 0112 15a9.065 9.065 0 00-6.23.693L5 14.5m14.8.8l1.402 1.402c1.232 1.232.65 3.318-1.067 3.611A48.309 48.309 0 0112 21c-2.773 0-5.491-.235-8.135-.687-1.718-.293-2.3-2.379-1.067-3.61L5 14.5" />
                    </svg>
                  </div>
                  <div className="bg-bg-card/80 border border-border/60 rounded-2xl rounded-bl-md px-5 py-4 backdrop-blur">
                    <div className="flex gap-1.5">
                      <div className="typing-dot w-2 h-2 bg-accent rounded-full" />
                      <div className="typing-dot w-2 h-2 bg-accent rounded-full" />
                      <div className="typing-dot w-2 h-2 bg-accent rounded-full" />
                    </div>
                  </div>
                </div>
              </div>
            )}
          </div>

          <div ref={messagesEndRef} />
        </div>
      </div>

      {/* Input area */}
      <div className="relative z-10 border-t border-border/60 backdrop-blur-xl bg-bg/80">
        <div className="max-w-4xl mx-auto px-6 py-4">
          <form onSubmit={handleSubmit} className="flex gap-3">
            <textarea
              ref={inputRef}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder={docInfo ? 'Fai una domanda sul documento...' : 'Nessun documento disponibile...'}
              disabled={!docInfo || isLoading}
              rows={1}
              className="flex-1 bg-bg-card/60 border border-border/60 rounded-xl px-4 py-3 text-sm
                text-text-primary placeholder-text-muted/40 resize-none backdrop-blur
                focus:outline-none focus:border-accent/50 focus:ring-1 focus:ring-accent/20
                disabled:opacity-40 disabled:cursor-not-allowed transition-all"
            />
            <button
              type="submit"
              disabled={!docInfo || !input.trim() || isLoading}
              className="bg-accent hover:bg-accent-hover text-white rounded-xl px-5 py-3
                transition-all disabled:opacity-30 disabled:cursor-not-allowed
                shadow-lg shadow-accent/20 hover:shadow-accent/30
                flex items-center justify-center"
            >
              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8" />
              </svg>
            </button>
          </form>
        </div>
      </div>
    </div>
  )
}

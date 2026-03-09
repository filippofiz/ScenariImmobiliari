'use client'

import { useState, useRef, useEffect, useCallback } from 'react'
import CitationCard from './CitationCard'

interface Citation {
  page_number: number
  excerpt: string
  chunk_id: string
  similarity: number
}

interface Message {
  role: 'user' | 'assistant'
  content: string
  citations?: Citation[]
}

interface Props {
  documentId: string | null
}

export default function ChatInterface({ documentId }: Props) {
  const [messages, setMessages] = useState<Message[]>([])
  const [input, setInput] = useState('')
  const [isLoading, setIsLoading] = useState(false)
  const messagesEndRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLTextAreaElement>(null)

  const scrollToBottom = useCallback(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [])

  useEffect(() => {
    scrollToBottom()
  }, [messages, scrollToBottom])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    const trimmed = input.trim()
    if (!trimmed || !documentId || isLoading) return

    const userMessage: Message = { role: 'user', content: trimmed }
    setMessages(prev => [...prev, userMessage])
    setInput('')
    setIsLoading(true)

    // Build history (last 10 messages) for API
    const history = [...messages, userMessage]
      .slice(-10)
      .map(m => ({ role: m.role, content: m.content }))

    try {
      const response = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message: trimmed,
          document_id: documentId,
          history: history.slice(0, -1), // exclude current message
        }),
      })

      const reader = response.body?.getReader()
      const decoder = new TextDecoder()
      if (!reader) throw new Error('No response stream')

      let assistantText = ''
      let citations: Citation[] = []

      // Add empty assistant message that we'll stream into
      setMessages(prev => [...prev, { role: 'assistant', content: '', citations: [] }])

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
          } else if (data.type === 'text') {
            assistantText += data.text
            setMessages(prev => {
              const updated = [...prev]
              updated[updated.length - 1] = {
                role: 'assistant',
                content: assistantText,
                citations,
              }
              return updated
            })
          } else if (data.type === 'error') {
            throw new Error(data.error)
          }
        }
      }

      // Final update with citations
      setMessages(prev => {
        const updated = [...prev]
        updated[updated.length - 1] = {
          role: 'assistant',
          content: assistantText,
          citations,
        }
        return updated
      })
    } catch (err) {
      setMessages(prev => [
        ...prev.slice(0, -1), // remove empty streaming message if exists
        {
          role: 'assistant',
          content: `Errore: ${err instanceof Error ? err.message : 'Errore sconosciuto'}`,
        },
      ])
    } finally {
      setIsLoading(false)
    }
  }

  // Render message text with inline citation badges
  const renderMessageText = (text: string) => {
    // Match [p.X] patterns and make them clickable badges
    const parts = text.split(/(\[p\.\d+\])/g)
    return parts.map((part, i) => {
      const match = part.match(/^\[p\.(\d+)\]$/)
      if (match) {
        return (
          <span key={i} className="citation-badge">
            p.{match[1]}
          </span>
        )
      }
      return <span key={i}>{part}</span>
    })
  }

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      handleSubmit(e)
    }
  }

  return (
    <div className="flex flex-col h-full">
      {/* Messages area */}
      <div className="flex-1 overflow-y-auto px-6 py-4 space-y-4">
        {messages.length === 0 && (
          <div className="flex flex-col items-center justify-center h-full text-center space-y-4">
            <div className="w-16 h-16 rounded-2xl bg-accent/10 flex items-center justify-center">
              <svg className="w-8 h-8 text-accent" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
                  d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z"
                />
              </svg>
            </div>
            <div>
              <h3 className="font-heading text-xl text-text-primary mb-1">
                Inizia l&apos;analisi
              </h3>
              <p className="text-sm text-text-muted max-w-sm">
                {documentId
                  ? 'Fai una domanda sul Rapporto Fondi Immobiliari. Le risposte includeranno riferimenti alle pagine del documento.'
                  : 'Carica un documento PDF per iniziare la conversazione.'}
              </p>
            </div>
          </div>
        )}

        {messages.map((msg, i) => (
          <div
            key={i}
            className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}
          >
            <div
              className={`max-w-[80%] rounded-2xl px-4 py-3 ${
                msg.role === 'user'
                  ? 'bg-accent text-white rounded-br-md'
                  : 'bg-bg-card border border-border rounded-bl-md'
              }`}
            >
              <div className="text-sm leading-relaxed whitespace-pre-wrap">
                {msg.role === 'assistant' ? renderMessageText(msg.content) : msg.content}
              </div>

              {/* Citations */}
              {msg.citations && msg.citations.length > 0 && (
                <div className="mt-3 pt-3 border-t border-border space-y-1.5">
                  <p className="text-xs text-text-muted font-mono mb-1">Fonti:</p>
                  {msg.citations.map((c, j) => (
                    <CitationCard key={j} citation={c} />
                  ))}
                </div>
              )}
            </div>
          </div>
        ))}

        {/* Typing indicator */}
        {isLoading && messages[messages.length - 1]?.role === 'user' && (
          <div className="flex justify-start">
            <div className="bg-bg-card border border-border rounded-2xl rounded-bl-md px-4 py-3">
              <div className="flex gap-1">
                <div className="typing-dot w-2 h-2 bg-accent rounded-full" />
                <div className="typing-dot w-2 h-2 bg-accent rounded-full" />
                <div className="typing-dot w-2 h-2 bg-accent rounded-full" />
              </div>
            </div>
          </div>
        )}

        <div ref={messagesEndRef} />
      </div>

      {/* Input area */}
      <div className="border-t border-border px-6 py-4">
        <form onSubmit={handleSubmit} className="flex gap-3">
          <textarea
            ref={inputRef}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder={
              documentId
                ? 'Fai una domanda sul documento...'
                : 'Carica un documento per iniziare...'
            }
            disabled={!documentId || isLoading}
            rows={1}
            className="flex-1 bg-bg-card border border-border rounded-xl px-4 py-3 text-sm
              text-text-primary placeholder-text-muted/50 resize-none
              focus:outline-none focus:border-accent/50 focus:ring-1 focus:ring-accent/20
              disabled:opacity-40 disabled:cursor-not-allowed
              transition-colors"
          />
          <button
            type="submit"
            disabled={!documentId || !input.trim() || isLoading}
            className="bg-accent hover:bg-accent-hover text-white rounded-xl px-4 py-3
              transition-colors disabled:opacity-40 disabled:cursor-not-allowed
              flex items-center justify-center"
          >
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8"
              />
            </svg>
          </button>
        </form>
      </div>
    </div>
  )
}

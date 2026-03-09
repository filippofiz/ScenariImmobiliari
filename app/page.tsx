'use client'

import { useState, useEffect, useRef, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'

interface Citation {
  page_number: number
}

interface Message {
  id?: string
  role: 'user' | 'assistant'
  content: string
  citations?: Citation[]
  toolCalls?: string[]
  tool_calls?: string[]
}

interface Conversation {
  id: string
  title: string
  document_id: string
  created_at: string
  updated_at: string
}

interface DocInfo {
  id: string
  filename: string
  chunks: number
}

const SUGGESTED_QUESTIONS = [
  'Qual è il patrimonio complessivo dei fondi immobiliari italiani?',
  'Come si è evoluto il mercato dei fondi immobiliari nell\'ultimo anno?',
  'Quali sono le principali tipologie di investimento dei fondi?',
  'Qual è il rendimento medio dei fondi immobiliari?',
]

function groupConversationsByDate(conversations: Conversation[]) {
  const now = new Date()
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate())
  const yesterday = new Date(today.getTime() - 86400000)
  const weekAgo = new Date(today.getTime() - 7 * 86400000)
  const monthAgo = new Date(today.getTime() - 30 * 86400000)

  const groups: { label: string; conversations: Conversation[] }[] = [
    { label: 'OGGI', conversations: [] },
    { label: 'IERI', conversations: [] },
    { label: 'QUESTA SETTIMANA', conversations: [] },
    { label: 'QUESTO MESE', conversations: [] },
    { label: 'PRECEDENTI', conversations: [] },
  ]

  for (const conv of conversations) {
    const d = new Date(conv.updated_at)
    if (d >= today) groups[0].conversations.push(conv)
    else if (d >= yesterday) groups[1].conversations.push(conv)
    else if (d >= weekAgo) groups[2].conversations.push(conv)
    else if (d >= monthAgo) groups[3].conversations.push(conv)
    else groups[4].conversations.push(conv)
  }

  return groups.filter(g => g.conversations.length > 0)
}

/* ---- Animated House Icon ---- */
function AnimatedHouseIcon({ size = 32, animate = false }: { size?: number; animate?: boolean }) {
  const idRef = useRef(`hi-${Math.random().toString(36).slice(2, 8)}`)
  const revealRef = useRef<SVGPathElement>(null)
  const hideRef = useRef<SVGPathElement>(null)
  const dotRef = useRef<SVGCircleElement>(null)
  const animRef = useRef<number>(0)

  const housePath = "M60,12 L109,55 L109,109 L11,109 L11,55 Z"

  useEffect(() => {
    const reveal = revealRef.current
    const hide = hideRef.current
    const dot = dotRef.current
    if (!reveal || !hide || !dot) return

    const P = reveal.getTotalLength()
    reveal.style.strokeDasharray = `${P}`
    hide.style.strokeDasharray = `${P}`

    if (!animate) {
      reveal.style.strokeDashoffset = '0'
      hide.style.strokeDashoffset = `${P}`
      dot.style.opacity = '0'
      return
    }

    reveal.style.strokeDashoffset = `${P}`
    hide.style.strokeDashoffset = `${P}`

    const BUILD = 3200, ERASE = 2800, PAUSE = 900
    let state = 0, start: number | null = null, last: number | null = null
    let bP = 0, eP = 0

    function tick(ts: number) {
      if (!last) last = ts
      const dt = ts - last
      last = ts
      if (!start) start = ts
      const el = ts - start

      if (state === 0) {
        if (el > PAUSE) { state = 1; start = ts; bP = 0 }
      } else if (state === 1) {
        bP = Math.min(bP + dt / BUILD, 1)
        reveal!.style.strokeDashoffset = `${P * (1 - bP)}`
        if (bP >= 1) {
          dot!.style.opacity = '1'
          setTimeout(() => { if (dot) dot.style.opacity = '0' }, 400)
          state = 2; start = ts
        }
      } else if (state === 2) {
        if (el > PAUSE) { state = 3; start = ts; eP = 0 }
      } else if (state === 3) {
        eP = Math.min(eP + dt / ERASE, 1)
        hide!.style.strokeDashoffset = `${P * (1 - eP)}`
        if (eP >= 1) {
          reveal!.style.strokeDashoffset = `${P}`
          hide!.style.strokeDashoffset = `${P}`
          state = 0; start = ts
        }
      }
      animRef.current = requestAnimationFrame(tick)
    }

    animRef.current = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(animRef.current)
  }, [animate])

  const maskId = `${idRef.current}-m`
  const filterId = `${idRef.current}-g`

  return (
    <svg width={size} height={size} viewBox="0 0 120 120" fill="none" className="flex-shrink-0">
      <defs>
        <filter id={filterId}>
          <feGaussianBlur stdDeviation="5" result="blur" />
          <feMerge><feMergeNode in="blur" /><feMergeNode in="SourceGraphic" /></feMerge>
        </filter>
        <mask id={maskId}>
          <rect width="120" height="120" fill="black" />
          <path ref={revealRef} d={housePath} fill="none" stroke="white" strokeWidth="12"
            strokeLinecap="round" strokeLinejoin="round" />
          <path ref={hideRef} d={housePath} fill="none" stroke="black" strokeWidth="14"
            strokeLinecap="round" strokeLinejoin="round" />
        </mask>
      </defs>
      <path d={housePath} fill="none" stroke="#4E8EA7" strokeWidth="8" opacity="0.15"
        strokeLinecap="round" strokeLinejoin="round"
        filter={`url(#${filterId})`} mask={`url(#${maskId})`} />
      <path d={housePath} fill="none" stroke="#4E8EA7" strokeWidth="5"
        strokeLinecap="round" strokeLinejoin="round"
        mask={`url(#${maskId})`} />
      <circle ref={dotRef} cx="60" cy="12" r="5" fill="#4E8EA7" opacity="0"
        style={{ transition: 'opacity 0.3s' }} />
    </svg>
  )
}

const ANALYSIS_MESSAGES = [
  'Analisi del mercato immobiliare...',
  'Consultazione delle fonti...',
  'Elaborazione dei dati storici...',
  'Verifica dei trend di settore...',
  'Incrocio dati patrimoniali...',
  'Analisi delle performance...',
  'Raccolta indicatori chiave...',
  'Sintesi delle informazioni...',
]

function RotatingStatus({ isActive }: { isActive: boolean }) {
  const [index, setIndex] = useState(0)

  useEffect(() => {
    if (!isActive) return
    const interval = setInterval(() => {
      setIndex(prev => (prev + 1) % ANALYSIS_MESSAGES.length)
    }, 2200)
    return () => clearInterval(interval)
  }, [isActive])

  if (!isActive) return null

  return (
    <div className="flex items-center gap-2.5 px-3 py-2">
      <div className="relative w-3.5 h-3.5 flex-shrink-0">
        <svg className="animate-spin w-3.5 h-3.5 text-teal" viewBox="0 0 24 24" fill="none">
          <circle className="opacity-20" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="3" />
          <path className="opacity-80" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
        </svg>
      </div>
      <span
        key={index}
        className="text-[11px] font-mono text-teal tracking-wide animate-fade-in"
      >
        {ANALYSIS_MESSAGES[index]}
      </span>
    </div>
  )
}

function CompletedStatus({ toolCallCount, citationCount }: { toolCallCount: number; citationCount: number }) {
  if (toolCallCount === 0) return null
  return (
    <div className="flex items-center gap-2 px-3 py-1.5 mt-2 rounded-lg bg-teal/[0.04] border border-teal/10">
      <svg className="w-3 h-3 text-teal flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
      </svg>
      <span className="text-[10px] font-mono text-teal/80 tracking-wide">
        {toolCallCount} {toolCallCount === 1 ? 'ricerca' : 'ricerche'} · {citationCount} {citationCount === 1 ? 'fonte' : 'fonti'} consultate
      </span>
    </div>
  )
}

export default function ClientChat() {
  const [messages, setMessages] = useState<Message[]>([])
  const [input, setInput] = useState('')
  const [isLoading, setIsLoading] = useState(false)
  const [docInfo, setDocInfo] = useState<DocInfo | null>(null)
  const [loadingDoc, setLoadingDoc] = useState(true)
  const [conversations, setConversations] = useState<Conversation[]>([])
  const [activeConversation, setActiveConversation] = useState<string | null>(null)
  const [sidebarOpen, setSidebarOpen] = useState(true)
  const [loadingMessages, setLoadingMessages] = useState(false)
  const [searchQuery, setSearchQuery] = useState('')
  const messagesEndRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLTextAreaElement>(null)
  const router = useRouter()

  useEffect(() => {
    fetch('/api/documents')
      .then(r => {
        if (r.status === 401) { router.push('/login'); return null }
        return r.json()
      })
      .then(docs => {
        if (docs && docs.length > 0) {
          const doc = { id: docs[0].id, filename: docs[0].filename, chunks: docs[0].chunks }
          setDocInfo(doc)
          fetch(`/api/conversations?document_id=${doc.id}`)
            .then(r => r.json())
            .then(convs => setConversations(convs || []))
            .catch(() => {})
        }
      })
      .catch(() => {})
      .finally(() => setLoadingDoc(false))
  }, [router])

  const scrollToBottom = useCallback(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [])

  useEffect(() => { scrollToBottom() }, [messages, scrollToBottom])

  const loadConversation = async (convId: string) => {
    setActiveConversation(convId)
    setLoadingMessages(true)
    setMessages([])
    try {
      const res = await fetch(`/api/conversations/messages?conversation_id=${convId}`)
      const msgs = await res.json()
      setMessages(msgs.map((m: Message & { tool_calls?: string[] }) => ({
        role: m.role,
        content: m.content,
        citations: m.citations,
        toolCalls: m.tool_calls || [],
      })))
    } catch {
      // ignore
    } finally {
      setLoadingMessages(false)
      setTimeout(() => inputRef.current?.focus(), 100)
    }
  }

  const startNewChat = () => {
    setActiveConversation(null)
    setMessages([])
    setTimeout(() => inputRef.current?.focus(), 100)
  }

  const deleteConversation = async (id: string, e: React.MouseEvent) => {
    e.stopPropagation()
    await fetch('/api/conversations', {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id }),
    })
    setConversations(prev => prev.filter(c => c.id !== id))
    if (activeConversation === id) startNewChat()
  }

  const refreshConversations = async () => {
    if (!docInfo) return
    const res = await fetch(`/api/conversations?document_id=${docInfo.id}`)
    const convs = await res.json()
    setConversations(convs || [])
  }

  const sendMessage = async (text: string) => {
    if (!text.trim() || !docInfo || isLoading) return

    const userMessage: Message = { role: 'user', content: text.trim() }
    setMessages(prev => [...prev, userMessage])
    setInput('')
    setIsLoading(true)

    let convId = activeConversation

    if (!convId) {
      try {
        const res = await fetch('/api/conversations', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ document_id: docInfo.id }),
        })
        const conv = await res.json()
        convId = conv.id
        setActiveConversation(conv.id)
        setConversations(prev => [conv, ...prev])
      } catch {
        setIsLoading(false)
        return
      }
    }

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
          conversation_id: convId,
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
          try {
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
            } else if (data.type === 'title_updated') {
              setConversations(prev =>
                prev.map(c => c.id === convId ? { ...c, title: data.title } : c)
              )
            }
          } catch {
            // ignore
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
      refreshConversations()
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

  const filteredConversations = searchQuery
    ? conversations.filter(c => c.title.toLowerCase().includes(searchQuery.toLowerCase()))
    : conversations

  const grouped = groupConversationsByDate(filteredConversations)

  const renderMarkdown = (text: string, isStreaming: boolean) => {
    const processed = text.replace(/\[p\.(\d+)\]/g, '`PAGE_REF:$1`')
    return (
      <div className={isStreaming ? 'streaming-cursor' : ''}>
        <ReactMarkdown
          remarkPlugins={[remarkGfm]}
          components={{
            code: ({ children }) => {
              const str = String(children)
              const match = str.match(/^PAGE_REF:(\d+)$/)
              if (match) {
                return <span className="citation-badge">p.{match[1]}</span>
              }
              return <code className="bg-bg-elevated border border-border rounded px-1.5 py-0.5 text-xs font-mono text-teal/80">{children}</code>
            },
            strong: ({ children }) => <strong className="font-semibold text-text-primary">{children}</strong>,
            em: ({ children }) => <em className="text-text-secondary">{children}</em>,
            p: ({ children }) => <p className="mb-2.5 last:mb-0 leading-relaxed">{children}</p>,
            ul: ({ children }) => <ul className="list-disc list-inside mb-2.5 space-y-1 text-text-primary/90">{children}</ul>,
            ol: ({ children }) => <ol className="list-decimal list-inside mb-2.5 space-y-1 text-text-primary/90">{children}</ol>,
            li: ({ children }) => <li className="leading-relaxed">{children}</li>,
            h3: ({ children }) => <h3 className="font-heading font-bold text-text-primary mt-4 mb-1.5 text-base">{children}</h3>,
            h4: ({ children }) => <h4 className="font-semibold text-text-primary mt-3 mb-1 text-sm">{children}</h4>,
            table: ({ children }) => (
              <div className="overflow-x-auto my-3 rounded-lg border border-border">
                <table className="w-full text-xs border-collapse">{children}</table>
              </div>
            ),
            thead: ({ children }) => <thead className="bg-bg-elevated border-b border-border-bright">{children}</thead>,
            th: ({ children }) => <th className="text-left px-3 py-2 font-mono text-text-muted text-[10px] uppercase tracking-wider">{children}</th>,
            td: ({ children }) => <td className="px-3 py-2 border-t border-border text-text-secondary text-xs">{children}</td>,
          }}
        >
          {processed}
        </ReactMarkdown>
      </div>
    )
  }

  const chipAnimations = ['animate-chip-in-1', 'animate-chip-in-2', 'animate-chip-in-3', 'animate-chip-in-4']

  return (
    <div className="h-screen flex bg-bg overflow-hidden font-sans">
      {/* Mobile overlay */}
      {sidebarOpen && (
        <div className="fixed inset-0 bg-black/60 z-20 lg:hidden backdrop-blur-sm" onClick={() => setSidebarOpen(false)} />
      )}

      {/* ============ SIDEBAR ============ */}
      <aside className={`
        fixed lg:relative z-30 h-full w-[260px] flex flex-col
        bg-bg-card border-r border-border
        transition-transform duration-300 ease-out
        ${sidebarOpen ? 'translate-x-0 animate-slide-in-left lg:animate-none' : '-translate-x-full lg:translate-x-0 lg:w-0 lg:border-0 lg:overflow-hidden'}
      `}>
        {/* Brand accent left border — red top fading to teal */}
        <div className="absolute left-0 top-0 bottom-0 w-[3px] bg-gradient-to-b from-brand-red via-teal/60 to-teal/15" />

        {/* Sidebar header */}
        <div className="pl-5 pr-3 pt-5 pb-4 border-b border-border">
          <div className="flex items-center justify-between mb-5">
            <div>
              <img src="/logo.png" alt="Scenari Immobiliari" className="h-[38px] w-auto" />
            </div>
            <button onClick={() => setSidebarOpen(false)} className="lg:hidden p-1 text-text-muted hover:text-text-primary transition-colors">
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>

          {/* New thread button */}
          <button
            onClick={startNewChat}
            className="w-full flex items-center justify-center gap-2 px-3 py-2.5 rounded-lg
              border border-teal/40 hover:bg-teal hover:border-teal
              text-teal hover:text-white
              transition-all duration-200 group"
          >
            <span className="text-xs font-mono font-medium uppercase tracking-[0.1em]">+ New Thread</span>
          </button>
        </div>

        {/* Search */}
        <div className="px-3 py-3">
          <input
            type="text"
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
            placeholder="CERCA THREADS..."
            className="w-full bg-bg-elevated/60 border border-border rounded-md px-3 py-2
              text-[10px] text-text-primary placeholder-text-muted/50 font-mono uppercase tracking-wider
              focus:outline-none focus:border-teal/30 transition-colors"
          />
        </div>

        {/* Conversation list */}
        <div className="flex-1 overflow-y-auto px-2 py-1">
          {grouped.length === 0 && !loadingDoc && (
            <div className="px-3 py-10 text-center">
              <p className="text-[10px] text-text-muted font-mono uppercase tracking-wider">Nessun thread</p>
            </div>
          )}

          {grouped.map((group) => (
            <div key={group.label} className="mb-3">
              <p className="px-3 py-1.5 text-[9px] font-mono text-text-muted uppercase tracking-[0.15em]">
                {group.label}
              </p>
              <div className="space-y-0.5">
                {group.conversations.map((conv) => (
                  <button
                    key={conv.id}
                    onClick={() => loadConversation(conv.id)}
                    className={`conv-item w-full text-left pl-4 pr-2 py-2 rounded-md
                      group flex items-center gap-2.5
                      ${activeConversation === conv.id
                        ? 'active bg-teal/[0.08] text-text-primary'
                        : 'text-text-secondary hover:bg-bg-elevated/50 hover:text-text-primary'
                      }`}
                  >
                    {/* Dot indicator */}
                    <span className={`flex-shrink-0 w-1.5 h-1.5 rounded-full border
                      ${activeConversation === conv.id
                        ? 'bg-teal border-teal'
                        : 'border-text-muted/30'
                      }`}
                    />
                    <div className="flex-1 min-w-0">
                      <span className="block truncate text-[12px] font-sans">{conv.title}</span>
                      <span className="block text-[9px] font-mono text-text-muted mt-0.5">
                        {new Date(conv.updated_at).toLocaleDateString('it-IT', { day: '2-digit', month: '2-digit' })}
                      </span>
                    </div>
                    <button
                      onClick={(e) => deleteConversation(conv.id, e)}
                      className="opacity-0 group-hover:opacity-100 p-0.5 text-text-muted hover:text-danger transition-all flex-shrink-0"
                    >
                      <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                      </svg>
                    </button>
                  </button>
                ))}
              </div>
            </div>
          ))}
        </div>

        {/* Sidebar footer */}
        <div className="px-3 py-3 border-t border-border space-y-2">
          {docInfo && (
            <div className="flex items-center gap-2 px-2 py-1.5">
              <div className="w-1.5 h-1.5 rounded-full bg-success animate-pulse flex-shrink-0" />
              <span className="text-[9px] text-success/80 font-mono uppercase tracking-[0.1em]">
                {docInfo.chunks} chunks indexed
              </span>
            </div>
          )}
          <button
            onClick={handleLogout}
            className="w-full flex items-center gap-2 px-2 py-2 rounded-md text-text-muted
              hover:bg-bg-elevated/50 hover:text-text-primary transition-colors"
          >
            <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 9V5.25A2.25 2.25 0 0013.5 3h-6a2.25 2.25 0 00-2.25 2.25v13.5A2.25 2.25 0 007.5 21h6a2.25 2.25 0 002.25-2.25V15m3 0l3-3m0 0l-3-3m3 3H9" />
            </svg>
            <span className="text-[10px] font-mono uppercase tracking-[0.1em]">Esci</span>
          </button>
        </div>
      </aside>

      {/* ============ MAIN AREA ============ */}
      <main className="flex-1 flex flex-col min-w-0 relative">
        {/* Subtle ambient */}
        <div className="absolute top-0 right-0 w-[600px] h-[600px] bg-teal/[0.015] rounded-full blur-[180px] pointer-events-none" />

        {/* Top bar — 48px */}
        <header className="relative z-10 h-12 flex items-center justify-between px-4 border-b border-border bg-bg/90 backdrop-blur-md flex-shrink-0">
          <div className="flex items-center gap-3">
            <button
              onClick={() => setSidebarOpen(!sidebarOpen)}
              className="p-1.5 rounded-md text-text-muted hover:text-text-primary hover:bg-bg-elevated/60 transition-colors"
            >
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 6.75h16.5M3.75 12h16.5m-16.5 5.25h16.5" />
              </svg>
            </button>
            <span className="text-[10px] font-mono text-text-muted uppercase tracking-[0.12em]">
              {activeConversation
                ? (conversations.find(c => c.id === activeConversation)?.title || 'THREAD').toUpperCase()
                : 'NUOVA CONVERSAZIONE'}
            </span>
          </div>

          {docInfo && (
            <div className="hidden sm:flex items-center gap-2 px-3 py-1 rounded-full border border-teal/20 bg-teal/[0.05]">
              <svg className="w-3 h-3 text-teal/60" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375h-1.5A1.125 1.125 0 0113.5 7.125v-1.5a3.375 3.375 0 00-3.375-3.375H8.25m2.25 0H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 00-9-9z" />
              </svg>
              <span className="text-[10px] font-mono text-teal/70 truncate max-w-[200px]">{docInfo.filename}</span>
            </div>
          )}
        </header>

        {/* Chat area */}
        <div className="flex-1 overflow-y-auto relative z-10">
          <div className="max-w-[760px] mx-auto px-4 sm:px-6 py-6">

            {/* ---- EMPTY STATE ---- */}
            {messages.length === 0 && !loadingDoc && !loadingMessages && (
              <div className="flex flex-col items-center justify-center min-h-[65vh] text-center px-4 animate-fade-up">

                <div className="relative mb-6 flex flex-col items-center">
                  <div className="mb-2">
                    <AnimatedHouseIcon size={56} animate={true} />
                  </div>
                  <p className="text-[13px] font-semibold tracking-tight"><span className="text-brand-red">Scenari Immobiliari</span> <span className="text-text-secondary">AI Assistant</span></p>
                </div>

                <h2 className="font-sans text-2xl sm:text-3xl font-semibold text-text-primary mb-3 tracking-tight">
                  {docInfo ? 'Come posso aiutarLa?' : 'Nessun documento'}
                </h2>
                {!docInfo && (
                  <p className="text-[15px] text-text-secondary max-w-md mb-10 leading-relaxed">
                    Nessun documento è stato ancora caricato. Contatti l&apos;amministratore.
                  </p>
                )}
                <div className="mb-10" />

                {docInfo && (
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 w-full max-w-xl">
                    {SUGGESTED_QUESTIONS.map((q, i) => (
                      <button
                        key={i}
                        onClick={() => sendMessage(q)}
                        className={`suggestion-chip text-left bg-bg-card hover:bg-teal-glow
                          border-l-[3px] border-l-teal/30 hover:border-l-teal
                          border-t border-r border-b border-border/60 hover:border-border-bright
                          rounded-r-lg px-4 py-3.5 text-[13px] text-text-secondary hover:text-text-primary
                          transition-all duration-200 leading-snug font-sans ${chipAnimations[i]}`}
                      >
                        <span className="chip-arrow inline-block text-teal/40 mr-1.5">&rarr;</span>
                        {q}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            )}

            {/* Loading states */}
            {(loadingMessages || loadingDoc) && (
              <div className="flex items-center justify-center min-h-[60vh]">
                <div className="flex items-center gap-3">
                  <svg className="animate-spin w-4 h-4 text-teal" viewBox="0 0 24 24" fill="none">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                  </svg>
                  <span className="text-[11px] font-mono text-text-muted uppercase tracking-wider">
                    {loadingMessages ? 'Caricamento thread...' : 'Inizializzazione...'}
                  </span>
                </div>
              </div>
            )}

            {/* ---- MESSAGES ---- */}
            <div className="space-y-5">
              {messages.map((msg, i) => (
                <div key={i} className={`msg-enter flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                  {msg.role === 'user' ? (
                    /* ---- USER BUBBLE ---- */
                    <div className="max-w-[85%] sm:max-w-[75%] flex items-start gap-2.5 flex-row-reverse">
                      <div className="flex-shrink-0 w-7 h-7 rounded-full bg-teal-dim/30 border border-teal-dim/40 flex items-center justify-center mt-0.5">
                        <svg className="w-3 h-3 text-teal" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                          <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 6a3.75 3.75 0 11-7.5 0 3.75 3.75 0 017.5 0zM4.501 20.118a7.5 7.5 0 0114.998 0" />
                        </svg>
                      </div>
                      <div>
                        <div className="bg-teal-dim text-white rounded-xl rounded-tr-sm px-4 py-3 text-sm leading-relaxed">
                          {msg.content}
                        </div>
                      </div>
                    </div>
                  ) : (
                    /* ---- AI BUBBLE ---- */
                    <div className="max-w-[90%] sm:max-w-[85%] flex items-start gap-2.5">
                      <AnimatedHouseIcon size={28} animate={isLoading && i === messages.length - 1} />
                      <div className="flex-1 min-w-0">
                        <div className="ai-stripe bg-bg-card border border-border rounded-xl rounded-tl-sm px-5 py-4">
                          <div className="text-[14px] leading-[1.7] text-text-primary/90 font-sans">
                            {renderMarkdown(msg.content, isLoading && i === messages.length - 1 && msg.content !== '')}
                          </div>

                          {/* Compact analysis summary + source */}
                          {msg.toolCalls && msg.toolCalls.length > 0 && (
                            <CompletedStatus
                              toolCallCount={msg.toolCalls.length}
                              citationCount={msg.citations?.length || 0}
                            />
                          )}

                          {/* Report source */}
                          {msg.citations && msg.citations.length > 0 && docInfo && (
                            <div className="mt-2 flex items-center gap-1.5 px-1">
                              <svg className="w-3 h-3 text-text-muted flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                                <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375h-1.5A1.125 1.125 0 0113.5 7.125v-1.5a3.375 3.375 0 00-3.375-3.375H8.25m2.25 0H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 00-9-9z" />
                              </svg>
                              <span className="text-[10px] font-mono text-text-muted truncate">
                                {docInfo.filename.replace(/\.pdf$/i, '').replace(/[_-]/g, ' ')}
                              </span>
                            </div>
                          )}
                        </div>

                        {/* Regenerate */}
                        {!isLoading && msg.content && (
                          <button
                            onClick={() => {
                              const userMsg = messages.slice(0, i).reverse().find(m => m.role === 'user')
                              if (userMsg) {
                                setMessages(prev => prev.slice(0, i))
                                setTimeout(() => sendMessage(userMsg.content), 100)
                              }
                            }}
                            className="mt-1.5 ml-1 flex items-center gap-1 text-[10px] text-text-muted
                              hover:text-text-muted transition-colors font-mono uppercase tracking-wider"
                          >
                            <svg className="w-2.5 h-2.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                              <path strokeLinecap="round" strokeLinejoin="round" d="M16.023 9.348h4.992v-.001M2.985 19.644v-4.992m0 0h4.992m-4.993 0l3.181 3.183a8.25 8.25 0 0013.803-3.7M4.031 9.865a8.25 8.25 0 0113.803-3.7l3.181 3.182" />
                            </svg>
                            Rigenera
                          </button>
                        )}
                      </div>
                    </div>
                  )}
                </div>
              ))}

              {/* Animated analysis status */}
              {isLoading && (messages[messages.length - 1]?.role === 'user' || (messages[messages.length - 1]?.role === 'assistant' && messages[messages.length - 1]?.content === '')) && (
                <div className="msg-enter flex justify-start">
                  <div className="flex items-start gap-2.5">
                    <AnimatedHouseIcon size={28} animate={true} />
                    <div className="ai-stripe bg-bg-card border border-border rounded-xl rounded-tl-sm">
                      <RotatingStatus isActive={true} />
                    </div>
                  </div>
                </div>
              )}
            </div>

            <div ref={messagesEndRef} />
          </div>
        </div>

        {/* ---- INPUT AREA ---- */}
        <div className="relative z-10 py-4 px-4">
          <div className="max-w-[760px] mx-auto">
            <form onSubmit={handleSubmit} className="relative">
              <div className="bg-bg-elevated border border-border-bright rounded-xl overflow-hidden
                focus-within:border-teal/50 focus-within:shadow-[0_0_0_3px_rgba(78,142,167,0.15),0_0_24px_rgba(78,142,167,0.08)]
                transition-all duration-200">
                <textarea
                  ref={inputRef}
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  onKeyDown={handleKeyDown}
                  placeholder={docInfo ? 'Chieda qualsiasi cosa su oltre 30 anni di mercato immobiliare italiano...' : 'Nessun documento disponibile...'}
                  disabled={!docInfo || isLoading}
                  rows={1}
                  className="w-full bg-transparent pl-4 pr-14 py-3.5
                    text-sm text-text-primary placeholder-text-muted resize-none font-mono
                    focus:outline-none
                    disabled:opacity-30 disabled:cursor-not-allowed"
                />
                <button
                  type="submit"
                  disabled={!docInfo || !input.trim() || isLoading}
                  className="send-btn absolute right-3 top-1/2 -translate-y-1/2
                    w-8 h-8 rounded-full bg-teal hover:bg-teal-dim text-white
                    flex items-center justify-center
                    disabled:opacity-15 disabled:cursor-not-allowed
                    shadow-lg shadow-teal/20 hover:shadow-teal/30"
                >
                  <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 10.5L12 3m0 0l7.5 7.5M12 3v18" />
                  </svg>
                </button>
              </div>
            </form>
            <p className="text-center text-[10px] text-text-muted mt-2.5">
              Scenari Immobiliari AI Assistant &middot; Risposte basate esclusivamente sui documenti indicizzati
            </p>
          </div>
        </div>
      </main>
    </div>
  )
}

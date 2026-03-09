'use client'

import { useState, useEffect, useRef, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
const PDFJS_VERSION = '3.11.174'
const PDFJS_CDN = `https://cdnjs.cloudflare.com/ajax/libs/pdf.js/${PDFJS_VERSION}`

function loadPdfjs(): Promise<any> {
  const w = window as any
  if (w.pdfjsLib) return Promise.resolve(w.pdfjsLib)
  return new Promise((resolve, reject) => {
    const script = document.createElement('script')
    script.src = `${PDFJS_CDN}/pdf.min.js`
    script.onload = () => {
      w.pdfjsLib.GlobalWorkerOptions.workerSrc = `${PDFJS_CDN}/pdf.worker.min.js`
      resolve(w.pdfjsLib)
    }
    script.onerror = reject
    document.head.appendChild(script)
  })
}

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
  project_id: string | null
  created_at: string
  updated_at: string
}

interface Project {
  id: string
  name: string
  emoji: string
  color: string
  description: string
  is_archived: boolean
  created_at: string
  updated_at: string
}

const PROJECT_COLORS = ['#4E8EA7', '#CC0000', '#22C55E', '#C9A84C', '#8B5CF6', '#EC4899', '#F97316', '#06B6D4']

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
const SCRAMBLE_CHARS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789#@&%'

function AnimatedHouseIcon({ size = 32, animate = false, restPause = 900, holdPause = 900, showText = false }: { size?: number; animate?: boolean; restPause?: number; holdPause?: number; showText?: boolean }) {
  const idRef = useRef(`hi-${Math.random().toString(36).slice(2, 8)}`)
  const revealRef = useRef<SVGPathElement>(null)
  const hideRef = useRef<SVGPathElement>(null)
  const dotRef = useRef<SVGCircleElement>(null)
  const text1Ref = useRef<SVGTextElement>(null)
  const text2Ref = useRef<SVGTextElement>(null)
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

    // Set initial text immediately
    if (showText && text1Ref.current && text2Ref.current) {
      text1Ref.current.textContent = 'SCENARI'
      text1Ref.current.setAttribute('fill', '#CC0000')
      text2Ref.current.textContent = 'IMMOBILIARI'
      text2Ref.current.setAttribute('fill', '#CC0000')
    }

    function scrambleEl(el: SVGTextElement | null, target: string, color: string) {
      if (!el) return
      el.setAttribute('fill', color)
      let step = 0
      const steps = 14
      const iv = setInterval(() => {
        step++
        const ratio = step / steps
        let r = ''
        for (let i = 0; i < target.length; i++) {
          if (i < Math.floor(ratio * target.length)) r += target[i]
          else r += target[i] === ' ' ? ' ' : SCRAMBLE_CHARS[Math.floor(Math.random() * SCRAMBLE_CHARS.length)]
        }
        el.textContent = r
        if (step >= steps) { clearInterval(iv); el.textContent = target }
      }, 600 / steps)
    }

    const BUILD = 3200, ERASE = 2800, HOLD = holdPause, REST = restPause
    let state = 0, start: number | null = null, last: number | null = null
    let bP = 0, eP = 0, toAI = false, toSI = false

    function tick(ts: number) {
      if (!last) last = ts
      const dt = ts - last
      last = ts
      if (!start) start = ts
      const el = ts - start

      if (state === 0) {
        if (el > REST) { state = 1; start = ts; bP = 0; toAI = false }
      } else if (state === 1) {
        bP = Math.min(bP + dt / BUILD, 1)
        reveal!.style.strokeDashoffset = `${P * (1 - bP)}`
        if (bP >= 0.5 && !toAI && showText) {
          toAI = true
          scrambleEl(text1Ref.current, 'AI', '#4E8EA7')
          scrambleEl(text2Ref.current, 'ASSISTANT', '#4E8EA7')
        }
        if (bP >= 1) {
          dot!.style.opacity = '1'
          setTimeout(() => { if (dot) dot.style.opacity = '0' }, 400)
          state = 2; start = ts
        }
      } else if (state === 2) {
        if (el > HOLD) { state = 3; start = ts; eP = 0; toSI = false }
      } else if (state === 3) {
        eP = Math.min(eP + dt / ERASE, 1)
        hide!.style.strokeDashoffset = `${P * (1 - eP)}`
        if (eP >= 0.5 && !toSI && showText) {
          toSI = true
          scrambleEl(text1Ref.current, 'SCENARI', '#CC0000')
          scrambleEl(text2Ref.current, 'IMMOBILIARI', '#CC0000')
        }
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
  }, [animate, showText, restPause, holdPause])

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
      {showText && (
        <>
          <text ref={text1Ref} x="60" y="78" textAnchor="middle"
            fontSize="18" fontWeight="700" fontFamily="Georgia, serif" fill="#CC0000"
            letterSpacing="0.5">SCENARI</text>
          <text ref={text2Ref} x="60" y="95" textAnchor="middle"
            fontSize="11" fontWeight="700" fontFamily="Georgia, serif" fill="#CC0000"
            letterSpacing="-0.2">IMMOBILIARI</text>
        </>
      )}
    </svg>
  )
}



const THINKING_LINES = [
  'Scanning 30 anni di dati immobiliari',
  'Incrociando trend di mercato',
  'Mappando il landscape dei fondi',
  'Connettendo intelligence di settore',
  'Navigando i flussi patrimoniali',
  'Decodificando performance storiche',
  'Tracciando dinamiche di portafoglio',
  'Estraendo pattern dai dati',
]

function ThinkingLine() {
  const [index, setIndex] = useState(0)
  const [display, setDisplay] = useState(THINKING_LINES[0])

  useEffect(() => {
    const interval = setInterval(() => {
      setIndex(prev => {
        const next = (prev + 1) % THINKING_LINES.length
        // scramble in the new text
        const target = THINKING_LINES[next]
        let step = 0
        const steps = 14
        const iv = setInterval(() => {
          step++
          const ratio = step / steps
          let r = ''
          for (let i = 0; i < target.length; i++) {
            if (i < Math.floor(ratio * target.length)) r += target[i]
            else r += target[i] === ' ' ? ' ' : SCRAMBLE_CHARS[Math.floor(Math.random() * SCRAMBLE_CHARS.length)]
          }
          setDisplay(r)
          if (step >= steps) { clearInterval(iv); setDisplay(target) }
        }, 35)
        return next
      })
    }, 2800)
    return () => clearInterval(interval)
  }, [])

  return (
    <span className="text-[13px] font-mono text-teal tracking-wide">{display}</span>
  )
}

function PdfPageViewer({ documentId, page, onClose, onPageChange }: {
  documentId: string
  page: number
  onClose: () => void
  onPageChange: (p: number) => void
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const containerRef = useRef<HTMLDivElement>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [scale, setScale] = useState(1)

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    setError(null)

    const render = async () => {
      try {
        const response = await fetch(`/api/pdf-page?document_id=${documentId}&page=${page}`)
        if (!response.ok) throw new Error('Errore caricamento pagina')
        const arrayBuffer = await response.arrayBuffer()
        const pdfjs = await loadPdfjs()
        const pdf = await pdfjs.getDocument({ data: arrayBuffer }).promise
        const pdfPage = await pdf.getPage(1)

        if (cancelled) return

        const canvas = canvasRef.current
        const container = containerRef.current
        if (!canvas || !container) return

        // Fit to container width with some padding
        const containerWidth = container.clientWidth - 32
        const viewport = pdfPage.getViewport({ scale: 1 })
        const fitScale = containerWidth / viewport.width
        const scaledViewport = pdfPage.getViewport({ scale: fitScale * scale })

        const dpr = window.devicePixelRatio || 1
        canvas.width = scaledViewport.width * dpr
        canvas.height = scaledViewport.height * dpr
        canvas.style.width = `${scaledViewport.width}px`
        canvas.style.height = `${scaledViewport.height}px`

        const ctx = canvas.getContext('2d')!
        ctx.scale(dpr, dpr)

        await pdfPage.render({
          canvasContext: ctx,
          viewport: scaledViewport,
          canvas,
        } as any).promise

        if (!cancelled) setLoading(false)
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : 'Errore')
          setLoading(false)
        }
      }
    }
    render()
    return () => { cancelled = true }
  }, [documentId, page, scale])

  return (
    <div className="fixed inset-0 z-50 lg:relative lg:inset-auto lg:z-auto lg:flex lg:flex-col lg:w-[440px] lg:flex-shrink-0 lg:border-l lg:border-border bg-bg/95 backdrop-blur-xl lg:bg-bg-card lg:backdrop-blur-none animate-fade-in">
      {/* Header */}
      <div className="h-12 flex items-center justify-between px-4 border-b border-border flex-shrink-0 bg-bg-card/80 backdrop-blur-md">
        <div className="flex items-center gap-2.5">
          <div className="w-6 h-6 rounded-md bg-teal/10 flex items-center justify-center">
            <svg className="w-3 h-3 text-teal" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375h-1.5A1.125 1.125 0 0113.5 7.125v-1.5a3.375 3.375 0 00-3.375-3.375H8.25m2.25 0H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 00-9-9z" />
            </svg>
          </div>
          <span className="text-[13px] font-mono text-text-primary tracking-wide">p. {page}</span>
        </div>
        <div className="flex items-center gap-0.5">
          {/* Zoom controls */}
          <button onClick={() => setScale(s => Math.max(0.5, s - 0.25))}
            className="p-1.5 rounded-md text-text-muted hover:text-text-primary hover:bg-bg-elevated transition-colors"
            title="Zoom out">
            <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 12h-15" />
            </svg>
          </button>
          <span className="text-[10px] font-mono text-text-muted w-8 text-center">{Math.round(scale * 100)}%</span>
          <button onClick={() => setScale(s => Math.min(3, s + 0.25))}
            className="p-1.5 rounded-md text-text-muted hover:text-text-primary hover:bg-bg-elevated transition-colors"
            title="Zoom in">
            <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
            </svg>
          </button>
          <div className="w-px h-4 bg-border mx-1" />
          {/* Page navigation */}
          <button onClick={() => onPageChange(Math.max(1, page - 1))}
            className="p-1.5 rounded-md text-text-muted hover:text-text-primary hover:bg-bg-elevated transition-colors"
            title="Pagina precedente">
            <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 19.5L8.25 12l7.5-7.5" />
            </svg>
          </button>
          <button onClick={() => onPageChange(page + 1)}
            className="p-1.5 rounded-md text-text-muted hover:text-text-primary hover:bg-bg-elevated transition-colors"
            title="Pagina successiva">
            <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M8.25 4.5l7.5 7.5-7.5 7.5" />
            </svg>
          </button>
          <div className="w-px h-4 bg-border mx-1" />
          {/* Close */}
          <button onClick={onClose}
            className="p-1.5 rounded-md text-text-muted hover:text-text-primary hover:bg-bg-elevated transition-colors"
            title="Chiudi">
            <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>
      </div>
      {/* Canvas area */}
      <div ref={containerRef} className="flex-1 overflow-auto p-4 flex justify-center">
        {loading && (
          <div className="flex items-center justify-center py-20">
            <div className="flex flex-col items-center gap-3">
              <div className="w-5 h-5 border-2 border-teal/30 border-t-teal rounded-full animate-spin" />
              <span className="text-[11px] font-mono text-text-muted">Caricamento p.{page}...</span>
            </div>
          </div>
        )}
        {error && (
          <div className="flex items-center justify-center py-20">
            <span className="text-[12px] font-mono text-danger">{error}</span>
          </div>
        )}
        <canvas
          ref={canvasRef}
          className={`rounded-lg shadow-lg shadow-black/20 ${loading ? 'hidden' : ''}`}
          style={{ maxWidth: '100%' }}
        />
      </div>
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
  const [viewingPage, setViewingPage] = useState<number | null>(null)
  // Projects
  const [projects, setProjects] = useState<Project[]>([])
  const [expandedProjects, setExpandedProjects] = useState<Set<string>>(new Set())
  const [activeProject, setActiveProject] = useState<string | null>(null)
  const [creatingProject, setCreatingProject] = useState(false)
  const [newProjectName, setNewProjectName] = useState('')
  const [newProjectColor, setNewProjectColor] = useState('#4E8EA7')
  const [editingProject, setEditingProject] = useState<string | null>(null)
  const [editProjectName, setEditProjectName] = useState('')
  const [moveMenuConv, setMoveMenuConv] = useState<string | null>(null)
  const [renamingConv, setRenamingConv] = useState<string | null>(null)
  const [renameConvTitle, setRenameConvTitle] = useState('')
  const messagesEndRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLTextAreaElement>(null)
  const router = useRouter()

  useEffect(() => {
    fetch('/api/documents')
      .then(r => {
        if (r.status === 401) { router.push('/login'); throw new Error('unauthorized') }
        return r.json()
      })
      .then(docs => {
        if (docs && docs.length > 0) {
          const doc = { id: docs[0].id, filename: docs[0].filename, chunks: docs[0].chunks }
          setDocInfo(doc)
          // Load conversations and projects in parallel
          Promise.all([
            fetch(`/api/conversations?document_id=${doc.id}`).then(r => r.json()),
            fetch('/api/projects').then(r => r.json()),
          ]).then(([convs, projs]) => {
            setConversations(convs || [])
            setProjects(projs || [])
          }).catch(() => {})
        }
      })
      .catch(() => {})
      .finally(() => setLoadingDoc(false))
  }, [router])

  const scrollToBottom = useCallback(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [])

  useEffect(() => { scrollToBottom() }, [messages, scrollToBottom])

  // Close move menu on outside click
  useEffect(() => {
    if (!moveMenuConv) return
    const handleClick = () => setMoveMenuConv(null)
    const timer = setTimeout(() => document.addEventListener('click', handleClick), 0)
    return () => { clearTimeout(timer); document.removeEventListener('click', handleClick) }
  }, [moveMenuConv])

  const loadConversation = async (convId: string) => {
    setActiveConversation(convId)
    setLoadingMessages(true)
    setMessages([])
    setMoveMenuConv(null)
    try {
      const res = await fetch(`/api/conversations/messages?conversation_id=${convId}`)
      const msgs = await res.json()
      setMessages(msgs.map((m: Message & { tool_calls?: string[] }) => ({
        role: m.role,
        content: m.content || '',
        citations: m.citations || [],
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

  const createProject = async () => {
    if (!newProjectName.trim()) return
    const res = await fetch('/api/projects', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: newProjectName.trim(), color: newProjectColor }),
    })
    if (!res.ok) {
      const err = await res.json().catch(() => ({ error: 'Unknown error' }))
      console.error('Failed to create project:', err)
      return
    }
    const proj = await res.json()
    setProjects(prev => [proj, ...prev])
    setExpandedProjects(prev => { const next = new Set(prev); next.add(proj.id); return next })
    setCreatingProject(false)
    setNewProjectName('')
    setNewProjectColor('#4E8EA7')
  }

  const deleteProject = async (id: string, e: React.MouseEvent) => {
    e.stopPropagation()
    await fetch('/api/projects', {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id }),
    })
    setProjects(prev => prev.filter(p => p.id !== id))
    // Conversations become unassigned (DB handles via ON DELETE SET NULL)
    setConversations(prev => prev.map(c => c.project_id === id ? { ...c, project_id: null } : c))
    if (activeProject === id) setActiveProject(null)
  }

  const renameProject = async (id: string) => {
    if (!editProjectName.trim()) { setEditingProject(null); return }
    await fetch('/api/projects', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id, name: editProjectName.trim() }),
    })
    setProjects(prev => prev.map(p => p.id === id ? { ...p, name: editProjectName.trim() } : p))
    setEditingProject(null)
  }

  const moveConversation = async (convId: string, projectId: string | null) => {
    await fetch('/api/conversations', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: convId, project_id: projectId }),
    })
    setConversations(prev => prev.map(c => c.id === convId ? { ...c, project_id: projectId } : c))
    setMoveMenuConv(null)
    if (projectId) setExpandedProjects(prev => { const next = new Set(prev); next.add(projectId); return next })
  }

  const toggleProject = (id: string) => {
    setExpandedProjects(prev => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  const renameConversation = async (convId: string) => {
    if (!renameConvTitle.trim()) { setRenamingConv(null); return }
    await fetch('/api/conversations', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: convId, title: renameConvTitle.trim() }),
    })
    setConversations(prev => prev.map(c => c.id === convId ? { ...c, title: renameConvTitle.trim() } : c))
    setRenamingConv(null)
  }

  const sendMessage = async (text: string) => {
    if (!text.trim() || !docInfo || isLoading) return

    const userMessage: Message = { role: 'user', content: text.trim() }
    setMessages(prev => [...prev, userMessage, { role: 'assistant', content: '', citations: [], toolCalls: [] }])
    setInput('')
    setIsLoading(true)

    let convId = activeConversation

    if (!convId) {
      try {
        const res = await fetch('/api/conversations', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ document_id: docInfo.id, project_id: activeProject }),
        })
        const conv = await res.json()
        convId = conv.id
        setActiveConversation(conv.id)
        setConversations(prev => [conv, ...prev])
      } catch {
        setMessages(prev => prev.filter(m => !(m.role === 'assistant' && m.content === '')))
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

      const updateMessage = () => {
        setMessages(prev => {
          const u = [...prev]
          u[u.length - 1] = { role: 'assistant', content: assistantText, citations, toolCalls: [...currentToolCalls] }
          return u
        })
      }

      let buffer = ''
      const processLines = (raw: string) => {
        const lines = raw.split('\n\n')
        const remainder = lines.pop() || ''
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
            } else if (data.type === 'error') {
              console.error('[SSE] Backend error:', data.error)
              assistantText = `Errore: ${data.error}`
              updateMessage()
            } else if (data.type === 'title_updated') {
              setConversations(prev =>
                prev.map(c => c.id === convId ? { ...c, title: data.title } : c)
              )
            }
          } catch (e) {
            console.warn('[SSE] Parse error:', e, 'line:', line)
          }
        }
        return remainder
      }

      while (true) {
        const { done, value } = await reader.read()
        if (done) break
        buffer += decoder.decode(value, { stream: true })
        buffer = processLines(buffer)
      }
      // Flush decoder and process any remaining buffer
      buffer += decoder.decode()
      if (buffer.trim()) {
        processLines(buffer + '\n\n')
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
    if (!text) return null
    const processed = text.replace(/\[p\.(\d+(?:-\d+)?)\]/g, '`PAGE_REF:$1`')
    return (
      <div className={isStreaming ? 'streaming-cursor' : ''}>
        <ReactMarkdown
          remarkPlugins={[remarkGfm]}
          components={{
            code: ({ children }) => {
              const str = String(children)
              const match = str.match(/^PAGE_REF:(\d+(?:-\d+)?)$/)
              if (match) {
                const firstPage = Number(match[1].split('-')[0])
                return <span className="citation-badge" onClick={() => setViewingPage(firstPage)}>[{match[1]}]</span>
              }
              return <code className="bg-bg-elevated border border-border rounded px-1.5 py-0.5 text-[13px] font-mono text-teal">{children}</code>
            },
            strong: ({ children }) => <strong className="font-semibold text-text-primary">{children}</strong>,
            em: ({ children }) => <em className="text-text-secondary">{children}</em>,
            p: ({ children }) => <p className="mb-2.5 last:mb-0 leading-relaxed">{children}</p>,
            ul: ({ children }) => <ul className="list-disc list-inside mb-2.5 space-y-1 text-text-primary">{children}</ul>,
            ol: ({ children }) => <ol className="list-decimal list-inside mb-2.5 space-y-1 text-text-primary">{children}</ol>,
            li: ({ children }) => <li className="leading-relaxed">{children}</li>,
            h3: ({ children }) => <h3 className="font-heading font-bold text-text-primary mt-4 mb-1.5 text-base">{children}</h3>,
            h4: ({ children }) => <h4 className="font-semibold text-text-primary mt-3 mb-1 text-sm">{children}</h4>,
            table: ({ children }) => (
              <div className="overflow-x-auto my-3 rounded-lg border border-border">
                <table className="w-full text-xs border-collapse">{children}</table>
              </div>
            ),
            thead: ({ children }) => <thead className="bg-bg-elevated border-b border-border-bright">{children}</thead>,
            th: ({ children }) => <th className="text-left px-3 py-2 font-mono text-text-secondary text-[11px] uppercase tracking-wider">{children}</th>,
            td: ({ children }) => <td className="px-3 py-2 border-t border-border text-text-primary text-[13px]">{children}</td>,
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
        fixed lg:relative z-30 h-full w-[280px] flex flex-col
        bg-bg-card border-r border-border
        transition-transform duration-300 ease-out
        ${sidebarOpen ? 'translate-x-0 animate-slide-in-left lg:animate-none' : '-translate-x-full lg:translate-x-0 lg:w-0 lg:border-0 lg:overflow-hidden'}
      `}>
        {/* Brand accent left border */}
        <div className="absolute left-0 top-0 bottom-0 w-[3px] bg-gradient-to-b from-brand-red via-teal/60 to-teal/15" />

        {/* Sidebar header */}
        <div className="pl-4 pr-3 pt-3 pb-3 border-b border-border">
          <div className="flex items-center justify-between mb-3">
            <img src="/logo.png" alt="Scenari Immobiliari" className="h-[28px] sm:h-[34px] w-auto" />
            <button onClick={() => setSidebarOpen(false)} className="lg:hidden p-1 text-text-muted hover:text-text-primary transition-colors">
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>

          {/* New thread button */}
          <button
            onClick={() => { setActiveProject(null); startNewChat() }}
            className="w-full flex items-center justify-center gap-2 px-3 py-2 rounded-lg
              border border-teal/40 hover:bg-teal hover:border-teal
              text-teal hover:text-white
              transition-all duration-200 group"
          >
            <span className="text-[12px] font-mono font-medium uppercase tracking-[0.1em]">+ New Thread</span>
          </button>
        </div>

        {/* Search */}
        <div className="px-3 py-2">
          <input
            type="text"
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
            placeholder="Cerca..."
            className="w-full bg-bg-elevated/60 border border-border rounded-md px-3 py-1.5
              text-[12px] text-text-primary placeholder-text-muted font-mono
              focus:outline-none focus:border-teal/30 transition-colors"
          />
        </div>

        {/* Scrollable content */}
        <div className="flex-1 overflow-y-auto px-2 py-1">

          {/* ---- PROJECTS SECTION ---- */}
          <div className="mb-2">
            <div className="flex items-center justify-between px-2 py-1.5">
              <span className="text-[11px] font-mono text-text-muted uppercase tracking-[0.15em]">Progetti</span>
              <button
                onClick={() => setCreatingProject(true)}
                className="p-0.5 rounded text-text-muted hover:text-teal hover:bg-teal/10 transition-colors"
                title="Nuovo progetto"
              >
                <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
                </svg>
              </button>
            </div>

            {/* Create project form */}
            {creatingProject && (
              <div className="mx-2 mb-2 p-2.5 bg-bg-elevated rounded-lg border border-border-bright animate-fade-in">
                <input
                  autoFocus
                  value={newProjectName}
                  onChange={e => setNewProjectName(e.target.value)}
                  onKeyDown={e => { if (e.key === 'Enter') createProject(); if (e.key === 'Escape') setCreatingProject(false) }}
                  placeholder="Nome progetto..."
                  className="w-full bg-transparent text-[13px] text-text-primary placeholder-text-muted
                    focus:outline-none mb-2.5 font-sans"
                />
                <div className="flex items-center gap-2 mb-2.5">
                  {PROJECT_COLORS.map(c => (
                    <button type="button" key={c} onClick={() => setNewProjectColor(c)}
                      className={`w-6 h-6 rounded-full transition-all ${newProjectColor === c ? 'ring-2 ring-offset-2 ring-offset-bg-elevated scale-110' : 'hover:scale-105'}`}
                      style={{ background: c, ['--tw-ring-color' as string]: c }}
                    />
                  ))}
                </div>
                <div className="flex gap-1.5">
                  <button type="button" onClick={createProject}
                    className="flex-1 text-[11px] font-mono uppercase tracking-wider py-1.5 rounded-md bg-teal text-white hover:bg-teal-dim transition-colors">
                    Crea
                  </button>
                  <button type="button" onClick={() => { setCreatingProject(false); setNewProjectName('') }}
                    className="flex-1 text-[11px] font-mono uppercase tracking-wider py-1.5 rounded-md border border-border text-text-muted hover:text-text-primary transition-colors">
                    Annulla
                  </button>
                </div>
              </div>
            )}

            {/* Project list */}
            {projects.map(proj => {
              const projConvs = filteredConversations.filter(c => c.project_id === proj.id)
              const isExpanded = expandedProjects.has(proj.id)
              const isActive = activeProject === proj.id

              return (
                <div key={proj.id} className="mb-0.5">
                  {/* Project header */}
                  <div
                    className={`group flex items-center gap-2 px-2 py-1.5 rounded-md cursor-pointer transition-all
                      ${isActive ? 'bg-bg-elevated/80' : 'hover:bg-bg-elevated/50'}`}
                    onClick={() => toggleProject(proj.id)}
                  >
                    {/* Expand arrow */}
                    <svg className={`w-3 h-3 text-text-muted transition-transform flex-shrink-0 ${isExpanded ? 'rotate-90' : ''}`}
                      fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M8.25 4.5l7.5 7.5-7.5 7.5" />
                    </svg>
                    {/* Color dot */}
                    <span className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ background: proj.color }} />
                    {/* Name */}
                    {editingProject === proj.id ? (
                      <input
                        autoFocus
                        value={editProjectName}
                        onChange={e => setEditProjectName(e.target.value)}
                        onKeyDown={e => { if (e.key === 'Enter') renameProject(proj.id); if (e.key === 'Escape') setEditingProject(null) }}
                        onBlur={() => renameProject(proj.id)}
                        onClick={e => e.stopPropagation()}
                        className="flex-1 min-w-0 bg-transparent text-[13px] text-text-primary focus:outline-none font-sans"
                      />
                    ) : (
                      <span className="flex-1 min-w-0 truncate text-[13px] font-sans text-text-primary">{proj.name}</span>
                    )}
                    {/* Count badge */}
                    {projConvs.length > 0 && (
                      <span className="text-[10px] font-mono text-text-muted bg-bg-elevated rounded-full px-1.5 py-0.5 flex-shrink-0">
                        {projConvs.length}
                      </span>
                    )}
                    {/* Actions */}
                    <div className="opacity-0 group-hover:opacity-100 flex items-center gap-0.5 flex-shrink-0 transition-opacity">
                      {/* New thread in project */}
                      <button onClick={e => { e.stopPropagation(); setActiveProject(proj.id); setExpandedProjects(prev => { const next = new Set(prev); next.add(proj.id); return next }); startNewChat() }}
                        className="p-0.5 rounded text-text-muted hover:text-teal transition-colors" title="Nuovo thread nel progetto">
                        <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                          <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
                        </svg>
                      </button>
                      {/* Rename */}
                      <button onClick={e => { e.stopPropagation(); setEditingProject(proj.id); setEditProjectName(proj.name) }}
                        className="p-0.5 rounded text-text-muted hover:text-teal transition-colors" title="Rinomina">
                        <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                          <path strokeLinecap="round" strokeLinejoin="round" d="m16.862 4.487 1.687-1.688a1.875 1.875 0 112.652 2.652L6.832 19.82a4.5 4.5 0 01-1.897 1.13l-2.685.8.8-2.685a4.5 4.5 0 011.13-1.897L16.863 4.487z" />
                        </svg>
                      </button>
                      {/* Delete */}
                      <button onClick={e => deleteProject(proj.id, e)}
                        className="p-0.5 rounded text-text-muted hover:text-danger transition-colors" title="Elimina progetto">
                        <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                          <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                        </svg>
                      </button>
                    </div>
                  </div>

                  {/* Conversations in this project */}
                  {isExpanded && (
                    <div className="ml-4 pl-2 border-l-2 space-y-0.5 mt-0.5 mb-1" style={{ borderColor: proj.color + '30' }}>
                      {projConvs.length === 0 && (
                        <p className="text-[11px] text-text-muted py-2 px-2 font-mono">Nessun thread</p>
                      )}
                      {projConvs.map(conv => (
                        <div key={conv.id} className="relative">
                          {renamingConv === conv.id ? (
                            <div className="pl-3 pr-2 py-1.5 flex items-center gap-2">
                              <span className="flex-shrink-0 w-1 h-1 rounded-full bg-teal" />
                              <input
                                autoFocus
                                value={renameConvTitle}
                                onChange={e => setRenameConvTitle(e.target.value)}
                                onKeyDown={e => { if (e.key === 'Enter') renameConversation(conv.id); if (e.key === 'Escape') setRenamingConv(null) }}
                                onBlur={() => renameConversation(conv.id)}
                                className="flex-1 min-w-0 bg-transparent text-[12px] text-text-primary focus:outline-none font-sans"
                              />
                            </div>
                          ) : (
                          <button
                            onClick={() => loadConversation(conv.id)}
                            className={`conv-item w-full text-left pl-3 pr-2 py-1.5 rounded-md
                              group flex items-center gap-2
                              ${activeConversation === conv.id
                                ? 'active bg-teal/[0.08] text-text-primary'
                                : 'text-text-secondary hover:bg-bg-elevated/50 hover:text-text-primary'
                              }`}
                          >
                            <span className={`flex-shrink-0 w-1 h-1 rounded-full ${activeConversation === conv.id ? 'bg-teal' : 'bg-text-muted/30'}`} />
                            <span className="flex-1 min-w-0 truncate text-[12px] font-sans">{conv.title}</span>
                            <div className="opacity-0 group-hover:opacity-100 flex items-center gap-0.5 flex-shrink-0 transition-opacity">
                              {/* Rename */}
                              <button onClick={e => { e.stopPropagation(); setRenamingConv(conv.id); setRenameConvTitle(conv.title) }}
                                className="p-0.5 rounded text-text-muted hover:text-teal transition-colors" title="Rinomina">
                                <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                                  <path strokeLinecap="round" strokeLinejoin="round" d="m16.862 4.487 1.687-1.688a1.875 1.875 0 112.652 2.652L6.832 19.82a4.5 4.5 0 01-1.897 1.13l-2.685.8.8-2.685a4.5 4.5 0 011.13-1.897L16.863 4.487z" />
                                </svg>
                              </button>
                              {/* Move */}
                              <button onClick={e => { e.stopPropagation(); setMoveMenuConv(moveMenuConv === conv.id ? null : conv.id) }}
                                className="p-0.5 rounded text-text-muted hover:text-teal transition-colors" title="Sposta">
                                <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                                  <path strokeLinecap="round" strokeLinejoin="round" d="M7.5 21L3 16.5m0 0L7.5 12M3 16.5h13.5m0-13.5L21 7.5m0 0L16.5 12M21 7.5H7.5" />
                                </svg>
                              </button>
                              {/* Delete */}
                              <button onClick={e => deleteConversation(conv.id, e)}
                                className="p-0.5 rounded text-text-muted hover:text-danger transition-colors">
                                <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                                  <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                                </svg>
                              </button>
                            </div>
                          </button>
                          )}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )
            })}
          </div>

          {/* ---- UNGROUPED CONVERSATIONS ---- */}
          {(() => {
            const ungrouped = filteredConversations.filter(c => !c.project_id)
            const ungroupedGrouped = groupConversationsByDate(ungrouped)
            if (ungrouped.length === 0 && projects.length > 0) return null

            return (
              <div className="mt-1">
                {projects.length > 0 && (
                  <div className="px-2 py-1.5">
                    <span className="text-[11px] font-mono text-text-muted uppercase tracking-[0.15em]">Threads</span>
                  </div>
                )}

                {ungroupedGrouped.length === 0 && !loadingDoc && (
                  <div className="px-3 py-6 text-center">
                    <p className="text-[12px] text-text-muted font-mono">Nessun thread</p>
                  </div>
                )}

                {ungroupedGrouped.map(group => (
                  <div key={group.label} className="mb-2">
                    <p className="px-3 py-1 text-[10px] font-mono text-text-muted uppercase tracking-[0.15em]">
                      {group.label}
                    </p>
                    <div className="space-y-0.5">
                      {group.conversations.map(conv => (
                        <div key={conv.id} className="relative">
                          {renamingConv === conv.id ? (
                            <div className="pl-4 pr-2 py-2 flex items-center gap-2.5">
                              <span className="flex-shrink-0 w-1.5 h-1.5 rounded-full bg-teal border border-teal" />
                              <input
                                autoFocus
                                value={renameConvTitle}
                                onChange={e => setRenameConvTitle(e.target.value)}
                                onKeyDown={e => { if (e.key === 'Enter') renameConversation(conv.id); if (e.key === 'Escape') setRenamingConv(null) }}
                                onBlur={() => renameConversation(conv.id)}
                                className="flex-1 min-w-0 bg-transparent text-[13px] text-text-primary focus:outline-none font-sans"
                              />
                            </div>
                          ) : (
                          <button
                            onClick={() => loadConversation(conv.id)}
                            className={`conv-item w-full text-left pl-4 pr-2 py-2 rounded-md
                              group flex items-center gap-2.5
                              ${activeConversation === conv.id
                                ? 'active bg-teal/[0.08] text-text-primary'
                                : 'text-text-secondary hover:bg-bg-elevated/50 hover:text-text-primary'
                              }`}
                          >
                            <span className={`flex-shrink-0 w-1.5 h-1.5 rounded-full border
                              ${activeConversation === conv.id ? 'bg-teal border-teal' : 'border-text-muted/30'}`}
                            />
                            <div className="flex-1 min-w-0">
                              <span className="block truncate text-[13px] font-sans">{conv.title}</span>
                              <span className="block text-[11px] font-mono text-text-muted mt-0.5">
                                {new Date(conv.updated_at).toLocaleDateString('it-IT', { day: '2-digit', month: '2-digit' })}
                              </span>
                            </div>
                            <div className="opacity-0 group-hover:opacity-100 flex items-center gap-0.5 flex-shrink-0 transition-opacity">
                              {/* Rename */}
                              <button onClick={e => { e.stopPropagation(); setRenamingConv(conv.id); setRenameConvTitle(conv.title) }}
                                className="p-0.5 rounded text-text-muted hover:text-teal transition-colors" title="Rinomina">
                                <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                                  <path strokeLinecap="round" strokeLinejoin="round" d="m16.862 4.487 1.687-1.688a1.875 1.875 0 112.652 2.652L6.832 19.82a4.5 4.5 0 01-1.897 1.13l-2.685.8.8-2.685a4.5 4.5 0 011.13-1.897L16.863 4.487z" />
                                </svg>
                              </button>
                              {/* Move to project */}
                              {projects.length > 0 && (
                                <button onClick={e => { e.stopPropagation(); setMoveMenuConv(moveMenuConv === conv.id ? null : conv.id) }}
                                  className="p-0.5 rounded text-text-muted hover:text-teal transition-colors" title="Sposta in progetto">
                                  <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                                    <path strokeLinecap="round" strokeLinejoin="round" d="M7.5 21L3 16.5m0 0L7.5 12M3 16.5h13.5m0-13.5L21 7.5m0 0L16.5 12M21 7.5H7.5" />
                                  </svg>
                                </button>
                              )}
                              {/* Delete */}
                              <button onClick={e => deleteConversation(conv.id, e)}
                                className="p-0.5 rounded text-text-muted hover:text-danger transition-all flex-shrink-0 cursor-pointer">
                                <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                                  <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                                </svg>
                              </button>
                            </div>
                          </button>
                          )}
                        </div>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            )
          })()}
        </div>

        {/* Sidebar footer */}
        <div className="px-3 py-3 border-t border-border space-y-2">
          {docInfo && (
            <div className="flex items-center gap-2 px-2 py-1.5">
              <div className="w-1.5 h-1.5 rounded-full bg-success animate-pulse flex-shrink-0" />
              <span className="text-[11px] text-success font-mono uppercase tracking-[0.1em]">
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
            <span className="text-[12px] font-mono uppercase tracking-[0.1em]">Esci</span>
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
            <span className="text-[12px] font-mono text-text-secondary uppercase tracking-[0.12em]">
              {activeConversation
                ? (conversations.find(c => c.id === activeConversation)?.title || 'THREAD').toUpperCase()
                : 'NUOVA CONVERSAZIONE'}
            </span>
          </div>

          <div className="hidden sm:flex items-center gap-3 px-3 py-1 rounded-full border border-border bg-bg-card">
            <div className="relative flex h-2.5 w-2.5">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-success/60 opacity-75"></span>
              <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-success"></span>
            </div>
            <span className="text-[13px] font-mono text-brand-red uppercase tracking-[0.1em]"><strong className="font-bold">AI</strong> Assistant</span>
          </div>
        </header>

        {/* Chat area */}
        <div className="flex-1 overflow-y-auto relative z-10">
          <div className="max-w-[760px] mx-auto px-4 sm:px-6 py-6">

            {/* ---- EMPTY STATE ---- */}
            {messages.length === 0 && !loadingDoc && !loadingMessages && (
              <div className="flex flex-col items-center justify-center min-h-[65vh] text-center px-4 animate-fade-up">

                <div className="relative mb-6 flex flex-col items-center">
                  <div className="mb-2">
                    <AnimatedHouseIcon size={64} animate={true} restPause={1000} holdPause={2000} />
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
              <div className="flex flex-col items-center justify-center min-h-[60vh]">
                <AnimatedHouseIcon size={64} animate={true} restPause={1000} holdPause={2000} />
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
                          {msg.content === '' && isLoading && i === messages.length - 1 ? (
                            <ThinkingLine />
                          ) : (
                            <div className="text-[15px] leading-[1.7] text-text-primary font-sans">
                              {renderMarkdown(msg.content, isLoading && i === messages.length - 1 && msg.content !== '')}
                            </div>
                          )}

                          {/* Report source */}
                          {msg.citations && msg.citations.length > 0 && docInfo && (
                            <div className="mt-2 flex items-center gap-1.5 px-1">
                              <svg className="w-3 h-3 text-text-muted flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                                <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375h-1.5A1.125 1.125 0 0113.5 7.125v-1.5a3.375 3.375 0 00-3.375-3.375H8.25m2.25 0H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 00-9-9z" />
                              </svg>
                              <span className="text-[11px] font-mono text-text-muted truncate">
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
                            className="mt-1.5 ml-1 flex items-center gap-1 text-[11px] text-text-muted
                              hover:text-text-secondary transition-colors font-mono uppercase tracking-wider"
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
            <p className="text-center text-[11px] text-text-muted mt-2.5">
              Scenari Immobiliari AI Assistant &middot; Risposte basate esclusivamente sui documenti indicizzati
            </p>
          </div>
        </div>
      </main>

      {/* ============ MOVE TO PROJECT MODAL ============ */}
      {moveMenuConv && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm" onClick={() => setMoveMenuConv(null)}>
          <div className="bg-bg-card border border-border-bright rounded-xl shadow-2xl w-[280px] overflow-hidden animate-fade-in" onClick={e => e.stopPropagation()}>
            <div className="px-4 py-3 border-b border-border flex items-center justify-between">
              <span className="text-[13px] font-sans font-semibold text-text-primary">Sposta in progetto</span>
              <button type="button" onClick={() => setMoveMenuConv(null)} className="p-0.5 rounded text-text-muted hover:text-text-primary transition-colors">
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
            <div className="py-1 max-h-[300px] overflow-y-auto">
              {/* Remove from project */}
              {conversations.find(c => c.id === moveMenuConv)?.project_id && (
                <button type="button" onClick={() => moveConversation(moveMenuConv, null)}
                  className="w-full text-left px-4 py-2.5 text-[13px] font-sans text-text-secondary hover:bg-bg-elevated hover:text-text-primary transition-colors flex items-center gap-3">
                  <span className="w-3 h-3 rounded-full flex-shrink-0 border-2 border-text-muted/30" />
                  Nessun progetto
                </button>
              )}
              {projects.filter(p => p.id !== conversations.find(c => c.id === moveMenuConv)?.project_id).map(p => (
                <button type="button" key={p.id} onClick={() => moveConversation(moveMenuConv, p.id)}
                  className="w-full text-left px-4 py-2.5 text-[13px] font-sans text-text-secondary hover:bg-bg-elevated hover:text-text-primary transition-colors flex items-center gap-3">
                  <span className="w-3 h-3 rounded-full flex-shrink-0" style={{ background: p.color }} />
                  {p.name}
                </button>
              ))}
              {projects.length === 0 && (
                <p className="px-4 py-4 text-[12px] text-text-muted text-center font-mono">Crea un progetto prima</p>
              )}
            </div>
          </div>
        </div>
      )}

      {/* ============ PDF VIEWER PANEL ============ */}
      {viewingPage !== null && docInfo && (
        <PdfPageViewer
          documentId={docInfo.id}
          page={viewingPage}
          onClose={() => setViewingPage(null)}
          onPageChange={setViewingPage}
        />
      )}
    </div>
  )
}

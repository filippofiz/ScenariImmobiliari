'use client'

import { useState } from 'react'

interface Citation {
  page_number: number
  excerpt: string
  chunk_id: string
  similarity: number
}

export default function CitationCard({ citation }: { citation: Citation }) {
  const [expanded, setExpanded] = useState(false)

  return (
    <div
      className="border border-border rounded-lg overflow-hidden transition-all duration-200 hover:border-accent/40"
    >
      <button
        onClick={() => setExpanded(!expanded)}
        className="w-full flex items-center justify-between px-3 py-2 text-left"
      >
        <div className="flex items-center gap-2">
          <span className="font-mono text-xs bg-accent/15 text-accent px-2 py-0.5 rounded">
            p.{citation.page_number}
          </span>
          <span className="text-xs text-text-muted truncate max-w-[200px]">
            {citation.excerpt.slice(0, 60)}...
          </span>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-xs text-text-muted font-mono">
            {(citation.similarity * 100).toFixed(0)}%
          </span>
          <svg
            className={`w-3 h-3 text-text-muted transition-transform ${expanded ? 'rotate-180' : ''}`}
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
          >
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
          </svg>
        </div>
      </button>
      {expanded && (
        <div className="px-3 pb-3 border-t border-border">
          <p className="text-xs text-text-muted leading-relaxed mt-2 font-sans">
            {citation.excerpt}
          </p>
        </div>
      )}
    </div>
  )
}

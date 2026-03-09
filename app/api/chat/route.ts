import { NextRequest } from 'next/server'
import { anthropic, SYSTEM_PROMPT } from '@/app/lib/claude'
import { getQueryEmbedding } from '@/app/lib/voyage'
import { supabaseAdmin } from '@/app/lib/supabase'

export const maxDuration = 60

interface ChatMessage {
  role: 'user' | 'assistant'
  content: string
}

interface MatchedChunk {
  id: string
  content: string
  page_number: number
  similarity: number
}

export async function POST(request: NextRequest) {
  const body = await request.json()
  const { message, document_id, history = [] } = body as {
    message: string
    document_id: string
    history: ChatMessage[]
  }

  if (!message || !document_id) {
    return Response.json({ error: 'message and document_id required' }, { status: 400 })
  }

  // 1. Embed the user query
  const queryEmbedding = await getQueryEmbedding(message)

  // 2. Similarity search via Supabase RPC
  const { data: chunks, error: matchError } = await supabaseAdmin.rpc('match_chunks', {
    query_embedding: JSON.stringify(queryEmbedding),
    match_count: 8,
    doc_id: document_id,
  })

  if (matchError) {
    return Response.json({ error: matchError.message }, { status: 500 })
  }

  const matchedChunks = (chunks || []) as MatchedChunk[]

  // 3. Build context from retrieved chunks
  const contextParts = matchedChunks.map(
    (c, i) => `[Fonte ${i + 1} - Pagina ${c.page_number}]\n${c.content}`
  )
  const context = contextParts.join('\n\n---\n\n')

  // 4. Build messages for Claude
  const recentHistory = history.slice(-10)
  const messages: ChatMessage[] = [
    ...recentHistory,
    {
      role: 'user',
      content: `Contesto dai documenti:\n\n${context}\n\n---\n\nDomanda dell'utente: ${message}`,
    },
  ]

  // 5. Build citations array
  const citations = matchedChunks.map(c => ({
    page_number: c.page_number,
    excerpt: c.content.slice(0, 200) + (c.content.length > 200 ? '...' : ''),
    chunk_id: c.id,
    similarity: Math.round(c.similarity * 100) / 100,
  }))

  // 6. Stream response from Claude
  const encoder = new TextEncoder()
  const stream = new ReadableStream({
    async start(controller) {
      try {
        // Send citations first
        controller.enqueue(
          encoder.encode(`data: ${JSON.stringify({ type: 'citations', citations })}\n\n`)
        )

        // Stream Claude response
        const response = anthropic.messages.stream({
          model: 'claude-sonnet-4-5-20250514',
          max_tokens: 4096,
          system: SYSTEM_PROMPT,
          messages,
        })

        for await (const event of response) {
          if (
            event.type === 'content_block_delta' &&
            event.delta.type === 'text_delta'
          ) {
            controller.enqueue(
              encoder.encode(
                `data: ${JSON.stringify({ type: 'text', text: event.delta.text })}\n\n`
              )
            )
          }
        }

        controller.enqueue(
          encoder.encode(`data: ${JSON.stringify({ type: 'done' })}\n\n`)
        )
      } catch (err) {
        controller.enqueue(
          encoder.encode(
            `data: ${JSON.stringify({ type: 'error', error: String(err) })}\n\n`
          )
        )
      } finally {
        controller.close()
      }
    },
  })

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive',
    },
  })
}

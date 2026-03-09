import { NextRequest } from 'next/server'
import { anthropic, SYSTEM_PROMPT } from '@/app/lib/claude'
import { getQueryEmbedding } from '@/app/lib/voyage'
import { supabaseAdmin } from '@/app/lib/supabase'
import { PDFDocument } from 'pdf-lib'
import Anthropic from '@anthropic-ai/sdk'

export const maxDuration = 60

interface ChatMessage {
  role: 'user' | 'assistant'
  content: string
}

const tools: Anthropic.Messages.Tool[] = [
  {
    name: 'search_chunks',
    description: 'Cerca frammenti di testo nel documento usando la similarità semantica. Usa questo strumento per trovare informazioni rilevanti. Puoi chiamarlo più volte con query diverse per approfondire.',
    input_schema: {
      type: 'object' as const,
      properties: {
        query: {
          type: 'string',
          description: 'La query di ricerca semantica. Sii specifico per trovare risultati migliori.',
        },
        count: {
          type: 'number',
          description: 'Numero di risultati da restituire (default 8, max 15)',
        },
      },
      required: ['query'],
    },
  },
  {
    name: 'view_pages',
    description: 'Visualizza le pagine originali del PDF. Usa questo per vedere grafici, tabelle, immagini e layout originale. Utile quando i frammenti di testo non bastano o quando vuoi vedere un grafico citato nel testo.',
    input_schema: {
      type: 'object' as const,
      properties: {
        page_numbers: {
          type: 'array',
          items: { type: 'number' },
          description: 'Numeri delle pagine da visualizzare (max 5 alla volta)',
        },
      },
      required: ['page_numbers'],
    },
  },
]

async function searchChunks(query: string, count: number, documentId: string) {
  const embedding = await getQueryEmbedding(query)
  const { data: chunks, error } = await supabaseAdmin.rpc('match_chunks', {
    query_embedding: JSON.stringify(embedding),
    match_count: Math.min(count, 15),
    doc_id: documentId,
  })
  if (error) throw new Error(error.message)
  return (chunks || []).map((c: { id: string; content: string; page_number: number; similarity: number }) => ({
    page_number: c.page_number,
    content: c.content,
    similarity: Math.round(c.similarity * 100) / 100,
  }))
}

async function viewPages(pageNumbers: number[], documentId: string): Promise<Anthropic.Messages.ToolResultBlockParam['content']> {
  const { data: doc } = await supabaseAdmin
    .from('documents')
    .select('pdf_path')
    .eq('id', documentId)
    .single()
  if (!doc?.pdf_path) throw new Error('PDF non trovato')

  const { data: pdfData, error } = await supabaseAdmin.storage.from('pdfs').download(doc.pdf_path)
  if (error || !pdfData) throw new Error('Errore download PDF')

  const pdfBytes = await pdfData.arrayBuffer()
  const srcDoc = await PDFDocument.load(pdfBytes)
  const totalPages = srcDoc.getPageCount()
  const pagesToExtract = pageNumbers.slice(0, 5).filter(p => p >= 1 && p <= totalPages)

  const results: Anthropic.Messages.ToolResultBlockParam['content'] = []
  for (const pageNum of pagesToExtract) {
    const singlePageDoc = await PDFDocument.create()
    const [copiedPage] = await singlePageDoc.copyPages(srcDoc, [pageNum - 1])
    singlePageDoc.addPage(copiedPage)
    const singlePageBytes = await singlePageDoc.save()
    const base64 = Buffer.from(singlePageBytes).toString('base64')

    results.push({
      type: 'document',
      source: { type: 'base64', media_type: 'application/pdf', data: base64 },
    })
    results.push({ type: 'text', text: `[Pagina ${pageNum} del documento]` })
  }
  return results
}

export async function POST(request: NextRequest) {
  const body = await request.json()
  const { message, document_id, history = [], conversation_id } = body as {
    message: string
    document_id: string
    history: ChatMessage[]
    conversation_id?: string
  }

  if (!message || !document_id) {
    return Response.json({ error: 'message and document_id required' }, { status: 400 })
  }

  const encoder = new TextEncoder()
  const stream = new ReadableStream({
    async start(controller) {
      function send(data: Record<string, unknown>) {
        controller.enqueue(encoder.encode(`data: ${JSON.stringify(data)}\n\n`))
      }

      try {
        const recentHistory = history.slice(-10)
        const messages: Anthropic.Messages.MessageParam[] = [
          ...recentHistory.map(m => ({
            role: m.role as 'user' | 'assistant',
            content: m.content,
          })),
          { role: 'user', content: message },
        ]

        // Save user message if conversation exists
        if (conversation_id) {
          await supabaseAdmin.from('messages').insert({
            conversation_id,
            role: 'user',
            content: message,
          })
        }

        let loopCount = 0
        const maxLoops = 8
        const allCitedPages = new Set<number>()
        const allToolCalls: string[] = []
        let finalText = ''

        const TOOL_SYSTEM = SYSTEM_PROMPT + '\n\nHai a disposizione strumenti per cercare nel documento e visualizzare le pagine originali. Usa search_chunks per trovare informazioni testuali e view_pages per vedere grafici, tabelle e layout originali. Puoi usare gli strumenti più volte se la prima ricerca non è sufficiente. Quando hai raccolto abbastanza informazioni, rispondi all\'utente.'
        const ANSWER_SYSTEM = SYSTEM_PROMPT + '\n\nRispondi all\'utente usando ESCLUSIVAMENTE le informazioni dai tool results nel contesto. NON menzionare MAI il processo di ricerca. Inizia DIRETTAMENTE con il contenuto informativo.'

        // Phase 1: Tool routing with Haiku (fast)
        while (loopCount < maxLoops - 1) {
          loopCount++
          const response = await anthropic.messages.create({
            model: 'claude-haiku-4-5-20251001',
            max_tokens: 1024,
            system: TOOL_SYSTEM,
            tools,
            messages,
          })

          if (response.stop_reason !== 'tool_use') break

          const toolBlocks = response.content.filter((b: any) => b.type === 'tool_use')
          messages.push({ role: 'assistant', content: toolBlocks })

          const toolResults: Anthropic.Messages.ToolResultBlockParam[] = []
          for (const block of response.content) {
            if (block.type !== 'tool_use') continue

            const toolLabel = block.name === 'search_chunks'
              ? `Ricerca: "${(block.input as { query: string }).query}"`
              : `Pagine: ${(block.input as { page_numbers: number[] }).page_numbers?.join(', ')}`
            allToolCalls.push(toolLabel)
            send({ type: 'tool_call', tool: block.name, input: block.input })

            try {
              if (block.name === 'search_chunks') {
                const input = block.input as { query: string; count?: number }
                const results = await searchChunks(input.query, input.count || 8, document_id)
                results.forEach((r: { page_number: number }) => allCitedPages.add(r.page_number))
                toolResults.push({ type: 'tool_result', tool_use_id: block.id, content: JSON.stringify(results) })
              } else if (block.name === 'view_pages') {
                const input = block.input as { page_numbers: number[] }
                const pageContent = await viewPages(input.page_numbers, document_id)
                input.page_numbers.forEach(p => allCitedPages.add(p))
                toolResults.push({ type: 'tool_result', tool_use_id: block.id, content: pageContent })
              }
            } catch (err) {
              toolResults.push({
                type: 'tool_result',
                tool_use_id: block.id,
                is_error: true,
                content: `Errore: ${err instanceof Error ? err.message : String(err)}`,
              })
            }
          }

          messages.push({ role: 'user', content: toolResults })
        }

        // Phase 2: Final answer with Sonnet (streaming)
        const citations = Array.from(allCitedPages).sort((a, b) => a - b).map(p => ({ page_number: p }))
        send({ type: 'citations', citations })

        {
          const stream = anthropic.messages.stream({
            model: 'claude-sonnet-4-6',
            max_tokens: 4096,
            system: ANSWER_SYSTEM,
            messages,
          })

          let rawText = ''
          let preambleStripped = false

          stream.on('text', (delta) => {
            rawText += delta
            // Buffer until we can detect/strip preamble, then stream
            if (!preambleStripped) {
              // Check if we have enough to strip preamble
              const hrMatch = rawText.match(/^(.{0,300}?)\n---\n/)
              if (hrMatch) {
                rawText = rawText.slice(hrMatch[0].length)
                preambleStripped = true
                if (rawText) send({ type: 'text', text: rawText })
              } else if (rawText.length > 350 || rawText.includes('\n\n')) {
                // No hr found, strip leading preamble sentence
                rawText = rawText.replace(/^(Ora ho|Ho raccolto|Ho trovato|Ho analizzato|Le informazioni|I dati sono|La risposta|Ecco la|Basandomi|In base|Dalle ricerche|Dopo aver|Analizzando|Procedo|Vediamo|Di seguito|Fornisco|Presento)[^\n]*\n+/i, '')
                preambleStripped = true
                if (rawText) send({ type: 'text', text: rawText })
              }
            } else {
              // Already stripped, stream delta directly
              send({ type: 'text', text: delta })
            }
          })

          const finalMsg = await stream.finalMessage()

          // If preamble was never stripped (short response), send now
          if (!preambleStripped) {
            rawText = rawText.replace(/^(Ora ho|Ho raccolto|Ho trovato|Ho analizzato|Le informazioni|I dati sono|La risposta|Ecco la|Basandomi|In base|Dalle ricerche|Dopo aver|Analizzando|Procedo|Vediamo|Di seguito|Fornisco|Presento)[^\n]*\n+/i, '')
            const hrMatch = rawText.match(/^(.{0,300}?)\n---\n/)
            if (hrMatch) rawText = rawText.slice(hrMatch[0].length)
            rawText = rawText.trim()
            if (rawText) send({ type: 'text', text: rawText })
          }

          finalText = rawText
          console.log(`[chat] Streamed ${finalText.length} chars, stop: ${finalMsg.stop_reason}`)
        }

        // Save assistant message if conversation exists
        if (conversation_id && finalText) {
          await supabaseAdmin.from('messages').insert({
            conversation_id,
            role: 'assistant',
            content: finalText,
            citations: Array.from(allCitedPages).sort((a, b) => a - b).map(p => ({ page_number: p })),
            tool_calls: allToolCalls,
          })

          // Auto-title: if this is the first exchange, use Claude to generate title
          const { count } = await supabaseAdmin
            .from('messages')
            .select('*', { count: 'exact', head: true })
            .eq('conversation_id', conversation_id)

          if (count && count <= 2) {
            const title = message.length > 60 ? message.slice(0, 57) + '...' : message
            await supabaseAdmin
              .from('conversations')
              .update({ title })
              .eq('id', conversation_id)
            send({ type: 'title_updated', title })
          }
        }

        send({ type: 'done' })
      } catch (err) {
        console.error('[chat] Error in stream:', err)
        send({ type: 'error', error: err instanceof Error ? err.message : String(err) })
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

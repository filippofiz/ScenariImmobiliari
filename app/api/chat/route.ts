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

// Tools Claude can use
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

// Execute search_chunks tool
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

// Execute view_pages tool — extract specific pages from stored PDF
async function viewPages(pageNumbers: number[], documentId: string): Promise<Anthropic.Messages.ToolResultBlockParam['content']> {
  // Get pdf_path from document
  const { data: doc } = await supabaseAdmin
    .from('documents')
    .select('pdf_path')
    .eq('id', documentId)
    .single()

  if (!doc?.pdf_path) throw new Error('PDF non trovato')

  // Download PDF from storage
  const { data: pdfData, error } = await supabaseAdmin.storage
    .from('pdfs')
    .download(doc.pdf_path)

  if (error || !pdfData) throw new Error('Errore download PDF')

  const pdfBytes = await pdfData.arrayBuffer()
  const srcDoc = await PDFDocument.load(pdfBytes)
  const totalPages = srcDoc.getPageCount()

  // Extract requested pages (max 5)
  const pagesToExtract = pageNumbers.slice(0, 5).filter(p => p >= 1 && p <= totalPages)

  const results: Anthropic.Messages.ToolResultBlockParam['content'] = []

  for (const pageNum of pagesToExtract) {
    // Create a single-page PDF for each requested page
    const singlePageDoc = await PDFDocument.create()
    const [copiedPage] = await singlePageDoc.copyPages(srcDoc, [pageNum - 1])
    singlePageDoc.addPage(copiedPage)
    const singlePageBytes = await singlePageDoc.save()
    const base64 = Buffer.from(singlePageBytes).toString('base64')

    results.push({
      type: 'document',
      source: {
        type: 'base64',
        media_type: 'application/pdf',
        data: base64,
      },
    })
    results.push({
      type: 'text',
      text: `[Pagina ${pageNum} del documento]`,
    })
  }

  return results
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

  const encoder = new TextEncoder()
  const stream = new ReadableStream({
    async start(controller) {
      function send(data: Record<string, unknown>) {
        controller.enqueue(encoder.encode(`data: ${JSON.stringify(data)}\n\n`))
      }

      try {
        // Build messages
        const recentHistory = history.slice(-10)
        const messages: Anthropic.Messages.MessageParam[] = [
          ...recentHistory.map(m => ({
            role: m.role as 'user' | 'assistant',
            content: m.content,
          })),
          { role: 'user', content: message },
        ]

        // Agentic loop — Claude can call tools multiple times
        let loopCount = 0
        const maxLoops = 6
        const allCitedPages = new Set<number>()

        while (loopCount < maxLoops) {
          loopCount++

          const response = await anthropic.messages.create({
            model: 'claude-sonnet-4-6',
            max_tokens: 4096,
            system: SYSTEM_PROMPT + '\n\nHai a disposizione strumenti per cercare nel documento e visualizzare le pagine originali. Usa search_chunks per trovare informazioni testuali e view_pages per vedere grafici, tabelle e layout originali. Puoi usare gli strumenti più volte se la prima ricerca non è sufficiente. Quando hai raccolto abbastanza informazioni, rispondi all\'utente.',
            tools,
            messages,
          })

          // Check if Claude wants to use tools
          if (response.stop_reason === 'tool_use') {
            // Add assistant message with tool calls
            messages.push({ role: 'assistant', content: response.content })

            // Execute each tool call
            const toolResults: Anthropic.Messages.ToolResultBlockParam[] = []

            for (const block of response.content) {
              if (block.type !== 'tool_use') continue

              send({ type: 'tool_call', tool: block.name, input: block.input })

              try {
                if (block.name === 'search_chunks') {
                  const input = block.input as { query: string; count?: number }
                  const results = await searchChunks(input.query, input.count || 8, document_id)

                  // Track cited pages
                  results.forEach((r: { page_number: number }) => allCitedPages.add(r.page_number))

                  toolResults.push({
                    type: 'tool_result',
                    tool_use_id: block.id,
                    content: JSON.stringify(results),
                  })
                } else if (block.name === 'view_pages') {
                  const input = block.input as { page_numbers: number[] }
                  const pageContent = await viewPages(input.page_numbers, document_id)

                  input.page_numbers.forEach(p => allCitedPages.add(p))

                  toolResults.push({
                    type: 'tool_result',
                    tool_use_id: block.id,
                    content: pageContent,
                  })
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

            // Add tool results
            messages.push({ role: 'user', content: toolResults })
            continue
          }

          // Claude is done — extract text and stream it
          const citations = Array.from(allCitedPages).sort((a, b) => a - b).map(p => ({
            page_number: p,
          }))

          send({ type: 'citations', citations })

          for (const block of response.content) {
            if (block.type === 'text') {
              send({ type: 'text', text: block.text })
            }
          }

          break
        }

        send({ type: 'done' })
      } catch (err) {
        send({ type: 'error', error: String(err) })
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

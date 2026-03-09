import { NextRequest } from 'next/server'
import { getEmbeddings } from '@/app/lib/voyage'
import { supabaseAdmin } from '@/app/lib/supabase'
// @ts-expect-error no types for pdf-parse
import pdfParse from 'pdf-parse'

export const maxDuration = 300

interface Chunk {
  content: string
  page_number: number
  chunk_index: number
}

function chunkText(text: string, pageNumber: number, startIndex: number): Chunk[] {
  const chunks: Chunk[] = []
  const words = text.split(/\s+/).filter(w => w.length > 0)
  const chunkSize = 200
  const overlap = 25

  for (let i = 0; i < words.length; i += chunkSize - overlap) {
    const chunkWords = words.slice(i, i + chunkSize)
    if (chunkWords.length < 20) break

    chunks.push({
      content: chunkWords.join(' '),
      page_number: pageNumber,
      chunk_index: startIndex + chunks.length,
    })
  }

  return chunks
}

// Extract text page by page using pdf-parse's page render callback
async function extractPages(buffer: Buffer): Promise<Map<number, string>> {
  const pages = new Map<number, string>()

  await pdfParse(buffer, {
    pagerender: (pageData: { getTextContent: (opts: Record<string, boolean>) => Promise<{ items: Array<{ str: string; transform: number[] }> }> }, pageNum: number) => {
      return pageData.getTextContent({ normalizeWhitespace: false, disableCombineTextItems: false })
        .then((textContent: { items: Array<{ str: string; transform: number[] }> }) => {
          let lastY: number | undefined
          let text = ''
          for (const item of textContent.items) {
            if (lastY === item.transform[5] || lastY === undefined) {
              text += item.str
            } else {
              text += '\n' + item.str
            }
            lastY = item.transform[5]
          }
          // pageData doesn't expose page number directly, use counter
          return text
        })
    },
  })

  // pdf-parse doesn't give us page numbers in the callback easily,
  // so let's use a different approach: parse with a custom pagerender that captures each page
  return pages
}

export async function POST(request: NextRequest) {
  const encoder = new TextEncoder()
  const stream = new ReadableStream({
    async start(controller) {
      function send(data: Record<string, unknown>) {
        controller.enqueue(encoder.encode(`data: ${JSON.stringify(data)}\n\n`))
      }

      try {
        const formData = await request.formData()
        const file = formData.get('file') as File | null

        if (!file) {
          send({ error: 'Nessun file fornito' })
          controller.close()
          return
        }

        send({ status: 'started' })

        const buffer = Buffer.from(await file.arrayBuffer())

        // 1. Store raw PDF in Supabase Storage
        const pdfPath = `${crypto.randomUUID()}/${file.name}`
        const { error: uploadError } = await supabaseAdmin().storage
          .from('pdfs')
          .upload(pdfPath, buffer, { contentType: 'application/pdf' })

        if (uploadError) {
          send({ error: `Errore upload PDF: ${uploadError.message}` })
          controller.close()
          return
        }

        send({ status: 'pdf_stored' })

        // 2. Extract text page by page
        const pageTexts: string[] = []
        let currentPage = 0

        await pdfParse(buffer, {
          pagerender: (pageData: { getTextContent: (opts: Record<string, boolean>) => Promise<{ items: Array<{ str: string; transform: number[] }> }> }) => {
            currentPage++
            return pageData.getTextContent({ normalizeWhitespace: false, disableCombineTextItems: false })
              .then((textContent: { items: Array<{ str: string; transform: number[] }> }) => {
                let lastY: number | undefined
                let text = ''
                for (const item of textContent.items) {
                  if (lastY === item.transform[5] || lastY === undefined) {
                    text += item.str
                  } else {
                    text += '\n' + item.str
                  }
                  lastY = item.transform[5]
                }
                pageTexts[currentPage - 1] = text
                return text
              })
          },
        })

        const totalPages = pageTexts.length
        send({ status: 'parsed', total_pages: totalPages })

        // 3. Create document record
        const { data: doc, error: docError } = await supabaseAdmin()
          .from('documents')
          .insert({ filename: file.name, pdf_path: pdfPath })
          .select('id')
          .single()

        if (docError || !doc) {
          send({ error: `Errore database: ${docError?.message}` })
          controller.close()
          return
        }

        const documentId = doc.id
        send({ status: 'document_created', document_id: documentId })

        // 4. Chunk all pages
        const allChunks: Chunk[] = []
        let chunkIndex = 0

        for (let i = 0; i < pageTexts.length; i++) {
          const text = (pageTexts[i] || '').trim()
          if (text) {
            const chunks = chunkText(text, i + 1, chunkIndex)
            allChunks.push(...chunks)
            chunkIndex += chunks.length
          }
        }

        send({ status: 'chunked', total_chunks: allChunks.length, total_pages: totalPages })

        // 5. Generate embeddings in batches with rate limiting
        // Free Voyage tier: 3 RPM, 10K TPM
        // Strategy: 1 request every 21 seconds to stay safely under 3 RPM
        const embeddingBatchSize = 10
        const delayBetweenRequests = 21000 // 21 seconds

        for (let i = 0; i < allChunks.length; i += embeddingBatchSize) {
          const batch = allChunks.slice(i, i + embeddingBatchSize)
          const texts = batch.map(c => c.content)
          const batchNum = Math.floor(i / embeddingBatchSize) + 1
          const totalBatches = Math.ceil(allChunks.length / embeddingBatchSize)
          const etaMinutes = Math.ceil(((totalBatches - batchNum) * delayBetweenRequests) / 60000)

          // Retry with backoff on rate limit
          let embeddings: number[][] | null = null
          for (let attempt = 0; attempt < 5; attempt++) {
            try {
              embeddings = await getEmbeddings(texts)
              break
            } catch (err) {
              const msg = err instanceof Error ? err.message : String(err)
              if (msg.includes('429') && attempt < 4) {
                const wait = 30000 + attempt * 15000 // 30s, 45s, 60s, 75s
                send({ status: 'rate_limited', wait_seconds: wait / 1000, attempt: attempt + 1 })
                await new Promise(r => setTimeout(r, wait))
                continue
              }
              throw err
            }
          }

          if (!embeddings) throw new Error('Embedding fallito dopo 5 tentativi')

          const rows = batch.map((chunk, j) => ({
            document_id: documentId,
            content: chunk.content,
            page_number: chunk.page_number,
            chunk_index: chunk.chunk_index,
            embedding: JSON.stringify(embeddings![j]),
          }))

          const { error: insertError } = await supabaseAdmin()
            .from('chunks')
            .insert(rows)

          if (insertError) {
            send({ error: `Errore inserimento chunks: ${insertError.message}` })
            controller.close()
            return
          }

          send({
            status: 'embedding',
            chunks_embedded: Math.min(i + embeddingBatchSize, allChunks.length),
            total_chunks: allChunks.length,
            batch: batchNum,
            total_batches: totalBatches,
            eta_minutes: etaMinutes,
          })

          // Wait between requests to respect 3 RPM limit
          if (i + embeddingBatchSize < allChunks.length) {
            await new Promise(r => setTimeout(r, delayBetweenRequests))
          }
        }

        send({
          status: 'complete',
          document_id: documentId,
          total_chunks: allChunks.length,
          pages_processed: totalPages,
        })
      } catch (err) {
        send({ error: `Errore: ${err instanceof Error ? err.message : String(err)}` })
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

import { NextRequest, NextResponse } from 'next/server'
import { anthropic } from '@/app/lib/claude'
import { getEmbeddings } from '@/app/lib/voyage'
import { supabaseAdmin } from '@/app/lib/supabase'

export const maxDuration = 60

interface Chunk {
  content: string
  page_number: number
  chunk_index: number
}

// Convert PDF page (as image) to text via Claude vision
async function extractPageText(pageBase64: string, pageNum: number): Promise<string> {
  const response = await anthropic.messages.create({
    model: 'claude-sonnet-4-5-20250514',
    max_tokens: 4096,
    messages: [
      {
        role: 'user',
        content: [
          {
            type: 'image',
            source: {
              type: 'base64',
              media_type: 'image/png',
              data: pageBase64,
            },
          },
          {
            type: 'text',
            text: `Estrai TUTTO il testo da questa pagina (pagina ${pageNum}) esattamente come scritto. Includi tutti i numeri, tabelle e dati. Mantieni la struttura delle tabelle usando | come separatore di colonne. Non aggiungere commenti o spiegazioni, solo il testo estratto.`,
          },
        ],
      },
    ],
  })

  const block = response.content[0]
  return block.type === 'text' ? block.text : ''
}

// Split text into overlapping chunks
function chunkText(text: string, pageNumber: number, startIndex: number): Chunk[] {
  const chunks: Chunk[] = []
  const words = text.split(/\s+/)
  const chunkSize = 200 // ~800 tokens ≈ 200 words
  const overlap = 25   // ~100 tokens ≈ 25 words

  for (let i = 0; i < words.length; i += chunkSize - overlap) {
    const chunkWords = words.slice(i, i + chunkSize)
    if (chunkWords.length < 20) break // skip tiny trailing chunks

    chunks.push({
      content: chunkWords.join(' '),
      page_number: pageNumber,
      chunk_index: startIndex + chunks.length,
    })
  }

  return chunks
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
        const pagesDataRaw = formData.get('pages') as string | null

        if (!file && !pagesDataRaw) {
          send({ error: 'Nessun file o pagine fornite' })
          controller.close()
          return
        }

        // Parse pre-rendered pages (base64 images sent from client)
        let pagesData: string[] = []
        if (pagesDataRaw) {
          pagesData = JSON.parse(pagesDataRaw)
        }

        const totalPages = pagesData.length
        send({ status: 'started', total_pages: totalPages })

        // Create document record
        const filename = file?.name || 'uploaded-document.pdf'
        const { data: doc, error: docError } = await supabaseAdmin
          .from('documents')
          .insert({ filename })
          .select('id')
          .single()

        if (docError || !doc) {
          send({ error: `Errore database: ${docError?.message}` })
          controller.close()
          return
        }

        const documentId = doc.id
        send({ status: 'document_created', document_id: documentId })

        // Process pages in batches of 5
        const allChunks: Chunk[] = []
        const batchSize = 5
        let chunkIndex = 0

        for (let batchStart = 0; batchStart < totalPages; batchStart += batchSize) {
          const batchEnd = Math.min(batchStart + batchSize, totalPages)
          const batchPromises: Promise<string>[] = []

          for (let i = batchStart; i < batchEnd; i++) {
            batchPromises.push(extractPageText(pagesData[i], i + 1))
          }

          const pageTexts = await Promise.all(batchPromises)

          for (let i = 0; i < pageTexts.length; i++) {
            const pageNum = batchStart + i + 1
            const text = pageTexts[i]
            if (text.trim()) {
              const chunks = chunkText(text, pageNum, chunkIndex)
              allChunks.push(...chunks)
              chunkIndex += chunks.length
            }
          }

          send({
            status: 'processing',
            pages_processed: batchEnd,
            total_pages: totalPages,
            chunks_so_far: allChunks.length,
          })
        }

        send({ status: 'embedding', total_chunks: allChunks.length })

        // Generate embeddings in batches of 20
        const embeddingBatchSize = 20
        for (let i = 0; i < allChunks.length; i += embeddingBatchSize) {
          const batch = allChunks.slice(i, i + embeddingBatchSize)
          const texts = batch.map(c => c.content)
          const embeddings = await getEmbeddings(texts)

          // Upsert to Supabase
          const rows = batch.map((chunk, j) => ({
            document_id: documentId,
            content: chunk.content,
            page_number: chunk.page_number,
            chunk_index: chunk.chunk_index,
            embedding: JSON.stringify(embeddings[j]),
          }))

          const { error: insertError } = await supabaseAdmin
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
          })
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

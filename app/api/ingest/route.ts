import { NextRequest } from 'next/server'
import { getEmbeddings } from '@/app/lib/voyage'
import { supabaseAdmin } from '@/app/lib/supabase'
// @ts-expect-error no types for pdf-parse
import pdfParse from 'pdf-parse'

export const maxDuration = 60

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
        const { error: uploadError } = await supabaseAdmin.storage
          .from('pdfs')
          .upload(pdfPath, buffer, { contentType: 'application/pdf' })

        if (uploadError) {
          send({ error: `Errore upload PDF: ${uploadError.message}` })
          controller.close()
          return
        }

        send({ status: 'pdf_stored' })

        // 2. Extract text
        const pdf = await pdfParse(buffer)
        const pages = pdf.text.split(/\f/).filter((p: string) => p.trim().length > 0)
        const totalPages = pages.length

        send({ status: 'parsed', total_pages: totalPages })

        // 3. Create document record (with pdf_path for later retrieval)
        const { data: doc, error: docError } = await supabaseAdmin
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

        for (let i = 0; i < pages.length; i++) {
          const text = pages[i].trim()
          if (text) {
            const chunks = chunkText(text, i + 1, chunkIndex)
            allChunks.push(...chunks)
            chunkIndex += chunks.length
          }
        }

        send({ status: 'chunked', total_chunks: allChunks.length, total_pages: totalPages })

        // 5. Generate embeddings in batches of 20
        const embeddingBatchSize = 20
        for (let i = 0; i < allChunks.length; i += embeddingBatchSize) {
          const batch = allChunks.slice(i, i + embeddingBatchSize)
          const texts = batch.map(c => c.content)
          const embeddings = await getEmbeddings(texts)

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

import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/app/lib/supabase'

export async function GET(request: NextRequest) {
  const { searchParams } = request.nextUrl
  const documentId = searchParams.get('document_id')

  if (!documentId) {
    return NextResponse.json({ error: 'document_id is required' }, { status: 400 })
  }

  const { data: doc, error: docError } = await supabaseAdmin
    .from('documents')
    .select('pdf_path')
    .eq('id', documentId)
    .single()

  if (docError || !doc?.pdf_path) {
    return NextResponse.json({ error: 'Documento non trovato' }, { status: 404 })
  }

  const { data: pdfData, error: downloadError } = await supabaseAdmin.storage
    .from('pdfs')
    .download(doc.pdf_path)

  if (downloadError || !pdfData) {
    return NextResponse.json({ error: 'Errore download PDF' }, { status: 500 })
  }

  const bytes = await pdfData.arrayBuffer()

  return new Response(Buffer.from(bytes), {
    headers: {
      'Content-Type': 'application/pdf',
      'Cache-Control': 'private, max-age=3600',
      'Content-Disposition': 'inline; filename="document.pdf"',
    },
  })
}

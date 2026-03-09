import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/app/lib/supabase'
import { PDFDocument } from 'pdf-lib'

export async function GET(request: NextRequest) {
  const { searchParams } = request.nextUrl
  const documentId = searchParams.get('document_id')
  const pageParam = searchParams.get('page')

  if (!documentId || !pageParam) {
    return NextResponse.json(
      { error: 'document_id and page are required' },
      { status: 400 }
    )
  }

  const pageNumber = parseInt(pageParam, 10)
  if (isNaN(pageNumber) || pageNumber < 1) {
    return NextResponse.json(
      { error: 'page must be a positive integer' },
      { status: 400 }
    )
  }

  // Look up the document's pdf_path
  const { data: doc, error: docError } = await supabaseAdmin
    .from('documents')
    .select('pdf_path')
    .eq('id', documentId)
    .single()

  if (docError || !doc?.pdf_path) {
    return NextResponse.json(
      { error: 'Documento non trovato' },
      { status: 404 }
    )
  }

  // Download the PDF from Supabase storage
  const { data: pdfData, error: downloadError } = await supabaseAdmin.storage
    .from('pdfs')
    .download(doc.pdf_path)

  if (downloadError || !pdfData) {
    return NextResponse.json(
      { error: 'Errore download PDF' },
      { status: 500 }
    )
  }

  // Load the PDF and extract the requested page
  const pdfBytes = await pdfData.arrayBuffer()
  const srcDoc = await PDFDocument.load(pdfBytes)
  const totalPages = srcDoc.getPageCount()

  if (pageNumber > totalPages) {
    return NextResponse.json(
      { error: `Pagina ${pageNumber} non esiste (totale: ${totalPages})` },
      { status: 400 }
    )
  }

  // Create a new PDF with just the requested page
  const singlePageDoc = await PDFDocument.create()
  const [copiedPage] = await singlePageDoc.copyPages(srcDoc, [pageNumber - 1])
  singlePageDoc.addPage(copiedPage)
  const singlePageBytes = await singlePageDoc.save()

  // Return the single-page PDF as binary
  return new Response(Buffer.from(singlePageBytes), {
    headers: {
      'Content-Type': 'application/pdf',
      'Content-Disposition': `inline; filename="page-${pageNumber}.pdf"`,
    },
  })
}

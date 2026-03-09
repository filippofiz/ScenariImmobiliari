import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/app/lib/supabase'

export async function GET() {
  const { data, error } = await supabaseAdmin()
    .from('documents')
    .select('id, filename, pdf_path, created_at')
    .order('created_at', { ascending: false })

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  const docs = await Promise.all(
    (data || []).map(async (doc) => {
      const { count } = await supabaseAdmin()
        .from('chunks')
        .select('*', { count: 'exact', head: true })
        .eq('document_id', doc.id)
      return { ...doc, chunks: count || 0 }
    })
  )

  return NextResponse.json(docs)
}

export async function DELETE(request: NextRequest) {
  const { id } = await request.json()

  if (!id) {
    return NextResponse.json({ error: 'id required' }, { status: 400 })
  }

  // Get pdf_path before deleting
  const { data: doc } = await supabaseAdmin()
    .from('documents')
    .select('pdf_path')
    .eq('id', id)
    .single()

  // Delete chunks first (foreign key)
  await supabaseAdmin().from('chunks').delete().eq('document_id', id)

  // Delete document
  await supabaseAdmin().from('documents').delete().eq('id', id)

  // Delete PDF from storage
  if (doc?.pdf_path) {
    await supabaseAdmin().storage.from('pdfs').remove([doc.pdf_path])
  }

  return NextResponse.json({ ok: true })
}

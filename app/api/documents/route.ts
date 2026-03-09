import { NextResponse } from 'next/server'
import { supabaseAdmin } from '@/app/lib/supabase'

export async function GET() {
  const { data, error } = await supabaseAdmin
    .from('documents')
    .select('id, filename, created_at')
    .order('created_at', { ascending: false })

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  // For each document, get chunk count
  const docs = await Promise.all(
    (data || []).map(async (doc) => {
      const { count } = await supabaseAdmin
        .from('chunks')
        .select('*', { count: 'exact', head: true })
        .eq('document_id', doc.id)
      return { ...doc, chunks: count || 0 }
    })
  )

  return NextResponse.json(docs)
}

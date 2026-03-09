import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/app/lib/supabase'

// GET: list conversations
export async function GET(request: NextRequest) {
  const docId = request.nextUrl.searchParams.get('document_id')

  let query = supabaseAdmin
    .from('conversations')
    .select('id, title, document_id, created_at, updated_at')
    .order('updated_at', { ascending: false })

  if (docId) query = query.eq('document_id', docId)

  const { data, error } = await query
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data || [])
}

// POST: create conversation
export async function POST(request: NextRequest) {
  const { document_id, title } = await request.json()

  const { data, error } = await supabaseAdmin
    .from('conversations')
    .insert({ document_id, title: title || 'Nuova conversazione' })
    .select('id, title, document_id, created_at, updated_at')
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data)
}

// DELETE: delete conversation
export async function DELETE(request: NextRequest) {
  const { id } = await request.json()
  if (!id) return NextResponse.json({ error: 'id required' }, { status: 400 })

  await supabaseAdmin.from('conversations').delete().eq('id', id)
  return NextResponse.json({ ok: true })
}

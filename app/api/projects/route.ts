import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/app/lib/supabase'

// GET: list projects
export async function GET() {
  const { data, error } = await supabaseAdmin()
    .from('projects')
    .select('*')
    .eq('is_archived', false)
    .order('updated_at', { ascending: false })

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data || [])
}

// POST: create project
export async function POST(request: NextRequest) {
  const { name, emoji, color, description } = await request.json()

  const { data, error } = await supabaseAdmin()
    .from('projects')
    .insert({
      name: name || 'Nuovo Progetto',
      emoji: emoji || '📁',
      color: color || '#4E8EA7',
      description: description || '',
    })
    .select('*')
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data)
}

// PATCH: update project
export async function PATCH(request: NextRequest) {
  const { id, ...updates } = await request.json()
  if (!id) return NextResponse.json({ error: 'id required' }, { status: 400 })

  const { data, error } = await supabaseAdmin()
    .from('projects')
    .update({ ...updates, updated_at: new Date().toISOString() })
    .eq('id', id)
    .select('*')
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data)
}

// DELETE: delete project (conversations become unassigned)
export async function DELETE(request: NextRequest) {
  const { id } = await request.json()
  if (!id) return NextResponse.json({ error: 'id required' }, { status: 400 })

  await supabaseAdmin().from('projects').delete().eq('id', id)
  return NextResponse.json({ ok: true })
}

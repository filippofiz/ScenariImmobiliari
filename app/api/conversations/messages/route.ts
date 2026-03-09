import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/app/lib/supabase'

// GET: load messages for a conversation
export async function GET(request: NextRequest) {
  const convId = request.nextUrl.searchParams.get('conversation_id')
  if (!convId) return NextResponse.json({ error: 'conversation_id required' }, { status: 400 })

  const { data, error } = await supabaseAdmin
    .from('messages')
    .select('id, role, content, citations, tool_calls, created_at')
    .eq('conversation_id', convId)
    .order('created_at', { ascending: true })

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data || [])
}

// POST: save a message
export async function POST(request: NextRequest) {
  const { conversation_id, role, content, citations, tool_calls } = await request.json()

  const { data, error } = await supabaseAdmin
    .from('messages')
    .insert({
      conversation_id,
      role,
      content,
      citations: citations || [],
      tool_calls: tool_calls || [],
    })
    .select('id, role, content, citations, tool_calls, created_at')
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  // Update conversation timestamp and auto-title
  await supabaseAdmin
    .from('conversations')
    .update({ updated_at: new Date().toISOString() })
    .eq('id', conversation_id)

  return NextResponse.json(data)
}

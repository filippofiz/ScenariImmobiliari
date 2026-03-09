import { NextRequest, NextResponse } from 'next/server'

const USERS = {
  admin: { username: 'scenari', password: 'UpToTen25', role: 'admin' },
  client: { username: 'scenari', password: 'scenari', role: 'client' },
}

// Simple token = base64({ role, ts })
function makeToken(role: string): string {
  return Buffer.from(JSON.stringify({ role, ts: Date.now() })).toString('base64')
}

export async function POST(request: NextRequest) {
  const { username, password } = await request.json()

  // Check admin first (more specific password)
  if (username === USERS.admin.username && password === USERS.admin.password) {
    const token = makeToken('admin')
    const res = NextResponse.json({ role: 'admin' })
    res.cookies.set('auth', token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      path: '/',
      maxAge: 60 * 60 * 24 * 7, // 7 days
    })
    return res
  }

  // Check client
  if (username === USERS.client.username && password === USERS.client.password) {
    const token = makeToken('client')
    const res = NextResponse.json({ role: 'client' })
    res.cookies.set('auth', token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      path: '/',
      maxAge: 60 * 60 * 24 * 7,
    })
    return res
  }

  return NextResponse.json({ error: 'Credenziali non valide' }, { status: 401 })
}

export async function DELETE() {
  const res = NextResponse.json({ ok: true })
  res.cookies.delete('auth')
  return res
}

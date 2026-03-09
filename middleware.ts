import { NextRequest, NextResponse } from 'next/server'

function getRole(request: NextRequest): string | null {
  const cookie = request.cookies.get('auth')?.value
  if (!cookie) return null
  try {
    const { role } = JSON.parse(Buffer.from(cookie, 'base64').toString())
    if (role === 'admin' || role === 'client') return role
    return null
  } catch {
    return null
  }
}

export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl
  const role = getRole(request)

  // Public paths
  if (pathname === '/login' || pathname.startsWith('/api/auth')) {
    // If already logged in, redirect away from login
    if (pathname === '/login' && role) {
      const dest = role === 'admin' ? '/admin' : '/'
      return NextResponse.redirect(new URL(dest, request.url))
    }
    return NextResponse.next()
  }

  // API routes need auth
  if (pathname.startsWith('/api/')) {
    if (!role) {
      return NextResponse.json({ error: 'Non autorizzato' }, { status: 401 })
    }
    // /api/ingest is admin only
    if (pathname.startsWith('/api/ingest') && role !== 'admin') {
      return NextResponse.json({ error: 'Accesso negato' }, { status: 403 })
    }
    return NextResponse.next()
  }

  // No auth → login
  if (!role) {
    return NextResponse.redirect(new URL('/login', request.url))
  }

  // Admin page → admin only
  if (pathname.startsWith('/admin') && role !== 'admin') {
    return NextResponse.redirect(new URL('/', request.url))
  }

  // Client on / is fine, admin on / is fine too
  return NextResponse.next()
}

export const config = {
  matcher: ['/', '/admin/:path*', '/api/:path*', '/login'],
}

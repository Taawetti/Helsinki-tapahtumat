import { NextRequest, NextResponse } from 'next/server'
import { SESSION_COOKIE, verifyAdminSessionToken } from '@/lib/admin-auth'

// Next 16: middleware.ts on korvattu proxy.ts:llä (toiminnallisuus sama).
// Suojaa sekä /admin/*-sivut että /api/admin/*-reitit — reittien oma
// requireAdmin-tarkistus toimii defense-in-depth -tasona.
export async function proxy(req: NextRequest) {
  const { pathname } = req.nextUrl

  const isAdminPage = pathname.startsWith('/admin') && !pathname.startsWith('/admin/login')
  // /api/admin/auth on login/logout — sen on oltava tavoitettavissa ilman sessiota
  const isAdminApi = pathname.startsWith('/api/admin') && pathname !== '/api/admin/auth'

  if (!isAdminPage && !isAdminApi) return NextResponse.next()

  const ok = await verifyAdminSessionToken(
    req.cookies.get(SESSION_COOKIE)?.value,
    process.env.ADMIN_PASSWORD,
  )
  if (ok) return NextResponse.next()

  if (isAdminApi) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const loginUrl = new URL('/admin/login', req.nextUrl)
  loginUrl.searchParams.set('from', pathname)
  return NextResponse.redirect(loginUrl)
}

export const config = {
  matcher: ['/admin/:path*', '/api/admin/:path*'],
}

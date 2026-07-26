import { NextRequest, NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import {
  SESSION_COOKIE,
  SESSION_MAX_AGE,
  createAdminSessionToken,
  timingSafeCompare,
} from '@/lib/admin-auth'

// POST /api/admin/auth — login
export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({}))
  const password = body.password as string

  if (!password) {
    return NextResponse.json({ error: 'Salasana puuttuu' }, { status: 400 })
  }

  const adminPw = process.env.ADMIN_PASSWORD
  if (!adminPw) {
    return NextResponse.json({ error: 'ADMIN_PASSWORD ei ole asetettu' }, { status: 500 })
  }

  if (!timingSafeCompare(password, adminPw)) {
    return NextResponse.json({ error: 'Väärä salasana' }, { status: 401 })
  }

  const token = await createAdminSessionToken(adminPw)

  const cookieStore = await cookies()
  cookieStore.set(SESSION_COOKIE, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    maxAge: SESSION_MAX_AGE,
    path: '/',
  })

  return NextResponse.json({ ok: true })
}

// DELETE /api/admin/auth — logout
export async function DELETE() {
  const cookieStore = await cookies()
  cookieStore.delete(SESSION_COOKIE)
  return NextResponse.json({ ok: true })
}

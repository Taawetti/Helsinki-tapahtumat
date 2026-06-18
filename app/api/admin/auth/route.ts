import { NextRequest, NextResponse } from 'next/server'
import { cookies } from 'next/headers'

const SESSION_COOKIE = 'admin_session'
const MAX_AGE = 60 * 60 * 24 * 7 // 7 days

function getExpectedToken() {
  const pw = process.env.ADMIN_PASSWORD
  if (!pw) return null
  return Buffer.from(pw).toString('base64')
}

// POST /api/admin/auth — login
export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({}))
  const password = body.password as string

  if (!password) {
    return NextResponse.json({ error: 'Salasana puuttuu' }, { status: 400 })
  }

  const expectedToken = getExpectedToken()
  if (!expectedToken) {
    return NextResponse.json({ error: 'ADMIN_PASSWORD ei ole asetettu' }, { status: 500 })
  }

  const inputToken = Buffer.from(password).toString('base64')
  if (inputToken !== expectedToken) {
    return NextResponse.json({ error: 'Väärä salasana' }, { status: 401 })
  }

  const cookieStore = await cookies()
  cookieStore.set(SESSION_COOKIE, expectedToken, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    maxAge: MAX_AGE,
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

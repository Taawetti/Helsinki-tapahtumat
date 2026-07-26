import { NextRequest, NextResponse } from 'next/server'

// Jaettu admin-autentikaatio kaikille /api/admin/*-reiteille ja proxy.ts:lle.
//
// Sessiotoken on muotoa `${vanhenemisaikaMs}.${hmac}` — HMAC-SHA256 avaimena
// ADMIN_PASSWORD, viestinä "admin-session:<expiry>". Toisin kuin aiempi
// base64(salasana)-token, tämä vanhenee eikä paljasta salasanaa edes
// base64-muodossa. Vanhat base64-tokenit eivät kelpaa → kirjautuminen uusiksi.
//
// Web Crypto (crypto.subtle) toimii sekä edge-runtimessa (proxy.ts) että
// Node-runtimessa (route handlerit, Node 20+), joten samaa toteutusta
// voi käyttää molemmissa.

export const SESSION_COOKIE = 'admin_session'
export const SESSION_MAX_AGE = 60 * 60 * 24 * 7 // 7 vuorokautta (sekunteja)

async function hmacSha256Hex(key: string, message: string): Promise<string> {
  const cryptoKey = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(key),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  )
  const sig = await crypto.subtle.sign('HMAC', cryptoKey, new TextEncoder().encode(message))
  return Array.from(new Uint8Array(sig), (b) => b.toString(16).padStart(2, '0')).join('')
}

// Vakioaikainen merkkijonovertailu — estää timing-hyökkäykset salasanan
// ja allekirjoituksen vertailussa.
export function timingSafeCompare(a: string, b: string): boolean {
  if (a.length !== b.length) return false
  let diff = 0
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i)
  return diff === 0
}

export async function createAdminSessionToken(password: string, now = Date.now()): Promise<string> {
  const expires = now + SESSION_MAX_AGE * 1000
  const sig = await hmacSha256Hex(password, `admin-session:${expires}`)
  return `${expires}.${sig}`
}

export async function verifyAdminSessionToken(
  token: string | undefined,
  password: string | undefined,
): Promise<boolean> {
  if (!token || !password) return false
  const dot = token.indexOf('.')
  if (dot < 1) return false
  const expiresRaw = token.slice(0, dot)
  const expires = Number(expiresRaw)
  if (!Number.isFinite(expires) || Date.now() > expires) return false
  const expected = await hmacSha256Hex(password, `admin-session:${expiresRaw}`)
  return timingSafeCompare(token.slice(dot + 1), expected)
}

// Yhteinen auth-tarkistus route handlereille: palauttaa null kun käyttäjä on
// autentikoitu, muuten valmiin 401-vastauksen.
//
//   const authError = await requireAdmin(req)
//   if (authError) return authError
export async function requireAdmin(req: NextRequest): Promise<NextResponse | null> {
  const ok = await verifyAdminSessionToken(req.cookies.get(SESSION_COOKIE)?.value, process.env.ADMIN_PASSWORD)
  return ok ? null : NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
}

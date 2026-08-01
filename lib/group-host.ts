// Host-oikeuden todentaminen ryhmäpäätöksessä (server-only).
// Uusilla sessioilla salainen host_secret (tallennetaan kantaan mutta EI
// koskaan palauteta API:sta); vanhoilla sessioilla julkisella host_id:lla.

// Vakioaikainen merkkijonovertailu (duplikaatti lib/admin-auth:stä — tämä
// moduuli ei saa riippua next/server-importeista)
function timingSafeCompare(a: string, b: string): boolean {
  if (a.length !== b.length) return false
  let diff = 0
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i)
  return diff === 0
}

export function isHostSession(
  session: { host_id: string | null; host_secret?: string | null },
  body: { hostId?: unknown; hostSecret?: unknown },
): boolean {
  const secret = typeof body.hostSecret === 'string' ? body.hostSecret : ''
  if (session.host_secret) {
    return !!secret && timingSafeCompare(secret, session.host_secret)
  }
  // Legacy: sessiot ilman secretiä — julkinen host_id tai ei hostia ollenkaan
  const hostId = typeof body.hostId === 'string' ? body.hostId : null
  return !session.host_id || session.host_id === hostId
}

// Klientin luoma satunnainen host_secret (paikallisesti, ei pakollista entropiaa).
export function genHostSecret(): string {
  return Math.random().toString(36).slice(2) + Math.random().toString(36).slice(2) + Date.now().toString(36)
}

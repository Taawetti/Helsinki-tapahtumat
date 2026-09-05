// Kevyt IP-kohtainen nopeusrajoitin serverless-instanssin muistiin.
// EI hajautettu — jokainen lambda-instanssi laskee omansa — mutta pysäyttää
// yhden lähteen purskeet ja tekee väärinkäytöstä kallista (auditointi
// 5.9.2026: /api/translate kulutti Claude-krediittejä ja /api/newsletter
// pommitti tervetuloviestejä rajatta). Tarkoitus on hidaste, ei autentikointi.

const ikkunat = new Map<string, { count: number; reset: number }>()

/** true = pyyntö saa jatkaa; false = raja ylittyi tässä ikkunassa. */
export function rateLimit(avain: string, max: number, ikkunaMs: number): boolean {
  const nyt = Date.now()
  // Siivous ettei kartta kasva rajatta pitkäikäisessä instanssissa.
  if (ikkunat.size > 5000) {
    for (const [k, v] of ikkunat) if (v.reset < nyt) ikkunat.delete(k)
  }
  const rivi = ikkunat.get(avain)
  if (!rivi || rivi.reset < nyt) {
    ikkunat.set(avain, { count: 1, reset: nyt + ikkunaMs })
    return true
  }
  rivi.count++
  return rivi.count <= max
}

/** Asiakkaan IP Vercelin välittämistä otsakkeista. */
export function clientIp(req: { headers: { get(n: string): string | null } }): string {
  return (
    req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ||
    req.headers.get('x-real-ip') ||
    'unknown'
  )
}

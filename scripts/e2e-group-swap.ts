// Swap-logiikan erillistesti ILMAN AI-kutsua: result_plan kirjoitetaan suoraan
// kantaan service-role -avaimella, jolloin swap-reitin toiminta varmistuu ilmaiseksi.
import { createClient } from '@supabase/supabase-js'
import { readFileSync } from 'fs'

const BASE = process.env.E2E_BASE || 'https://helsinki-tapahtumat.vercel.app'
const env = Object.fromEntries(
  readFileSync('.env.local', 'utf8').split('\n')
    .filter((l) => l.includes('=') && !l.trim().startsWith('#'))
    .map((l) => { const i = l.indexOf('='); return [l.slice(0, i).trim(), l.slice(i + 1).trim().replace(/^["']|["']$/g, '')] }),
)
const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY)
const post = (path: string, body: unknown) =>
  fetch(`${BASE}${path}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body), signal: AbortSignal.timeout(60000) })
const j = (r: Response) => r.json().catch(() => ({}))
let fail = 0
const ok = (n: string, c: boolean, x = '') => { console.log(`${c ? '✅' : '❌'} ${n}${x ? ` — ${x}` : ''}`); if (!c) fail++ }

async function main() {
  // Luo sessio ja hae pakka
  const created = await j(await post('/api/group/create', { when: 'tonight', fiilis: [], mode: 'arc', hostId: 'e2e-swap-host' }))
  if (!created.code) throw new Error('create epäonnistui')
  const code = created.code
  const s0 = await (await fetch(`${BASE}/api/group/${code}`, { cache: 'no-store' })).json()
  const cards = s0.candidates as { id: string; title: string; role: string; emoji: string; openingHours?: string | null }[]

  // Etsi kaksi SAMAN roolin korttia + yksi toisen roolin kortti.
  // Preferoi kortteja ILMAN aukiolodataa — M1-moottori pudottaa kiinni olevat
  // kortit (esim. arkiravintolat lauantaina), joten tuntemattomat tunnit
  // tekevät fixturesta deterministisen ajankohdasta riippumatta.
  const byRole: Record<string, typeof cards> = {}
  for (const c of cards) (byRole[c.role] ??= []).push(c)
  const noHours = (c: { openingHours?: string | null }) => !c.openingHours
  const roleWithTwo =
    Object.keys(byRole).find(r => byRole[r].filter(noHours).length >= 2) ??
    Object.keys(byRole).find(r => byRole[r].length >= 2)
  if (!roleWithTwo) throw new Error('Pakassa ei kahta saman roolin korttia')
  const pair = byRole[roleWithTwo].filter(noHours)
  const [c1, c2] = pair.length >= 2 ? pair : byRole[roleWithTwo]
  const other = cards.find(c => c.role !== roleWithTwo)!

  // Äänestä kaikkia kolmea (jotta ne ovat "loved" swapin ehdokkaiksi)
  for (const c of [c1, c2, other]) {
    await post(`/api/group/${code}/vote`, { voterId: 'e2e-swap-voter', voterName: 'Testeri', cardId: c.id, vote: 'love' })
  }

  // Kirjoita result_plan suoraan kantaan (kaari: c1 + other) — ei AI-kutsua.
  // Kaaren päivä = HUOMINEN Helsingin ajassa → deterministinen ajankohdasta
  // riippumatta (ei nyt-raja; M1-moottori aikatauluttaa aina uudelleen).
  const huominen = new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Helsinki' })
    .format(new Date(Date.now() + 86400000))
  const mkStep = (c: typeof c1): Record<string, unknown> => ({ cardId: c.id, role: c.role, emoji: c.emoji, title: c.title, why: 'testi' })
  await sb.from('group_sessions').update({
    status: 'done',
    result_plan: { kind: 'arc', intro: 'testi', date: huominen, arc: [mkStep(c1), mkStep(other)] },
  }).eq('id', code)

  // Swap vaihe 0: c1:n pitäisi vaihtua c2:ksi (sama rooli, ainoa vaihtoehto).
  // M1: swap laskee koko kaaren uudelleen KRONOLOGISESTI, joten vaihtunut kortti
  // ei välttämättä ole enää indeksissä 0 — etsitään se roolilla, ei paikalla.
  const swapRes = await post(`/api/group/${code}/swap`, { hostId: 'e2e-swap-host', stepIndex: 0 })
  const swapBody = await j(swapRes)
  const sameRoleStep = (swapBody.plan?.arc ?? []).find((s: { role?: string; cardId?: string; title?: string }) => s.role === roleWithTwo)
  // Hyväksytään myös selkeä 400: jos kortti on aidosti aikatauluttamaton
  // (esim. kiinni kaarpäivänä — M1 ei tunge kiinni olevia kaareen).
  const swapOk = (swapRes.ok && sameRoleStep?.cardId === c2.id) ||
    (swapRes.status === 400 && typeof swapBody.error === 'string' && swapBody.error.includes('ei mahdu'))
  ok('swap korvaa vaiheen saman roolin tykätyllä (tai selkeä 400 kun aikatauluttamaton)', swapOk,
    swapRes.ok ? `"${c1.title}" → "${sameRoleStep?.title}"` : `HTTP ${swapRes.status} ${JSON.stringify(swapBody).slice(0, 150)}`)

  // Swap kortin, jolla EI ole saman roolin vaihtoehtoja (other on roolinsa
  // ainoa tykätty) → siisti 400. HUOM: toistuva swap SAMASSA roolissa kiertää
  // vaihtoehdot ympäri (c1↔c2) — se on tarkoituksellinen UX, ei "loppu".
  const otherRole = (other as { role: string }).role
  const otherIdx = (swapBody.plan?.arc ?? []).findIndex((s: { role?: string }) => s.role === otherRole)
  const swap2 = await post(`/api/group/${code}/swap`, { hostId: 'e2e-swap-host', stepIndex: otherIdx >= 0 ? otherIdx : 1 })
  const swap2Body = await j(swap2)
  ok('swap ilman vaihtoehtoja → siisti 400', swap2.status === 400 && typeof swap2Body.error === 'string', `HTTP ${swap2.status}`)

  // Väärä hostId → 403
  const swap3 = await post(`/api/group/${code}/swap`, { hostId: 'joku-muu', stepIndex: 0 })
  ok('swap vaatii hostin (403)', swap3.status === 403, `HTTP ${swap3.status}`)

  await sb.from('group_sessions').delete().eq('id', code)
  console.log(`ℹ️  siivottu: ${code}`)
}

main().then(
  () => { console.log(fail ? `\n${fail} epäonnistui` : '\nSwap-testit läpi 🎉'); process.exit(fail ? 1 : 0) },
  (err) => { console.error('❌', err); process.exit(1) },
)

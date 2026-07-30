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
  const cards = s0.candidates as { id: string; title: string; role: string; emoji: string }[]

  // Etsi kaksi SAMAN roolin korttia + yksi toisen roolin kortti
  const byRole: Record<string, typeof cards> = {}
  for (const c of cards) (byRole[c.role] ??= []).push(c)
  const roleWithTwo = Object.keys(byRole).find(r => byRole[r].length >= 2)
  if (!roleWithTwo) throw new Error('Pakassa ei kahta saman roolin korttia')
  const [c1, c2] = byRole[roleWithTwo]
  const other = cards.find(c => c.role !== roleWithTwo)!

  // Äänestä kaikkia kolmea (jotta ne ovat "loved" swapin ehdokkaiksi)
  for (const c of [c1, c2, other]) {
    await post(`/api/group/${code}/vote`, { voterId: 'e2e-swap-voter', voterName: 'Testeri', cardId: c.id, vote: 'love' })
  }

  // Kirjoita result_plan suoraan kantaan (kaari: c1 + other) — ei AI-kutsua
  const mkStep = (c: typeof c1): Record<string, unknown> => ({ cardId: c.id, role: c.role, emoji: c.emoji, title: c.title, why: 'testi' })
  await sb.from('group_sessions').update({
    status: 'done',
    result_plan: { kind: 'arc', intro: 'testi', arc: [mkStep(c1), mkStep(other)] },
  }).eq('id', code)

  // Swap vaihe 0: c1:n pitäisi vaihtua c2:ksi (sama rooli, ainoa vaihtoehto)
  const swapRes = await post(`/api/group/${code}/swap`, { hostId: 'e2e-swap-host', stepIndex: 0 })
  const swapBody = await j(swapRes)
  const newId = swapBody.plan?.arc?.[0]?.cardId
  ok('swap korvaa vaiheen saman roolin tykätyllä', swapRes.ok && newId === c2.id,
    swapRes.ok ? `"${c1.title}" → "${swapBody.plan?.arc?.[0]?.title}"` : `HTTP ${swapRes.status} ${JSON.stringify(swapBody).slice(0, 150)}`)

  // Swap uudelleen: vaihtoehdot loppuivat → siisti 400-virhe (ei kaataa)
  const swap2 = await post(`/api/group/${code}/swap`, { hostId: 'e2e-swap-host', stepIndex: 0 })
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

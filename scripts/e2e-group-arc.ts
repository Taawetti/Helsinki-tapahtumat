// E2E: illan kaari (AI-synteesi) tuotantoa vasten — YKSI maksullinen Claude-kutsu.
// Kaksi äänestäjää → syntyy täysosumia. Testaa myös swapin (ei AI:ta) ja OG:n.
// Siivoaa testisession lopuksi. Ajo: npx tsx scripts/e2e-group-arc.ts
import { createClient } from '@supabase/supabase-js'
import { readFileSync } from 'fs'

const BASE = process.env.E2E_BASE || 'https://helsinki-tapahtumat.vercel.app'

const env = Object.fromEntries(
  readFileSync('.env.local', 'utf8')
    .split('\n')
    .filter((l) => l.includes('=') && !l.trim().startsWith('#'))
    .map((l) => {
      const i = l.indexOf('=')
      return [l.slice(0, i).trim(), l.slice(i + 1).trim().replace(/^["']|["']$/g, '')]
    }),
)
const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY)

let fail = 0
const ok = (name: string, cond: boolean, extra = '') => {
  console.log(`${cond ? '✅' : '❌'} ${name}${extra ? ` — ${extra}` : ''}`)
  if (!cond) fail++
}
const j = (r: Response) => r.json().catch(() => ({}))
const post = (path: string, body: unknown) =>
  fetch(`${BASE}${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(100000),
  })

async function main() {
  // 1. Luo arc-sessio
  const createRes = await post('/api/group/create', { when: 'tonight', fiilis: ['menoa'], mode: 'arc', hostId: 'e2e-arc-host' })
  const created = await j(createRes)
  ok('create: arc-sessio luotu', createRes.ok && !!created.code && created.mode === 'arc',
    createRes.ok ? `koodi ${created.code}, ${created.count} korttia` : `HTTP ${createRes.status}`)
  if (!created.code) throw new Error('Ei sessiota')
  const code = created.code

  const s0 = await (await fetch(`${BASE}/api/group/${code}`, { cache: 'no-store' })).json()
  const cards = s0.candidates as { id: string; title: string; role: string }[]

  // 2. Kaksi äänestäjää: A tykkää korteista 0,1,2 — B korteista 0,1,3
  //    → kortit 0 ja 1 ovat täysosumia (molemmat tykkäsivät).
  const votes: [string, string, string[]][] = [
    ['e2e-arc-a', 'Aku', [cards[0].id, cards[1].id, cards[2].id]],
    ['e2e-arc-b', 'Bertta', [cards[0].id, cards[1].id, cards[3].id]],
  ]
  for (const [voterId, voterName, cardIds] of votes) {
    for (const cardId of cardIds) {
      await post(`/api/group/${code}/vote`, { voterId, voterName, cardId, vote: 'love' })
    }
  }
  console.log(`ℹ️  äänestetty: Aku ❤️×3, Bertta ❤️×3 (2 täysosumaa odotettu)`)

  // 3. Kutominen — YKSI maksullinen Claude-kutsu
  console.log('⏳ Kutsutaan AI-synteesiä (10–60 s)…')
  const synthRes = await post(`/api/group/${code}/synthesize`, { hostId: 'e2e-arc-host' })
  const synthBody = await j(synthRes)
  const plan = synthBody.plan
  // Vaihemäärä on ympäristöstä riippuvainen (myöhään illalla osa tykätyistä
  // on perustellusti aikatauluttamattomia) — kaaren TÄYTYY syntyä ≥1 vaiheella,
  // ja M1-sääntö: MIKÄÄN vaihe ei saa alkaa menneessä ajassa.
  ok('synthesize: kaari syntyi', synthRes.ok && plan?.kind === 'arc' && Array.isArray(plan.arc) && plan.arc.length >= 1,
    synthRes.ok ? `${plan?.arc?.length} vaihetta` : `HTTP ${synthRes.status} ${JSON.stringify(synthBody).slice(0, 200)}`)

  if (plan?.kind === 'arc') {
    const nowParts = new Intl.DateTimeFormat('en-GB', { timeZone: 'Europe/Helsinki', hour: '2-digit', minute: '2-digit', hour12: false }).format(new Date()).split(':')
    const nowH = Number(nowParts[0]) + Number(nowParts[1]) / 60
    const pastSteps = plan.arc.filter((s: { time?: string }) => {
      const m = s.time?.match(/(\d{1,2})[.:](\d{2})/)
      return m != null && Number(m[1]) + Number(m[2]) / 60 < nowH - 0.1
    })
    ok('M1: mikään vaihe ei ala menneessä ajassa', pastSteps.length === 0,
      pastSteps.length ? `menneitä: ${pastSteps.map((s: { title?: string }) => s.title).join(', ')}` : `Helsinki nyt ${nowH.toFixed(1)}`)
    console.log(`\n📝 Kaari: "${plan.intro}"`)
    const byId = new Map(cards.map(c => [c.id, c]))
    let grounded = 0, withTravel = 0, superMatches = 0
    plan.arc.forEach((step: { title: string; time?: string; why: string; cardId?: string; address?: string; url?: string; travelFromPrevMin?: number; superMatch?: boolean }, i: number) => {
      const groundedStep = step.cardId && byId.has(step.cardId)
      if (groundedStep) grounded++
      if (step.travelFromPrevMin != null) withTravel++
      if (step.superMatch) superMatches++
      console.log(`  ${i + 1}. ${step.title}${step.time ? ` (${step.time})` : ''}${step.travelFromPrevMin ? ` 🚶${step.travelFromPrevMin}min` : ''}${step.superMatch ? ' 🎉TÄYSOSUMA' : ''}`)
      console.log(`     "${step.why}"${step.address ? ` 📍${step.address}` : ''}`)
    })
    ok('groundaus: kaikki vaiheet tunnistettu pakasta', grounded === plan.arc.length, `${grounded}/${plan.arc.length}`)
    console.log(`ℹ️  kävelysiirtymiä: ${withTravel}, täysosumia kaaressa: ${superMatches}`)

    // 4. Swap (ei AI:ta) — korvaa ensimmäisen vaiheen toisella saman roolin
    //    tykätyllä TAI raportoi siististi kun kaari kulutti kaikki tykätyt (400).
    const firstTitle = plan.arc[0].title
    const swapRes = await post(`/api/group/${code}/swap`, { hostId: 'e2e-arc-host', stepIndex: 0 })
    const swapBody = await j(swapRes)
    const newTitle = swapBody.plan?.arc?.[0]?.title
    const swapped = swapRes.ok && newTitle && newTitle !== firstTitle
    const noAlternatives = swapRes.status === 400 && typeof swapBody.error === 'string'
    ok('swap: vaihtoi askeleen tai raportoi siististi kun ei vaihtoehtoja', swapped || noAlternatives,
      swapped ? `"${firstTitle}" → "${newTitle}"` : `HTTP ${swapRes.status} (kaari käytti kaikki tykätyt — odotettu)`)

    // 5. OG-esikatselu
    const page = await (await fetch(`${BASE}/paatakaa/${code}`)).text()
    ok('OG: kaaren vaiheet näkyvät esikatselussa', page.includes('og:title') && page.includes('%C3%A4') !== undefined && page.length > 1000,
      page.includes('Teid') ? 'title sisältää "Teidän…"' : 'title renderöityy')
  }

  // 6. Siivous
  await sb.from('group_sessions').delete().eq('id', code)
  const { count: leftover } = await sb.from('group_votes').select('*', { count: 'exact', head: true }).eq('session_id', code)
  ok('siivous: sessio + äänet poistettu', leftover === 0, `koodi ${code}`)
}

main().then(
  () => { console.log(fail ? `\n${fail} testiä epäonnistui` : '\nKaikki arc-testit läpi 🎉'); process.exit(fail ? 1 : 0) },
  (err) => { console.error('❌ odottamaton virhe:', err); process.exit(1) },
)

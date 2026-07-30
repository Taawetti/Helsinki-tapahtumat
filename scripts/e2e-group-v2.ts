// E2E-tarkistus: ryhmäpäätös v2 -ketju tuotantoa vasten.
// Luo testisession, käyttää läpi pikapäätös-voiton, rematchin, äänen peruutuksen
// ja push-tilauksen — ja siivoaa kaiken lopuksi. Ajo: npx tsx scripts/e2e-group-v2.ts
import { createClient } from '@supabase/supabase-js'
import { readFileSync } from 'fs'

const BASE = process.env.E2E_BASE || 'https://mitatanaan.fi'

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
    signal: AbortSignal.timeout(90000),
  })

async function main() {
  let code = ''

  // 1. Luo pikapäätös-sessio
  const createRes = await post('/api/group/create', { when: 'tonight', fiilis: [], mode: 'quick', hostId: 'e2e-check' })
  const created = await j(createRes)
  ok('create: pikapäätös-sessio luotu', createRes.ok && !!created.code && created.mode === 'quick',
    createRes.ok ? `koodi ${created.code}, ${created.count} korttia` : `HTTP ${createRes.status} ${JSON.stringify(created)}`)
  if (!created.code) throw new Error('Ei sessiota — lopetetaan')
  code = created.code

  // 2. GET sessiotila — v2-kentät
  let s = await (await fetch(`${BASE}/api/group/${code}`, { cache: 'no-store' })).json()
  ok('GET: mode=quick, round=1, deckSize>0', s.mode === 'quick' && s.round === 1 && s.deckSize > 0,
    `mode=${s.mode} round=${s.round} deckSize=${s.deckSize}`)

  // 3. Push-tilaus + peruutus (session ollessa auki)
  const pushRes = await post(`/api/group/${code}/push-subscribe`, {
    voterId: 'e2e-voter', endpoint: 'https://example.com/e2e-push', keys: { p256dh: 'abc123', auth: 'def456' },
  })
  ok('push-subscribe POST hyväksytty', pushRes.ok, `HTTP ${pushRes.status}`)
  const pushDel = await fetch(`${BASE}/api/group/${code}/push-subscribe`, {
    method: 'DELETE', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ endpoint: 'https://example.com/e2e-push' }),
  })
  ok('push-subscribe DELETE hyväksytty', pushDel.ok, `HTTP ${pushDel.status}`)

  // 4. Skip-ääni + undo (DELETE) — ei voittoa vielä
  const cardA = s.candidates[0].id
  const skipRes = await post(`/api/group/${code}/vote`, { voterId: 'e2e-voter', voterName: 'E2E', cardId: cardA, vote: 'skip' })
  ok('vote skip hyväksytty', skipRes.ok, `HTTP ${skipRes.status}`)
  const undoRes = await fetch(`${BASE}/api/group/${code}/vote`, {
    method: 'DELETE', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ voterId: 'e2e-voter', cardId: cardA }),
  })
  ok('vote DELETE (undo) hyväksytty', undoRes.ok, `HTTP ${undoRes.status}`)

  // 5. Love-ääni → 1 osallistujan pikapäätöksessä pitää voittaa heti
  const cardB = s.candidates[1].id
  const loveRes = await post(`/api/group/${code}/vote`, { voterId: 'e2e-voter', voterName: 'E2E', cardId: cardB, vote: 'love' })
  const loveBody = await j(loveRes)
  ok('pikapäätös: enemmistövoitto ratkesi (won)', loveRes.ok && loveBody.won === true, JSON.stringify(loveBody))

  // 6. GET → done + groundattu quick-tulos
  s = await (await fetch(`${BASE}/api/group/${code}`, { cache: 'no-store' })).json()
  const qp = s.resultPlan
  ok('tulos: status=done, kind=quick, groundattu otsikko',
    s.status === 'done' && qp?.kind === 'quick' && typeof qp?.title === 'string' && qp.title.length > 0,
    qp ? `"${qp.title}" (${qp.votesFor}/${qp.voterCount} ääntä)` : `status=${s.status}`)

  // 7. OG-metadata valmiista sessiosta
  const page = await (await fetch(`${BASE}/paatakaa/${code}`)).text()
  ok('OG: tulossivun og:title sisältää voittajan', page.includes('og:title') && page.includes(qp?.title?.slice(0, 20) ?? '---'),
    'esikatselu renderöityy')

  // 8. Rematch — uusi kierros samalla koodilla
  const rematchRes = await post(`/api/group/${code}/rematch`, { hostId: 'e2e-check' })
  const rematchBody = await j(rematchRes)
  ok('rematch: uusi kierros luotu', rematchRes.ok && rematchBody.round === 2, JSON.stringify(rematchBody).slice(0, 120))
  s = await (await fetch(`${BASE}/api/group/${code}`, { cache: 'no-store' })).json()
  ok('rematch: status=open, round=2, äänet nollattu', s.status === 'open' && s.round === 2 && s.voteCount === 0,
    `status=${s.status} round=${s.round} voteCount=${s.voteCount}`)

  // 9. Siivous: poista testisessio (CASCADE äänet + push)
  await sb.from('group_sessions').delete().eq('id', code)
  const { count: leftover } = await sb.from('group_votes').select('*', { count: 'exact', head: true }).eq('session_id', code)
  const { data: gone } = await sb.from('group_sessions').select('id').eq('id', code).maybeSingle()
  ok('siivous: sessio + äänet poistettu (cascade)', !gone && leftover === 0, `koodi ${code} siivottu`)
}

main().then(
  () => { console.log(fail ? `\n${fail} testiä epäonnistui` : '\nKaikki E2E-testit läpi 🎉'); process.exit(fail ? 1 : 0) },
  async (err) => {
    console.error('❌ odottamaton virhe:', err)
    process.exit(1)
  },
)

import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase'
import { aggregateVotes, lovedCards, superMatchIds, walkMinutesBetween } from '@/lib/group'
import type { GroupArcPlan, PlanStep } from '@/lib/group'
import type { Candidate, GroupWhen, Fiilis } from '@/lib/candidate'
import { ROLE_META } from '@/lib/candidate'
import { sendGroupPush } from '@/lib/group-push'

// AI kutoo ryhmän ❤️-korteista YHDEN johdonmukaisen illan/päivän kaaren.
// v2: AI päättää vain JÄRJESTYKSEN ja kirjoittaa perustelut — kaikki faktat
// (nimi, osoite, linkki, kuva, koordinaatit, aika) GROUNDATAAN palvelimella
// session candidates-snapshotista, joten hallusinoituja paikkoja ei pääse tulokseen.
export const maxDuration = 60

const WHEN_FI: Record<GroupWhen, string> = { tonight: 'tänä iltana', day: 'koko päivän', weekend: 'viikonloppuna' }
const FIILIS_FI: Record<Fiilis, string> = { menoa: 'menoa/energiaa', rento: 'rento', kulttuuri: 'kulttuuri', ulkoilu: 'ulkoilu', ruoka: 'ruoka pääosassa' }

// AI:n palauttama välimuoto (ennen groundausta).
interface AiStep {
  cardId?: string
  role: string
  emoji: string
  title: string
  time?: string
  why: string
}

function buildPrompt(loved: Candidate[], when: GroupWhen, fiilis: Fiilis[], superIds: Set<string>): { system: string; user: string } {
  const cardLines = loved
    .map(c =>
      `- [${c.id}] (${ROLE_META[c.role].label}) ${c.title}` +
      `${c.time ? ` · AIKAA: ${c.time}` : ''}` +
      `${c.badge ? ` · ${c.badge}` : ''}` +
      `${c.priceLevel ? ` · hintataso ${'€'.repeat(Math.min(4, c.priceLevel))}` : ''}` +
      `${c.address ? ` · ${c.address}` : ''}` +
      `${c.lat != null && c.lon != null ? ` · sijainti ${c.lat.toFixed(3)},${c.lon.toFixed(3)}` : ''}` +
      `${superIds.has(c.id) ? ' · ⭐ TÄYSOSUMA (kaikki tykkäsivät!)' : ''}` +
      `${c.why ? ` — ${c.why}` : ''}`,
    )
    .join('\n')

  const system = `Olet Helsingin illan suunnittelija. Tehtäväsi: kutoa ryhmän ÄÄNESTÄMISTÄ (tykätyistä) kohteista YKSI johdonmukainen, sujuva kaari ${WHEN_FI[when]}.

SÄÄNNÖT:
- Käytä VAIN annettuja kortteja. Älä keksi paikkoja. Viittaa jokaiseen vaiheeseen kortin id:llä (cardId).
- Järjestä kaari LOGISTISESTI ja tarinallisesti: tyypillinen kulku on tekeminen/kulttuuri → ruoka → drinkit → pääohjelma (keikka/klubi), mutta sovita ryhmän korttien mukaan. Ruoka on usein illan ankkuri.
- Sijainti-rivit kertovat koordinaatit — MINIMOI matka: peräkkäisten vaiheiden tulisi olla lähellä toisiaan (käveltävissä), älä hyppäytä kaupungin yli edestakaisin.
- TÄYSOSUMA-kortit (kaikki tykkäsivät) ovat ryhmän suosikkeja — käytä ne kaaren selkärankana, jos lainkaan mahdollista.
- Anna jokaiselle vaiheelle KONKREETTINEN kellonaika (time-kenttä, muoto "klo 19"): tapahtumilla on AIKAA-merkitty todellinen alkamisaika — käytä sitä, älä keksi omaa. Ruokapaikoille arvioi luonteva aika suhteessa pääohjelmaan.
- Valitse 3–6 vaihetta. Jos korttia on roolista useampi, valitse paras/sopivin — älä tunge kaikkia. Voit jättää heikommin sopivat pois.
- Pidä kaari hinnaltaan ja tunnelmaltaan johdonmukaisena.${fiilis.length ? `\n- Ryhmän fiilis: ${fiilis.map(f => FIILIS_FI[f]).join(', ')} — painota sitä (mutta älä pakota).` : ''}
- Kirjoita lämpimästi ja innostavasti suomeksi, kuin hyvä kaveri joka tuntee kaupungin. Lyhyet, konkreettiset perustelut.

Palauta VAIN validi JSON tässä muodossa (ei muuta tekstiä, ei koodilohkoa):
{"intro":"1–2 lausetta illan tunnelmasta","arc":[{"cardId":"kortin id","role":"food|drinks|activity|program","emoji":"1 emoji","title":"paikan nimi","time":"klo 19","why":"1 lause miksi tämä tähän kohtaan kaarta"}],"outro":"1 kannustava lopetuslause"}`

  const user = `Ajankohta: ${WHEN_FI[when]}\nRyhmän tykkäämät kohteet (roolit suluissa):\n${cardLines}\n\nKudo näistä paras kaari.`
  return { system, user }
}

function extractJson(text: string): { intro: string; arc: AiStep[]; outro?: string } | null {
  // Malli voi joskus kääriä koodilohkoon tai lisätä tekstiä — poimi ensimmäinen {...}.
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/)
  const raw = fenced ? fenced[1] : text
  const start = raw.indexOf('{')
  const end = raw.lastIndexOf('}')
  if (start < 0 || end <= start) return null
  try {
    const obj = JSON.parse(raw.slice(start, end + 1))
    if (!obj || !Array.isArray(obj.arc)) return null
    return {
      intro: typeof obj.intro === 'string' ? obj.intro : '',
      arc: obj.arc.filter((a: unknown) => a && typeof (a as { title?: unknown }).title === 'string').map((a: Record<string, unknown>) => ({
        cardId: typeof a.cardId === 'string' ? a.cardId : undefined,
        role: typeof a.role === 'string' ? a.role : 'activity',
        emoji: typeof a.emoji === 'string' ? a.emoji : '✨',
        title: a.title as string,
        time: typeof a.time === 'string' && a.time.trim() ? a.time : undefined,
        why: typeof a.why === 'string' ? a.why : '',
      })),
      outro: typeof obj.outro === 'string' ? obj.outro : undefined,
    }
  } catch { return null }
}

// GROUNDAUS: AI:n vaiheet + candidates-snapshot → lopulliset PlanStep-faktat.
// Vaiheet ilman tunnistettua cardId:tä KARSITAAN (hallusinaatiosuoja).
// Laskee samalla kävelyajat peräkkäisten vaiheiden välille ja täysosuma-liput.
export function groundSteps(aiSteps: AiStep[], candidates: Candidate[], superIds: Set<string>): PlanStep[] {
  const byId = new Map(candidates.map(c => [c.id, c]))
  const steps: PlanStep[] = []

  for (const ai of aiSteps) {
    const c = ai.cardId ? byId.get(ai.cardId) : undefined
    if (!c) continue // tuntematon/hallusinoitu kortti → pois
    steps.push({
      cardId: c.id,
      role: c.role,
      emoji: c.emoji,
      title: c.title,
      time: c.time || ai.time,     // tapahtuman todellinen aika voittaa AI:n arvauksen
      why: ai.why,
      address: c.address,
      url: c.url,
      image: c.image,
      lat: c.lat,
      lon: c.lon,
      rating: c.rating,
      badge: c.badge,
      isFree: c.isFree,
      priceLevel: c.priceLevel,
      superMatch: superIds.has(c.id) || undefined,
    })
  }

  // Kävelysiirtymät peräkkäisten vaiheiden välille (haversine).
  for (let i = 1; i < steps.length; i++) {
    const min = walkMinutesBetween(steps[i - 1], steps[i])
    if (min != null) steps[i].travelFromPrevMin = min
  }
  return steps
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ code: string }> }) {
  const { code } = await params
  if (!supabaseAdmin) return NextResponse.json({ error: 'Supabase ei ole konfiguroitu' }, { status: 500 })
  const apiKey = process.env.ANTHROPIC_API_KEY
  if (!apiKey) return NextResponse.json({ error: 'ANTHROPIC_API_KEY puuttuu' }, { status: 500 })

  const body = await req.json().catch(() => ({}))
  const hostId: string | null = typeof body.hostId === 'string' ? body.hostId.slice(0, 64) : null
  const regenerate = body.regenerate === true

  const sessionId = code.toUpperCase()
  const { data: session } = await supabaseAdmin
    .from('group_sessions')
    .select('candidates, status, when_filter, fiilis, mode, result_plan, host_id')
    .eq('id', sessionId).maybeSingle()
  if (!session) return NextResponse.json({ error: 'Sessiota ei löydy' }, { status: 404 })
  if (session.mode === 'quick') {
    return NextResponse.json({ error: 'Pikapäätös-sessiossa voittaja ratkeaa äänillä automaattisesti' }, { status: 400 })
  }
  if (session.status === 'done' && session.result_plan && !regenerate) {
    return NextResponse.json({ plan: session.result_plan, status: 'done' }) // idempotentti
  }
  if (session.status === 'synthesizing') {
    return NextResponse.json({ status: 'synthesizing' }, { status: 202 }) // joku kutoo jo — pollaa
  }
  // Vain aloittaja saa kutoa (jos host_id on asetettu) — estää maksullisen kutsun spämmäyksen.
  if (session.host_id && session.host_id !== hostId) {
    return NextResponse.json({ error: 'Vain aloittaja voi kutoa kaaren' }, { status: 403 })
  }

  const { data: voteRows } = await supabaseAdmin
    .from('group_votes').select('voter_id, voter_name, card_id, vote').eq('session_id', sessionId)
  const candidates = (session.candidates ?? []) as Candidate[]
  const { votes, participants } = aggregateVotes(voteRows ?? [], candidates.length)
  const loved = lovedCards(candidates, votes)
  if (loved.length < 1) return NextResponse.json({ error: 'Ei vielä tykättyjä kortteja — swaipatkaa ensin' }, { status: 400 })

  // ATOMINEN lukko (compare-and-swap): päivitä 'synthesizing' VAIN jos status on
  // odotettu ('open', tai 'done' kun kyseessä on tietoinen uudelleenkutominen).
  // Jos 0 riviä päivittyi, joku toinen kutsu ehti ensin → älä kutsu maksullista
  // Clauda toiste. Estää julkisen reitin N-kertaisen laskutuksen.
  const fromStatus = regenerate ? 'done' : 'open'
  const { data: locked } = await supabaseAdmin
    .from('group_sessions').update({ status: 'synthesizing' })
    .eq('id', sessionId).eq('status', fromStatus).select('id')
  if (!locked || locked.length === 0) {
    return NextResponse.json({ status: 'synthesizing' }, { status: 202 })
  }
  // Paikallinen viite: TS ei kavenna import-bindingia closureen asti.
  const db = supabaseAdmin
  const releaseLock = () => db.from('group_sessions').update({ status: fromStatus }).eq('id', sessionId)

  const superIds = superMatchIds(votes, participants.length)
  const { system, user } = buildPrompt(loved, session.when_filter as GroupWhen, (session.fiilis ?? []) as Fiilis[], superIds)

  let planText = ''
  try {
    const res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-api-key': apiKey, 'anthropic-version': '2023-06-01' },
      body: JSON.stringify({
        model: 'claude-opus-4-8',
        max_tokens: 2000,
        system,
        messages: [{ role: 'user', content: user }],
      }),
      signal: AbortSignal.timeout(55000),
    })
    if (!res.ok) {
      await releaseLock()
      const errTxt = await res.text().catch(() => '')
      console.error('[group-synthesize] claude error', res.status, errTxt.slice(0, 300))
      return NextResponse.json({ error: 'AI-synteesi epäonnistui, yritä uudelleen' }, { status: 502 })
    }
    const data = await res.json()
    planText = data?.content?.[0]?.text ?? ''
  } catch (err) {
    await releaseLock()
    console.error('[group-synthesize] fetch error', err)
    return NextResponse.json({ error: 'AI-synteesi aikakatkaistiin, yritä uudelleen' }, { status: 504 })
  }

  const parsed = extractJson(planText)
  const grounded = parsed ? groundSteps(parsed.arc, candidates, superIds) : []
  if (!parsed || grounded.length === 0) {
    await releaseLock()
    console.error('[group-synthesize] parse/ground failed:', planText.slice(0, 300))
    return NextResponse.json({ error: 'AI:n vastausta ei voitu jäsentää, yritä uudelleen' }, { status: 502 })
  }

  const plan: GroupArcPlan = { kind: 'arc', intro: parsed.intro, arc: grounded, outro: parsed.outro }

  const { error } = await supabaseAdmin
    .from('group_sessions').update({ status: 'done', result_plan: plan }).eq('id', sessionId)
  if (error) {
    // Älä jätä lukkoa 'synthesizing'-tilaan jumiin → vapauta, jotta voi yrittää uudelleen.
    await releaseLock()
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  // Awaitataan lähetys (vrt. vote-reitti): serverless voi jäätyä vastauksen jälkeen.
  await sendGroupPush(sessionId, {
    title: '🎉 Illan kaari valmis!',
    body: plan.arc[0] ? `Alkuun: ${plan.arc[0].title} — katso koko suunnitelma.` : 'AI kutoi teille illan kaaren — katso suunnitelma.',
    url: `/paatakaa/${sessionId}`,
  })

  return NextResponse.json({ plan, status: 'done' })
}

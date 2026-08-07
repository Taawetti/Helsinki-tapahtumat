import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase'
import { aggregateVotes, lovedCards, superMatchIds } from '@/lib/group'
import type { GroupArcPlan } from '@/lib/group'
import type { Candidate, GroupWhen, Fiilis } from '@/lib/candidate'
import { ROLE_META } from '@/lib/candidate'
import { sendGroupPush } from '@/lib/group-push'
import { buildDeterministicArc, groundSteps } from '@/lib/group-arc'
import type { AiStep } from '@/lib/group-arc'
import { helsinkiNow, helsinkiToday } from '@/lib/helsinki-time'
import { enrichTransitTimes } from '@/lib/digitransit'
import { isHostSession } from '@/lib/group-host'

// Illan kaaren kutominen. OLETUS: deterministinen moottori (lib/group-arc) —
// 0 €, välitön, ei ulkoisia riippuvuuksia. AI-polku (Claude) on valinnainen
// tehoste ja kytketään päälle env:llä GROUP_AI_MODE=anthropic (+ ANTHROPIC_API_KEY).
export const maxDuration = 60

const WHEN_FI: Record<GroupWhen, string> = { tonight: 'tänä iltana', day: 'koko päivän', weekend: 'viikonloppuna' }
const FIILIS_FI: Record<Fiilis, string> = { menoa: 'menoa/energiaa', rento: 'rento', kulttuuri: 'kulttuuri', ulkoilu: 'ulkoilu', ruoka: 'ruoka pääosassa' }

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

export async function POST(req: NextRequest, { params }: { params: Promise<{ code: string }> }) {
  const { code } = await params
  if (!supabaseAdmin) return NextResponse.json({ error: 'Supabase ei ole konfiguroitu' }, { status: 500 })

  const body = await req.json().catch(() => ({}))
  const hostId: string | null = typeof body.hostId === 'string' ? body.hostId.slice(0, 64) : null
  const hostSecret: string | null = typeof body.hostSecret === 'string' ? body.hostSecret.slice(0, 80) : null
  const regenerate = body.regenerate === true

  const sessionId = code.toUpperCase()
  const { data: session } = await supabaseAdmin
    .from('group_sessions')
    .select('candidates, status, when_filter, fiilis, mode, custom_start, result_plan, host_id, host_secret')
    .eq('id', sessionId).maybeSingle()
  if (!session) return NextResponse.json({ error: 'Sessiota ei löydy' }, { status: 404 })
  if (session.mode === 'quick') {
    return NextResponse.json({ error: 'Pikapäätös-sessiossa voittaja ratkeaa äänillä automaattisesti' }, { status: 400 })
  }
  const prevPlan = session.result_plan as GroupArcPlan | null
  if (session.status === 'done' && prevPlan && !regenerate) {
    return NextResponse.json({ plan: prevPlan, status: 'done' }) // idempotentti
  }
  if (session.status === 'synthesizing') {
    return NextResponse.json({ status: 'synthesizing' }, { status: 202 }) // joku kutoo jo — pollaa
  }
  // Host-portti: salainen host_secret (uudet sessiot) tai julkinen host_id (legacy)
  if (!isHostSession(session, { hostId, hostSecret })) {
    return NextResponse.json({ error: 'Vain aloittaja voi kutoa kaaren' }, { status: 403 })
  }

  const { data: voteRows } = await supabaseAdmin
    .from('group_votes').select('voter_id, voter_name, card_id, vote').eq('session_id', sessionId)
  const candidates = (session.candidates ?? []) as Candidate[]
  const { votes, participants } = aggregateVotes(voteRows ?? [], candidates.length)
  const loved = lovedCards(candidates, votes)
  if (loved.length < 1) return NextResponse.json({ error: 'Ei vielä tykättyjä kortteja — swaipatkaa ensin' }, { status: 400 })

  const superIds = superMatchIds(votes, participants.length)
  const when = session.when_filter as GroupWhen
  const fiilis = (session.fiilis ?? []) as Fiilis[]
  const fromStatus = regenerate ? 'done' : 'open'
  // Kiertovariantti: "kudo uudelleen" antaa eri yhdistelmän (myös rules-moottorilla)
  const variant = regenerate ? (prevPlan?.variant ?? 0) + 1 : 0

  // Kaaren todellinen päivä — ratkaisee viikonpäivän aukioloaikoihin:
  // oma päivävalinta > viikonloppu (seuraava la) > tänään.
  const arcDate = ((): string => {
    const custom = (session.custom_start ?? null) as string | null
    if (custom) return custom
    const d = new Date(`${helsinkiToday()}T12:00:00`)
    if (when === 'weekend') {
      const dow = (d.getDay() + 6) % 7 // ma=0 … su=6
      d.setDate(d.getDate() + ((5 - dow + 7) % 7))
    }
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
  })()

  // ── Moottorin valinta: rules (oletus, 0 €) tai AI (env-lipulla) ──
  const useAi = process.env.GROUP_AI_MODE === 'anthropic' && !!process.env.ANTHROPIC_API_KEY

  if (!useAi) {
    // DETERMINISTINEN POLKU — välitön, ei lukkoa tarvita AI-kutsun ajaksi;
    // pelkkä atomipäivitys (CAS) riittää kilpailevien kutsujen varalta.
    // nowH: kaari ei ala menneessä ajassa (vain kun kaari on TÄNÄÄN).
    const nowH = arcDate === helsinkiToday()
      ? helsinkiNow().getHours() + helsinkiNow().getMinutes() / 60
      : undefined
    const plan = buildDeterministicArc(loved, votes, superIds, { when, variant, date: arcDate, nowH })
    if (!plan) return NextResponse.json({ error: 'Tykätyistä ei saada muodostettua kaarta — tykätkää lisää kohteita tai kudokaa uudelleen' }, { status: 400 })

    // Todelliset joukkoliikenneajat transit-väleille (Digitransit, jos avain on)
    plan.arc = await enrichTransitTimes(plan.arc)

    const { data: updated } = await supabaseAdmin
      .from('group_sessions').update({ status: 'done', result_plan: plan })
      .eq('id', sessionId).eq('status', fromStatus).select('id')
    if (!updated?.length) {
      // Joku ehti ensin → palauta ajantasainen tila
      return NextResponse.json({ status: 'synthesizing' }, { status: 202 })
    }

    await sendGroupPush(sessionId, {
      title: '🎉 Suunnitelma valmis!',
      body: plan.arc[0] ? `Alkuun: ${plan.arc[0].title} — katso koko kaari.` : 'Teidän kaari on valmis — katso suunnitelma.',
      url: `/paatakaa/${sessionId}`,
    })
    return NextResponse.json({ plan, status: 'done' })
  }

  // ── AI-POLKU (GROUP_AI_MODE=anthropic) ──
  const apiKey = process.env.ANTHROPIC_API_KEY!

  // ATOMINEN lukko (compare-and-swap): päivitä 'synthesizing' VAIN jos status on
  // odotettu. Estää maksullisen kutsun toistumisen kilpailevilta kutsuilta.
  const { data: locked } = await supabaseAdmin
    .from('group_sessions').update({ status: 'synthesizing' })
    .eq('id', sessionId).eq('status', fromStatus).select('id')
  if (!locked || locked.length === 0) {
    return NextResponse.json({ status: 'synthesizing' }, { status: 202 })
  }
  const db = supabaseAdmin
  const releaseLock = () => db.from('group_sessions').update({ status: fromStatus }).eq('id', sessionId)

  const { system, user } = buildPrompt(loved, when, fiilis, superIds)

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

  const plan: GroupArcPlan = { kind: 'arc', engine: 'ai', variant, date: arcDate, intro: parsed.intro, arc: grounded, outro: parsed.outro }

  const { error } = await supabaseAdmin
    .from('group_sessions').update({ status: 'done', result_plan: plan }).eq('id', sessionId)
  if (error) {
    await releaseLock()
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  await sendGroupPush(sessionId, {
    title: '🎉 Illan kaari valmis!',
    body: plan.arc[0] ? `Alkuun: ${plan.arc[0].title} — katso koko suunnitelma.` : 'AI kutoi teille illan kaaren — katso suunnitelma.',
    url: `/paatakaa/${sessionId}`,
  })

  return NextResponse.json({ plan, status: 'done' })
}

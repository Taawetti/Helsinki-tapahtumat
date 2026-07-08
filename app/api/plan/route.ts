import { NextRequest } from 'next/server'

export const maxDuration = 60

// ─── LinkedEvents types ───────────────────────────────────────────────────────

interface LEEvent {
  name?: { fi?: string; en?: string }
  start_time?: string
  short_description?: { fi?: string; en?: string }
  location?: { name?: { fi?: string; en?: string } }
  offers?: Array<{ is_free?: boolean; price?: { fi?: string; en?: string }; info_url?: string }>
}

interface EventRef {
  name: string
  ticketUrl: string | null
}

// ─── Pre-fetch events from LinkedEvents ──────────────────────────────────────

async function fetchLinkedEvents(
  startDate: string,
  dayCount: number,
): Promise<{ text: string; refs: EventRef[] }> {
  const end = new Date(startDate + 'T12:00:00')
  end.setDate(end.getDate() + dayCount - 1)
  const endDate = end.toISOString().slice(0, 10)

  const params = new URLSearchParams({
    format:    'json',
    start:     startDate,
    end:       endDate,
    page_size: '20',
    sort:      'start_time',
    division:  'helsinki',
    include:   'location',
  })

  try {
    const res = await fetch(
      `https://api.hel.fi/linkedevents/v1/event/?${params}`,
      { signal: AbortSignal.timeout(6000) }
    )
    if (!res.ok) return { text: 'Tapahtumahaku epäonnistui.', refs: [] }

    const data = await res.json()
    const events: LEEvent[] = data.data || []
    if (events.length === 0) return { text: 'LinkedEventsistä ei löytynyt tapahtumia tälle päivälle.', refs: [] }

    const slice = events.slice(0, 15)

    const text = slice.map(e => {
      const name   = e.name?.fi || e.name?.en || 'Nimetön'
      const time   = e.start_time?.slice(11, 16) || ''
      const loc    = e.location?.name?.fi || e.location?.name?.en || ''
      const isFree = e.offers?.[0]?.is_free
      const price  = isFree ? 'Ilmainen' : (e.offers?.[0]?.price?.fi || e.offers?.[0]?.price?.en || '')
      const desc   = (e.short_description?.fi || e.short_description?.en || '').slice(0, 120)
      return `- ${time ? time + ' ' : ''}${name}${loc ? ' @ ' + loc : ''}${price ? ` [${price}]` : ''}${desc ? ': ' + desc : ''}`
    }).join('\n')

    const refs: EventRef[] = slice
      .map(e => ({
        name:      e.name?.fi || e.name?.en || '',
        ticketUrl: e.offers?.[0]?.info_url || null,
      }))
      .filter(r => r.name.length > 0)

    return { text, refs }
  } catch {
    return { text: 'Tapahtumahaku epäonnistui (verkkovirhe).', refs: [] }
  }
}

// ─── Group labels ─────────────────────────────────────────────────────────────

const GROUP_FI: Record<string, string> = {
  solo:     'yksin matkustava henkilö',
  couple:   'pariskunta',
  family:   'lapsiperhe',
  friends:  'kaveriporukka',
  business: 'liikematkailija',
}

// ─── Finnish date formatting (server-safe) ───────────────────────────────────

function formatDateFI(iso: string, dayCount: number): string {
  const d = new Date(iso + 'T12:00:00')
  const fi = d.toLocaleDateString('fi-FI', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })
  if (dayCount <= 1) return fi
  const end = new Date(d)
  end.setDate(end.getDate() + dayCount - 1)
  const fiEnd = end.toLocaleDateString('fi-FI', { day: 'numeric', month: 'long' })
  return `${fi} – ${fiEnd}`
}

// ─── POST handler ─────────────────────────────────────────────────────────────

const BUDGET_LABELS: Record<string, string> = {
  free:    'Ilmainen — käytä VAIN ilmaisia kohteita, ei lipunmyyntiä',
  budget:  'Edullinen — max ~15 € per aktiviteetti',
  normal:  'Normaali — 15–40 € per aktiviteetti, sopiva laatu',
  premium: 'Premium — parasta laadusta tinkimättä, hinta ei rajoita',
}

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null)
  if (!body) return new Response('Bad request', { status: 400 })

  const {
    groupType = 'solo',
    travelDate,
    dayCount   = 1,
    interests  = [] as string[],
    budget     = 'normal',
    messages   = [] as Array<{ role: string; content: string }>,
  } = body

  if (!travelDate) return new Response('Missing travelDate', { status: 400 })

  const apiKey = process.env.ANTHROPIC_API_KEY
  if (!apiKey) return new Response('Server config error', { status: 500 })

  // Pre-fetch events from LinkedEvents (real-time data for Claude)
  const { text: eventData, refs: eventRefs } = await fetchLinkedEvents(travelDate, dayCount)

  const group        = GROUP_FI[groupType] || 'matkailija'
  const interestStr  = (interests as string[]).length > 0
    ? (interests as string[]).join(', ')
    : 'yleinen Helsinki-kokemus'
  const dateLabel    = formatDateFI(travelDate, dayCount)
  const durationText = dayCount === 1 ? 'yksi päivä' : `${dayCount} päivää`
  const budgetLabel  = BUDGET_LABELS[budget] || BUDGET_LABELS.normal

  const systemPrompt = `Olet Helsinki-matkailuasiantuntija. Luot personoituja, aikataulutettuja päiväohjelmia helsinkiläisille ja turisteille. Kirjoita AINA suomeksi.

TIEDOT:
- Kohderyhmä: ${group}
- Päivämäärä: ${dateLabel}
- Kesto: ${durationText}
- Kiinnostukset: ${interestStr}
- Budjetti: ${budgetLabel}

TÄMÄNPÄIVÄISET TAPAHTUMAT LINKEDEVENTSISTÄ (käytä näitä jos sopivat kohderyhmälle ja budjettiin):
${eventData}

SUOSITUT HELSINKI-KOHTEET (täydennä niillä):
- Aamupalat: Hakaniemen tori (perinteiset kojut), Kaffa Roastery (Punavuori), Fazer Café (Kluuvi)
- Kulttuuri: HAM Helsingin taidemuseo, Amos Rex, Kansallismuseo, Design Museum, Kansallisgalleria
- Ulkoilu: Kauppatori, Esplanadi, Töölönlahti, Seurasaari, Suomenlinna (lautta 15min)
- Ruoka: Hakaniemen kauppahalli, Katajanokka, Punavuori, Töölö
- Yöelämä: Kallio (Pub-kierros), Punavuori (cocktailbaarit), Kaisaniemi (yökerhot)
- Lapsiperheille: Korkeasaari, HEUREKA, SEA LIFE, Linnanmäki (kesäisin), Muumimuseo Tampere-lähellä

MUOTO — käytä TARKASTI tätä jokaisen kohteen kohdalla:
🕘 [HH:MM] — **[Kohteen nimi]**
📍 [Osoite tai kaupunginosa] | ⏱ [Arvioitu kesto] | 💰 [Hinta tai "Ilmainen"]
[1-2 lausetta: miksi tämä sopii juuri tälle kohderyhmälle + käytännön vinkki]

SÄÄNNÖT:
- Aloita suoraan ensimmäisestä kohteesta (ei johdantoa, ei "Tässä on suunnitelma:")
- Maantieteellinen logiikka: saman kaupunginosan kohteet peräkkäin
- Ruokailu aamulla (09-10), lounas (12-13), päiväkahvi (15), illallinen (18-20)
- Lapsiperheelle: lepoaika 13-15, ei liikaa kävelyä (max 400m pysäkkien välillä)
- Pariskunnalle: romanttinen tunnelma, laadukas ravintola illalla
- Kaveriporukalle: enemmän yöelämää ja baareja iltaan
- Liikematkailijalle: tiivis 2-3 tunnin paketti + asiallinen illallinen${dayCount > 1 ? '\n- Merkitse päivät: ## Päivä 1 (pe DD.MM), ## Päivä 2 (la DD.MM) jne.' : ''}
- Ei oleteta auton käyttöä: kaikki julkisilla tai kävellen`

  const msgs = messages.length > 0
    ? messages
    : [{ role: 'user', content: `Luo täydellinen ${durationText} päiväohjelma Helsinkiin.` }]

  // Stream from Claude
  let claudeRes: Response
  try {
    claudeRes = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type':    'application/json',
        'x-api-key':        apiKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model:      'claude-sonnet-5',
        max_tokens: 2500,
        stream:     true,
        system:     systemPrompt,
        messages:   msgs,
      }),
    })
  } catch {
    return new Response('Claude unreachable', { status: 503 })
  }

  if (!claudeRes.ok) {
    const errText = await claudeRes.text().catch(() => '')
    console.error('[plan] Claude error:', claudeRes.status, errText)
    return new Response('Claude error', { status: 502 })
  }

  // Parse Anthropic SSE → re-emit as simple `data: {text}` SSE
  const stream = new ReadableStream({
    async start(controller) {
      const reader  = claudeRes.body!.getReader()
      const decoder = new TextDecoder()
      let buf = ''

      const send = (payload: string) =>
        controller.enqueue(new TextEncoder().encode(`data: ${payload}\n\n`))

      // Emit event metadata before Claude text starts (client uses for ticket links)
      if (eventRefs.length > 0) {
        send(JSON.stringify({ type: 'meta', events: eventRefs }))
      }

      try {
        outer: while (true) {
          const { done, value } = await reader.read()
          if (done) break

          buf += decoder.decode(value, { stream: true })
          const lines = buf.split('\n')
          buf = lines.pop() ?? ''

          for (const line of lines) {
            if (!line.startsWith('data: ')) continue
            const raw = line.slice(6).trim()
            if (!raw) continue

            try {
              const ev = JSON.parse(raw)
              if (
                ev.type === 'content_block_delta' &&
                ev.delta?.type === 'text_delta' &&
                ev.delta.text
              ) {
                send(JSON.stringify({ text: ev.delta.text }))
              } else if (ev.type === 'message_stop') {
                send('[DONE]')
                break outer
              }
            } catch {
              // skip malformed JSON line
            }
          }
        }
      } catch (err) {
        console.error('[plan] stream error:', err)
        send('[DONE]')
      } finally {
        try { controller.close() } catch {}
        try { reader.cancel() } catch {}
      }
    },
  })

  return new Response(stream, {
    headers: {
      'Content-Type':     'text/event-stream',
      'Cache-Control':    'no-cache, no-transform',
      'Connection':       'keep-alive',
      'X-Accel-Buffering': 'no',
    },
  })
}

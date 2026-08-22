import { NextRequest, NextResponse } from 'next/server'
import { Resend } from 'resend'
import {
  checkSourceHealth,
  nextStreak,
  aggregateStreakSamples,
  VENUE_SCRAPERS,
  VENUE_ZERO_STREAK_ALERT_DAYS,
  VENUE_ERROR_STREAK_ALERT_DAYS,
  AGGREGATE_ZERO_STREAK_ALERT_DAYS,
  type StreakState,
} from '@/lib/source-health'
import { supabaseAdmin } from '@/lib/supabase'

// Päivittäinen lähdeterveyden kanaria — hälyttää jos tapahtumasyöte romahtaa
// (ks. lib/source-health.ts). Ajastus: vercel.json.
export const maxDuration = 60

const resend = new Resend(process.env.RESEND_API_KEY)
const FROM = process.env.RESEND_FROM_EMAIL || 'Mitä tänään <onboarding@resend.dev>'
const ALERT_TO = process.env.ALERT_EMAIL || 'timo.heinamaki@broven.fi'

export async function GET(req: NextRequest) {
  const auth = req.headers.get('authorization')
  const headerOk = !!process.env.CRON_SECRET && auth === `Bearer ${process.env.CRON_SECRET}`
  // Testilaukaisin: ?test=<CRON_SECRET> selaimessa (Bearer-headeria ei voi
  // asettaa selaimesta). Lähettää "kanaria pystyssä" -vahvistuksen → näet heti
  // toimiiko sähköpostiputki. Kertakäyttöinen omistajan itsetesti.
  const testParam = req.nextUrl.searchParams.get('test')
  const isSelfTest = !!process.env.CRON_SECRET && testParam === process.env.CRON_SECRET

  if (!headerOk && !isSelfTest) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  if (isSelfTest) {
    if (!process.env.RESEND_API_KEY) {
      return NextResponse.json({ test: true, emailed: false, error: 'RESEND_API_KEY puuttuu' }, { status: 500 })
    }
    try {
      await resend.emails.send({
        from: FROM,
        to: ALERT_TO,
        subject: '✅ Mitä tänään — lähdekanaria pystyssä',
        text:
          `Tämä on kertaluontoinen itsetesti: lähdeterveyden kanaria toimii ja ` +
          `sähköpostiputki osoitteeseen ${ALERT_TO} on kunnossa.\n\n` +
          `Jatkossa saat viestin VAIN jos tapahtumasyöte romahtaa ` +
          `(esim. jokin lähde kuolee hiljaa). Ei uutisia = hyvä uutinen.\n\n` +
          `Kanaria: /api/cron/source-health (päivittäin 09:00 UTC).`,
      })
      return NextResponse.json({ test: true, emailed: true, to: ALERT_TO })
    } catch (err) {
      console.error('source-health self-test email failed:', err)
      return NextResponse.json({ test: true, emailed: false, error: String(err) }, { status: 500 })
    }
  }

  const start = new Date().toISOString().slice(0, 10)

  // Hae + havaitse poikkeamat (sisältää kylmäkäynnistys-uudelleenyrityksen,
  // jottei väärä hälytys lähde cold-startin timeoutista).
  const { issues, payload } = await checkSourceHealth(req.nextUrl.origin)

  // Venue-skraperien meta-itseraportointi: lue jokaisen reitin meta { live,
  // scrapeError } ja päivitä source_health_state-putket. Hälytä vain kynnyksen
  // ylittyessä (0-live ≥5 pv, kova virhe ≥2 pv) — ei jokaisesta hetkellisestä
  // häiriöstä. Taulun puuttuessa (migraatio ajamatta) ohitetaan pehmeästi.
  const venueAlerts: string[] = []
  let streakTableReady = false
  try {
    const end = new Date(Date.now() + 6 * 86400000).toISOString().slice(0, 10)
    const metas = await Promise.allSettled(
      VENUE_SCRAPERS.map(async (name) => {
        const res = await fetch(`${req.nextUrl.origin}/api/${name}?start=${start}&end=${end}`, {
          signal: AbortSignal.timeout(10000),
        })
        if (!res.ok) return { name, live: null, scrapeError: `HTTP ${res.status}` }
        const data = await res.json()
        return {
          name,
          live: (data?.meta?.live ?? null) as number | null,
          scrapeError: (data?.meta?.scrapeError ?? null) as string | null,
        }
      })
    )

    if (supabaseAdmin) {
      const { data: rows, error: readErr } = await supabaseAdmin
        .from('source_health_state')
        .select('source, zero_streak, error_streak')
      if (readErr) {
        console.error('source-health: source_health_state-luku epäonnistui (migraatio ajamatta?):', readErr.message)
      } else {
        streakTableReady = true
        const prev = new Map<string, StreakState>(
          (rows ?? []).map((r) => [r.source, { zeroStreak: r.zero_streak, errorStreak: r.error_streak }])
        )
        const checkedAt = new Date().toISOString()
        const upserts = []
        for (const m of metas) {
          if (m.status !== 'fulfilled') continue
          const { name, live, scrapeError } = m.value
          const before = prev.get(name) ?? { zeroStreak: 0, errorStreak: 0 }
          const { next, alert } = nextStreak(before, { live, scrapeError })
          if (alert && next.errorStreak >= VENUE_ERROR_STREAK_ALERT_DAYS) {
            venueAlerts.push(`Skraperi '${name}' epäonnistunut ${next.errorStreak} pv peräkkäin: ${scrapeError}`)
          } else if (alert && next.zeroStreak >= VENUE_ZERO_STREAK_ALERT_DAYS) {
            venueAlerts.push(`Skraperi '${name}' 0 parsittua ${next.zeroStreak} pv peräkkäin — parseri tai sivu todennäköisesti rikki (tai pitkä hiljainen jakso)`)
          }
          upserts.push({ source: name, zero_streak: next.zeroStreak, error_streak: next.errorStreak, live, scrape_error: scrapeError, checked_at: checkedAt })
        }

        // KAIKKI MUUT LÄHTEET. Tämä on se aukko jonka takia helmet oli nollassa
        // ja espoo osoitti kuolleeseen domainiin kuukausia: per-lähde-valvonta
        // kattoi vain käsin lisätyt. Nyt jokainen aggregaatin raportoima lähde
        // saa putken, eikä yksikään voi olla hiljaa nollassa ikuisesti.
        // Otos tulee aggregaatin luvusta (lähteen palauttamat ENNEN dedupia),
        // joten dedupin syömät tapahtumat eivät näytä kuolemalta.
        for (const { name, sample } of aggregateStreakSamples(payload)) {
          const before = prev.get(name) ?? { zeroStreak: 0, errorStreak: 0 }
          const { next, alert } = nextStreak(before, sample, { zero: AGGREGATE_ZERO_STREAK_ALERT_DAYS })
          if (alert) {
            venueAlerts.push(
              `Lähde '${name}' palauttanut 0 tapahtumaa ${next.zeroStreak} pv peräkkäin — ` +
              `joko rikki tai kauden ulkopuolella. Tarkista kumpi.`
            )
          }
          upserts.push({ source: name, zero_streak: next.zeroStreak, error_streak: next.errorStreak, live: sample.live, scrape_error: null, checked_at: checkedAt })
        }
        if (upserts.length > 0) {
          const { error: upErr } = await supabaseAdmin.from('source_health_state').upsert(upserts)
          if (upErr) console.error('source-health: streak-upsert epäonnistui:', upErr.message)
        }
      }
    }
  } catch (err) {
    console.error('source-health: venue-meta-tarkistus epäonnistui:', err)
  }

  const allIssues = [...issues, ...venueAlerts]

  if (allIssues.length === 0) {
    return NextResponse.json({ ok: true, total: payload?.total ?? null, streakTableReady })
  }

  // Poikkeama havaittu → hälytä sähköpostilla.
  const subject = `⚠️ Mitä tänään — lähdehälytys (${allIssues.length})`
  const text =
    `Tapahtumasyötteessä havaittiin ${allIssues.length} poikkeama(a) (${start}):\n\n` +
    allIssues.map((i) => `• ${i}`).join('\n') +
    `\n\nTarkista admin → Lähteet sekä Vercel-lokit.\n` +
    `Automaattinen kanaria: /api/cron/source-health`

  let emailed = false
  if (process.env.RESEND_API_KEY) {
    try {
      await resend.emails.send({ from: FROM, to: ALERT_TO, subject, text })
      emailed = true
    } catch (err) {
      console.error('source-health: alert email failed:', err)
    }
  }
  console.error('SOURCE-HEALTH ALERT:', allIssues.join(' | '))

  // Jos hälytys meni perille → 200 (kanaria toimi). Jos EI (avain puuttuu tai
  // lähetys kaatui) → 5xx, jotta menetetty hälytys näkyy Vercelin cron-lokissa.
  return NextResponse.json({ alerted: true, emailed, issues: allIssues, streakTableReady }, { status: emailed ? 200 : 500 })
}

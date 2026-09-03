import type { Metadata } from 'next'
import Link from 'next/link'
import { headers } from 'next/headers'
import type { Event } from '@/lib/types'
import { getEventVibes } from '@/lib/event-classify'
import { VIBES } from '@/lib/types'
import { helsinkiToday } from '@/lib/helsinki-time'

// Helsinki-raportti: viikon tapahtumat lukuina — päivittyvä datanäyttely
// (PR/SEO). Palvelinrenderöity, tunnin välimuisti.
export const revalidate = 3600

export const metadata: Metadata = {
  title: 'Helsinki-raportti — tapahtumaviikko lukuina | Mitä tänään',
  description:
    'Helsingin tapahtumatarjonta lukuina: montako tapahtumaa, mitä missäkin päivässä, vilkkaimmat paikat ja ilmaistarjonta — koosteena 41 lähteestä, päivitetty tunneittain.',
  alternates: { canonical: '/raportti' },
}

interface Report {
  events: Event[]
  sources: { name: string; ok: boolean; count: number }[]
  today: string
  endDate: string
  failed: boolean
}

// Datan haku + laskennan raaka-aine — komponentin ulkopuolella (React Compiler
// -puhtaus: render-funktiossa ei saa kutsua Date.now() yms. epäpuhtaita).
async function loadReport(): Promise<Report> {
  const today = helsinkiToday()
  const endDate = new Date(Date.now() + 6 * 86400000).toISOString().slice(0, 10)

  const h = await headers()
  const host = h.get('x-forwarded-host') ?? h.get('host') ?? 'mitatanaan.fi'
  const proto = h.get('x-forwarded-proto') ?? 'https'
  const origin = `${proto}://${host}`

  try {
    const res = await fetch(`${origin}/api/events?start=${today}&end=${endDate}&page=1&municipality=helsinki`, {
      next: { revalidate: 3600 },
      signal: AbortSignal.timeout(45000),
    })
    if (!res.ok) throw new Error(`HTTP ${res.status}`)
    const data = await res.json()
    return {
      events: (data.events ?? []) as Event[],
      sources: (data.sources ?? []) as { name: string; ok: boolean; count: number }[],
      today,
      endDate,
      failed: false,
    }
  } catch {
    return { events: [], sources: [], today, endDate, failed: true }
  }
}

export default async function RaporttiPage() {
  const { events, sources, today, failed } = await loadReport()

  // ── Tilastot ──
  const byDay = new Map<string, number>()
  const byVenue = new Map<string, number>()
  const byVibe = new Map<string, number>()
  let freeCount = 0
  for (const e of events) {
    const day = e.startTime?.slice(0, 10)
    if (day) byDay.set(day, (byDay.get(day) ?? 0) + 1)
    const venue = e.location?.name?.trim()
    if (venue) byVenue.set(venue, (byVenue.get(venue) ?? 0) + 1)
    if (e.isFree) freeCount++
    for (const v of getEventVibes(e)) byVibe.set(v, (byVibe.get(v) ?? 0) + 1)
  }

  const dayRows = [...byDay.entries()].sort((a, b) => a[0].localeCompare(b[0]))
  const maxDay = Math.max(1, ...dayRows.map(([, n]) => n))
  const topVenues = [...byVenue.entries()].sort((a, b) => b[1] - a[1]).slice(0, 10)
  const maxVenue = Math.max(1, ...topVenues.map(([, n]) => n))
  const topVibes = [...byVibe.entries()]
    .map(([id, n]) => ({ ...VIBES.find(v => v.id === id), id, n }))
    .filter(v => v.label)
    .sort((a, b) => b.n - a.n)
    .slice(0, 8)
  const maxVibe = Math.max(1, ...topVibes.map(v => v.n))
  const freePct = events.length > 0 ? Math.round((freeCount / events.length) * 100) : 0
  const okSources = sources.filter(s => s.ok).length

  const fmtDay = (iso: string) =>
    new Intl.DateTimeFormat('fi-FI', { weekday: 'short', day: 'numeric', month: 'numeric' }).format(new Date(`${iso}T12:00:00`))

  return (
    <main className="max-w-2xl mx-auto px-4 pt-8 pb-24 space-y-8" style={{ background: '#0a0a0f' }}>
      <div>
        <p className="text-white/30 text-[11px] font-black uppercase tracking-[.2em] mb-1">Mitä tänään · tilastot</p>
        <h1 className="font-black text-white leading-tight" style={{ fontSize: 'clamp(1.8rem,6vw,2.6rem)', letterSpacing: '-0.03em' }}>
          Helsinki-raportti 📊
        </h1>
        <p className="text-white/55 text-[15px] font-semibold mt-2 leading-snug">
          Tapahtumaviikko lukuina — {fmtDay(today)} alkaen seitsemän päivää, {okSources > 0 ? `${okSources} lähteestä` : 'kaikista lähteistä'}.
          Päivittyy tunneittain.
        </p>
      </div>

      {failed ? (
        <div className="rounded-2xl p-6 text-center" style={{ background: 'rgba(255,255,255,.04)', border: '1px solid rgba(255,255,255,.08)' }}>
          <p className="text-white/60 font-bold">Tilastoja ei saatu ladattua juuri nyt — kokeile hetken kuluttua.</p>
        </div>
      ) : (
        <>
          {/* Kärkiluvut */}
          <div className="grid grid-cols-3 gap-2">
            {[
              { n: events.length, label: 'tapahtumaa / 7 pv' },
              { n: byDay.get(today) ?? 0, label: 'tapahtumaa tänään' },
              { n: `${freePct} %`, label: 'ilmaisia' },
            ].map(c => (
              <div key={c.label} className="rounded-2xl p-4 text-center" style={{ background: 'rgba(255,255,255,.04)', border: '1px solid rgba(255,255,255,.08)' }}>
                <p className="font-black text-white text-2xl leading-none">{c.n}</p>
                <p className="text-white/40 text-[11px] font-bold mt-1.5 uppercase tracking-wide">{c.label}</p>
              </div>
            ))}
          </div>

          {/* Viikon rytmi */}
          <section className="rounded-2xl p-5 space-y-2.5" style={{ background: 'rgba(255,255,255,.04)', border: '1px solid rgba(255,255,255,.08)' }}>
            <h2 className="font-black text-white text-[15px] mb-3">Viikon rytmi</h2>
            {dayRows.map(([day, n]) => (
              <div key={day} className="flex items-center gap-3">
                <span className="text-[12px] font-black text-white/50 w-24 shrink-0">{fmtDay(day)}</span>
                <div className="flex-1 h-5 rounded-md overflow-hidden" style={{ background: 'rgba(255,255,255,.06)' }}>
                  <div className="h-full rounded-md" style={{ width: `${(n / maxDay) * 100}%`, background: 'linear-gradient(90deg,#6b76ff,#a3abff)' }} />
                </div>
                <span className="text-[12px] font-black text-white/70 w-8 text-right">{n}</span>
              </div>
            ))}
          </section>

          {/* Kategoriat */}
          {topVibes.length > 0 && (
            <section className="rounded-2xl p-5 space-y-2.5" style={{ background: 'rgba(255,255,255,.04)', border: '1px solid rgba(255,255,255,.08)' }}>
              <h2 className="font-black text-white text-[15px] mb-3">Mitä ohjelmassa on</h2>
              {topVibes.map(v => (
                <div key={v.id} className="flex items-center gap-3">
                  <span className="text-[12px] font-black text-white/50 w-28 shrink-0 truncate">{v.emoji} {v.label}</span>
                  <div className="flex-1 h-5 rounded-md overflow-hidden" style={{ background: 'rgba(255,255,255,.06)' }}>
                    <div className="h-full rounded-md" style={{ width: `${(v.n / maxVibe) * 100}%`, background: 'linear-gradient(90deg,#10b981,#34d399)' }} />
                  </div>
                  <span className="text-[12px] font-black text-white/70 w-8 text-right">{v.n}</span>
                </div>
              ))}
            </section>
          )}

          {/* Vilkkaimmat paikat */}
          {topVenues.length > 0 && (
            <section className="rounded-2xl p-5 space-y-2.5" style={{ background: 'rgba(255,255,255,.04)', border: '1px solid rgba(255,255,255,.08)' }}>
              <h2 className="font-black text-white text-[15px] mb-3">Vilkkaimmat paikat (7 pv)</h2>
              {topVenues.map(([venue, n], i) => (
                <div key={venue} className="flex items-center gap-3">
                  <span className="text-[12px] font-black text-white/30 w-5 shrink-0 text-right">{i + 1}.</span>
                  <span className="text-[12px] font-bold text-white/60 w-40 shrink-0 truncate">{venue}</span>
                  <div className="flex-1 h-5 rounded-md overflow-hidden" style={{ background: 'rgba(255,255,255,.06)' }}>
                    <div className="h-full rounded-md" style={{ width: `${(n / maxVenue) * 100}%`, background: 'linear-gradient(90deg,#f59e0b,#fbbf24)' }} />
                  </div>
                  <span className="text-[12px] font-black text-white/70 w-8 text-right">{n}</span>
                </div>
              ))}
            </section>
          )}

          <p className="text-white/30 text-[12px] font-semibold leading-relaxed">
            {/* Lähdemäärä ja /lahteet-linkki poistettu (omistaja 3.9.2026:
                lähteet eivät ole julkista tietoa). */}
            Luvut koostetaan suoraan Mitä tänään -palvelun aggregaatista
            (tapahtumajärjestäjät, lipunmyyjät, venuet ja kulttuurikalenterit).
            Data on vapaasti viitattavissa lähdemerkinnällä ”Mitä tänään”.
          </p>
        </>
      )}
    </main>
  )
}

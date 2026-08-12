import type { Metadata } from 'next'
import Link from 'next/link'
import { headers } from 'next/headers'
import type { Event } from '@/lib/types'
import { pickWeeklyDigest, nextWeekendRange } from '@/lib/weekly-digest'
import { formatEventDate } from '@/lib/helsinki-time'

// Torstain pakka 🎁 — viikkodigestin julkinen sivu. Push-ilmoitus
// (app/api/cron/thursday-digest) ohjaa tänne torstaisin klo 16.
// Server-renderöity, ei klientikomponentteja; aggregaattihaku välimuistissa tunti.
export const revalidate = 3600

const BASE = process.env.NEXT_PUBLIC_SITE_URL || 'https://helsinki-tapahtumat.vercel.app'

export async function generateMetadata(): Promise<Metadata> {
  const { label } = nextWeekendRange()
  const title = 'Torstain pakka — viikonlopun 5 valittua | Mitä tänään'
  const description = `Joka torstai klo 16: viikonlopun (${label}) 5 valittua tapahtumaa Helsingissä — keikka, kulttuuri, perhe, ilmainen ja yöelämä yhdessä paketissa.`
  const ogParams = new URLSearchParams({
    title: 'Torstain pakka 🎁',
    date: `Viikonloppu ${label}`,
    location: 'Helsinki',
  })
  return {
    title,
    description,
    alternates: { canonical: `${BASE}/pakka` },
    openGraph: {
      title: 'Torstain pakka 🎁 — viikonlopun 5 valittua',
      description,
      locale: 'fi_FI',
      type: 'website',
      url: `${BASE}/pakka`,
      images: [`${BASE}/api/og?${ogParams}`],
    },
  }
}

// Hakee pe–su-tapahtumat omasta aggregaatista (sama /api/events kuin sovellus).
// Origin ratkaistaan pyynnön headereista — toimii prodissa, previewissa ja devissä.
async function fetchWeekendEvents(): Promise<Event[]> {
  const { fri, sun } = nextWeekendRange()
  try {
    const h = await headers()
    const host = h.get('x-forwarded-host') ?? h.get('host')
    const proto = h.get('x-forwarded-proto') ?? 'https'
    if (!host) return []
    const params = new URLSearchParams({ start: fri, end: sun, page: '1', municipality: 'helsinki' })
    const res = await fetch(`${proto}://${host}/api/events?${params}`, {
      next: { revalidate: 3600 },
      signal: AbortSignal.timeout(30000),
    })
    if (!res.ok) return []
    const data = await res.json()
    return (data.events ?? []) as Event[]
  } catch {
    // Tyhjä tila renderöidään hallitusti — sivu EI saa kaatua upstream-vikaan.
    return []
  }
}

export default async function PakkaPage() {
  const { label } = nextWeekendRange()
  const events = await fetchWeekendEvents()
  const picks = pickWeeklyDigest(events)

  return (
    <main style={{ minHeight: '100vh', background: '#0a0a0f', color: 'white' }}>
      <div className="max-w-2xl mx-auto px-4 py-8">
        <nav className="text-sm mb-6 flex items-center gap-2" style={{ color: 'rgba(255,255,255,0.4)' }}>
          <Link href="/" className="hover:text-white transition-colors">Mitä tänään</Link>
          <span>/</span>
          <span className="text-white">Torstain pakka</span>
        </nav>

        <header className="mb-8">
          <h1 className="text-4xl font-black tracking-tight mb-2">Torstain pakka 🎁</h1>
          <p style={{ color: 'rgba(255,255,255,0.55)' }}>
            Viikonlopun {label} viisi valittua — yksi joka kattilaan.
          </p>
        </header>

        {picks.length === 0 ? (
          <div
            className="rounded-3xl p-8 text-center"
            style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)' }}
          >
            <p className="text-lg font-bold mb-2">Pakkaa kootaan vielä 📦</p>
            <p className="text-sm" style={{ color: 'rgba(255,255,255,0.5)' }}>
              Viikonlopun ohjelmaa päivittyy vielä — kuratointi valmistuu lähempänä torstaita.
            </p>
          </div>
        ) : (
          <div className="space-y-5">
            {picks.map(({ event, bucket, bucketEmoji }) => (
              <Link
                key={event.id}
                href={`/e/${encodeURIComponent(event.id)}`}
                className="block rounded-3xl overflow-hidden transition-transform hover:-translate-y-0.5"
                style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)' }}
              >
                {event.image && (
                  <div className="relative w-full" style={{ aspectRatio: '16/9' }}>
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={event.image}
                      alt=""
                      className="absolute inset-0 w-full h-full object-cover"
                    />
                    <div
                      className="absolute inset-0"
                      style={{ background: 'linear-gradient(to top, rgba(10,10,15,0.9), transparent 55%)' }}
                    />
                    <span
                      className="absolute top-3 left-3 text-xs font-bold px-3 py-1 rounded-full"
                      style={{ background: 'rgba(10,10,15,0.75)', backdropFilter: 'blur(6px)' }}
                    >
                      {bucketEmoji} {bucket}
                    </span>
                  </div>
                )}
                <div className="p-5">
                  {!event.image && (
                    <span
                      className="inline-block text-xs font-bold px-3 py-1 rounded-full mb-2"
                      style={{ background: 'rgba(255,255,255,0.08)' }}
                    >
                      {bucketEmoji} {bucket}
                    </span>
                  )}
                  <h2 className="text-xl font-black leading-snug mb-1.5">{event.title}</h2>
                  <p className="text-sm" style={{ color: 'rgba(255,255,255,0.55)' }}>
                    {formatEventDate(event.startTime)}
                    {event.location?.name && <span style={{ color: 'rgba(255,255,255,0.35)' }}> · {event.location.name}</span>}
                  </p>
                  <div className="mt-3 flex items-center gap-2">
                    {event.isFree ? (
                      <span className="text-xs font-bold px-2.5 py-1 rounded-full" style={{ background: 'rgba(16,185,129,0.15)', color: '#34d399' }}>
                        Ilmainen
                      </span>
                    ) : event.price ? (
                      <span className="text-xs px-2.5 py-1 rounded-full" style={{ background: 'rgba(255,255,255,0.07)', color: 'rgba(255,255,255,0.6)' }}>
                        {event.price}
                      </span>
                    ) : null}
                  </div>
                </div>
              </Link>
            ))}
          </div>
        )}

        <div className="mt-10 space-y-3">
          <Link
            href="/tapahtumat/viikonloppu"
            className="block text-center font-bold rounded-2xl py-3.5 transition-opacity hover:opacity-90"
            style={{ background: 'linear-gradient(150deg,#6b76ff,#5059e6)' }}
          >
            Katso kaikki viikonlopun tapahtumat →
          </Link>
          <Link
            href="/paatakaa"
            className="block text-center font-bold rounded-2xl py-3.5 transition-colors"
            style={{ border: '1px solid rgba(255,255,255,0.15)', color: 'rgba(255,255,255,0.8)' }}
          >
            Päätä porukalla 30 sek →
          </Link>
        </div>

        <p className="text-center text-xs mt-8" style={{ color: 'rgba(255,255,255,0.3)' }}>
          Uusi pakka joka torstai klo 16 — tilaa push-ilmoitukset etusivulta.
        </p>
      </div>
    </main>
  )
}

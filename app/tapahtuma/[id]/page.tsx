import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import Link from 'next/link'
import { supabase, DbFestival } from '@/lib/supabase'
import { FestivalDef, FESTIVALS_STATIC, fromDb } from '@/lib/festivals-data'
import ShareButton from '@/components/ShareButton'

export const revalidate = 3600
export const dynamicParams = true

const BASE = process.env.NEXT_PUBLIC_SITE_URL || 'https://mitatanaan.fi'

async function getFestival(id: string): Promise<FestivalDef | null> {
  if (supabase) {
    try {
      const { data } = await supabase
        .from('festivals')
        .select('*')
        .eq('id', id)
        .eq('active', true)
        .single()
      if (data) return fromDb(data as DbFestival)
    } catch { /* käytetään staattista dataa */ }
  }
  return FESTIVALS_STATIC.find(f => f.id === id) ?? null
}

export async function generateStaticParams() {
  const ids = new Set<string>(FESTIVALS_STATIC.map(f => f.id))
  if (supabase) {
    try {
      const { data } = await supabase.from('festivals').select('id').eq('active', true)
      if (data) data.forEach((f: { id: string }) => ids.add(f.id))
    } catch { /* käytetään staattista dataa */ }
  }
  return [...ids].map(id => ({ id }))
}

function formatDateRange(start: string, end: string): string {
  const s = new Date(start)
  const e = new Date(end)
  const opts: Intl.DateTimeFormatOptions = { day: 'numeric', month: 'long', year: 'numeric' }
  if (start === end) return s.toLocaleDateString('fi-FI', opts)
  if (s.getFullYear() === e.getFullYear() && s.getMonth() === e.getMonth()) {
    return `${s.getDate()}–${e.toLocaleDateString('fi-FI', opts)}`
  }
  return `${s.toLocaleDateString('fi-FI', { day: 'numeric', month: 'long' })} – ${e.toLocaleDateString('fi-FI', opts)}`
}

function formatDateShort(start: string, end: string): string {
  const s = new Date(start)
  const e = new Date(end)
  if (start === end) return s.toLocaleDateString('fi-FI', { day: 'numeric', month: 'numeric', year: 'numeric' })
  return `${s.toLocaleDateString('fi-FI', { day: 'numeric', month: 'numeric' })}–${e.toLocaleDateString('fi-FI', { day: 'numeric', month: 'numeric', year: 'numeric' })}`
}

type Props = { params: Promise<{ id: string }> }

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { id } = await params
  const fest = await getFestival(id)
  if (!fest) return { title: 'Festivaalia ei löydy' }

  const dateRange = formatDateShort(fest.startDate, fest.endDate)
  const title = `${fest.name} – ${dateRange} – ${fest.venueName || fest.city}`
  const desc = fest.description || `${fest.name} – ${fest.venueName}, ${fest.city}`
  const pageUrl = `${BASE}/tapahtuma/${fest.id}`
  const ogImageUrl = `${BASE}/api/og?title=${encodeURIComponent(fest.name)}&date=${encodeURIComponent(dateRange)}&location=${encodeURIComponent(fest.venueName || fest.city)}${fest.isFree ? '&free=1' : ''}${fest.image ? `&img=${encodeURIComponent(fest.image)}` : ''}`

  return {
    title,
    description: desc,
    alternates: { canonical: pageUrl },
    openGraph: {
      title: fest.name,
      description: desc,
      type: 'website',
      locale: 'fi_FI',
      url: pageUrl,
      images: [{ url: fest.image || ogImageUrl, width: 1200, height: 630, alt: fest.name }],
    },
    twitter: {
      card: 'summary_large_image',
      title: fest.name,
      description: desc,
      images: [fest.image || ogImageUrl],
    },
  }
}

export default async function FestivalPage({ params }: Props) {
  const { id } = await params
  const fest = await getFestival(id)
  if (!fest) notFound()

  const pageUrl = `${BASE}/tapahtuma/${fest.id}`
  const dateRange = formatDateRange(fest.startDate, fest.endDate)
  const isPast = new Date(fest.endDate) < new Date()

  const breadcrumbLd = {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: [
      { '@type': 'ListItem', position: 1, name: 'Mitä tänään', item: BASE },
      { '@type': 'ListItem', position: 2, name: 'Festivaalit', item: `${BASE}/tapahtumat/festivaalit` },
      { '@type': 'ListItem', position: 3, name: fest.name, item: pageUrl },
    ],
  }

  const jsonLd = {
    '@context': 'https://schema.org',
    '@type': 'Festival',
    name: fest.name,
    description: fest.description,
    startDate: fest.startDate,
    endDate: fest.endDate,
    eventStatus: isPast
      ? 'https://schema.org/EventCancelled'
      : 'https://schema.org/EventScheduled',
    eventAttendanceMode: 'https://schema.org/OfflineEventAttendanceMode',
    location: {
      '@type': 'Place',
      name: fest.venueName || fest.city,
      address: {
        '@type': 'PostalAddress',
        streetAddress: fest.address,
        addressLocality: fest.city,
        addressCountry: 'FI',
      },
    },
    ...(fest.image ? { image: fest.image } : {}),
    ...(fest.isFree
      ? { isAccessibleForFree: true, offers: { '@type': 'Offer', price: '0', priceCurrency: 'EUR' } }
      : {
          offers: {
            '@type': 'Offer',
            url: fest.ticketUrl || fest.infoUrl,
            availability: isPast ? 'https://schema.org/SoldOut' : 'https://schema.org/InStock',
          },
        }),
    url: pageUrl,
    inLanguage: 'fi',
    organizer: { '@type': 'Organization', name: fest.venueName || 'Helsinki' },
  }

  return (
    <>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(breadcrumbLd) }} />
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }} />
      <main className="min-h-screen bg-gray-950 text-white">
        <div className="max-w-2xl mx-auto px-4 py-8">
          <Link href="/" className="text-blue-400 hover:text-blue-300 text-sm mb-6 inline-block">
            ← Kaikki tapahtumat
          </Link>

          {fest.image && (
            <div className="rounded-xl overflow-hidden mb-6 aspect-video">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={fest.image} alt={fest.name} className="w-full h-full object-cover" />
            </div>
          )}

          <div className="space-y-4">
            {/* Kategoriatapit */}
            {fest.categories.length > 0 && (
              <div className="flex flex-wrap gap-2">
                {fest.isFree && (
                  <span className="bg-green-900/60 text-green-300 text-xs font-semibold px-3 py-1 rounded-full">
                    Ilmainen
                  </span>
                )}
                {fest.categories.slice(0, 4).map(cat => (
                  <span key={cat} className="bg-blue-900/40 text-blue-300 text-xs px-2 py-1 rounded-full">
                    {cat}
                  </span>
                ))}
              </div>
            )}

            <h1 className="text-2xl font-bold leading-tight">{fest.name}</h1>

            {isPast && (
              <p className="text-amber-400 text-sm font-medium">Tapahtuma on päättynyt</p>
            )}

            {/* Päivämäärä, paikka, osoite */}
            <div className="space-y-1 text-gray-300">
              <p className="text-lg capitalize">📅 {dateRange}</p>
              {fest.venueName && (
                <p>
                  📍 {fest.venueName}
                  {fest.address && <span className="text-gray-500">, {fest.address}</span>}
                  {fest.city && fest.city !== 'Helsinki' && (
                    <span className="text-gray-500">, {fest.city}</span>
                  )}
                </p>
              )}
            </div>

            {/* Kuvaus */}
            {fest.description && (
              <p className="text-gray-300 leading-relaxed">{fest.description}</p>
            )}

            {/* CTA-napit */}
            <div className="flex flex-wrap gap-3 pt-2">
              {fest.ticketUrl && !isPast && (
                <a
                  href={fest.ticketUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-block bg-blue-600 hover:bg-blue-500 text-white font-semibold px-6 py-3 rounded-xl transition-colors"
                >
                  Osta liput
                </a>
              )}
              {fest.infoUrl && fest.infoUrl !== fest.ticketUrl && (
                <a
                  href={fest.infoUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-block bg-gray-800 hover:bg-gray-700 text-white font-medium px-6 py-3 rounded-xl transition-colors"
                >
                  Lisätietoja
                </a>
              )}
              <ShareButton title={fest.name} url={pageUrl} />
            </div>
          </div>
        </div>
      </main>
    </>
  )
}

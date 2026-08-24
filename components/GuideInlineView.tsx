'use client'

// Oppaat ETUSIVUN SISÄLLÄ (omistaja 25.8.2026: "haluan että kaikki pysyy
// tässä etusivun näkymässä" — sama linjaus kuin kaupunginosasuodattimella).
// Data /api/guides/[slug]:sta, joka jakaa lib/guide-data.ts:n SEO-sivujen
// kanssa — molemmat pinnat näyttävät saman sisällön. SEO-sivut säilyvät
// Googlelle; tämä näkymä pitää käyttäjän sovelluksessa.

import { useEffect, useState } from 'react'
import { useLanguage } from '@/contexts/LanguageContext'
import { formatEventDate } from '@/lib/helsinki-time'
import SaunatView, { type SaunaRow } from '@/components/SaunatView'
import GuidePlaceList, { type GuidePlace } from '@/components/GuidePlaceList'
import type { GuideEvent } from '@/lib/guide-data'

export type GuideSlug = 'saunat' | 'terassit' | 'pubivisat' | 'kirpputorit' | 'jamit' | 'ilmaiset-museot'

export const GUIDE_META: Record<GuideSlug, { emoji: string; title: string; sub: string }> = {
  saunat:            { emoji: '🧖', title: 'Saunat',            sub: 'yleiset saunat & aukiolot' },
  terassit:          { emoji: '☀️', title: 'Terassit',          sub: 'kattoterassit & kesä' },
  pubivisat:         { emoji: '🧠', title: 'Pubivisat',         sub: 'visailut viikon varrella' },
  kirpputorit:       { emoji: '🛍', title: 'Kirpputorit',       sub: 'second hand & kirppikset' },
  jamit:             { emoji: '🎤', title: 'Jamit & open mic',  sub: 'avoimet lavat' },
  'ilmaiset-museot': { emoji: '🏛', title: 'Ilmaiset museot',   sub: 'aina vapaa pääsy' },
}

interface Rooftop { name: string; address: string; www: string | null }
interface VisaRow { name: string; address: string; nextISO: string }
interface GuidePayload {
  saunas?: SaunaRow[]
  rooftops?: Rooftop[]
  events?: GuideEvent[]
  visas?: VisaRow[]
  shops?: GuidePlace[]
  museums?: GuidePlace[]
  galleries?: GuidePlace[]
}

function visaTime(iso: string): string {
  try {
    return new Intl.DateTimeFormat('fi-FI', {
      timeZone: 'Europe/Helsinki', weekday: 'short', day: 'numeric', month: 'numeric',
      hour: '2-digit', minute: '2-digit',
    }).format(new Date(iso)).replace(',', '')
  } catch { return '' }
}

function EventRows({ events }: { events: GuideEvent[] }) {
  if (events.length === 0) return <p className="text-white/30 text-sm">Ei tulevia tapahtumia juuri nyt.</p>
  return (
    <div className="space-y-2">
      {events.map((e) => (
        <div key={e.id} className="rounded-2xl px-4 py-3"
          style={{ background: 'rgba(255,255,255,.04)', border: '1px solid rgba(255,255,255,.07)' }}>
          <p className="text-[11.5px] font-black" style={{ color: '#a3abff' }}>
            {formatEventDate(e.startTime)}
            {e.isFree && <span className="ml-2 text-emerald-400">Maksuton</span>}
          </p>
          <p className="font-bold text-white text-[15px] leading-snug mt-0.5">{e.title}</p>
          {e.venue && <p className="text-white/40 text-xs mt-0.5">📍 {e.venue}</p>}
        </div>
      ))}
    </div>
  )
}

function SectionHead({ children, sub }: { children: React.ReactNode; sub?: string }) {
  return (
    <div className="mb-3">
      <h3 className="text-[15px] font-black tracking-[.06em] uppercase text-white/70">{children}</h3>
      {sub && <p className="text-white/35 text-sm mt-0.5">{sub}</p>}
    </div>
  )
}

export default function GuideInlineView({ slug, onBack }: { slug: GuideSlug; onBack: () => void }) {
  const { t } = useLanguage()
  const [data, setData] = useState<GuidePayload | null>(null)
  const [error, setError] = useState(false)
  const [reloadKey, setReloadKey] = useState(0)
  const meta = GUIDE_META[slug]

  useEffect(() => {
    let alive = true
    // Tilan nollaus + haku timeout-callbackissa (React Compiler: ei
    // synkronista setStateä efektissä — sama kuvio kuin IdeaViewissä).
    const t0 = setTimeout(() => {
      setData(null)
      setError(false)
      fetch(`/api/guides/${slug}`)
        .then((r) => { if (!r.ok) throw new Error(String(r.status)); return r.json() })
        .then((d) => { if (alive) setData(d) })
        .catch(() => { if (alive) setError(true) })
    }, 0)
    return () => { alive = false; clearTimeout(t0) }
  }, [slug, reloadKey])

  return (
    <section className="space-y-5">
      <div className="flex items-center gap-3">
        <button onClick={onBack}
          className="shrink-0 flex items-center gap-1 px-3.5 py-2 rounded-full text-[13px] font-black text-white/70 hover:text-white transition-all"
          style={{ background: 'rgba(255,255,255,.06)', border: '1px solid rgba(255,255,255,.1)' }}>
          ← {t('common.back')}
        </button>
        <div className="min-w-0">
          <h2 className="font-black text-white text-[19px] leading-none" style={{ letterSpacing: '-0.02em' }}>
            {meta.emoji} {meta.title}
          </h2>
          <p className="text-white/35 text-[12px] mt-1">{meta.sub}</p>
        </div>
      </div>

      {error && (
        <div className="flex flex-col items-center py-14 text-center gap-3">
          <span className="text-4xl">🫥</span>
          <p className="text-white/40 font-bold">Oppaan lataus epäonnistui.</p>
          <button onClick={() => setReloadKey((k) => k + 1)}
            className="text-[13px] font-bold px-4 py-2.5 rounded-full text-white"
            style={{ background: 'linear-gradient(150deg,#6b76ff,#5059e6)' }}>
            Yritä uudelleen
          </button>
        </div>
      )}

      {!error && !data && (
        <div className="space-y-3">
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <div style={{ width: 13, height: 13, borderRadius: '50%', border: '1.5px solid rgba(107,118,255,.2)', borderTopColor: '#6b76ff', animation: 'spin 0.75s linear infinite', flexShrink: 0 }} />
            <span style={{ fontSize: 13, fontWeight: 700, color: 'rgba(255,255,255,.55)' }}>Ladataan opasta</span>
          </div>
          {[0, 1, 2, 3].map((i) => (
            <div key={i} className="rounded-2xl skeleton-shimmer" style={{ height: 72 }} />
          ))}
        </div>
      )}

      {data && slug === 'saunat' && data.saunas && <SaunatView saunas={data.saunas} />}

      {data && slug === 'terassit' && (
        <>
          <div>
            <SectionHead sub="Drinkit kaupungin kattojen yllä — auki säällä kuin säällä.">
              🏙 Kattoterassit & rooftop-baarit
            </SectionHead>
            <div className="space-y-2">
              {(data.rooftops ?? []).map((r) => (
                <div key={r.name} className="rounded-2xl px-4 py-3"
                  style={{ background: 'rgba(255,255,255,.04)', border: '1px solid rgba(255,255,255,.07)' }}>
                  <p className="font-bold text-white text-[15px]">
                    {r.www
                      ? <a href={r.www} target="_blank" rel="noopener noreferrer" className="hover:text-blue-300 transition-colors">{r.name} ↗</a>
                      : r.name}
                  </p>
                  <p className="text-white/40 text-xs mt-0.5">📍 {r.address}</p>
                </div>
              ))}
            </div>
          </div>
          <div>
            <SectionHead sub="Seuraavan kahden viikon ohjelma.">🎪 Terassi- ja ulkoilmatapahtumat</SectionHead>
            <EventRows events={data.events ?? []} />
          </div>
        </>
      )}

      {data && slug === 'pubivisat' && (
        <div>
          <SectionHead sub="Viikon visailut aikajärjestyksessä — lähde: pubivisat.fi.">🧠 Viikon pubivisat</SectionHead>
          <div className="space-y-2">
            {(data.visas ?? []).map((v, i) => (
              <div key={`${v.name}-${i}`} className="rounded-2xl px-4 py-3"
                style={{ background: 'rgba(255,255,255,.04)', border: '1px solid rgba(255,255,255,.07)' }}>
                <p className="text-[11.5px] font-black" style={{ color: '#a3abff' }}>{visaTime(v.nextISO)}</p>
                <p className="font-bold text-white text-[15px] leading-snug mt-0.5">{v.name}</p>
                {v.address && <p className="text-white/40 text-xs mt-0.5">📍 {v.address}</p>}
              </div>
            ))}
            {(data.visas ?? []).length === 0 && <p className="text-white/30 text-sm">Visalistaa ei saatu ladattua juuri nyt.</p>}
          </div>
        </div>
      )}

      {data && slug === 'kirpputorit' && (
        <>
          <div>
            <SectionHead sub="Kirppistapahtumat ja myyjäiset lähiviikkoina.">🎪 Kirppistapahtumat</SectionHead>
            <EventRows events={data.events ?? []} />
          </div>
          <div>
            <SectionHead sub="Second hand -liikkeet ja kirpputorit — aukiolot ja kartat.">🛍 Liikkeet & kirpputorit</SectionHead>
            <GuidePlaceList places={data.shops ?? []} emoji="🛍" />
          </div>
        </>
      )}

      {data && slug === 'jamit' && (
        <div>
          <SectionHead sub="Avoimet lavat, jamit ja open micit — tule soittamaan tai kuuntelemaan.">🎤 Tulevat jamit & open micit</SectionHead>
          <EventRows events={data.events ?? []} />
        </div>
      )}

      {data && slug === 'ilmaiset-museot' && (
        <>
          <div>
            <SectionHead sub="Aina vapaa pääsy — ei ilmaispäiviä, vaan pysyvästi maksuttomat.">🏛 Museot</SectionHead>
            <GuidePlaceList places={data.museums ?? []} emoji="🏛" />
          </div>
          <div>
            <SectionHead>🖼 Galleriat</SectionHead>
            <GuidePlaceList places={data.galleries ?? []} emoji="🖼" />
          </div>
        </>
      )}
    </section>
  )
}

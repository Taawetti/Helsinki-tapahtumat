'use client'

// Oppaat ETUSIVUN SISÄLLÄ, kaupunginosanäkymän visuaalisella linjalla
// (omistaja 25.8.2026: "sen pitää olla visuaalisesti samanlainen niin linja
// pysyy"): sama otsikkorivi (emoji + nimi + määrä + Vaihda ▾ + ✕) ja sama
// julistekorttiruudukko. Tapahtumat renderöidään OIKEINA PosterCardeina
// (klikki avaa saman infopaneelin), paikat samanmuotoisina korteina.
// Data /api/guides/[slug]:sta — jaettu lib/guide-data.ts SEO-sivujen kanssa.

import { useEffect, useState } from 'react'
import PosterCard from '@/components/PosterCard'
import { useLanguage } from '@/contexts/LanguageContext'
import type { Lang, TranslationKey } from '@/lib/i18n'
import type { Event } from '@/lib/types'
import type { SaunaRow } from '@/components/SaunatView'
import type { GuidePlace } from '@/components/GuidePlaceList'
import type { GuideEvent } from '@/lib/guide-data'

export type GuideSlug = 'saunat' | 'terassit' | 'pubivisat' | 'kirpputorit' | 'jamit' | 'ilmaiset-museot'

// Moduulitason taulukko → t() ei ole käytettävissä täällä, joten nimi ja
// alaotsikko kannetaan käännösavaimina (sama kuvio kuin lib/types.ts:n VIBES).
export const GUIDE_META: Record<GuideSlug, { emoji: string; titleKey: TranslationKey; subKey: TranslationKey }> = {
  saunat:            { emoji: '🧖', titleKey: 'guides.saunat_title',      subKey: 'guides.saunat_sub' },
  terassit:          { emoji: '☀️', titleKey: 'guides.terassit_title',    subKey: 'guides.terassit_sub' },
  pubivisat:         { emoji: '🧠', titleKey: 'guides.pubivisat_title',   subKey: 'guides.pubivisat_sub' },
  kirpputorit:       { emoji: '🛍', titleKey: 'guides.kirpputorit_title', subKey: 'guides.kirpputorit_sub' },
  jamit:             { emoji: '🎤', titleKey: 'guides.jamit_title',       subKey: 'guides.jamit_sub' },
  'ilmaiset-museot': { emoji: '🏛', titleKey: 'guides.museot_title',      subKey: 'guides.museot_sub' },
}

interface Rooftop { name: string; address: string; www: string | null; image?: string | null; rating?: number | null }
interface VisaRow { name: string; address: string; nextISO: string; image?: string | null; rating?: number | null; www?: string | null }
interface GuidePayload {
  saunas?: SaunaRow[]
  rooftops?: Rooftop[]
  events?: GuideEvent[]
  visas?: VisaRow[]
  shops?: GuidePlace[]
  museums?: GuidePlace[]
  galleries?: GuidePlace[]
}

// PosterCardin paletti ja hash 1:1 — kuvaton paikkakortti on TEKSTIJULISTE
// (iso himmeä emoji + nimi julisteena) täsmälleen kuten kuvaton tapahtumakortti,
// jotta oppaiden ja kaupunginosanäkymän linja on sama (omistaja 25.8.).
const GRADIENTS = [
  'linear-gradient(135deg,#1e1b4b 0%,#312e81 55%,#4c1d95 100%)',
  'linear-gradient(155deg,#4a044e 0%,#86198f 55%,#701a75 100%)',
  'linear-gradient(135deg,#0c1445 0%,#1e3a8a 55%,#1d4ed8 100%)',
  'linear-gradient(160deg,#052e16 0%,#065f46 55%,#047857 100%)',
  'linear-gradient(135deg,#450a0a 0%,#991b1b 55%,#b91c1c 100%)',
  'linear-gradient(155deg,#0c2a4a 0%,#0e4d6e 55%,#0369a1 100%)',
  'linear-gradient(135deg,#4a0520 0%,#881337 55%,#9f1239 100%)',
  'linear-gradient(160deg,#431407 0%,#78350f 55%,#92400e 100%)',
  'linear-gradient(135deg,#042f2e 0%,#0f4c35 55%,#065f46 100%)',
  'linear-gradient(155deg,#2e1065 0%,#4c1d95 55%,#6d28d9 100%)',
  'linear-gradient(135deg,#14532d 0%,#166534 55%,#15803d 100%)',
  'linear-gradient(160deg,#1c1917 0%,#292524 55%,#44403c 100%)',
]
const ACCENTS = [
  '#818cf8', '#e879f9', '#60a5fa', '#34d399',
  '#f87171', '#38bdf8', '#fb7185', '#fbbf24',
  '#2dd4bf', '#a78bfa', '#4ade80', '#94a3b8',
]
function hashIdx(id: string): number {
  let h = 0
  for (const c of id) h = (h * 31 + c.charCodeAt(0)) & 0xffff
  return h % GRADIENTS.length
}

/** GuideEvent → Event: opas-tapahtumat ovat LinkedEventsistä, joten oikea id
 *  + source antaa PosterCardille crawlattavan /e/[id]-linkin ja paneelin. */
function toEvent(e: GuideEvent): Event {
  return {
    id: e.id,
    title: e.title,
    shortDescription: '',
    description: '',
    startTime: e.startTime,
    endTime: null,
    location: e.venue ? { name: e.venue, streetAddress: '', city: 'Helsinki' } : null,
    image: e.image ?? null,
    isFree: e.isFree,
    price: e.price ?? null,
    ticketUrl: null,
    infoUrl: null,
    categories: [],
    source: 'linked-events',
  }
}

function visaTime(iso: string, lang: Lang): string {
  try {
    return new Intl.DateTimeFormat(lang === 'en' ? 'en-GB' : 'fi-FI', {
      timeZone: 'Europe/Helsinki', weekday: 'short', day: 'numeric', month: 'numeric',
      hour: '2-digit', minute: '2-digit',
    }).format(new Date(iso)).replace(',', '')
  } catch { return '' }
}

// ── Paikkakortti — PosterCardin geometria (3/4-juliste + nimi alla) ─────────

function PlaceCard({ id, name, address, image, emoji, kicker, topBadge, bottomChip, href }: {
  id: string
  name: string
  address?: string | null
  image?: string | null
  emoji: string
  kicker: string          // julisteen yläteksti (PosterCardin categories[0]-vastine)
  topBadge?: string | null
  bottomChip?: string | null
  href?: string | null
}) {
  const idx = hashIdx(id)
  const gradient = GRADIENTS[idx]
  const accent = ACCENTS[idx]
  const inner = (
    <>
      {/* Juliste — sama geometria kuin PosterCardissa (3/4, rounded-xl).
          Liukuväri + koristeemoji + luokkateksti piirtyvät AINA pohjalle, ja
          valokuva niiden PÄÄLLE. Kun kuva kuolee (mitattu: Google-kuvista
          40 % lahoaa, ja yksi pubi palautti 403 heti), alta paljastuu ehjä
          juliste eikä tyhjä väripinta. Nimi ja osoite luetaan aina tieto-
          riviltä — ei toistoa julisteessa (näkyi 25.8. kahdesti). */}
      <div className="relative w-full overflow-hidden" style={{ aspectRatio: '3/4' }}>
        <div className="absolute inset-0" style={{ background: gradient }} />
        <div className="absolute select-none pointer-events-none leading-none"
          style={{ fontSize: '7rem', top: '-8px', right: '-8px', opacity: 0.14, filter: `drop-shadow(0 0 30px ${accent})` }}>
          {emoji}
        </div>
        <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-transparent to-transparent" />
        <div className="absolute inset-x-0 bottom-0 px-4 pb-4">
          <div className="text-[10px] font-black uppercase tracking-widest opacity-70" style={{ color: accent }}>
            {kicker}
          </div>
        </div>
        {image && (
          <>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={image} alt={name} loading="lazy"
              className="absolute inset-0 w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"
              onError={(e) => { (e.target as HTMLElement).style.display = 'none' }} />
            <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/10 to-transparent pointer-events-none" />
          </>
        )}

        {topBadge && (
          <div className="absolute top-2.5 left-2.5 flex gap-1.5 flex-wrap">
            <span className="text-[10px] font-black px-2 py-0.5 rounded-full bg-emerald-500 text-white tracking-wide">
              {topBadge}
            </span>
          </div>
        )}
        {bottomChip && (
          <div className="absolute bottom-2.5 right-2.5">
            <span className="text-[11px] font-bold px-2 py-0.5 rounded-full text-white/90 bg-black/50 backdrop-blur-sm">
              {bottomChip}
            </span>
          </div>
        )}
      </div>

      {/* Tietorivi — sama kuin PosterCardissa */}
      <div className="px-3 pt-2.5 pb-3 space-y-0.5">
        <p className="text-white font-bold text-[13px] leading-snug line-clamp-2 group-hover:text-[#c7caff] transition-colors">
          {name}
        </p>
        {address && <p className="text-white/40 text-[11px] truncate">{address}</p>}
      </div>
    </>
  )
  // Linkitön kortti EI saa kantaa hover/focus-luokkia: ne eivät voi laueta
  // (ei fokusoitava elementti) ja lupaisivat klikattavuutta jota ei ole.
  const base = 'group relative w-full text-left rounded-xl overflow-hidden bg-[#111] block'
  const interactive = ' hover:scale-[1.02] active:scale-[0.97] transition-transform duration-200 focus:outline-none focus-visible:ring-2 focus-visible:ring-[#6b76ff]'
  return href ? (
    <a href={/^https?:\/\//i.test(href) ? href : `https://${href}`} target="_blank" rel="noopener noreferrer"
      className={base + interactive} style={{ textDecoration: 'none' }}>
      {inner}
    </a>
  ) : (
    <div className={base}>{inner}</div>
  )
}

function CardGrid({ children }: { children: React.ReactNode }) {
  return <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3 items-start">{children}</div>
}

function SectionHead({ children, sub }: { children: React.ReactNode; sub?: string }) {
  return (
    <div className="mb-3">
      <h3 className="text-[15px] font-black tracking-[.06em] uppercase text-white/70">{children}</h3>
      {sub && <p className="text-white/35 text-sm mt-0.5">{sub}</p>}
    </div>
  )
}

export default function GuideInlineView({ slug, onBack, onSwitch, onEventClick }: {
  slug: GuideSlug
  onBack: () => void
  onSwitch: (slug: GuideSlug) => void
  onEventClick: (e: Event) => void
}) {
  const [data, setData] = useState<GuidePayload | null>(null)
  const [error, setError] = useState(false)
  const [reloadKey, setReloadKey] = useState(0)
  const [showMenu, setShowMenu] = useState(false)
  const { t, lang } = useLanguage()
  const meta = GUIDE_META[slug]

  useEffect(() => {
    let alive = true
    // Tilan nollaus + haku timeout-callbackissa (React Compiler: ei
    // synkronista setStateä efektissä — sama kuvio kuin IdeaViewissä).
    const t0 = setTimeout(() => {
      setData(null)
      setError(false)
      setShowMenu(false)
      fetch(`/api/guides/${slug}`)
        .then((r) => { if (!r.ok) throw new Error(String(r.status)); return r.json() })
        .then((d) => { if (alive) setData(d) })
        .catch(() => { if (alive) setError(true) })
    }, 0)
    return () => { alive = false; clearTimeout(t0) }
  }, [slug, reloadKey])

  const count = data
    ? (data.saunas?.length ?? 0) + (data.rooftops?.length ?? 0) + (data.events?.length ?? 0) +
      (data.visas?.length ?? 0) + (data.shops?.length ?? 0) + (data.museums?.length ?? 0) +
      (data.galleries?.length ?? 0)
    : null

  return (
    <section className="space-y-5">
      {/* Otsikkorivi — sama linja kuin "📍 Tapahtumat Kalliossa · Vaihda ▾ · ✕" */}
      <div className="flex items-center gap-2.5 flex-wrap">
        <h2 className="font-black text-white text-[22px]" style={{ letterSpacing: '-0.02em' }}>
          {meta.emoji} {t(meta.titleKey)}
        </h2>
        {count !== null && <span className="text-[13px] font-bold text-white/35">{count}</span>}
        <div className="relative">
          <button onClick={() => setShowMenu((v) => !v)}
            className="text-[12px] font-bold px-3 py-1.5 rounded-full transition-colors"
            style={{ background: 'rgba(255,255,255,.06)', color: 'rgba(255,255,255,.6)', border: '1px solid rgba(255,255,255,.1)' }}>
            {t('guides.switch')}
          </button>
          {showMenu && (
            <>
              <button className="fixed inset-0 z-40 cursor-default" aria-label={t('common.close')}
                onClick={() => setShowMenu(false)} />
              <div className="absolute z-50 mt-2 left-0 w-56 rounded-2xl p-1.5"
                style={{ background: 'rgba(18,18,22,.98)', border: '1px solid rgba(255,255,255,.12)', boxShadow: '0 18px 44px -12px rgba(0,0,0,.85)' }}>
                {(Object.keys(GUIDE_META) as GuideSlug[]).filter((s) => s !== slug).map((s) => {
                  const g = GUIDE_META[s]
                  return (
                    <button key={s} onClick={() => { setShowMenu(false); onSwitch(s) }}
                      className="w-full text-left flex items-center gap-2.5 px-3 py-2.5 rounded-xl text-[13px] font-bold text-white/75 hover:text-white hover:bg-white/6 transition-colors">
                      <span className="text-base leading-none">{g.emoji}</span>
                      <span className="min-w-0">
                        {t(g.titleKey)}
                        <span className="block text-[10.5px] font-medium text-white/35 truncate">{t(g.subKey)}</span>
                      </span>
                    </button>
                  )
                })}
              </div>
            </>
          )}
        </div>
        <button onClick={onBack} aria-label={t('guides.close_guide')}
          className="text-[12px] font-bold px-3 py-1.5 rounded-full transition-colors"
          style={{ background: 'rgba(255,255,255,.06)', color: 'rgba(255,255,255,.6)', border: '1px solid rgba(255,255,255,.1)' }}>
          ✕
        </button>
      </div>

      {error && (
        <div className="flex flex-col items-center py-14 text-center gap-3">
          <span className="text-4xl">🫥</span>
          <p className="text-white/40 font-bold">{t('guides.load_error')}</p>
          <button onClick={() => setReloadKey((k) => k + 1)}
            className="text-[13px] font-bold px-4 py-2.5 rounded-full text-white"
            style={{ background: 'linear-gradient(150deg,#6b76ff,#5059e6)' }}>
            {t('guides.retry')}
          </button>
        </div>
      )}

      {!error && !data && (
        <div className="space-y-4">
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <div style={{ width: 13, height: 13, borderRadius: '50%', border: '1.5px solid rgba(107,118,255,.2)', borderTopColor: '#6b76ff', animation: 'spin 0.75s linear infinite', flexShrink: 0 }} />
            <span style={{ fontSize: 13, fontWeight: 700, color: 'rgba(255,255,255,.55)' }}>{t('guides.loading')}</span>
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
            {[0, 1, 2, 3].map((i) => (
              <div key={i} className="rounded-[18px] skeleton-shimmer" style={{ aspectRatio: '3/4' }} />
            ))}
          </div>
        </div>
      )}

      {data && slug === 'saunat' && (
        <CardGrid>
          {(data.saunas ?? []).map((s) => (
            <PlaceCard key={s.id} id={s.id} name={s.name} address={s.address}
              image={s.image} emoji="🧖" kicker={t('cat.sauna')}
              topBadge={s.newLabel}
              bottomChip={s.rating != null ? `★ ${s.rating.toFixed(1)}` : null}
              href={s.www} />
          ))}
        </CardGrid>
      )}

      {data && slug === 'terassit' && (
        <>
          <div>
            <SectionHead sub={t('guides.sec_rooftops_sub')}>{t('guides.sec_rooftops')}</SectionHead>
            <CardGrid>
              {(data.rooftops ?? []).map((r) => (
                <PlaceCard key={r.name} id={r.name} name={r.name} address={r.address}
                  image={r.image} emoji="🍸" kicker={t('guides.kicker_rooftop')}
                  bottomChip={r.rating != null ? `★ ${r.rating.toFixed(1)}` : null}
                  href={r.www} />
              ))}
            </CardGrid>
          </div>
          <div>
            <SectionHead sub={t('guides.sec_terrace_events_sub')}>{t('guides.sec_terrace_events')}</SectionHead>
            <CardGrid>
              {(data.events ?? []).map((e) => (
                <PosterCard key={e.id} event={toEvent(e)} onClick={onEventClick} />
              ))}
            </CardGrid>
          </div>
        </>
      )}

      {data && slug === 'pubivisat' && (
        <div>
          <SectionHead sub={t('guides.sec_quizzes_sub')}>{t('guides.sec_quizzes')}</SectionHead>
          <CardGrid>
            {(data.visas ?? []).map((v, i) => (
              <PlaceCard key={`${v.name}-${i}`} id={`${v.name}-${i}`} name={v.name} address={v.address}
                image={v.image} emoji="🧠" kicker={t('guides.kicker_quiz')}
                topBadge={v.rating != null ? `★ ${v.rating.toFixed(1)}` : null}
                bottomChip={visaTime(v.nextISO, lang)} href={v.www} />
            ))}
          </CardGrid>
        </div>
      )}

      {data && slug === 'kirpputorit' && (
        <>
          <div>
            <SectionHead sub={t('guides.sec_flea_events_sub')}>{t('guides.sec_flea_events')}</SectionHead>
            <CardGrid>
              {(data.events ?? []).map((e) => (
                <PosterCard key={e.id} event={toEvent(e)} onClick={onEventClick} />
              ))}
            </CardGrid>
          </div>
          <div>
            <SectionHead sub={t('guides.sec_flea_shops_sub')}>{t('guides.sec_flea_shops')}</SectionHead>
            <CardGrid>
              {(data.shops ?? []).map((p) => (
                <PlaceCard key={p.id} id={p.id} name={p.name} address={p.address}
                  image={p.image} emoji="🛍" kicker="Second hand" href={p.www} />
              ))}
            </CardGrid>
          </div>
        </>
      )}

      {data && slug === 'jamit' && (
        <div>
          <SectionHead sub={t('guides.sec_jams_sub')}>{t('guides.sec_jams')}</SectionHead>
          <CardGrid>
            {(data.events ?? []).map((e) => (
              <PosterCard key={e.id} event={toEvent(e)} onClick={onEventClick} />
            ))}
          </CardGrid>
        </div>
      )}

      {data && slug === 'ilmaiset-museot' && (
        <>
          <div>
            <SectionHead sub={t('guides.sec_museums_sub')}>{t('guides.sec_museums')}</SectionHead>
            <CardGrid>
              {(data.museums ?? []).map((p) => (
                <PlaceCard key={p.id} id={p.id} name={p.name} address={p.address}
                  image={p.image} emoji="🏛" kicker={t('cat.museo')} topBadge={t('common.free_badge')}
                  bottomChip={p.rating != null ? `★ ${p.rating.toFixed(1)}` : null}
                  href={p.www} />
              ))}
            </CardGrid>
          </div>
          <div>
            <SectionHead>{t('guides.sec_galleries')}</SectionHead>
            <CardGrid>
              {(data.galleries ?? []).map((p) => (
                <PlaceCard key={p.id} id={p.id} name={p.name} address={p.address}
                  image={p.image} emoji="🖼" kicker={t('cat.galleria')} topBadge={t('common.free_badge')}
                  bottomChip={p.rating != null ? `★ ${p.rating.toFixed(1)}` : null}
                  href={p.www} />
              ))}
            </CardGrid>
          </div>
        </>
      )}

      {/* Tapahtumaosioiden tyhjätila */}
      {data && (slug === 'jamit' || slug === 'terassit' || slug === 'kirpputorit') && (data.events ?? []).length === 0 && (
        <p className="text-white/30 text-sm">{t('guides.no_events')}</p>
      )}
    </section>
  )
}

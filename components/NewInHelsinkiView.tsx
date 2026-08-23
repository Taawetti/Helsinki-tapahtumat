'use client'

// "Uutta Helsingissä" — kortit TAPAHTUMAKORTTIEN kuvakielellä (omistajan
// linjaus: "visuaalisesti samanlainen kuin tapahtumat-välilehti"). Sama
// juliste-rakenne kuin PosterCard: 3/4-kuva-alue tai tumma liukuväri + iso
// haalea emoji, merkit kuvan päällä, otsikkorivi alla, koko kortti on yksi
// klikkipinta. Data kootaan palvelimella (lib/new-in-helsinki.ts).

import { useMemo, useState } from 'react'
import type { NewInHelsinki, NewItem, NewKind } from '@/lib/new-in-helsinki'

const KIND_META: Record<NewKind, { emoji: string; label: string; gradient: string; accent: string }> = {
  ravintola: { emoji: '🍽', label: 'Ravintolat',          gradient: 'linear-gradient(160deg,#052e16 0%,#065f46 55%,#047857 100%)', accent: '#34d399' },
  baari:     { emoji: '🍸', label: 'Baarit',              gradient: 'linear-gradient(155deg,#0c2a4a 0%,#0e4d6e 55%,#0369a1 100%)', accent: '#38bdf8' },
  kahvila:   { emoji: '☕', label: 'Kahvilat & leipomot', gradient: 'linear-gradient(160deg,#431407 0%,#78350f 55%,#92400e 100%)', accent: '#fbbf24' },
  kauppa:    { emoji: '🛍', label: 'Kaupat',              gradient: 'linear-gradient(135deg,#4a0520 0%,#881337 55%,#9f1239 100%)', accent: '#fb7185' },
  tekeminen: { emoji: '🧖', label: 'Tekeminen',           gradient: 'linear-gradient(135deg,#042f2e 0%,#0f4c35 55%,#065f46 100%)', accent: '#2dd4bf' },
  nayttely:  { emoji: '🖼', label: 'Näyttelyt',           gradient: 'linear-gradient(135deg,#2e1065 0%,#4c1d95 55%,#6d28d9 100%)', accent: '#a78bfa' },
}

const FILTERS: (NewKind | 'all')[] = ['all', 'ravintola', 'baari', 'kahvila', 'nayttely', 'tekeminen', 'kauppa']

const MONTHS_INESSIVE = [
  'tammikuussa', 'helmikuussa', 'maaliskuussa', 'huhtikuussa', 'toukokuussa', 'kesäkuussa',
  'heinäkuussa', 'elokuussa', 'syyskuussa', 'lokakuussa', 'marraskuussa', 'joulukuussa',
]

function fmtDate(iso: string): string {
  const d = new Date(iso + 'T12:00:00Z')
  if (Number.isNaN(d.getTime())) return ''
  return `${d.getUTCDate()}.${d.getUTCMonth() + 1}.`
}

/** Päivämäärämerkintä rehellisyysjärjestyksessä: OSM-rivin päivä on kartta-
 *  merkinnän luontipäivä, ei todennettu avauspäivä → sanotaan vain kuukausi. */
function dateLabel(item: NewItem): { text: string; color: string } {
  if (item.upcoming) {
    return { text: `${item.kind === 'nayttely' ? 'Avautuu' : 'Avaa'} ${fmtDate(item.date)}`, color: '#fcd34d' }
  }
  if (item.kind === 'nayttely') return { text: `Alkoi ${fmtDate(item.date)}`, color: '#d8b4fe' }
  if (item.dateApprox) {
    const m = new Date(item.date + 'T12:00:00Z').getUTCMonth()
    return { text: `Uusi ${MONTHS_INESSIVE[m] ?? ''}`, color: '#6ee7b7' }
  }
  return { text: `Avattu ${fmtDate(item.date)}`, color: '#6ee7b7' }
}

function relativeNews(iso: string): string {
  const days = Math.floor((Date.now() - new Date(iso).getTime()) / 86_400_000)
  if (Number.isNaN(days) || days < 1) return 'tänään'
  if (days === 1) return 'eilen'
  if (days < 7) return `${days} pv sitten`
  return `${Math.floor(days / 7)} vk sitten`
}

function subLine(item: NewItem): string {
  return [item.note, item.neighborhood, item.address?.split(',')[0]]
    .filter((x, i, arr) => x && arr.indexOf(x) === i)
    .slice(0, 2)
    .join(' · ')
}

/** Kortin klikkikohde: tuorein uutinen voittaa, sitten oma sivu, sitten lähde
 *  (museot.fi / OSM). Koko kortti on yksi linkki kuten tapahtumakorteissa. */
function primaryHref(item: NewItem): string | undefined {
  if (item.news?.url) return item.news.url
  if (item.www) return /^https?:\/\//i.test(item.www) ? item.www : `https://${item.www}`
  return item.sources.find((s) => s.url)?.url
}

// ── JULISTEKORTTI — sama rakenne kuin tapahtumien PosterCard ────────────────

function NewPosterCard({ item }: { item: NewItem }) {
  const [imgOk, setImgOk] = useState(true)
  const meta = KIND_META[item.kind]
  const date = dateLabel(item)
  const href = primaryHref(item)
  const hasImage = !!item.image && imgOk
  const sub = subLine(item)

  const inner = (
    <>
      {/* Kuva- / julistealue */}
      <div className="relative w-full overflow-hidden" style={{ aspectRatio: '3/4' }}>
        <div className="absolute inset-0" style={{ background: meta.gradient }} />
        {hasImage ? (
          <>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={item.image!} alt={item.name} loading="lazy"
              onError={() => setImgOk(false)}
              className="absolute inset-0 w-full h-full object-cover group-hover:scale-105 transition-transform duration-500" />
            <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/10 to-transparent" />
          </>
        ) : (
          <>
            <div className="absolute select-none pointer-events-none leading-none"
              style={{ fontSize: '7rem', top: '-8px', right: '-8px', opacity: 0.12, filter: `drop-shadow(0 0 30px ${meta.accent})` }}>
              {meta.emoji}
            </div>
            <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-transparent to-transparent" />
            <div className="absolute inset-0 flex flex-col justify-center px-4 py-5">
              <div className="text-[10px] font-black uppercase tracking-widest mb-2 opacity-60" style={{ color: meta.accent }}>
                {meta.label}
              </div>
              <h3 className="font-black text-white leading-tight text-xl"
                style={{
                  textShadow: `0 2px 20px rgba(0,0,0,0.6), 0 0 60px ${meta.accent}22`,
                  letterSpacing: '-0.02em', wordBreak: 'break-word', overflowWrap: 'break-word',
                  display: '-webkit-box', WebkitLineClamp: 4, WebkitBoxOrient: 'vertical', overflow: 'hidden',
                }}>
                {item.name}
              </h3>
              {sub && <p className="mt-2 text-[11px] opacity-50 text-white font-medium truncate">{sub}</p>}
            </div>
          </>
        )}

        {/* Päivämerkki kuvan päällä — kuten tapahtumakortin Maksuton/aika */}
        <div className="absolute top-2.5 left-2.5">
          <span className="text-[10px] font-black px-2 py-0.5 rounded-full bg-black/55 backdrop-blur-sm" style={{ color: date.color }}>
            {date.text}
          </span>
        </div>
        {typeof item.rating === 'number' && (item.reviews ?? 0) >= 5 && (
          <div className="absolute bottom-2.5 right-2.5">
            <span className="text-[11px] font-bold px-2 py-0.5 rounded-full text-white/90 bg-black/50 backdrop-blur-sm">
              ★ {item.rating.toFixed(1)} ({item.reviews})
            </span>
          </div>
        )}
      </div>

      {/* Inforivi kuvan alla — kuten tapahtumakorteissa */}
      <div className="px-3 pt-2.5 pb-3 space-y-0.5">
        <p className="text-white font-bold text-[13px] leading-snug line-clamp-2 group-hover:text-[#c7caff] transition-colors">
          {item.name}
        </p>
        {sub && <p className="text-white/40 text-[11px] truncate">{sub}</p>}
        {item.news && (
          <p className="text-white/55 text-[11px] leading-snug line-clamp-2">
            📰 {item.news.title} <span className="text-white/30">· {item.news.source || relativeNews(item.news.date)}</span>
          </p>
        )}
        <p className="text-[10px] text-white/25 truncate">
          {item.sources.map((s) => s.label).join(' · ')}{href ? ' ↗' : ''}
        </p>
      </div>
    </>
  )

  const cls = 'group relative w-full text-left rounded-xl overflow-hidden bg-[#111] hover:scale-[1.02] active:scale-[0.97] transition-transform duration-200 block'
  return href ? (
    <a href={href} target="_blank" rel="noopener" className={cls}>{inner}</a>
  ) : (
    <div className={cls}>{inner}</div>
  )
}

// ── HEROKORTTI — sivun käyntikortti: tuorein kuvallinen nosto ───────────────

function HeroCard({ item }: { item: NewItem }) {
  const [imgOk, setImgOk] = useState(true)
  const meta = KIND_META[item.kind]
  const date = dateLabel(item)
  const href = primaryHref(item)
  const inner = (
    <>
      {item.image && imgOk ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={item.image} onError={() => setImgOk(false)} alt={item.name}
          className="absolute inset-0 w-full h-full object-cover" />
      ) : (
        <div className="absolute inset-0 flex items-center justify-center text-6xl" style={{ background: meta.gradient }}>
          {meta.emoji}
        </div>
      )}
      <div className="absolute inset-0"
        style={{ background: 'linear-gradient(to top,rgba(10,10,12,.96) 0%,rgba(10,10,12,.25) 55%,transparent 100%)' }} />
      <div className="absolute top-4 right-4">
        <span className="text-[11px] font-black px-3 py-1 rounded-full bg-black/55 backdrop-blur-sm" style={{ color: date.color }}>
          {date.text}
        </span>
      </div>
      <div className="absolute bottom-0 left-0 right-0 p-5">
        <p className="text-[11px] font-black uppercase tracking-[.12em] mb-1" style={{ color: 'rgba(255,255,255,.55)' }}>
          {meta.emoji} {meta.label.toUpperCase()}{item.neighborhood ? ` · ${item.neighborhood.toUpperCase()}` : ''}
        </p>
        <h2 className="font-black text-white text-2xl leading-tight" style={{ letterSpacing: '-0.02em' }}>
          {item.name}{href ? ' ↗' : ''}
        </h2>
        <p className="text-[13px] text-white/60 mt-1">
          {subLine(item)}
          {typeof item.rating === 'number' && (item.reviews ?? 0) >= 5 && (
            <span className="font-bold" style={{ color: '#e8c06a' }}> · jo ★ {item.rating.toFixed(1)} ({item.reviews})</span>
          )}
        </p>
        {item.news && (
          <p className="text-[12.5px] leading-snug text-white/80 mt-1.5">
            📰 {item.news.title} <span className="text-white/40">· {item.news.source}</span>
          </p>
        )}
      </div>
    </>
  )
  const cls = 'relative w-full rounded-[22px] overflow-hidden block'
  const style = { aspectRatio: '16/9', boxShadow: '0 22px 50px -20px rgba(10,10,12,.8)' } as const
  return href ? (
    <a href={href} target="_blank" rel="noopener" className={cls} style={style}>{inner}</a>
  ) : (
    <div className={cls} style={style}>{inner}</div>
  )
}

// ── NÄKYMÄ ──────────────────────────────────────────────────────────────────

export default function NewInHelsinkiView({ data }: { data: NewInHelsinki }) {
  const [kind, setKind] = useState<NewKind | 'all'>('all')

  // Hero: tuorein kuvallinen AVATTU paikka; jos sellaista ei ole, tuorein
  // kuvallinen näyttely. Kuukausilistat ovat valmiiksi tuorein ensin.
  const hero = useMemo(() => {
    if (kind !== 'all') return null
    const rows = data.months.flatMap((m) => m.items).filter((i) => i.image)
    return rows.find((i) => i.kind !== 'nayttely') ?? rows[0] ?? null
  }, [data.months, kind])

  const upcoming = useMemo(
    () => (kind === 'all' ? data.upcoming : data.upcoming.filter((i) => i.kind === kind)),
    [data.upcoming, kind],
  )
  const months = useMemo(
    () =>
      data.months
        .map((m) => ({
          ...m,
          items: m.items.filter((i) => (kind === 'all' ? i.id !== hero?.id : i.kind === kind)),
        }))
        .filter((m) => m.items.length > 0),
    [data.months, kind, hero],
  )

  return (
    <div className="space-y-7">
      {/* Suodattimet */}
      <div className="flex flex-wrap gap-2">
        {FILTERS.map((f) => {
          const active = kind === f
          const label = f === 'all' ? '✨ Kaikki' : `${KIND_META[f].emoji} ${KIND_META[f].label}`
          return (
            <button key={f} onClick={() => setKind(f)}
              className="text-[12px] font-bold px-3 py-1.5 rounded-full transition-colors"
              style={active
                ? { background: 'rgba(107,118,255,.25)', color: '#c7ccff', border: '1px solid rgba(107,118,255,.4)' }
                : { background: 'rgba(255,255,255,.05)', color: 'rgba(255,255,255,.5)', border: '1px solid rgba(255,255,255,.08)' }}>
              {label}
            </button>
          )
        })}
      </div>

      {/* Hero — tuorein kuvallinen nosto */}
      {hero && <HeroCard item={hero} />}

      {/* Uutiskaista: avautumisjutut joille ei (vielä) ole riviä rekistereissä */}
      {kind === 'all' && data.newsRail.length > 0 && (
        <section>
          <div className="flex items-baseline gap-2 mb-3">
            <h2 className="font-black text-white text-[18px]" style={{ letterSpacing: '-0.02em' }}>📰 Uutisissa nyt</h2>
          </div>
          <ul className="space-y-1.5">
            {data.newsRail.map((n) => (
              <li key={n.url}>
                <a href={n.url} target="_blank" rel="noopener"
                  className="block rounded-lg px-3 py-2 text-[13px] leading-snug text-white/75 hover:text-white transition-colors"
                  style={{ background: 'rgba(56,189,248,.07)', border: '1px solid rgba(56,189,248,.12)' }}>
                  {n.title}
                  <span className="text-white/35"> · {n.source || 'uutinen'} · {relativeNews(n.date)} ↗</span>
                </a>
              </li>
            ))}
          </ul>
        </section>
      )}

      {/* Tulossa */}
      {upcoming.length > 0 && (
        <section>
          <div className="flex items-baseline gap-2 mb-3">
            <h2 className="font-black text-[18px]" style={{ color: '#fcd34d', letterSpacing: '-0.02em' }}>⏳ Tulossa</h2>
            <span className="text-[12px] font-bold text-white/30">{upcoming.length}</span>
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3 items-start">
            {upcoming.map((i) => <NewPosterCard key={i.id} item={i} />)}
          </div>
        </section>
      )}

      {/* Kuukausiaikajana */}
      {months.map((m) => (
        <section key={m.key}>
          <div className="flex items-baseline gap-2 mb-3">
            <h2 className="font-black text-white text-[18px]" style={{ letterSpacing: '-0.02em' }}>{m.label}</h2>
            <span className="text-[12px] font-bold text-white/30">{m.items.length} uutta</span>
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3 items-start">
            {m.items.map((i) => <NewPosterCard key={i.id} item={i} />)}
          </div>
        </section>
      ))}

      {months.length === 0 && upcoming.length === 0 && (
        <p className="text-white/40 text-sm py-8 text-center">Ei rivejä tällä suodattimella.</p>
      )}
    </div>
  )
}

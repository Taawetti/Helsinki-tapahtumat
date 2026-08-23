'use client'

// "Uutta Helsingissä" -aikajanan asiakasosa: herokortti + suodatinpillerit +
// kuukausirivit. Data kootaan palvelimella (app/uutta-helsingissa/page.tsx →
// lib/new-in-helsinki.ts); tämä komponentti vain suodattaa ja piirtää.
//
// Väriperiaate sama kuin sovelluksen syymerkeissä (ReasonBadge): näyttelyt
// violetteja, uudet paikat vihreitä, tulevat keltaisia, uutiset syaaneja —
// hillittynä, jottei aikajana muutu liikennevaloksi.

import { useMemo, useState } from 'react'
import type { NewInHelsinki, NewItem, NewKind } from '@/lib/new-in-helsinki'

const KIND_META: Record<NewKind, { emoji: string; label: string; accent: string }> = {
  ravintola: { emoji: '🍽', label: 'Ravintolat',           accent: 'rgba(16,185,129,.35)' },
  baari:     { emoji: '🍸', label: 'Baarit',               accent: 'rgba(16,185,129,.35)' },
  kahvila:   { emoji: '☕', label: 'Kahvilat & leipomot',  accent: 'rgba(16,185,129,.35)' },
  kauppa:    { emoji: '🛍', label: 'Kaupat',               accent: 'rgba(16,185,129,.35)' },
  tekeminen: { emoji: '🧖', label: 'Tekeminen',            accent: 'rgba(16,185,129,.35)' },
  nayttely:  { emoji: '🖼', label: 'Näyttelyt',            accent: 'rgba(192,132,252,.35)' },
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

// ── HEROKORTTI — sivun käyntikortti: tuorein kuvallinen nosto ───────────────

function HeroCard({ item }: { item: NewItem }) {
  const [imgOk, setImgOk] = useState(true)
  const meta = KIND_META[item.kind]
  const date = dateLabel(item)
  return (
    <div className="relative w-full rounded-[22px] overflow-hidden"
      style={{ aspectRatio: '16/9', boxShadow: '0 22px 50px -20px rgba(10,10,12,.8)' }}>
      {item.image && imgOk ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={item.image} onError={() => setImgOk(false)} alt={item.name}
          className="absolute inset-0 w-full h-full object-cover" />
      ) : (
        <div className="absolute inset-0 flex items-center justify-center text-6xl"
          style={{ background: 'linear-gradient(135deg,#16162a,#1e2440)' }}>
          {meta.emoji}
        </div>
      )}
      <div className="absolute inset-0"
        style={{ background: 'linear-gradient(to top,rgba(10,10,12,.96) 0%,rgba(10,10,12,.25) 55%,transparent 100%)' }} />
      <div className="absolute top-4 right-4">
        <span className="text-[11px] font-black px-3 py-1 rounded-full"
          style={{ background: 'rgba(10,10,12,.55)', color: date.color, border: `1px solid ${meta.accent}` }}>
          {date.text}
        </span>
      </div>
      <div className="absolute bottom-0 left-0 right-0 p-5">
        <p className="text-[11px] font-black uppercase tracking-[.12em] mb-1" style={{ color: 'rgba(255,255,255,.55)' }}>
          {meta.emoji} {meta.label.toUpperCase()}{item.neighborhood ? ` · ${item.neighborhood.toUpperCase()}` : ''}
        </p>
        <h2 className="font-black text-white text-2xl leading-tight" style={{ letterSpacing: '-0.02em' }}>
          {item.www ? (
            <a href={/^https?:\/\//i.test(item.www) ? item.www : `https://${item.www}`}
              target="_blank" rel="noopener" className="hover:text-blue-200 transition-colors">
              {item.name} ↗
            </a>
          ) : item.name}
        </h2>
        <p className="text-[13px] text-white/60 mt-1">
          {subLine(item)}
          {typeof item.rating === 'number' && (item.reviews ?? 0) >= 5 && (
            <span className="font-bold" style={{ color: '#e8c06a' }}> · jo ★ {item.rating.toFixed(1)} ({item.reviews})</span>
          )}
        </p>
        {item.news && (
          <a href={item.news.url} target="_blank" rel="noopener"
            className="block text-[12.5px] leading-snug text-white/80 hover:text-white transition-colors mt-1.5">
            📰 {item.news.title} <span className="text-white/40">↗</span>
          </a>
        )}
      </div>
    </div>
  )
}

// ── RIVI ────────────────────────────────────────────────────────────────────

function NewItemRow({ item }: { item: NewItem }) {
  // Kuolleen kuvan tilalle emoji-laatta — sama varautuminen kuin korteissa
  // muualla sovelluksessa (Googlen kuvaosoitteet lahoavat).
  const [imgOk, setImgOk] = useState(true)
  const meta = KIND_META[item.kind]
  const date = dateLabel(item)
  return (
    <li className="rounded-xl p-3.5 flex gap-3"
      style={{
        background: 'rgba(255,255,255,.04)',
        border: '1px solid rgba(255,255,255,.07)',
        borderLeft: `3px solid ${meta.accent}`,
      }}>
      {item.image && imgOk ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={item.image} onError={() => setImgOk(false)} alt="" loading="lazy"
          className="w-20 h-20 object-cover rounded-lg shrink-0" />
      ) : (
        <div className="w-20 h-20 rounded-lg shrink-0 flex items-center justify-center text-2xl"
          style={{ background: 'rgba(255,255,255,.05)' }}>
          {meta.emoji}
        </div>
      )}
      <div className="min-w-0 flex-1 space-y-1">
        <div className="flex items-baseline justify-between gap-2 flex-wrap">
          <h3 className="font-bold text-white text-[14px] leading-snug">
            {item.www ? (
              <a href={/^https?:\/\//i.test(item.www) ? item.www : `https://${item.www}`}
                target="_blank" rel="noopener" className="hover:text-blue-300 transition-colors">
                {item.name} ↗
              </a>
            ) : item.name}
          </h3>
          <span className="text-[11px] font-black shrink-0" style={{ color: date.color }}>
            {date.text}
          </span>
        </div>
        <p className="text-[12px] text-white/45">
          {subLine(item)}
          {typeof item.rating === 'number' && (item.reviews ?? 0) >= 5 && (
            <span className="text-amber-300/80"> · jo ★ {item.rating.toFixed(1)} ({item.reviews})</span>
          )}
        </p>
        {/* Tuore lehtijuttu juuri tästä paikasta — linkki artikkeliin. */}
        {item.news && (
          <a href={item.news.url} target="_blank" rel="noopener"
            className="block text-[12px] leading-snug text-white/70 hover:text-white transition-colors">
            📰 {item.news.title}
            <span className="text-white/35"> · {item.news.source || relativeNews(item.news.date)} ↗</span>
          </a>
        )}
        <p className="text-[10.5px] text-white/30">
          {item.sources.map((s, i) => (
            <span key={i}>
              {i > 0 && ' · '}
              {s.url ? (
                <a href={s.url} target="_blank" rel="noopener" className="hover:text-white/60 transition-colors">{s.label} ↗</a>
              ) : s.label}
            </span>
          ))}
          {item.lat && item.lon && (
            <>
              {' · '}
              <a href={`https://maps.google.com/maps?daddr=${item.lat},${item.lon}`}
                target="_blank" rel="noopener" className="hover:text-white/60 transition-colors">kartalla ↗</a>
            </>
          )}
        </p>
      </div>
    </li>
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
    <div className="space-y-8">
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
          <h2 className="text-[13px] font-black uppercase tracking-[.12em] text-white/40 mb-2">📰 Uutisissa nyt</h2>
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
          <h2 className="text-[15px] font-black tracking-[.08em] uppercase mb-3" style={{ color: '#fcd34d' }}>
            ⏳ Tulossa <span className="text-white/30 font-bold">· {upcoming.length}</span>
          </h2>
          <ul className="space-y-2">
            {upcoming.map((i) => <NewItemRow key={i.id} item={i} />)}
          </ul>
        </section>
      )}

      {/* Kuukausiaikajana */}
      {months.map((m) => (
        <section key={m.key}>
          <h2 className="text-[15px] font-black tracking-[.08em] uppercase text-white/70 mb-3">
            {m.label} <span className="text-white/30 font-bold">· {m.items.length}</span>
          </h2>
          <ul className="space-y-2">
            {m.items.map((i) => <NewItemRow key={i.id} item={i} />)}
          </ul>
        </section>
      ))}

      {months.length === 0 && upcoming.length === 0 && (
        <p className="text-white/40 text-sm py-8 text-center">Ei rivejä tällä suodattimella.</p>
      )}
    </div>
  )
}

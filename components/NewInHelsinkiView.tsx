'use client'

// "Uutta Helsingissä" -aikajanan asiakasosa: suodatinpillerit + rivit.
// Data kootaan palvelimella (app/uutta-helsingissa/page.tsx →
// lib/new-in-helsinki.ts); tämä komponentti vain suodattaa ja piirtää.

import { useMemo, useState } from 'react'
import type { NewInHelsinki, NewItem, NewKind } from '@/lib/new-in-helsinki'

const KIND_META: Record<NewKind, { emoji: string; label: string }> = {
  ravintola: { emoji: '🍽', label: 'Ravintolat' },
  baari:     { emoji: '🍸', label: 'Baarit' },
  kahvila:   { emoji: '☕', label: 'Kahvilat & leipomot' },
  kauppa:    { emoji: '🛍', label: 'Kaupat' },
  tekeminen: { emoji: '🧖', label: 'Tekeminen' },
  nayttely:  { emoji: '🖼', label: 'Näyttelyt' },
}

const FILTERS: (NewKind | 'all')[] = ['all', 'ravintola', 'baari', 'kahvila', 'nayttely', 'tekeminen', 'kauppa']

function fmtDate(iso: string): string {
  const d = new Date(iso + 'T12:00:00Z')
  if (Number.isNaN(d.getTime())) return ''
  return `${d.getUTCDate()}.${d.getUTCMonth() + 1}.`
}

function relativeNews(iso: string): string {
  const days = Math.floor((Date.now() - new Date(iso).getTime()) / 86_400_000)
  if (Number.isNaN(days) || days < 1) return 'tänään'
  if (days === 1) return 'eilen'
  if (days < 7) return `${days} pv sitten`
  return `${Math.floor(days / 7)} vk sitten`
}

function NewItemRow({ item }: { item: NewItem }) {
  // Kuolleen kuvan tilalle emoji-laatta — sama varautuminen kuin korteissa
  // muualla sovelluksessa (Googlen kuvaosoitteet lahoavat).
  const [imgOk, setImgOk] = useState(true)
  const meta = KIND_META[item.kind]
  const dateLabel = item.upcoming
    ? (item.kind === 'nayttely' ? `Avautuu ${fmtDate(item.date)}` : `Avaa ${fmtDate(item.date)}`)
    : (item.kind === 'nayttely' ? `Alkoi ${fmtDate(item.date)}` : `Avattu ${fmtDate(item.date)}`)
  return (
    <li className="rounded-xl p-3.5 flex gap-3"
      style={{ background: 'rgba(255,255,255,.04)', border: '1px solid rgba(255,255,255,.07)' }}>
      {item.image && imgOk ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={item.image} onError={() => setImgOk(false)} alt="" loading="lazy"
          className="w-16 h-16 object-cover rounded-lg shrink-0" />
      ) : (
        <div className="w-16 h-16 rounded-lg shrink-0 flex items-center justify-center text-2xl"
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
          <span className={`text-[11px] font-black shrink-0 ${item.upcoming ? 'text-amber-300' : 'text-emerald-400'}`}>
            {dateLabel}
          </span>
        </div>
        <p className="text-[12px] text-white/45">
          {[item.note, item.neighborhood, item.address?.split(',')[0]]
            .filter((x, i, arr) => x && arr.indexOf(x) === i).slice(0, 2).join(' · ')}
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

export default function NewInHelsinkiView({ data }: { data: NewInHelsinki }) {
  const [kind, setKind] = useState<NewKind | 'all'>('all')

  const upcoming = useMemo(
    () => (kind === 'all' ? data.upcoming : data.upcoming.filter((i) => i.kind === kind)),
    [data.upcoming, kind],
  )
  const months = useMemo(
    () =>
      data.months
        .map((m) => ({ ...m, items: kind === 'all' ? m.items : m.items.filter((i) => i.kind === kind) }))
        .filter((m) => m.items.length > 0),
    [data.months, kind],
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
          <h2 className="text-[13px] font-black uppercase tracking-[.12em] text-amber-300/80 mb-2">⏳ Tulossa</h2>
          <ul className="space-y-2">
            {upcoming.map((i) => <NewItemRow key={i.id} item={i} />)}
          </ul>
        </section>
      )}

      {/* Kuukausiaikajana */}
      {months.map((m) => (
        <section key={m.key}>
          <h2 className="text-[13px] font-black uppercase tracking-[.12em] text-white/40 mb-2">{m.label}</h2>
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

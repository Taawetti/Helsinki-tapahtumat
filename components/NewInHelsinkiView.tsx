'use client'

// "Uutta Helsingissä" — kortit TAPAHTUMAKORTTIEN kuvakielellä (omistajan
// linjaus: "visuaalisesti samanlainen kuin tapahtumat-välilehti"). Sama
// juliste-rakenne kuin PosterCard: 3/4-kuva-alue tai tumma liukuväri + iso
// haalea emoji, merkit kuvan päällä, otsikkorivi alla, koko kortti on yksi
// klikkipinta. Data kootaan palvelimella (lib/new-in-helsinki.ts).

import { useEffect, useMemo, useState } from 'react'
import { X, MapPin, Navigation, Globe, Clock, ExternalLink, MessageCircle, Copy, Check } from 'lucide-react'
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

// ── JULISTEKORTTI — sama rakenne kuin tapahtumien PosterCard ────────────────

function NewPosterCard({ item, onOpen }: { item: NewItem; onOpen: (i: NewItem) => void }) {
  const [imgOk, setImgOk] = useState(true)
  const meta = KIND_META[item.kind]
  const date = dateLabel(item)
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
          {item.sources.map((s) => s.label).join(' · ')}
        </p>
      </div>
    </>
  )

  // Kortti avaa infopaneelin kuten tapahtumakortit — linkit ovat paneelissa.
  return (
    <button type="button" onClick={() => onOpen(item)}
      className="group relative w-full text-left rounded-xl overflow-hidden bg-[#111] hover:scale-[1.02] active:scale-[0.97] transition-transform duration-200 block focus:outline-none focus-visible:ring-2 focus-visible:ring-[#6b76ff]">
      {inner}
    </button>
  )
}

// ── HEROKORTTI — sivun käyntikortti: tuorein kuvallinen nosto ───────────────

function HeroCard({ item, onOpen }: { item: NewItem; onOpen: (i: NewItem) => void }) {
  const [imgOk, setImgOk] = useState(true)
  const meta = KIND_META[item.kind]
  const date = dateLabel(item)
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
          {item.name}
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
  return (
    <button type="button" onClick={() => onOpen(item)}
      className="relative w-full rounded-[22px] overflow-hidden block text-left focus:outline-none focus-visible:ring-2 focus-visible:ring-[#6b76ff]"
      style={{ aspectRatio: '16/9', boxShadow: '0 22px 50px -20px rgba(10,10,12,.8)' }}>
      {inner}
    </button>
  )
}

// ── INFOPANEELI — sama liukurakenne kuin tapahtumien EventDetailPanel ───────
// (pohjalta nouseva kortti mobiilissa, oikean laidan paneeli työpöydällä).
// Ulkoiset linkit (uutinen, nettisivu, lähde, kartta) asuvat täällä.

function NewItemDetailPanel({ item, onClose }: { item: NewItem | null; onClose: () => void }) {
  // key vaihtaa sisäkomponentin joka kortille — liukuanimaatio ja
  // kopioitu-tila alkavat puhtaalta pöydältä ilman tilan nollausefektejä.
  if (!item) return null
  return <NewItemDetailPanelInner key={item.id} item={item} onClose={onClose} />
}

function NewItemDetailPanelInner({ item, onClose }: { item: NewItem; onClose: () => void }) {
  const [slideIn, setSlideIn] = useState(false)
  const [copied, setCopied] = useState(false)
  useEffect(() => {
    const raf = requestAnimationFrame(() => setSlideIn(true))
    const esc = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    document.addEventListener('keydown', esc)
    return () => { cancelAnimationFrame(raf); document.removeEventListener('keydown', esc) }
  }, [onClose])

  const meta = KIND_META[item.kind]
  const date = dateLabel(item)
  const www = item.www ? (/^https?:\/\//i.test(item.www) ? item.www : `https://${item.www}`) : undefined
  const shareUrl = www ?? item.news?.url ?? item.sources.find((s) => s.url)?.url ?? 'https://helsinki-tapahtumat.vercel.app/uutta-helsingissa'
  const shareText = `${item.name} — Uutta Helsingissä`
  const mapsUrl = item.lat && item.lon
    ? `https://maps.google.com/maps?q=${item.lat},${item.lon}`
    : item.address ? `https://maps.google.com/maps?q=${encodeURIComponent(item.address + ', Helsinki')}` : undefined
  const transitUrl = item.lat && item.lon
    ? `https://maps.google.com/maps?daddr=${item.lat},${item.lon}&travelmode=transit`
    : item.address ? `https://maps.google.com/maps?daddr=${encodeURIComponent(item.address + ', Helsinki')}&travelmode=transit` : undefined

  return (
    <>
      <div className="fixed inset-0 z-40 bg-black/60" onClick={onClose} aria-hidden />
      <div
        role="dialog" aria-modal aria-label={item.name}
        className="fixed inset-x-0 bottom-0 z-50 rounded-t-3xl overflow-hidden md:inset-x-auto md:right-0 md:top-0 md:bottom-0 md:rounded-none md:w-full md:max-w-lg"
        style={{ transform: slideIn ? 'translateY(0)' : 'translateY(100%)', transition: 'transform 340ms cubic-bezier(0.32,0.72,0,1)', willChange: 'transform' }}
      >
        <div className="h-[92dvh] overflow-y-auto bg-[#0e1117] shadow-2xl md:h-full">
          <div className="md:hidden flex justify-center pt-3 pb-1 shrink-0">
            <div className="w-10 h-1 rounded-full bg-white/20" />
          </div>

          {/* Kuva */}
          <div className="relative h-60 w-full shrink-0" style={{ background: '#1a1f2e' }}>
            {item.image ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={item.image} alt={item.name} className="absolute inset-0 w-full h-full object-cover" />
            ) : (
              <div className="h-full w-full flex items-center justify-center text-7xl" style={{ background: meta.gradient }}>{meta.emoji}</div>
            )}
            <div className="absolute inset-0 bg-gradient-to-t from-[#0e1117] via-black/20 to-transparent" />
            <span className="absolute top-4 left-4 text-[11px] font-black px-3 py-1 rounded-full bg-black/55 backdrop-blur-sm" style={{ color: date.color }}>
              {date.text}
            </span>
            <button onClick={onClose} aria-label="Sulje"
              className="absolute top-4 right-4 p-2 bg-black/50 hover:bg-black/80 rounded-full text-white transition-colors">
              <X size={16} />
            </button>
          </div>

          <div className="p-6 space-y-5">
            <div>
              <p className="text-[11px] font-black uppercase tracking-[.12em] mb-1" style={{ color: meta.accent }}>
                {meta.emoji} {meta.label}
              </p>
              <h2 className="text-xl font-bold text-white leading-tight">{item.name}</h2>
            </div>

            {/* Meta */}
            <div className="space-y-3 bg-white/4 rounded-xl p-4 border border-white/6">
              <div className="flex items-start gap-3 text-sm">
                <Clock size={15} className="mt-0.5 shrink-0" style={{ color: '#6b76ff' }} />
                <span className="text-white/80">{date.text}{item.kind === 'nayttely' && item.note ? ` · ${item.note.split(' · ').pop()}` : ''}</span>
              </div>
              {(item.address || item.neighborhood || (item.kind === 'nayttely' && item.note)) && (
                <div className="flex items-start gap-3 text-sm">
                  <MapPin size={15} className="mt-0.5 shrink-0" style={{ color: '#6b76ff' }} />
                  <div>
                    <p className="text-white/80 font-medium">
                      {item.kind === 'nayttely' ? (item.note?.split(' · ')[0] ?? item.neighborhood) : (item.address ?? item.neighborhood)}
                    </p>
                    {item.kind !== 'nayttely' && item.neighborhood && item.address && (
                      <p className="text-white/40 text-xs mt-0.5">{item.neighborhood}</p>
                    )}
                  </div>
                </div>
              )}
              {typeof item.rating === 'number' && (item.reviews ?? 0) >= 5 && (
                <div className="flex items-center gap-3 text-sm">
                  <span className="text-[15px] leading-none" style={{ color: '#e8c06a' }}>★</span>
                  <span className="text-white/80">jo {item.rating.toFixed(1)} · {item.reviews} arvostelua</span>
                </div>
              )}
            </div>

            {/* Uutinen */}
            {item.news && (
              <a href={item.news.url} target="_blank" rel="noopener"
                className="block rounded-xl px-4 py-3 text-[13px] leading-snug text-white/80 hover:text-white transition-colors"
                style={{ background: 'rgba(56,189,248,.08)', border: '1px solid rgba(56,189,248,.15)' }}>
                📰 {item.news.title}
                <span className="text-white/40"> · {item.news.source} ↗</span>
              </a>
            )}

            {/* Lähteet — mistä tieto on peräisin */}
            <p className="text-[11px] text-white/30">
              {item.sources.map((s, i) => (
                <span key={i}>
                  {i > 0 && ' · '}
                  {s.url ? (
                    <a href={s.url} target="_blank" rel="noopener" className="hover:text-white/60 transition-colors underline-offset-2">
                      {s.label} ↗
                    </a>
                  ) : s.label}
                </span>
              ))}
            </p>

            {/* Jaa */}
            <div className="space-y-2">
              <p className="text-xs font-semibold text-white/25 uppercase tracking-widest">Jaa kavereille</p>
              <div className="grid grid-cols-3 gap-2">
                <button onClick={() => window.open(`https://wa.me/?text=${encodeURIComponent(`${shareText}\n${shareUrl}`)}`, '_blank')}
                  className="flex flex-col items-center gap-1.5 bg-[#25D366]/10 hover:bg-[#25D366]/20 border border-[#25D366]/20 rounded-xl py-3 px-2 transition-colors">
                  <MessageCircle size={18} className="text-[#25D366]" />
                  <span className="text-[#25D366] text-[11px] font-semibold">WhatsApp</span>
                </button>
                <button onClick={() => window.open(`https://t.me/share/url?url=${encodeURIComponent(shareUrl)}&text=${encodeURIComponent(shareText)}`, '_blank')}
                  className="flex flex-col items-center gap-1.5 bg-[#0088cc]/10 hover:bg-[#0088cc]/20 border border-[#0088cc]/20 rounded-xl py-3 px-2 transition-colors">
                  <span className="text-[#0088cc] text-lg leading-none">✈️</span>
                  <span className="text-[#0088cc] text-[11px] font-semibold">Telegram</span>
                </button>
                <button onClick={() => { navigator.clipboard.writeText(`${shareText}\n${shareUrl}`); setCopied(true); setTimeout(() => setCopied(false), 2000) }}
                  className={`flex flex-col items-center gap-1.5 border rounded-xl py-3 px-2 transition-all ${copied ? 'bg-emerald-500/10 border-emerald-500/30' : 'bg-white/5 border-white/10 hover:bg-white/8'}`}>
                  {copied ? <Check size={18} className="text-emerald-400" /> : <Copy size={18} className="text-white/50" />}
                  <span className={`text-[11px] font-semibold ${copied ? 'text-emerald-400' : 'text-white/40'}`}>{copied ? 'Kopioitu' : 'Kopioi'}</span>
                </button>
              </div>
            </div>

            {/* CTA:t */}
            <div className="flex flex-col gap-2.5 pt-1">
              {www && (
                <a href={www} target="_blank" rel="noopener"
                  className="flex items-center justify-center gap-2 text-white font-bold text-sm py-3.5 rounded-xl transition-colors"
                  style={{ background: 'linear-gradient(150deg,#6b76ff,#5059e6)' }}>
                  <Globe size={15} /> Nettisivu <ExternalLink size={13} className="opacity-70" />
                </a>
              )}
              {!www && item.sources.find((s) => s.url) && (
                <a href={item.sources.find((s) => s.url)!.url} target="_blank" rel="noopener"
                  className="flex items-center justify-center gap-2 text-white font-bold text-sm py-3.5 rounded-xl transition-colors"
                  style={{ background: 'linear-gradient(150deg,#6b76ff,#5059e6)' }}>
                  <Globe size={15} /> {item.sources.find((s) => s.url)!.label} <ExternalLink size={13} className="opacity-70" />
                </a>
              )}
              {(mapsUrl || transitUrl) && (
                <div className="grid grid-cols-2 gap-2">
                  {mapsUrl && (
                    <a href={mapsUrl} target="_blank" rel="noopener"
                      className="flex items-center justify-center gap-1.5 bg-white/5 hover:bg-white/8 text-white/60 font-medium text-sm py-3 rounded-xl border border-white/8 transition-colors">
                      <Navigation size={14} /> Kartta
                    </a>
                  )}
                  {transitUrl && (
                    <a href={transitUrl} target="_blank" rel="noopener"
                      className="flex items-center justify-center gap-1.5 text-sm font-medium py-3 rounded-xl border transition-colors"
                      style={{ background: 'rgba(107,118,255,.1)', borderColor: 'rgba(107,118,255,.2)', color: '#a3abff' }}>
                      <Navigation size={14} /> Reittiohjeet
                    </a>
                  )}
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </>
  )
}

// ── NÄKYMÄ ──────────────────────────────────────────────────────────────────

export default function NewInHelsinkiView({ data }: { data: NewInHelsinki }) {
  const [kind, setKind] = useState<NewKind | 'all'>('all')
  // Infopaneeli — kortit avaavat tämän kuten tapahtumakortit tapahtumapaneelin.
  const [selected, setSelected] = useState<NewItem | null>(null)

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
      {hero && <HeroCard item={hero} onOpen={setSelected} />}

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
            {upcoming.map((i) => <NewPosterCard key={i.id} item={i} onOpen={setSelected} />)}
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
            {m.items.map((i) => <NewPosterCard key={i.id} item={i} onOpen={setSelected} />)}
          </div>
        </section>
      ))}

      {months.length === 0 && upcoming.length === 0 && (
        <p className="text-white/40 text-sm py-8 text-center">Ei rivejä tällä suodattimella.</p>
      )}

      <NewItemDetailPanel item={selected} onClose={() => setSelected(null)} />
    </div>
  )
}

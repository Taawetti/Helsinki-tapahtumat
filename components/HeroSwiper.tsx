'use client'

import { useRef, useState } from 'react'
import { Heart } from 'lucide-react'
import type { Event } from '@/lib/types'
import { useLanguage } from '@/contexts/LanguageContext'
import { useFavorites } from '@/contexts/FavoritesContext'

// "🎸 ILLAN KEIKAT" — swipeable hero of up to 5 tonight picks (design handoff,
// screenshot 1-koti.png). Horizontal drag > 8px = swipe; less = tap → open.
export default function HeroSwiper({ events, onOpen }: { events: Event[]; onOpen: (e: Event) => void }) {
  const { lang, t } = useLanguage()
  const { toggle, isFavorite } = useFavorites()
  const [idx, setIdx] = useState(0)
  const [dragX, setDragX] = useState(0)
  const dragging = useRef(false)
  const moved = useRef(false)
  const startX = useRef(0)

  if (events.length === 0) return null
  const safeIdx = Math.min(idx, events.length - 1)
  const e = events[safeIdx]
  const start = new Date(e.startTime)
  const time = start.toLocaleTimeString(lang === 'fi' ? 'fi-FI' : 'en-GB', { hour: '2-digit', minute: '2-digit' })
  // Päivälabel tapahtuman OIKEASTA päivästä — päivävalitsin voi näyttää
  // huomisen/viikonlopun keikkoja, jolloin "Tänään" olisi väärin
  const isToday = start.toDateString() === new Date().toDateString()
  const dayLabel = isToday
    ? t('date.today')
    : start.toLocaleDateString(lang === 'fi' ? 'fi-FI' : 'en-GB', { weekday: 'short', day: 'numeric', month: 'numeric' })
  const fav = isFavorite(e.id)

  const onPointerDown = (ev: React.PointerEvent) => {
    dragging.current = true
    moved.current = false
    startX.current = ev.clientX
  }
  const onPointerMove = (ev: React.PointerEvent) => {
    if (!dragging.current) return
    const dx = ev.clientX - startX.current
    if (Math.abs(dx) > 8) moved.current = true
    setDragX(dx)
  }
  const endDrag = (ev: React.PointerEvent) => {
    if (!dragging.current) return
    dragging.current = false
    const dx = ev.clientX - startX.current
    setDragX(0)
    if (Math.abs(dx) > 60) {
      setIdx((i) => {
        const next = dx < 0 ? i + 1 : i - 1
        return Math.max(0, Math.min(events.length - 1, next))
      })
    } else if (!moved.current) {
      onOpen(e)
    }
  }
  // Selaimen kaappaama ele (pystyscrollaus pan-y:llä) EI ole napautus eikä
  // pyyhkäisy — pelkkä nollaus, muuten scrollaus avaisi detaljin vahingossa
  const cancelDrag = () => {
    dragging.current = false
    moved.current = false
    setDragX(0)
  }

  const cta = e.isFree
    ? `${t('common.free')} →`
    : e.price
      ? `${t('discover.tickets_from')} ${e.price} →`
      : e.ticketUrl
        ? `${t('discover.tickets')} →`
        : `${t('discover.details')} →`

  return (
    <section>
      <div
        className="relative w-full rounded-[22px] overflow-hidden select-none cursor-pointer"
        style={{
          aspectRatio: '16/10',
          boxShadow: '0 22px 50px -20px rgba(0,0,0,.6)',
          background: 'rgba(255,255,255,.03)',
          border: '1px solid rgba(255,255,255,.08)',
          transform: dragging.current ? `translateX(${dragX * 0.25}px)` : 'translateX(0)',
          transition: dragging.current ? 'none' : 'transform .25s ease',
          touchAction: 'pan-y',
        }}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={endDrag}
        onPointerCancel={cancelDrag}
        role="button"
        aria-label={e.title}
      >
        {e.image ? (
          <img src={e.image} alt="" draggable={false} className="absolute inset-0 w-full h-full object-cover" />
        ) : (
          <div className="absolute inset-0" style={{ background: 'radial-gradient(120% 120% at 20% 0%, rgba(107,118,255,.25), transparent 60%), #101019' }} />
        )}
        <div className="absolute inset-0" style={{ background: 'linear-gradient(to top,rgba(10,10,12,0.97) 0%,rgba(10,10,12,0.25) 55%,rgba(10,10,12,.25) 100%)' }} />

        {/* Top-left: badge + category chip */}
        <div className="absolute top-4 left-4 flex gap-2">
          <span className="text-[9px] font-black px-2.5 py-1.5 rounded-full text-white tracking-[.1em] uppercase"
            style={{ background: 'linear-gradient(150deg,#6b76ff,#5059e6)', boxShadow: '0 6px 16px -6px rgba(91,101,230,.8)' }}>
            🎸 {t('discover.hero_gigs')}
          </span>
          <span className="text-[10px] font-black px-2.5 py-1.5 rounded-full"
            style={{ background: 'rgba(10,10,12,.55)', border: '1px solid rgba(107,118,255,.4)', color: '#c7caff', backdropFilter: 'blur(8px)' }}>
            {dayLabel}
          </span>
        </div>

        {/* Top-right: counter + heart */}
        <div className="absolute top-4 right-4 flex items-center gap-2">
          <span className="text-[11px] font-black px-2.5 py-1.5 rounded-full text-white/85" style={{ background: 'rgba(10,10,12,.55)', backdropFilter: 'blur(8px)' }}>
            {safeIdx + 1} / {events.length}
          </span>
          <div
            role="button"
            aria-label={fav ? 'Poista suosikeista' : 'Tallenna suosikkeihin'}
            className="w-9 h-9 rounded-full flex items-center justify-center cursor-pointer"
            style={{ background: 'rgba(10,10,12,.55)', border: '1px solid rgba(255,255,255,.15)', backdropFilter: 'blur(8px)' }}
            onPointerDown={(ev) => ev.stopPropagation()}
            onPointerUp={(ev) => ev.stopPropagation()}
            onClick={(ev) => { ev.stopPropagation(); toggle(e) }}
          >
            <Heart size={15} fill={fav ? '#6b76ff' : 'none'} className={fav ? '' : 'text-white/75'} style={fav ? { color: '#6b76ff' } : {}} />
          </div>
        </div>

        {/* Bottom: kicker + title + CTA + time */}
        <div className="absolute bottom-0 left-0 right-0 p-5">
          <p className="text-[11px] font-black uppercase tracking-[.12em] mb-1" style={{ color: '#a3abff' }}>
            {(e.categories[0] ? `${e.categories[0]} · ` : '')}{e.location?.name ?? ''}
          </p>
          <h2 className="font-black text-white leading-[1.02] mb-3.5" style={{ fontSize: 'clamp(1.6rem,6.5vw,2.1rem)', letterSpacing: '-0.03em' }}>
            {e.title}
          </h2>
          <div className="flex items-center justify-between gap-3">
            <span className="px-4 py-2.5 rounded-full text-white text-[13px] font-black shrink-0"
              style={{ background: 'linear-gradient(150deg,#6b76ff,#5059e6)', boxShadow: '0 10px 24px -8px rgba(91,101,230,.85)' }}>
              {cta}
            </span>
            <span className="text-white/85 text-[14px] font-bold shrink-0">
              {dayLabel} {time}
            </span>
          </div>
        </div>
      </div>

      {/* Dots */}
      {events.length > 1 && (
        <div className="flex items-center justify-center gap-1.5 mt-3">
          {events.map((_, i) => (
            <button key={i} aria-label={`Nosto ${i + 1}`} onClick={() => setIdx(i)}
              className="rounded-full transition-all"
              style={{
                width: i === safeIdx ? 18 : 6, height: 6,
                background: i === safeIdx ? '#6b76ff' : 'rgba(255,255,255,.18)',
              }} />
          ))}
        </div>
      )}
    </section>
  )
}

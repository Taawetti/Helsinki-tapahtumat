'use client'

import { useRef, useState } from 'react'
import { Heart, ChevronLeft, ChevronRight } from 'lucide-react'
import type { Event } from '@/lib/types'
import { useLanguage } from '@/contexts/LanguageContext'
import { useFavorites } from '@/contexts/FavoritesContext'
import { classifyEventCategory } from '@/lib/event-category'
import type { TranslationKey } from '@/lib/i18n'

// "✦ ILLAN NOSTOT" — pyyhkäistävä hero, enintään 5 nostoa.
//
// LIUKURAIDE, EI SISÄLLÖNVAIHTO (omistaja 2.9.2026: "mobiililla sen pitää
// olla tosi sulava"). Aiemmin näkyvissä oli vain yksi kortti, jonka sisältö
// vaihdettiin pyyhkäisyn päätteeksi — kortti nytkähti eikä mitään liukunut.
// Nyt kaikki kortit ovat vierekkäin raiteella joka seuraa sormea 1:1, naapuri
// pilkottaa reunasta, ja irrotettaessa raide liukuu kohteeseen. Reunoilla
// kuminauhavastus (0.3×). Nopea heilautus (<220 ms, >20 px) vaihtaa kortin
// vaikka matka jäisi kynnyksen alle — se on se "sulava flick".
//
// TYÖPÖYTÄ: ‹ › -nuolet (md:flex) — hiirellä raahaaminen on kömpelöä, ja
// ilman kapturointia raahaus katkeaa elementin ulkopuolella. Nuolinäppäimet
// toimivat myös, kun hero on fokusoitu.
//
// Tap vs. pyyhkäisy: alle 8 px liike = napautus → avaa tietopaneelin.
// touchAction: pan-y jättää pystyscrollauksen selaimelle; setPointerCapturea
// EI käytetä (iOS Safari laukaisisi pointercancelin heti, ks. IdeaView).
export default function HeroSwiper({ events, onOpen }: { events: Event[]; onOpen: (e: Event) => void }) {
  const { lang, t } = useLanguage()
  const { toggle, isFavorite } = useFavorites()
  const [idx, setIdx] = useState(0)
  const [dragX, setDragX] = useState(0)
  const [dragging, setDragging] = useState(false)
  const moved = useRef(false)
  const startX = useRef(0)
  const startT = useRef(0)
  const trackRef = useRef<HTMLDivElement | null>(null)

  if (events.length === 0) return null
  const last = events.length - 1
  const safeIdx = Math.min(idx, last)
  const current = events[safeIdx]

  const go = (i: number) => setIdx(Math.max(0, Math.min(last, i)))

  const onPointerDown = (ev: React.PointerEvent) => {
    setDragging(true)
    moved.current = false
    startX.current = ev.clientX
    startT.current = performance.now()
  }
  const onPointerMove = (ev: React.PointerEvent) => {
    if (!dragging) return
    let dx = ev.clientX - startX.current
    if (Math.abs(dx) > 8) moved.current = true
    // Kuminauha reunoilla: ensimmäisestä ei pääse taaksepäin eikä viimeisestä
    // eteenpäin, mutta veto ei myöskään tunnu seinältä.
    if ((safeIdx === 0 && dx > 0) || (safeIdx === last && dx < 0)) dx *= 0.3
    setDragX(dx)
  }
  const endDrag = (ev: React.PointerEvent) => {
    if (!dragging) return
    setDragging(false)
    const dx = ev.clientX - startX.current
    const kesto = performance.now() - startT.current
    setDragX(0)
    const leveys = trackRef.current?.clientWidth ?? 400
    const kynnys = Math.min(60, leveys * 0.15)
    const flick = kesto < 220 && Math.abs(dx) > 20
    if (Math.abs(dx) > kynnys || flick) {
      go(dx < 0 ? safeIdx + 1 : safeIdx - 1)
    } else if (!moved.current) {
      onOpen(current)
    }
  }
  // Selaimen kaappaama ele (pystyscrollaus pan-y:llä) tai osoittimen poistuminen
  // ilman kapturointia: kesken jäänyt veto viedään loppuun samoilla säännöillä.
  const cancelDrag = () => {
    setDragging(false)
    moved.current = false
    setDragX(0)
  }

  const onKeyDown = (ev: React.KeyboardEvent) => {
    if (ev.key === 'ArrowLeft') { ev.preventDefault(); go(safeIdx - 1) }
    if (ev.key === 'ArrowRight') { ev.preventDefault(); go(safeIdx + 1) }
    if (ev.key === 'Enter' || ev.key === ' ') { ev.preventDefault(); onOpen(current) }
  }

  const fav = isFavorite(current.id)

  return (
    <section>
      <div className="relative">
        <div
          ref={trackRef}
          className="relative w-full rounded-[22px] overflow-hidden select-none cursor-pointer"
          style={{
            aspectRatio: '16/10',
            boxShadow: '0 22px 50px -20px rgba(0,0,0,.6)',
            background: 'rgba(255,255,255,.03)',
            border: '1px solid rgba(255,255,255,.08)',
            touchAction: 'pan-y',
          }}
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={endDrag}
          onPointerLeave={endDrag}
          onPointerCancel={cancelDrag}
          role="button"
          tabIndex={0}
          onKeyDown={onKeyDown}
          aria-label={current.title}
        >
          {/* Raide: kaikki kortit vierekkäin. transform seuraa sormea 1:1;
              irrotettaessa siirtymä liukuu kohteeseen. */}
          <div
            className="flex h-full motion-reduce:transition-none"
            style={{
              transform: `translateX(calc(${-safeIdx * 100}% + ${dragX}px))`,
              transition: dragging ? 'none' : 'transform .35s cubic-bezier(.22,.61,.36,1)',
              willChange: 'transform',
            }}
          >
            {events.map((e) => (
              <HeroSlide key={e.id} e={e} lang={lang} t={t} />
            ))}
          </div>

          {/* Laskuri + sydän KIINTEÄNÄ (eivät liu'u raiteen mukana):
              sydän koskee aina näkyvää korttia. */}
          <div className="absolute top-4 right-4 flex items-center gap-2">
            <span className="text-[11px] font-black px-2.5 py-1.5 rounded-full text-white/85" style={{ background: 'rgba(10,10,12,.55)', backdropFilter: 'blur(8px)' }}>
              {safeIdx + 1} / {events.length}
            </span>
            <div
              role="button"
              aria-label={fav ? t('detail.remove_fav') : t('detail.save_fav')}
              className="w-9 h-9 rounded-full flex items-center justify-center cursor-pointer"
              style={{ background: 'rgba(10,10,12,.55)', border: '1px solid rgba(255,255,255,.15)', backdropFilter: 'blur(8px)' }}
              onPointerDown={(ev) => ev.stopPropagation()}
              onPointerUp={(ev) => ev.stopPropagation()}
              onClick={(ev) => { ev.stopPropagation(); toggle(current) }}
            >
              <Heart size={15} fill={fav ? '#6b76ff' : 'none'} className={fav ? '' : 'text-white/75'} style={fav ? { color: '#6b76ff' } : {}} />
            </div>
          </div>
        </div>

        {/* ‹ › — vain md+: hiirellä raahaus on kömpelöä (omistaja 2.9.2026:
            "tietokoneella pitäisi olla joku nuoli"). Reunimmaisessa kortissa
            suunnan nuoli piilotetaan kokonaan — himmennetty nappi kutsuisi
            klikkaamaan turhaan. */}
        {events.length > 1 && safeIdx > 0 && (
          <button
            aria-label={t('hero.prev')}
            onClick={(ev) => { ev.stopPropagation(); go(safeIdx - 1) }}
            className="hidden md:flex absolute left-3 top-1/2 -translate-y-1/2 w-11 h-11 rounded-full items-center justify-center text-white/85 hover:text-white transition-all hover:scale-105"
            style={{ background: 'rgba(10,10,12,.6)', border: '1px solid rgba(255,255,255,.16)', backdropFilter: 'blur(10px)', boxShadow: '0 8px 24px -8px rgba(0,0,0,.7)' }}
          >
            <ChevronLeft size={22} />
          </button>
        )}
        {events.length > 1 && safeIdx < last && (
          <button
            aria-label={t('hero.next')}
            onClick={(ev) => { ev.stopPropagation(); go(safeIdx + 1) }}
            className="hidden md:flex absolute right-3 top-1/2 -translate-y-1/2 w-11 h-11 rounded-full items-center justify-center text-white/85 hover:text-white transition-all hover:scale-105"
            style={{ background: 'rgba(10,10,12,.6)', border: '1px solid rgba(255,255,255,.16)', backdropFilter: 'blur(10px)', boxShadow: '0 8px 24px -8px rgba(0,0,0,.7)' }}
          >
            <ChevronRight size={22} />
          </button>
        )}
      </div>

      {/* Dots */}
      {events.length > 1 && (
        <div className="flex items-center justify-center gap-1.5 mt-3">
          {events.map((_, i) => (
            <button key={i} aria-label={`${t('hero.slide')} ${i + 1}`} onClick={() => go(i)}
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

// Yksi kortti raiteella. Erillinen komponentti, jotta raide pysyy luettavana —
// sisältö on sama kuin ennen liukuraidetta (badge, kategoria, otsikko, CTA).
function HeroSlide({ e, lang, t: tt }: {
  e: Event
  lang: string
  t: (k: TranslationKey) => string
}) {
  const start = new Date(e.startTime)
  const time = start.toLocaleTimeString(lang === 'fi' ? 'fi-FI' : 'en-GB', { hour: '2-digit', minute: '2-digit' })
  // Päivälabel tapahtuman OIKEASTA päivästä — päivävalitsin voi näyttää
  // huomisen/viikonlopun keikkoja, jolloin "Tänään" olisi väärin
  const isToday = start.toDateString() === new Date().toDateString()
  const dayLabel = isToday
    ? tt('date.today')
    : start.toLocaleDateString(lang === 'fi' ? 'fi-FI' : 'en-GB', { weekday: 'short', day: 'numeric', month: 'numeric' })

  const cta = e.isFree
    ? `${tt('common.free')} →`
    : e.price
      ? `${tt('discover.tickets_from')} ${e.price} →`
      : e.ticketUrl
        ? `${tt('discover.tickets')} →`
        : `${tt('discover.details')} →`

  return (
    <div className="relative h-full shrink-0 grow-0 basis-full">
      {e.image ? (
        <img loading="lazy" src={e.image} alt="" draggable={false} className="absolute inset-0 w-full h-full object-cover" />
      ) : (
        <div className="absolute inset-0" style={{ background: 'radial-gradient(120% 120% at 20% 0%, rgba(107,118,255,.25), transparent 60%), #101019' }} />
      )}
      <div className="absolute inset-0" style={{ background: 'linear-gradient(to top,rgba(10,10,12,0.97) 0%,rgba(10,10,12,0.25) 55%,rgba(10,10,12,.25) 100%)' }} />

      {/* Top-left: badge + päivä (per kortti — päivä voi vaihdella) */}
      <div className="absolute top-4 left-4 flex gap-2">
        <span className="text-[9px] font-black px-2.5 py-1.5 rounded-full text-white tracking-[.1em] uppercase"
          style={{ background: 'linear-gradient(150deg,#6b76ff,#5059e6)', boxShadow: '0 6px 16px -6px rgba(91,101,230,.8)' }}>
          ✦ {tt('discover.hero_gigs')}
        </span>
        <span className="text-[10px] font-black px-2.5 py-1.5 rounded-full"
          style={{ background: 'rgba(10,10,12,.55)', border: '1px solid rgba(107,118,255,.4)', color: '#c7caff', backdropFilter: 'blur(8px)' }}>
          {dayLabel}
        </span>
      </div>

      {/* Bottom: kicker + title + CTA + time */}
      <div className="absolute bottom-0 left-0 right-0 p-5">
        <p className="text-[11px] font-black uppercase tracking-[.12em] mb-1" style={{ color: '#a3abff' }}>
          {(() => {
            // Sama kuvio kuin PosterCardissa: suomeksi lähteen oma kategoria,
            // englanniksi avainsanaketjusta johdettu (lib/event-category.ts).
            const cat = lang === 'en'
              ? (e.categories.length ? tt(classifyEventCategory(e.categories).tKey) : '')
              : (e.categories[0] ?? '')
            return `${cat ? `${cat} · ` : ''}${e.location?.name ?? ''}`
          })()}
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
  )
}

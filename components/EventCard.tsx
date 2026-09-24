'use client'

import { MapPin, Clock, Share2, Heart } from 'lucide-react'
import { Event } from '@/lib/types'
import { getEventVibes } from '@/lib/event-classify'
import { lyhytkuvaus } from '@/lib/event-text'
import { formatDate, formatTime, truncate, isTonight, fmtDistance, tuntematonAika } from '@/lib/utils'
import { helsinkiDateOf, helsinkiToday } from '@/lib/helsinki-time'
import { recordClick } from '@/lib/preferences'
import { useFavorites } from '@/contexts/FavoritesContext'
import { useLanguage } from '@/contexts/LanguageContext'
import { classifyEventCategory } from '@/lib/event-category'
import type { TranslationKey } from '@/lib/i18n'

interface Props {
  event: Event
  onClick: (event: Event) => void
  distance?: number  // km, pre-calculated by parent
  /** Kellonajan perään näytettävä lisä ("25 min päästä") — Seuraavaksi-lista. */
  aikaLisa?: string
}

const GRADIENT_COLORS = [
  'from-blue-950 via-blue-900 to-indigo-900',
  'from-purple-950 via-purple-900 to-violet-900',
  'from-teal-950 via-teal-900 to-cyan-900',
  'from-indigo-950 via-indigo-900 to-blue-900',
  'from-emerald-950 via-emerald-900 to-teal-900',
  'from-rose-950 via-rose-900 to-pink-900',
  'from-orange-950 via-orange-900 to-amber-900',
  'from-cyan-950 via-cyan-900 to-sky-900',
]

function hashGradient(id: string): string {
  let h = 0
  for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) & 0xffff
  return GRADIENT_COLORS[h % GRADIENT_COLORS.length]
}

type TypeBadge = { tKey: TranslationKey; emoji: string; bg: string; text: string }

function getTypeBadge(categories: string[], vibes: string[] = []): TypeBadge | null {
  const cats = categories.map((c) => c.toLowerCase())
  const has = (...kws: string[]) => kws.some((kw) => cats.some((c) => c.includes(kw)))
  // Lähteen OMA festivaalikategoria voittaa aina.
  if (has('festivaali'))                          return { tKey: 'legend.festival', emoji: '🎪', bg: 'rgba(245,158,11,0.18)', text: '#fbbf24' }
  // Stand up ENNEN teatteria ja ennen VIBESTÄ päätellyä festivaalia: lippu.fi:n
  // kategoria "Kulttuuri ja teatteri" merkitsi Helsinki Comedy Festivalin
  // stand up -näytökset teatteriksi (mitattu 23.9.2026), ja festivaalin
  // sisällä jokaisen näytöksen merkki "Festivaali" ei kerro mitään —
  // "Stand up" kertoo mitä lavalla tapahtuu.
  if (vibes.includes('standup') || has('stand up', 'stand-up', 'standup')) return { tKey: 'legend.standup', emoji: '🎤', bg: 'rgba(236,72,153,0.18)', text: '#f9a8d4' }
  if (vibes.includes('festivaali'))               return { tKey: 'legend.festival', emoji: '🎪', bg: 'rgba(245,158,11,0.18)', text: '#fbbf24' }
  if (has('teatteri', 'ooppera', 'baletti'))      return { tKey: 'legend.theatre',  emoji: '🎭', bg: 'rgba(139,92,246,0.18)', text: '#a78bfa' }
  if (has('jalkapallo', 'ottelu', 'jääkiekko'))   return { tKey: 'legend.match',    emoji: '⚽', bg: 'rgba(16,185,129,0.18)', text: '#34d399' }
  if (has('urheilu'))                             return { tKey: 'legend.sport',    emoji: '🏅', bg: 'rgba(16,185,129,0.18)', text: '#34d399' }
  if (has('näyttely', 'museo'))                   return { tKey: 'legend.exhibition',emoji: '🖼', bg: 'rgba(244,114,182,0.18)', text: '#f9a8d4' }
  return null
}

function handleShare(e: React.MouseEvent, event: Event) {
  e.stopPropagation()
  const text = `${event.title} – ${formatDate(event.startTime)}${event.location ? ' @ ' + event.location.name : ''}`
  if (navigator.share) {
    navigator.share({ title: event.title, text, url: event.infoUrl || window.location.href })
  } else {
    navigator.clipboard.writeText(text)
  }
}

export default function EventCard({ event, onClick, distance, aikaLisa }: Props) {
  const gradient = hashGradient(event.id)
  const tonight = isTonight(event.startTime)
  const { toggle, isFavorite } = useFavorites()
  const { t, lang } = useLanguage()
  const fav = isFavorite(event.id)
  const typeBadge = getTypeBadge(event.categories, getEventVibes(event))
  const kuvaus = lyhytkuvaus(event)

  return (
    <button
      onClick={() => { recordClick(event); onClick(event) }}
      className="group w-full text-left bg-[#111318] border border-white/8 rounded-2xl overflow-hidden hover:border-white/20 hover:shadow-2xl hover:shadow-black/50 hover:-translate-y-1 transition-all duration-200 focus:outline-none focus-visible:ring-2 focus-visible:ring-[#6b76ff]"
    >
      {/* Image */}
      {/* Mobiilissa 150 px kuva; kortissa otsikko + paikka + aika · hinta
          (HANDOFF-mobiili §2) — kuvaus ja päivälappu näkyvät tietopaneelissa.
          TYYPPIMERKKI (🎤 Stand up ym.) JÄÄ myös mobiiliin: omistajan päätös
          24.9.2026 — se kertoo lajin ennen avaamista sekaruudukossa, eikä
          ohjeen "vain"-lista tuntenut eilen tehtyä merkkiä. Työpöytä ennallaan. */}
      <div className="relative h-[150px] md:h-44 w-full overflow-hidden bg-[#1a1f2e]">
        {/* Gradient always behind as fallback */}
        <div className={`absolute inset-0 h-full w-full bg-gradient-to-br ${gradient}`} />
        {event.image && (
          <img
            loading="lazy"
            src={event.image}
            alt={event.title}
            className="absolute inset-0 w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"
            onError={e => { (e.target as HTMLImageElement).style.display = 'none' }}
          />
        )}

        {/* Gradient overlay */}
        <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-transparent to-transparent" />

        {/* Badges */}
        <div className="absolute top-3 left-3 max-md:right-14 flex flex-wrap gap-1.5">
          {event.isFree && (
            <span className="bg-emerald-500 text-white text-[11px] font-bold px-2 py-0.5 rounded-full">
              {t('common.free_ticket')}
            </span>
          )}
          {tonight && (
            <span className="hidden md:inline text-white text-[11px] font-bold px-2 py-0.5 rounded-full" style={{ background: 'linear-gradient(150deg,#6b76ff,#5059e6)' }}>
              {t('date.tonight')}
            </span>
          )}
          {/* MOBIILI: tyyppimerkki kuvan päällä. Alarivin oikeassa reunassa
              (työpöydän paikka) se ei mahtunut 173 px korttiin — leikkautui ja
              puristi paikan nimen (mitattu 24.9.2026). Työpöydällä alla. */}
          {/* Tumma tausta kuten päivälapulla — värillinen 18 % tausta ei erotu
              vaalean kuvan päällä. Vain TUNNISTETUT lajit; raakaa lähdekategoriaa
              ("musiikki") ei näytetä kuvan päällä. */}
          {typeBadge && (
            <span className="md:hidden text-[11px] font-bold px-2 py-0.5 rounded-full bg-black/60 backdrop-blur-sm" style={{ color: typeBadge.text }}>
              {typeBadge.emoji} {t(typeBadge.tKey)}
            </span>
          )}
        </div>

        {/* Heart — div because outer card is already a <button> (no nesting allowed) */}
        <div
          onClick={(e) => { e.stopPropagation(); toggle(event) }}
          role="button"
          tabIndex={0}
          onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); e.stopPropagation(); toggle(event) } }}
          aria-label={t('detail.save_fav')}
          className="absolute top-2 right-2 z-10 w-10 h-10 md:w-8 md:h-8 rounded-full flex items-center justify-center cursor-pointer"
          style={{
            transition: 'background 0.15s',
            background: fav ? '#ec4899' : 'rgba(0,0,0,0.65)',
            color: fav ? '#fff' : 'rgba(255,255,255,0.85)',
            boxShadow: '0 2px 8px rgba(0,0,0,0.5)',
          }}
        >
          <Heart size={15} fill={fav ? 'currentColor' : 'none'} />
        </div>

        {/* Date chip bottom — tänään "Tänään" eikä "su 6. syyskuuta"
            (omistaja 6.9.2026: linjassa muun sovelluksen kanssa) */}
        <div className="hidden md:block absolute bottom-3 left-3 bg-black/60 backdrop-blur-sm text-white text-[11px] font-medium px-2.5 py-1 rounded-full">
          {helsinkiDateOf(event.startTime) === helsinkiToday() ? t('date.today') : formatDate(event.startTime, lang)}
        </div>
      </div>

      {/* Content */}
      <div className="p-3.5 md:p-4 space-y-2">
        <h3 className="font-bold md:font-semibold text-white text-[15px] md:text-sm leading-[1.3] md:leading-snug line-clamp-2 group-hover:text-[#c7caff] transition-colors">
          {event.title}
        </h3>

        {/* Skraperin '@ Paikka' -placeholder EI ole kuvaus — se toisti paikan
            nimen joka lukee jo kortissa (ks. lib/event-text). */}
        {kuvaus && (
          <p className="hidden md:block text-white/45 text-xs leading-relaxed line-clamp-2">
            {truncate(kuvaus, 110)}
          </p>
        )}

        <div className="flex items-center justify-between pt-1">
          <div className="space-y-1 min-w-0">
            {event.location && (
              <div className="flex items-center gap-1.5 text-white/55 md:text-white/40 text-[13px] md:text-xs">
                <MapPin size={10} className="shrink-0" />
                <span className="truncate min-w-0 max-w-[160px]">{event.location.name || event.location.streetAddress}</span>
                {distance !== undefined && (
                  <span className="text-blue-400/70 font-medium shrink-0">· {fmtDistance(distance)}</span>
                )}
              </div>
            )}
            <div className="flex items-center gap-1.5 text-[#a3abff] text-[13px] md:text-xs font-bold md:font-semibold">
              {!tuntematonAika(event.startTime) && (
                <>
                  <Clock size={10} className="shrink-0" />
                  <span>{formatTime(event.startTime, lang)}{aikaLisa ? ` · ${aikaLisa}` : ''}</span>
                </>
              )}
              {!event.isFree && event.price && (
                <span className="text-white/40 font-normal">{tuntematonAika(event.startTime) ? event.price : `· ${event.price}`}</span>
              )}
            </div>
          </div>

          {typeBadge ? (
            <span className="hidden md:inline-block shrink-0 text-[10px] font-bold px-2 py-1 rounded-full" style={{ background: typeBadge.bg, color: typeBadge.text }}>
              {typeBadge.emoji} {t(typeBadge.tKey)}
            </span>
          ) : event.categories[0] ? (
            <span className="hidden md:inline-block shrink-0 text-[10px] text-white/30 bg-white/5 px-2 py-1 rounded-full">
              {lang === 'en' ? t(classifyEventCategory(event.categories).tKey) : event.categories[0]}
            </span>
          ) : null}
        </div>
      </div>
    </button>
  )
}

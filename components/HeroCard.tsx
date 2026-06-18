'use client'

import { Clock, MapPin, ArrowRight, Heart } from 'lucide-react'
import { Event } from '@/lib/types'
import { formatDate, formatTime } from '@/lib/utils'
import { useFavorites } from '@/contexts/FavoritesContext'
import { useLanguage } from '@/contexts/LanguageContext'

interface Props {
  event: Event
  onClick: (event: Event) => void
}

export default function HeroCard({ event, onClick }: Props) {
  const { toggle, isFavorite } = useFavorites()
  const { t } = useLanguage()
  const fav = isFavorite(event.id)
  return (
    <button
      onClick={() => onClick(event)}
      className="group relative w-full h-72 sm:h-80 rounded-2xl overflow-hidden text-left focus:outline-none focus-visible:ring-2 focus-visible:ring-[#0072C6]"
    >
      {/* Background */}
      {event.image ? (
        <img
          src={event.image}
          alt={event.title}
          className="absolute inset-0 w-full h-full object-cover group-hover:scale-105 transition-transform duration-700"
        />
      ) : (
        <div className="absolute inset-0 bg-gradient-to-br from-[#0072C6] via-indigo-800 to-purple-900" />
      )}

      {/* Gradient overlays */}
      <div className="absolute inset-0 bg-gradient-to-t from-black/90 via-black/30 to-transparent" />
      <div className="absolute inset-0 bg-gradient-to-r from-black/50 to-transparent" />

      {/* Label + heart */}
      <div className="absolute top-4 left-4 right-4 flex items-center justify-between">
        <span className="bg-[#0072C6] text-white text-xs font-bold px-3 py-1 rounded-full tracking-wide uppercase">
          {t('hero.recommended')}
        </span>
        <div
          onClick={(e) => { e.stopPropagation(); toggle(event) }}
          role="button"
          aria-label={t('detail.save_fav')}
          style={{
            width: 36, height: 36, borderRadius: '50%',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            cursor: 'pointer', transition: 'background 0.15s',
            background: fav ? '#ec4899' : 'rgba(0,0,0,0.55)',
            color: fav ? '#fff' : 'rgba(255,255,255,0.7)',
            backdropFilter: 'blur(4px)',
            boxShadow: '0 2px 8px rgba(0,0,0,0.5)',
          }}
        >
          <Heart size={16} fill={fav ? 'currentColor' : 'none'} />
        </div>
      </div>

      {/* Content */}
      <div className="absolute bottom-0 left-0 right-0 p-5 sm:p-6">
        <h2 className="text-xl sm:text-2xl font-bold text-white leading-tight mb-2 line-clamp-2">
          {event.title}
        </h2>

        {event.shortDescription && (
          <p className="text-white/60 text-sm leading-relaxed line-clamp-2 mb-3 max-w-lg">
            {event.shortDescription}
          </p>
        )}

        <div className="flex flex-wrap items-center gap-3">
          <div className="flex items-center gap-1.5 text-white/80 text-sm">
            <Clock size={13} />
            <span>{formatDate(event.startTime)} · {formatTime(event.startTime)}</span>
          </div>
          {event.location && (
            <div className="flex items-center gap-1.5 text-white/60 text-sm">
              <MapPin size={13} />
              <span>{event.location.name}</span>
            </div>
          )}
          {event.isFree && (
            <span className="bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 text-xs font-semibold px-2.5 py-1 rounded-full">
              {t('common.free_ticket')}
            </span>
          )}

          <div className="ml-auto flex items-center gap-1.5 text-white/50 group-hover:text-white text-sm font-medium transition-colors">
            <span>{t('detail.read_more')}</span>
            <ArrowRight size={14} className="group-hover:translate-x-1 transition-transform" />
          </div>
        </div>
      </div>
    </button>
  )
}

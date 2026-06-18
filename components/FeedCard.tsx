'use client'

import { MapPin, Clock, Share2, ArrowUpRight, Heart } from 'lucide-react'
import { Event } from '@/lib/types'
import { formatDate, formatTime } from '@/lib/utils'
import { useFavorites } from '@/contexts/FavoritesContext'
import { useLanguage } from '@/contexts/LanguageContext'

interface Props {
  event: Event
  onClick: (event: Event) => void
  index: number
}

const GRADIENTS = [
  'from-violet-950 via-purple-900 to-indigo-900',
  'from-rose-950 via-pink-900 to-purple-900',
  'from-cyan-950 via-teal-900 to-blue-900',
  'from-amber-950 via-orange-900 to-red-900',
  'from-emerald-950 via-teal-900 to-cyan-900',
  'from-fuchsia-950 via-violet-900 to-purple-900',
]

async function shareEvent(e: React.MouseEvent, event: Event) {
  e.stopPropagation()
  const text = `${event.title}\n${formatDate(event.startTime)} klo ${formatTime(event.startTime)}${event.location ? ' @ ' + event.location.name : ''}\n\nHelsinki Tapahtumat 👉`
  if (navigator.share) {
    try { await navigator.share({ title: event.title, text }) } catch {}
  } else {
    await navigator.clipboard.writeText(text)
  }
}

export default function FeedCard({ event, onClick, index }: Props) {
  const gradient = GRADIENTS[index % GRADIENTS.length]
  const { toggle, isFavorite } = useFavorites()
  const { t } = useLanguage()
  const fav = isFavorite(event.id)

  return (
    <article
      onClick={() => onClick(event)}
      className="group cursor-pointer bg-[#0e1218] rounded-2xl overflow-hidden border border-white/7 hover:border-white/18 transition-all duration-200 hover:shadow-2xl hover:shadow-black/40"
    >
      {/* Full-width image */}
      <div className="relative w-full overflow-hidden" style={{ aspectRatio: '16/9' }}>
        {event.image ? (
          <img
            src={event.image}
            alt={event.title}
            className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"
          />
        ) : (
          <div className={`w-full h-full bg-gradient-to-br ${gradient} flex items-end p-4`}>
            <span className="text-white/10 text-7xl font-black leading-none select-none">
              {event.title.charAt(0)}
            </span>
          </div>
        )}

        {/* Gradient overlay */}
        <div className="absolute inset-0 bg-gradient-to-t from-[#0e1218] via-transparent to-transparent" />

        {/* Top badges */}
        <div className="absolute top-3 left-3 flex gap-2">
          {event.isFree && (
            <span className="bg-emerald-500 text-white text-[11px] font-bold px-2.5 py-1 rounded-full">
              🎁 {t('common.free_ticket')}
            </span>
          )}
          {event.categories[0] && (
            <span className="bg-black/50 backdrop-blur-sm text-white/80 text-[11px] font-medium px-2.5 py-1 rounded-full">
              {event.categories[0]}
            </span>
          )}
        </div>

        {/* Heart button */}
        <button
          onClick={(e) => { e.stopPropagation(); toggle(event) }}
          style={{
            position: 'absolute', top: 10, right: 10, zIndex: 10,
            width: 34, height: 34, borderRadius: '50%', border: 'none',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            cursor: 'pointer', transition: 'transform 0.15s',
            background: fav ? '#ec4899' : 'rgba(0,0,0,0.65)',
            color: fav ? '#fff' : 'rgba(255,255,255,0.85)',
            boxShadow: '0 2px 8px rgba(0,0,0,0.5)',
          }}
        >
          <Heart size={16} fill={fav ? 'currentColor' : 'none'} />
        </button>
      </div>

      {/* Content */}
      <div className="p-4">
        <div className="flex items-start justify-between gap-3">
          <div className="flex-1 min-w-0">
            <h3 className="font-bold text-white text-base leading-snug line-clamp-2 group-hover:text-[#60b4f0] transition-colors">
              {event.title}
            </h3>

            {event.shortDescription && (
              <p className="text-white/45 text-sm mt-1.5 line-clamp-2 leading-relaxed">
                {event.shortDescription}
              </p>
            )}
          </div>
          <div className="shrink-0 p-1.5 rounded-lg text-white/20 group-hover:text-[#0072C6] group-hover:bg-[#0072C6]/10 transition-all">
            <ArrowUpRight size={18} />
          </div>
        </div>

        {/* Meta row */}
        <div className="flex items-center gap-4 mt-3 pt-3 border-t border-white/6">
          <div className="flex items-center gap-1.5 text-[#0072C6] text-xs font-semibold">
            <Clock size={11} />
            <span>{formatDate(event.startTime)} · {formatTime(event.startTime)}</span>
          </div>
          {event.location?.name && (
            <div className="flex items-center gap-1.5 text-white/35 text-xs truncate">
              <MapPin size={11} className="shrink-0" />
              <span className="truncate">{event.location.name}</span>
            </div>
          )}
          {!event.isFree && event.price && (
            <span className="ml-auto text-white/40 text-xs shrink-0">{event.price}</span>
          )}
        </div>
      </div>
    </article>
  )
}

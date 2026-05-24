'use client'

import { MapPin, Clock, Share2, Heart } from 'lucide-react'
import { Event } from '@/lib/types'
import { formatDate, formatTime, truncate, isTonight } from '@/lib/utils'
import { useFavorites } from '@/contexts/FavoritesContext'

interface Props {
  event: Event
  onClick: (event: Event) => void
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

function handleShare(e: React.MouseEvent, event: Event) {
  e.stopPropagation()
  const text = `${event.title} – ${formatDate(event.startTime)}${event.location ? ' @ ' + event.location.name : ''}`
  if (navigator.share) {
    navigator.share({ title: event.title, text, url: event.infoUrl || window.location.href })
  } else {
    navigator.clipboard.writeText(text)
  }
}

export default function EventCard({ event, onClick }: Props) {
  const gradient = hashGradient(event.id)
  const tonight = isTonight(event.startTime)
  const { toggle, isFavorite } = useFavorites()
  const fav = isFavorite(event.id)

  return (
    <button
      onClick={() => onClick(event)}
      className="group w-full text-left bg-[#111318] border border-white/8 rounded-2xl overflow-hidden hover:border-white/20 hover:shadow-2xl hover:shadow-black/50 hover:-translate-y-1 transition-all duration-200 focus:outline-none focus-visible:ring-2 focus-visible:ring-purple-500"
    >
      {/* Image */}
      <div className="relative h-44 w-full overflow-hidden bg-[#1a1f2e]">
        {event.image ? (
          <img
            src={event.image}
            alt={event.title}
            className="absolute inset-0 w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"
          />
        ) : (
          <div className={`h-full w-full bg-gradient-to-br ${gradient}`} />
        )}

        {/* Gradient overlay */}
        <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-transparent to-transparent" />

        {/* Badges */}
        <div className="absolute top-3 left-3 flex gap-1.5">
          {event.isFree && (
            <span className="bg-emerald-500 text-white text-[11px] font-bold px-2 py-0.5 rounded-full">
              Maksuton
            </span>
          )}
          {tonight && (
            <span className="text-white text-[11px] font-bold px-2 py-0.5 rounded-full" style={{ background: 'linear-gradient(135deg,#a855f7,#ec4899)' }}>
              Tänä iltana
            </span>
          )}
        </div>

        {/* Heart button — inline styles guarantee visibility */}
        <button
          onClick={(e) => { e.stopPropagation(); toggle(event) }}
          aria-label="Tallenna suosikkeihin"
          style={{
            position: 'absolute', top: 8, right: 8, zIndex: 10,
            width: 32, height: 32, borderRadius: '50%', border: 'none',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            cursor: 'pointer', transition: 'transform 0.15s',
            background: fav ? '#ec4899' : 'rgba(0,0,0,0.65)',
            color: fav ? '#fff' : 'rgba(255,255,255,0.85)',
            boxShadow: '0 2px 8px rgba(0,0,0,0.5)',
          }}
        >
          <Heart size={15} fill={fav ? 'currentColor' : 'none'} />
        </button>

        {/* Date chip bottom */}
        <div className="absolute bottom-3 left-3 bg-black/60 backdrop-blur-sm text-white text-[11px] font-medium px-2.5 py-1 rounded-full">
          {formatDate(event.startTime)}
        </div>
      </div>

      {/* Content */}
      <div className="p-4 space-y-2">
        <h3 className="font-semibold text-white text-sm leading-snug line-clamp-2 group-hover:text-purple-300 transition-colors">
          {event.title}
        </h3>

        {event.shortDescription && (
          <p className="text-white/45 text-xs leading-relaxed line-clamp-2">
            {truncate(event.shortDescription, 110)}
          </p>
        )}

        <div className="flex items-center justify-between pt-1">
          <div className="space-y-1">
            {event.location && (
              <div className="flex items-center gap-1.5 text-white/40 text-xs">
                <MapPin size={10} className="shrink-0" />
                <span className="truncate max-w-[160px]">{event.location.name || event.location.streetAddress}</span>
              </div>
            )}
            <div className="flex items-center gap-1.5 text-purple-400 text-xs font-semibold">
              <Clock size={10} className="shrink-0" />
              <span>{formatTime(event.startTime)}</span>
              {!event.isFree && event.price && (
                <span className="text-white/40 font-normal">· {event.price}</span>
              )}
            </div>
          </div>

          {event.categories[0] && (
            <span className="shrink-0 text-[10px] text-white/30 bg-white/5 px-2 py-1 rounded-full">
              {event.categories[0]}
            </span>
          )}
        </div>
      </div>
    </button>
  )
}

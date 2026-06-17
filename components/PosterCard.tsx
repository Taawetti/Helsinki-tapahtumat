'use client'

import { Event } from '@/lib/types'
import { formatTime } from '@/lib/utils'

const GRADIENTS = [
  'from-violet-900 to-purple-950',
  'from-fuchsia-900 to-pink-950',
  'from-blue-900 to-indigo-950',
  'from-emerald-900 to-teal-950',
  'from-orange-900 to-red-950',
  'from-cyan-900 to-blue-950',
  'from-rose-900 to-pink-950',
  'from-amber-900 to-orange-950',
]

function hashGradient(id: string) {
  let h = 0
  for (const c of id) h = (h * 31 + c.charCodeAt(0)) & 0xffff
  return GRADIENTS[h % GRADIENTS.length]
}

interface Props {
  event: Event
  onClick: (e: Event) => void
  large?: boolean
}

export default function PosterCard({ event, onClick, large }: Props) {
  return (
    <button
      onClick={() => onClick(event)}
      className="group relative w-full text-left rounded-xl overflow-hidden bg-[#111] hover:scale-[1.02] active:scale-[0.97] transition-transform duration-200 focus:outline-none focus-visible:ring-2 focus-visible:ring-purple-500"
    >
      {/* Poster image */}
      <div className="relative w-full overflow-hidden" style={{ aspectRatio: large ? '16/9' : '3/4' }}>
        {/* Gradient always behind as fallback */}
        <div className={`absolute inset-0 bg-gradient-to-br ${hashGradient(event.id)} flex items-center justify-center`}>
          <span className="text-4xl opacity-30">🎫</span>
        </div>
        {event.image && (
          <img
            src={event.image}
            alt={event.title}
            className="absolute inset-0 w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"
            onError={e => { (e.target as HTMLImageElement).style.display = 'none' }}
          />
        )}
        <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/10 to-transparent" />

        {/* Badges */}
        <div className="absolute top-2.5 left-2.5 flex gap-1.5 flex-wrap">
          {event.isFree && (
            <span className="text-[10px] font-black px-2 py-0.5 rounded-full bg-emerald-500 text-white tracking-wide">
              ILMAINEN
            </span>
          )}
        </div>

        {/* Time chip */}
        <div className="absolute bottom-2.5 right-2.5">
          <span className="text-[11px] font-bold px-2 py-0.5 rounded-full text-white/90 bg-black/50 backdrop-blur-sm">
            {formatTime(event.startTime)}
          </span>
        </div>
      </div>

      {/* Info row */}
      <div className="px-3 pt-2.5 pb-3 space-y-0.5">
        <p className="text-white font-bold text-[13px] leading-snug line-clamp-2 group-hover:text-purple-200 transition-colors">
          {event.title}
        </p>
        {event.location?.name && (
          <p className="text-white/40 text-[11px] truncate">{event.location.name}</p>
        )}
        {!event.isFree && event.price && (
          <p className="text-white/30 text-[11px]">{event.price}</p>
        )}
      </div>
    </button>
  )
}

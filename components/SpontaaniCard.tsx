'use client'

import { useState, useMemo } from 'react'
import { Zap, RefreshCw, Clock, MapPin } from 'lucide-react'
import { Event } from '@/lib/types'
import { formatTime, affiliateUrl } from '@/lib/utils'

function score(e: Event): number {
  const text = [e.title, e.shortDescription ?? '', ...e.categories].join(' ').toLowerCase()
  let s = 0
  if (e.image) s += 3
  if (e.ticketUrl || e.infoUrl) s += 2
  if (/keikka|konsertti|live|bändi/.test(text)) s += 5
  if (/stand.?up|komedia/.test(text)) s += 4
  if (/yökerho|bileet|klubi|disko|rave/.test(text)) s += 4
  if (/teatteri|esitys|tanssi/.test(text)) s += 3
  if (/baari|pub/.test(text)) s += 2
  return s
}

interface Props {
  events: Event[]
  onOpen: (event: Event) => void
}

export default function SpontaaniCard({ events, onOpen }: Props) {
  const [idx, setIdx] = useState(0)

  const candidates = useMemo(() => {
    const now = new Date()
    const cutoff = new Date(now.getTime() + 6 * 60 * 60 * 1000)
    return events
      .filter(e => {
        const t = new Date(e.startTime)
        return t > now && t <= cutoff
      })
      .sort((a, b) => score(b) - score(a))
      .slice(0, 10)
  }, [events])

  if (candidates.length === 0) return null

  const event = candidates[idx % candidates.length]
  const minsUntil = Math.round((new Date(event.startTime).getTime() - Date.now()) / 60000)
  const hoursUntil = Math.floor(minsUntil / 60)
  const timeLabel = hoursUntil >= 1
    ? `${hoursUntil}h ${minsUntil % 60 > 0 ? (minsUntil % 60) + 'min ' : ''}päästä`
    : `${minsUntil} min päästä`

  return (
    <div
      onClick={() => onOpen(event)}
      className="relative rounded-2xl overflow-hidden cursor-pointer group border border-orange-500/20"
    >
      <div className="relative h-52">
        {event.image ? (
          <img
            src={event.image}
            alt={event.title}
            className="absolute inset-0 w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"
          />
        ) : (
          <div className="absolute inset-0 bg-gradient-to-br from-orange-950 via-red-900 to-pink-900" />
        )}
        <div className="absolute inset-0 bg-gradient-to-t from-black/95 via-black/40 to-black/10" />

        <div
          className="absolute top-3 left-3 flex items-center gap-1.5 px-3 py-1 rounded-full text-[11px] font-black text-white"
          style={{ background: 'linear-gradient(135deg,#f59e0b,#ef4444)' }}
        >
          <Zap size={10} />
          Spontaani ilta
        </div>

        <button
          onClick={(e) => { e.stopPropagation(); setIdx(i => i + 1) }}
          className="absolute top-3 right-3 p-2 rounded-full bg-black/50 backdrop-blur-sm text-white/60 hover:text-white transition-colors"
          aria-label="Näytä eri tapahtuma"
        >
          <RefreshCw size={13} />
        </button>

        <div className="absolute bottom-0 left-0 right-0 p-4">
          <p className="text-[11px] font-black mb-1.5" style={{ color: '#fbbf24' }}>⚡ {timeLabel}</p>
          <h3 className="text-white font-black text-lg leading-tight line-clamp-2 mb-2">{event.title}</h3>
          <div className="flex flex-wrap items-center gap-3 text-xs text-white/55">
            <span className="flex items-center gap-1"><Clock size={10} />{formatTime(event.startTime)}</span>
            {event.location?.name && <span className="flex items-center gap-1"><MapPin size={10} />{event.location.name}</span>}
            {event.isFree
              ? <span className="text-emerald-400 font-bold">Maksuton</span>
              : event.price && <span>{event.price}</span>
            }
          </div>
        </div>
      </div>

      {(event.ticketUrl || event.infoUrl) && (
        <a
          href={affiliateUrl(event.ticketUrl || event.infoUrl) || '#'}
          target="_blank"
          rel="noopener noreferrer"
          onClick={(e) => e.stopPropagation()}
          className="flex items-center justify-center gap-2 py-3 text-white text-sm font-black"
          style={{ background: 'linear-gradient(135deg,#f59e0b,#ef4444)' }}
        >
          Mene tänä iltana →
        </a>
      )}
    </div>
  )
}

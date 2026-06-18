'use client'

import { ArrowRight } from 'lucide-react'
import { Event, Collection } from '@/lib/types'
import { formatDate, formatTime } from '@/lib/utils'
import { useLanguage } from '@/contexts/LanguageContext'

interface Props {
  collection: Collection
  events: Event[]
  onEventClick: (event: Event) => void
  onSeeAll: (collection: Collection) => void
}

export default function CollectionRow({ collection, events, onEventClick, onSeeAll }: Props) {
  const { t } = useLanguage()
  if (events.length === 0) return null

  return (
    <section>
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2.5">
          <span className="text-2xl leading-none">{collection.emoji}</span>
          <div>
            <h2 className="text-sm font-black text-white tracking-tight">{collection.title}</h2>
            <p className="text-white/30 text-xs font-medium">{collection.subtitle}</p>
          </div>
        </div>
        <button
          onClick={() => onSeeAll(collection)}
          className="flex items-center gap-1 text-xs font-bold text-white/30 hover:text-white/60 transition-colors"
        >
          Kaikki <ArrowRight size={12} />
        </button>
      </div>

      {/* Horizontal scroll */}
      <div className="flex gap-3 overflow-x-auto pb-2 scrollbar-none -mx-4 px-4">
        {events.slice(0, 10).map((event) => (
          <button
            key={event.id}
            onClick={() => onEventClick(event)}
            className="group shrink-0 w-52 sm:w-60 text-left bg-[#111318] border border-white/8 rounded-xl overflow-hidden hover:border-white/20 hover:-translate-y-0.5 transition-all duration-150 focus:outline-none focus-visible:ring-2 focus-visible:ring-purple-500"
          >
            {/* Image */}
            <div className="relative h-32 bg-[#1a1f2e] overflow-hidden">
              {event.image ? (
                <img
                  src={event.image}
                  alt={event.title}
                  className="absolute inset-0 w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                />
              ) : (
                <div className={`h-full w-full bg-gradient-to-br ${collection.color}`} />
              )}
              <div className="absolute inset-0 bg-gradient-to-t from-black/50 to-transparent" />
              {event.isFree && (
                <span className="absolute top-2 left-2 bg-emerald-500 text-white text-[10px] font-bold px-1.5 py-0.5 rounded-full">
                  {t('common.free_ticket')}
                </span>
              )}
            </div>

            {/* Info */}
            <div className="p-3">
              <p className="text-white text-xs font-semibold line-clamp-2 leading-snug mb-1.5">
                {event.title}
              </p>
              <p className="text-purple-400 text-[11px] font-medium">
                {formatDate(event.startTime)} · {formatTime(event.startTime)}
              </p>
              {event.location && (
                <p className="text-white/35 text-[11px] truncate mt-0.5">{event.location.name}</p>
              )}
            </div>
          </button>
        ))}

        {/* See all tile */}
        <button
          onClick={() => onSeeAll(collection)}
          className={`shrink-0 w-40 rounded-xl bg-gradient-to-br ${collection.color} border border-white/10 flex flex-col items-center justify-center gap-2 hover:border-white/25 transition-all p-4`}
        >
          <span className="text-3xl">{collection.emoji}</span>
          <span className="text-white/70 text-xs font-medium text-center">Näytä kaikki</span>
          <ArrowRight size={14} className="text-white/40" />
        </button>
      </div>
    </section>
  )
}

'use client'

import { X, RefreshCw } from 'lucide-react'
import { Event } from '@/lib/types'
import { useState } from 'react'
import { useLanguage } from '@/contexts/LanguageContext'
import type { TranslationKey } from '@/lib/i18n'

function eventScore(e: Event): number {
  const text = [e.title, e.shortDescription, ...e.categories].join(' ').toLowerCase()
  if (/keikka|konsertti|live[\s-]?musiikki|bändi|gig/.test(text)) return 7
  if (/klubi|dj[\s-]?set|yökerho|disco|rave/.test(text)) return 6
  if (/jalkapallo|ottelu|urheilu/.test(text)) return 5
  if (/stand[\s-]?up|komedia/.test(text)) return 4
  if (/baari|pub|cocktail/.test(text)) return 3
  if (/ravintola|illallinen|ruoka/.test(text)) return 2
  if (/näyttely|museo|luento|workshop|työpaja/.test(text)) return 1
  return e.image ? 1 : 0
}

export type EiTiedaMode = 'general' | 'treffi'

interface Suggestion {
  labelKey: TranslationKey
  emoji: string
  descKey: TranslationKey
  event: Event
  color: string
}

interface Props {
  events: Event[]
  mode?: EiTiedaMode
  onClose: () => void
  onSelect: (e: Event) => void
}

export default function EiTiedaModal({ events, mode = 'general', onClose, onSelect }: Props) {
  const { t, lang } = useLanguage()
  const [refreshKey, setRefreshKey] = useState(0)

  if (events.length === 0) {
    return (
      <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4">
        <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" onClick={onClose} />
        <div className="relative w-full sm:max-w-md rounded-t-3xl sm:rounded-2xl p-8 text-center space-y-3"
          style={{ background: '#111118', border: '1px solid rgba(255,255,255,0.08)' }}>
          <p className="text-4xl">🏙</p>
          <p className="text-white font-bold">{t('modal.no_events')}</p>
          <p className="text-white/30 text-sm">{t('modal.no_events_sub')}</p>
          <button onClick={onClose} className="px-5 py-2 rounded-xl text-sm font-bold text-white/50 border border-white/10 hover:text-white transition-all mt-2">
            {t('common.close')}
          </button>
        </div>
      </div>
    )
  }

  const sorted = [...events].sort((a, b) => eventScore(b) - eventScore(a))
  const suggestions: Suggestion[] = []

  if (mode === 'treffi') {
    const evening = sorted.filter(e => new Date(e.startTime).getHours() >= 17)
    const foodEvent = events.find(e => /ravintola|ruoka|illallinen|kahvi|viini/.test(
      [e.title, ...e.categories].join(' ').toLowerCase()
    ))
    const showEvent = evening.find(e => /teatteri|musiikki|konsertti|ooppera|baletti|stand[\s-]?up|komedia/.test(
      [e.title, ...e.categories].join(' ').toLowerCase()
    )) ?? evening[0]
    const barEvent = evening.find(e =>
      e.id !== showEvent?.id &&
      /baari|pub|cocktail|jatko/.test([e.title, ...e.categories].join(' ').toLowerCase())
    ) ?? evening[Math.min(1, evening.length - 1)]

    if (foodEvent) suggestions.push({ labelKey: 'suggest.dinner_first', emoji: '🍷', descKey: 'suggest.dinner_desc', event: foodEvent, color: '#f59e0b' })
    if (showEvent) suggestions.push({ labelKey: 'suggest.main_event', emoji: '✨', descKey: 'suggest.main_desc', event: showEvent, color: '#a855f7' })
    if (barEvent && barEvent.id !== showEvent?.id) suggestions.push({ labelKey: 'suggest.after', emoji: '🍸', descKey: 'suggest.after_desc', event: barEvent, color: '#ec4899' })

    if (suggestions.length === 0) {
      sorted.slice(0, 3).forEach((e, i) => {
        const opts: Suggestion[] = [
          { labelKey: 'suggest.safe_choice', emoji: '⭐', descKey: 'suggest.safe_desc1', event: e, color: '#a855f7' },
          { labelKey: 'suggest.surprise1', emoji: '🎲', descKey: 'suggest.surprise_desc', event: e, color: '#ec4899' },
          { labelKey: 'suggest.nearby1', emoji: '📍', descKey: 'suggest.nearby_desc1', event: e, color: '#6366f1' },
        ]
        if (i < 3) suggestions.push(opts[i])
      })
    }
  } else {
    const varma = sorted[0]
    if (varma) suggestions.push({ labelKey: 'suggest.safe_choice', emoji: '⭐', descKey: 'suggest.safe_desc2', event: varma, color: '#a855f7' })

    const others = events.filter(e => e.id !== varma?.id)
    const yllattyva = others[(refreshKey * 7 + 3) % Math.max(others.length, 1)]
    if (yllattyva) suggestions.push({ labelKey: 'suggest.surprise2', emoji: '🎲', descKey: 'suggest.surprise_desc2', event: yllattyva, color: '#ec4899' })

    const central = events.filter(e => {
      const loc = ((e.location?.name ?? '') + (e.location?.streetAddress ?? '')).toLowerCase()
      return /kamppi|kallio|töölö|hakaniemi|punavuori|ullanlinna|kruununhaka/.test(loc)
    })
    const lahella = central.length > 0
      ? central[refreshKey % central.length]
      : events[(refreshKey + 2) % events.length]
    const lahellaSafe = (lahella?.id !== varma?.id && lahella?.id !== yllattyva?.id)
      ? lahella
      : sorted[2]
    if (lahellaSafe) suggestions.push({ labelKey: 'suggest.nearby2', emoji: '📍', descKey: 'suggest.nearby_desc2', event: lahellaSafe, color: '#6366f1' })
  }

  const title = t(mode === 'treffi' ? 'modal.date_title' : 'modal.dont_know_title')
  const subtitle = t(mode === 'treffi' ? 'modal.date_sub' : 'modal.dont_know_sub')

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4">
      <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" onClick={onClose} />
      <div className="relative w-full sm:max-w-md rounded-t-3xl sm:rounded-2xl overflow-hidden"
        style={{ background: '#111118', border: '1px solid rgba(255,255,255,0.08)' }}>

        <div className="flex items-center justify-between px-5 py-4 border-b border-white/6">
          <div>
            <h2 className="text-base font-black text-white">{title}</h2>
            <p className="text-white/30 text-xs mt-0.5">{subtitle}</p>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => setRefreshKey(k => k + 1)}
              className="p-2 rounded-xl border border-white/8 text-white/30 hover:text-white/70 transition-all"
              title={t('modal.shuffle')}
            >
              <RefreshCw size={14} />
            </button>
            <button onClick={onClose} className="p-2 rounded-xl border border-white/8 text-white/30 hover:text-white/70 transition-all">
              <X size={14} />
            </button>
          </div>
        </div>

        <div className="p-4 space-y-3">
          {suggestions.map(({ labelKey, emoji, descKey, event, color }) => (
            <button
              key={labelKey}
              onClick={() => { onSelect(event); onClose() }}
              className="w-full text-left rounded-xl p-4 border border-white/6 bg-white/3 hover:bg-white/6 active:scale-[0.98] transition-all group"
            >
              <div className="flex items-start gap-3">
                <div className="w-10 h-10 rounded-xl flex items-center justify-center text-xl shrink-0"
                  style={{ background: `${color}22`, border: `1px solid ${color}33` }}>
                  {emoji}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-[10px] font-black uppercase tracking-wide mb-1" style={{ color }}>{t(labelKey)}</p>
                  <p className="text-white font-bold text-sm leading-tight line-clamp-1">{event.title}</p>
                  <p className="text-white/40 text-xs mt-0.5">
                    {event.location?.name && `${event.location.name} · `}
                    {new Date(event.startTime).toLocaleTimeString(lang === 'fi' ? 'fi-FI' : 'en-GB', { hour: '2-digit', minute: '2-digit' })}
                    {event.isFree ? ' · ' + t('common.free_ticket') : event.price ? ` · ${event.price}` : ''}
                  </p>
                  <p className="text-white/20 text-xs mt-0.5">{t(descKey)}</p>
                </div>
                {event.image && (
                  <div className="w-14 h-14 rounded-lg overflow-hidden shrink-0">
                    <img src={event.image} alt="" className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500" />
                  </div>
                )}
              </div>
            </button>
          ))}
        </div>
      </div>
    </div>
  )
}

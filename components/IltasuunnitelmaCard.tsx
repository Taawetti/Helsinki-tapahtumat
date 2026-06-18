'use client'

import { ChevronRight, MapPin } from 'lucide-react'
import { Event } from '@/lib/types'
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
  return 0
}

interface Props {
  events: Event[]
  onEventClick: (e: Event) => void
}

export default function IltasuunnitelmaCard({ events, onEventClick }: Props) {
  const { t, lang } = useLanguage()
  const evening = events
    .filter(e => {
      const h = new Date(e.startTime).getHours()
      return h >= 17 && h <= 23
    })
    .sort((a, b) => eventScore(b) - eventScore(a))

  if (evening.length < 2) return null

  // Build a diverse 2–3 event plan
  const mainEvent = evening[0]
  const plan: { step: TranslationKey; event: Event }[] = [{ step: 'plan.main', event: mainEvent }]

  const secondary = evening.find(e => {
    const scoreDiff = Math.abs(eventScore(e) - eventScore(mainEvent))
    return e.id !== mainEvent.id && scoreDiff >= 1
  }) ?? evening[1]

  if (secondary && secondary.id !== mainEvent.id) {
    const mainTs = new Date(mainEvent.startTime).getTime()
    const secTs = new Date(secondary.startTime).getTime()
    if (secTs < mainTs) {
      plan.unshift({ step: 'plan.before', event: secondary })
    } else {
      plan.push({ step: 'plan.after', event: secondary })
    }
  }

  if (plan.length < 2) return null

  plan.sort((a, b) => new Date(a.event.startTime).getTime() - new Date(b.event.startTime).getTime())

  return (
    <div id="iltasuunnitelma" className="rounded-2xl overflow-hidden border border-white/6" style={{ background: 'rgba(168,85,247,0.04)' }}>
      <div className="px-4 pt-4 pb-3 flex items-center justify-between border-b border-white/5">
        <div>
          <p className="text-[10px] font-black uppercase tracking-widest mb-0.5" style={{ color: '#a855f7' }}>
            {t('plan.badge')}
          </p>
          <p className="text-white font-black text-sm">{t('plan.title')}</p>
        </div>
        <span className="text-2xl">🌆</span>
      </div>
      <div className="p-3">
        {plan.map(({ step, event }, i) => (
          <div key={event.id}>
            <button
              onClick={() => onEventClick(event)}
              className="w-full text-left flex items-center gap-3 px-2 py-3 rounded-xl hover:bg-white/5 active:bg-white/8 transition-all"
            >
              <div className="w-14 text-right shrink-0">
                <p className="text-xs font-black" style={{ color: '#c084fc' }}>
                  {new Date(event.startTime).toLocaleTimeString(lang === 'fi' ? 'fi-FI' : 'en-GB', { hour: '2-digit', minute: '2-digit' })}
                </p>
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-[10px] font-bold uppercase tracking-wide text-white/25">{t(step)}</p>
                <p className="text-white font-bold text-sm truncate">{event.title}</p>
                {event.location?.name && (
                  <p className="flex items-center gap-1 text-white/30 text-xs mt-0.5">
                    <MapPin size={9} className="shrink-0" />
                    {event.location.name}
                    {event.isFree && <span className="text-emerald-400/70 ml-1">· {t('common.free_ticket')}</span>}
                    {!event.isFree && event.price && <span className="ml-1">· {event.price}</span>}
                  </p>
                )}
              </div>
              {event.image && (
                <div className="w-12 h-12 rounded-lg overflow-hidden shrink-0">
                  <img src={event.image} alt="" className="w-full h-full object-cover" />
                </div>
              )}
              <ChevronRight size={13} className="text-white/15 shrink-0" />
            </button>
            {i < plan.length - 1 && (
              <div className="ml-[4.25rem] h-3 border-l border-dashed border-white/10" />
            )}
          </div>
        ))}
      </div>
    </div>
  )
}

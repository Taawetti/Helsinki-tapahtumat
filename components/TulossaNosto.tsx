'use client'

// "✦ TULOSSA" — etusivun kärkinosto (lib/nostot). Yksi leveä kortti per nosto:
// juliste vasemmalla, päivä + paikka, otsikko, koukkurivi (esiintyjät),
// sosiaalinen todiste ja lippunappi hintoineen. "Mainos"-merkki maksetuissa.
//
// MIKSI NÄIN (omistaja 27.10.2026: "tästä pitää olla hyötyä artistille"):
// kortti ei vain kerro vaan myy — nimet, hinta ja todiste vastaavat kysymyksiin
// ennen klikkausta, kuten heron "Liput alk. 30€" -nappi. Kortti on matala
// (HANDOFF-mobiili: etusivu ei saa työntää Illan nostoja ruudun alle), mutta
// juliste on tarpeeksi iso erottuakseen ruudukosta.
//
// Napautus avaa saman infopaneelin kuin muualla (onOpen → pinta 'promo');
// lippunappi vie suoraan lippukauppaan ja kirjautuu external_clickinä samalla
// pinnalla — kampanjan luvut erottuvat herosta ja ruudukosta. Kortti on div
// eikä button, koska sen sisällä on linkki: button-elementin sisään ei saa
// laittaa toista interaktiivista elementtiä.

import { Ticket, ArrowUpRight } from 'lucide-react'
import type { Event } from '@/lib/types'
import type { Nosto } from '@/lib/nostot'
import { useLanguage } from '@/contexts/LanguageContext'
import { affiliateUrl, stripPriceFromPrefix } from '@/lib/utils'
import { track } from '@/lib/track'
import { externalUrlFor } from '@/lib/event-links'
import { formatEventDate } from '@/lib/helsinki-time'

function verkkotunnus(url: string): string {
  try { return new URL(url).hostname.replace(/^www\./, '') } catch { return '' }
}

export default function TulossaNosto({ nostot, onOpen }: { nostot: Nosto[]; onOpen: (e: Event) => void }) {
  const { lang, t } = useLanguage()
  if (nostot.length === 0) return null
  return (
    <section aria-label={t('promo.title')} className="mt-1 md:mt-5">
      <p className="text-[11px] font-black uppercase tracking-[.12em] mb-2" style={{ color: 'rgba(255,255,255,.5)' }}>
        ✦ {t('promo.title')}
      </p>
      <div className="space-y-2.5">
        {nostot.map((n) => {
          const e = n.event
          const url = externalUrlFor(e)
          // Sama kaava kuin heron CTA:ssa: hinta nappiin, jos se tiedetään.
          const nappi = e.isFree
            ? t('common.free')
            : e.price
              ? `${t('discover.tickets_from')} ${stripPriceFromPrefix(e.price)}`
              : e.ticketUrl && url === e.ticketUrl ? t('promo.tickets') : t('promo.more')
          const avaa = () => onOpen(e)
          return (
            <div key={n.id} role="button" tabIndex={0} onClick={avaa}
              onKeyDown={(ev) => { if (ev.key === 'Enter' || ev.key === ' ') { ev.preventDefault(); avaa() } }}
              className="relative overflow-hidden rounded-2xl cursor-pointer focus:outline-none focus-visible:ring-2 focus-visible:ring-[#6b76ff]"
              style={{ background: '#111118', border: '1px solid rgba(107,118,255,.25)' }}>
              {/* Tausta: sama juliste sumennettuna ja tummennettuna */}
              {e.image && (
                <div className="absolute inset-0 bg-cover bg-center" style={{ backgroundImage: `url(${e.image})`, filter: 'blur(28px) saturate(1.2)', transform: 'scale(1.3)', opacity: 0.45 }} />
              )}
              <div className="absolute inset-0" style={{ background: 'linear-gradient(90deg, rgba(10,10,12,.86) 0%, rgba(10,10,12,.72) 55%, rgba(10,10,12,.55) 100%)' }} />

              <div className="relative flex gap-3.5 p-3.5 items-stretch">
                {e.image ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={e.image} alt="" className="w-[104px] h-[139px] md:w-[128px] md:h-[171px] object-cover rounded-xl shrink-0" style={{ boxShadow: '0 10px 24px -10px rgba(0,0,0,.8)' }} />
                ) : (
                  <div className="w-[104px] h-[139px] md:w-[128px] md:h-[171px] rounded-xl shrink-0 flex items-center justify-center text-3xl" style={{ background: 'rgba(255,255,255,.06)' }}>✦</div>
                )}
                <div className="min-w-0 flex-1 flex flex-col">
                  <p className="text-[11px] font-black uppercase tracking-[.12em] pr-16" style={{ color: '#a3abff' }}>
                    {formatEventDate(e.startTime, lang === 'en' ? 'en' : 'fi')}{e.location?.name ? ` · ${e.location.name}` : ''}
                  </p>
                  <h3 className="font-black text-white leading-[1.05] mt-1 text-[20px] md:text-[28px] line-clamp-2" style={{ letterSpacing: '-0.02em' }}>
                    {e.title}
                  </h3>
                  {n.koukku && (
                    <p className="text-[13px] md:text-[15px] text-white/80 leading-snug mt-1 line-clamp-2">{n.koukku}</p>
                  )}
                  <div className="mt-auto pt-2 flex items-end justify-between gap-3 flex-wrap">
                    {n.todiste ? (
                      <p className="text-[11.5px] md:text-[12.5px] font-bold leading-snug" style={{ color: '#fcd34d' }}>★ {n.todiste}</p>
                    ) : <span />}
                    {url && (
                      <a href={affiliateUrl(url) ?? url} target="_blank" rel="noopener noreferrer"
                        onClick={(ev) => { ev.stopPropagation(); track('external_click', { surface: 'promo', eventId: e.id, label: e.title, meta: verkkotunnus(url) }) }}
                        className="shrink-0 inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-[13px] font-black text-white"
                        style={{ background: 'linear-gradient(150deg,#6b76ff,#5059e6)', boxShadow: '0 8px 20px -8px rgba(91,101,230,.9)' }}>
                        <Ticket size={14} /> {nappi} <ArrowUpRight size={13} />
                      </a>
                    )}
                  </div>
                </div>
              </div>

              {/* "Mainos": lakisääteinen merkintä maksetussa nostossa — aina näkyvissä */}
              {n.mainos && (
                <span className="absolute top-3 right-3 text-[10px] font-black uppercase tracking-[.1em] px-2 py-0.5 rounded-full"
                  style={{ background: 'rgba(255,255,255,.14)', color: 'rgba(255,255,255,.85)', backdropFilter: 'blur(6px)' }}>
                  {t('promo.ad')}
                </span>
              )}
            </div>
          )
        })}
      </div>
    </section>
  )
}

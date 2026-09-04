'use client'

// Ravintolan infopaneeli — tapahtumapaneelin (EventDetailPanel) kuori ja
// visuaalinen kieli (omistaja 4.9.2026: pyyhkäisysulku kuten tapahtumissa,
// ja ulkoasu joka sopii sovellukseen — vanha modaali "näytti vain Google-
// mittareilta"). Kuori: liukuanimaatio, Escape, historiamerkintä (pyyhkäisy
// taakse sulkee paneelin eikä sovellusta) ja alasvetosulku.
//
// Rikas Google-profiili (tähtijakauma, ruuhka-ajat, ominaisuudet, ruokalista,
// varauslinkki) haetaan täällä on-demand — lista pysyy kevyenä.

import { useEffect, useRef, useState } from 'react'
import { X, MapPin, Clock, ExternalLink, Navigation, Globe, Phone, Map as MapIcon } from 'lucide-react'
import type { Restaurant } from '@/lib/types'
import type { TranslationKey } from '@/lib/i18n'
import { isOpenNow, getTodayHours } from '@/lib/opening-hours'
import { aukioloTieto } from '@/lib/poyta-poiminnat'
import { pickAttributes } from '@/lib/google-attributes'
import { useLanguage } from '@/contexts/LanguageContext'

const PRICE_LABELS = ['', '€', '€€', '€€€', '€€€€']

// Rikas Google-profiili (sama muoto kuin ennen RestaurantsView'ssä).
export type RestGoogleData = {
  rating: number | null
  reviewCount: number | null
  ratingDistribution: Record<string, number> | null
  priceLevel: string | null
  attributes: Record<string, string[]> | null
  phone: string | null
  mapsUrl: string | null
  bookOnlineUrl: string | null
  popularTimes: Record<string, { hour: number; index: number }[]> | null
  peopleAlsoSearch: { title: string; rating: number | null; reviewCount: number | null }[] | null
  totalPhotos: number | null
  isClaimed: boolean
  menu: { title: string; price: string | null; description: string | null }[] | null
  menuUrl: string | null
  menuTotal: number
}

// Sama kuin RestaurantsView'n formatOpeningHoursHuman — kopio tarkoituksella:
// näkymä importtaa tämän paneelin, joten jaettu apuri asuisi muuten väärin päin.
function viikkoAukiolot(raw: string, t: (key: TranslationKey) => string): string {
  if (!raw) return ''
  if (raw === '24/7') return t('restaurants.open_247')
  const SHORT = t('restaurants.weekday_short').split(', ')
  const DAYS: Record<string, string> = { Su: SHORT[0], Mo: SHORT[1], Tu: SHORT[2], We: SHORT[3], Th: SHORT[4], Fr: SHORT[5], Sa: SHORT[6] }
  return raw.split(';').map((p) => {
    let s = p.trim().replace(/\b(Mo|Tu|We|Th|Fr|Sa|Su)\b/g, (k) => DAYS[k] ?? k)
    s = s.replace(/(\d{1,2}:\d{2})-(\d{1,2}:\d{2})/g, '$1–$2')
    return s
  }).join(', ')
}

interface Props {
  r: Restaurant | null
  /** Kuvattoman paneelin juliste: keittiön emoji-osoite + väri (kutsuja
   *  laskee getCuisineStylella — sama laatta kuin korteissa). */
  tyyli?: { cp: string; color: string }
  onClose: () => void
  onShowOnMap?: (lat: number, lon: number, name: string) => void
}

export default function RestaurantDetailPanel({ r, tyyli, onClose, onShowOnMap }: Props) {
  const panelRef = useRef<HTMLDivElement>(null)
  const innerRef = useRef<HTMLDivElement>(null)
  const closeTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const isManualClose = useRef(false)
  const onCloseRef = useRef(onClose)
  onCloseRef.current = onClose
  const [slideIn, setSlideIn] = useState(false)
  const [imgOk, setImgOk] = useState(true)
  const [google, setGoogle] = useState<RestGoogleData | null>(null)
  const { t, lang } = useLanguage()

  // Rikas profiili vasta kun paneeli avataan — sama malli kuin aiemmin.
  useEffect(() => {
    if (!r) { setGoogle(null); return }
    const key = r.name.toLowerCase().trim()
    let cancelled = false
    setGoogle(null)
    fetch(`/api/restaurant-google?key=${encodeURIComponent(key)}`)
      .then((res) => res.json())
      .then((d) => { if (!cancelled) setGoogle(d.google ?? null) })
      .catch(() => {})
    return () => { cancelled = true }
  }, [r])

  // Slide-in — double-rAF kuten EventDetailPanelissa (iOS-välähdyksen esto).
  useEffect(() => {
    if (!r) return
    setImgOk(true)
    const id = requestAnimationFrame(() => requestAnimationFrame(() => setSlideIn(true)))
    return () => cancelAnimationFrame(id)
  }, [r])

  useEffect(() => {
    if (!r) return
    const handleKey = (e: KeyboardEvent) => { if (e.key === 'Escape') handleClose() }
    document.addEventListener('keydown', handleKey)
    return () => document.removeEventListener('keydown', handleKey)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [r])

  // Historiamerkintä: pyyhkäisy taakse sulkee paneelin, ei koko sovellusta.
  useEffect(() => {
    if (!r) return
    isManualClose.current = false
    history.pushState({ mitaTanaan: 'panel' }, '')
    const onPop = () => {
      if (isManualClose.current) { isManualClose.current = false; return }
      isManualClose.current = true
      setSlideIn(false)
      if (closeTimer.current) clearTimeout(closeTimer.current)
      closeTimer.current = setTimeout(() => onCloseRef.current(), 350)
    }
    window.addEventListener('popstate', onPop)
    return () => {
      window.removeEventListener('popstate', onPop)
      if (!isManualClose.current) history.back()
      isManualClose.current = false
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [r?.id])

  // Alasvetosulku — sama logiikka kuin EventDetailPanelissa.
  useEffect(() => {
    if (!r) return
    const panel = panelRef.current
    if (!panel) return
    let startY = 0, startX = 0, dragging = false, curDelta = 0
    const CLOSE_THRESHOLD = 100
    const SPRING = 'transform 340ms cubic-bezier(0.32,0.72,0,1)'
    const EASE_OUT = 'transform 260ms cubic-bezier(0.4,0,1,1)'
    const onStart = (e: TouchEvent) => {
      startY = e.touches[0].clientY
      startX = e.touches[0].clientX
      dragging = false
      curDelta = 0
      panel.style.transition = 'none'
    }
    const onMove = (e: TouchEvent) => {
      const dy = e.touches[0].clientY - startY
      const dx = e.touches[0].clientX - startX
      const scrollTop = innerRef.current?.scrollTop ?? 0
      if (!dragging) {
        if (dy > 8 && Math.abs(dy) > Math.abs(dx) && scrollTop <= 0) dragging = true
        else if (Math.abs(dx) > 8 || dy < -8 || scrollTop > 0) return
      }
      if (dragging) {
        e.preventDefault()
        curDelta = Math.max(0, dy)
        panel.style.transform = `translateY(${curDelta}px)`
      }
    }
    const onEnd = () => {
      if (!dragging) return
      if (curDelta > CLOSE_THRESHOLD) {
        panel.style.transition = EASE_OUT
        panel.style.transform = 'translateY(100%)'
        isManualClose.current = true
        if (closeTimer.current) clearTimeout(closeTimer.current)
        closeTimer.current = setTimeout(() => { history.back(); onCloseRef.current() }, 260)
      } else {
        panel.style.transition = SPRING
        panel.style.transform = 'translateY(0)'
      }
    }
    panel.addEventListener('touchstart', onStart, { passive: true })
    panel.addEventListener('touchmove', onMove, { passive: false })
    panel.addEventListener('touchend', onEnd)
    return () => {
      panel.removeEventListener('touchstart', onStart)
      panel.removeEventListener('touchmove', onMove)
      panel.removeEventListener('touchend', onEnd)
    }
  }, [r])

  useEffect(() => () => { if (closeTimer.current) clearTimeout(closeTimer.current) }, [])

  function handleClose() {
    isManualClose.current = true
    setSlideIn(false)
    if (closeTimer.current) clearTimeout(closeTimer.current)
    closeTimer.current = setTimeout(() => {
      history.back()
      onClose()
    }, 350)
  }

  if (!r) return null

  const tieto = aukioloTieto(r.openingHours, new Date())
  const open = r.openingHours ? isOpenNow(r.openingHours) : undefined
  const tanaan = r.openingHours ? getTodayHours(r.openingHours) : null
  const blurb = lang === 'en' && r.blurbEn ? r.blurbEn : r.blurb
  const www = r.www ? (/^https?:\/\//i.test(r.www) ? r.www : `https://${r.www}`) : null
  const phone = google?.phone ?? r.phone
  const transitUrl = r.lat && r.lon
    ? `https://maps.google.com/maps?daddr=${r.lat},${r.lon}&travelmode=transit`
    : r.address ? `https://maps.google.com/maps?daddr=${encodeURIComponent(r.address + ', Helsinki')}&travelmode=transit` : null
  const kicker = (r.cuisineCategories[0] ?? r.description ?? r.type).toString()

  return (
    <>
      <div className="fixed inset-0 z-40 bg-black/60" onClick={handleClose} aria-hidden />
      <div
        ref={panelRef}
        role="dialog"
        aria-modal
        aria-label={r.name}
        className="fixed inset-x-0 bottom-0 z-50 rounded-t-3xl overflow-hidden md:inset-x-auto md:right-0 md:top-0 md:bottom-0 md:rounded-none md:w-full md:max-w-lg"
        style={{
          transform: slideIn ? 'translateY(0)' : 'translateY(100%)',
          transition: 'transform 340ms cubic-bezier(0.32,0.72,0,1)',
          willChange: 'transform',
        }}
      >
      <div ref={innerRef} className="h-[92dvh] overflow-y-auto bg-[#0e1117] shadow-2xl md:h-full">
        <div className="md:hidden flex justify-center pt-3 pb-1 shrink-0">
          <div className="w-10 h-1 rounded-full bg-white/20" />
        </div>

        {/* Kuva — tai kortin keittiöjuliste kun kuvaa ei ole */}
        <div className="relative h-60 w-full bg-[#1a1f2e] shrink-0">
          {r.image && imgOk ? (
            /* eslint-disable-next-line @next/next/no-img-element */
            <img src={r.image} alt={r.name} onError={() => setImgOk(false)}
              className="absolute inset-0 w-full h-full object-cover" />
          ) : (
            <>
              <div className="absolute inset-0" style={{ background: '#0f0f14' }} />
              {tyyli && (
                <>
                  <div className="absolute inset-0" style={{ background: `radial-gradient(circle at 50% 45%, ${tyyli.color}40 0%, transparent 65%)` }} />
                  <div className="absolute inset-0 flex items-center justify-center">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={`https://cdn.jsdelivr.net/gh/twitter/twemoji@v14.0.2/assets/svg/${tyyli.cp}.svg`} alt=""
                      width={72} height={72} style={{ objectFit: 'contain', filter: 'drop-shadow(0 4px 24px rgba(0,0,0,.7))' }} />
                  </div>
                </>
              )}
            </>
          )}
          <div className="absolute inset-0 bg-gradient-to-t from-[#0e1117] via-black/20 to-transparent" />
          <button onClick={handleClose} aria-label={t('detail.close')}
            className="absolute top-4 right-4 p-2 bg-black/50 hover:bg-black/80 rounded-full text-white transition-colors">
            <X size={16} />
          </button>
          {r.michelinStars ? (
            <span className="absolute top-4 left-4 bg-red-500/90 text-white text-xs font-bold px-3 py-1 rounded-full">
              {'⭐'.repeat(r.michelinStars)} Michelin
            </span>
          ) : r.bibGourmand ? (
            <span className="absolute top-4 left-4 bg-orange-500/90 text-white text-xs font-bold px-3 py-1 rounded-full">
              😊 Bib Gourmand
            </span>
          ) : null}
        </div>

        {/* Sisältö */}
        <div className="p-6 space-y-5">
          <div>
            <p className="text-[11px] font-black uppercase tracking-[.12em] text-white/35">{kicker}</p>
            <h2 className="text-xl font-bold text-white leading-tight mt-1">{r.name}</h2>
            <div className="flex items-center gap-1.5 mt-2 flex-wrap">
              {tieto.tila !== 'tuntematon' && (
                tieto.tila === 'auki' ? (
                  tieto.pian ? (
                    <span className="text-[10px] font-black px-2 py-0.5 rounded-full bg-amber-500/15 text-amber-400">● {t('hours.closing_soon')}</span>
                  ) : (
                    <span className="text-[10px] font-black px-2 py-0.5 rounded-full bg-emerald-500/15 text-emerald-400">
                      ● {t('common.open')}{tieto.klo ? ` → ${tieto.klo}` : ''}
                    </span>
                  )
                ) : (
                  <span className="text-[10px] font-black px-2 py-0.5 rounded-full bg-white/6 text-white/40">
                    ○ {tieto.klo ? `${t('hours.opens')} ${tieto.klo}` : t('common.closed')}
                  </span>
                )
              )}
              {r.priceRange && (
                <span className="text-[10px] font-black px-2 py-0.5 rounded-full bg-white/6 text-white/45">{PRICE_LABELS[r.priceRange]}</span>
              )}
              {r.googleRating && (
                <span className="text-[11px] font-black px-2 py-0.5 rounded-full" style={{ background: 'rgba(251,191,36,.12)', color: '#fbbf24' }}>
                  ⭐ {r.googleRating.toFixed(1)}
                  {r.reviewCount ? <span className="font-normal opacity-70"> ({r.reviewCount > 999 ? `${(r.reviewCount / 1000).toFixed(1)}${t('restaurants.thousand_suffix')}` : r.reviewCount})</span> : null}
                </span>
              )}
              {google?.isClaimed && (
                <span className="text-[10px] font-black px-2 py-0.5 rounded-full bg-sky-500/12 text-sky-300/90">{t('restaurants.verified')}</span>
              )}
            </div>
          </div>

          {/* Metakortti — sama pohja kuin tapahtuma- ja paikkapaneeleissa */}
          <div className="space-y-3 bg-white/4 rounded-xl p-4 border border-white/6">
            {tanaan && (
              <div className="flex items-start gap-3 text-sm">
                <Clock size={15} className="text-[#6b76ff] mt-0.5 shrink-0" />
                <div className="min-w-0">
                  <p className={open ? 'text-emerald-400 font-semibold' : 'text-white/80'}>{t('date.today')} {tanaan}</p>
                  {r.openingHours && (
                    <p className="text-white/35 text-xs mt-0.5 leading-relaxed">{viikkoAukiolot(r.openingHours, t)}</p>
                  )}
                </div>
              </div>
            )}
            {r.address && (
              <div className="flex items-start gap-3 text-sm">
                <MapPin size={15} className="text-[#6b76ff] mt-0.5 shrink-0" />
                <span className="text-white/80">{r.address}</span>
              </div>
            )}
            {phone && (
              <div className="flex items-center gap-3 text-sm">
                <Phone size={15} className="text-[#6b76ff] shrink-0" />
                <a href={`tel:${phone}`} className="text-white/80 hover:text-white transition-colors">{phone}</a>
              </div>
            )}
          </div>

          {/* Esittely */}
          {(blurb || r.description) && (
            <p className="text-white/60 text-sm leading-relaxed">{blurb ?? r.description}</p>
          )}

          {/* Arvostelut — jakauma sovelluksen väreissä, ei raakaa mittaristoa */}
          {(() => {
            const dist = google?.ratingDistribution
            if (!dist) return null
            const num = (v: unknown) => (typeof v === 'number' && isFinite(v) ? v : 0)
            const total = Object.values(dist).reduce((a, b) => a + num(b), 0)
            if (total === 0) return null
            return (
              <div className="space-y-2">
                <p className="text-xs font-semibold text-white/25 uppercase tracking-widest">{t('restaurants.reviews_header')}</p>
                <div className="space-y-1.5 bg-white/4 rounded-xl p-4 border border-white/6">
                  {[5, 4, 3, 2, 1].map((star) => {
                    const pct = Math.round((num(dist[String(star)]) / total) * 100)
                    return (
                      <div key={star} className="flex items-center gap-2.5">
                        <span className="text-white/45 text-[10.5px] font-bold w-3 text-right">{star}</span>
                        <div className="flex-1 h-[5px] rounded-full overflow-hidden" style={{ background: 'rgba(255,255,255,.07)' }}>
                          <div className="h-full rounded-full" style={{ width: `${pct}%`, background: 'linear-gradient(90deg,#6b76ff,#8b93ff)' }} />
                        </div>
                        <span className="text-white/30 text-[10px] w-8 text-right tabular-nums">{pct}%</span>
                      </div>
                    )
                  })}
                </div>
              </div>
            )
          })()}

          {/* Ruuhka-ajat tänään */}
          {(() => {
            const pt = google?.popularTimes
            if (!pt) return null
            const DAY_SHORT = t('restaurants.weekday_short').split(', ')
            const DAY_LABEL: Record<string, string> = {
              sunday: DAY_SHORT[0], monday: DAY_SHORT[1], tuesday: DAY_SHORT[2], wednesday: DAY_SHORT[3],
              thursday: DAY_SHORT[4], friday: DAY_SHORT[5], saturday: DAY_SHORT[6],
            }
            const parts = new Intl.DateTimeFormat('en-US', { timeZone: 'Europe/Helsinki', weekday: 'long', hour: 'numeric', hour12: false }).formatToParts(new Date())
            const wd = (parts.find((p) => p.type === 'weekday')?.value ?? '').toLowerCase()
            let curHour = parseInt(parts.find((p) => p.type === 'hour')?.value ?? '-1', 10)
            if (curHour === 24) curHour = 0
            const today = pt[wd]
            if (!today || today.length === 0) return null
            const maxIdx = Math.max(...today.map((h) => h.index))
            if (maxIdx <= 0) return null
            const cur = today.find((h) => h.hour === curHour)
            const level = cur && cur.index > 0
              ? (cur.index >= 67 ? { t: t('restaurants.busy_high'), c: '#f0776a' } : cur.index >= 34 ? { t: t('restaurants.busy_medium'), c: '#e8c06a' } : { t: t('restaurants.busy_low'), c: '#8ee6a0' })
              : null
            return (
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <p className="text-xs font-semibold text-white/25 uppercase tracking-widest">{t('restaurants.popular_times')} · {DAY_LABEL[wd] ?? ''}</p>
                  {level && <span className="text-[11px] font-black" style={{ color: level.c }}>{t('restaurants.now_label')} {level.t}</span>}
                </div>
                <div className="bg-white/4 rounded-xl p-4 border border-white/6">
                  <div className="flex items-end gap-[3px]" style={{ height: 36 }}>
                    {today.map((h, i) => {
                      const isNow = h.hour === curHour
                      return (
                        <div key={i} className="flex-1 rounded-t-[3px]" title={`${h.hour}:00`}
                          style={{ height: `${Math.max(Math.round((h.index / maxIdx) * 100), 4)}%`, background: isNow ? '#6b76ff' : 'rgba(255,255,255,.14)' }} />
                      )
                    })}
                  </div>
                </div>
              </div>
            )
          })()}

          {/* Ominaisuudet — samat pillit kuin tapahtumapaneelin tageissa */}
          {(() => {
            const tags = pickAttributes(google?.attributes ?? null, 12)
            if (!tags.length) return null
            return (
              <div className="flex flex-wrap gap-2">
                {tags.map((tg, i) => (
                  <span key={i} className="bg-white/5 text-white/45 text-xs px-2.5 py-1 rounded-full border border-white/8">
                    {tg.emoji} {t(tg.labelKey)}
                  </span>
                ))}
              </div>
            )
          })()}

          {/* Ruokalista */}
          {google?.menu && google.menu.length > 0 && (
            <div className="space-y-2">
              <p className="text-xs font-semibold text-white/25 uppercase tracking-widest">
                {t('restaurants.menu')}{google.menuTotal > google.menu.length ? ` · ${google.menu.length}/${google.menuTotal}` : ''}
              </p>
              <div className="space-y-1.5 bg-white/4 rounded-xl p-4 border border-white/6">
                {google.menu.map((m, i) => (
                  <div key={i}>
                    <div className="flex items-baseline justify-between gap-3">
                      <span className="text-white/85 text-[12.5px] font-bold">{m.title}</span>
                      {m.price && <span className="text-white/55 text-[11.5px] font-bold whitespace-nowrap tabular-nums">{m.price}</span>}
                    </div>
                    {m.description && <p className="text-white/40 text-[11px] leading-snug">{m.description}</p>}
                  </div>
                ))}
                {google.menuUrl && (
                  <a href={google.menuUrl} target="_blank" rel="noopener noreferrer"
                    className="inline-block text-[11.5px] font-bold pt-1" style={{ color: '#a3abff' }}>
                    {t('restaurants.full_menu')}
                  </a>
                )}
              </div>
            </div>
          )}

          {/* Vastaavat paikat */}
          {google?.peopleAlsoSearch && google.peopleAlsoSearch.length > 0 && (
            <div className="space-y-2">
              <p className="text-xs font-semibold text-white/25 uppercase tracking-widest">{t('restaurants.similar_places')}</p>
              <div className="flex flex-wrap gap-2">
                {google.peopleAlsoSearch.map((p, i) => (
                  <span key={i} className="bg-white/5 text-white/45 text-xs px-2.5 py-1 rounded-full border border-white/8">
                    {p.title}{p.rating != null ? ` · ⭐${p.rating.toFixed(1)}` : ''}
                  </span>
                ))}
              </div>
            </div>
          )}

          {/* CTA:t + Kartta/Reittiohjeet — sama asettelu kuin tapahtumissa */}
          {/* Varaa pöytä -nappia EI ole (omistaja 4.9.2026): TheFork-haku oli
              väärä malli Suomeen ja Googlen Reserve-linkit veisivät Googlen
              virtaan. Varaaminen = Nettisivu (ravintolan oma varaus) tai
              puhelinnumero metakortissa — suomalainen tapa. */}
          <div className="flex flex-col gap-2.5 pt-1">
            {www && (
              <a href={www} target="_blank" rel="noopener noreferrer"
                className="flex items-center justify-center gap-2 text-white font-bold text-sm py-3.5 rounded-xl transition-colors"
                style={{ background: 'linear-gradient(150deg,#6b76ff,#5059e6)' }}>
                <Globe size={15} />
                <span className="truncate">{t('common.website')}</span>
                <ExternalLink size={13} className="opacity-70 shrink-0" />
              </a>
            )}
            <div className="grid grid-cols-2 gap-2">
              {onShowOnMap && r.lat && r.lon ? (
                <button onClick={() => { onShowOnMap(r.lat!, r.lon!, r.name); handleClose() }}
                  className="flex items-center justify-center gap-1.5 bg-white/5 hover:bg-white/8 text-white/60 font-medium text-sm py-3 rounded-xl border border-white/8 transition-colors">
                  <MapIcon size={14} />
                  {t('idea.on_map')}
                </button>
              ) : (
                <a href={`https://maps.google.com/?q=${encodeURIComponent(`${r.name} ${r.address ?? ''} Helsinki`)}`}
                  target="_blank" rel="noopener noreferrer"
                  className="flex items-center justify-center gap-1.5 bg-white/5 hover:bg-white/8 text-white/60 font-medium text-sm py-3 rounded-xl border border-white/8 transition-colors">
                  <MapIcon size={14} />
                  {t('detail.map')}
                </a>
              )}
              {transitUrl && (
                <a href={transitUrl} target="_blank" rel="noopener noreferrer"
                  className="flex items-center justify-center gap-1.5 font-medium text-sm py-3 rounded-xl border transition-colors"
                  style={{ background: 'rgba(107,118,255,.1)', borderColor: 'rgba(107,118,255,.2)', color: '#a3abff' }}>
                  <Navigation size={14} />
                  {t('detail.directions')}
                </a>
              )}
            </div>
            {google?.mapsUrl && (
              <a href={google.mapsUrl} target="_blank" rel="noopener noreferrer"
                className="text-center text-white/30 text-xs font-bold pt-0.5 hover:text-white/55 transition-colors">
                {google.totalPhotos != null && google.totalPhotos > 0 ? `${google.totalPhotos} ${t('restaurants.photos')} · ` : ''}{t('restaurants.view_on_google')}
              </a>
            )}
          </div>
        </div>
      </div>
      </div>
    </>
  )
}

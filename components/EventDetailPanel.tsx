'use client'

import { useEffect, useRef, useState, useCallback } from 'react'
import { X, MapPin, Clock, ExternalLink, Ticket, Navigation, Share2, MessageCircle, Copy, Check, Heart } from 'lucide-react'
import { Event } from '@/lib/types'
import type { Restaurant } from '@/lib/types'
import { affiliateUrl, formatDate, formatDateRange, formatTime, haversineKm, fmtDistance } from '@/lib/utils'
import { useFavorites } from '@/contexts/FavoritesContext'
import { useLanguage } from '@/contexts/LanguageContext'

interface Props {
  event: Event | null
  onClose: () => void
}

export default function EventDetailPanel({ event, onClose }: Props) {
  const panelRef = useRef<HTMLDivElement>(null)
  const closeTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const isManualClose = useRef(false)
  const [copied, setCopied] = useState(false)
  const [showShare, setShowShare] = useState(false)
  const [slideIn, setSlideIn] = useState(false)
  const [nearbyRests, setNearbyRests] = useState<(Restaurant & { dist: number })[]>([])
  const { toggle, isFavorite } = useFavorites()
  const { t, lang } = useLanguage()
  const fav = event ? isFavorite(event.id) : false

  function buildShareText(event: Event): string {
    const date = `${formatDate(event.startTime)} ${t('share.at_time')} ${formatTime(event.startTime)}`
    const loc = event.location?.name ? ` @ ${event.location.name}` : ''
    const free = event.isFree ? ` 🎁 ${t('common.free_ticket')}` : ''
    return `${event.title}\n${date}${loc}${free}\n\n${t('share.found_in')}`
  }

  // Fetch restaurants within 500 m when event has coordinates
  useEffect(() => {
    setNearbyRests([])
    if (!event?.location?.lat || !event?.location?.lon) return
    const { lat, lon } = event.location as { lat: number; lon: number }
    let cancelled = false
    fetch('/api/restaurants')
      .then(r => r.json())
      .then(data => {
        if (cancelled) return
        const withDist = ((data.restaurants ?? []) as Restaurant[])
          .filter(r => r.lat && r.lon && r.type === 'ravintola')
          .map(r => ({ ...r, dist: haversineKm(lat, lon, r.lat!, r.lon!) }))
          .filter(r => r.dist < 0.5)
          .sort((a, b) => a.dist - b.dist)
          .slice(0, 3)
        setNearbyRests(withDist)
      })
      .catch(() => {})
    return () => { cancelled = true }
  }, [event?.id])

  // Slide-in: double-rAF so the panel is painted off-screen before transitioning.
  // Avoids the 1-2 frame flash at wrong position that CSS animation classes cause on iOS.
  useEffect(() => {
    if (!event) return
    const id = requestAnimationFrame(() => requestAnimationFrame(() => setSlideIn(true)))
    return () => cancelAnimationFrame(id)
  }, [event])

  useEffect(() => {
    if (!event) return
    const handleKey = (e: KeyboardEvent) => { if (e.key === 'Escape') handleClose() }
    document.addEventListener('keydown', handleKey)
    return () => document.removeEventListener('keydown', handleKey)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [event])

  // Push a browser history entry when the panel opens so that the native
  // swipe-back gesture fires popstate instead of leaving the app entirely.
  useEffect(() => {
    if (!event) return
    isManualClose.current = false
    history.pushState({ mitaTanaan: 'panel' }, '')

    const onPop = () => {
      if (isManualClose.current) { isManualClose.current = false; return }
      // Swipe-back: browser already went back — just animate and close
      isManualClose.current = true
      setSlideIn(false)
      if (closeTimer.current) clearTimeout(closeTimer.current)
      closeTimer.current = setTimeout(onClose, 350)
    }
    window.addEventListener('popstate', onPop)
    return () => {
      window.removeEventListener('popstate', onPop)
      // If the panel was closed externally (parent set event=null directly),
      // remove the history entry we pushed so it doesn't leave a ghost entry.
      if (!isManualClose.current) history.back()
      isManualClose.current = false
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [event?.id])

  function handleClose() {
    if (closeTimer.current) clearTimeout(closeTimer.current)
    isManualClose.current = true
    setSlideIn(false)
    closeTimer.current = setTimeout(() => {
      history.back() // removes the pushState entry (fires popstate async, but listener is gone by then)
      onClose()
    }, 350)
  }

  if (!event) return null

  const mapsUrl = event.location
    ? `https://maps.google.com/?q=${encodeURIComponent(
        [event.location.streetAddress, event.location.city].filter(Boolean).join(', ')
      )}`
    : null

  // Transit directions via Google Maps (shows HSL routes in Helsinki automatically)
  const transitUrl = event.location
    ? event.location.lat && event.location.lon
      ? `https://maps.google.com/maps?daddr=${event.location.lat},${event.location.lon}&travelmode=transit`
      : `https://maps.google.com/maps?daddr=${encodeURIComponent([event.location.streetAddress, event.location.city].filter(Boolean).join(', '))}&travelmode=transit`
    : null

  const shareText = buildShareText(event)
  const shareUrl = event.infoUrl || event.ticketUrl || 'https://helsinki-tapahtumat.fi'

  async function handleNativeShare() {
    if (navigator.share) {
      try {
        await navigator.share({ title: event!.title, text: shareText, url: shareUrl })
      } catch {}
    } else {
      setShowShare(true)
    }
  }

  function handleWhatsApp() {
    const text = encodeURIComponent(`${shareText}\n${shareUrl}`)
    window.open(`https://wa.me/?text=${text}`, '_blank')
  }

  function handleCopy() {
    navigator.clipboard.writeText(`${shareText}\n${shareUrl}`)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  return (
    <>
      {/* Backdrop — no blur (backdrop-filter kills GPU perf on iOS during animation) */}
      <div className="fixed inset-0 z-40 bg-black/60" onClick={handleClose} aria-hidden />

      {/*
        Outer: ONLY transform — no overflow-y, no scroll.
        iOS Safari jank source: transform + overflow-y on the same element.
        Outer clips rounded corners (overflow:hidden), inner handles scroll.
      */}
      <div
        ref={panelRef}
        role="dialog"
        aria-modal
        aria-label={event.title}
        className="fixed inset-x-0 bottom-0 z-50 rounded-t-3xl overflow-hidden md:inset-x-auto md:right-0 md:top-0 md:bottom-0 md:rounded-none md:w-full md:max-w-lg"
        style={{
          transform: slideIn ? 'translateY(0)' : 'translateY(100%)',
          transition: 'transform 340ms cubic-bezier(0.32,0.72,0,1)',
          willChange: 'transform',
        }}
      >
      {/* Scrollable inner — no transform here */}
      <div className="h-[92dvh] overflow-y-auto bg-[#0e1117] shadow-2xl md:h-full">
        {/* Drag handle — mobile only */}
        <div className="md:hidden flex justify-center pt-3 pb-1 shrink-0">
          <div className="w-10 h-1 rounded-full bg-white/20" />
        </div>
        {/* Hero image */}
        <div className="relative h-60 w-full bg-[#1a1f2e] shrink-0">
          {event.image ? (
            <img src={event.image} alt={event.title} className="absolute inset-0 w-full h-full object-cover" />
          ) : (
            <div className="h-full w-full bg-gradient-to-br from-[#0072C6]/40 to-indigo-900/60" />
          )}
          <div className="absolute inset-0 bg-gradient-to-t from-[#0e1117] via-black/20 to-transparent" />

          {/* Top buttons */}
          <div className="absolute top-4 right-4 flex gap-2">
            <button
              onClick={handleNativeShare}
              className="p-2 bg-black/50 hover:bg-black/80 backdrop-blur-sm rounded-full text-white/70 hover:text-white transition-colors"
              aria-label={t('detail.share_label')}
            >
              <Share2 size={16} />
            </button>
            <button
              onClick={() => event && toggle(event)}
              style={{
                background: fav ? '#ec4899' : 'rgba(0,0,0,0.5)',
                color: fav ? '#fff' : 'rgba(255,255,255,0.7)',
              }}
              className="p-2 rounded-full transition-all"
              aria-label={t('detail.save_fav')}
            >
              <Heart size={16} fill={fav ? 'currentColor' : 'none'} />
            </button>
            <button
              onClick={handleClose}
              className="p-2 bg-black/50 hover:bg-black/80 rounded-full text-white transition-colors"
              aria-label={t('detail.close')}
            >
              <X size={16} />
            </button>
          </div>

          {event.isFree && (
            <span className="absolute top-4 left-4 bg-emerald-500 text-white text-xs font-bold px-3 py-1 rounded-full">
              🎁 {t('common.free_ticket')}
            </span>
          )}
        </div>

        {/* Content */}
        <div className="p-6 space-y-5">
          <h2 className="text-xl font-bold text-white leading-tight">{event.title}</h2>

          {/* Meta card */}
          <div className="space-y-3 bg-white/4 rounded-xl p-4 border border-white/6">
            <div className="flex items-start gap-3 text-sm">
              <Clock size={15} className="text-[#0072C6] mt-0.5 shrink-0" />
              <span className="text-white/80">{formatDateRange(event.startTime, event.endTime)}</span>
            </div>
            {event.location && (
              <div className="flex items-start gap-3 text-sm">
                <MapPin size={15} className="text-[#0072C6] mt-0.5 shrink-0" />
                <div>
                  {event.location.name && <p className="text-white/80 font-medium">{event.location.name}</p>}
                  {event.location.streetAddress && (
                    <p className="text-white/40 text-xs mt-0.5">{event.location.streetAddress}, {event.location.city}</p>
                  )}
                </div>
              </div>
            )}
            {!event.isFree && event.price && (
              <div className="flex items-center gap-3 text-sm">
                <Ticket size={15} className="text-[#0072C6] shrink-0" />
                <span className="text-white/80">{event.price}</span>
              </div>
            )}
          </div>

          {/* Description */}
          {(event.description || event.shortDescription) && (
            <p className="text-white/60 text-sm leading-relaxed whitespace-pre-line">
              {(event.description || event.shortDescription)
                .replace(/<br\s*\/?>/gi, '\n')
                .replace(/<\/p>/gi, '\n')
                .replace(/<[^>]+>/g, '')
                .replace(/&nbsp;/g, ' ')
                .replace(/&amp;/g, '&')
                .replace(/&lt;/g, '<')
                .replace(/&gt;/g, '>')
                .replace(/&quot;/g, '"')
                .replace(/\n{3,}/g, '\n\n')
                .trim()}
            </p>
          )}

          {/* Tags */}
          {event.categories.length > 0 && (
            <div className="flex flex-wrap gap-2">
              {event.categories.map((cat) => (
                <span key={cat} className="bg-white/5 text-white/40 text-xs px-2.5 py-1 rounded-full border border-white/8">
                  {cat}
                </span>
              ))}
            </div>
          )}

          {/* Share section */}
          <div className="space-y-2">
            <p className="text-xs font-semibold text-white/25 uppercase tracking-widest">{t('detail.share_with')}</p>
            <div className="grid grid-cols-3 gap-2">
              <button
                onClick={handleWhatsApp}
                className="flex flex-col items-center gap-1.5 bg-[#25D366]/10 hover:bg-[#25D366]/20 border border-[#25D366]/20 rounded-xl py-3 px-2 transition-colors"
              >
                <MessageCircle size={18} className="text-[#25D366]" />
                <span className="text-[#25D366] text-[11px] font-semibold">WhatsApp</span>
              </button>

              <button
                onClick={() => window.open(`https://t.me/share/url?url=${encodeURIComponent(shareUrl)}&text=${encodeURIComponent(shareText)}`, '_blank')}
                className="flex flex-col items-center gap-1.5 bg-[#0088cc]/10 hover:bg-[#0088cc]/20 border border-[#0088cc]/20 rounded-xl py-3 px-2 transition-colors"
              >
                <span className="text-[#0088cc] text-lg leading-none">✈️</span>
                <span className="text-[#0088cc] text-[11px] font-semibold">Telegram</span>
              </button>

              <button
                onClick={handleCopy}
                className={`flex flex-col items-center gap-1.5 border rounded-xl py-3 px-2 transition-all ${copied ? 'bg-emerald-500/10 border-emerald-500/30' : 'bg-white/5 border-white/10 hover:bg-white/8'}`}
              >
                {copied ? <Check size={18} className="text-emerald-400" /> : <Copy size={18} className="text-white/50" />}
                <span className={`text-[11px] font-semibold ${copied ? 'text-emerald-400' : 'text-white/40'}`}>
                  {copied ? t('detail.copied') : t('detail.copy')}
                </span>
              </button>
            </div>
          </div>

          {/* CTA buttons */}
          <div className="flex flex-col gap-2.5 pt-1">
            {(event.ticketUrl || event.infoUrl) && (
              <a
                href={affiliateUrl(event.ticketUrl || event.infoUrl) || '#'}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center justify-center gap-2 bg-[#0072C6] hover:bg-[#0060a8] text-white font-bold text-sm py-3.5 rounded-xl transition-colors"
              >
                <Ticket size={15} />
                {event.ticketUrl ? t('detail.buy_tickets') : t('detail.read_more')}
                <ExternalLink size={13} className="opacity-70" />
              </a>
            )}
            {(mapsUrl || transitUrl) && (
              <div className="grid grid-cols-2 gap-2">
                {mapsUrl && (
                  <a
                    href={mapsUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center justify-center gap-1.5 bg-white/5 hover:bg-white/8 text-white/60 font-medium text-sm py-3 rounded-xl border border-white/8 transition-colors"
                  >
                    <Navigation size={14} />
                    {t('detail.map')}
                  </a>
                )}
                {transitUrl && (
                  <a
                    href={transitUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center justify-center gap-1.5 bg-[#0072C6]/10 hover:bg-[#0072C6]/20 text-[#4da6e8] font-medium text-sm py-3 rounded-xl border border-[#0072C6]/20 transition-colors"
                  >
                    <Navigation size={14} />
                    {t('detail.directions')}
                  </a>
                )}
              </div>
            )}
          </div>
          {/* Nearby restaurants */}
          {nearbyRests.length > 0 && (
            <div className="pt-2 border-t border-white/6">
              <p className="text-xs font-black uppercase tracking-widest text-white/25 mb-3">🍽 Syö ennen keikkaa</p>
              <div className="space-y-2">
                {nearbyRests.map(r => (
                  <a key={r.id} href={r.www ? (/^https?:\/\//i.test(r.www) ? r.www : 'https://' + r.www) : '#'}
                    target="_blank" rel="noopener noreferrer"
                    className="flex items-center justify-between bg-white/4 hover:bg-white/7 border border-white/6 rounded-xl px-4 py-3 transition-colors group">
                    <div className="min-w-0">
                      <p className="text-white font-semibold text-sm group-hover:text-purple-300 transition-colors truncate">{r.name}</p>
                      <p className="text-white/35 text-xs truncate">{r.description || r.address}</p>
                    </div>
                    <span className="text-blue-400/70 text-xs font-medium shrink-0 ml-3">{fmtDistance(r.dist)}</span>
                  </a>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>{/* /scrollable inner */}
      </div>{/* /animated outer */}
    </>
  )
}

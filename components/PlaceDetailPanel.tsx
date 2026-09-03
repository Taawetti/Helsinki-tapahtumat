'use client'

// Paikan infopaneeli — TÄSMÄLLEEN tapahtumapaneelin (EventDetailPanel) kuori
// ja asettelu, paikkakohtaisilla riveillä (omistaja 3.9.2026: "haluan että
// infokortti on tällainen niin kuin tapahtumissa"). Oppaiden paikkakortit
// (saunat, terassit, pubivisat, kirpputorit, museot, galleriat) avaavat tämän.
//
// Kuori kopioitu EventDetailPanelista tarkoituksella samana: liukuanimaatio
// (double-rAF), Escape, historiamerkintä (pyyhkäisy taakse sulkee paneelin
// eikä koko sovellusta) ja alasvetosulku. Sisältö: aukiolot + osoite +
// arvosana metakortissa, jaa-osio, CTA (nettisivu tai haku — ei umpikujaa),
// Kartta + Reittiohjeet.

import { useEffect, useRef, useState } from 'react'
import { X, MapPin, Clock, ExternalLink, Navigation, Share2, MessageCircle, Copy, Check, Globe, Search, Phone, Star } from 'lucide-react'
import { track } from '@/lib/track'
import { isOpenNow, getTodayHours } from '@/lib/opening-hours'
import { useLanguage } from '@/contexts/LanguageContext'

export interface PaikkaTieto {
  id: string
  name: string
  address?: string | null
  image?: string | null
  emoji: string
  kicker: string
  topBadge?: string | null
  /** Pubivisoissa seuraava peliaika — näytetään omana rivinään. */
  bottomChip?: string | null
  www?: string | null
  lat?: number | null
  lon?: number | null
  phone?: string | null
  openingHours?: string | null
  rating?: number | null
  reviews?: number | null
}

// Sama julistepaletti kuin paikkakorteissa (GuideInlineView) — kuvaton
// paneeli saa saman liukuvärin ja emojin kuin kortti jolta se avattiin.
const GRADIENTS = [
  'linear-gradient(135deg,#1e1b4b 0%,#312e81 55%,#4c1d95 100%)',
  'linear-gradient(155deg,#4a044e 0%,#86198f 55%,#701a75 100%)',
  'linear-gradient(135deg,#0c1445 0%,#1e3a8a 55%,#1d4ed8 100%)',
  'linear-gradient(160deg,#052e16 0%,#065f46 55%,#047857 100%)',
  'linear-gradient(135deg,#450a0a 0%,#991b1b 55%,#b91c1c 100%)',
  'linear-gradient(155deg,#0c2a4a 0%,#0e4d6e 55%,#0369a1 100%)',
  'linear-gradient(135deg,#4a0520 0%,#881337 55%,#9f1239 100%)',
  'linear-gradient(160deg,#431407 0%,#78350f 55%,#92400e 100%)',
  'linear-gradient(135deg,#042f2e 0%,#0f4c35 55%,#065f46 100%)',
  'linear-gradient(155deg,#2e1065 0%,#4c1d95 55%,#6d28d9 100%)',
  'linear-gradient(135deg,#14532d 0%,#166534 55%,#15803d 100%)',
  'linear-gradient(160deg,#1c1917 0%,#292524 55%,#44403c 100%)',
]
function hashIdx(id: string): number {
  let h = 0
  for (const c of id) h = (h * 31 + c.charCodeAt(0)) & 0xffff
  return h % GRADIENTS.length
}

interface Props {
  paikka: PaikkaTieto | null
  /** Oppaan polku jakolinkkiä varten, esim. 'saunat' → mitatanaan.fi/saunat */
  guideSlug: string
  onClose: () => void
}

export default function PlaceDetailPanel({ paikka, guideSlug, onClose }: Props) {
  const panelRef = useRef<HTMLDivElement>(null)
  const innerRef = useRef<HTMLDivElement>(null)
  const closeTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const isManualClose = useRef(false)
  const onCloseRef = useRef(onClose)
  onCloseRef.current = onClose
  const [copied, setCopied] = useState(false)
  const [slideIn, setSlideIn] = useState(false)
  const [imgOk, setImgOk] = useState(true)
  const { t } = useLanguage()

  // Slide-in — double-rAF kuten EventDetailPanelissa (iOS-välähdyksen esto).
  useEffect(() => {
    if (!paikka) return
    setImgOk(true)
    const id = requestAnimationFrame(() => requestAnimationFrame(() => setSlideIn(true)))
    return () => cancelAnimationFrame(id)
  }, [paikka])

  useEffect(() => {
    if (!paikka) return
    const handleKey = (e: KeyboardEvent) => { if (e.key === 'Escape') handleClose() }
    document.addEventListener('keydown', handleKey)
    return () => document.removeEventListener('keydown', handleKey)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [paikka])

  // Historiamerkintä: pyyhkäisy taakse sulkee paneelin, ei koko sovellusta.
  useEffect(() => {
    if (!paikka) return
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
  }, [paikka?.id])

  // Alasvetosulku — sama logiikka kuin EventDetailPanelissa.
  useEffect(() => {
    if (!paikka) return
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
  }, [paikka])

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

  if (!paikka) return null

  const open = isOpenNow(paikka.openingHours)
  const tanaan = paikka.openingHours ? getTodayHours(paikka.openingHours) : null
  const www = paikka.www ? (/^https?:\/\//i.test(paikka.www) ? paikka.www : `https://${paikka.www}`) : null
  const mapsQuery = [paikka.name, paikka.address, 'Helsinki'].filter(Boolean).join(', ')
  const mapsUrl = paikka.lat && paikka.lon
    ? `https://maps.google.com/?q=${paikka.lat},${paikka.lon}`
    : `https://maps.google.com/?q=${encodeURIComponent(mapsQuery)}`
  const transitUrl = paikka.lat && paikka.lon
    ? `https://maps.google.com/maps?daddr=${paikka.lat},${paikka.lon}&travelmode=transit`
    : `https://maps.google.com/maps?daddr=${encodeURIComponent(mapsQuery)}&travelmode=transit`

  const shareText = `${paikka.name}${paikka.address ? `\n📍 ${paikka.address}` : ''}\n\n${t('share.found_in')}`
  const shareUrl = `https://mitatanaan.fi/${guideSlug}`
  // CTA kuten tapahtumissa: nettisivu jos tiedossa, muuten haku nimellä —
  // paneeli ei koskaan jää umpikujaksi.
  const ctaHref = www ?? `https://www.google.com/search?q=${encodeURIComponent(`${paikka.name} Helsinki`)}`
  const ctaLabel = www ? t('common.website') : t('detail.search_more')

  async function handleNativeShare() {
    if (navigator.share) {
      try { await navigator.share({ title: paikka!.name, text: shareText, url: shareUrl }) } catch {}
    } else {
      handleCopy()
    }
  }
  function handleWhatsApp() {
    window.open(`https://wa.me/?text=${encodeURIComponent(`${shareText}\n${shareUrl}`)}`, '_blank')
  }
  function handleCopy() {
    navigator.clipboard.writeText(`${shareText}\n${shareUrl}`)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  const idx = hashIdx(paikka.id)

  return (
    <>
      <div className="fixed inset-0 z-40 bg-black/60" onClick={handleClose} aria-hidden />
      <div
        ref={panelRef}
        role="dialog"
        aria-modal
        aria-label={paikka.name}
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

        {/* Kuva — tai kortin juliste kun kuvaa ei ole */}
        <div className="relative h-60 w-full bg-[#1a1f2e] shrink-0">
          {paikka.image && imgOk ? (
            /* eslint-disable-next-line @next/next/no-img-element */
            <img src={paikka.image} alt={paikka.name} onError={() => setImgOk(false)}
              className="absolute inset-0 w-full h-full object-cover" />
          ) : (
            <>
              <div className="h-full w-full" style={{ background: GRADIENTS[idx] }} />
              <div className="absolute select-none pointer-events-none leading-none"
                style={{ fontSize: '7rem', top: '-4px', right: '4px', opacity: 0.18 }}>
                {paikka.emoji}
              </div>
            </>
          )}
          <div className="absolute inset-0 bg-gradient-to-t from-[#0e1117] via-black/20 to-transparent" />

          <div className="absolute top-4 right-4 flex gap-2">
            <button onClick={handleNativeShare}
              className="p-2 bg-black/50 hover:bg-black/80 backdrop-blur-sm rounded-full text-white/70 hover:text-white transition-colors"
              aria-label={t('detail.share_label')}>
              <Share2 size={16} />
            </button>
            <button onClick={handleClose}
              className="p-2 bg-black/50 hover:bg-black/80 rounded-full text-white transition-colors"
              aria-label={t('detail.close')}>
              <X size={16} />
            </button>
          </div>

          {paikka.topBadge && !paikka.topBadge.startsWith('★') && (
            <span className="absolute top-4 left-4 bg-emerald-500 text-white text-xs font-bold px-3 py-1 rounded-full">
              {paikka.topBadge}
            </span>
          )}
        </div>

        {/* Sisältö */}
        <div className="p-6 space-y-5">
          <div>
            <p className="text-[11px] font-black uppercase tracking-[.12em] text-white/35">{paikka.kicker}</p>
            <h2 className="text-xl font-bold text-white leading-tight mt-1">{paikka.name}</h2>
          </div>

          {/* Metakortti — sama pohja kuin tapahtumapaneelissa */}
          <div className="space-y-3 bg-white/4 rounded-xl p-4 border border-white/6">
            {(tanaan || (paikka.bottomChip && !paikka.bottomChip.startsWith('★'))) && (
              <div className="flex items-start gap-3 text-sm">
                <Clock size={15} className="text-[#0072C6] mt-0.5 shrink-0" />
                <div className="min-w-0">
                  {/* Pubivisoissa bottomChip on seuraava peliaika — se on
                      kävijälle se olennainen kellotieto ja tulee ensin. */}
                  {paikka.bottomChip && !paikka.bottomChip.startsWith('★') && (
                    <p className="text-white/80 font-medium">{paikka.bottomChip}</p>
                  )}
                  {tanaan && (
                    <p className={paikka.bottomChip && !paikka.bottomChip.startsWith('★') ? 'text-white/40 text-xs mt-0.5' : 'text-white/80'}>
                      {t('date.today')} {tanaan}
                      {open !== undefined && (
                        <span className={open ? 'text-emerald-400 font-semibold' : 'text-white/40'}>
                          {' '}· {open ? t('common.open') : t('common.closed')}
                        </span>
                      )}
                    </p>
                  )}
                </div>
              </div>
            )}
            {(paikka.address || paikka.name) && (
              <div className="flex items-start gap-3 text-sm">
                <MapPin size={15} className="text-[#0072C6] mt-0.5 shrink-0" />
                <div className="min-w-0">
                  <p className="text-white/80 font-medium">{paikka.name}</p>
                  {paikka.address && <p className="text-white/40 text-xs mt-0.5">{paikka.address}, Helsinki</p>}
                </div>
              </div>
            )}
            {paikka.rating != null && (
              <div className="flex items-center gap-3 text-sm">
                <Star size={15} className="text-[#0072C6] shrink-0" />
                <span className="text-white/80">
                  {paikka.rating.toFixed(1)} / 5
                  {paikka.reviews ? <span className="text-white/40"> ({paikka.reviews})</span> : null}
                </span>
              </div>
            )}
            {paikka.phone && (
              <div className="flex items-center gap-3 text-sm">
                <Phone size={15} className="text-[#0072C6] shrink-0" />
                <a href={`tel:${paikka.phone}`} className="text-white/80 hover:text-white transition-colors">{paikka.phone}</a>
              </div>
            )}
          </div>

          {/* Jaa kavereille — identtinen tapahtumapaneelin kanssa */}
          <div className="space-y-2">
            <p className="text-xs font-semibold text-white/25 uppercase tracking-widest">{t('detail.share_with')}</p>
            <div className="grid grid-cols-3 gap-2">
              <button onClick={handleWhatsApp}
                className="flex flex-col items-center gap-1.5 bg-[#25D366]/10 hover:bg-[#25D366]/20 border border-[#25D366]/20 rounded-xl py-3 px-2 transition-colors">
                <MessageCircle size={18} className="text-[#25D366]" />
                <span className="text-[#25D366] text-[11px] font-semibold">WhatsApp</span>
              </button>
              <button onClick={() => window.open(`https://t.me/share/url?url=${encodeURIComponent(shareUrl)}&text=${encodeURIComponent(shareText)}`, '_blank')}
                className="flex flex-col items-center gap-1.5 bg-[#0088cc]/10 hover:bg-[#0088cc]/20 border border-[#0088cc]/20 rounded-xl py-3 px-2 transition-colors">
                <span className="text-[#0088cc] text-lg leading-none">✈️</span>
                <span className="text-[#0088cc] text-[11px] font-semibold">Telegram</span>
              </button>
              <button onClick={handleCopy}
                className={`flex flex-col items-center gap-1.5 border rounded-xl py-3 px-2 transition-all ${copied ? 'bg-emerald-500/10 border-emerald-500/30' : 'bg-white/5 border-white/10 hover:bg-white/8'}`}>
                {copied ? <Check size={18} className="text-emerald-400" /> : <Copy size={18} className="text-white/50" />}
                <span className={`text-[11px] font-semibold ${copied ? 'text-emerald-400' : 'text-white/40'}`}>
                  {copied ? t('detail.copied') : t('detail.copy')}
                </span>
              </button>
            </div>
          </div>

          {/* CTA + Kartta/Reittiohjeet — sama asettelu kuin tapahtumissa */}
          <div className="flex flex-col gap-2.5 pt-1">
            <a href={ctaHref} target="_blank" rel="noopener noreferrer"
              onClick={() => {
                let domain = ''
                try { domain = new URL(ctaHref).hostname.replace(/^www\./, '') } catch { /* ei osoite */ }
                track('external_click', { surface: 'guide', label: paikka.name, meta: domain })
              }}
              className="flex items-center justify-center gap-2 bg-[#0072C6] hover:bg-[#0060a8] text-white font-bold text-sm py-3.5 rounded-xl transition-colors">
              {www ? <Globe size={15} /> : <Search size={15} />}
              <span className="truncate">{ctaLabel}</span>
              <ExternalLink size={13} className="opacity-70 shrink-0" />
            </a>
            <div className="grid grid-cols-2 gap-2">
              <a href={mapsUrl} target="_blank" rel="noopener noreferrer"
                className="flex items-center justify-center gap-1.5 bg-white/5 hover:bg-white/8 text-white/60 font-medium text-sm py-3 rounded-xl border border-white/8 transition-colors">
                <Navigation size={14} />
                {t('detail.map')}
              </a>
              <a href={transitUrl} target="_blank" rel="noopener noreferrer"
                className="flex items-center justify-center gap-1.5 bg-[#0072C6]/10 hover:bg-[#0072C6]/20 text-[#4da6e8] font-medium text-sm py-3 rounded-xl border border-[#0072C6]/20 transition-colors">
                <Navigation size={14} />
                {t('detail.directions')}
              </a>
            </div>
          </div>
        </div>
      </div>
      </div>
    </>
  )
}

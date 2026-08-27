'use client'

import { useState, useEffect, useMemo, useCallback, useRef } from 'react'
import { Globe, MapPin, Map as MapIcon, Heart, X, Clock } from 'lucide-react'
import type { Event, Activity, ActivityCategory } from '@/lib/types'
import { track } from '@/lib/track'
import { useLanguage } from '@/contexts/LanguageContext'
import type { TranslationKey } from '@/lib/i18n'
import { useFavorites } from '@/contexts/FavoritesContext'
import { isOpenNow } from '@/lib/opening-hours'
import { helsinkiToday } from '@/lib/helsinki-time'
import { addDays } from '@/lib/arvo-ilta'
import { buildIdeaDeck, type IdeaSceneId } from '@/lib/idea-deck'
import { recordClick, getCategoryScores } from '@/lib/preferences'
import { getEventVibes } from '@/lib/event-classify'
import { isOutsideTargetAudience, isPrimaryPick } from '@/lib/audience'
import { canBuyTickets } from '@/lib/tickets'
import DatePicker from '@/components/DatePicker'

// Idea-sivu 8/2026: käsin kuratoitu 13 klassikkoa POISTETTU (asiakkaat huomasivat
// toiston) — pakka on nyt tapahtumakeskeinen: tämän päivän tapahtumat
// kohderyhmäsuodatuksella (vauva/perhe pois oletuksena, seniori alas),
// makumuistilla ja cold-start-sceneilla painotettuna (lib/idea-deck.ts).

// ── Types ────────────────────────────────────────────────

type SuggestionType = 'event' | 'activity'

interface Suggestion {
  id: string
  type: SuggestionType
  title: string
  why: string
  subWhy?: string
  reason?: TranslationKey  // "miksi tämä sinulle" -selitteen avain (lib/idea-deck)
  image: string | null
  address?: string
  lat?: number
  lon?: number
  url?: string
  badge?: string
  time?: string
  minutesUntil?: number
  isFree?: boolean
  price?: string
  isOpen?: boolean
  buyable?: boolean   // "Osta liput" vain oikeaan lippukauppaan (lib/tickets)
  emoji: string
  eventRef?: Event
}

// ── Helpers ──────────────────────────────────────────────

function eventEmoji(event: Event): string {
  const text = [event.title, ...event.categories].join(' ').toLowerCase()
  if (/konsertti|keikka|musiikki/.test(text)) return '🎸'
  if (/teatteri|näytelmä|ooppera/.test(text)) return '🎭'
  if (/taide|galleria|näyttely/.test(text)) return '🎨'
  if (/urheilu|ottelu|jalkapallo|jääkiekko/.test(text)) return '⚽'
  if (/stand-up|komedia/.test(text)) return '🎤'
  if (/elokuv/.test(text)) return '🎬'
  if (/ruoka|viini/.test(text)) return '🍷'
  return '📅'
}

const CATEGORY_EMOJI: Partial<Record<ActivityCategory, string>> = {
  sauna: '🧖', museo: '🏛', nakopaikka: '🔭', galleria: '🖼',
  uimaranta: '🏖', markkina: '🛍', nahtavyys: '🌄', muu: '✨',
}

// Lokaalius + "illan juttu": Idea-deck suosii kokemuksellisia paikkoja joihin
// oikeasti lähdetään illalla — EI geneerisiä turistikohteita (kauppahalli, tori,
// tavallinen nähtävyys), jotka latistivat pakan. Saunat + näköalapaikat jäävät.
const SUPPLEMENTAL_CATS: ActivityCategory[] = ['sauna', 'nakopaikka']

const SUPPLEMENTAL_WHY: Partial<Record<ActivityCategory, { fi: string; en: string }>> = {
  sauna: { fi: 'Aito löyly ja rentoutuminen keskellä kaupunkia', en: 'Authentic Finnish sauna in the heart of the city' },
  nakopaikka: { fi: 'Näköala yli Helsingin', en: 'A view over Helsinki' },
}

function shuffle<T>(arr: T[]): T[] {
  const a = [...arr]
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]]
  }
  return a
}

// ── Päivävalinta: arpomiskone toimii muillekin päiville (omistaja 24.8.2026:
// "voi valita päivämäärän ... jos ei tiedä mitä haluaa tehdä"; UI = YKSI
// "Valitse päivämäärä" -nappi, ei chipsiriviä) ──────────────────────────────

const WD_FI = ['su', 'ma', 'ti', 'ke', 'to', 'pe', 'la']
const WD_EN = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']

function dayLabel(iso: string, todayIso: string, lang: string): string {
  if (iso === todayIso) return lang === 'en' ? 'Today' : 'Tänään'
  if (iso === addDays(todayIso, 1)) return lang === 'en' ? 'Tomorrow' : 'Huomenna'
  const d = new Date(`${iso}T12:00:00Z`)
  return `${(lang === 'en' ? WD_EN : WD_FI)[d.getUTCDay()]} ${d.getUTCDate()}.${d.getUTCMonth() + 1}.`
}

// ── Type visual meta ─────────────────────────────────────

const TYPE_META: Record<SuggestionType, { label: string; gradient: string; accent: string }> = {
  event:    { label: '📅 Tapahtuma',   gradient: 'linear-gradient(160deg,#1e1b4b,#4c1d95,#7c3aed)', accent: '#a78bfa' },
  activity: { label: '🧖 Aktiviteetti', gradient: 'linear-gradient(160deg,#042f2e,#065f46,#0f766e)', accent: '#2dd4bf' },
}

// ── Props ────────────────────────────────────────────────

interface Props {
  events: Event[]
  onShowOnMap?: (lat: number, lon: number, name: string, type?: 'event' | 'restaurant' | 'activity') => void
  onEventClick?: (event: Event) => void
}

// ── Component ────────────────────────────────────────────

export default function IdeaView({ events, onShowOnMap, onEventClick }: Props) {
  const { lang, t } = useLanguage()
  const { toggle, isFavorite } = useFavorites()

  const [seenIds, setSeenIds] = useState<Set<string>>(new Set())
  const [savedIds, setSavedIds] = useState<Set<string>>(new Set())
  const [detailSuggestion, setDetailSuggestion] = useState<Suggestion | null>(null)
  // Instantly hide card when panel opens — no competing animations
  const [cardHidden, setCardHidden] = useState(false)
  // rAF-based slide-in: panel is always in DOM when detailSuggestion is set
  // so the backdrop appears immediately (no gap between card-hide and backdrop)
  const [panelSlideIn, setPanelSlideIn] = useState(false)
  const panelCloseTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  // Swipe state — use refs for synchronous drag tracking (useState closures would lose updates)
  const [dragX, setDragX] = useState(0)
  const isDragging = useRef(false)
  const isHorizontalDrag = useRef(false)
  const dragStartX = useRef(0)
  const dragStartY = useRef(0)
  const cardRef = useRef<HTMLDivElement>(null)

  // Exit animation
  const [exitDir, setExitDir] = useState<'left' | 'right' | null>(null)

  const [activities, setActivities] = useState<Activity[]>([])

  useEffect(() => {
    fetch('/api/activities').then(r => r.json()).then(d => setActivities(d.activities ?? [])).catch(() => {})
  }, [])

  // ── Päivävalinta: tänään = propsien events; muut päivät haetaan itse ──
  const todayIso = helsinkiToday()
  const [ideaDate, setIdeaDate] = useState(todayIso)
  const [dateEvents, setDateEvents] = useState<Event[]>([])
  const [dateLoading, setDateLoading] = useState(false)
  const dateCache = useRef(new Map<string, Event[]>())

  useEffect(() => {
    if (ideaDate === todayIso) return
    const cached = dateCache.current.get(ideaDate)
    if (cached) { setDateEvents(cached); return }
    let alive = true
    setDateLoading(true)
    setDateEvents([])
    fetch(`/api/events?start=${ideaDate}&end=${ideaDate}&municipality=helsinki&page=1`)
      .then(r => r.json())
      .then(d => {
        if (!alive) return
        const evs: Event[] = d.events ?? []
        dateCache.current.set(ideaDate, evs)
        setDateEvents(evs)
      })
      .catch(() => { if (alive) setDateEvents([]) })
      .finally(() => { if (alive) setDateLoading(false) })
    return () => { alive = false }
  }, [ideaDate, todayIso])

  // Panel slide-in: double-rAF guarantees the browser paints translateY(100%)
  // before transitioning, eliminating the 1-2 frame flash on iOS Safari.
  useEffect(() => {
    if (!detailSuggestion) return
    const rafId = requestAnimationFrame(() =>
      requestAnimationFrame(() => setPanelSlideIn(true))
    )
    return () => cancelAnimationFrame(rafId)
  }, [detailSuggestion])

  // Close panel with slide-out animation, then unmount
  const closePanel = useCallback(() => {
    if (panelCloseTimer.current) clearTimeout(panelCloseTimer.current)
    setPanelSlideIn(false)
    panelCloseTimer.current = setTimeout(() => {
      setDetailSuggestion(null)
      setPanelSlideIn(false)
    }, 350)
  }, [])

  // ── Build pools ──────────────────────────────────────

  // ── Kohderyhmä- ja makutila (localStorage) ──
  // Kylmäkäynnistyskysely ("Minkälainen ilta?") POISTETTU 25.8.2026
  // (omistaja: "tätä ei kuuluisi olla ollenkaan") — pakka henkilökohtaistuu
  // pelkällä makumuistilla (recordClick) ja "ei tällaista" -demotioilla.
  // Aiemmin tallennetut scene-/perhevalinnat luetaan yhä (legacy-käyttäjät
  // pitävät painotuksensa), uutta asetus-UI:ta ei ole.
  const [ideaScenes, setIdeaScenes] = useState<IdeaSceneId[]>([])
  const [audience, setAudience] = useState<'default' | 'perhe'>('default')
  const [demoted, setDemoted] = useState<string[]>([])
  const [deviceId, setDeviceId] = useState('anon')

  useEffect(() => {
    // localStorage-luetaan ja setState kutsutaan vasta timeout-callbackissa
    // (React Compiler: ei synkronista setStateä efektissä).
    const t0 = setTimeout(() => {
      try {
        const scenes = JSON.parse(localStorage.getItem('idea-scenes') || '[]') as IdeaSceneId[]
        setIdeaScenes(Array.isArray(scenes) ? scenes : [])
        setAudience(localStorage.getItem('idea-audience') === 'perhe' ? 'perhe' : 'default')
        const dem = JSON.parse(localStorage.getItem('idea-demoted') || '[]')
        setDemoted(Array.isArray(dem) ? dem : [])
        let id = localStorage.getItem('idea-device-id')
        if (!id) { id = Math.random().toString(36).slice(2); localStorage.setItem('idea-device-id', id) }
        setDeviceId(id)
      } catch { /* privaattitila */ }
    }, 0)
    return () => clearTimeout(t0)
  }, [])

  const activityPool = useMemo((): Suggestion[] => {
    // Ohut kerros illan paikkoja (sauna/näköala/uimaranta) — satunnaisia,
    // EI staattista klassikko-listaa. Klassikot kuuluvat Tekemistä-välilehteen.
    return shuffle(
      activities.filter(a =>
        a.image &&
        SUPPLEMENTAL_CATS.includes(a.category)
      )
    )
      .slice(0, 8)
      .map(a => ({
        id: `activity-db-${a.id}`,
        type: 'activity' as const,
        title: a.name,
        // SUPPLEMENTAL_WHY ENSIN: OSM:n description on aina geneerinen kaksisanainen
        // luokkatunnus ("Julkinen sauna"), joka muuten peittäisi paremman tekstin
        // (ja näyttäisi suomea myös en-käyttäjille).
        why: (lang === 'en' ? SUPPLEMENTAL_WHY[a.category]?.en : SUPPLEMENTAL_WHY[a.category]?.fi)
          || a.description
          || (lang === 'en' ? 'A Helsinki favourite' : 'Helsinkiläinen suosikki'),
        image: a.image ?? null,
        address: a.address,
        lat: a.lat,
        lon: a.lon,
        url: a.www ?? undefined,
        badge: undefined,
        isFree: a.fee === false,
        isOpen: isOpenNow(a.openingHours),
        emoji: CATEGORY_EMOJI[a.category] ?? '✨',
      }))
  }, [activities, lang])

  // Tänään: HomeClientin jo hakemat tapahtumat; muu päivä: oma haku yllä.
  const sourceEvents = ideaDate === todayIso ? events : dateEvents

  // Kohderyhmärajaus (18–40): lapsi-, nuoriso-, seniori- ja käsityökerho-
  // tapahtumat eivät kuulu suosituksiin (lib/audience). Perhe-yleisön
  // valinnut käyttäjä on OPT-IN — hänelle lapsisisältö kuuluu pakkaan.
  const targetEvents = useMemo(
    () => (audience === 'perhe' ? sourceEvents : sourceEvents.filter((e) => !isOutsideTargetAudience(e))),
    [sourceEvents, audience],
  )

  const eventPool = useMemo((): Suggestion[] => {
    // Pakkamoottori (lib/idea-deck): kohderyhmäsuodatus, makumuisti, scenet,
    // seniori-alaskuopaus, siemen-jitteri (sama päivä+laite = sama pakka).
    // today-injektio rajaa pakan valittuun päivään (tulevat päivät: kaikki
    // päivän tapahtumat kelpaavat, nowMs-portit eivät karsi mitään).
    return buildIdeaDeck(targetEvents, {
      seed: `${ideaDate}-${deviceId}`,
      today: ideaDate,
      scenes: ideaScenes,
      audience,
      demoted,
      categoryScores: getCategoryScores(),
    }).map(s => ({
      id: `event-${s.event.id}`,
      type: 'event' as const,
      title: s.event.title,
      why: s.event.shortDescription || s.event.description || '',
      reason: s.reason ?? undefined,
      image: s.event.image,
      address: s.event.location?.name || s.event.location?.streetAddress,
      lat: s.event.location?.lat,
      lon: s.event.location?.lon,
      url: s.event.ticketUrl ?? s.event.infoUrl ?? undefined,
      isFree: s.event.isFree,
      buyable: canBuyTickets(s.event),
      price: s.event.price ?? undefined,
      time: new Date(s.event.startTime).toLocaleTimeString(lang === 'fi' ? 'fi-FI' : 'en-GB', { hour: '2-digit', minute: '2-digit' }),
      minutesUntil: s.minutesUntil,
      emoji: eventEmoji(s.event),
      eventRef: s.event,
    }))
  }, [targetEvents, lang, ideaScenes, audience, demoted, ideaDate, deviceId])

  const pool = useMemo(() => {
    // Paikkakortit (sauna/näköala) vain tänään — "● Auki nyt" ei kerro mitään
    // tulevasta lauantaista, eikä paikkoja pidä esittää päiväkohtaisina.
    const base = shuffle([...(ideaDate === todayIso ? activityPool : []), ...eventPool])
      .filter(s => !seenIds.has(s.id))
    // Kaistat (omistaja 25.8.: kulttuurikategoriat + festivaalit ENSIN, ei
    // turistikierroksia kärkeen — "Suomenlinna-kierros kuulostaa turisti-
    // hommalta"): 0-1 ykköskorin tapahtumat (pian alkavat ensin), 2 muut
    // tapahtumat, 3-5 paikat (avoinna → tuntematon → kiinni). Kuvallinen
    // nousee kaistan sisällä → ensimmäiset kortit näyttävät hyvältä.
    const score = (s: Suggestion) => {
      let band: number
      if (s.type === 'event') {
        const primary = s.eventRef ? isPrimaryPick(s.eventRef) : false
        band = primary ? ((s.minutesUntil !== undefined && s.minutesUntil <= 180) ? 0 : 1) : 2
      } else {
        band = s.isOpen === false ? 5 : s.isOpen === undefined ? 4 : 3
      }
      return band - (s.image ? 0.5 : 0)
    }
    return [...base].sort((a, b) => score(a) - score(b))
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activityPool.length, eventPool.length, seenIds, ideaDate])

  const current = pool[0] ?? null
  const meta = current ? TYPE_META[current.type] : TYPE_META.event

  // ── Swipe logic ──────────────────────────────────────

  const SWIPE_THRESHOLD = 80

  // Mouse / stylus only — Pointer Events with setPointerCapture are safe for non-touch.
  // Touch is handled separately below via native Touch Events to avoid the iOS Safari
  // bug where setPointerCapture + touchAction triggers immediate pointercancel.
  const onPointerDown = useCallback((e: React.PointerEvent) => {
    if (e.pointerType === 'touch') return
    dragStartX.current = e.clientX
    dragStartY.current = e.clientY
    isDragging.current = true
    isHorizontalDrag.current = false
    cardRef.current?.setPointerCapture(e.pointerId)
  }, [])

  const onPointerMove = useCallback((e: React.PointerEvent) => {
    if (e.pointerType === 'touch') return
    if (!isDragging.current) return
    setDragX(e.clientX - dragStartX.current)
  }, [])

  const commit = useCallback((dir: 'left' | 'right') => {
    if (!current) return
    const id = current.id
    const eventRef = current.eventRef
    const snap = current

    if (dir === 'right') {
      // Makumuisti: tykkääminen kirjataan kategorioittain (recordClick) —
      // pakka painottuu vastaisuudessa tämän mukaisesti.
      if (eventRef) recordClick(eventRef)
      // Reset drag + hide card immediately — no exitDir transform, no translateX(110%)
      // that would cause iOS Safari horizontal overflow and page zoom
      setDragX(0)
      setCardHidden(true)
      // Open panel in next rAF — identical to home page tap flow: single clean state update
      requestAnimationFrame(() => {
        if (eventRef && onEventClick) onEventClick(eventRef)
        else setDetailSuggestion(snap)
      })
      // Defer expensive FavoritesContext update until panel animation is already running
      setTimeout(() => {
        setSavedIds(s => new Set([...s, id]))
        if (eventRef) toggle(eventRef)
      }, 400)
      // Advance to next card after panel has opened
      setTimeout(() => {
        setSeenIds(s => new Set([...s, id]))
        setCardHidden(false)
      }, 380)
    } else {
      // "Ei tällaista": demota PYSYVÄSTI kortin vibe/kategoria (-4 pisteytyksessä),
      // ei vain ohita — käyttäjä kokee vaikutuksen heti seuraavilla korteilla.
      if (eventRef) {
        const vibes = getEventVibes(eventRef)
        const cats = eventRef.categories.map(c => c.toLowerCase())
        const keys = [...new Set([...vibes, ...cats])].slice(0, 3)
        setDemoted(prev => {
          const next = [...new Set([...prev, ...keys])].slice(0, 40)
          try { localStorage.setItem('idea-demoted', JSON.stringify(next)) } catch { /* privaattitila */ }
          return next
        })
      }
      setExitDir('left')
      setTimeout(() => {
        setSeenIds(s => new Set([...s, id]))
        setDragX(0)
        setExitDir(null)
      }, 220)
    }
  }, [current, toggle, onEventClick])

  // Mouse/stylus pointer up (touch handled by native touchend below)
  const onPointerUp = useCallback((e: React.PointerEvent) => {
    if (e.pointerType === 'touch') return
    if (!isDragging.current) return
    isDragging.current = false
    isHorizontalDrag.current = false
    const dx = e.clientX - dragStartX.current
    const dy = e.clientY - dragStartY.current
    if (Math.abs(dx) < 10 && Math.abs(dy) < 10) {
      if (current?.eventRef && onEventClick) onEventClick(current.eventRef)
      else if (current) setDetailSuggestion(current)
      setDragX(0)
      return
    }
    if (dx > SWIPE_THRESHOLD) commit('right')
    else if (dx < -SWIPE_THRESHOLD) commit('left')
    else setDragX(0)
  }, [commit, current, onEventClick])

  const onPointerCancel = useCallback(() => {
    isDragging.current = false
    isHorizontalDrag.current = false
    setDragX(0)
  }, [])

  // Touch gesture handler via native Touch Events.
  // Uses non-passive touchmove so we can call e.preventDefault() for horizontal drags,
  // blocking page scroll only when the user is swiping the card sideways.
  // Vertical gestures pass through unblocked — the browser scrolls the page normally.
  // Re-registers whenever the card changes (current.id changes → card remounts via key).
  useEffect(() => {
    const card = cardRef.current
    if (!card) return

    let startX = 0
    let startY = 0
    let dragging = false
    let horizontal = false

    const onTouchStart = (e: TouchEvent) => {
      const t = e.touches[0]
      startX = t.clientX
      startY = t.clientY
      dragStartX.current = startX
      dragStartY.current = startY
      dragging = true
      horizontal = false
      isDragging.current = true
      isHorizontalDrag.current = false
    }

    const onTouchMove = (e: TouchEvent) => {
      if (!dragging || e.touches.length !== 1) return
      const t = e.touches[0]
      const dx = t.clientX - startX
      const dy = t.clientY - startY
      if (!horizontal) {
        if (Math.abs(dx) < 5 && Math.abs(dy) < 5) return
        if (Math.abs(dy) >= Math.abs(dx)) {
          dragging = false
          isDragging.current = false
          setDragX(0)
          return
        }
        horizontal = true
        isHorizontalDrag.current = true
      }
      e.preventDefault()
      setDragX(dx)
    }

    const onTouchEnd = (e: TouchEvent) => {
      if (!dragging) return
      dragging = false
      horizontal = false
      isDragging.current = false
      isHorizontalDrag.current = false
      const t = e.changedTouches[0]
      const dx = t.clientX - startX
      const dy = t.clientY - startY
      if (Math.abs(dx) < 10 && Math.abs(dy) < 10) {
        if (current?.eventRef && onEventClick) onEventClick(current.eventRef)
        else if (current) setDetailSuggestion(current)
        setDragX(0)
        return
      }
      if (dx > SWIPE_THRESHOLD) commit('right')
      else if (dx < -SWIPE_THRESHOLD) commit('left')
      else setDragX(0)
    }

    const onTouchCancel = () => {
      dragging = false
      horizontal = false
      isDragging.current = false
      isHorizontalDrag.current = false
      setDragX(0)
    }

    card.addEventListener('touchstart', onTouchStart, { passive: true })
    card.addEventListener('touchmove', onTouchMove, { passive: false })
    card.addEventListener('touchend', onTouchEnd, { passive: true })
    card.addEventListener('touchcancel', onTouchCancel, { passive: true })

    return () => {
      card.removeEventListener('touchstart', onTouchStart)
      card.removeEventListener('touchmove', onTouchMove)
      card.removeEventListener('touchend', onTouchEnd)
      card.removeEventListener('touchcancel', onTouchCancel)
    }
  }, [current, commit, onEventClick])

  const handleSkip = useCallback(() => commit('left'), [commit])
  const handleSave = useCallback(() => commit('right'), [commit])

  // Card transform
  const cardTransform = exitDir === 'right'
    ? 'translateX(110%) rotate(12deg)'
    : exitDir === 'left'
    ? 'translateX(-110%) rotate(-12deg)'
    : `translateX(${dragX}px) rotate(${dragX * 0.04}deg)`

  const swipeOpacity = Math.min(Math.abs(dragX) / SWIPE_THRESHOLD, 1)
  const swipeRight = dragX > 20
  const swipeLeft = dragX < -20

  const savedCount = savedIds.size

  return (
    <>
    <main className="max-w-lg mx-auto px-4 pt-4 pb-28 space-y-4" style={{ overscrollBehavior: 'none' }}>

      {/* ── Header + päivävalinta — AINA näkyvissä, jotta päivää voi vaihtaa
          myös tyhjällä/loppuneella pakalla. ── */}
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-white/30 text-[11px] font-black uppercase tracking-[.2em] mb-0.5">
            HELSINKI · {dayLabel(ideaDate, todayIso, lang).toUpperCase()}
          </p>
          <h1 className="font-black text-white leading-none" style={{ fontSize: 'clamp(1.6rem,6vw,2.6rem)', letterSpacing: '-0.03em' }}>
            {t('idea.dont_know')}
          </h1>
          <p className="text-white/30 text-xs mt-1">
            {ideaDate === todayIso
              ? t('idea.tonight_all')
              : lang === 'en' ? 'Swipe through the day’s events' : 'Pyyhkäise päivän menot läpi'}
          </p>
        </div>
        {savedCount > 0 && (
          <div className="flex items-center gap-1.5 px-3 py-2 rounded-full shrink-0 mt-1"
            style={{ background: 'rgba(107,118,255,.12)', border: '1px solid rgba(107,118,255,.2)' }}>
            <Heart size={12} fill="#6b76ff" style={{ color: '#6b76ff' }} />
            <span className="text-[12px] font-black" style={{ color: '#6b76ff' }}>{savedCount}</span>
          </div>
        )}
      </div>

      {/* ── Päivävalinta: yksi nappi, kalenteri aukeaa (sama DatePicker kuin
          Tapahtumat-välilehdellä). Tyhjä arvo / kalenterin "Tyhjennä
          valinta" = takaisin tähän päivään. ── */}
      <div>
        <DatePicker
          value={ideaDate === todayIso ? '' : ideaDate}
          onChange={(v) => setIdeaDate(v && /^\d{4}-\d{2}-\d{2}$/.test(v) ? v : todayIso)}
          placeholder={lang === 'en' ? 'Pick a date' : 'Valitse päivämäärä'}
        />
      </div>

    {!current ? (
      <p className="flex items-center justify-center min-h-[30vh] text-white/25 text-sm">
        {(ideaDate === todayIso ? activities.length === 0 : dateLoading)
          ? t('idea.loading_suggestions')
          : t('idea.all_seen')}
      </p>
    ) : (
    <>

      {/* ── Swipeable card ── */}
      <div className="relative select-none" style={cardHidden ? { visibility: 'hidden' } : {}}>

        {/* Shadow card behind */}
        {pool.length > 1 && (
          <div className="absolute inset-x-3 bottom-0 top-2 rounded-3xl z-0"
            style={{ background: 'rgba(255,255,255,.04)', border: '1px solid rgba(255,255,255,.06)' }} />
        )}

        {/* Main card — pan-y lets browser handle vertical scroll; horizontal drag is captured once intent is confirmed */}
        <div key={current.id} ref={cardRef}
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
          onPointerCancel={onPointerCancel}
          className="relative z-10 rounded-3xl overflow-hidden cursor-grab active:cursor-grabbing"
          style={{
            touchAction: 'pan-y',
            border: '1px solid rgba(255,255,255,.1)',
            transform: cardTransform,
            // eslint-disable-next-line react-hooks/refs -- raahauksen lippu refissä tarkoituksella (ei turhia rendereitä); renderöinnin triggeröi swipe-tila
            transition: isDragging.current ? 'none' : 'transform 220ms cubic-bezier(.34,1.56,.64,1)',
            boxShadow: '0 24px 60px -20px rgba(0,0,0,.9)',
          }}>

          {/* Image / gradient */}
          <div className="relative w-full overflow-hidden" style={{ aspectRatio: '16/13' }}>
            <div className="absolute inset-0" style={{ background: meta.gradient }} />
            {current.image && (
              <>
                <img src={current.image} alt={current.title}
                  className="absolute inset-0 w-full h-full object-cover pointer-events-none"
                  onError={e => { (e.target as HTMLElement).style.display = 'none' }} />
                <div className="absolute inset-0" style={{ background: 'linear-gradient(to top,rgba(0,0,0,.85) 0%,rgba(0,0,0,.1) 55%,transparent 100%)' }} />
              </>
            )}
            {!current.image && (
              <div className="absolute inset-0 flex items-center justify-center"
                style={{ fontSize: '8rem', opacity: 0.18, filter: `drop-shadow(0 0 40px ${meta.accent})` }}>
                {current.emoji}
              </div>
            )}

            {/* Swipe overlays */}
            {swipeRight && (
              <div className="absolute inset-0 flex items-center justify-center pointer-events-none" style={{ opacity: swipeOpacity }}>
                <div className="flex flex-col items-center gap-2 bg-emerald-500/20 backdrop-blur-sm rounded-3xl px-8 py-6 border-2 border-emerald-400">
                  <Heart size={40} fill="#4ade80" style={{ color: '#4ade80' }} />
                  <span className="text-emerald-300 font-black text-xl">{t('idea.saved_overlay')}</span>
                </div>
              </div>
            )}
            {swipeLeft && (
              <div className="absolute inset-0 flex items-center justify-center pointer-events-none" style={{ opacity: swipeOpacity }}>
                <div className="flex flex-col items-center gap-2 bg-red-500/20 backdrop-blur-sm rounded-3xl px-8 py-6 border-2 border-red-400">
                  <X size={40} style={{ color: '#f87171' }} />
                  <span className="text-red-300 font-black text-xl">{t('idea.skipped')}</span>
                </div>
              </div>
            )}

            {/* Type badge (laskuri "X jäljellä" poistettu — se latisti korttia) */}
            <div className="absolute top-4 left-4">
              <span className="text-[11px] font-black px-2.5 py-1 rounded-full text-white/90 bg-black/40 backdrop-blur-sm">
                {current.type === 'event' ? t('idea.type_event') : current.type === 'activity' ? t('idea.type_activity') : t('idea.type_rest')}
              </span>
            </div>

            {/* Time indicator ("Alkaa X min") */}
            {current.minutesUntil !== undefined && current.minutesUntil >= 0 && current.minutesUntil < 240 && (
              <div className="absolute top-14 left-4">
                <span className="text-[11px] font-black px-2.5 py-1 rounded-full bg-amber-500/90 text-white">
                  ⏱ {t('idea.starts_in')} {current.minutesUntil < 60
                    ? `${current.minutesUntil} min`
                    : `${Math.round(current.minutesUntil / 60)} h`}
                </span>
              </div>
            )}

            {/* Open status */}
            {current.isOpen !== undefined && current.minutesUntil === undefined && (
              <div className="absolute top-14 left-4">
                <span className={`text-[11px] font-black px-2.5 py-1 rounded-full ${current.isOpen ? 'bg-emerald-500/90' : 'bg-white/20'} text-white`}>
                  {current.isOpen ? `● ${t('idea.open_now')}` : `○ ${t('common.closed')}`}
                </span>
              </div>
            )}

            {/* Free badge */}
            {current.isFree && (
              <div className="absolute top-4 right-4">
                <span className="text-[11px] font-black px-2.5 py-1 rounded-full bg-emerald-500 text-white">{t('common.free_badge')}</span>
              </div>
            )}

            {/* Bottom info overlay */}
            <div className="absolute bottom-0 left-0 right-0 p-5">
              {current.badge && (
                <span className="inline-block text-[10px] font-black px-2 py-0.5 rounded-full mb-2"
                  style={{ background: `${meta.accent}22`, color: meta.accent, border: `1px solid ${meta.accent}40` }}>
                  {current.badge}
                </span>
              )}
              {current.reason && (
                <p className="text-[11px] font-black mb-1.5" style={{ color: meta.accent }}>
                  ✦ {t(current.reason)}
                </p>
              )}
              <h2 className="font-black text-white text-2xl leading-tight mb-1" style={{ letterSpacing: '-0.02em' }}>
                {current.title}
              </h2>
              {current.time && (
                <p className="text-white/60 text-sm font-bold">
                  {dayLabel(ideaDate, todayIso, lang)} {current.time}{current.price ? ` · ${t('discover.tickets_from')} ${current.price}` : ''}
                </p>
              )}
              {current.address && (
                <p className="text-white/40 text-xs mt-0.5 flex items-center gap-1">
                  <MapPin size={10} className="shrink-0" /> {current.address}
                </p>
              )}
            </div>
          </div>

          {/* Card body */}
          <div className="bg-[#0d0d12] p-5 space-y-3">
            {/* Why */}
            <div className="rounded-xl p-3.5 space-y-1" style={{ background: `${meta.accent}0d`, border: `1px solid ${meta.accent}22` }}>
              <p className="text-[10px] font-black uppercase tracking-widest" style={{ color: `${meta.accent}88` }}>{t('idea.why_this')}</p>
              <p className="text-sm leading-relaxed font-medium line-clamp-3" style={{ color: meta.accent }}>{current.why}</p>
              {current.subWhy && (
                <p className="text-xs text-white/30 italic">{current.subWhy}</p>
              )}
            </div>

            {/* Links */}
            <div className="flex items-center gap-4 flex-wrap">
              {current.url && (
                <a href={/^https?:\/\//i.test(current.url) ? current.url : '#'} target="_blank" rel="noopener noreferrer"
                  onClick={() => track('external_click', { surface: 'idea', label: current.title })}
                  className="flex items-center gap-1.5 text-xs font-bold hover:opacity-80 transition-opacity"
                  style={{ color: '#a3abff' }}>
                  <Globe size={12} />
                  {current.buyable ? `${t('detail.buy_tickets')} →` : `${t('common.website')} →`}
                </a>
              )}
              {onShowOnMap && current.lat && current.lon && (
                <button onClick={() => onShowOnMap(current.lat!, current.lon!, current.title, current.type)}
                  className="flex items-center gap-1.5 text-xs font-bold text-teal-400/70 hover:text-teal-300 transition-colors">
                  <MapIcon size={12} /> {t('idea.on_map')}
                </button>
              )}
              {onEventClick && current.eventRef && (
                <button onClick={() => onEventClick(current.eventRef!)}
                  className="flex items-center gap-1.5 text-xs font-bold text-white/30 hover:text-white/60 transition-colors">
                  {t('common.more_info')} →
                </button>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* ── Action buttons ── */}
      <div className="flex items-center justify-center gap-5">
        {/* Skip */}
        <button onClick={handleSkip}
          className="w-16 h-16 rounded-full flex items-center justify-center transition-all active:scale-90 hover:scale-105"
          style={{ background: 'rgba(248,113,113,.12)', border: '2px solid rgba(248,113,113,.3)' }}>
          <X size={24} style={{ color: '#f87171' }} />
        </button>

        {/* Save */}
        <button onClick={handleSave}
          className="w-20 h-20 rounded-full flex items-center justify-center transition-all active:scale-90 hover:scale-105 shadow-lg"
          style={{
            background: savedIds.has(current.id)
              ? 'linear-gradient(150deg,#6b76ff,#5059e6)'
              : 'rgba(107,118,255,.12)',
            border: '2px solid rgba(107,118,255,.4)',
            boxShadow: savedIds.has(current.id) ? '0 8px 24px -8px rgba(91,101,230,.8)' : 'none',
          }}>
          <Heart size={28} fill={savedIds.has(current.id) ? '#fff' : 'none'} style={{ color: savedIds.has(current.id) ? '#fff' : '#6b76ff' }} />
        </button>

        {/* Link / tickets */}
        {current.url ? (
          <a href={/^https?:\/\//i.test(current.url) ? current.url : '#'} target="_blank" rel="noopener noreferrer"
            onClick={() => track('external_click', { surface: 'idea', label: current.title })}
            className="w-16 h-16 rounded-full flex items-center justify-center transition-all active:scale-90 hover:scale-105"
            style={{ background: 'rgba(250,146,60,.12)', border: '2px solid rgba(250,146,60,.3)' }}>
            <Clock size={22} style={{ color: '#fb923c' }} />
          </a>
        ) : (
          <div className="w-16 h-16 rounded-full flex items-center justify-center opacity-20"
            style={{ background: 'rgba(255,255,255,.05)', border: '2px solid rgba(255,255,255,.1)' }}>
            <Clock size={22} className="text-white/40" />
          </div>
        )}
      </div>

      {/* Swipe hint */}
      <p className="text-center text-white/20 text-[11px] font-bold">
        {t('idea.swipe_hint')}
      </p>

    </>
    )}
    </main>

    {/* ── Detail panel (activities / restaurants) ── */}
    {detailSuggestion && (() => {
      const d = detailSuggestion
      const m = TYPE_META[d.type]
      return (
        <div className="fixed inset-0 z-50 flex items-end"
          onClick={closePanel}>

          {/* Dark backdrop — no blur, instant */}
          <div className="absolute inset-0 bg-black/80" />

          {/*
            Outer: ONLY transform animation — no overflow, no scroll.
            Separating the animated layer from the scroll container is critical
            on iOS Safari: transform + overflow-y on the same element causes jank.
            The double-rAF in useEffect guarantees this element is painted at
            translateY(100%) before the transition starts, eliminating the flash.
          */}
          <div
            className="relative w-full max-w-lg mx-auto rounded-t-3xl overflow-hidden"
            style={{
              transform: panelSlideIn ? 'translateY(0)' : 'translateY(100%)',
              transition: 'transform 340ms cubic-bezier(0.32,0.72,0,1)',
              willChange: 'transform',
            }}
            onClick={e => e.stopPropagation()}>

            {/* Inner: scrollable content — no transform here */}
            <div style={{ background: '#12121a', border: '1px solid rgba(255,255,255,.12)', maxHeight: '82vh', overflowY: 'auto' }}>

              {/* Header image */}
              <div className="relative w-full shrink-0" style={{ aspectRatio: '16/9' }}>
                <div className="absolute inset-0" style={{ background: m.gradient }} />
                {d.image ? (
                  <>
                    <img src={d.image} alt={d.title}
                      className="absolute inset-0 w-full h-full object-cover"
                      onError={e => { (e.target as HTMLElement).style.display = 'none' }} />
                    <div className="absolute inset-0" style={{ background: 'linear-gradient(to top,rgba(0,0,0,.8),transparent 60%)' }} />
                  </>
                ) : (
                  <div className="absolute inset-0 flex items-center justify-center"
                    style={{ fontSize: '5rem', opacity: 0.2 }}>
                    {d.emoji}
                  </div>
                )}

                {/* Close */}
                <button onClick={closePanel}
                  className="absolute top-4 right-4 w-10 h-10 rounded-full flex items-center justify-center"
                  style={{ background: 'rgba(0,0,0,.6)' }}>
                  <X size={18} className="text-white" />
                </button>

                {/* Saved badge */}
                {savedIds.has(d.id) && (
                  <div className="absolute top-4 left-4 flex items-center gap-1.5 px-3 py-1.5 rounded-full"
                    style={{ background: 'linear-gradient(150deg,#6b76ff,#5059e6)' }}>
                    <Heart size={12} fill="white" className="text-white" />
                    <span className="text-white text-[11px] font-black">{t('detail.saved')}</span>
                  </div>
                )}

                {/* Title */}
                <div className="absolute bottom-0 left-0 right-0 p-5">
                  <h2 className="font-black text-white text-2xl leading-tight" style={{ letterSpacing: '-0.02em' }}>
                    {d.title}
                  </h2>
                </div>
              </div>

              {/* Body */}
              <div className="p-5 space-y-4">
                {/* Why */}
                <div className="rounded-xl p-4 space-y-1.5"
                  style={{ background: `${m.accent}0d`, border: `1px solid ${m.accent}22` }}>
                  <p className="text-[10px] font-black uppercase tracking-widest" style={{ color: `${m.accent}88` }}>
                    {t('idea.why_this')}
                  </p>
                  <p className="text-sm leading-relaxed font-medium" style={{ color: m.accent }}>
                    {d.why}
                  </p>
                  {d.subWhy && (
                    <p className="text-xs text-white/40 italic">{d.subWhy}</p>
                  )}
                </div>

                {/* Info chips */}
                <div className="flex flex-wrap gap-2">
                  {d.isOpen !== undefined && (
                    <span className={`text-[11px] font-black px-3 py-1.5 rounded-full ${d.isOpen ? 'bg-emerald-500/20 text-emerald-300' : 'bg-white/10 text-white/40'}`}>
                      {d.isOpen ? `● ${t('idea.open_now')}` : `○ ${t('common.closed')}`}
                    </span>
                  )}
                  {d.isFree && (
                    <span className="text-[11px] font-black px-3 py-1.5 rounded-full bg-emerald-500/20 text-emerald-300">
                      {t('common.free_badge')}
                    </span>
                  )}
                  {!d.isFree && d.price && (
                    <span className="text-[11px] font-black px-3 py-1.5 rounded-full bg-white/10 text-white/50">
                      {d.price}
                    </span>
                  )}
                  {d.badge && (
                    <span className="text-[11px] font-black px-3 py-1.5 rounded-full"
                      style={{ background: `${m.accent}22`, color: m.accent }}>
                      {d.badge}
                    </span>
                  )}
                </div>

                {/* Address */}
                {d.address && (
                  <div className="flex items-start gap-2">
                    <MapPin size={14} className="text-white/30 mt-0.5 shrink-0" />
                    <p className="text-sm text-white/50">{d.address}</p>
                  </div>
                )}

                {/* Time */}
                {d.time && (
                  <div className="flex items-center gap-2">
                    <Clock size={14} className="text-white/30 shrink-0" />
                    <p className="text-sm text-white/50">{dayLabel(ideaDate, todayIso, lang)} {d.time}</p>
                  </div>
                )}

                {/* CTA buttons */}
                <div className="flex flex-col gap-2 pt-1 pb-2">
                  {d.url && (
                    <a href={/^https?:\/\//i.test(d.url) ? d.url : '#'} target="_blank" rel="noopener noreferrer"
                      onClick={() => track('external_click', { surface: 'idea', label: d.title })}
                      className="flex items-center justify-center gap-2 py-3.5 rounded-xl font-black text-sm text-white"
                      style={{ background: 'linear-gradient(150deg,#6b76ff,#5059e6)' }}>
                      <Globe size={15} />
                      {d.buyable ? t('detail.buy_tickets') : t('common.website')}
                    </a>
                  )}
                  {onShowOnMap && d.lat && d.lon && (
                    <button
                      onClick={() => { closePanel(); onShowOnMap(d.lat!, d.lon!, d.title, d.type) }}
                      className="flex items-center justify-center gap-2 py-3.5 rounded-xl font-black text-sm text-white/60"
                      style={{ background: 'rgba(255,255,255,.06)', border: '1px solid rgba(255,255,255,.1)' }}>
                      <MapIcon size={15} />
                      {t('common.show_on_map')}
                    </button>
                  )}
                </div>
              </div>

            </div>{/* /inner scrollable */}
          </div>{/* /animated outer */}
        </div>
      )
    })()}

    </>
  )
}

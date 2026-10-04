'use client'

import { useState, useEffect, useMemo, useCallback, useRef } from 'react'
import { Globe, MapPin, Map as MapIcon, Heart, X, Clock } from 'lucide-react'
import type { Event, Activity, ActivityCategory } from '@/lib/types'
import { track } from '@/lib/track'
import { useLanguage } from '@/contexts/LanguageContext'
import type { TranslationKey } from '@/lib/i18n'
import { isOpenNow } from '@/lib/opening-hours'
import { helsinkiToday, helsinkiDateOf } from '@/lib/helsinki-time'
import { stripPriceFromPrefix, tuntematonAika } from '@/lib/utils'
import { addDays } from '@/lib/arvo-ilta'
import { buildIdeaDeck, usefulWhy, type IdeaSceneId } from '@/lib/idea-deck'
import { recordClick, getCategoryScores } from '@/lib/preferences'
import { lisaaKiinnostava, poistaKiinnostava, siivoaKiinnostavat, lueKiinnostavat, tallennaKiinnostavat, KIINNOSTAVAT_ELEMENTTI_ID, type Kiinnostava } from '@/lib/kiinnostavat'
import { naytaToast } from '@/lib/toast'
import { isOutsideTargetAudience, isPrimaryPick } from '@/lib/audience'
import { canBuyTickets } from '@/lib/tickets'
import DatePicker from '@/components/DatePicker'
import { useDialogiFokus } from '@/hooks/useDialogiFokus'
import { useTaaksepain } from '@/hooks/useTaaksepain'

// Idea-sivu 8/2026: käsin kuratoitu 13 klassikkoa POISTETTU (asiakkaat huomasivat
// toiston) — pakka on nyt tapahtumakeskeinen: tämän päivän tapahtumat
// kohderyhmäsuodatuksella (vauva/perhe pois oletuksena, seniori alas),
// makumuistilla ja cold-start-sceneilla painotettuna (lib/idea-deck.ts).
//
// 28.9.2026 (omistaja): Tinder-pyyhkäisy POISTETTU. Yksi idea kerrallaan ja
// kaksi nappia: "Seuraava" (pelkkä ohitus, EI opeta makua) ja "Kiinnostaa"
// (makumuisti + kohde kertyy sivun omaan Kiinnostavat-listaan, lib/kiinnostavat).
// Kiinnostava EI mene suosikiksi: listalta avataan kortti, ja suosikkiin tai
// suunnitelmaan käyttäjä lisää sen itse. Kortin napautus avaa kortin.
//
// 4.10.2026 (omistaja: "napit samassa näkymässä kuin tapahtuman kuva, ei
// tarvitse vierittää"): mobiilissa napit ovat KIINTEÄSSÄ rivissä alanavin
// päällä, yläosa on tiivis (pienempi otsikko + 📅-chip samalla rivillä) ja
// kuvan korkeus rajataan svh:n mukaan niin, että kuva mahtuu kokonaan
// nappirivin yläpuolelle. "Kiinnostaa" kuittaa toastilla, koska lista on
// nappirivin alla ruudun ulkopuolella. Työpöytä ennallaan (md:-luokat).

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

/** Mobiilin kiinteän nappirivin korkeus: 56 px napit + 2 × 12 px pehmuste.
 *  Toast nostetaan tämän verran, ettei se peitä nappeja. */
const NAPPIRIVI_PX = 80

// ── Props ────────────────────────────────────────────────

interface Props {
  events: Event[]
  onShowOnMap?: (lat: number, lon: number, name: string, type?: 'event' | 'restaurant' | 'activity') => void
  onEventClick?: (event: Event) => void
}

// ── Component ────────────────────────────────────────────

export default function IdeaView({ events, onShowOnMap, onEventClick }: Props) {
  const { lang, t } = useLanguage()
  const [seenIds, setSeenIds] = useState<Set<string>>(new Set())
  /** "Kiinnostaa"-lista (laitteella, lib/kiinnostavat) — ei suosikki. */
  const [kiinnostavat, setKiinnostavat] = useState<Kiinnostava<Suggestion>[]>([])
  const [detailSuggestion, setDetailSuggestion] = useState<Suggestion | null>(null)
  // rAF-based slide-in: panel is always in DOM when detailSuggestion is set
  // so the backdrop appears immediately (no gap between card-hide and backdrop)
  const [panelSlideIn, setPanelSlideIn] = useState(false)
  const panelCloseTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const detailPanelRef = useRef<HTMLDivElement>(null)

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

  // Fokus paneeliin + Escape + Tab-loukku + palautus (auditointi 5.9.2026).
  // Kutsutaan alla closePanel-määrittelyn jälkeen.
  // Close panel with slide-out animation, then unmount
  const closePanel = useCallback(() => {
    if (panelCloseTimer.current) clearTimeout(panelCloseTimer.current)
    setPanelSlideIn(false)
    panelCloseTimer.current = setTimeout(() => {
      setDetailSuggestion(null)
      setPanelSlideIn(false)
    }, 350)
  }, [])
  useDialogiFokus(!!detailSuggestion, detailPanelRef, closePanel)
  useTaaksepain(!!detailSuggestion, closePanel)

  // ── Build pools ──────────────────────────────────────

  // ── Kohderyhmä- ja makutila (localStorage) ──
  // Kylmäkäynnistyskysely ("Minkälainen ilta?") POISTETTU 25.8.2026
  // (omistaja: "tätä ei kuuluisi olla ollenkaan") — pakka henkilökohtaistuu
  // pelkällä makumuistilla (recordClick). "Ei tällaista" -demotiot POISTETTU
  // 28.9.2026 (ohitus ei opeta makua) — vanha idea-demoted-avain siivotaan.
  // Aiemmin tallennetut scene-/perhevalinnat luetaan yhä (legacy-käyttäjät
  // pitävät painotuksensa), uutta asetus-UI:ta ei ole.
  const [ideaScenes, setIdeaScenes] = useState<IdeaSceneId[]>([])
  const [audience, setAudience] = useState<'default' | 'perhe'>('default')
  const [deviceId, setDeviceId] = useState('anon')

  useEffect(() => {
    // localStorage-luetaan ja setState kutsutaan vasta timeout-callbackissa
    // (React Compiler: ei synkronista setStateä efektissä).
    const t0 = setTimeout(() => {
      try {
        const scenes = JSON.parse(localStorage.getItem('idea-scenes') || '[]') as IdeaSceneId[]
        setIdeaScenes(Array.isArray(scenes) ? scenes : [])
        setAudience(localStorage.getItem('idea-audience') === 'perhe' ? 'perhe' : 'default')
        localStorage.removeItem('idea-demoted')
        setKiinnostavat(siivoaKiinnostavat(lueKiinnostavat<Suggestion>(localStorage), helsinkiToday()))
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
        SUPPLEMENTAL_CATS.includes(a.category) &&
        // Sama kohderyhmärajaus kuin tapahtumilla. Tällä hetkellä listalla on
        // vain saunoja ja näköalapaikkoja, joten tämä ei karsi mitään — mutta
        // ilman sitä listan laajentaminen päästäisi turisti- ja lapsikohteet
        // pakkaan huomaamatta, koska paikat eivät kulje buildIdeaDeckin läpi.
        !isOutsideTargetAudience({
          title: a.name,
          shortDescription: a.description,
          categories: [a.category],
        })
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
      categoryScores: getCategoryScores(),
    }).map(s => ({
      id: `event-${s.event.id}`,
      type: 'event' as const,
      title: s.event.title,
      // "Miksi juuri tämä?" näyttää vain aidosti hyödyllisen kuvauksen —
      // pelkkä osoite ("@ Öljysäiliö 468") tai muu roska ei KOSKAAN pääse
      // ruudulle (laatikko piilotetaan jos hyvää tekstiä ei ole).
      why: usefulWhy(s.event) ?? '',
      reason: s.reason ?? undefined,
      image: s.event.image,
      address: s.event.location?.name || s.event.location?.streetAddress,
      lat: s.event.location?.lat,
      lon: s.event.location?.lon,
      url: s.event.ticketUrl ?? s.event.infoUrl ?? undefined,
      isFree: s.event.isFree,
      buyable: canBuyTickets(s.event),
      price: s.event.price ?? undefined,
      time: tuntematonAika(s.event.startTime) ? '' : new Date(s.event.startTime).toLocaleTimeString(lang === 'fi' ? 'fi-FI' : 'en-GB', { hour: '2-digit', minute: '2-digit', timeZone: 'Europe/Helsinki' }),
      minutesUntil: s.minutesUntil,
      emoji: eventEmoji(s.event),
      eventRef: s.event,
    }))
  }, [targetEvents, lang, ideaScenes, audience, ideaDate, deviceId])

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

  // ── Toiminnot: EI eleitä (omistaja 28.9.2026: "poistetaan tinder-swaippaus") ──
  const tallenna = useCallback((lista: Kiinnostava<Suggestion>[]) => {
    setKiinnostavat(lista)
    try { tallennaKiinnostavat(localStorage, lista) } catch { /* privaattitila */ }
  }, [])
  /** "Seuraava": pelkkä ohitus — ei opeta makua, ei demotoi kategorioita. */
  const seuraava = useCallback(() => {
    if (!current) return
    const id = current.id
    setSeenIds((s) => new Set([...s, id]))
    // Mobiili: napit ovat kiinteässä rivissä, joten niitä voi painaa myös
    // kuvauksen tai Kiinnostavat-listan kohdalta vieritettynä. Uuden kortin
    // kuvan pitää silloin näkyä heti → takaisin sivun alkuun. Työpöydällä
    // napit ovat kortin alla eikä vieritys saa hyppiä.
    if (typeof window !== 'undefined' && window.scrollY > 0 && window.matchMedia('(max-width: 767.98px)').matches) {
      window.scrollTo({ top: 0, behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth' })
    }
  }, [current])
  /** "Kiinnostaa": makumuisti + Kiinnostavat-lista, sitten seuraava kortti.
   *  EI suosikkia — suosikkiin tai suunnitelmaan käyttäjä lisää kortista. */
  const kiinnostaa = useCallback(() => {
    if (!current) return
    if (current.eventRef) recordClick(current.eventRef)
    track('idea_interest', { surface: 'idea', eventId: current.eventRef?.id, label: current.title })
    const paiva = current.eventRef ? helsinkiDateOf(current.eventRef.startTime) : ideaDate
    tallenna(lisaaKiinnostava(kiinnostavat, current, paiva))
    // Palaute mobiilissa (ToastHost on md:hidden): kortti vaihtuu heti ja
    // lista on kiinteän nappirivin alla ruudun ulkopuolella, joten ilman
    // toastia tallennus jäisi näkymättömäksi. Näytä vierittää listaan.
    naytaToast({ teksti: t('idea.toast_lisatty'), nosto: NAPPIRIVI_PX, toiminto: { label: t('plan.toast_show'), tyyppi: 'nayta-kiinnostavat' } })
    seuraava()
  }, [current, kiinnostavat, tallenna, seuraava, ideaDate, t])
  const poista = useCallback((id: string) => tallenna(poistaKiinnostava(kiinnostavat, id)), [kiinnostavat, tallenna])
  /** Kortin avaus: tapahtumalle sovelluksen oikea paneeli, paikalle oma levite. */
  const avaa = useCallback((s: Suggestion) => {
    if (s.eventRef && onEventClick) onEventClick(s.eventRef)
    else setDetailSuggestion(s)
  }, [onEventClick])
  const listalla = !!current && kiinnostavat.some((k) => k.id === current.id)

  return (
    <>
    <main className="max-w-lg mx-auto px-4 pt-3 md:pt-4 pb-28 space-y-4" style={{ overscrollBehavior: 'none' }}>

      {/* ── Header + päivävalinta — AINA näkyvissä, jotta päivää voi vaihtaa
          myös tyhjällä/loppuneella pakalla. Mobiilissa (4.10.2026) yläosa on
          tiivis: pienempi otsikko ja 📅-chip samalla rivillä, jotta kortti
          alkaa ~60 px ylempää ja kuva mahtuu kiinteän nappirivin yläpuolelle. ── */}
      <div className="flex items-start justify-between gap-3">
        {/* mobiili-cq: otsikko skaalautuu sarakkeen mukaan (cqw) alle 768 px;
            flex-1 min-w-0 pakollinen, koska kontaineri ei anna omaa leveyttä. */}
        <div className="mobiili-cq flex-1 min-w-0">
          <p className="text-white/30 text-[11px] font-black uppercase tracking-[.2em] mb-0.5">
            HELSINKI · {dayLabel(ideaDate, todayIso, lang).toUpperCase()}
          </p>
          <h1 className="font-black text-white leading-none text-[clamp(1.3rem,6.5cqw,2.6rem)] md:text-[clamp(1.6rem,6vw,2.6rem)]" style={{ letterSpacing: '-0.03em' }}>
            {t('idea.dont_know')}
          </h1>
          <p className="text-white/30 text-xs mt-1">
            {ideaDate === todayIso
              ? t('idea.tonight_all')
              : t('idea.paivan_menot')}
          </p>
        </div>
        {/* Mobiili: sama 📅-chip kuin Tapahtumat-välilehden päivärivillä
            (44 × 44 px; valittu päivä laajentaa sen pilleriksi). Päivä lukee
            myös yllä HELSINKI · -rivillä. */}
        <div className="md:hidden shrink-0">
          <DatePicker
            chip
            value={ideaDate === todayIso ? '' : ideaDate}
            onChange={(v) => setIdeaDate(v && /^\d{4}-\d{2}-\d{2}$/.test(v) ? v : todayIso)}
          />
        </div>
      </div>

      {/* ── Työpöytä: päivävalinta omalla rivillään — yksi nappi, kalenteri
          aukeaa (sama DatePicker kuin Tapahtumat-välilehdellä). Tyhjä arvo /
          kalenterin "Tyhjennä valinta" = takaisin tähän päivään. ── */}
      <div className="hidden md:block">
        <DatePicker
          value={ideaDate === todayIso ? '' : ideaDate}
          onChange={(v) => setIdeaDate(v && /^\d{4}-\d{2}-\d{2}$/.test(v) ? v : todayIso)}
          placeholder={lang === 'en' ? 'Pick a date' : 'Valitse päivämäärä'}
        />
      </div>

    {!current ? (
      <div className="flex flex-col items-center justify-center gap-4 min-h-[30vh]">
        <p className="text-white/25 text-sm">
          {(ideaDate === todayIso ? activities.length === 0 : dateLoading)
            ? t('idea.loading_suggestions')
            : t('idea.all_seen')}
        </p>
        {/* "Seuraava"-napilla pakan päähän pääsee nopeasti — umpikujaa ei jätetä. */}
        {seenIds.size > 0 && !(ideaDate === todayIso ? activities.length === 0 : dateLoading) && (
          <button type="button" onClick={() => setSeenIds(new Set())}
            className="min-h-11 px-5 rounded-full font-black text-[14px] text-white/80 hover:bg-white/10 transition-colors"
            style={{ background: 'rgba(255,255,255,.06)', border: '1px solid rgba(255,255,255,.12)' }}>
            ↻ {t('idea.katso_uudelleen')}
          </button>
        )}
      </div>
    ) : (
    <>

      {/* ── Kortti: napautus avaa (ei eleitä). Sisäiset napit pysäyttävät
          kuplinnan, ettei "Kartalla" avaisi myös paneelia. ── */}
      <div className="relative">
        <div key={current.id}
          role="button" tabIndex={0}
          onClick={() => avaa(current)}
          onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); avaa(current) } }}
          aria-label={current.title}
          className="relative z-10 rounded-3xl overflow-hidden cursor-pointer animate-slide-up focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo-400"
          style={{
            border: '1px solid rgba(255,255,255,.1)',
            boxShadow: '0 24px 60px -20px rgba(0,0,0,.9)',
          }}>

          {/* Image / gradient. Mobiili: korkeus rajataan niin, että kuva
              mahtuu kokonaan otsikon ja kiinteän nappirivin väliin
              (100svh − yläpuoli 209 px [yläpalkki 121 + otsikko 60 + välit]
              − nappirivi 80 − alanavi 80 − 7 px − safe-area; mitattu 4.10.2026).
              Tavallisella puhelimella (svh ≈ 660) raja ≈ 16/13 eli ei muuta
              mitään. Alaraja 240 px: otsikkopeite (syy + 2–3-rivinen otsikko
              + aika + osoite) on 160–190 px eikä mahdu matalampaan ilman että
              se ajaa merkkien päälle — mitattu 180 px:llä SE:llä. SE (svh ≈
              550) vierittää siis ~60 px, muut eivät. svh eikä dvh: dvh
              muuttuu Safarin palkin piiloutuessa ja kuva hyppisi. */}
          <div className="relative w-full overflow-hidden max-h-[calc(100svh_-_376px_-_env(safe-area-inset-bottom,0px))] min-h-[240px] md:max-h-none md:min-h-0" style={{ aspectRatio: '16/13' }}>
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

            {/* Merkit vasemmalla ylhäällä. Mobiilissa YHDELLÄ rivillä (tyyppi +
                aika/aukiolo vierekkäin), jotta madalletussa kuvassa otsikko-
                peitteelle jää tilaa 44 px:stä alaspäin — kahdessa kerroksessa
                merkit ulottuivat 84 px:iin ja otsikko ajoi aikamerkin päälle
                (mitattu SE:llä 4.10.2026). Työpöydällä kääre on display:
                contents ja merkit ovat entisillä absoluuttisilla paikoillaan
                (top-4 / top-14) — pikselilleen ennallaan. */}
            <div className="absolute top-4 left-4 flex items-center gap-2 md:contents">
              {/* Type badge (laskuri "X jäljellä" poistettu — se latisti korttia) */}
              <div className="md:absolute md:top-4 md:left-4">
                <span className="text-[11px] font-black px-2.5 py-1 rounded-full text-white/90 bg-black/40 backdrop-blur-sm">
                  {current.type === 'event' ? t('idea.type_event') : current.type === 'activity' ? t('idea.type_activity') : t('idea.type_rest')}
                </span>
              </div>

              {/* Time indicator ("Alkaa X min") */}
              {current.minutesUntil !== undefined && current.minutesUntil >= 0 && current.minutesUntil < 240 && (
                <div className="md:absolute md:top-14 md:left-4">
                  <span className="text-[11px] font-black px-2.5 py-1 rounded-full bg-amber-500/90 text-white">
                    ⏱ {t('idea.starts_in')} {current.minutesUntil < 60
                      ? `${current.minutesUntil} min`
                      : `${Math.round(current.minutesUntil / 60)} h`}
                  </span>
                </div>
              )}

              {/* Open status */}
              {current.isOpen !== undefined && current.minutesUntil === undefined && (
                <div className="md:absolute md:top-14 md:left-4">
                  <span className={`text-[11px] font-black px-2.5 py-1 rounded-full ${current.isOpen ? 'bg-emerald-500/90' : 'bg-white/20'} text-white`}>
                    {current.isOpen ? `● ${t('idea.open_now')}` : `○ ${t('common.closed')}`}
                  </span>
                </div>
              )}
            </div>

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
              {/* Mobiilissa otsikko max 3 riviä ja aika/hinta max 2 riviä: lähteen
                  hintateksti voi olla kappaleen mittainen ("Liput alk. Alle 10-v.
                  lapset vapaa pääsy, Super Early Bird …, Maksutavat: …" = 5 riviä),
                  jolloin peite kasvoi 222 px:iin ja otsikko ajoi merkkien päälle
                  240 px:n kuvassa (mitattu tuotannosta SE:llä 4.10.2026). Koko
                  teksti näkyy kortin paneelissa. Työpöytä ennallaan. */}
              <h2 className="font-black text-white text-2xl leading-tight mb-1 line-clamp-3 md:line-clamp-none" style={{ letterSpacing: '-0.02em' }}>
                {current.title}
              </h2>
              {current.time && (
                <p className="text-white/60 text-sm font-bold line-clamp-2 md:line-clamp-none">
                  {dayLabel(ideaDate, todayIso, lang)} {current.time}{current.price ? ` · ${t('discover.tickets_from')} ${stripPriceFromPrefix(current.price)}` : ''}
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
            {/* Why — vain kun sisältö on aidosti hyödyllinen (usefulWhy).
                Tyhjä laatikko piilotetaan kokonaan: parempi ei laatikkoa kuin roskaa. */}
            {current.why && (
              <div className="rounded-xl p-3.5 space-y-1" style={{ background: `${meta.accent}0d`, border: `1px solid ${meta.accent}22` }}>
                <p className="text-[10px] font-black uppercase tracking-widest" style={{ color: `${meta.accent}88` }}>{t('idea.why_this')}</p>
                <p className="text-sm leading-relaxed font-medium line-clamp-3" style={{ color: meta.accent }}>{current.why}</p>
                {current.subWhy && (
                  <p className="text-xs text-white/30 italic">{current.subWhy}</p>
                )}
              </div>
            )}

            {/* Links */}
            <div className="flex items-center gap-4 flex-wrap">
              {current.url && (
                <a href={/^https?:\/\//i.test(current.url) ? current.url : '#'} target="_blank" rel="noopener noreferrer"
                  onClick={(e) => { e.stopPropagation(); track('external_click', { surface: 'idea', label: current.title }) }}
                  className="flex items-center gap-1.5 min-h-11 md:min-h-0 text-[14px] md:text-xs font-bold hover:opacity-80 transition-opacity"
                  style={{ color: '#a3abff' }}>
                  <Globe size={12} />
                  {current.buyable ? `${t('detail.buy_tickets')} →` : `${t('common.website')} →`}
                </a>
              )}
              {onShowOnMap && current.lat && current.lon && (
                <button onClick={(e) => { e.stopPropagation(); onShowOnMap(current.lat!, current.lon!, current.title, current.type) }}
                  className="flex items-center gap-1.5 min-h-11 md:min-h-0 text-[14px] md:text-xs font-bold text-teal-400/70 hover:text-teal-300 transition-colors">
                  <MapIcon size={12} /> {t('idea.on_map')}
                </button>
              )}
              {onEventClick && current.eventRef && (
                <button onClick={(e) => { e.stopPropagation(); onEventClick(current.eventRef!) }}
                  className="flex items-center gap-1.5 min-h-11 md:min-h-0 text-[14px] md:text-xs font-bold text-white/30 hover:text-white/60 transition-colors">
                  {t('common.more_info')} →
                </button>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* ── Kaksi nappia, ei eleitä. Mobiilissa rivi on KIINTEÄ alanavin
          (80 px + safe-area) päällä — sama tausta ja sumennus kuin navilla,
          56 px napit + 2 × 12 px pehmuste = 80 px (NAPPIRIVI_PX; mainin pb-28
          jättää sisällölle tilan sen alta). Sisäkääre toistaa mainin
          max-w-lg + px-4:n, jotta napit ovat täsmälleen kortin levyiset.
          mb-0: mainin space-y-4 antaisi kiinteälle riville margin-bottomin,
          joka nostaisi sen 16 px irti alanavista (mitattu 4.10.2026).
          Työpöydällä rivi on ennallaan kortin alla (md:static, mb-4 = space-y). ── */}
      <div className="fixed inset-x-0 bottom-[calc(80px_+_env(safe-area-inset-bottom,0px))] z-30 py-3 mb-0 md:mb-4 border-t border-white/7 bg-[rgba(10,10,12,.94)] backdrop-blur-[18px] md:static md:inset-x-auto md:bottom-auto md:z-auto md:py-0 md:border-0 md:bg-transparent md:backdrop-blur-none">
        <div className="max-w-lg mx-auto px-4 md:px-0 flex items-stretch gap-3">
          <button type="button" onClick={seuraava}
            className="flex-1 min-h-14 md:min-h-12 rounded-2xl font-black text-[16px] md:text-sm text-white/80 transition-all active:scale-[.98] hover:bg-white/10"
            style={{ background: 'rgba(255,255,255,.06)', border: '1px solid rgba(255,255,255,.12)' }}>
            {t('idea.seuraava')} →
          </button>
          <button type="button" onClick={listalla ? seuraava : kiinnostaa} aria-pressed={listalla}
            className="flex-[1.4] min-h-14 md:min-h-12 rounded-2xl font-black text-[16px] md:text-sm text-white flex items-center justify-center gap-2 transition-all active:scale-[.98]"
            style={listalla
              ? { background: 'rgba(107,118,255,.14)', border: '1px solid rgba(107,118,255,.35)', color: '#c7caff' }
              : { background: 'linear-gradient(150deg,#6b76ff,#5059e6)', boxShadow: '0 8px 24px -8px rgba(91,101,230,.8)' }}>
            {listalla ? <>✓ {t('idea.listalla')}</> : <><Heart size={18} /> {t('idea.kiinnostaa')}</>}
          </button>
        </div>
      </div>

    </>
    )}

      {/* ── Kiinnostavat: kertyy laitteelle, EI suosikkeihin. Rivin napautus
          avaa kortin (siellä ♥ ja "Lisää suunnitelmaan"), ✕ poistaa. ── */}
      {kiinnostavat.length > 0 ? (
        <section id={KIINNOSTAVAT_ELEMENTTI_ID} aria-label={t('idea.kiinnostavat')} className="space-y-2 pt-2 scroll-mt-32">
          <p className="text-white/40 text-[11px] font-black uppercase tracking-[.2em]">
            {t('idea.kiinnostavat')} · {kiinnostavat.length}
          </p>
          <ul className="space-y-2">
            {kiinnostavat.map((k) => (
              <li key={k.id} className="flex items-center gap-2 rounded-2xl pl-2 pr-1 py-1.5"
                style={{ background: 'rgba(255,255,255,.04)', border: '1px solid rgba(255,255,255,.08)' }}>
                <button type="button" onClick={() => avaa(k.kohde)}
                  className="flex-1 min-w-0 flex items-center gap-3 text-left min-h-12 rounded-xl">
                  <span className="w-12 h-12 rounded-xl overflow-hidden shrink-0 flex items-center justify-center text-2xl"
                    style={{ background: TYPE_META[k.kohde.type].gradient }}>
                    {k.kohde.image
                      ? <img src={k.kohde.image} alt="" className="w-full h-full object-cover"
                          onError={e => { (e.target as HTMLElement).style.display = 'none' }} />
                      : k.kohde.emoji}
                  </span>
                  <span className="min-w-0 flex flex-col">
                    <span className="text-white font-extrabold text-[15px] truncate">{k.kohde.title}</span>
                    <span className="text-white/45 text-[12px] font-semibold truncate">
                      {dayLabel(k.paiva, todayIso, lang)}{k.kohde.time ? ` ${k.kohde.time}` : ''}{k.kohde.address ? ` · ${k.kohde.address}` : ''}
                    </span>
                  </span>
                </button>
                <button type="button" onClick={() => poista(k.id)} aria-label={t('idea.poista_listalta')}
                  className="w-11 h-11 rounded-full flex items-center justify-center shrink-0 text-white/40 hover:text-white/80 hover:bg-white/10 transition-colors">
                  <X size={16} />
                </button>
              </li>
            ))}
          </ul>
        </section>
      ) : current ? (
        <p className="text-center text-white/25 text-[12px] font-semibold leading-relaxed px-4">
          {t('idea.kiinnostavat_vihje')}
        </p>
      ) : null}
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
            ref={detailPanelRef}
            role="dialog"
            aria-modal
            tabIndex={-1}
            aria-label={d.title}
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
                  className="absolute top-4 right-4 w-11 h-11 md:w-10 md:h-10 rounded-full flex items-center justify-center"
                  style={{ background: 'rgba(0,0,0,.6)' }}>
                  <X size={18} className="text-white" />
                </button>

                {/* Title */}
                <div className="absolute bottom-0 left-0 right-0 p-5">
                  <h2 className="font-black text-white text-2xl leading-tight" style={{ letterSpacing: '-0.02em' }}>
                    {d.title}
                  </h2>
                </div>
              </div>

              {/* Body */}
              <div className="p-5 space-y-4">
                {/* Why — vain kun hyödyllinen sisältö on olemassa (usefulWhy-suodatus) */}
                {d.why && (
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
                )}

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

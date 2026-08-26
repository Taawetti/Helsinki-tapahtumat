'use client'

import dynamic from 'next/dynamic'
import Link from 'next/link'
import { Fragment, useState, useCallback, useMemo, useEffect, useRef } from 'react'
import { Loader2, Heart, Bell, Plus, ChevronLeft } from 'lucide-react'
import { Event, Activity, Restaurant, DateFilter, PriceFilter, CATEGORIES, VIBES, NEIGHBORHOODS, NEIGHBORHOOD_INESSIVE } from '@/lib/types'
import { getEventVibes } from '@/lib/event-classify'
import { haversineKm, getDateRange, formatTime } from '@/lib/utils'
import { nightlifeScore, COMMUNITY_DAYTIME_REGEX, TERRACE_REGEX } from '@/lib/nightlife'
import { isOutsideTargetAudience, isPrimaryPick } from '@/lib/audience'
import { Logo } from '@/components/Logo'
import { canBuyTickets } from '@/lib/tickets'
import { useFavorites } from '@/contexts/FavoritesContext'
import { useEvents, preloadEventsCache } from '@/hooks/useEvents'
import { useTranslatedEvents } from '@/hooks/useTranslatedEvents'
import { useGeolocation } from '@/hooks/useGeolocation'
import { getCategoryScores } from '@/lib/preferences'
import EventCard from '@/components/EventCard'
import HeroSwiper from '@/components/HeroSwiper'
import EventDetailPanel from '@/components/EventDetailPanel'
import SearchBar from '@/components/SearchBar'
import PosterCard from '@/components/PosterCard'
import InstallBanner from '@/components/InstallBanner'
import VibePanel from '@/components/VibePanel'
import DatePicker from '@/components/DatePicker'
import EiTiedaModal, { EiTiedaMode } from '@/components/EiTiedaModal'
import GuideInlineView, { GUIDE_META, type GuideSlug, type GuidePayload } from '@/components/GuideInlineView'
import JarjestajaForm from '@/components/JarjestajaForm'
import LanguageSwitch from '@/components/LanguageSwitch'
import NewsletterBanner from '@/components/NewsletterBanner'
import { useLanguage } from '@/contexts/LanguageContext'
import type { TranslationKey } from '@/lib/i18n'
import { VENUE_PAGES } from '@/lib/venue-pages'
import { HELSINKI_NIGHTCLUBS } from '@/lib/helsinki-nightclubs'

const MapView = dynamic(() => import('@/components/MapView'), { ssr: false })
// Tab views are code-split: each only mounts when its tab is opened, so the
// ~250 KB opening_hours library (restaurants/activities/ideas) and the views
// themselves stay out of the initial bundle.
const RestaurantsView = dynamic(() => import('@/components/RestaurantsView'), { ssr: false })
const IdeaView = dynamic(() => import('@/components/IdeaView'), { ssr: false })
// Uutta Helsingissä välilehtenä — sama sisältö kuin /uutta-helsingissa-sivulla,
// mutta navigointi pysyy näkyvissä (omistajan linjaus)
const UuttaView = dynamic(() => import('@/components/UuttaView'), { ssr: false })

interface EmptyStateProps {
  keyword: string
  activeVibes: string[]
  activeCategories: string[]
  priceFilter: PriceFilter
  dateFilter: DateFilter
  onClear: () => void
  onDateChange: (d: DateFilter) => void
}

// ── Koti: kategoriaruudukon 8 laattaa (design 1-koti.png) ─────────────────
// tint = RGB-tripletti radial-hehkulle — korttien sävyt vaihtelevat tarkoituksella
const HOME_GRID_TILES: { id: string; tint: string }[] = [
  { id: 'keikka',      tint: '255,107,107' },
  { id: 'yoelama',     tint: '175,130,255' },
  { id: 'standup',     tint: '95,217,166'  },
  { id: 'urheilu',     tint: '95,150,255'  },
  { id: 'baari',       tint: '232,192,106' },
  { id: 'underground', tint: '160,160,190' },
  { id: 'teatteri',    tint: '175,130,255' },
  { id: 'taide',       tint: '232,192,106' },
]

function EmptyState({ keyword, activeVibes, activeCategories, priceFilter, dateFilter, onClear, onDateChange }: EmptyStateProps) {
  const { t } = useLanguage()
  const hasFilters = keyword || activeVibes.length > 0 || activeCategories.length > 0 || priceFilter !== 'all'
  const isNarrowDate = dateFilter === 'today' || dateFilter === 'tonight'

  let emoji = '🏙'
  let heading = t('discover.no_events')
  let sub = t('discover.no_events_sub')

  if (keyword) {
    emoji = '🔍'
    heading = `${t('discover.no_results')} "${keyword}"`
    sub = t('discover.no_results_sub')
  } else if (priceFilter === 'free' && isNarrowDate) {
    emoji = '🎁'
    heading = t('discover.no_free_today')
    sub = t('discover.no_free_today_sub')
  } else if (activeVibes.length > 0 || activeCategories.length > 0) {
    emoji = '🎯'
    heading = t('discover.no_filter_match')
    sub = t('discover.no_filter_sub')
  } else if (isNarrowDate) {
    emoji = '📅'
    heading = t('discover.quiet_today')
    sub = t('discover.quiet_sub')
  }

  return (
    <div className="flex flex-col items-center py-24 text-center gap-4">
      <span className="text-5xl">{emoji}</span>
      <div>
        <p className="text-white/50 font-bold text-base">{heading}</p>
        <p className="text-white/25 text-sm mt-1">{sub}</p>
      </div>
      <div className="flex flex-wrap justify-center gap-2 mt-1">
        {isNarrowDate && (
          <button
            onClick={() => onDateChange('week')}
            className="text-sm font-bold px-4 py-2 rounded-xl border border-white/10 text-white/50 hover:text-white hover:border-white/25 transition-all"
          >
            {t('discover.expand_week')}
          </button>
        )}
        {hasFilters && (
          <button
            onClick={onClear}
            className="text-sm font-bold px-4 py-2 rounded-xl border border-purple-500/30 text-purple-400/70 hover:text-purple-300 hover:border-purple-500/50 transition-all"
          >
            {t('common.clear_filters')}
          </button>
        )}
      </div>
    </div>
  )
}

// ── Event category helpers ────────────────────────────────
function matchesText(e: Event, pattern: RegExp): boolean {
  return pattern.test([e.title, e.shortDescription, ...e.categories].join(' ').toLowerCase())
}

// Finnish concept words → category/title terms that identify matching events.
// Needed because Linked Events full-text search is too permissive.
const KEYWORD_CONCEPTS: Record<string, string[]> = {
  keikka:      ['musiikki', 'keikka', 'konsertti', 'concert', 'live', 'rock', 'jazz', 'folk', 'pop', 'metal', 'festivaali', 'festival'],
  keikkoja:    ['musiikki', 'keikka', 'konsertti', 'concert', 'live', 'festivaali', 'festival'],
  livekeikka:  ['musiikki', 'keikka', 'konsertti', 'concert', 'live'],
  konsertti:   ['musiikki', 'keikka', 'konsertti', 'concert', 'klassinen', 'orkesteri', 'sinfonia'],
  konsertit:   ['musiikki', 'keikka', 'konsertti', 'concert', 'klassinen', 'orkesteri'],
  festivaali:  ['festivaali', 'festival', 'musiikki', 'keikka'],
}
const isSurprise = (e: Event) => matchesText(e, /sauna|melont|jooga|silent|pop.?up|taikur|sirkus|impro|flash|yömelont|saunavene/)
const isTerrace = (e: Event) => {
  const month = new Date().getMonth() + 1
  if (month < 6 || month > 8) return false
  return matchesText(e, TERRACE_REGEX)
}
function isAlkaaPian(e: Event): boolean {
  const ms = new Date(e.startTime).getTime() - Date.now()
  return ms > 0 && ms < 3 * 60 * 60 * 1000
}

type AppMode = 'discover' | 'idea' | 'map' | 'favorites' | 'restaurants' | 'uutta'
type ListStyle = 'feed' | 'grid'

interface PreloadedDateRange {
  start: string
  end: string
  events: Event[]
  total: number
}

// Module flag: the tonight seed parses Dates over the whole preloaded array,
// so run it once per page load instead of on every re-render.
let tonightSeeded = false

export default function HomeClient({
  preloadedData,
  initialGuide,
  initialGuideData,
  initialVibes,
  initialHood,
  initialPriceFilter,
  initialMode,
  initialDateFilter,
  heroAsHeading = true,
}: {
  /** SEO-sivu (esim. /saunat) avaa saman sovellusnäkymän kuin oppaan
   *  klikkaus etusivulla, mutta data on esiladattu palvelimella jotta
   *  Googlelle lähtevä HTML sisältää listan. Omistajan linjaus 26.8.2026:
   *  hakutuloksesta tuleva laskeutuu samaan näkymään ja voi jatkaa
   *  sovelluksen käyttöä normaalisti. */
  initialGuide?: GuideSlug
  initialGuideData?: GuidePayload
  /** Laskeutumissivu avaa sovelluksen valmiiksi tällä tunnelmasuodattimella
   *  (esim. /tapahtumat/keikka → 'keikka'). Sama tila kuin jos käyttäjä
   *  painaisi tunnelmasirua itse, joten hän voi jatkaa normaalisti: poistaa
   *  suodattimen, vaihtaa päivää tai hakea. */
  initialVibes?: string[]
  /** Kaupunginosasivu (esim. /tapahtumat/kallio) avaa sovelluksen valmiiksi
   *  tällä kaupunginosasuodattimella — sama tila kuin sirun painallus. */
  initialHood?: string | null
  /** Ilmaistapahtumien sivu avaa sovelluksen hintasuodatin päällä. */
  initialPriceFilter?: PriceFilter
  /** Laskeutumissivu voi avata sovelluksen muuhun kuin tapahtumanäkymään —
   *  /uutta-helsingissa avaa 'uutta'-välilehden, joka on sen sovellusvastine. */
  initialMode?: AppMode
  /** Laskeutumissivun päiväikkuna. Kategoriasivut käyttävät 'week':iä eivätkä
   *  oletusta 'today', koska kapealla tunnelmalla (esim. työpaja) yksi päivä on
   *  usein tyhjä ja laskeutuja näkisi tyhjän näkymän. Viikko on jo esiladattu
   *  eikä siitä tule lisäkuormaa. */
  initialDateFilter?: DateFilter
  /** Laskeutumissivu tuo OMAN h1:nsä (esim. "Saunat Helsingissä"), joten
   *  sovelluksen koristeellinen kaupunkiotsikko ei saa olla h1 — muuten
   *  jokaisen laskeutumissivun vahvin otsikkosignaali Googlelle olisi sama
   *  sana "HELSINKI" ja 50 sivua näyttäisi keskenään samalta. Mitattu
   *  26.8.2026: /saunat tuotti kaksi h1:tä, joista ensimmäinen oli HELSINKI.
   *  Etusivulla otsikko on aito h1 eikä tähän kosketa. */
  heroAsHeading?: boolean
  preloadedData: {
    today: PreloadedDateRange
    tomorrow: PreloadedDateRange
    weekend: PreloadedDateRange
    week: PreloadedDateRange
  }
}) {
  // Pre-seed in-memory cache for today/tomorrow/weekend/week.
  // Guard: compare server-computed dates (UTC on Vercel) with client local dates.
  // If they mismatch (Helsinki midnight–3 AM window, UTC+3 vs UTC), skip that filter —
  // it falls through to the normal two-phase fetch automatically.
  // Seeds are marked STALE on purpose: they are a LinkedEvents-only slice (and
  // the upstream feed is flaky), so the full 40-source fan-out must always
  // revalidate in the background. A "fresh" seed used to skip that entirely,
  // leaving users stuck on partial data with no freshness badge and no way
  // to tell anything was missing.
  for (const [filter, data] of [
    ['today',    preloadedData.today],
    ['tomorrow', preloadedData.tomorrow],
    ['weekend',  preloadedData.weekend],
    ['week',     preloadedData.week],
  ] as [DateFilter, PreloadedDateRange][]) {
    if (data.events.length === 0) continue
    const localRange = getDateRange(filter)
    if (localRange.start === data.start && localRange.end === data.end) {
      preloadEventsCache(
        new URLSearchParams({ start: data.start, end: data.end, page: '1', municipality: 'helsinki' }).toString(),
        data.events,
        data.total,
        // eslint-disable-next-line react-hooks/purity -- tahmean cache-siemenen aikaleima lasketaan tarkoituksella renderissä ennen ekaa paintia
        Date.now() - 6 * 60 * 1000,
      )
    }
  }
  // Seed 'tonight' from today's preloaded data — same day filtered by the 17:00
  // cutoff, so the evening default paints instantly. Seeded deliberately stale:
  // the full 40-source fan-out revalidates in the background right away, since
  // the preloaded set is LinkedEvents-only and misses the nightlife long tail.
  // Client-only + once per load: avoids per-render Date parsing and keeps the
  // server-side module cache untouched.
  if (typeof window !== 'undefined' && !tonightSeeded && preloadedData.today.events.length > 0) {
    // eslint-disable-next-line react-hooks/globals -- "kerran per lataus" -vahti: refiä ei saa kirjoittaa renderissä ja efekti ehtisi ekan paintin jälkeen
    tonightSeeded = true
    const tonightRange = getDateRange('tonight')
    if (tonightRange.startAfter && tonightRange.start === preloadedData.today.start && tonightRange.end === preloadedData.today.end) {
      const cutoff = new Date(tonightRange.startAfter).getTime()
      const tonightEvents = preloadedData.today.events.filter(e => new Date(e.startTime).getTime() >= cutoff)
      if (tonightEvents.length > 0) {
        const tonightParams = new URLSearchParams({ start: tonightRange.start, end: tonightRange.end, page: '1', municipality: 'helsinki' })
        tonightParams.set('startAfter', tonightRange.startAfter)
        // eslint-disable-next-line react-hooks/purity -- tahmean cache-siemenen aikaleima lasketaan tarkoituksella renderissä ennen ekaa paintia
        preloadEventsCache(tonightParams.toString(), tonightEvents, tonightEvents.length, Date.now() - 6 * 60 * 1000)
      }
    }
  }
  const { lang, t } = useLanguage()
  const { favorites, count: favCount } = useFavorites()
  const [mode, setMode] = useState<AppMode>(initialMode ?? 'discover')
  // Kartta/Suosikit ovat "toisen tason" sivuja (yläpalkin pyöreät napit) —
  // ‹-paluunappi palaa sivulle jolta tultiin
  const [pageBack, setPageBack] = useState<AppMode>('discover')
  const [dateFilter, setDateFilter] = useState<DateFilter>(initialDateFilter ?? 'today')
  // Päivärivin rullaus. Laskeutumissivu voi avata muun kuin ensimmäisen päivän
  // (esim. /tapahtumat/keikka → 'week'), ja rivi on kapealla ruudulla leveämpi
  // kuin näkymä: mitattu 26.8.2026 iPhone-leveydellä rivi 712 px, näkymä 420 px,
  // joten valittu "Viikko" jäi oikealle näkymättömiin. Laskeutuja näki rivin
  // jossa MIKÄÄN ei ollut valittuna — se näyttää rikkinäiseltä, vaikka suodatin
  // oli päällä. Rullataan valittu näkyviin kerran mountissa; käyttäjän omat
  // valinnat eivät rullaa riviä, koska hän näkee jo painamansa sirun.
  const dateStripRef = useRef<HTMLDivElement | null>(null)
  useEffect(() => {
    if (!initialDateFilter || initialDateFilter === 'today') return
    const strip = dateStripRef.current
    const active = strip?.querySelector<HTMLElement>('[data-active-date="1"]')
    if (!strip || !active) return
    // Suora scrollLeft eikä scrollIntoView: jälkimmäinen rullaisi myös sivua.
    strip.scrollLeft = Math.max(0, active.offsetLeft - (strip.clientWidth - active.offsetWidth) / 2)
  }, [initialDateFilter])
  const [municipality, setMunicipality] = useState('helsinki')
  const [activeCategories, setActiveCategories] = useState<string[]>([])
  const [activeVibes, setActiveVibes] = useState<string[]>(initialVibes ?? [])
  const [keyword, setKeyword] = useState('')
  const [listStyle, setListStyle] = useState<ListStyle>('feed')
  const [priceFilter, setPriceFilter] = useState<PriceFilter>(initialPriceFilter ?? 'all')
  const [selectedEvent, setSelectedEvent] = useState<Event | null>(null)
  const [showFilters, setShowFilters] = useState(false)
  const [mobileTab, setMobileTab] = useState<'discover' | 'idea' | 'map' | 'favorites' | 'restaurants' | 'uutta'>('discover')
  const [customDate, setCustomDate] = useState('')
  const [customDateEnd, setCustomDateEnd] = useState('')
  const [showEiTieda, setShowEiTieda] = useState(false)
  const [eiTiedaMode, setEiTiedaMode] = useState<EiTiedaMode>('general')
  const [showJarjestajaForm, setShowJarjestajaForm] = useState(false)
  const [showVibePanel, setShowVibePanel] = useState(false)
  // Kaupunginosavalikko etusivulla — footerin linkkilista siirrettiin tänne
  // näkyville (omistaja: "tuolta alhaalta pienellä kukaan ei käytä niitä")
  const [showHoodMenu, setShowHoodMenu] = useState(false)
  // Kaupunginosasuodatin: valinta EI vie erilliselle sivulle vaan suodattaa
  // tapahtumat tässä näkymässä ("Tapahtumat Kalliossa") — omistajan linjaus.
  const [hoodFilter, setHoodFilter] = useState<string | null>(initialHood ?? null)
  // Oppaat-valikko: vertikaalisivut (Saunat, Terassit…) eivät ansaitse omia
  // välilehtiä mutta footerissa niitä ei kukaan nähnyt — pilleri kategorioiden
  // alla on niiden koti.
  const [showGuideMenu, setShowGuideMenu] = useState(false)
  // Avoinna oleva opas ETUSIVUN SISÄLLÄ (omistaja 25.8.: oppaat eivät saa
  // viedä pois etusivunäkymästä — sama linjaus kuin kaupunginosilla).
  const [guideView, setGuideView] = useState<GuideSlug | null>(initialGuide ?? null)
  // Koti: avoinna oleva kategoria (ruudukko/aihepiirit) — null = etusivu
  const [koCat, setKoCat] = useState<string | null>(null)
  const sentinelRef = useRef<HTMLDivElement>(null)
  // Kategorian avaus/vaihto vie aina listan alkuun — muuten näkymä jää
  // etusivun scrollikohtaan ja lista aukeaa "puolesta välistä"
  useEffect(() => {
    if (koCat || guideView) window.scrollTo(0, 0)
  }, [koCat, guideView])

  // Välilehden vaihto (Tapahtumat → Idea/Ravintolat/Uutta/Kartta/Suosikit)
  // vie näkymän alkuun. Näkymät vaihtuvat samalla sivulla, joten ilman tätä
  // selaimen vierityskohta säilyy ja uusi välilehti aukeaa keskeltä tai
  // alalaidasta — mitattu mobiililla 25.8.2026.
  // prevMode-vertailu: EI scrollata mountissa, jottei selaimen palauttama
  // paluuvieritys (back-navigointi) mene rikki.
  const prevModeRef = useRef(mode)
  useEffect(() => {
    if (prevModeRef.current === mode) return
    prevModeRef.current = mode
    window.scrollTo(0, 0)
  }, [mode])

  // Ilta-painotus: illalla NOSTETAAN yökeikat kärkeen mutta EI rajata päivää —
  // oletus pysyy 'today' (koko päivä näkyvissä). Aiempi 'tonight'-automaatti
  // piilotti kaikki päiväsaikaan alkavat tapahtumat ja teki etusivusta tyhjän
  // näköisen. useEffect (ei initializer) → ei SSR/hydraatioristiriitaa.
  const [isEvening, setIsEvening] = useState(false)
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- kellonajan luku mountissa SSR-hydraatioristiriidan välttämiseksi (vrt. kommentti yllä)
    if (new Date().getHours() >= 17) setIsEvening(true)
  }, [])


  // ── Unified search: lazy-load activities + restaurants on first keystroke ──
  const [allActivities, setAllActivities] = useState<Activity[]>([])
  const [allRestaurants, setAllRestaurants] = useState<Restaurant[]>([])
  const searchDataLoaded = useRef(false)

  useEffect(() => {
    if (!keyword || searchDataLoaded.current) return
    searchDataLoaded.current = true
    fetch('/api/activities').then(r => r.json()).then(d => setAllActivities(d?.activities ?? [])).catch(() => {})
    fetch('/api/restaurants').then(r => r.json()).then(d => setAllRestaurants(d?.restaurants ?? [])).catch(() => {})
  }, [keyword])



  // "Paikan kaikki tapahtumat" — käytetään sekä tapahtumakortista että haun
  // keikkapaikkariviltä. KAIKKI TULEVAT, EI PÄIVÄSUODATINTA: kuukausi on
  // pisin ikkuna jonka lähteet hakevat, ja muut suodattimet nollataan.
  const showVenueEvents = useCallback((name: string) => {
    setSelectedEvent(null)
    setHoodFilter(null)
    setKeyword(name)
    setDateFilter('month')
    setActiveVibes([])
    setActiveCategories([])
    setPriceFilter('all')
    setMode('discover')
    setMobileTab('discover')
    setKoCat(null)
    window.scrollTo(0, 0)
  }, [])


  const [jumpToRestaurant, setJumpToRestaurant] = useState<{ id: string } | undefined>()

  const handleSelectRestaurant = useCallback((id: string) => {
    setKeyword('')
    setMode('restaurants')
    setMobileTab('restaurants')
    setJumpToRestaurant({ id })
  }, [])

  const [mapTarget, setMapTarget] = useState<{ lat: number; lon: number; name: string; type?: 'event' | 'restaurant' | 'activity' } | null>(null)
  const [pushEnabled, setPushEnabled] = useState(false)
  const geo = useGeolocation() // korttien etäisyyslaskuun (jos sijainti jo sallittu)

  const { events: rawEvents, loading, fetchingFull, error, hasMore, total, generatedAt, sources, loadMore } = useEvents({
    // Idea-näkymä on aina "tänään" — ei riipu Discoverin päivävalinnasta (muuten
    // esim. "Huomenna" tyhjentäisi Idea-deckin tapahtumat). Ei muuta tallennettua
    // dateFilteriä, joten Discoveriin palatessa käyttäjän valinta säilyy.
    // HAKU IRTI PÄIVÄVALINNASTA (omistaja 25.8.2026): hakusana katsoo 90 pv
    // eteenpäin, jotta artistin kaikki tulevat keikat löytyvät. Muuttaa VAIN
    // haun aikaikkunan — käyttäjän oma päivävalinta säilyy tilassa ja palaa
    // voimaan heti kun hakukenttä tyhjennetään.
    dateFilter: mode === 'map' ? 'month' : mode === 'idea' ? 'today' : keyword ? 'search' : dateFilter,
    customDate, customDateEnd, keyword, municipality, activeCategories, bbox: '',
    nearbyCoords: null,
  })

  // Tapahtumien OMA sisältö (otsikko, kuvaus) tulee lähteistä suomeksi, eikä
  // englanninkielistä vastinetta ole olemassa — mitattu LinkedEventsista, vain
  // 6 %:lla on name.en. Käännös tehdään siis itse ja välimuistitetaan.
  // Suomeksi tämä palauttaa listan koskemattomana. Kytkentä on tässä, koska
  // KAIKKI näkymät (kortit, kartta, Idea, infopaneeli) saavat tapahtumansa
  // tämän saman listan kautta.
  const events = useTranslatedEvents(rawEvents, lang)

  const localSearchHits = useMemo(() => {
    if (!keyword || keyword.length < 2) return { venues: [], activities: [], restaurants: [] }
    const kw = keyword.toLowerCase()
    // Hakuehdotusten omat lyhytmuodot kolmelle luokalle: cat.*-avaimet ovat
    // kartan/oppaiden yhteinen kategoriasanasto ('Näköalapaikka', 'Tori & halli',
    // 'Muu'), mutta hakurivi on aina käyttänyt tiiviimpiä muotoja. Omat avaimet
    // pitävät molemmat ennallaan.
    const ACT_LABEL: Record<string, string> = {
      sauna: `🧖 ${t('cat.sauna')}`, museo: `🏛 ${t('cat.museo')}`, nahtavyys: `🌄 ${t('cat.nahtavyys')}`,
      galleria: `🖼 ${t('cat.galleria')}`, nakopaikka: `🔭 ${t('search.act_nakopaikka')}`, uimaranta: `🏖 ${t('cat.uimaranta')}`,
      puisto: `🌳 ${t('cat.puisto')}`, markkina: `🛍 ${t('search.act_markkina')}`, urheilu: `⚽ ${t('cat.urheilu')}`, muu: `✨ ${t('search.act_muu')}`,
    }
    const REST_EMOJI: Record<string, string> = {
      ravintola: '🍽', kahvila: '☕', baari: '🍺', pikaruoka: '🍟', muu: '🍴',
    }
    // TAPAHTUMAPAIKAT: paikan nimen kirjoittaminen tarjoaa suoraan "selaa
    // paikan tapahtumia" (omistaja: ravintolaehdotus vei Bar Loosen kortille
    // eikä keikkoja päässyt katsomaan). Osumat ladatuista tapahtumista +
    // ohjelmasivullisista keikkapaikoista.
    const venueCounts = new Map<string, number>()
    for (const e of events) {
      const n = e.location?.name?.trim()
      if (n && n.toLowerCase().includes(kw)) venueCounts.set(n, (venueCounts.get(n) ?? 0) + 1)
    }
    // Tunnetut keikkapaikat myös ILMAN ladattuja tapahtumia: "tänään"-ikkuna
    // ei sisällä Bar Loosen torstain keikkaa, mutta rivin valinta avaa
    // kuukauden ikkunan jossa ne ovat (mitattu: ehdotus puuttui kokonaan).
    for (const v of [...VENUE_PAGES, ...HELSINKI_NIGHTCLUBS]) {
      if (v.name.toLowerCase().includes(kw) && ![...venueCounts.keys()].some((n) => n.toLowerCase() === v.name.toLowerCase())) {
        venueCounts.set(v.name, 0)
      }
    }
    const venues = [...venueCounts.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, 3)
      .map(([name, count]) => ({ id: name, name, sub: count > 0 ? `📅 ${count} ${t('discover.events_count')}` : t('search.venue_events') }))
    return {
      venues,
      activities: allActivities
        .filter(a => a.name.toLowerCase().includes(kw) || a.description?.toLowerCase().includes(kw))
        .slice(0, 4)
        .map(a => ({ id: a.id, name: a.name, sub: ACT_LABEL[a.category] ?? '✨' })),
      restaurants: allRestaurants
        .filter(r =>
          r.name.toLowerCase().includes(kw) ||
          r.description?.toLowerCase().includes(kw) ||
          r.cuisines?.some(c => c.toLowerCase().includes(kw))
        )
        .slice(0, 4)
        // description on Googlen/OSM:n raakateksti (usein suomeksi) — jätetään
        // sellaisenaan; vain PUUTTUVAN tilalle tulee käännetty tyyppinimi,
        // ei raakaa tunnistetta ('yokerho').
        .map(r => ({ id: r.id, name: r.name, sub: `${REST_EMOJI[r.type] ?? '🍴'} ${r.description || t(`rest.type.${r.type}`)}` })),
    }
  }, [keyword, allActivities, allRestaurants, events, t])

  const handleRangeChange = useCallback((start: string, end: string) => {
    setCustomDate(start)
    setCustomDateEnd(end)
    setDateFilter(start ? 'range' : 'today')
  }, [])

  // Infinite scroll — trigger loadMore when sentinel scrolls into view
  useEffect(() => {
    const el = sentinelRef.current
    if (!el) return
    const observer = new IntersectionObserver(
      ([entry]) => { if (entry.isIntersecting && hasMore && !loading) loadMore() },
      { rootMargin: '200px' }
    )
    observer.observe(el)
    return () => observer.disconnect()
  }, [hasMore, loading, loadMore])

  const handleVibeToggle = useCallback((id: string) => {
    if (id === 'kaikki') {
      // Toggle: if already active → back to default picks grid, else → list of all events
      setActiveVibes((prev) => prev.includes('kaikki') ? [] : ['kaikki'])
      return
    }
    // Selecting a specific vibe deselects 'kaikki'
    setActiveVibes((prev) => {
      const without = prev.filter((v) => v !== 'kaikki')
      return without.includes(id) ? without.filter((v) => v !== id) : [...without, id]
    })
    // Map "ilmainen" vibe to price filter
    if (id === 'ilmainen') {
      setPriceFilter((p) => p === 'free' ? 'all' : 'free')
    }
  }, [])

  const handleCategoryToggle = useCallback((id: string) => {
    setActiveCategories((prev) => prev.includes(id) ? prev.filter((c) => c !== id) : [...prev, id])
  }, [])

  const clearFilters = useCallback(() => {
    setActiveCategories([]); setActiveVibes([]); setKeyword('')
    setDateFilter('today'); setMunicipality('helsinki')
    setPriceFilter('all'); setCustomDate(''); setCustomDateEnd('')
    setKoCat(null) // palauta etusivulle, ei jää orpoa fokusnäkymää
  }, [])

  const handleShowOnMap = useCallback((lat: number, lon: number, name: string, type?: 'event' | 'restaurant' | 'activity') => {
    setMapTarget({ lat, lon, name, type })
    // Muista lähtösivu, jotta kartan ‹-paluunappi palaa oikeaan näkymään
    setMode((prev) => {
      if (prev !== 'map' && prev !== 'favorites') setPageBack(prev)
      return 'map'
    })
    setMobileTab('map')
  }, [])

  // Tekemistä-välilehti poistettiin (omistajan päätös) — haun
  // aktiviteettivalinta avaa paikan KARTALLA, jonne aktiviteettiselailu
  // muutenkin kuuluu. Data ja /api/activities säilyvät ennallaan.
  const handleSelectActivity = useCallback((id: string) => {
    setKeyword('')
    const a = allActivities.find((x) => x.id === id)
    if (a?.lat && a?.lon) {
      handleShowOnMap(a.lat, a.lon, a.name, 'activity')
    } else {
      setMode('map')
      setMobileTab('map')
    }
  }, [allActivities, handleShowOnMap])

  // Check if user already has an active push subscription
  useEffect(() => {
    if (typeof window === 'undefined' || !('serviceWorker' in navigator)) return
    navigator.serviceWorker.ready.then(async (reg) => {
      const sub = await reg.pushManager.getSubscription()
      setPushEnabled(!!sub)
    }).catch(() => {})
  }, [])

  const handleBellClick = async () => {
    if (typeof window === 'undefined' || !('serviceWorker' in navigator) || !('PushManager' in window)) return
    const reg = await navigator.serviceWorker.ready
    const existing = await reg.pushManager.getSubscription()
    if (existing) {
      // Unsubscribe
      await existing.unsubscribe()
      await fetch('/api/subscribe', { method: 'DELETE', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ endpoint: existing.endpoint }) })
      setPushEnabled(false)
      return
    }
    const permission = await Notification.requestPermission()
    if (permission !== 'granted') return
    const sub = await reg.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY,
    })
    const scores = getCategoryScores()
    const topCats = Object.entries(scores)
      .sort(([, a], [, b]) => b - a)
      .slice(0, 3)
      .map(([cat]) => cat)
      .join(',')
    await fetch('/api/subscribe', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...sub.toJSON(), preferredCategories: topCats }),
    })
    setPushEnabled(true)
  }

  // Local notification: alert about today's events after 8h gap
  useEffect(() => {
    if (typeof window === 'undefined' || !events.length) return
    const ask = async () => {
      if (Notification.permission === 'default') return // don't auto-ask, user must click bell
      if (Notification.permission !== 'granted') return
      const last = Number(localStorage.getItem('hki-notif-ts') || 0)
      if (Date.now() - last < 8 * 60 * 60 * 1000) return
      localStorage.setItem('hki-notif-ts', String(Date.now()))
      new Notification(t('notif.app_title'), {
        body: `${events.length} ${t('notif.events_today')}`,
        icon: '/icon-192.png',
        tag: 'hki-daily',
      })
    }
    ask()
  }, [events.length, t])

  const handleMobileTab = useCallback((tab: typeof mobileTab) => {
    setMobileTab(tab)
    if (tab === 'discover') { setMode('discover'); setKoCat(null) }
    else if (tab === 'idea') setMode('idea')
    else if (tab === 'map') setMode('map')
    else if (tab === 'favorites') setMode('favorites')
    else if (tab === 'restaurants') setMode('restaurants')
    else if (tab === 'uutta') setMode('uutta')
  }, [])

  // Kartta/Suosikit avataan yläpalkin pyöreistä napeista; muistetaan mistä
  // tultiin niin ‹-paluunappi vie takaisin oikealle sivulle
  const openOverlayMode = useCallback((m: 'map' | 'favorites') => {
    setMode((prev) => {
      if (prev !== 'map' && prev !== 'favorites') setPageBack(prev)
      return m
    })
    setMobileTab(m)
  }, [])

  const goBack = useCallback(() => {
    setMode(pageBack)
    setMobileTab(pageBack as typeof mobileTab)
  }, [pageBack])

  // Menneet piiloon: päättynyt tapahtuma ei kuulu millekään listalle.
  // Ilman endTimeä tapahtuma lasketaan käynnissä olevaksi 3 h alusta (sama
  // sääntö kuin "Nyt menossa"). nowTs asetetaan effectissä eikä
  // initializerissa → ei SSR/hydraatioristiriitaa (vrt. isEvening).
  const [nowTs, setNowTs] = useState<number | null>(null)
  // eslint-disable-next-line react-hooks/set-state-in-effect -- nowTs asetetaan mountissa SSR-hydraatioristiriidan välttämiseksi (vrt. kommentti yllä)
  useEffect(() => { setNowTs(Date.now()) }, [])
  const upcomingEvents = useMemo(() => {
    if (!nowTs) return events
    return events.filter((e) => {
      const startTs = new Date(e.startTime).getTime()
      if (startTs > nowTs) return true
      if (e.endTime) return new Date(e.endTime).getTime() >= nowTs
      return nowTs - startTs < 3 * 60 * 60 * 1000
    })
  }, [events, nowTs])

// Vibe-based client filter on top of API results
  const filteredEvents = useMemo(() => {
    let result = upcomingEvents

    // Keyword concept filter — applied client-side because Linked Events full-text search
    // returns too many false positives (word "keikka" appears in unrelated descriptions).
    if (keyword) {
      const kw = keyword.toLowerCase().trim()
      const conceptTerms = KEYWORD_CONCEPTS[kw]
      if (conceptTerms) {
        // Concept search: match against categories + title
        result = result.filter((e) => {
          const haystack = [e.title, e.shortDescription ?? '', ...e.categories].join(' ').toLowerCase()
          return conceptTerms.some((term) => haystack.includes(term))
        })
      } else {
        // Specific search: match title or shortDescription
        result = result.filter((e) => {
          const haystack = [e.title, e.shortDescription ?? '', e.location?.name ?? '', ...e.categories].join(' ').toLowerCase()
          return haystack.includes(kw)
        })
      }
    }

    // Vibe filter — 'kaikki' shows all events unfiltered (list mode without keyword filter)
    const activeVibeIds = activeVibes.filter((v) => v !== 'ilmainen' && v !== 'kaikki')
    if (activeVibeIds.length > 0) {
      const isNightlife = activeVibeIds.includes('yoelama')
      result = result.filter((e) => {
        // Keskitetty luokitus (venue + lähdekategoriat + avainsanat + vetot) —
        // API laskee valmiiksi, seed-datalle lasketaan lennossa. Lasketaan
        // KERRAN per tapahtuma, ei kertaa/aktiivinen-vibe.
        const vibes = getEventVibes(e)
        const kwMatch = activeVibeIds.some((id) => vibes.includes(id))
        // Evening events (19:30+) count as nightlife — but not sports matches.
        // Käytä yhtenäistä luokitinta (vibes), EI erillistä isUrheilu-regexiä,
        // jotta salibandy/tennis/turnaus ei valu yöelämään.
        const d = new Date(e.startTime)
        const eveningMatch = isNightlife && (d.getHours() > 19 || (d.getHours() === 19 && d.getMinutes() >= 30)) && !vibes.includes('urheilu')
        return kwMatch || eveningMatch
      })
    }

    // Category filter
    if (activeCategories.length > 0) {
      const kws = activeCategories.flatMap((id) => CATEGORIES.find((c) => c.id === id)?.keywords ?? [])
      result = result.filter((e) =>
        e.categories.some((cat) => kws.some((kw) => cat.toLowerCase().includes(kw.toLowerCase())))
      )
    }

    if (priceFilter === 'free') result = result.filter((e) => e.isFree)
    if (priceFilter === 'paid') result = result.filter((e) => !e.isFree)

    // Kaupunginosa: tapahtuman koordinaatit kaupunginosan rajauksessa — sama
    // bbox jota SEO-sivut käyttävät. Koordinaatiton tapahtuma ei voi osua.
    if (hoodFilter) {
      const hood = NEIGHBORHOODS.find((n) => n.id === hoodFilter)
      if (hood) {
        const [minLon, minLat, maxLon, maxLat] = hood.bbox.split(',').map(Number)
        result = result.filter((e) => {
          const la = e.location?.lat, lo = e.location?.lon
          return typeof la === 'number' && typeof lo === 'number' &&
            la >= minLat && la <= maxLat && lo >= minLon && lo <= maxLon
        })
      }
    }

    return result
    // keyword puuttui riippuvuuksista (piilevä bugi: pelkkä hakusanan muutos
    // ei laskenut suodatusta uudelleen ellei jokin muu tila muuttunut samalla)
  }, [upcomingEvents, activeCategories, activeVibes, priceFilter, keyword, hoodFilter])

  const discoverEvents = useMemo(
    () => [...filteredEvents].sort((a, b) => new Date(a.startTime).getTime() - new Date(b.startTime).getTime()),
    [filteredEvents]
  )

  // Base events for the picks grid — date/keyword filtered but NOT vibe/category filtered
  // so rows always show content even when a specific vibe is active
  const baseEvents = useMemo(
    () => [...upcomingEvents].sort((a, b) => new Date(a.startTime).getTime() - new Date(b.startTime).getTime()),
    [upcomingEvents]
  )

  // "✦ ILLAN NOSTOT" — pyyhkäisyheron 5 nostoa: parhaat pisteet ensin,
  // näytöllä aikajärjestyksessä
  const heroGigs = useMemo(() => {
    // "ILLAN keikat": aamukymmenen työpaja ei kuulu tähän vaikka pisteet
    // riittäisivät — ilta alkaa aikaisintaan klo 15 (festivaalit saavat
    // olla päivälläkin, ne ovat kokopäiväisiä).
    const picks = baseEvents
      .filter((e) => {
        // Kohderyhmärajaus (18–40): lastenkonsertti keikka-vibellä ei kuulu heroon
        if (isOutsideTargetAudience(e)) return false
        const sc = nightlifeScore(e)
        if (sc < 3 || !e.image) return false
        return sc >= 8 || new Date(e.startTime).getHours() >= 15
      })
      .sort((a, b) => nightlifeScore(b) - nightlifeScore(a))
      .slice(0, 5)
    return picks.sort((a, b) => new Date(a.startTime).getTime() - new Date(b.startTime).getTime())
  }, [baseEvents])

  // "Parhaat poiminnat" -kärki etusivun ison ruudukon oletukseksi (korvaa
  // vanhat vaakakarusellit). Kuratointi lokaalisti kiinnostavaksi: kuvalliset,
  // keikat, festarit ja isot jutut kärkeen; pubivisa-spam (196 samaa) pohjalle
  // ja rajattu max 2:een; heron 5 nostoa pois ettei sama toistu. Cap ~18.
  const bestPicks = useMemo(() => {
    const heroIds = new Set(heroGigs.map((e) => e.id))
    const QUIZ = /tietovisa|pubivisa|musavisa|\bvisa\b|tietokilpailu|quiz/i
    const isQuiz = (e: Event) => QUIZ.test(`${e.title} ${e.categories.join(' ')}`)
    const score = (e: Event): number => {
      const vibes = getEventVibes(e)
      let s = 0
      if (e.image) s += 6                                                     // kuvalliset kärkeen
      if (e.source === 'festivals' || vibes.includes('festivaali')) s += 5    // festarit
      if (vibes.includes('keikka')) s += 4                                    // keikat
      if (vibes.includes('yoelama') || vibes.includes('underground')) s += 3  // klubit / underground
      if (vibes.includes('teatteri') || vibes.includes('taide') || vibes.includes('standup')) s += 2
      if (vibes.includes('urheilu')) s += 2
      if (e.isFree) s += 1
      if ((e.shortDescription || e.description || '').length > 60) s += 1
      if (isQuiz(e)) s -= 8                                                   // pubivisat alas
      // Yhteisötalojen/leikkipuistojen päiväohjelma: kuvapankkikuva antoi
      // +6 ja ne valtasivat "parhaat poiminnat" (mitattu 24.8.) — sakko
      // syö kuvaedun. Iltatapahtuma saa pienen edun: otsikko lupaa "Illan
      // parhaat".
      if (COMMUNITY_DAYTIME_REGEX.test(`${e.title} ${e.shortDescription ?? ''} ${e.categories.join(' ')}`)) s -= 6
      if (new Date(e.startTime).getHours() >= 17) s += 2
      return s
    }
    const ranked = baseEvents
      // Kohderyhmärajaus (18–40, lib/audience): lapsi-/nuoriso-/seniori-/
      // käsityökerhotapahtumat EIVÄT kuulu poimintoihin — sakotus ei riitä,
      // koska ohut päivä täyttää ruudukon sakotetuillakin (mitattu 24.8.:
      // maanantain poiminnat olivat leikkipuistojumppaa ja neulekerhoja).
      // Kategoriat, haku ja koCat-listat näyttävät ne edelleen.
      .filter((e) => !heroIds.has(e.id) && !isOutsideTargetAudience(e))
      // KAKSI KORIA (omistaja 25.8.): ykköskori = kulttuurikategoriat +
      // festivaalit (lib/audience isPrimaryPick) aina ensin; kakkoskori
      // (kierrokset, kirjastoillat ym.) täyttää vasta kun ykkönen ei riitä.
      .map((e) => ({ e, s: score(e), tier: isPrimaryPick(e) ? 1 : 2 }))
      .sort((a, b) => a.tier - b.tier || b.s - a.s)
    // Kaksi kattoa (omistaja 25.8.: "30 korttia voisi olla hyvä ... älä
    // väkisin tuo 30"): ykköskori (kulttuuri + festarit) saa kasvattaa
    // ruudukon 30:een asti, mutta kakkoskori ja ylijäämävisat täyttävät
    // enintään 18:aan — ruudukkoa ei koskaan pumpata täyteen täytteellä.
    const TIER1_CAP = 30
    const FILL_CAP = 18
    const out: Event[] = []
    const overflowQuiz: Event[] = []
    let quizzes = 0
    for (const { e, tier } of ranked) {
      if (out.length >= TIER1_CAP) break
      if (tier === 2 && out.length >= FILL_CAP) break // kakkoskori ei täytä yli 18:n
      if (isQuiz(e)) {
        if (quizzes >= 2) { overflowQuiz.push(e); continue } // yli 2 visaa → loppuun
        quizzes++
      }
      out.push(e)
    }
    // Täytä ruudukko ylijäämävisoilla jos kärki jäisi ohueksi (visapainotteinen
    // päivä) — visat pysyvät pohjalla, mutta ruudukko ei jää 2 kortin levyiseksi.
    for (const e of overflowQuiz) { if (out.length >= FILL_CAP) break; out.push(e) }
    return out
  }, [baseEvents, heroGigs])

  // Kategorian pystylista (koCat): ruudukon/aihepiirin napautus avaa tämän
  const koCatEvents = useMemo(() => {
    if (!koCat) return []
    if (koCat === 'kaikki') return baseEvents                          // "Kaikki" — koko lista
    if (koCat === 'ilmainen') return baseEvents.filter((e) => e.isFree)
    if (!VIBES.some((v) => v.id === koCat)) return []
    return baseEvents.filter((e) => getEventVibes(e).includes(koCat))
  }, [koCat, baseEvents])

  // "Parhaat poiminnat" -otsikko elää aikavälin mukaan: Illan / Huomisen /
  // Viikon / Viikonlopun / oma väli "25.–27.7. parhaat poiminnat".
  const picksHeading = (() => {
    if (dateFilter === 'today' || dateFilter === 'tonight') return t('discover.picks_today')
    if (dateFilter === 'tomorrow') return t('discover.picks_tomorrow')
    if (dateFilter === 'weekend') return t('discover.picks_weekend')
    if (dateFilter === 'week') return t('discover.picks_week')
    if (customDate) {
      const fmt = (d: string) => { const p = d.split('-'); return `${parseInt(p[2], 10)}.${parseInt(p[1], 10)}.` }
      const range = customDateEnd && customDateEnd !== customDate ? `${fmt(customDate)}–${fmt(customDateEnd)}` : fmt(customDate)
      return `${range} ${t('discover.picks_suffix')}`
    }
    return t('discover.picks_generic')
  })()

  // 'kaikki' counts as 0 — it's "show all", not a real filter selection
  const activeCount = activeVibes.filter(v => v !== 'kaikki').length + activeCategories.length + (priceFilter !== 'all' ? 1 : 0)

  // Suodatinpalkin teksti: näytä KAIKKI aktiiviset suodattimet. Pelkän
  // ensimmäisen aihepiirin näyttäminen piilotti esim. hintasuodattimen —
  // "Stand up · 1 tapahtumaa" ilman selitystä, kun 🎁 Ilmainen oli päällä.
  // ('ilmainen'-vibe kartoittuu hintasuodattimeen → hintachip edustaa sitä.)
  const activeFilterLabel = [
    ...activeVibes
      .filter((v) => v !== 'kaikki' && v !== 'ilmainen')
      .map((v) => { const vb = VIBES.find((x) => x.id === v); return vb ? `${vb.emoji} ${t(vb.tKey as TranslationKey)}` : v }),
    ...(priceFilter === 'free' ? [`🎁 ${t('common.free')}`] : priceFilter === 'paid' ? [t('filter.paid_label')] : []),
  ].join(' · ') || t('common.filters')

  // Freshness badge counts — hoisted so the ok/fail split lives in one place
  const okSourceCount = sources.filter(s => s.ok).length
  const failedSourceCount = sources.length - okSourceCount

  const handleQuickAction = useCallback((id: string) => {
    switch (id) {
      case 'ei-tieda':
        setEiTiedaMode('general')
        setShowEiTieda(true)
        break
      case 'treffi':
        setEiTiedaMode('treffi')
        setShowEiTieda(true)
        break
      case 'ilmainen':
        setPriceFilter(p => p === 'free' ? 'all' : 'free')
        break
      case 'keikka':
        setActiveVibes(p => p.includes('keikka') ? p.filter(v => v !== 'keikka') : [...p, 'keikka'])
        break
      case 'outo':
        setActiveVibes(['tyopaja'])
        break
      case 'halpa':
        setPriceFilter(p => p === 'free' ? 'all' : 'free')
        break
      case 'viela-ehtii':
        setDateFilter('tonight')
        setCustomDate('')
        break
      case 'iltasuunnitelma':
        document.getElementById('iltasuunnitelma')?.scrollIntoView({ behavior: 'smooth' })
        break
    }
  }, [])

  // Kaupunginosavalikon lista — sama sisältö pillerissä ja suodatusotsikossa.
  const hoodMenuList = (
    <>
      {/* näkymätön tausta sulkee valikon ulkopuolelta klikattaessa */}
      <button className="fixed inset-0 z-40 cursor-default" aria-label={t('common.close')}
        onClick={() => setShowHoodMenu(false)} />
      <div className="absolute z-50 mt-2 left-1/2 -translate-x-1/2 w-60 max-h-80 overflow-y-auto rounded-2xl p-1.5"
        style={{ background: 'rgba(18,18,22,.98)', border: '1px solid rgba(255,255,255,.12)', boxShadow: '0 18px 44px -12px rgba(0,0,0,.85)' }}>
        {NEIGHBORHOODS.map((n) => (
          <button key={n.id} type="button"
            onClick={() => { setHoodFilter(n.id); setShowHoodMenu(false); window.scrollTo(0, 0) }}
            className="w-full text-left flex items-center gap-2.5 px-3 py-2.5 rounded-xl text-[13px] font-bold text-white/75 hover:text-white hover:bg-white/6 transition-colors">
            <span className="text-base leading-none">{n.emoji}</span>
            <span className="min-w-0">
              {t('discover.events_in')} {lang === 'en' ? n.name : (NEIGHBORHOOD_INESSIVE[n.id] ?? n.name)}
              <span className="block text-[10.5px] font-medium text-white/35 truncate">{t(n.vibeKey)}</span>
            </span>
          </button>
        ))}
      </div>
    </>
  )

  return (
    <div className="min-h-screen text-white pb-20 md:pb-0" style={{ background: '#0a0a0c' }}>
      {/* ── HEADER ── */}
      <header className="sticky top-0 z-30 border-b border-white/5" style={{ background: 'rgba(10,10,12,0.96)', backdropFilter: 'blur(20px)' }}>
        {/* ── Mobile header row 1: logo + actions ── */}
        <div className="md:hidden flex items-center justify-between px-4 pt-3 pb-2">
          <button onClick={() => { setMode('discover'); setMobileTab('discover'); setKoCat(null) }} className="flex items-center gap-2">
            {/* Merkki tulee nimen PERÄÄN — se on nimen kysymysmerkki, ei
                erillinen ikoni. Aiemmin tässä oli indigo-laatta jossa luki M. */}
            <Logo tileSize={28} />
          </button>
          <div className="flex items-center gap-2">
            <LanguageSwitch compact />
            <button
              onClick={handleBellClick}
              title={pushEnabled ? t('nav.notif_off') : t('nav.notif_on')}
              className={`p-2 rounded-xl border transition-all ${pushEnabled ? 'border-[#6b76ff]/60 bg-[#6b76ff]/15 text-[#a3abff]' : 'border-white/8 text-white/40 bg-white/4 hover:text-white/70'}`}
            >
              <Bell size={15} />
            </button>
            <button
              onClick={() => openOverlayMode('map')}
              title={t('nav.map')}
              className={`relative p-2 rounded-xl border transition-all ${mode === 'map' ? 'border-[#6b76ff]/60 bg-[#6b76ff]/15' : 'border-white/8 bg-white/4 hover:text-white/70'}`}
            >
              <span className="text-[15px] leading-none">🗺</span>
            </button>
            <button
              onClick={() => openOverlayMode('favorites')}
              title={t('fav.title')}
              className={`relative p-2 rounded-xl border transition-all ${mode === 'favorites' ? 'border-[#6b76ff]/60 bg-[#6b76ff]/15' : 'border-white/8 bg-white/4 hover:text-white/70'}`}
            >
              <Heart size={15} fill={favCount > 0 ? '#6b76ff' : 'none'} style={{ color: '#6b76ff' }} />
              {favCount > 0 && (
                <span className="absolute -top-1 -right-1 w-4 h-4 rounded-full text-[9px] font-black flex items-center justify-center text-white" style={{ background: 'linear-gradient(150deg,#6b76ff,#5059e6)' }}>{favCount}</span>
              )}
            </button>
            <button onClick={() => setShowJarjestajaForm((p) => !p)}
              title={t('form.add_event_cta')}
              aria-label={t('form.add_event_cta')}
              className={`relative p-2 rounded-xl border transition-all ${showJarjestajaForm ? 'border-[#6b76ff]/60 bg-[#6b76ff]/15' : 'border-white/8 text-white/40 bg-white/4'}`}
              style={showJarjestajaForm ? { color: '#6b76ff' } : {}}>
              <Plus size={16} strokeWidth={2.5} />
            </button>
          </div>
        </div>
        {/* ── Mobile header row 2: search ── */}
        <div className="md:hidden px-4 pb-3">
          <SearchBar
            value={keyword}
            onChange={(v) => { setKeyword(v); if (v) { setMode('discover'); setMobileTab('discover'); setKoCat(null); setGuideView(null) } }}
            venueHits={localSearchHits.venues}
            activityHits={localSearchHits.activities}
            restaurantHits={localSearchHits.restaurants}
            onSelectVenue={showVenueEvents}
            onSelectActivity={handleSelectActivity}
            onSelectRestaurant={handleSelectRestaurant}
          />
        </div>

        {/* ── Desktop header: single row ── */}
        <div className="hidden md:flex max-w-6xl mx-auto px-4 py-3 items-center gap-3">
          <button onClick={() => { setMode('discover'); setMobileTab('discover'); setKoCat(null) }} className="shrink-0 flex items-center gap-2">
            <Logo tileSize={32} className="shrink-0" />
          </button>

          <div className="flex gap-0.5 bg-white/5 rounded-xl p-1">
            {(['discover', 'idea', 'restaurants', 'uutta'] as AppMode[]).map((m) => (
              <button key={m} onClick={() => { setMode(m); setMobileTab(m as typeof mobileTab); if (m === 'discover') setKoCat(null) }}
                className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${mode === m ? 'text-white' : 'text-white/35 hover:text-white/65'}`}
                style={mode === m ? { background: 'linear-gradient(150deg,#6b76ff,#5059e6)' } : {}}>
                {m === 'discover' ? `🏠 ${t('nav.home')}` : m === 'idea' ? `🎲 ${t('nav.idea')}` : m === 'restaurants' ? `🍽 ${t('nav.restaurants')}` : `🆕 ${t('nav.uutta')}`}
              </button>
            ))}
          </div>

          <div className="flex-1 max-w-md">
            <SearchBar
            value={keyword}
            onChange={(v) => { setKeyword(v); if (v) { setMode('discover'); setMobileTab('discover'); setKoCat(null); setGuideView(null) } }}
            venueHits={localSearchHits.venues}
            activityHits={localSearchHits.activities}
            restaurantHits={localSearchHits.restaurants}
            onSelectVenue={showVenueEvents}
            onSelectActivity={handleSelectActivity}
            onSelectRestaurant={handleSelectRestaurant}
          />
          </div>

          <LanguageSwitch />
          <button
            onClick={handleBellClick}
            title={pushEnabled ? t('nav.notif_off') : t('nav.notif_on')}
            className={`shrink-0 p-2 rounded-xl border transition-all ${pushEnabled ? 'border-[#6b76ff]/60 bg-[#6b76ff]/15 text-[#a3abff]' : 'border-white/8 text-white/40 bg-white/4 hover:text-white/70'}`}
          >
            <Bell size={15} />
          </button>

          <button
            onClick={() => openOverlayMode('map')}
            title={t('nav.map')}
            className={`relative shrink-0 p-2 rounded-xl border transition-all ${mode === 'map' ? 'border-[#6b76ff]/60 bg-[#6b76ff]/15' : 'border-white/8 bg-white/4 hover:text-white/70'}`}
          >
            <span className="text-[15px] leading-none">🗺</span>
          </button>

          <button
            onClick={() => openOverlayMode('favorites')}
            title={t('fav.title')}
            className={`relative shrink-0 p-2 rounded-xl border transition-all ${mode === 'favorites' ? 'border-[#6b76ff]/60 bg-[#6b76ff]/15' : 'border-white/8 bg-white/4 hover:text-white/70'}`}
          >
            <Heart size={15} fill={favCount > 0 ? '#6b76ff' : 'none'} style={{ color: '#6b76ff' }} />
            {favCount > 0 && (
              <span className="absolute -top-1 -right-1 w-4 h-4 rounded-full text-[9px] font-black flex items-center justify-center text-white" style={{ background: 'linear-gradient(150deg,#6b76ff,#5059e6)' }}>{favCount}</span>
            )}
          </button>

          {/* Järjestäjän sisäänkäynti. Pelkkä "+" ei kertonut kenellekään mitä
              napista tapahtuu (omistaja 25.8.2026) — työpöydällä tilaa on, joten
              teksti on mukana. Mobiilissa sama toiminto on tekstillisenä
              painikkeena sisällön lopussa, koska yläpalkki on jo täynnä. */}
          <button onClick={() => setShowJarjestajaForm((p) => !p)}
            title={t('form.add_event_cta')}
            aria-label={t('form.add_event_cta')}
            className={`relative shrink-0 flex items-center gap-1.5 p-2 lg:pl-2.5 lg:pr-3 rounded-xl border text-[12.5px] font-bold transition-all ${showJarjestajaForm ? 'border-[#6b76ff]/60 bg-[#6b76ff]/15 text-[#a3abff]' : 'border-white/8 text-white/55 bg-white/4 hover:text-white/85'}`}>
            <Plus size={15} strokeWidth={2.5} />
            {/* Teksti vasta lg:stä ylöspäin. Mitattu 768 px:llä: teksti kasvatti
                yläpalkin 877 px:iin eli koko sivu sai vaakavierityksen ja juuri
                tämä nappi leikkautui ruudun ulkopuolelle — päinvastainen
                lopputulos kuin haluttiin. Rivi on nowrap eikä shrink-0-nappi
                anna periksi, joten teksti piilotetaan kapealla ja tilalle jää
                sisällön tekstillinen painike (alempana, lg:hidden). */}
            <span className="hidden lg:inline whitespace-nowrap">{t('form.add_event_cta')}</span>
          </button>
        </div>

      </header>

      {/* ══ FAVORITES ══ */}
      {mode === 'favorites' && (
        <main className="max-w-2xl mx-auto px-4 pt-4 pb-24 space-y-4">
          {/* Heading + ‹ back */}
          <div className="flex items-center gap-3">
            <button onClick={goBack} aria-label={t('common.back')}
              className="shrink-0 w-[34px] h-[34px] rounded-full flex items-center justify-center border transition-all border-white/10 bg-white/8 hover:bg-white/14">
              <ChevronLeft size={18} className="text-white" />
            </button>
            <Heart size={22} fill="#6b76ff" style={{ color: '#6b76ff' }} />
            <h1 className="font-black text-white leading-none" style={{ fontSize: 'clamp(1.6rem,5vw,2.4rem)', letterSpacing: '-0.03em' }}>
              {t('fav.title')}
            </h1>
            <span className="text-white/35 text-sm font-bold">· {favCount} {t('fav.saved_count')}</span>
          </div>

          {favorites.length === 0 ? (
            <div className="flex flex-col items-center py-20 gap-4 text-center">
              <Heart size={48} className="text-white/8" />
              <p className="text-white/30 font-bold">{t('fav.empty')}</p>
              <p className="text-white/15 text-sm">{t('fav.hint')}</p>
              <button onClick={() => { setMode('discover'); setMobileTab('discover'); setKoCat(null) }}
                className="px-5 py-2.5 rounded-full text-sm font-black text-white"
                style={{ background: 'linear-gradient(150deg,#6b76ff,#5059e6)' }}>
                {t('fav.browse')}
              </button>
            </div>
          ) : (
            <div className="space-y-3">
              {[...favorites]
                .sort((a, b) => new Date(a.startTime).getTime() - new Date(b.startTime).getTime())
                .map((e) => {
                  const isToday = new Date(e.startTime).toDateString() === new Date().toDateString()
                  const timeStr = new Date(e.startTime).toLocaleTimeString(lang === 'fi' ? 'fi-FI' : 'en-GB', { hour: '2-digit', minute: '2-digit' })
                  const dateStr = isToday ? t('date.today') : new Date(e.startTime).toLocaleDateString(lang === 'fi' ? 'fi-FI' : 'en-GB', { weekday: 'short', day: 'numeric', month: 'short' })
                  return (
                    <button key={e.id} onClick={() => setSelectedEvent(e)}
                      className="w-full text-left rounded-2xl overflow-hidden flex gap-0 transition-all active:scale-[.99]"
                      style={{ background: 'rgba(255,255,255,.04)', border: '1px solid rgba(255,255,255,.07)' }}>
                      {e.image && (
                        <div className="relative shrink-0 w-28" style={{ aspectRatio: '3/4' }}>
                          <img src={e.image} alt={e.title} className="absolute inset-0 w-full h-full object-cover" />
                        </div>
                      )}
                      <div className="flex-1 p-4 space-y-1.5 min-w-0">
                        <div className="flex items-start gap-2 justify-between">
                          <span className="text-[11px] font-black px-2 py-0.5 rounded-full" style={{ background: 'rgba(107,118,255,.12)', color: '#a3abff' }}>
                            {dateStr} {timeStr}
                          </span>
                          {e.isFree && (
                            <span className="text-[10px] font-black px-2 py-0.5 rounded-full bg-emerald-500/15 text-emerald-400 shrink-0">{t('common.free_badge')}</span>
                          )}
                        </div>
                        <h3 className="font-black text-white text-sm leading-tight line-clamp-2" style={{ letterSpacing: '-0.01em' }}>{e.title}</h3>
                        {e.location?.name && (
                          <p className="text-white/35 text-xs truncate">{e.location.name}</p>
                        )}
                        {!e.isFree && e.price && (
                          <p className="text-white/30 text-xs">{e.price}</p>
                        )}
                        {(e.ticketUrl || e.infoUrl) && (
                          <a href={e.ticketUrl ?? e.infoUrl ?? '#'} target="_blank" rel="noopener noreferrer"
                            onClick={ev => ev.stopPropagation()}
                            className="inline-block text-[11px] font-black px-3 py-1 rounded-full text-white"
                            style={{ background: 'linear-gradient(150deg,#6b76ff,#5059e6)' }}>
                            {canBuyTickets(e) ? `${t('detail.buy_tickets')} →` : `${t('common.more_info')} →`}
                          </a>
                        )}
                      </div>
                    </button>
                  )
                })}
            </div>
          )}
        </main>
      )}

      {/* ══ DISCOVER ══ */}
      {mode === 'discover' && (
        <main className="max-w-6xl mx-auto px-4 pt-5 pb-20 space-y-5">

          {/* City headline */}
          <div>
            {(() => {
              // Sama ulkoasu kummassakin tapauksessa — vaihtuu vain elementti.
              const HeroTag = heroAsHeading ? 'h1' : 'div'
              return (
                <HeroTag className="font-black text-white leading-none select-none"
                  style={{ fontSize: 'clamp(2.8rem,12vw,8rem)', letterSpacing: '-0.04em' }}>
                  {municipality.toUpperCase()}
                </HeroTag>
              )
            })()}
            <p className="text-white/18 text-[11px] font-bold tracking-[0.3em] uppercase mt-1">
              {new Date().toLocaleDateString(lang === 'fi' ? 'fi-FI' : 'en-GB', { weekday: 'long', day: 'numeric', month: 'long' })}
              {/* Tuoreusleima: montako lähdettä vastasi ja milloin — vajaa data ei saa olla näkymätöntä */}
              {fetchingFull ? (
                <span className="normal-case tracking-normal">{' · '}{t('discover.updating_sources')}</span>
              ) : generatedAt && sources.length > 1 ? (
                <span className="normal-case tracking-normal">
                  {' · '}<Link href="/lahteet" className="underline decoration-white/20 underline-offset-2 hover:text-white/50 transition-colors">{okSourceCount} {t('discover.sources_count')}</Link>{total > 0 ? ` · ${total} ${t('discover.events_count')}` : ''} · {t('share.at_time')} {formatTime(generatedAt, lang)}
                  {failedSourceCount > 0 && ` · ${failedSourceCount} ${t('discover.sources_failed')}`}
                </span>
              ) : null}
            </p>
          </div>

          {/* Date strip — PIILOSSA haun aikana: haku katsoo 90 pv eteenpäin,
              joten korostettu "Tänään" antaisi väärän kuvan siitä mitä
              tuloksissa näkyy (omistaja 25.8.2026). Valinta säilyy tilassa ja
              palaa näkyviin kun hakukenttä tyhjennetään. */}
          {!keyword && (
          <div ref={dateStripRef} className="flex gap-2 overflow-x-auto scrollbar-none -mx-4 px-4 items-center">
            {([
              { d: 'today' as DateFilter, label: t('date.today') },
              { d: 'tonight' as DateFilter, label: '🌙 ' + t('date.tonight_short') },
              { d: 'tomorrow' as DateFilter, label: t('date.tomorrow') },
              { d: 'weekend' as DateFilter, label: '🎉 ' + t('date.weekend') },
              { d: 'week' as DateFilter, label: t('date.week_short') },
            ]).map(({ d, label }) => {
              const isActive = dateFilter === d && !customDate && !customDateEnd
              return (
                <button key={d} data-active-date={isActive ? '1' : undefined}
                  onClick={() => { setDateFilter(d); setCustomDate(''); setCustomDateEnd('') }}
                  className={`shrink-0 px-4 py-2 rounded-full text-sm font-black transition-all ${
                    isActive ? 'text-white' : 'text-white/35 bg-white/5 hover:bg-white/8 hover:text-white/65'
                  }`}
                  style={isActive ? { background: 'linear-gradient(150deg,#6b76ff,#5059e6)', boxShadow: '0 4px 16px -4px rgba(91,101,230,.4)' } : {}}>
                  {label}
                </button>
              )
            })}
            <DatePicker size="md" value={customDate} valueEnd={customDateEnd} onChangeRange={handleRangeChange} onChange={(v) => { setCustomDate(v); setCustomDateEnd(''); setDateFilter(v ? 'custom' : 'today') }} />
          </div>
          )}

          {/* Aktiivinen filtteripalkki — ilmestyy kun kategoria valittu */}
          {(activeVibes.length > 0 || activeCategories.length > 0 || priceFilter !== 'all') && (
            <div className="flex items-center justify-between px-4 py-2.5 rounded-2xl"
              style={{ background: 'rgba(107,118,255,.08)', border: '1px solid rgba(107,118,255,.2)' }}>
              <div className="flex items-center gap-2 min-w-0">
                <span className="font-black text-[13px]" style={{ color: '#a3abff' }}>
                  {activeFilterLabel}
                </span>
                <span className="text-[12px]" style={{ color: 'rgba(255,255,255,.3)' }}>
                  · {discoverEvents.length} {t('discover.events_count')}
                </span>
              </div>
              <button
                onClick={clearFilters}
                className="text-[12px] font-black flex-shrink-0 ml-3 px-3 py-1 rounded-full transition-all"
                style={{ color: 'rgba(255,255,255,.4)', border: '1px solid rgba(255,255,255,.1)' }}
              >
                {t('discover.exit_search')}
              </button>
            </div>
          )}


          {/* ── Loading skeleton — näkyy vain kun tapahtumia ei vielä ole ── */}
          {loading && baseEvents.length === 0 && (
            <div className="space-y-5">
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <div style={{ width: 13, height: 13, borderRadius: '50%', border: '1.5px solid rgba(107,118,255,.2)', borderTopColor: '#6b76ff', animation: 'spin 0.75s linear infinite', flexShrink: 0 }} />
                <span style={{ fontSize: 13, fontWeight: 700, color: 'rgba(255,255,255,.55)', letterSpacing: '-0.01em' }}>{t('discover.loading_events')}</span>
              </div>
              {[0, 1, 2].map(i => (
                <div key={i} className="space-y-3">
                  <div className="h-4 rounded-lg skeleton-shimmer" style={{ width: 80 + i * 24 }} />
                  <div className="flex gap-3 overflow-x-auto scrollbar-none -mx-4 px-4">
                    {[0, 1, 2, 3].map(j => (
                      <div key={j} className="shrink-0 w-40 rounded-[18px] skeleton-shimmer" style={{ aspectRatio: '3/4', flexShrink: 0 }} />
                    ))}
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* ═══ KATEGORIAN PYSTYLISTA (koCat) — ← Takaisin + rikkaat kortit ═══ */}
          {/* ═══ OPAS ETUSIVUN SISÄLLÄ (guideView) ═══ */}
          {guideView && !koCat && !keyword && !hoodFilter && activeVibes.length === 0 && activeCategories.length === 0 && priceFilter === 'all' && (
            <GuideInlineView slug={guideView} initialSlug={initialGuide} initialData={initialGuideData} onBack={() => setGuideView(null)}
              onSwitch={setGuideView} onEventClick={setSelectedEvent} />
          )}

          {koCat && !guideView && !keyword && !hoodFilter && activeVibes.length === 0 && activeCategories.length === 0 && priceFilter === 'all' && (
            <section className="space-y-4">
              <div className="flex items-center gap-3">
                <button onClick={() => setKoCat(null)}
                  className="shrink-0 flex items-center gap-1 px-3.5 py-2 rounded-full text-[13px] font-black text-white/70 hover:text-white transition-all"
                  style={{ background: 'rgba(255,255,255,.06)', border: '1px solid rgba(255,255,255,.1)' }}>
                  ← {t('common.back')}
                </button>
                <h2 className="font-black text-white text-[19px] leading-none" style={{ letterSpacing: '-0.02em' }}>
                  {koCat === 'kaikki'
                    ? `📋 ${t('discover.all_events')}`
                    : koCat === 'ilmainen'
                    ? `🎁 ${t('discover.free_events')}`
                    : `${VIBES.find(v => v.id === koCat)?.emoji ?? ''} ${(() => { const vb = VIBES.find(v => v.id === koCat); return vb ? t(vb.tKey as TranslationKey) : '' })()}`}
                </h2>
                {!((loading || fetchingFull) && koCatEvents.length === 0) && (
                  <span className="text-white/30 text-[13px] font-bold">· {koCatEvents.length}</span>
                )}
              </div>
              {(loading || fetchingFull) && koCatEvents.length === 0 ? (
                /* Haku kesken (esim. päivävalinnan vaihto) — skeleton eikä
                   ennenaikainen "Ei tuloksia" */
                <div className="space-y-4">
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <div style={{ width: 13, height: 13, borderRadius: '50%', border: '1.5px solid rgba(107,118,255,.2)', borderTopColor: '#6b76ff', animation: 'spin 0.75s linear infinite', flexShrink: 0 }} />
                    <span style={{ fontSize: 13, fontWeight: 700, color: 'rgba(255,255,255,.55)', letterSpacing: '-0.01em' }}>{t('discover.loading_events')}</span>
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    {[0, 1, 2, 3].map(i => (
                      <div key={i} className="rounded-2xl skeleton-shimmer" style={{ aspectRatio: '3/4' }} />
                    ))}
                  </div>
                </div>
              ) : koCatEvents.length === 0 ? (
                <div className="flex flex-col items-center py-16 text-center gap-3">
                  <span className="text-4xl">🫥</span>
                  <p className="text-white/40 font-bold">{t('discover.no_filter_match')}</p>
                  <p className="text-white/20 text-sm">{t('discover.quiet_sub')}</p>
                </div>
              ) : (
                /* Responsiivinen ruudukko: 2 mobiili · 3 tabletti · 4 desktop */
                <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3 items-start">
                  {koCatEvents.map((e) => (
                    <EventCard key={e.id} event={e} onClick={setSelectedEvent}
                      distance={geo.coords && e.location?.lat && e.location?.lon
                        ? haversineKm(geo.coords.lat, geo.coords.lon, e.location.lat, e.location.lon)
                        : undefined} />
                  ))}
                </div>
              )}
            </section>
          )}

          {/* ═══ ETUSIVU (koFront) — hero → ruudukko → kompaktit rivit → aihepiirit ═══ */}
          {!koCat && !guideView && !keyword && !hoodFilter && activeVibes.length === 0 && activeCategories.length === 0 && priceFilter === 'all' && (
            <>
              {/* Tilarivi: vihreä pulssipiste + päivän tapahtumamäärä */}
              {!loading && baseEvents.length > 0 && !keyword && (
                <div className="flex items-center gap-2 -mb-1">
                  <span className="w-2 h-2 rounded-full shrink-0" style={{ background: '#5fd9a6', boxShadow: '0 0 8px rgba(95,217,166,.8)', animation: 'pulse-glow 2s ease-in-out infinite' }} />
                  <span className="text-[13px] font-bold" style={{ color: 'rgba(255,255,255,.55)' }}>
                    {baseEvents.length} {dateFilter === 'today' || dateFilter === 'tonight' ? t('discover.events_today') : t('discover.events_count')}
                  </span>
                </div>
              )}

              {/* HERO: 🎸 Illan keikat — pyyhkäistävä, 5 nostoa */}
              {!loading && <HeroSwiper events={heroGigs} onOpen={setSelectedEvent} />}

              {/* Kategoriaruudukko */}
              {!loading && baseEvents.length > 0 && (
                <section>
                  <div className="flex items-baseline justify-between mb-3">
                    {/* Otsikko elää päivävalinnan mukana — "Tapahtumat tänään"
                        Huomenna-suodattimella oli virhe */}
                    <h2 className="font-black text-white text-[18px]" style={{ letterSpacing: '-0.02em' }}>
                      {t(dateFilter === 'today' || dateFilter === 'tonight' ? 'discover.grid_title'
                        : dateFilter === 'tomorrow' ? 'discover.grid_title_tomorrow'
                        : dateFilter === 'weekend' ? 'discover.grid_title_weekend'
                        : dateFilter === 'week' ? 'discover.grid_title_week'
                        : 'discover.grid_title_generic')}
                    </h2>
                    <span className="text-[12px] font-bold text-white/30">{t('discover.grid_sub')}</span>
                  </div>
                  <div className="grid grid-cols-4 gap-2">
                    {HOME_GRID_TILES.map(({ id, tint }) => {
                      const vibe = VIBES.find(v => v.id === id)
                      if (!vibe) return null
                      return (
                        <button key={id} onClick={() => setKoCat(id)}
                          className="flex flex-col items-center justify-center gap-1.5 rounded-[16px] py-4 px-1 transition-transform active:scale-95"
                          style={{
                            background: `radial-gradient(120% 100% at 50% 0%, rgba(${tint},.16), rgba(255,255,255,.03) 70%)`,
                            border: '1px solid rgba(255,255,255,.07)',
                          }}>
                          <span className="text-[26px] leading-none">{vibe.emoji}</span>
                          <span className="text-[11px] font-black text-white/85 text-center leading-tight">{t(vibe.tKey as TranslationKey)}</span>
                        </button>
                      )
                    })}
                  </div>
                  {/* "Kaikki tapahtumat"- ja "Ilmaiseksi"-leveät napit POISTETTU
                      (omistaja 25.8.): Ilmaiseksi on aihepiiripaneelin tiili,
                      koko listan avaa paneelin "Näytä kaikki tapahtumat". */}
                </section>
              )}

              {/* 🎨 Kaikki aihepiirit + 📍 Kaupunginosat — HETI kategorioiden
                  alla, jotta ne näkee ilman koko sivun vieritystä (omistajan
                  pyyntö). Kaupunginosa suodattaa tapahtumat tässä näkymässä,
                  ei vie erilliselle sivulle. */}
              {!loading && baseEvents.length > 0 && (
                <div className="flex justify-center gap-2 pt-1 flex-wrap">
                  <button onClick={() => setShowVibePanel(true)}
                    className="flex items-center gap-2 px-5 py-3 rounded-full text-[13.5px] font-black text-white transition-all active:scale-95"
                    style={{ background: 'rgba(255,255,255,.07)', border: '1px solid rgba(255,255,255,.12)' }}>
                    🎨 {t('discover.all_vibes')}
                    <span className="text-white/40">▾</span>
                  </button>
                  <div className="relative">
                    <button onClick={() => { setShowGuideMenu(false); setShowHoodMenu((v) => !v) }}
                      className="flex items-center gap-2 px-5 py-3 rounded-full text-[13.5px] font-black text-white transition-all active:scale-95"
                      style={{ background: 'rgba(255,255,255,.07)', border: '1px solid rgba(255,255,255,.12)' }}>
                      📍 {t('discover.neighborhoods')}
                      <span className="text-white/40">▾</span>
                    </button>
                    {showHoodMenu && hoodMenuList}
                  </div>
                  <div className="relative">
                    <button onClick={() => { setShowHoodMenu(false); setShowGuideMenu((v) => !v) }}
                      className="flex items-center gap-2 px-5 py-3 rounded-full text-[13.5px] font-black text-white transition-all active:scale-95"
                      style={{ background: 'rgba(255,255,255,.07)', border: '1px solid rgba(255,255,255,.12)' }}>
                      🧭 {t('discover.guides')}
                      <span className="text-white/40">▾</span>
                    </button>
                    {showGuideMenu && (
                      <>
                        <button className="fixed inset-0 z-40 cursor-default" aria-label={t('common.close')}
                          onClick={() => setShowGuideMenu(false)} />
                        <div className="absolute z-50 mt-2 left-1/2 -translate-x-1/2 w-56 rounded-2xl p-1.5"
                          style={{ background: 'rgba(18,18,22,.98)', border: '1px solid rgba(255,255,255,.12)', boxShadow: '0 18px 44px -12px rgba(0,0,0,.85)' }}>
                          {/* Yökerhot EI kuulu tähän — se on jo etusivun
                              Yöelämä-kategoria ja Ravintolat-välilehden tyyppi
                              (omistajan huomio: tuplakama). */}
                          {/* Oppaat avautuvat ETUSIVUN SISÄLLÄ (ei /saunat-navigointia) —
                              SEO-sivut säilyvät Googlelle, valikko pitää käyttäjän tässä. */}
                          {(Object.keys(GUIDE_META) as GuideSlug[]).map((slug) => {
                            const g = GUIDE_META[slug]
                            return (
                              <button key={slug}
                                onClick={() => { setGuideView(slug); setShowGuideMenu(false) }}
                                className="w-full text-left flex items-center gap-2.5 px-3 py-2.5 rounded-xl text-[13px] font-bold text-white/75 hover:text-white hover:bg-white/6 transition-colors">
                                <span className="text-base leading-none">{g.emoji}</span>
                                <span className="min-w-0">
                                  {t(g.titleKey)}
                                  <span className="block text-[10.5px] font-medium text-white/35 truncate">{t(g.subKey)}</span>
                                </span>
                              </button>
                            )
                          })}
                        </div>
                      </>
                    )}
                  </div>
                </div>
              )}


              {/* Parhaat poiminnat — iso ruudukko (korvaa vaakakarusellit). Otsikko
                  elää aikavälin mukaan; sisältö kuratoitu (kuvalliset/keikat/festarit). */}
              {!loading && bestPicks.length > 0 && (
                <section>
                  <div className="flex items-baseline gap-2 mb-3">
                    <h2 className="font-black text-white text-[18px]" style={{ letterSpacing: '-0.02em' }}>
                      {picksHeading}
                    </h2>
                    <span className="text-[14px]" style={{ color: '#a3abff' }}>✦</span>
                  </div>
                  <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3 items-start">
                    {bestPicks.map((e) => (
                      <EventCard key={e.id} event={e} onClick={setSelectedEvent}
                        distance={geo.coords && e.location?.lat && e.location?.lon
                          ? haversineKm(geo.coords.lat, geo.coords.lon, e.location.lat, e.location.lon)
                          : undefined} />
                    ))}
                  </div>
                </section>
              )}

              {/* Phase 2 spinner */}
              {fetchingFull && baseEvents.length > 0 && (
                <div className="flex items-center justify-center gap-2 py-3">
                  <Loader2 size={14} className="animate-spin text-white/30" />
                  <span className="text-white/30 text-[13px]">{t('discover.loading_more')}</span>
                </div>
              )}

            </>
          )}

          {/* Kaupunginosaotsikko: "Tapahtumat Kalliossa" + vaihto ja poisto —
              näkymä pysyy tapahtumasivuna, vain kaupunginosa vaihtuu. */}
          {hoodFilter && (
            <div className="flex items-center gap-2.5 flex-wrap">
              <h2 className="font-black text-white text-[22px]" style={{ letterSpacing: '-0.02em' }}>
                📍 {t('discover.events_in')} {lang === 'en'
                  ? (NEIGHBORHOODS.find((n) => n.id === hoodFilter)?.name ?? '')
                  : (NEIGHBORHOOD_INESSIVE[hoodFilter] ?? '')}
              </h2>
              {!loading && !fetchingFull && (
                <span className="text-[13px] font-bold text-white/35">{discoverEvents.length}</span>
              )}
              <div className="relative">
                <button onClick={() => setShowHoodMenu((v) => !v)}
                  className="text-[12px] font-bold px-3 py-1.5 rounded-full transition-colors"
                  style={{ background: 'rgba(255,255,255,.06)', color: 'rgba(255,255,255,.6)', border: '1px solid rgba(255,255,255,.1)' }}>
                  {t('common.change')}
                </button>
                {showHoodMenu && hoodMenuList}
              </div>
              <button onClick={() => { setHoodFilter(null); setShowHoodMenu(false) }}
                aria-label={t('discover.clear_hood')}
                className="text-[12px] font-bold px-3 py-1.5 rounded-full transition-colors"
                style={{ background: 'rgba(255,255,255,.06)', color: 'rgba(255,255,255,.6)', border: '1px solid rgba(255,255,255,.1)' }}>
                ✕
              </button>
            </div>
          )}

          {/* Suodatetun näkymän lataustila: vaihe 1 on ohi (skeleton poissa)
              mutta täysi haku kesken eikä osumia vielä ole — ilman tätä
              paikkahaku ("Paikan kaikki tapahtumat") näytti 2–3 s tyhjää. */}
          {(keyword || hoodFilter || activeVibes.length > 0 || activeCategories.length > 0 || priceFilter !== 'all') && discoverEvents.length === 0 && (loading || fetchingFull) && (
            <div className="flex items-center justify-center gap-2 py-10">
              <div style={{ width: 13, height: 13, borderRadius: '50%', border: '1.5px solid rgba(107,118,255,.2)', borderTopColor: '#6b76ff', animation: 'spin 0.75s linear infinite', flexShrink: 0 }} />
              <span style={{ fontSize: 13, fontWeight: 700, color: 'rgba(255,255,255,.55)' }}>{t('discover.loading_events')}</span>
            </div>
          )}

          {/* ── Flat grid — näkyy kun keyword, kategoria, vibe tai Nyt menossa valittu ── */}
          {(keyword || hoodFilter || activeVibes.length > 0 || activeCategories.length > 0 || priceFilter !== 'all') && discoverEvents.length > 0 && (
            <section>
              {/* Hakuotsikko: kertoo että tulokset ovat KAIKILTA tulevilta
                  päiviltä, ei valitulta päivältä — muuten laskuri ja
                  päivävalinta jäisivät ristiriitaisiksi. */}
              {keyword && (
                <div className="flex items-baseline gap-2 mb-3 flex-wrap">
                  <h2 className="font-black text-white text-[18px]" style={{ letterSpacing: '-0.02em' }}>
                    &quot;{keyword}&quot;
                  </h2>
                  <span className="text-[13px] font-bold text-white/40">
                    {discoverEvents.length} {discoverEvents.length === 1 ? t('discover.upcoming_event') : t('discover.upcoming_events')}
                  </span>
                </div>
              )}
              <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3 items-start">
                {discoverEvents.map(e => (
                  <PosterCard key={e.id} event={e} onClick={setSelectedEvent}
                    distance={geo.coords && e.location?.lat && e.location?.lon
                      ? haversineKm(geo.coords.lat, geo.coords.lon, e.location.lat, e.location.lon)
                      : undefined} />
                ))}
              </div>
              <div ref={sentinelRef} className="h-1" />
              {(loading || fetchingFull) && <div className="flex justify-center py-4"><Loader2 size={18} className="animate-spin text-white/30" /></div>}
            </section>
          )}

          {/* ── Virhetila: haku epäonnistui — ei harhaanjohtavaa "ei tapahtumia" -tilaa ── */}
          {!loading && !fetchingFull && error && (
            <div className="rounded-2xl p-6 text-center space-y-3 my-6" style={{ background: 'rgba(255,80,80,.06)', border: '1px solid rgba(255,80,80,.2)' }}>
              <p className="text-4xl">📡</p>
              <p className="text-white font-black text-lg">{t('discover.load_error')}</p>
              <p className="text-white/50 text-sm font-semibold">{error}</p>
              <button onClick={() => window.location.reload()}
                className="rounded-xl px-5 py-3 font-black text-white"
                style={{ background: 'linear-gradient(150deg,#6b76ff,#5059e6)' }}>
                {t('common.retry')}
              </button>
            </div>
          )}

          {/* ── Nyt menossa: tyhjä tila — ilman tätä alue jäisi selittämättä tyhjäksi ── */}
          {/* Tyhjä tila: kun jokin suodatin (haku/kaupunginosa/aihepiiri/hinta) on
              päällä, ratkaisee SUODATETTU tulos — muuten "Ei tuloksia haulle X"
              ei näkyisi koskaan, koska pakassa on aina tapahtumia. */}
          {!loading && !fetchingFull && !error && !koCat && !guideView &&
            ((keyword || hoodFilter || activeVibes.length > 0 || activeCategories.length > 0 || priceFilter !== 'all')
              ? discoverEvents.length === 0
              : baseEvents.length === 0) && (
            <EmptyState
              keyword={keyword}
              activeVibes={activeVibes}
              activeCategories={activeCategories}
              priceFilter={priceFilter}
              dateFilter={keyword ? 'search' : dateFilter}
              onClear={clearFilters}
              onDateChange={(d) => { setDateFilter(d); setCustomDate('') }}
            />
          )}


          {/* JÄRJESTÄJÄN SISÄÄNKÄYNTI MOBIILISSA. Yläpalkissa toiminto on vain
              "+"-ikonina. Mitattu 390 px:n leveydellä: rivillä on brändi (115 px)
              ja viisi painiketta (203 px), joten vapaata on 40 px kun teksti
              vaatisi ~90 px. Omistajan vaatimus 25.8.2026: "jos ei mahdu niin
              asetella selkeästi että lisää tapahtuma" — tässä se on tekstinä.
              Yläpalkin nappi näyttää tekstin vasta lg:stä ylöspäin, joten tämä
              on näkyvissä siihen asti (lg:hidden) — myös iPadilla pystyssä. */}
          <button
            onClick={() => setShowJarjestajaForm(true)}
            className="lg:hidden w-full flex items-center justify-center gap-2 py-3.5 rounded-2xl text-[13.5px] font-black text-white/70 border transition-all active:scale-[.99]"
            style={{ background: 'rgba(255,255,255,.04)', borderColor: 'rgba(255,255,255,.09)' }}
          >
            <Plus size={16} strokeWidth={2.5} />
            {t('form.add_event_cta')}
          </button>

          {/* Newsletter signup */}
          <NewsletterBanner />

        </main>
      )}

      {/* ══ IDEA ══ */}
      {mode === 'idea' && (
        <IdeaView
          events={filteredEvents}
          onShowOnMap={(lat, lon, name, type) => handleShowOnMap(lat, lon, name, type)}
          onEventClick={setSelectedEvent}
        />
      )}

      {/* ══ MAP ══ */}
      {mode === 'map' && (
        <main className="px-2 pt-2 pb-0">
          <div className="flex items-center gap-3 px-2 pb-2">
            <button onClick={goBack} aria-label={t('common.back')}
              className="shrink-0 w-[34px] h-[34px] rounded-full flex items-center justify-center border transition-all border-white/10 bg-white/8 hover:bg-white/14">
              <ChevronLeft size={18} className="text-white" />
            </button>
            <h1 className="font-black text-white leading-none text-[22px]" style={{ letterSpacing: '-0.02em' }}>
              {t('nav.map')}
            </h1>
          </div>
          <MapView events={filteredEvents} onEventClick={setSelectedEvent} mapTarget={mapTarget} onTargetConsumed={() => setMapTarget(null)}/>
        </main>
      )}

      {/* ══ RESTAURANTS ══ */}
      {mode === 'restaurants' && <RestaurantsView onShowOnMap={(lat, lon, name) => handleShowOnMap(lat, lon, name, 'restaurant')} jumpToId={jumpToRestaurant?.id} jumpToKey={jumpToRestaurant} />}

      {/* ══ ACTIVITIES ══ */}
      {/* ══ UUTTA HELSINGISSÄ ══ */}
      {mode === 'uutta' && <UuttaView />}

      {/* ── MOBILE NAV ── */}
      <nav className="md:hidden fixed bottom-0 left-0 right-0 z-30 border-t border-white/7"
        style={{ background: 'rgba(10,10,12,0.94)', backdropFilter: 'blur(18px)', height: 72, paddingBottom: 'env(safe-area-inset-bottom)' }}>
        <div className="grid grid-cols-4 h-full">
          {([
            { tab: 'discover' as const,     emoji: '🏠', labelKey: 'nav.home'        },
            { tab: 'idea' as const,          emoji: '🎲', labelKey: 'nav.idea'        },
            { tab: 'restaurants' as const,   emoji: '🍽', labelKey: 'nav.restaurants' },
            { tab: 'uutta' as const,         emoji: '🆕', labelKey: 'nav.uutta'       },
          ] as const).map(({ tab, emoji, labelKey }) => {
            const isActive = mobileTab === tab
            return (
              <button key={tab} onClick={() => handleMobileTab(tab)}
                className="relative flex flex-col items-center justify-center gap-0.5 transition-all"
                style={{ color: isActive ? '#6b76ff' : 'rgba(255,255,255,0.4)' }}>
                <span className="text-lg leading-none" style={isActive ? { filter: 'drop-shadow(0 0 8px rgba(91,101,230,.5))' } : {}}>{emoji}</span>
                <span className="text-[10px] font-bold whitespace-nowrap">{t(labelKey)}</span>
              </button>
            )
          })}
        </div>
      </nav>

      {/* Aihepiiripaneeli — valinta avaa kategorian pystylistan (koCat) */}
      <VibePanel
        open={showVibePanel}
        active={koCat ? [koCat] : []}
        onToggle={(id) => {
          setKoCat(id === 'kaikki' ? null : id)
          setShowVibePanel(false)
        }}
        onClear={() => setKoCat(null)}
        onClose={() => setShowVibePanel(false)}
        onShowAll={() => { setKoCat('kaikki'); setShowVibePanel(false) }}
      />

      <EventDetailPanel event={selectedEvent} onClose={() => setSelectedEvent(null)}
        onShowVenueEvents={showVenueEvents}/>
      <InstallBanner/>

      {showEiTieda && (
        <EiTiedaModal
          events={filteredEvents}
          mode={eiTiedaMode}
          onClose={() => setShowEiTieda(false)}
          onSelect={(e) => { setSelectedEvent(e); setShowEiTieda(false) }}
        />
      )}

      {showJarjestajaForm && (
        <JarjestajaForm onClose={() => setShowJarjestajaForm(false)} />
      )}
    </div>
  )
}

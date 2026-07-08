'use client'

import { useState, useRef, useEffect } from 'react'
import Link from 'next/link'
import dynamic from 'next/dynamic'

const PlannerMap = dynamic(() => import('@/components/PlannerMap'), {
  ssr: false,
  loading: () => (
    <div style={{
      height: 360, borderRadius: 12,
      background: 'rgba(107,118,255,.04)',
      border: '1px solid rgba(107,118,255,.12)',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
    }}>
      <p style={{ fontSize: 13, color: 'rgba(255,255,255,.3)', margin: 0 }}>Ladataan karttaa…</p>
    </div>
  ),
})

// ─── Types ────────────────────────────────────────────────────────────────────

type Phase     = 'onboarding' | 'generating' | 'itinerary'
type GroupType = 'solo' | 'couple' | 'family' | 'friends' | 'business'
type ChatMessage = { role: 'user' | 'assistant'; content: string }

interface ItineraryItem {
  time:        string
  title:       string
  location:    string
  duration:    string
  price:       string
  description: string
  coords?:     [number, number]
  eventUrl?:   string
}

interface EventRef {
  name:      string
  ticketUrl: string | null
}

// ─── Constants ────────────────────────────────────────────────────────────────

const GROUP_OPTIONS: Array<{ value: GroupType; emoji: string; label: string }> = [
  { value: 'solo',     emoji: '🧍', label: 'Yksin'        },
  { value: 'couple',   emoji: '💑', label: 'Pari'         },
  { value: 'family',   emoji: '👨‍👩‍👧', label: 'Perhe'   },
  { value: 'friends',  emoji: '👯', label: 'Kaveriporukka' },
  { value: 'business', emoji: '💼', label: 'Liikematka'    },
]

const INTEREST_OPTIONS = [
  { value: 'keikka',    label: 'Keikka',           emoji: '🎸' },
  { value: 'ruoka',     label: 'Hyvä ruoka',       emoji: '🍽' },
  { value: 'teatteri',  label: 'Teatteri & Tanssi', emoji: '🎭' },
  { value: 'museo',     label: 'Museo',            emoji: '🏛'  },
  { value: 'yoelama',   label: 'Yöelämä',          emoji: '🌙' },
  { value: 'baari',     label: 'Baari / Pub',      emoji: '🍺' },
  { value: 'lapset',    label: 'Lapsiystävällistä', emoji: '👶' },
  { value: 'urheilu',   label: 'Urheilu',          emoji: '⚽' },
  { value: 'festivaali',label: 'Festivaalit',      emoji: '🎪' },
  { value: 'standup',   label: 'Stand up',         emoji: '😂' },
  { value: 'luonto',    label: 'Luonto & Ulkoilu', emoji: '🌿' },
  { value: 'shoppailu', label: 'Shoppailu',        emoji: '🛍'  },
]

const SUBCATS: Record<string, string[]> = {
  keikka:    ['Rock', 'Jazz', 'Pop', 'Folk / iskelmä', 'Metal', 'Elektroninen', 'Hip-hop', 'Klassinen', 'Indie', 'Blues'],
  ruoka:     ['Fine dining', 'Bistro', 'Street food', 'Aamiaisravintola', 'Vegaani', 'Sushi', 'Italialainen', 'Pohjoismainen', 'Intialainen'],
  teatteri:  ['Draama', 'Musikaali', 'Baletti', 'Ooppera', 'Lastenteatteri', 'Impro', 'Kokeellinen'],
  museo:     ['Taidemuseo', 'Historia', 'Nykytaide', 'Tiede', 'Valokuva', 'Design', 'Luonnontiede'],
  yoelama:   ['Yökerho', 'Live-musiikki', 'Karaoke', 'DJ-illat', 'Tanssiminen'],
  baari:     ['Craft-olut', 'Cocktail', 'Viinibaari', 'Pubivisat', 'Sports bar', 'Pelibaari', 'Whisky'],
  lapset:    ['Eläintarha', 'Huvipuisto', 'Tiedekeskus', 'Luonto', 'Museo', 'Liikunta'],
  urheilu:   ['Jalkapallo', 'Jääkiekko', 'Koripallo', 'Tennis', 'Pyöräily', 'Juokseminen', 'Yleisurheilu'],
  festivaali:['Musiikki', 'Elokuva', 'Ruoka', 'Kulttuuri', 'Taide', 'Olutjuhla'],
  standup:   ['Suomeksi', 'Englanniksi', 'Open mic', 'Impro-komedia'],
  luonto:    ['Patikka', 'Pyöräily', 'Uiminen', 'Kalastus', 'Retkiluistelu', 'Piknik', 'Lintuharrastus'],
  shoppailu: ['Antiikki / kirppis', 'Design', 'Kirjakaupat', 'Kauppahalli', 'Elektroniikka', 'Urheilu'],
}

const BUDGET_OPTIONS = [
  { value: 'free',    emoji: '🆓', label: 'Ilmainen',  desc: 'Vain ilmaiset kohteet'       },
  { value: 'budget',  emoji: '💚', label: 'Edullinen', desc: 'Max ~15 €/aktiviteetti'       },
  { value: 'normal',  emoji: '💙', label: 'Normaali',  desc: '15–40 €/aktiviteetti'         },
  { value: 'premium', emoji: '⭐', label: 'Premium',   desc: 'Parasta laadusta tinkimättä'  },
]

// ─── Date helpers ─────────────────────────────────────────────────────────────

function isoOffset(days: number) {
  const d = new Date()
  d.setDate(d.getDate() + days)
  return d.toLocaleDateString('sv') // sv locale → YYYY-MM-DD
}

function nextSaturdayISO() {
  const d = new Date()
  const daysUntilSat = ((6 - d.getDay()) + 7) % 7 || 7
  d.setDate(d.getDate() + daysUntilSat)
  return d.toLocaleDateString('sv')
}

function formatDateFI(iso: string): string {
  if (!iso) return ''
  const d = new Date(iso + 'T12:00:00')
  return d.toLocaleDateString('fi-FI', { weekday: 'long', day: 'numeric', month: 'long' })
}

// ─── Itinerary parser ─────────────────────────────────────────────────────────

function parseItinerary(text: string): ItineraryItem[] {
  if (!text.includes('🕘')) return []

  const raw    = text.startsWith('🕘') ? text : text.replace(/^[\s\S]*?(?=🕘)/, '')
  const blocks = raw.split(/(?=🕘)/).filter(b => b.trim().includes('🕘'))

  return blocks.map(block => {
    const lines  = block.split('\n').map(l => l.trim()).filter(Boolean)
    const header = lines.find(l => l.includes('🕘')) || lines[0] || ''
    const meta   = lines.find(l => l.startsWith('📍')) || ''
    const desc   = lines
      .filter(l => !l.includes('🕘') && !l.startsWith('📍') && !l.startsWith('##'))
      .join(' ')
      .trim()

    const timeM  = header.match(/🕘\s*(\d{1,2}[:.]\d{2})/)
    const titleM = header.match(/\*\*(.+?)\*\*/)
    const locM   = meta.match(/📍\s*([^|]+)/)
    const durM   = meta.match(/⏱\s*([^|]+)/)
    const priceM = meta.match(/💰\s*([^|\n]+)/)

    const title = (
      titleM?.[1] ||
      header.replace(/🕘\s*[\d:.]+\s*[—–-]\s*/, '').replace(/\*\*/g, '').trim()
    ).trim()

    return {
      time:        (timeM?.[1] || '').replace('.', ':'),
      title,
      location:    locM?.[1]?.trim()   || '',
      duration:    durM?.[1]?.trim()   || '',
      price:       priceM?.[1]?.trim() || '',
      description: desc,
    }
  }).filter(item => item.title.length > 0)
}

// ─── Geocoding ────────────────────────────────────────────────────────────────

async function geocodeLocation(location: string): Promise<[number, number] | null> {
  if (!location || location.length < 3) return null
  try {
    const q   = encodeURIComponent(location + ' Helsinki')
    const res = await fetch(
      `https://nominatim.openstreetmap.org/search?q=${q}&format=json&limit=1`,
      {
        headers: { 'User-Agent': 'mitatanaan.fi/1.0 trip-planner' },
        signal:  AbortSignal.timeout(4000),
      }
    )
    if (!res.ok) return null
    const data = await res.json()
    if (data[0]?.lat && data[0]?.lon) {
      return [parseFloat(data[0].lat), parseFloat(data[0].lon)]
    }
    return null
  } catch {
    return null
  }
}

const delay = (ms: number) => new Promise<void>(r => setTimeout(r, ms))

// ─── Event matching ───────────────────────────────────────────────────────────

function normalizeStr(s: string): string {
  return s.toLowerCase().replace(/[^a-zäöå0-9]/g, '')
}

function matchEventUrl(title: string, refs: EventRef[]): string | undefined {
  if (!title || refs.length === 0) return undefined
  const normTitle = normalizeStr(title)
  const match = refs.find(ref => {
    if (!ref.ticketUrl || !ref.name) return false
    const normName = normalizeStr(ref.name)
    if (normName.length < 4) return false
    return normTitle.includes(normName) || normName.includes(normTitle)
  })
  return match?.ticketUrl || undefined
}

// ─── Share URL ────────────────────────────────────────────────────────────────

function buildShareUrl(
  groupType: GroupType | null,
  travelDate: string,
  dayCount: number,
  interests: string[],
  budget: string,
): string {
  if (typeof window === 'undefined' || !groupType || !travelDate) return ''
  const p = new URLSearchParams({ g: groupType, d: travelDate, n: String(dayCount) })
  if (interests.length > 0) p.set('i', interests.join(','))
  if (budget && budget !== 'normal') p.set('b', budget)
  return `${window.location.origin}/suunnittele?${p}`
}

// ─── PlannerView ──────────────────────────────────────────────────────────────

export default function PlannerView() {
  const [phase,       setPhase]       = useState<Phase>('onboarding')
  const [groupType,   setGroupType]   = useState<GroupType | null>(null)
  const [travelDate,  setTravelDate]  = useState('')
  const [dayCount,    setDayCount]    = useState(1)
  const [interests,   setInterests]   = useState<string[]>([])
  const [budget,      setBudget]      = useState('normal')
  const [streamText,  setStreamText]  = useState('')
  const [itinerary,   setItinerary]   = useState<ItineraryItem[]>([])
  const [chatMsgs,    setChatMsgs]    = useState<ChatMessage[]>([])
  const [chatInput,   setChatInput]   = useState('')
  const [isStreaming, setIsStreaming] = useState(false)
  const [error,       setError]       = useState<string | null>(null)
  const [showMap,       setShowMap]       = useState(false)
  const [copied,        setCopied]        = useState(false)
  const [eventRefs,     setEventRefs]     = useState<EventRef[]>([])
  const [subInterests,  setSubInterests]  = useState<Record<string, string[]>>({})

  const accumRef      = useRef('')
  const bottomRef     = useRef<HTMLDivElement>(null)
  const geocodingIdRef = useRef(0)

  // Auto-scroll while generating
  useEffect(() => {
    if (phase === 'generating' && streamText) {
      bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
    }
  }, [streamText, phase])

  // Pre-fill state from share URL params (runs once on mount)
  useEffect(() => {
    const params = new URLSearchParams(window.location.search)
    const g = params.get('g')
    const d = params.get('d')
    if (!g || !d) return

    const validGroups: GroupType[] = ['solo', 'couple', 'family', 'friends', 'business']
    if (!validGroups.includes(g as GroupType)) return

    const n  = Math.max(1, Math.min(parseInt(params.get('n') || '1', 10) || 1, 5))
    const i  = params.get('i')?.split(',').filter(Boolean) || []
    const b  = params.get('b') || 'normal'

    setGroupType(g as GroupType)
    setTravelDate(d)
    setDayCount(n)
    setInterests(i)
    setBudget(b)

    const userMsg: ChatMessage = { role: 'user', content: 'Luo täydellinen päiväohjelma Helsinkiin.' }
    streamItinerary(
      [userMsg],
      { groupType: g as GroupType, travelDate: d, dayCount: n, interests: i, budget: b }
    )
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  function toggleInterest(v: string) {
    setInterests(p => p.includes(v) ? p.filter(i => i !== v) : [...p, v])
    if (interests.includes(v)) {
      setSubInterests(prev => { const n = { ...prev }; delete n[v]; return n })
    }
  }

  function toggleSubInterest(category: string, sub: string) {
    setSubInterests(prev => {
      const current = prev[category] || []
      const next = current.includes(sub) ? current.filter(s => s !== sub) : [...current, sub]
      return { ...prev, [category]: next }
    })
  }

  async function streamItinerary(
    msgs: ChatMessage[],
    opts?: {
      groupType?:    GroupType | null
      travelDate?:   string
      dayCount?:     number
      interests?:    string[]
      budget?:       string
      subInterests?: Record<string, string[]>
    }
  ) {
    const gt = opts?.groupType    !== undefined ? opts.groupType    : groupType
    const td = opts?.travelDate   !== undefined ? opts.travelDate   : travelDate
    const dc = opts?.dayCount     !== undefined ? opts.dayCount     : dayCount
    const it = opts?.interests    !== undefined ? opts.interests    : interests
    const bg = opts?.budget       !== undefined ? opts.budget       : budget
    const si = opts?.subInterests !== undefined ? opts.subInterests : subInterests

    setPhase('generating')
    setIsStreaming(true)
    setError(null)
    accumRef.current = ''
    setStreamText('')
    setEventRefs([])

    try {
      const res = await fetch('/api/plan', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({
          groupType:    gt,
          travelDate:   td,
          dayCount:     dc,
          interests:    it,
          budget:       bg,
          subInterests: si,
          messages:     msgs,
        }),
      })

      if (!res.ok || !res.body) throw new Error(`HTTP ${res.status}`)

      const reader = res.body.getReader()
      const dec    = new TextDecoder()
      let   buf    = ''
      let   localRefs: EventRef[] = []

      outer: while (true) {
        const { done, value } = await reader.read()
        if (done) break

        buf += dec.decode(value, { stream: true })
        const parts = buf.split('\n\n')
        buf = parts.pop() ?? ''

        for (const part of parts) {
          if (!part.startsWith('data: ')) continue
          const raw = part.slice(6).trim()
          if (raw === '[DONE]') break outer

          try {
            const ev = JSON.parse(raw)
            if (ev.type === 'meta' && Array.isArray(ev.events)) {
              localRefs = ev.events as EventRef[]
              setEventRefs(localRefs)
            } else if (ev.text) {
              accumRef.current += ev.text
              setStreamText(accumRef.current)
            }
          } catch {
            // skip malformed SSE line
          }
        }
      }

      const finalText = accumRef.current
      const parsed    = parseItinerary(finalText)

      // Match LinkedEvents ticket URLs before setting itinerary
      const matched: ItineraryItem[] = parsed.map(item => {
        const url = matchEventUrl(item.title, localRefs)
        return url ? { ...item, eventUrl: url } : item
      })

      const newMsgs: ChatMessage[] = [...msgs, { role: 'assistant', content: finalText }]
      setChatMsgs(newMsgs)
      setItinerary(matched)
      setPhase('itinerary')

      // Geocode locations in background (400 ms between requests, Nominatim policy)
      const geocodingId = ++geocodingIdRef.current
      const geocodable  = [...matched]
      ;(async () => {
        for (let i = 0; i < geocodable.length; i++) {
          if (geocodingIdRef.current !== geocodingId) return
          const coords = await geocodeLocation(geocodable[i].location)
          if (geocodingIdRef.current !== geocodingId) return
          if (coords) {
            geocodable[i] = { ...geocodable[i], coords }
            setItinerary([...geocodable])
          }
          if (i < geocodable.length - 1) await delay(420)
        }
      })()
    } catch (err) {
      console.error('[PlannerView] stream error:', err)
      setError('Suunnitelman luominen epäonnistui. Tarkista internet-yhteys ja yritä uudelleen.')
      setPhase('onboarding')
    } finally {
      setIsStreaming(false)
    }
  }

  function handleStart() {
    if (!groupType || !travelDate) return
    const userMsg: ChatMessage = { role: 'user', content: 'Luo täydellinen päiväohjelma Helsinkiin.' }
    streamItinerary([userMsg])
  }

  function handleRefine() {
    if (!chatInput.trim() || isStreaming) return
    const msg = chatInput.trim()
    setChatInput('')
    streamItinerary([...chatMsgs, { role: 'user', content: msg }])
  }

  function handleReset() {
    setPhase('onboarding')
    setGroupType(null)
    setTravelDate('')
    setDayCount(1)
    setInterests([])
    setBudget('normal')
    setStreamText('')
    setItinerary([])
    setChatMsgs([])
    setChatInput('')
    setError(null)
    setShowMap(false)
    setCopied(false)
    setEventRefs([])
    setSubInterests({})
  }

  function handleShare() {
    const url = buildShareUrl(groupType, travelDate, dayCount, interests, budget)
    if (!url) return
    if (typeof navigator !== 'undefined' && navigator.share) {
      navigator.share({ title: 'Helsinki-päiväohjelma', url }).catch(() => {})
    } else if (typeof navigator !== 'undefined' && navigator.clipboard) {
      navigator.clipboard.writeText(url).then(() => {
        setCopied(true)
        setTimeout(() => setCopied(false), 2500)
      })
    }
  }

  const dateQuickOptions = [
    { label: 'Tänään',      iso: isoOffset(0),      days: 1 },
    { label: 'Huomenna',    iso: isoOffset(1),      days: 1 },
    { label: 'Viikonloppu', iso: nextSaturdayISO(), days: 2 },
  ]

  const durationOptions = [
    { label: 'Yksi päivä',   value: 1 },
    { label: 'Kaksi päivää', value: 2 },
    { label: '3+ päivää',    value: 3 },
  ]

  const groupLabel = GROUP_OPTIONS.find(g => g.value === groupType)?.label || ''
  const isReady    = !!groupType && !!travelDate

  return (
    <div style={{ minHeight: '100dvh', background: '#0a0a0c', color: '#fff', display: 'flex', flexDirection: 'column' }}>
      <style>{`
        @keyframes fadeUp {
          from { opacity: 0; transform: translateY(14px) }
          to   { opacity: 1; transform: translateY(0) }
        }
        @keyframes blink {
          0%, 100% { opacity: 0 }
          50%      { opacity: 1 }
        }
        @keyframes dotPulse {
          0%, 60%, 100% { opacity: .25; transform: scale(.8) }
          30%           { opacity: 1;   transform: scale(1) }
        }
        .planner-input::placeholder { color: rgba(255,255,255,.25) }
        .planner-input:focus { border-color: rgba(107,118,255,.6) !important; outline: none }
        .chip-btn {
          transition: background .18s ease, border-color .18s ease, color .18s ease, transform .1s ease;
          -webkit-tap-highlight-color: transparent;
          touch-action: manipulation;
          user-select: none;
        }
        .chip-btn:hover { opacity: .88 }
        .chip-btn:active { transform: scale(0.94); transition-duration: .06s }
        .ob-anim { animation: fadeUp .35s ease both }
        .sub-chip {
          transition: background .18s ease, border-color .18s ease, color .18s ease, transform .1s ease;
          -webkit-tap-highlight-color: transparent;
          touch-action: manipulation;
          user-select: none;
        }
        .sub-chip:hover { opacity: .88 }
        .sub-chip:active { transform: scale(0.94); transition-duration: .06s }
        .subcat-outer {
          overflow: hidden;
          max-height: 0;
          transition: max-height .4s cubic-bezier(.4,0,.2,1), opacity .3s ease, margin-top .35s ease;
          opacity: 0;
          margin-top: 0;
        }
        .subcat-outer.open { max-height: 800px; opacity: 1; margin-top: 18px }
        .subcat-group { animation: fadeUp .22s ease both }
        .action-link { transition: background .15s, color .15s }
        .action-link:hover { background: rgba(255,255,255,.1) !important }
      `}</style>

      {/* ── Sticky header ── */}
      <header style={{
        display: 'flex', alignItems: 'center', padding: '12px 16px', gap: 12,
        borderBottom: '1px solid rgba(255,255,255,.07)',
        background: 'rgba(10,10,12,.95)', backdropFilter: 'blur(18px)',
        position: 'sticky', top: 0, zIndex: 20,
      }}>
        <Link href="/" style={{
          display: 'flex', alignItems: 'center', gap: 5, textDecoration: 'none',
          color: 'rgba(255,255,255,.5)', fontSize: 13, fontWeight: 700,
          padding: '6px 12px', borderRadius: 8, background: 'rgba(255,255,255,.06)',
        }}>
          ← Etusivu
        </Link>
        <h1 style={{ flex: 1, textAlign: 'center', fontSize: 15, fontWeight: 900, letterSpacing: '-.02em' }}>
          ✈️ Helsinki-suunnitelma
        </h1>
        {phase !== 'onboarding' && (
          <button onClick={handleReset} style={{
            color: 'rgba(255,255,255,.5)', fontSize: 13, fontWeight: 700,
            padding: '6px 12px', borderRadius: 8, background: 'rgba(255,255,255,.06)',
            border: 'none', cursor: 'pointer',
          }}>
            Uusi
          </button>
        )}
      </header>

      {/* ── Content ── */}
      <div style={{ flex: 1, overflowY: 'auto' }}>

        {/* ─ ONBOARDING ─ */}
        {phase === 'onboarding' && (
          <div style={{ padding: '32px 20px 140px', maxWidth: 560, margin: '0 auto' }}>

            {error && (
              <div style={{
                padding: '12px 16px', borderRadius: 10, marginBottom: 24,
                background: 'rgba(239,68,68,.1)', border: '1px solid rgba(239,68,68,.3)',
                color: '#fca5a5', fontSize: 14,
              }}>
                {error}
              </div>
            )}

            {/* Step 1: Group type */}
            <OnboardingSection label="Keitä matkustatte?">
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                {GROUP_OPTIONS.map(opt => {
                  const sel = groupType === opt.value
                  return (
                    <button key={opt.value} className="chip-btn"
                      onClick={() => setGroupType(opt.value)}
                      style={{
                        display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6,
                        padding: '16px 12px', borderRadius: 14, cursor: 'pointer',
                        border:     `1px solid ${sel ? '#6b76ff' : 'rgba(255,255,255,.1)'}`,
                        background:  sel ? 'rgba(107,118,255,.18)' : 'rgba(255,255,255,.04)',
                        color:       sel ? '#fff' : 'rgba(255,255,255,.6)',
                        fontWeight:  700, fontSize: 13,
                      }}>
                      <span style={{ fontSize: 28 }}>{opt.emoji}</span>
                      {opt.label}
                    </button>
                  )
                })}
              </div>
            </OnboardingSection>

            {/* Step 2: Date */}
            {groupType && (
              <OnboardingSection label="Milloin?" delay>
                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 12 }}>
                  {dateQuickOptions.map(opt => {
                    const sel = travelDate === opt.iso
                    return (
                      <button key={opt.iso} className="chip-btn"
                        onClick={() => { setTravelDate(opt.iso); setDayCount(opt.days) }}
                        style={{
                          padding: '8px 18px', borderRadius: 20, cursor: 'pointer',
                          border:     `1px solid ${sel ? '#6b76ff' : 'rgba(255,255,255,.15)'}`,
                          background:  sel ? 'rgba(107,118,255,.18)' : 'rgba(255,255,255,.04)',
                          color:       sel ? '#fff' : 'rgba(255,255,255,.6)',
                          fontSize: 14, fontWeight: 700,
                        }}>
                        {opt.label}
                      </button>
                    )
                  })}
                </div>
                <input type="date" className="planner-input"
                  value={travelDate}
                  min={isoOffset(0)}
                  onChange={e => setTravelDate(e.target.value)}
                  style={{
                    width: '100%', padding: '10px 14px', borderRadius: 10,
                    border: '1px solid rgba(255,255,255,.15)',
                    background: 'rgba(255,255,255,.05)', color: '#fff',
                    fontSize: 15, colorScheme: 'dark',
                  }}
                />
              </OnboardingSection>
            )}

            {/* Step 3: Duration */}
            {travelDate && (
              <OnboardingSection label="Kuinka kauan?" delay>
                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                  {durationOptions.map(opt => {
                    const sel = dayCount === opt.value
                    return (
                      <button key={opt.value} className="chip-btn"
                        onClick={() => setDayCount(opt.value)}
                        style={{
                          padding: '8px 18px', borderRadius: 20, cursor: 'pointer',
                          border:     `1px solid ${sel ? '#6b76ff' : 'rgba(255,255,255,.15)'}`,
                          background:  sel ? 'rgba(107,118,255,.18)' : 'rgba(255,255,255,.04)',
                          color:       sel ? '#fff' : 'rgba(255,255,255,.6)',
                          fontSize: 14, fontWeight: 700,
                        }}>
                        {opt.label}
                      </button>
                    )
                  })}
                </div>
              </OnboardingSection>
            )}

            {/* Step 4: Interests + subcategories */}
            {travelDate && (
              <OnboardingSection label="Mikä kiinnostaa? (voit valita useita)" delay>
                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                  {INTEREST_OPTIONS.map(opt => {
                    const sel = interests.includes(opt.value)
                    return (
                      <button key={opt.value} className="chip-btn"
                        onClick={() => toggleInterest(opt.value)}
                        style={{
                          display: 'flex', alignItems: 'center', gap: 6,
                          padding: '8px 14px', borderRadius: 20, cursor: 'pointer',
                          border:     `1px solid ${sel ? '#6b76ff' : 'rgba(255,255,255,.15)'}`,
                          background:  sel ? 'rgba(107,118,255,.18)' : 'rgba(255,255,255,.04)',
                          color:       sel ? '#fff' : 'rgba(255,255,255,.6)',
                          fontSize: 13, fontWeight: 700,
                        }}>
                        {opt.emoji} {opt.label}
                      </button>
                    )
                  })}
                </div>

                {/* Subcategory expansion — slides in when ≥1 category selected */}
                <div className={`subcat-outer${interests.length > 0 ? ' open' : ''}`}>
                  <div style={{ borderTop: '1px solid rgba(107,118,255,.14)', paddingTop: 16 }}>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 }}>
                      <span style={{
                        fontSize: 11, fontWeight: 800, letterSpacing: '.1em', textTransform: 'uppercase',
                        color: 'rgba(107,118,255,.6)',
                      }}>
                        Tarkenna valintoja
                      </span>
                      <span style={{ fontSize: 11, color: 'rgba(255,255,255,.22)', fontWeight: 500 }}>
                        Valinnainen
                      </span>
                    </div>
                    {interests.map(val => {
                      const chip = INTEREST_OPTIONS.find(o => o.value === val)
                      const subs = SUBCATS[val] || []
                      if (!chip || subs.length === 0) return null
                      const selSubs = subInterests[val] || []
                      return (
                        <div key={val} className="subcat-group" style={{ marginBottom: 14 }}>
                          <p style={{
                            fontSize: 11, fontWeight: 700, color: 'rgba(255,255,255,.3)',
                            letterSpacing: '.04em', marginBottom: 7,
                          }}>
                            {chip.emoji} {chip.label}
                          </p>
                          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                            {subs.map(sub => {
                              const isSel = selSubs.includes(sub)
                              return (
                                <button
                                  key={sub}
                                  className="sub-chip"
                                  onClick={() => toggleSubInterest(val, sub)}
                                  style={{
                                    padding: '5px 11px', borderRadius: 20, cursor: 'pointer',
                                    fontSize: 12, fontWeight: 600,
                                    border:     `1px solid ${isSel ? 'rgba(107,118,255,.55)' : 'rgba(255,255,255,.09)'}`,
                                    background:  isSel ? 'rgba(107,118,255,.12)' : 'rgba(255,255,255,.025)',
                                    color:       isSel ? '#a5aaff' : 'rgba(255,255,255,.38)',
                                  }}
                                >
                                  {sub}
                                </button>
                              )
                            })}
                          </div>
                        </div>
                      )
                    })}
                  </div>
                </div>
              </OnboardingSection>
            )}

            {/* Step 5: Budget */}
            {travelDate && (
              <OnboardingSection label="Budjetti?" delay>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                  {BUDGET_OPTIONS.map(opt => {
                    const sel = budget === opt.value
                    return (
                      <button key={opt.value} className="chip-btn"
                        onClick={() => setBudget(opt.value)}
                        style={{
                          display: 'flex', flexDirection: 'column', alignItems: 'flex-start', gap: 4,
                          padding: '14px 14px', borderRadius: 14, cursor: 'pointer', textAlign: 'left',
                          border:     `1px solid ${sel ? '#6b76ff' : 'rgba(255,255,255,.1)'}`,
                          background:  sel ? 'rgba(107,118,255,.18)' : 'rgba(255,255,255,.04)',
                          color:       sel ? '#fff' : 'rgba(255,255,255,.6)',
                        }}>
                        <span style={{ fontSize: 20 }}>{opt.emoji}</span>
                        <span style={{ fontSize: 13, fontWeight: 800 }}>{opt.label}</span>
                        <span style={{ fontSize: 11, color: sel ? 'rgba(255,255,255,.6)' : 'rgba(255,255,255,.3)', fontWeight: 500 }}>
                          {opt.desc}
                        </span>
                      </button>
                    )
                  })}
                </div>
              </OnboardingSection>
            )}

            {/* CTA */}
            {isReady && (
              <div className="ob-anim" style={{ marginTop: 32 }}>
                <button onClick={handleStart} style={{
                  width: '100%', padding: '17px', borderRadius: 16, border: 'none',
                  background: 'linear-gradient(150deg,#6b76ff,#5059e6)',
                  color: '#fff', fontSize: 17, fontWeight: 900, letterSpacing: '-.02em',
                  cursor: 'pointer', boxShadow: '0 4px 28px rgba(107,118,255,.35)',
                  display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 10,
                }}>
                  ✈️ Rakenna päiväohjelma
                </button>
                <p style={{ textAlign: 'center', marginTop: 10, fontSize: 12, color: 'rgba(255,255,255,.3)' }}>
                  {groupLabel} · {formatDateFI(travelDate)}
                  {interests.length > 0 ? ` · ${interests.map(i => INTEREST_OPTIONS.find(o => o.value === i)?.label).join(', ')}` : ''}
                  {` · ${BUDGET_OPTIONS.find(o => o.value === budget)?.label}`}
                </p>
              </div>
            )}
          </div>
        )}

        {/* ─ GENERATING ─ */}
        {phase === 'generating' && (
          <div style={{ padding: '48px 24px', maxWidth: 580, margin: '0 auto' }}>
            <div style={{ textAlign: 'center', marginBottom: 32 }}>
              <div style={{ fontSize: 52, marginBottom: 16 }}>🏙</div>
              <h2 style={{ fontSize: 18, fontWeight: 900, letterSpacing: '-.02em', marginBottom: 6 }}>
                Rakennetaan päiväohjelmaasi…
              </h2>
              <p style={{ fontSize: 13, color: 'rgba(255,255,255,.4)', marginBottom: 24 }}>
                Haetaan tämän hetken tapahtumat LinkedEventsistä
              </p>
              {!streamText && (
                <div style={{ display: 'flex', gap: 7, justifyContent: 'center' }}>
                  {[0, 1, 2].map(i => (
                    <span key={i} style={{
                      width: 9, height: 9, borderRadius: '50%', display: 'inline-block',
                      background: '#6b76ff',
                      animation: `dotPulse 1.3s ${i * 0.18}s infinite ease-in-out`,
                    }} />
                  ))}
                </div>
              )}
            </div>

            {streamText && (
              <div style={{
                padding: '20px 22px', borderRadius: 14,
                background: 'rgba(107,118,255,.07)', border: '1px solid rgba(107,118,255,.15)',
                fontSize: 14, lineHeight: 1.8, color: 'rgba(255,255,255,.8)',
                whiteSpace: 'pre-wrap', fontFamily: 'inherit',
              }}>
                {streamText}
                <span style={{
                  display: 'inline-block', width: 2, height: 15,
                  background: '#6b76ff', verticalAlign: 'middle', marginLeft: 2,
                  animation: 'blink .9s step-end infinite',
                }} />
              </div>
            )}
            <div ref={bottomRef} />
          </div>
        )}

        {/* ─ ITINERARY ─ */}
        {phase === 'itinerary' && (
          <ItineraryPhase
            items={itinerary}
            rawText={streamText}
            groupLabel={groupLabel}
            dateLabel={formatDateFI(travelDate)}
            chatInput={chatInput}
            onChatChange={setChatInput}
            onRefine={handleRefine}
            isStreaming={isStreaming}
            showMap={showMap}
            onToggleMap={() => setShowMap(v => !v)}
            onShare={handleShare}
            copied={copied}
          />
        )}
      </div>
    </div>
  )
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function OnboardingSection({
  label, children, delay,
}: {
  label: string
  children: React.ReactNode
  delay?: boolean
}) {
  return (
    <div className={delay ? 'ob-anim' : undefined} style={{ marginBottom: 30 }}>
      <p style={{
        fontSize: 11, fontWeight: 800, letterSpacing: '.12em', textTransform: 'uppercase',
        color: 'rgba(107,118,255,.85)', marginBottom: 12,
      }}>
        {label}
      </p>
      {children}
    </div>
  )
}

interface ItineraryPhaseProps {
  items:        ItineraryItem[]
  rawText:      string
  groupLabel:   string
  dateLabel:    string
  chatInput:    string
  onChatChange: (v: string) => void
  onRefine:     () => void
  isStreaming:  boolean
  showMap:      boolean
  onToggleMap:  () => void
  onShare:      () => void
  copied:       boolean
}

function ItineraryPhase({
  items, rawText, groupLabel, dateLabel,
  chatInput, onChatChange, onRefine, isStreaming,
  showMap, onToggleMap, onShare, copied,
}: ItineraryPhaseProps) {
  const inputRef = useRef<HTMLInputElement>(null)

  return (
    <div style={{ display: 'flex', flexDirection: 'column' }}>
      {/* Summary bar */}
      <div style={{
        padding: '10px 16px',
        background: 'rgba(107,118,255,.07)', borderBottom: '1px solid rgba(107,118,255,.12)',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, maxWidth: 640, margin: '0 auto' }}>
          <p style={{ fontSize: 12, color: 'rgba(255,255,255,.45)', fontWeight: 600, margin: 0, flexShrink: 0 }}>
            {groupLabel} · {dateLabel}
          </p>
          <div style={{ display: 'flex', gap: 6, flexShrink: 0 }}>
            <button
              onClick={onToggleMap}
              style={{
                padding: '5px 12px', borderRadius: 8, border: '1px solid rgba(255,255,255,.12)',
                background: showMap ? 'rgba(107,118,255,.2)' : 'rgba(255,255,255,.05)',
                color: showMap ? '#a5aaff' : 'rgba(255,255,255,.5)',
                fontSize: 12, fontWeight: 700, cursor: 'pointer',
                display: 'flex', alignItems: 'center', gap: 5,
              }}
            >
              {showMap ? '📋 Aikajana' : '🗺 Kartta'}
            </button>
            <button
              onClick={onShare}
              style={{
                padding: '5px 12px', borderRadius: 8, border: '1px solid rgba(255,255,255,.12)',
                background: copied ? 'rgba(34,197,94,.12)' : 'rgba(255,255,255,.05)',
                color: copied ? '#4ade80' : 'rgba(255,255,255,.5)',
                fontSize: 12, fontWeight: 700, cursor: 'pointer',
                display: 'flex', alignItems: 'center', gap: 5,
                transition: 'background .2s ease, color .2s ease, border-color .2s ease',
              }}
            >
              {copied ? '✓ Kopioitu' : '🔗 Jaa'}
            </button>
          </div>
        </div>
      </div>

      {/* Map view */}
      {showMap && (
        <div style={{ padding: '20px 20px 0', maxWidth: 640, margin: '0 auto', width: '100%', boxSizing: 'border-box' }}>
          <PlannerMap items={items} />
        </div>
      )}

      {/* Timeline */}
      {!showMap && (
        <div style={{ padding: '28px 20px 160px', maxWidth: 640, margin: '0 auto', width: '100%', boxSizing: 'border-box' }}>
          {items.length > 0 ? (
            items.map((item, i) => (
              <TimelineItem key={i} item={item} isLast={i === items.length - 1} index={i} />
            ))
          ) : (
            <div style={{
              padding: '20px 22px', borderRadius: 14,
              background: 'rgba(255,255,255,.04)', border: '1px solid rgba(255,255,255,.08)',
              fontSize: 14, lineHeight: 1.8, color: 'rgba(255,255,255,.8)',
              whiteSpace: 'pre-wrap',
            }}>
              {rawText}
            </div>
          )}
        </div>
      )}

      {/* Map also shows a scrollable number list below */}
      {showMap && items.length > 0 && (
        <div style={{ padding: '14px 20px 160px', maxWidth: 640, margin: '0 auto', width: '100%', boxSizing: 'border-box' }}>
          {items.map((item, i) => (
            <div key={i} style={{
              display: 'flex', alignItems: 'flex-start', gap: 12,
              padding: '10px 0',
              borderBottom: i < items.length - 1 ? '1px solid rgba(255,255,255,.06)' : 'none',
              animation: `fadeUp .3s ${Math.min(i * 0.04, 0.4)}s ease both`,
            }}>
              <span style={{
                flexShrink: 0, width: 24, height: 24, borderRadius: '50%',
                background: item.coords ? '#6b76ff' : 'rgba(107,118,255,.25)',
                color: '#fff', fontSize: 11, fontWeight: 900,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                marginTop: 1,
              }}>
                {i + 1}
              </span>
              <div style={{ flex: 1, minWidth: 0 }}>
                <span style={{ fontSize: 11, color: '#6b76ff', fontWeight: 800 }}>{item.time || '—'}</span>
                {' '}
                <span style={{ fontSize: 13, fontWeight: 700, color: '#fff' }}>{item.title}</span>
                {item.location && (
                  <span style={{ fontSize: 12, color: 'rgba(255,255,255,.38)', display: 'block', marginTop: 2 }}>
                    📍 {item.location}
                  </span>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Fixed chat input */}
      <div style={{
        position: 'fixed', bottom: 0, left: 0, right: 0, zIndex: 20,
        padding: '12px 16px',
        paddingBottom: 'calc(12px + env(safe-area-inset-bottom, 0px))',
        background: 'rgba(10,10,12,.97)', backdropFilter: 'blur(20px)',
        borderTop: '1px solid rgba(255,255,255,.08)',
      }}>
        <div style={{ display: 'flex', gap: 8, maxWidth: 640, margin: '0 auto' }}>
          <input ref={inputRef}
            value={chatInput}
            onChange={e => onChatChange(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); onRefine() } }}
            placeholder="Muokkaa suunnitelmaa… esim. 'Lisää keikka' tai 'Sopiiko lapsille?'"
            className="planner-input"
            style={{
              flex: 1, padding: '12px 16px', borderRadius: 12,
              border: '1px solid rgba(255,255,255,.14)',
              background: 'rgba(255,255,255,.06)', color: '#fff',
              fontSize: 14, fontFamily: 'inherit',
            }}
          />
          <button onClick={onRefine}
            disabled={!chatInput.trim() || isStreaming}
            style={{
              padding: '12px 18px', borderRadius: 12, border: 'none', cursor: 'pointer',
              background: chatInput.trim() && !isStreaming
                ? 'linear-gradient(150deg,#6b76ff,#5059e6)'
                : 'rgba(255,255,255,.08)',
              color: chatInput.trim() && !isStreaming ? '#fff' : 'rgba(255,255,255,.25)',
              fontSize: 14, fontWeight: 800, whiteSpace: 'nowrap',
              transition: 'background .18s ease, color .18s ease',
            }}>
            {isStreaming ? '…' : 'Muokkaa ↗'}
          </button>
        </div>
      </div>
    </div>
  )
}

function TimelineItem({
  item, isLast, index,
}: {
  item:   ItineraryItem
  isLast: boolean
  index:  number
}) {
  const mapsUrl = item.location
    ? `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(item.location + ' Helsinki')}`
    : null

  return (
    <div style={{
      display: 'flex', gap: 16, marginBottom: isLast ? 0 : 20,
      animation: `fadeUp .3s ${Math.min(index * 0.06, 0.5)}s ease both`,
    }}>
      {/* Time + connector line */}
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', minWidth: 48 }}>
        <span style={{ fontSize: 12, fontWeight: 800, color: '#6b76ff', whiteSpace: 'nowrap', marginTop: 14 }}>
          {item.time || '·'}
        </span>
        {!isLast && (
          <div style={{
            width: 1.5, flex: 1, minHeight: 20, marginTop: 6,
            background: 'linear-gradient(to bottom, rgba(107,118,255,.35), rgba(107,118,255,.08))',
          }} />
        )}
      </div>

      {/* Card */}
      <div style={{
        flex: 1, marginBottom: 4,
        background: 'rgba(255,255,255,.04)',
        border: '1px solid rgba(255,255,255,.08)',
        borderLeft: '2.5px solid rgba(107,118,255,.55)',
        borderRadius: '0 12px 12px 0',
        padding: '14px 16px',
      }}>
        <h3 style={{ fontSize: 15, fontWeight: 900, letterSpacing: '-.01em', marginBottom: 8, lineHeight: 1.3 }}>
          {item.title}
        </h3>

        {/* Meta chips */}
        {(item.location || item.duration || item.price) && (
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 8 }}>
            {item.location && <MetaChip icon="📍" text={item.location} />}
            {item.duration && <MetaChip icon="⏱" text={item.duration} />}
            {item.price    && <MetaChip icon="💰" text={item.price}    />}
          </div>
        )}

        {/* Description */}
        {item.description && (
          <p style={{ fontSize: 13, color: 'rgba(255,255,255,.52)', lineHeight: 1.65, margin: 0, marginBottom: 10 }}>
            {item.description}
          </p>
        )}

        {/* Action links */}
        {(item.eventUrl || mapsUrl) && (
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginTop: item.description ? 0 : 4 }}>
            {item.eventUrl && (
              <a
                href={item.eventUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="action-link"
                style={{
                  display: 'inline-flex', alignItems: 'center', gap: 4,
                  padding: '4px 10px', borderRadius: 6, textDecoration: 'none',
                  background: 'rgba(107,118,255,.16)', border: '1px solid rgba(107,118,255,.4)',
                  color: '#a5aaff', fontSize: 12, fontWeight: 700,
                }}
              >
                🎟 Liput
              </a>
            )}
            {mapsUrl && (
              <a
                href={mapsUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="action-link"
                style={{
                  display: 'inline-flex', alignItems: 'center', gap: 4,
                  padding: '4px 10px', borderRadius: 6, textDecoration: 'none',
                  background: 'rgba(255,255,255,.05)', border: '1px solid rgba(255,255,255,.1)',
                  color: 'rgba(255,255,255,.4)', fontSize: 12, fontWeight: 700,
                }}
              >
                🗺 Avaa kartassa
              </a>
            )}
          </div>
        )}
      </div>
    </div>
  )
}

function MetaChip({ icon, text }: { icon: string; text: string }) {
  return (
    <span style={{
      display: 'inline-flex', alignItems: 'center', gap: 4,
      padding: '3px 8px', borderRadius: 6,
      background: 'rgba(255,255,255,.06)',
      fontSize: 12, color: 'rgba(255,255,255,.48)',
    }}>
      {icon} {text}
    </span>
  )
}

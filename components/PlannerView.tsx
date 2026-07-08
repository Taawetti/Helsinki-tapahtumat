'use client'

import { useState, useRef, useEffect } from 'react'
import Link from 'next/link'

// ─── Types ────────────────────────────────────────────────────────────────────

type Phase = 'onboarding' | 'generating' | 'itinerary'
type GroupType = 'solo' | 'couple' | 'family' | 'friends' | 'business'
type ChatMessage = { role: 'user' | 'assistant'; content: string }

interface ItineraryItem {
  time: string
  title: string
  location: string
  duration: string
  price: string
  description: string
}

// ─── Constants ────────────────────────────────────────────────────────────────

const GROUP_OPTIONS: Array<{ value: GroupType; emoji: string; label: string }> = [
  { value: 'solo',     emoji: '🧍', label: 'Yksin'         },
  { value: 'couple',   emoji: '💑', label: 'Pari'          },
  { value: 'family',   emoji: '👨‍👩‍👧', label: 'Perhe'    },
  { value: 'friends',  emoji: '👯', label: 'Kaveriporukka'  },
  { value: 'business', emoji: '💼', label: 'Liikematka'     },
]

const INTEREST_OPTIONS = [
  { value: 'tapahtumat', label: 'Tapahtumat', emoji: '🎭' },
  { value: 'ruoka',      label: 'Hyvä ruoka', emoji: '🍽' },
  { value: 'kulttuuri',  label: 'Kulttuuri',  emoji: '🏛'  },
  { value: 'yoelama',    label: 'Yöelämä',    emoji: '🌙' },
  { value: 'luonto',     label: 'Luonto',     emoji: '🌿' },
  { value: 'lapset',     label: 'Lapsiystävällistä', emoji: '👶' },
  { value: 'urheilu',    label: 'Urheilu',    emoji: '⚽' },
  { value: 'shoppailu',  label: 'Shoppailu',  emoji: '🛍'  },
]

// ─── Date helpers (client-side only) ─────────────────────────────────────────

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

  // Split on clock emoji (each block starts a new item)
  const raw = text.startsWith('🕘') ? text : text.replace(/^[\s\S]*?(?=🕘)/, '')
  const blocks = raw.split(/(?=🕘)/).filter(b => b.trim().includes('🕘'))

  return blocks.map(block => {
    const lines = block.split('\n').map(l => l.trim()).filter(Boolean)

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
      header
        .replace(/🕘\s*[\d:.]+\s*[—–-]\s*/, '')
        .replace(/\*\*/g, '')
        .trim()
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

// ─── PlannerView ──────────────────────────────────────────────────────────────

export default function PlannerView() {
  const [phase, setPhase]         = useState<Phase>('onboarding')
  const [groupType, setGroupType] = useState<GroupType | null>(null)
  const [travelDate, setTravelDate] = useState('')
  const [dayCount, setDayCount]   = useState(1)
  const [interests, setInterests] = useState<string[]>([])
  const [streamText, setStreamText] = useState('')
  const [itinerary, setItinerary] = useState<ItineraryItem[]>([])
  const [chatMsgs, setChatMsgs]   = useState<ChatMessage[]>([])
  const [chatInput, setChatInput] = useState('')
  const [isStreaming, setIsStreaming] = useState(false)
  const [error, setError]         = useState<string | null>(null)

  const accumRef   = useRef('')
  const bottomRef  = useRef<HTMLDivElement>(null)

  // Auto-scroll itinerary as it streams
  useEffect(() => {
    if (phase === 'generating' && streamText) {
      bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
    }
  }, [streamText, phase])

  const toggleInterest = (v: string) =>
    setInterests(p => p.includes(v) ? p.filter(i => i !== v) : [...p, v])

  async function streamItinerary(msgs: ChatMessage[]) {
    setPhase('generating')
    setIsStreaming(true)
    setError(null)
    accumRef.current = ''
    setStreamText('')

    try {
      const res = await fetch('/api/plan', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          groupType,
          travelDate,
          dayCount,
          interests,
          messages: msgs,
        }),
      })

      if (!res.ok || !res.body) throw new Error(`HTTP ${res.status}`)

      const reader = res.body.getReader()
      const dec    = new TextDecoder()
      let buf      = ''

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
            if (ev.text) {
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
      const newMsgs: ChatMessage[] = [
        ...msgs,
        { role: 'assistant', content: finalText },
      ]

      setChatMsgs(newMsgs)
      setItinerary(parsed)
      setPhase('itinerary')
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
    setStreamText('')
    setItinerary([])
    setChatMsgs([])
    setChatInput('')
    setError(null)
  }

  const dateQuickOptions = [
    { label: 'Tänään',   iso: isoOffset(0) },
    { label: 'Huomenna', iso: isoOffset(1) },
    { label: 'Lauantai', iso: nextSaturdayISO() },
  ]

  const durationOptions = [
    { label: 'Yksi päivä',   value: 1 },
    { label: 'Kaksi päivää', value: 2 },
    { label: '3+ päivää',    value: 3 },
  ]

  const groupLabel   = GROUP_OPTIONS.find(g => g.value === groupType)?.label || ''
  const isReady      = !!groupType && !!travelDate

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
        .chip-btn { transition: all .18s ease }
        .chip-btn:hover { opacity: .9 }
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
                        border:      `1px solid ${sel ? '#6b76ff' : 'rgba(255,255,255,.1)'}`,
                        background:   sel ? 'rgba(107,118,255,.18)' : 'rgba(255,255,255,.04)',
                        color:        sel ? '#fff' : 'rgba(255,255,255,.6)',
                        fontWeight:  700, fontSize: 13,
                      }}>
                      <span style={{ fontSize: 28 }}>{opt.emoji}</span>
                      {opt.label}
                    </button>
                  )
                })}
              </div>
            </OnboardingSection>

            {/* Step 2: Date (revealed after group type) */}
            {groupType && (
              <OnboardingSection label="Milloin?" delay>
                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 12 }}>
                  {dateQuickOptions.map(opt => {
                    const sel = travelDate === opt.iso
                    return (
                      <button key={opt.iso} className="chip-btn"
                        onClick={() => setTravelDate(opt.iso)}
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

            {/* Step 4: Interests (optional multi-select) */}
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
              </OnboardingSection>
            )}

            {/* CTA */}
            {isReady && (
              <div style={{ marginTop: 32, animation: 'fadeUp .35s ease' }}>
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
                </p>
              </div>
            )}
          </div>
        )}

        {/* ─ GENERATING ─ */}
        {phase === 'generating' && (
          <div style={{ padding: '48px 24px', maxWidth: 580, margin: '0 auto' }}>
            {/* Icon + status */}
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

            {/* Streaming text preview */}
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
    <div style={{ marginBottom: 30, animation: delay ? 'fadeUp .35s ease' : undefined }}>
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
  items: ItineraryItem[]
  rawText: string
  groupLabel: string
  dateLabel: string
  chatInput: string
  onChatChange: (v: string) => void
  onRefine: () => void
  isStreaming: boolean
}

function ItineraryPhase({
  items, rawText, groupLabel, dateLabel,
  chatInput, onChatChange, onRefine, isStreaming,
}: ItineraryPhaseProps) {
  const inputRef = useRef<HTMLInputElement>(null)

  return (
    <div style={{ display: 'flex', flexDirection: 'column' }}>
      {/* Summary bar */}
      <div style={{
        padding: '10px 20px',
        background: 'rgba(107,118,255,.07)', borderBottom: '1px solid rgba(107,118,255,.12)',
      }}>
        <p style={{ fontSize: 12, color: 'rgba(255,255,255,.45)', fontWeight: 600 }}>
          {groupLabel} · {dateLabel}
        </p>
      </div>

      {/* Timeline */}
      <div style={{ padding: '28px 20px 160px', maxWidth: 640, margin: '0 auto', width: '100%' }}>
        {items.length > 0 ? (
          items.map((item, i) => (
            <TimelineItem key={i} item={item} isLast={i === items.length - 1} index={i} />
          ))
        ) : (
          /* Fallback — raw text if parser finds nothing (unusual, but safe) */
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
              transition: 'all .18s',
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
  item: ItineraryItem
  isLast: boolean
  index: number
}) {
  return (
    <div style={{
      display: 'flex', gap: 16, marginBottom: isLast ? 0 : 20,
      animation: `fadeUp .3s ${Math.min(index * 0.06, 0.5)}s ease both`,
    }}>
      {/* Time + connector line */}
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', minWidth: 48 }}>
        <span style={{
          fontSize: 12, fontWeight: 800, color: '#6b76ff',
          whiteSpace: 'nowrap', marginTop: 14,
        }}>
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
        <h3 style={{
          fontSize: 15, fontWeight: 900, letterSpacing: '-.01em',
          marginBottom: 8, lineHeight: 1.3,
        }}>
          {item.title}
        </h3>

        {/* Meta chips */}
        {(item.location || item.duration || item.price) && (
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 8 }}>
            {item.location && <MetaChip icon="📍" text={item.location} />}
            {item.duration && <MetaChip icon="⏱" text={item.duration} />}
            {item.price    && <MetaChip icon="💰" text={item.price} />}
          </div>
        )}

        {/* Description */}
        {item.description && (
          <p style={{ fontSize: 13, color: 'rgba(255,255,255,.52)', lineHeight: 1.65, margin: 0 }}>
            {item.description}
          </p>
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

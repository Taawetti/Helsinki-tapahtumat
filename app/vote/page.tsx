'use client'

import { Suspense, useState, useEffect } from 'react'
import { useSearchParams } from 'next/navigation'
import { Clock, MapPin, Check, Share2, ArrowLeft, ExternalLink } from 'lucide-react'
import Link from 'next/link'

export type VoteEvent = {
  id: string
  t: string    // title
  s: string    // startTime
  l?: string   // location name
  img?: string
  url?: string // ticketUrl or infoUrl
  f: boolean   // isFree
  p?: string   // price
}

const GRADIENTS = [
  'from-violet-950 via-purple-900 to-indigo-900',
  'from-rose-950 via-pink-900 to-purple-900',
  'from-cyan-950 via-teal-900 to-blue-900',
]

function fmtTime(iso: string) {
  return new Date(iso).toLocaleTimeString('fi-FI', { hour: '2-digit', minute: '2-digit' })
}

function fmtDate(iso: string) {
  return new Date(iso).toLocaleDateString('fi-FI', { weekday: 'long', day: 'numeric', month: 'long' })
}

function VoteContent() {
  const params = useSearchParams()
  const [events, setEvents] = useState<VoteEvent[]>([])
  const [voted, setVoted] = useState<string | null>(null)
  const [shared, setShared] = useState(false)

  useEffect(() => {
    const d = params.get('d')
    if (!d) return
    try {
      setEvents(JSON.parse(atob(d)))
    } catch {}
    const s = params.get('s') || ''
    const prev = localStorage.getItem(`mita-vote-${s}`)
    if (prev) setVoted(prev)
  }, [params])

  function handleVote(id: string) {
    const s = params.get('s') || ''
    localStorage.setItem(`mita-vote-${s}`, id)
    setVoted(id)
  }

  async function handleShare() {
    const url = window.location.href
    const text = 'Äänestä — mitä tehdään tänään? 👇'
    if (navigator.share) {
      try { await navigator.share({ title: 'Mitä tänään?', text, url }) } catch {}
    } else {
      await navigator.clipboard.writeText(url)
      setShared(true)
      setTimeout(() => setShared(false), 2000)
    }
  }

  if (events.length === 0) {
    return (
      <div className="min-h-screen flex items-center justify-center" style={{ background: '#08080c' }}>
        <p className="text-white/30 text-sm">Ladataan...</p>
      </div>
    )
  }

  const votedEvent = events.find(e => e.id === voted)

  return (
    <div className="min-h-screen pb-10" style={{ background: '#08080c' }}>
      {/* Header */}
      <div
        className="sticky top-0 z-10 border-b border-white/6"
        style={{ background: 'rgba(8,8,12,0.96)', backdropFilter: 'blur(20px)' }}
      >
        <div className="max-w-lg mx-auto px-4 py-3.5 flex items-center justify-between">
          <Link href="/" className="flex items-center gap-2 text-white/40 hover:text-white transition-colors text-sm font-medium">
            <ArrowLeft size={15} />
            Mitä tänään
          </Link>
          <button
            onClick={handleShare}
            className="flex items-center gap-1.5 text-xs font-bold px-3 py-1.5 rounded-full border transition-all"
            style={{
              borderColor: shared ? '#10b981' : 'rgba(168,85,247,0.4)',
              color: shared ? '#10b981' : '#c084fc',
              background: shared ? 'rgba(16,185,129,0.1)' : 'rgba(168,85,247,0.08)',
            }}
          >
            {shared ? <Check size={12} /> : <Share2 size={12} />}
            {shared ? 'Linkki kopioitu!' : 'Jaa äänestys'}
          </button>
        </div>
      </div>

      <div className="max-w-lg mx-auto px-4 pt-8 space-y-4">
        {/* Hero text */}
        <div className="text-center mb-6">
          <div className="text-3xl mb-2">🤔</div>
          <h1 className="text-white font-black text-2xl tracking-tight mb-1">Mitä tehdään tänään?</h1>
          <p className="text-white/35 text-sm">Äänestä paras vaihtoehto kavereille</p>
        </div>

        {/* Event cards */}
        {events.map((e, i) => {
          const isVoted = voted === e.id
          return (
            <button
              key={e.id}
              onClick={() => handleVote(e.id)}
              className="w-full rounded-2xl overflow-hidden text-left transition-all duration-200"
              style={{
                border: `2px solid ${isVoted ? '#a855f7' : 'rgba(255,255,255,0.07)'}`,
                background: isVoted ? 'rgba(168,85,247,0.06)' : 'rgba(255,255,255,0.02)',
                transform: isVoted ? 'scale(1.01)' : 'scale(1)',
              }}
            >
              {/* Image */}
              <div className="relative h-40">
                {e.img ? (
                  <img src={e.img} alt={e.t} className="absolute inset-0 w-full h-full object-cover" />
                ) : (
                  <div className={`absolute inset-0 bg-gradient-to-br ${GRADIENTS[i % GRADIENTS.length]}`} />
                )}
                <div className="absolute inset-0 bg-gradient-to-t from-black/85 via-black/20 to-transparent" />

                {isVoted && (
                  <div
                    className="absolute top-3 right-3 w-8 h-8 rounded-full flex items-center justify-center"
                    style={{ background: '#a855f7', boxShadow: '0 0 12px rgba(168,85,247,0.6)' }}
                  >
                    <Check size={15} className="text-white" />
                  </div>
                )}

                <div className="absolute bottom-0 left-0 right-0 p-3">
                  <p className="text-white font-bold text-base leading-snug line-clamp-2">{e.t}</p>
                </div>
              </div>

              {/* Meta */}
              <div className="px-4 py-3 flex flex-wrap items-center gap-3 text-xs">
                <span className="flex items-center gap-1 font-semibold" style={{ color: '#c084fc' }}>
                  <Clock size={10} />
                  {fmtDate(e.s)} · {fmtTime(e.s)}
                </span>
                {e.l && (
                  <span className="flex items-center gap-1 text-white/40">
                    <MapPin size={10} />
                    {e.l}
                  </span>
                )}
                {e.f
                  ? <span className="ml-auto text-emerald-400 font-bold">Maksuton</span>
                  : e.p && <span className="ml-auto text-white/40">{e.p}</span>
                }
              </div>
            </button>
          )
        })}

        {/* Post-vote CTA */}
        {voted && (
          <div
            className="rounded-2xl p-5 text-center space-y-3 border border-purple-500/20"
            style={{ background: 'rgba(168,85,247,0.06)' }}
          >
            <p className="text-white/60 text-sm">Äänesi on tallennettu ✓</p>
            {votedEvent?.url && (
              <a
                href={votedEvent.url}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl text-white text-sm font-black transition-colors"
                style={{ background: 'linear-gradient(135deg,#a855f7,#ec4899)' }}
              >
                Avaa tapahtuma
                <ExternalLink size={13} />
              </a>
            )}
            <p className="text-white/25 text-xs">
              Jaa linkki kavereille — voitte äänestää yhdessä
            </p>
          </div>
        )}
      </div>
    </div>
  )
}

export default function VotePage() {
  return (
    <Suspense>
      <VoteContent />
    </Suspense>
  )
}

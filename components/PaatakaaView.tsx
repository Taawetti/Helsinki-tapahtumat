'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import type { GroupWhen, Fiilis } from '@/lib/candidate'

// Osallistujan pysyvä anon-tunniste (localStorage).
function participantId(): string {
  if (typeof window === 'undefined') return ''
  let id = localStorage.getItem('paatakaa-voter-id')
  if (!id) { id = Math.random().toString(36).slice(2) + Date.now().toString(36); localStorage.setItem('paatakaa-voter-id', id) }
  return id
}

const WHENS: { id: GroupWhen; emoji: string; label: string }[] = [
  { id: 'tonight', emoji: '🌙', label: 'Tänä iltana' },
  { id: 'day', emoji: '☀️', label: 'Koko päivä' },
  { id: 'weekend', emoji: '🗓', label: 'Viikonloppu' },
]
const FIILIKSET: { id: Fiilis; emoji: string; label: string }[] = [
  { id: 'menoa', emoji: '🔥', label: 'Menoa' },
  { id: 'rento', emoji: '😌', label: 'Rento' },
  { id: 'kulttuuri', emoji: '🎭', label: 'Kulttuuri' },
  { id: 'ulkoilu', emoji: '🌲', label: 'Ulkoilu' },
  { id: 'ruoka', emoji: '🍽', label: 'Ruoka' },
]

export default function PaatakaaView() {
  const router = useRouter()
  const [when, setWhen] = useState<GroupWhen>('tonight')
  const [fiilis, setFiilis] = useState<Fiilis[]>([])
  const [joinCode, setJoinCode] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const toggleFiilis = (f: Fiilis) => setFiilis(cur => cur.includes(f) ? cur.filter(x => x !== f) : [...cur, f])

  async function create() {
    setLoading(true); setError(null)
    try {
      const res = await fetch('/api/group/create', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ when, fiilis, hostId: participantId() }),
      })
      const data = await res.json()
      if (!res.ok) { setError(data.error || 'Luonti epäonnistui'); setLoading(false); return }
      router.push(`/paatakaa/${data.code}`)
    } catch {
      setError('Verkkovirhe — yritä uudelleen'); setLoading(false)
    }
  }

  return (
    <main className="max-w-lg mx-auto px-4 pt-6 pb-24 space-y-7">
      <div>
        <p className="text-white/30 text-[11px] font-black uppercase tracking-[.2em] mb-1">HELSINKI</p>
        <h1 className="font-black text-white leading-none" style={{ fontSize: 'clamp(1.9rem,7vw,2.8rem)', letterSpacing: '-0.03em' }}>
          Päättäkää yhdessä
        </h1>
        <p className="text-white/50 text-[15px] font-semibold mt-2 leading-snug">
          Jaa linkki kavereille → jokainen swaippaa ehdotuksia omalla puhelimellaan → AI kutoo äänistä valmiin illan kaaren. 🍸🍽✨🎸
        </p>
      </div>

      {/* Milloin */}
      <section>
        <h2 className="text-white/70 text-[13px] font-black uppercase tracking-wide mb-2">Milloin?</h2>
        <div className="grid grid-cols-3 gap-2">
          {WHENS.map(w => {
            const active = when === w.id
            return (
              <button key={w.id} onClick={() => setWhen(w.id)}
                className="flex flex-col items-center gap-1.5 rounded-2xl py-4 transition-all active:scale-[.97]"
                style={active
                  ? { background: 'linear-gradient(150deg,#6b76ff,#5059e6)', border: '1px solid transparent', boxShadow: '0 8px 20px -8px rgba(91,101,230,.6)' }
                  : { background: 'rgba(255,255,255,.05)', border: '1px solid rgba(255,255,255,.09)' }}>
                <span className="text-2xl leading-none">{w.emoji}</span>
                <span className="text-[12.5px] font-black" style={{ color: active ? '#fff' : 'rgba(255,255,255,.6)' }}>{w.label}</span>
              </button>
            )
          })}
        </div>
      </section>

      {/* Fiilis (valinnainen) */}
      <section>
        <h2 className="text-white/70 text-[13px] font-black uppercase tracking-wide mb-2">
          Fiiliksellä <span className="text-white/30 normal-case font-bold">· valinnainen</span>
        </h2>
        <div className="flex flex-wrap gap-2">
          {FIILIKSET.map(f => {
            const active = fiilis.includes(f.id)
            return (
              <button key={f.id} onClick={() => toggleFiilis(f.id)}
                className="flex items-center gap-1.5 rounded-full px-3.5 py-2 transition-all active:scale-[.97]"
                style={active
                  ? { background: 'rgba(107,118,255,.2)', border: '1px solid rgba(107,118,255,.5)' }
                  : { background: 'rgba(255,255,255,.05)', border: '1px solid rgba(255,255,255,.09)' }}>
                <span className="text-[15px] leading-none">{f.emoji}</span>
                <span className="text-[13px] font-black" style={{ color: active ? '#fff' : 'rgba(255,255,255,.55)' }}>{f.label}</span>
              </button>
            )
          })}
        </div>
        <p className="text-white/25 text-[12px] font-semibold mt-2">Fiilis vain painottaa — ei rajaa mitään pois.</p>
      </section>

      {error && <p className="text-red-400/80 text-sm font-bold">{error}</p>}

      <button onClick={create} disabled={loading}
        className="w-full rounded-2xl py-4 text-white font-black text-[16px] transition-all active:scale-[.98] disabled:opacity-60"
        style={{ background: 'linear-gradient(150deg,#6b76ff,#5059e6)', boxShadow: '0 12px 28px -10px rgba(91,101,230,.7)' }}>
        {loading ? 'Kootaan pakkaa…' : 'Luo ja jaa 🔗'}
      </button>

      {/* Liity koodilla */}
      <section className="pt-2 border-t border-white/8">
        <h2 className="text-white/50 text-[12px] font-black uppercase tracking-wide mb-2">Onko sinulla koodi?</h2>
        <div className="flex gap-2">
          <input value={joinCode} onChange={e => setJoinCode(e.target.value.toUpperCase().slice(0, 4))}
            placeholder="ABCD" maxLength={4}
            className="flex-1 rounded-xl px-4 py-3 text-white font-black text-lg tracking-[.3em] uppercase outline-none"
            style={{ background: 'rgba(255,255,255,.05)', border: '1px solid rgba(255,255,255,.12)' }} />
          <Link href={joinCode.length === 4 ? `/paatakaa/${joinCode}` : '#'}
            className="rounded-xl px-5 flex items-center font-black text-sm"
            style={{ background: joinCode.length === 4 ? 'rgba(255,255,255,.1)' : 'rgba(255,255,255,.04)', color: joinCode.length === 4 ? '#fff' : 'rgba(255,255,255,.3)' }}>
            Liity →
          </Link>
        </div>
      </section>
    </main>
  )
}

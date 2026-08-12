'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'

// Anonymi osallistuja-id — sama localStorage-avain kuin PaatakaaSession/PaatakaaView,
// jotta tunnus säilyy istunnosta toiseen. (Pieni omatoiminen helper: EI importata
// PaatakaaSessionista, joka on iso klienttikomponentti.)
function participantId(): string {
  if (typeof window === 'undefined') return ''
  try {
    let id = localStorage.getItem('paatakaa-voter-id')
    if (!id) { id = Math.random().toString(36).slice(2) + Date.now().toString(36); localStorage.setItem('paatakaa-voter-id', id) }
    return id
  } catch {
    // Privaattitila / estetty localStorage → sessiokohtainen id muistissa
    return Math.random().toString(36).slice(2) + Date.now().toString(36)
  }
}

// Salainen host-tunniste (24+ merkkiä) — tallennetaan vain omaan selaimeen +
// palvelimelle (ei koskaan jaeta) → todistaa host-oikeuden ilman julkista id:tä.
function genHostSecret(): string {
  return Math.random().toString(36).slice(2) + Math.random().toString(36).slice(2) + Date.now().toString(36)
}

interface Props {
  variant?: 'compact' | 'hero'
  className?: string
}

// ⚡ Pikapäätösnappi: luo valmiiksi täytetyn "tänä iltana"-arc-session yhdellä
// klikkauksella ja ohjaa suoraan jakoon (/paatakaa/KOODI?share=1 avaa jakodialogin).
export default function QuickDecideButton({ variant = 'compact', className = '' }: Props) {
  const router = useRouter()
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const decide = async () => {
    if (loading) return // tuplaklikkaus-esto
    setLoading(true); setError(null)
    const hostSecret = genHostSecret()
    try {
      const res = await fetch('/api/group/create', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          when: 'tonight',
          fiilis: [],
          mode: 'arc',
          hostId: participantId(),
          hostSecret,
          areas: [],
          budget: 'any',
        }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) { setError(data.error || 'Luonti epäonnistui — yritä uudelleen'); setLoading(false); return }
      // Host-tunniste vain omaan selaimeen → sessiosivu tunnistaa luojan.
      try { localStorage.setItem(`paatakaa-host-${data.code}`, hostSecret) } catch { /* privaattitila */ }
      router.push(`/paatakaa/${data.code}?share=1`)
    } catch {
      setError('Verkkovirhe — yritä uudelleen'); setLoading(false)
    }
  }

  const spinner = (
    <span className="inline-block w-4 h-4 rounded-full border-2 border-white/40 border-t-white animate-spin" />
  )

  if (variant === 'hero') {
    return (
      <div className={className}>
        <button onClick={decide} disabled={loading}
          className="w-full rounded-2xl py-4 px-5 text-white font-black text-[16px] disabled:opacity-70 hover:opacity-90 active:scale-[0.98] transition-all flex items-center justify-center gap-2"
          style={{ background: 'linear-gradient(150deg,#6b76ff,#5059e6)', boxShadow: '0 12px 28px -10px rgba(91,101,230,.7)' }}>
          {loading && spinner}
          {loading ? 'Luodaan päätöstä…' : 'Päätä porukalla 30 sek ⚡'}
        </button>
        {error && <p className="text-red-400/80 text-xs font-bold text-center mt-2">{error}</p>}
      </div>
    )
  }

  return (
    <span className={className}>
      <button onClick={decide} disabled={loading}
        className="inline-flex items-center gap-1.5 rounded-full px-3.5 py-2 text-[12px] font-black text-white disabled:opacity-70 hover:opacity-90 active:scale-[0.97] transition-all"
        style={{ background: 'linear-gradient(150deg,#6b76ff,#5059e6)' }}>
        {loading && spinner}
        {loading ? 'Luodaan…' : 'Päätä porukalla 30 sek ⚡'}
      </button>
      {error && <span className="block text-red-400/80 text-[11px] font-bold mt-1.5">{error}</span>}
    </span>
  )
}

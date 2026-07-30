'use client'

import { useEffect } from 'react'
import type { Candidate } from '@/lib/candidate'
import { ROLE_META } from '@/lib/candidate'

// Kortin avaus swaippauksen aikana (onTap) — koko informaatio ennen äänestystä.
// Bottom sheet EventDetailPanelin tyyliin: backdrop + alakori.
export default function CandidateSheet({ c, onClose }: { c: Candidate; onClose: () => void }) {
  // Esc sulkee
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  const cta = c.url
    ? c.type === 'event' ? 'Liput / lisätiedot →' : c.type === 'restaurant' ? 'Verkkosivu →' : 'Lisätiedot →'
    : null

  return (
    <>
      <div className="fixed inset-0 z-40 bg-black/60" onClick={onClose} aria-hidden />
      <div
        role="dialog"
        aria-modal
        aria-label={c.title}
        className="fixed inset-x-0 bottom-0 z-50 rounded-t-3xl overflow-hidden md:inset-x-auto md:right-0 md:top-0 md:bottom-0 md:rounded-none md:w-full md:max-w-lg"
      >
        <div className="max-h-[88dvh] overflow-y-auto bg-[#0e1117] shadow-2xl md:h-full">
          <div className="md:hidden flex justify-center pt-3 pb-1">
            <div className="w-10 h-1 rounded-full bg-white/20" />
          </div>

          <div className="relative h-56 w-full bg-[#1a1f2e]">
            {c.image
              ? <img src={c.image} alt={c.title} className="absolute inset-0 w-full h-full object-cover" />
              : <div className="h-full w-full flex items-center justify-center text-7xl" style={{ background: 'linear-gradient(150deg,#1e1e28,#12121a)' }}>{c.emoji}</div>}
            <button onClick={onClose} aria-label="Sulje"
              className="absolute top-3 right-3 w-9 h-9 rounded-full flex items-center justify-center text-white text-lg"
              style={{ background: 'rgba(0,0,0,.55)' }}>✕</button>
          </div>

          <div className="p-5 pb-10 space-y-3">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-[11px] font-black px-2.5 py-1 rounded-full bg-white/10 text-white/80">
                {ROLE_META[c.role].emoji} {ROLE_META[c.role].label}
              </span>
              {c.badge && <span className="text-[10px] font-black px-2 py-0.5 rounded-full bg-amber-500/20 text-amber-300">{c.badge}</span>}
              {c.rating != null && <span className="text-[11px] font-black px-2 py-0.5 rounded-full" style={{ background: 'rgba(251,191,36,.15)', color: '#fbbf24' }}>⭐ {c.rating.toFixed(1)}{c.reviewCount ? ` (${c.reviewCount})` : ''}</span>}
              {c.priceLevel != null && <span className="text-[11px] font-black px-2 py-0.5 rounded-full bg-white/10 text-white/70">{'€'.repeat(Math.min(4, c.priceLevel))}</span>}
              {c.time && <span className="text-[10px] font-black px-2 py-0.5 rounded-full bg-white/10 text-white/70">{c.time}</span>}
              {c.isOpen === true && <span className="text-[10px] font-black px-2 py-0.5 rounded-full bg-emerald-500/20 text-emerald-300">Auki nyt</span>}
              {c.isOpen === false && <span className="text-[10px] font-black px-2 py-0.5 rounded-full bg-red-500/20 text-red-300">Kiinni nyt</span>}
              {c.isFree && <span className="text-[10px] font-black px-2 py-0.5 rounded-full bg-emerald-500/20 text-emerald-300">Ilmainen</span>}
            </div>

            <h2 className="font-black text-white text-2xl leading-tight" style={{ letterSpacing: '-0.02em' }}>{c.title}</h2>
            {c.why && <p className="text-white/70 text-[15px] leading-relaxed">{c.why}</p>}
            {c.address && (
              <a href={`https://maps.google.com/?q=${encodeURIComponent(c.address)}`} target="_blank" rel="noopener noreferrer"
                className="inline-block text-white/40 text-sm font-bold hover:text-white/70 transition-colors">
                📍 {c.address} →
              </a>
            )}

            {cta && c.url && (
              <a href={c.url} target="_blank" rel="noopener noreferrer"
                className="block w-full rounded-2xl py-3.5 text-center text-white font-black"
                style={{ background: 'linear-gradient(150deg,#6b76ff,#5059e6)' }}>
                {cta}
              </a>
            )}
          </div>
        </div>
      </div>
    </>
  )
}

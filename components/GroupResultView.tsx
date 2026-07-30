'use client'

import dynamic from 'next/dynamic'
import Link from 'next/link'
import type { GroupArcPlan } from '@/lib/group'
import { roleLabel } from '@/lib/group'

// PlannerMap lataa leafletin dynaamisesti — ei SSR:ää.
const PlannerMap = dynamic(() => import('@/components/PlannerMap'), { ssr: false })

interface Props {
  plan: GroupArcPlan
  code: string
  isHost: boolean
  busy: boolean                 // joku toiminto (kutominen/rematch) menossa
  swappingIdx: number | null
  onSwap: (i: number) => void
  onRegenerate: () => void
  onRematch: () => void
  onShare: () => void
}

// Ryhmäpäätöksen tulos: AI:n kutoma illan kaari vaiheineen, kävelysiirtymineen,
// karttoineen ja host-muokkauksineen (vaihda askel / kudo uudelleen / uusi kierros).
export default function GroupResultView({
  plan, code, isHost, busy, swappingIdx, onSwap, onRegenerate, onRematch, onShare,
}: Props) {
  const mapItems = plan.arc
    .filter(s => s.lat != null && s.lon != null)
    .map(s => ({ title: s.title, location: s.address ?? '', coords: [s.lat!, s.lon!] as [number, number] }))

  return (
    <main className="max-w-lg mx-auto px-4 pt-6 pb-24 space-y-5">
      <div>
        <p className="text-white/30 text-[11px] font-black uppercase tracking-[.2em] mb-1">PÄÄTÖS · {code}</p>
        <h1 className="font-black text-white leading-tight" style={{ fontSize: 'clamp(1.6rem,6vw,2.3rem)', letterSpacing: '-0.03em' }}>Teidän iltanne 🎉</h1>
        {plan.intro && <p className="text-white/60 text-[15px] font-semibold mt-2 leading-snug">{plan.intro}</p>}
      </div>

      <div>
        {plan.arc.map((step, i) => {
          const meta = roleLabel(step.role)
          const cta = step.url
            ? step.role === 'program' ? 'Liput / lisätiedot →' : step.role === 'food' || step.role === 'drinks' ? 'Verkkosivu →' : 'Lisätiedot →'
            : null
          return (
            <div key={`${step.cardId ?? i}-${i}`}>
              {/* Kävelysiirtymä edellisestä vaiheesta */}
              {step.travelFromPrevMin != null && (
                <div className="flex items-center gap-2 py-2 pl-5">
                  <span className="text-white/25 text-xs font-black">↓</span>
                  <span className="text-[11px] font-black px-2.5 py-1 rounded-full text-white/50" style={{ background: 'rgba(255,255,255,.05)' }}>
                    🚶 {step.travelFromPrevMin} min kävely
                  </span>
                </div>
              )}
              <div className="rounded-2xl overflow-hidden" style={{ background: 'rgba(255,255,255,.04)', border: '1px solid rgba(255,255,255,.08)' }}>
                {step.image && (
                  <div className="w-full" style={{ aspectRatio: '16/7' }}>
                    <img src={step.image} alt={step.title} className="w-full h-full object-cover" />
                  </div>
                )}
                <div className="p-4">
                  <div className="flex items-center gap-2 mb-1 flex-wrap">
                    <span className="text-lg">{step.emoji}</span>
                    <span className="text-white/40 text-[11px] font-black uppercase tracking-wide">
                      {i + 1}. vaihe · {meta.label}{step.time ? ` · ${step.time}` : ''}
                    </span>
                    {step.superMatch && (
                      <span className="text-[10px] font-black px-2 py-0.5 rounded-full bg-amber-500/20 text-amber-300">
                        🎉 TÄYSOSUMA
                      </span>
                    )}
                  </div>
                  <h3 className="font-black text-white text-[17px] leading-tight">{step.title}</h3>
                  <div className="flex items-center gap-2 flex-wrap mt-1">
                    {step.rating != null && <span className="text-[11px] font-black" style={{ color: '#fbbf24' }}>⭐ {step.rating.toFixed(1)}</span>}
                    {step.badge && <span className="text-[10px] font-black px-2 py-0.5 rounded-full bg-amber-500/20 text-amber-300">{step.badge}</span>}
                    {step.isFree && <span className="text-[10px] font-black px-2 py-0.5 rounded-full bg-emerald-500/20 text-emerald-300">Ilmainen</span>}
                    {step.priceLevel != null && <span className="text-[11px] font-black text-white/50">{'€'.repeat(Math.min(4, step.priceLevel))}</span>}
                  </div>
                  {step.why && <p className="text-white/60 text-sm mt-1.5 leading-snug">{step.why}</p>}
                  {step.address && (
                    <a href={`https://maps.google.com/?q=${encodeURIComponent(step.address)}`} target="_blank" rel="noopener noreferrer"
                      className="inline-block text-white/40 text-xs font-bold mt-1.5 hover:text-white/70 transition-colors">
                      📍 {step.address} →
                    </a>
                  )}
                  <div className="flex items-center gap-3 mt-2.5">
                    {cta && step.url && (
                      <a href={step.url} target="_blank" rel="noopener noreferrer"
                        className="inline-block text-[#8b93ff] text-xs font-black">{cta}</a>
                    )}
                    {isHost && (
                      <button onClick={() => onSwap(i)} disabled={busy || swappingIdx !== null}
                        className="text-white/40 text-xs font-black hover:text-white/80 transition-colors disabled:opacity-40">
                        {swappingIdx === i ? '⏳ Vaihdetaan…' : '🔀 Vaihda askel'}
                      </button>
                    )}
                  </div>
                </div>
              </div>
            </div>
          )
        })}
      </div>

      {/* Koko kaaren kartta */}
      {mapItems.length >= 2 && (
        <div className="rounded-2xl overflow-hidden" style={{ border: '1px solid rgba(255,255,255,.08)' }}>
          <PlannerMap items={mapItems} />
        </div>
      )}

      {plan.outro && <p className="text-white/60 text-[15px] font-semibold leading-snug">{plan.outro}</p>}

      <div className="grid grid-cols-2 gap-3">
        <button onClick={onShare}
          className="rounded-2xl py-3.5 text-white font-black"
          style={{ background: 'linear-gradient(150deg,#6b76ff,#5059e6)' }}>
          Jaa 🔗
        </button>
        <Link href="/paatakaa"
          className="rounded-2xl py-3.5 text-center text-white/70 font-black"
          style={{ background: 'rgba(255,255,255,.08)' }}>
          Uusi päätös
        </Link>
        {isHost && (
          <>
            <button onClick={onRegenerate} disabled={busy}
              className="rounded-2xl py-3.5 text-white/80 font-black disabled:opacity-50"
              style={{ background: 'rgba(255,255,255,.08)' }}>
              {busy ? '🪄 Kudotaan…' : '🔄 Kudo uudelleen'}
            </button>
            <button onClick={onRematch} disabled={busy}
              className="rounded-2xl py-3.5 font-black disabled:opacity-50"
              style={{ background: 'linear-gradient(150deg,#10b981,#059669)', color: '#fff' }}>
              🔁 Jatka samalla porukalla
            </button>
          </>
        )}
      </div>
    </main>
  )
}

'use client'

import { useState } from 'react'
import type { GroupArcPlan } from '@/lib/group'

// Demo-kaari etusivulla: "miltä näyttää valmis kaari?" — laiska haku vasta
// kun käyttäjä avaa esimerkin. Ei koskaan virhetilaa: jos kaaria ei saada,
// kortti vain piilotetaan (demo ei ole kriittinen polku).
export default function DemoArcCard() {
  const [open, setOpen] = useState(false)
  const [plan, setPlan] = useState<GroupArcPlan | null>(null)
  const [loading, setLoading] = useState(false)
  const [empty, setEmpty] = useState(false)

  const toggle = async () => {
    if (open) { setOpen(false); return }
    setOpen(true)
    if (plan || loading) return
    setLoading(true)
    try {
      const res = await fetch('/api/demo-kaari')
      const data = await res.json().catch(() => ({}))
      if (res.ok && data.plan?.arc?.length > 0) setPlan(data.plan as GroupArcPlan)
      else setEmpty(true)
    } catch { setEmpty(true) }
    setLoading(false)
  }

  return (
    <div className="rounded-2xl overflow-hidden" style={{ background: 'rgba(255,255,255,.03)', border: '1px solid rgba(255,255,255,.08)' }}>
      <button onClick={toggle}
        className="w-full flex items-center justify-between px-4 py-3 text-left transition-colors hover:bg-white/4">
        <span className="text-[13px] font-black text-white/70">🪄 Miltä näyttää valmis kaari? <span className="text-white/40 font-bold">— katso esimerkki oikeasta datasta</span></span>
        <span className="text-white/30 text-lg font-black leading-none">{open ? '−' : '+'}</span>
      </button>

      {open && (
        <div className="px-4 pb-4 space-y-2">
          {loading && (
            <div className="flex items-center gap-2 py-3">
              <div style={{ width: 13, height: 13, borderRadius: '50%', border: '1.5px solid rgba(107,118,255,.2)', borderTopColor: '#6b76ff', animation: 'spin 0.75s linear infinite' }} />
              <span className="text-white/45 text-[13px] font-bold">Kudotaan esimerkkiä tämän illan datasta…</span>
            </div>
          )}
          {empty && !loading && (
            <p className="text-white/40 text-[13px] font-semibold py-2">Esimerkkiä ei saatu juuri nyt — kokeile hetken kuluttua.</p>
          )}
          {plan && (
            <>
              <p className="text-white/40 text-[11px] font-black uppercase tracking-wide pt-1">Esimerkkikaari tänään</p>
              {plan.arc.map((s, i) => (
                <div key={`${s.cardId ?? i}-${i}`} className="flex items-center gap-3">
                  <span className="text-[11px] font-black text-white/45 w-12 shrink-0 text-right">{s.time?.replace(/^klo /, '') ?? ''}</span>
                  <span className="text-lg leading-none">{s.emoji}</span>
                  <span className="flex-1 min-w-0 text-[13.5px] font-bold text-white/85 truncate">{s.title}</span>
                  {s.travelFromPrevMin != null && (
                    <span className="text-[10px] font-black px-2 py-0.5 rounded-full text-white/40 shrink-0" style={{ background: 'rgba(255,255,255,.05)' }}>
                      🚶 {s.travelFromPrevMin} min
                    </span>
                  )}
                </div>
              ))}
              <p className="text-white/35 text-[11.5px] font-semibold pt-1">
                Ajat ja siirtymät ovat oikeita — aukiolot, kävelymatkat ja puskurit laskettu.
              </p>
            </>
          )}
        </div>
      )}
    </div>
  )
}

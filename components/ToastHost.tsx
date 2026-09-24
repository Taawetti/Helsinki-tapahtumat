'use client'

// Toastin piirtäjä (HANDOFF-mobiili.md §5). Yksi kappale HomeClientin
// juuressa. VAIN MOBIILISSA (md:hidden): työpöydällä "✓ Suunnitelmassa"
// -napin tila on riittävä palaute, eikä työpöytänäkymä saa muuttua.
//
// Sijainti: alapalkin (80 px + safe-area) yläpuolella 16 px — toast ei saa
// peittää navigaatiota (tarkistuslista). Häviää 3,5 s kuluttua; uusi toast
// nollaa ajastimen (id-vertailu lib/toast piilotaToastissa).

import { useEffect, useSyncExternalStore } from 'react'
import { tilaaToast, lueToast, lueToastServer, piilotaToast, type ToastToiminto } from '@/lib/toast'

const KESTO_MS = 3500

export default function ToastHost({ onToiminto }: { onToiminto: (tyyppi: ToastToiminto) => void }) {
  const toast = useSyncExternalStore(tilaaToast, lueToast, lueToastServer)

  useEffect(() => {
    if (!toast) return
    const id = toast.id
    const timer = setTimeout(() => piilotaToast(id), KESTO_MS)
    return () => clearTimeout(timer)
  }, [toast])

  if (!toast) return null

  return (
    <div
      role="status"
      aria-live="polite"
      className="md:hidden fixed left-1/2 z-[70] flex items-center gap-1.5 rounded-full whitespace-nowrap animate-toast-in"
      style={{
        bottom: 'calc(96px + env(safe-area-inset-bottom, 0px))',
        transform: 'translateX(-50%)',
        padding: '6px 6px 6px 16px',
        background: '#1a1b24',
        border: '1px solid rgba(107,118,255,.35)',
        boxShadow: '0 12px 32px -8px rgba(0,0,0,.8)',
      }}
    >
      <span className="text-[14px] font-bold text-white">✓ {toast.teksti}</span>
      {toast.toiminto && (
        <button
          type="button"
          onClick={() => { const tyyppi = toast.toiminto!.tyyppi; piilotaToast(toast.id); onToiminto(tyyppi) }}
          className="h-9 px-3.5 rounded-full text-[14px] font-black text-white"
          style={{ background: 'linear-gradient(150deg,#6b76ff,#5059e6)' }}
        >
          {toast.toiminto.label}
        </button>
      )}
    </div>
  )
}

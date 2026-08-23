'use client'

// Uutta Helsingissä -VÄLILEHTI sovelluksen sisällä. Omistajan linjaus: sama
// sisältö kuin /uutta-helsingissa-sivulla, mutta muut navigointinapit pysyvät
// näkyvissä — ei siirrytä "omalle sivulle". Data haetaan /api/uutta:sta
// (sama kokoaminen, sama välimuisti kuin SEO-sivulla).

import { useEffect, useState } from 'react'
import type { NewInHelsinki } from '@/lib/new-in-helsinki'
import NewInHelsinkiView from '@/components/NewInHelsinkiView'

export default function UuttaView() {
  const [data, setData] = useState<NewInHelsinki | null>(null)
  const [error, setError] = useState(false)

  useEffect(() => {
    fetch('/api/uutta')
      .then((r) => { if (!r.ok) throw new Error(`HTTP ${r.status}`); return r.json() })
      .then((d) => setData(d.uutta ?? null))
      .catch(() => setError(true))
  }, [])

  return (
    <main className="max-w-2xl mx-auto px-4 pt-4 pb-24 space-y-5">
      <div>
        <p className="text-white/30 text-[11px] font-black uppercase tracking-[.2em] mb-0.5">HELSINKI</p>
        <h1 className="font-black text-white leading-none" style={{ fontSize: 'clamp(1.8rem,6vw,3rem)', letterSpacing: '-0.03em' }}>
          Uutta Helsingissä
        </h1>
        {data && (
          <p className="text-white/45 text-[13px] font-bold mt-2">
            {data.months[0] ? `${data.months[0].items.length} uutta paikkaa tässä kuussa` : 'Juuri avatut ja avautuvat paikat'}
            {data.upcoming.length > 0 ? ` · ${data.upcoming.length} tulossa` : ''}
          </p>
        )}
      </div>

      {/* Latausruutu — sama muoto kuin valmis näkymä, ei hyppäystä */}
      {!data && !error && (
        <div className="space-y-4">
          <div className="rounded-[22px] skeleton-shimmer" style={{ aspectRatio: '16/9' }} />
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="rounded-xl skeleton-shimmer" style={{ height: 96 }} />
          ))}
        </div>
      )}
      {error && (
        <p className="text-white/40 text-sm py-8 text-center">
          Uutuuksien haku epäonnistui — kokeile hetken päästä uudelleen.
        </p>
      )}

      {data && <NewInHelsinkiView data={data} />}
    </main>
  )
}

'use client'

// Siirtymän kulkutapavalitsin: hakee oikeat ajat (kävely, julkiset, pyörä)
// Digitransitista (/api/matka) ja antaa autolle Google Maps -linkin —
// Digitransit ei reititä autoa, eikä keksittyä autoaikaa näytetä.
// Valittu kulkutapa + kesto tallentuvat askeleeseen ja koko aikataulu
// lasketaan sillä (lib/suunnitelma asetaKulkutapa → sovitaAjat).
//
// Sama kuori kuin AikaValitsimessa: alhaalta nouseva paneeli, paluuele ja
// Escape sulkevat, fokusloukku.

import { useEffect, useRef, useState } from 'react'
import { X, Loader2 } from 'lucide-react'
import { useLanguage } from '@/contexts/LanguageContext'
import { useDialogiFokus } from '@/hooks/useDialogiFokus'
import { useTaaksepain } from '@/hooks/useTaaksepain'
import type { Kulkutapa } from '@/lib/suunnitelma'

interface MatkaAjat {
  kavely: number | null
  julkinen: number | null
  pyora: number | null
}

interface Props {
  otsikko: string
  mista: { lat: number; lon: number }
  minne: { lat: number; lon: number }
  /** Suunnitelman päivä (YYYY-MM-DD) ja lähtöaika "HH:MM" julkisten hakuun. */
  paiva?: string
  lahtoKlo?: string
  /** Nykyinen valinta + paikallinen kävelyarvio varalle. */
  valittu?: Kulkutapa
  kavelyArvioMin?: number
  onValitse: (tapa: Kulkutapa, min: number) => void
  onSulje: () => void
}

export default function KulkutapaValitsin({ otsikko, mista, minne, paiva, lahtoKlo, valittu, kavelyArvioMin, onValitse, onSulje }: Props) {
  const { t } = useLanguage()
  const panelRef = useRef<HTMLDivElement>(null)
  useDialogiFokus(true, panelRef, onSulje)
  useTaaksepain(true, onSulje)

  const [ajat, setAjat] = useState<MatkaAjat | null>(null)
  const [virhe, setVirhe] = useState(false)

  useEffect(() => {
    let peruttu = false
    const q = new URLSearchParams({ from: `${mista.lat},${mista.lon}`, to: `${minne.lat},${minne.lon}` })
    if (paiva) q.set('paiva', paiva)
    if (lahtoKlo) q.set('klo', lahtoKlo)
    fetch(`/api/matka?${q}`)
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(String(r.status)))))
      .then((d: MatkaAjat) => { if (!peruttu) setAjat(d) })
      .catch(() => { if (!peruttu) setVirhe(true) })
    return () => { peruttu = true }
  }, [mista.lat, mista.lon, minne.lat, minne.lon, paiva, lahtoKlo])

  // Kävelylle on aina arvo: pitkillä matkoilla Digitransit ei reititä
  // kävelyä, jolloin oma haversine-arvio kelpaa.
  const kavelyMin = ajat?.kavely ?? kavelyArvioMin ?? null
  const lataa = !ajat && !virhe

  const autoUrl = `https://www.google.com/maps/dir/?api=1&origin=${mista.lat},${mista.lon}&destination=${minne.lat},${minne.lon}&travelmode=driving`

  const rivit: { tapa: Kulkutapa; emoji: string; nimi: string; min: number | null }[] = [
    { tapa: 'kavely', emoji: '🚶', nimi: t('plan.mode_kavely'), min: kavelyMin },
    { tapa: 'julkinen', emoji: '🚇', nimi: t('plan.mode_julkinen'), min: ajat?.julkinen ?? null },
    { tapa: 'pyora', emoji: '🚴', nimi: t('plan.mode_pyora'), min: ajat?.pyora ?? null },
  ]

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center" role="dialog" aria-modal="true">
      <div className="absolute inset-0" style={{ background: 'rgba(0,0,0,.62)', backdropFilter: 'blur(4px)' }} onClick={onSulje} />
      <div ref={panelRef} tabIndex={-1}
        className="relative w-full sm:max-w-md rounded-t-3xl sm:rounded-3xl outline-none p-5 pb-7 animate-sheet-up"
        style={{ background: '#111219', border: '1px solid rgba(255,255,255,.1)', boxShadow: '0 -18px 60px rgba(0,0,0,.6)' }}>
        <div className="flex items-start justify-between gap-3 mb-4">
          <div>
            <p className="text-white font-black text-[17px]">{t('plan.mode_title')}</p>
            <p className="text-white/40 text-[12.5px] font-bold mt-0.5">{otsikko}</p>
          </div>
          <button onClick={onSulje} aria-label={t('common.close')}
            className="p-2 rounded-full text-white/60 hover:text-white" style={{ background: 'rgba(255,255,255,.07)' }}>
            <X size={17} />
          </button>
        </div>

        {lataa ? (
          <div className="flex items-center gap-2 text-white/45 text-[13px] font-bold py-6 justify-center">
            <Loader2 size={15} className="animate-spin" /> HSL…
          </div>
        ) : (
          <div className="space-y-2">
            {virhe && <p className="text-[12.5px] font-bold" style={{ color: '#ff9f43' }}>{t('plan.mode_virhe')}</p>}
            {rivit.map((r) => {
              const kaytettavissa = r.min !== null
              const aktiivinen = valittu === r.tapa || (!valittu && r.tapa === 'kavely')
              return (
                <button key={r.tapa} disabled={!kaytettavissa}
                  onClick={() => kaytettavissa && onValitse(r.tapa, r.min!)}
                  className="w-full flex items-center gap-3 rounded-2xl p-3.5 text-left transition-all active:scale-[.98] disabled:opacity-40"
                  style={{
                    background: aktiivinen ? 'rgba(107,118,255,.14)' : 'rgba(255,255,255,.05)',
                    border: `1px solid ${aktiivinen ? 'rgba(107,118,255,.5)' : 'rgba(255,255,255,.09)'}`,
                  }}>
                  <span className="text-[20px]" aria-hidden>{r.emoji}</span>
                  <span className="flex-1 font-bold text-white/90 text-[14.5px]">{r.nimi}</span>
                  <span className="font-black text-[15px] tabular-nums" style={{ color: kaytettavissa ? '#a3abff' : 'rgba(255,255,255,.35)' }}>
                    {kaytettavissa ? `${r.min} min` : t('plan.mode_ei_reittia')}
                  </span>
                </button>
              )
            })}
            <a href={autoUrl} target="_blank" rel="noopener noreferrer"
              className="w-full flex items-center gap-3 rounded-2xl p-3.5 text-left transition-all active:scale-[.98]"
              style={{ background: 'rgba(255,255,255,.05)', border: '1px solid rgba(255,255,255,.09)' }}>
              <span className="text-[20px]" aria-hidden>🚗</span>
              <span className="flex-1 font-bold text-white/90 text-[14.5px]">{t('plan.mode_auto')}</span>
              <span className="text-white/35 font-bold" aria-hidden>↗</span>
            </a>
            <p className="text-center text-white/25 text-[10.5px] font-bold pt-1">{t('plan.mode_lahde')}</p>
          </div>
        )}
      </div>
    </div>
  )
}

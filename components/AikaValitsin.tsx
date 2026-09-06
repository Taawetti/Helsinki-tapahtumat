'use client'

// iPhone-herätyskellotyylinen kellonajan rullavalitsin (omistaja 6.9.2026:
// natiivi <input type="time"> on puhelimella kömpelö). Kaksi pystyrullaa
// (tunnit + minuutit 5 min askelin) scroll-snapilla — keskirivin arvo on
// valinta. Toimii sormella (vieritys), hiiren rullalla ja napauttamalla
// arvoa. Pohjalevy alhaalta kuten muutkin sovelluksen paneelit.

import { useEffect, useRef } from 'react'
import { useLanguage } from '@/contexts/LanguageContext'
import { useDialogiFokus } from '@/hooks/useDialogiFokus'
import { useTaaksepain } from '@/hooks/useTaaksepain'

const RIVI = 40 // px — rullan rivikorkeus; snap ja valinta lasketaan tästä

function Rulla({ arvot, valittu, onValinta }: {
  arvot: string[]
  valittu: string
  onValinta: (v: string) => void
}) {
  const ref = useRef<HTMLDivElement>(null)
  const ajastin = useRef<ReturnType<typeof setTimeout> | null>(null)

  // Alkukohta valitun kohdalle (ilman animaatiota).
  useEffect(() => {
    const el = ref.current
    if (!el) return
    const i = Math.max(0, arvot.indexOf(valittu))
    el.scrollTop = i * RIVI
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const onScroll = () => {
    if (ajastin.current) clearTimeout(ajastin.current)
    ajastin.current = setTimeout(() => {
      const el = ref.current
      if (!el) return
      const i = Math.max(0, Math.min(arvot.length - 1, Math.round(el.scrollTop / RIVI)))
      onValinta(arvot[i])
    }, 90)
  }

  return (
    <div className="relative flex-1" style={{ height: RIVI * 5 }}>
      <div ref={ref} onScroll={onScroll}
        className="h-full overflow-y-auto scrollbar-none"
        style={{ scrollSnapType: 'y mandatory', paddingTop: RIVI * 2, paddingBottom: RIVI * 2 }}>
        {arvot.map((v) => (
          <button key={v}
            onClick={() => { ref.current?.scrollTo({ top: arvot.indexOf(v) * RIVI, behavior: 'smooth' }); onValinta(v) }}
            className="w-full text-center font-black text-[20px] transition-colors"
            style={{ height: RIVI, lineHeight: `${RIVI}px`, scrollSnapAlign: 'center', color: v === valittu ? '#fff' : 'rgba(255,255,255,.28)' }}>
            {v}
          </button>
        ))}
      </div>
      {/* Keskirivin korostus + häivytys ylä/ala — iOS-rullan ilme */}
      <div className="pointer-events-none absolute inset-x-0" style={{ top: RIVI * 2, height: RIVI, borderTop: '1px solid rgba(107,118,255,.4)', borderBottom: '1px solid rgba(107,118,255,.4)', background: 'rgba(107,118,255,.08)', borderRadius: 10 }} />
      <div className="pointer-events-none absolute inset-x-0 top-0" style={{ height: RIVI * 1.5, background: 'linear-gradient(#111118, transparent)' }} />
      <div className="pointer-events-none absolute inset-x-0 bottom-0" style={{ height: RIVI * 1.5, background: 'linear-gradient(transparent, #111118)' }} />
    </div>
  )
}

const TUNNIT = Array.from({ length: 24 }, (_, i) => String(i).padStart(2, '0'))
const MINUUTIT = Array.from({ length: 12 }, (_, i) => String(i * 5).padStart(2, '0'))

export default function AikaValitsin({ otsikko, arvo, onValmis, onAuto, onSulje }: {
  otsikko: string
  /** "HH:MM" — avaushetken aika (auto-ehdotus tai käsin asetettu). */
  arvo: string
  onValmis: (klo: string) => void
  /** Näytetään "Palauta automaattiseksi" jos annettu (rivit; ei aloitusajalle pakko). */
  onAuto?: () => void
  onSulje: () => void
}) {
  const { t } = useLanguage()
  const ref = useRef<HTMLDivElement>(null)
  useDialogiFokus(true, ref, onSulje)
  useTaaksepain(true, onSulje)

  const [alkuH, alkuM] = arvo.split(/[:.]/)
  const tunti = useRef(TUNNIT.includes(alkuH) ? alkuH : '18')
  // Pyöristys lähimpään 5 minuuttiin rullan askeliin.
  const minLahin = String(Math.min(55, Math.round(Number(alkuM ?? 0) / 5) * 5)).padStart(2, '0')
  const minuutti = useRef(MINUUTIT.includes(minLahin) ? minLahin : '00')

  return (
    <div className="fixed inset-0 z-[60] flex items-end sm:items-center justify-center">
      <div className="absolute inset-0 bg-black/70" onClick={onSulje} />
      <div ref={ref} role="dialog" aria-modal tabIndex={-1} aria-label={otsikko}
        className="relative w-full sm:max-w-xs rounded-t-3xl sm:rounded-2xl p-5 pb-7"
        style={{ background: '#111118', border: '1px solid rgba(255,255,255,.1)' }}>
        <p className="text-white/45 text-[12px] font-black uppercase tracking-[.1em] mb-3 text-center">{otsikko}</p>
        <div className="flex items-stretch gap-1 max-w-[220px] mx-auto">
          <Rulla arvot={TUNNIT} valittu={tunti.current} onValinta={(v) => { tunti.current = v }} />
          <span className="self-center font-black text-white/40 text-[20px] pb-1">:</span>
          <Rulla arvot={MINUUTIT} valittu={minuutti.current} onValinta={(v) => { minuutti.current = v }} />
        </div>
        <div className="flex flex-col gap-2 mt-5">
          <button onClick={() => onValmis(`${tunti.current}:${minuutti.current}`)}
            className="w-full py-3 rounded-xl font-black text-white text-[14px] active:scale-[.99] transition-all"
            style={{ background: 'linear-gradient(150deg,#6b76ff,#5059e6)' }}>
            {t('picker.done')}
          </button>
          {onAuto && (
            <button onClick={onAuto}
              className="w-full py-2.5 rounded-xl font-bold text-white/50 hover:text-white text-[13px] border border-white/10 transition-colors">
              {t('picker.auto')}
            </button>
          )}
        </div>
      </div>
    </div>
  )
}

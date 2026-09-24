'use client'

// Yhteinen bottom sheet (HANDOFF-mobiili.md §9).
//
// Kuori on sama kuin VibePanelissa, joka oli koodikannan ainoa "oikea" sheet:
// #111118, 28 px yläkulmat, vetokahva 36 × 4, taustahimmennys rgba(0,0,0,.72)
// + blur(6px), sisääntulo translateY(100 %) → 0 .32 s cubic-bezier(.32,1,.3,1).
// Käyttö: ⋯-valikko, Kaupunginosat, Oppaat (ListSheet-rivit ≥ 60 px).
//
// Paneeli on AINA DOM:issa (liukuanimaatio tarvitsee molemmat tilat) ja
// suljettuna inert — muuten sen napit jäisivät Tab-järjestykseen
// näkymättöminä (sama oppi kuin VibePanelissa). Jokainen kerros rekisteröi
// itsensä paluupinoon (useTaaksepain) ja fokushallintaan (useDialogiFokus),
// joten selaimen paluuele sulkee sheetin eikä sovellusta.

import { useEffect, useRef, type ReactNode } from 'react'
import { useDialogiFokus } from '@/hooks/useDialogiFokus'
import { useTaaksepain } from '@/hooks/useTaaksepain'
import { useLanguage } from '@/contexts/LanguageContext'

interface Props {
  open: boolean
  onClose: () => void
  /** Otsikko 20 px. Ilman otsikkoa yläosa jää kutsujan varaan (children). */
  title?: string
  subtitle?: string
  ariaLabel?: string
  /** Enimmäiskorkeus — listasheetit 85 %, aihepiirit 90 %. */
  maxHeight?: string
  children: ReactNode
  /** Alaosa (esim. iso CTA) — pysyy paikallaan kun sisältö vierii. */
  footer?: ReactNode
}

export default function BottomSheet({ open, onClose, title, subtitle, ariaLabel, maxHeight = '85vh', children, footer }: Props) {
  const { t } = useLanguage()
  const panelRef = useRef<HTMLDivElement>(null)
  useDialogiFokus(open, panelRef)
  useTaaksepain(open, onClose)

  useEffect(() => {
    if (!open) return
    const edellinen = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => { document.body.style.overflow = edellinen }
  }, [open])

  useEffect(() => {
    if (!open) return
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    document.addEventListener('keydown', handler)
    return () => document.removeEventListener('keydown', handler)
  }, [open, onClose])

  return (
    <>
      <div
        onClick={onClose}
        aria-hidden
        className="fixed inset-0 z-40 transition-opacity duration-300"
        style={{
          background: 'rgba(0,0,0,.72)',
          backdropFilter: 'blur(6px)',
          WebkitBackdropFilter: 'blur(6px)',
          opacity: open ? 1 : 0,
          pointerEvents: open ? 'all' : 'none',
        }}
      />
      <div
        ref={panelRef}
        role="dialog"
        aria-modal={open || undefined}
        aria-label={ariaLabel ?? title}
        tabIndex={-1}
        inert={!open}
        className="fixed bottom-0 left-0 right-0 z-50 flex flex-col"
        style={{
          background: '#111118',
          borderRadius: '28px 28px 0 0',
          borderTop: '1px solid rgba(255,255,255,.1)',
          maxHeight,
          transform: open ? 'translateY(0)' : 'translateY(100%)',
          transition: 'transform .32s cubic-bezier(.32,1,.3,1)',
          paddingBottom: 'env(safe-area-inset-bottom, 0px)',
          pointerEvents: open ? 'all' : 'none',
        }}
      >
        {/* Vetokahva 36 × 4 */}
        <div className="absolute top-2.5 left-1/2 -translate-x-1/2 w-9 h-1 rounded-full" style={{ background: 'rgba(255,255,255,.18)' }} />

        {title && (
          <div className="flex items-start justify-between gap-3 px-5 pt-6 pb-2 shrink-0">
            <div className="min-w-0">
              <p className="font-black text-white text-[20px]" style={{ letterSpacing: '-0.03em' }}>{title}</p>
              {subtitle && <p className="text-[14px] font-semibold mt-0.5" style={{ color: 'rgba(255,255,255,.5)' }}>{subtitle}</p>}
            </div>
            <button
              type="button"
              onClick={onClose}
              aria-label={t('common.close')}
              className="shrink-0 w-11 h-11 rounded-full flex items-center justify-center text-base transition-all hover:bg-white/14"
              style={{ background: 'rgba(255,255,255,.08)', color: 'rgba(255,255,255,.7)' }}
            >
              ✕
            </button>
          </div>
        )}

        <div className="overflow-y-auto flex-1 min-h-0">{children}</div>

        {footer && (
          <div className="px-5 pt-2 pb-6 shrink-0" style={{ borderTop: '1px solid rgba(255,255,255,.06)' }}>{footer}</div>
        )}
      </div>
    </>
  )
}

// ── Listasheet: rivit ≥ 60 px, otsikko 16 px + alaotsikko 13 px ─────────────

export interface SheetRivi {
  id: string
  emoji: string
  title: string
  sub?: string
  onClick: () => void
  /** Aktiivinen valinta (esim. valittu kaupunginosa) korostetaan. */
  active?: boolean
}

export function ListSheet({ open, onClose, title, rivit }: { open: boolean; onClose: () => void; title: string; rivit: SheetRivi[] }) {
  return (
    <BottomSheet open={open} onClose={onClose} title={title}>
      <div className="flex flex-col gap-1 px-3 pb-7 pt-1">
        {rivit.map((r) => (
          <button
            key={r.id}
            type="button"
            onClick={r.onClick}
            className="w-full text-left flex items-center gap-3.5 min-h-[60px] px-3 py-2.5 rounded-[14px] text-white transition-colors active:bg-white/6"
            style={r.active ? { background: 'rgba(107,118,255,.12)' } : undefined}
          >
            <span className="text-[24px] leading-none w-8 text-center shrink-0">{r.emoji}</span>
            <span className="min-w-0 flex flex-col gap-0.5">
              <span className="text-[16px] font-extrabold" style={{ letterSpacing: '-0.01em', color: r.active ? '#c7caff' : '#fff' }}>{r.title}</span>
              {r.sub && <span className="text-[13px] font-medium truncate" style={{ color: 'rgba(255,255,255,.5)' }}>{r.sub}</span>}
            </span>
          </button>
        ))}
      </div>
    </BottomSheet>
  )
}

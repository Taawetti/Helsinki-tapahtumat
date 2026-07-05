'use client'

import { useEffect } from 'react'
import { VIBES } from '@/lib/types'
import { useLanguage } from '@/contexts/LanguageContext'
import type { TranslationKey } from '@/lib/i18n'

interface Props {
  open: boolean
  active: string[]
  onToggle: (id: string) => void
  onClear: () => void
  onClose: () => void
}

export default function VibePanel({ open, active, onToggle, onClear, onClose }: Props) {
  const { t } = useLanguage()

  useEffect(() => {
    if (open) document.body.style.overflow = 'hidden'
    else document.body.style.overflow = ''
    return () => { document.body.style.overflow = '' }
  }, [open])

  useEffect(() => {
    if (!open) return
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    document.addEventListener('keydown', handler)
    return () => document.removeEventListener('keydown', handler)
  }, [open, onClose])

  const n = active.length

  return (
    <>
      {/* Backdrop */}
      <div
        onClick={onClose}
        className="fixed inset-0 z-40 transition-opacity duration-300"
        style={{
          background: 'rgba(0,0,0,.72)',
          backdropFilter: 'blur(6px)',
          WebkitBackdropFilter: 'blur(6px)',
          opacity: open ? 1 : 0,
          pointerEvents: open ? 'all' : 'none',
        }}
      />

      {/* Panel */}
      <div
        className="fixed bottom-0 left-0 right-0 z-50 flex flex-col"
        style={{
          background: '#111118',
          borderRadius: '28px 28px 0 0',
          borderTop: '1px solid rgba(255,255,255,.1)',
          maxHeight: '90vh',
          transform: open ? 'translateY(0)' : 'translateY(100%)',
          transition: 'transform .32s cubic-bezier(.32,1,.3,1)',
          paddingBottom: 'env(safe-area-inset-bottom, 0)',
          pointerEvents: open ? 'all' : 'none',
        }}
      >
        {/* Drag handle */}
        <div
          className="absolute top-2.5 left-1/2 -translate-x-1/2 w-9 h-1 rounded-full"
          style={{ background: 'rgba(255,255,255,.18)' }}
        />

        {/* Header */}
        <div className="flex items-start justify-between px-5 pt-6 shrink-0">
          <div>
            <p className="font-black text-white text-xl" style={{ letterSpacing: '-0.03em' }}>
              {t('vibes.title')}
            </p>
            <p className="text-sm font-semibold mt-0.5" style={{ color: 'rgba(255,255,255,.45)' }}>
              {t('vibes.subtitle')}
            </p>
          </div>
          <button
            onClick={onClose}
            className="w-9 h-9 rounded-full flex items-center justify-center text-base transition-all hover:bg-white/14"
            style={{ background: 'rgba(255,255,255,.08)', color: 'rgba(255,255,255,.5)' }}
          >
            ✕
          </button>
        </div>

        {/* Vibe grid */}
        <div
          className="grid gap-2.5 p-5 overflow-y-auto flex-1"
          style={{ gridTemplateColumns: 'repeat(3, minmax(0, 1fr))' }}
        >
          {/* Kaikki — shows all events as flat list, active only when explicitly selected */}
          {(() => {
            const isKaikki = active.includes('kaikki')
            return (
              <button
                onClick={() => onToggle('kaikki')}
                className="flex flex-col items-center gap-2 py-4 rounded-[18px] transition-all active:scale-[.96]"
                style={isKaikki
                  ? { background: 'rgba(107,118,255,.13)', border: '1.5px solid rgba(107,118,255,.45)' }
                  : { background: 'rgba(255,255,255,.05)', border: '1.5px solid rgba(255,255,255,.08)' }
                }
              >
                <span
                  className="text-[28px] leading-none"
                  style={{
                    transform: isKaikki ? 'scale(1.18)' : 'scale(1)',
                    transition: 'transform .15s',
                    display: 'block',
                  }}
                >
                  ✨
                </span>
                <span
                  className="text-[11px] font-black text-center leading-tight px-1"
                  style={{ color: isKaikki ? '#a3abff' : 'rgba(255,255,255,.45)' }}
                >
                  Kaikki
                </span>
              </button>
            )
          })()}

          {VIBES.map((v) => {
            const isActive = active.includes(v.id)
            return (
              <button
                key={v.id}
                onClick={() => onToggle(v.id)}
                className="flex flex-col items-center gap-2 py-4 rounded-[18px] transition-all active:scale-[.96]"
                style={isActive
                  ? { background: 'rgba(107,118,255,.13)', border: '1.5px solid rgba(107,118,255,.45)' }
                  : { background: 'rgba(255,255,255,.05)', border: '1.5px solid rgba(255,255,255,.08)' }
                }
              >
                <span
                  className="text-[28px] leading-none"
                  style={{
                    transform: isActive ? 'scale(1.18)' : 'scale(1)',
                    transition: 'transform .15s',
                    display: 'block',
                  }}
                >
                  {v.emoji}
                </span>
                <span
                  className="text-[11px] font-black text-center leading-tight px-1"
                  style={{ color: isActive ? '#a3abff' : 'rgba(255,255,255,.45)' }}
                >
                  {t(v.tKey as TranslationKey)}
                </span>
              </button>
            )
          })}
        </div>

        {/* Clear */}
        {n > 0 && (
          <div className="text-center py-1 shrink-0">
            <button
              onClick={onClear}
              className="text-sm font-bold px-4 py-2 rounded-xl transition-all hover:text-white/70"
              style={{ color: 'rgba(255,255,255,.35)' }}
            >
              {t('vibes.clear')}
            </button>
          </div>
        )}

        {/* CTA */}
        <div className="px-5 pt-2 pb-6 shrink-0" style={{ borderTop: '1px solid rgba(255,255,255,.06)' }}>
          <button
            onClick={onClose}
            className="w-full py-4 rounded-2xl font-black text-base text-white transition-all active:scale-[.98] hover:opacity-90"
            style={{
              background: 'linear-gradient(150deg,#6b76ff,#5059e6)',
              boxShadow: '0 12px 32px -8px rgba(91,101,230,.55)',
              letterSpacing: '-0.01em',
            }}
          >
            {n === 0 ? t('vibes.show_all') : `${t('vibes.show_events')} · ${n} ${n > 1 ? t('vibes.categories') : t('vibes.category')}`}
          </button>
        </div>
      </div>
    </>
  )
}

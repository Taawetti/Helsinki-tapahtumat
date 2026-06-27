'use client'

import { VIBES } from '@/lib/types'
import { useLanguage } from '@/contexts/LanguageContext'
import type { TranslationKey } from '@/lib/i18n'

interface Props {
  active: string[]
  onToggle: (id: string) => void
  onClearAll?: () => void
}

export default function VibeBar({ active, onToggle, onClearAll }: Props) {
  const { t } = useLanguage()
  const allActive = active.length === 0
  return (
    <div className="flex gap-2 overflow-x-auto scrollbar-none pb-0.5 -mx-4 px-4">
      {/* Kaikki-pilleri */}
      <button
        onClick={() => onClearAll?.()}
        className="shrink-0 flex items-center gap-1.5 px-3.5 py-2 rounded-full text-sm font-bold border transition-all"
        style={allActive
          ? { background: 'linear-gradient(150deg,#6b76ff,#5059e6)', color: '#fff', borderColor: 'transparent', boxShadow: '0 4px 12px -4px rgba(91,101,230,.5)' }
          : { color: 'rgba(255,255,255,.45)', borderColor: 'rgba(255,255,255,.08)', background: 'rgba(255,255,255,.03)' }
        }
      >
        Kaikki
      </button>
      {VIBES.map((v) => {
        const isActive = active.includes(v.id)
        return (
          <button
            key={v.id}
            onClick={() => onToggle(v.id)}
            className="shrink-0 flex items-center gap-1.5 px-3.5 py-2 rounded-full text-sm font-bold border transition-all"
            style={isActive
              ? { background: 'linear-gradient(150deg,#6b76ff,#5059e6)', color: '#fff', borderColor: 'transparent', boxShadow: '0 4px 12px -4px rgba(91,101,230,.5)' }
              : { color: 'rgba(255,255,255,.45)', borderColor: 'rgba(255,255,255,.08)', background: 'rgba(255,255,255,.03)' }
            }
          >
            <span className="text-base leading-none">{v.emoji}</span>
            {t(v.tKey as TranslationKey)}
          </button>
        )
      })}
    </div>
  )
}

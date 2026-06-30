'use client'

import { VIBES } from '@/lib/types'
import { useLanguage } from '@/contexts/LanguageContext'
import type { TranslationKey } from '@/lib/i18n'

interface Props {
  active: string[]
  onToggle: (id: string) => void
  onClearAll?: () => void
}

export default function VibeBar({ active, onToggle }: Props) {
  const { t } = useLanguage()
  return (
    <div className="grid grid-cols-2 gap-2.5">
      {VIBES.map((v) => {
        const isActive = active.includes(v.id)
        return (
          <button
            key={v.id}
            onClick={() => onToggle(v.id)}
            className="flex items-center gap-3 rounded-2xl px-4 py-4 text-left transition-all active:scale-[.97]"
            style={isActive
              ? { background: 'rgba(107,118,255,.12)', border: '1px solid rgba(107,118,255,.4)' }
              : { background: 'rgba(255,255,255,.04)', border: '1px solid rgba(255,255,255,.07)' }
            }
          >
            <span className="text-[22px] leading-none flex-shrink-0">{v.emoji}</span>
            <span
              className="font-black text-[13px] leading-tight"
              style={{ letterSpacing: '-0.01em', color: isActive ? '#a3abff' : 'rgba(255,255,255,.6)' }}
            >
              {t(v.tKey as TranslationKey)}
            </span>
          </button>
        )
      })}
    </div>
  )
}

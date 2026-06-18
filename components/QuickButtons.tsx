'use client'

import { useLanguage } from '@/contexts/LanguageContext'
import type { TranslationKey } from '@/lib/i18n'

const OPTIONS: { id: string; emoji: string; tKey: TranslationKey }[] = [
  { id: 'ei-tieda',    emoji: '🎲', tKey: 'quick.dont_know' },
  { id: 'ilmainen',    emoji: '🎁', tKey: 'quick.free_activities' },
  { id: 'outo',        emoji: '🌀', tKey: 'quick.something_weird' },
  { id: 'viela-ehtii', emoji: '⚡', tKey: 'quick.still_time' },
]

interface Props {
  onAction: (id: string) => void
}

export default function QuickButtons({ onAction }: Props) {
  const { t } = useLanguage()
  return (
    <div className="flex gap-2 overflow-x-auto scrollbar-none -mx-4 px-4">
      {OPTIONS.map(({ id, emoji, tKey }) => (
        <button
          key={id}
          onClick={() => onAction(id)}
          className="shrink-0 flex items-center gap-1.5 px-3.5 py-2 rounded-full text-sm font-bold border border-white/8 bg-white/4 text-white/55 hover:bg-white/8 hover:text-white/85 hover:border-white/15 active:scale-95 transition-all"
        >
          <span className="text-base leading-none">{emoji}</span>
          <span>{t(tKey)}</span>
        </button>
      ))}
    </div>
  )
}

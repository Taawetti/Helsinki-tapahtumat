'use client'

import { VIBES, Vibe } from '@/lib/types'

interface Props {
  active: string[]
  onToggle: (id: string) => void
}

export default function VibeBar({ active, onToggle }: Props) {
  return (
    <div className="flex gap-2 overflow-x-auto scrollbar-none pb-0.5">
      {VIBES.map((v) => {
        const isActive = active.includes(v.id)
        return (
          <button
            key={v.id}
            onClick={() => onToggle(v.id)}
            className={`shrink-0 flex items-center gap-1.5 px-3.5 py-2 rounded-full text-sm font-bold border transition-all ${
              isActive
                ? 'text-white border-purple-500/60 bg-purple-500/20 shadow-sm shadow-purple-500/20'
                : 'text-white/45 border-white/8 bg-white/3 hover:text-white/70 hover:border-white/18'
            }`}
          >
            <span className="text-base leading-none">{v.emoji}</span>
            {v.label}
          </button>
        )
      })}
    </div>
  )
}

'use client'

const OPTIONS = [
  { id: 'ei-tieda',    emoji: '🎲', label: 'En tiedä mitä haluan' },
  { id: 'ilmainen',    emoji: '🎁', label: 'Ilmaista tekemistä' },
  { id: 'yksin',       emoji: '🚶', label: 'Yksin tekemistä' },
  { id: 'lapset',      emoji: '🧒', label: 'Lasten kanssa' },
  { id: 'outo',        emoji: '🌀', label: 'Jotain outoa' },
  { id: 'viela-ehtii', emoji: '⚡', label: 'Tänään vielä ehtii' },
]

interface Props {
  onAction: (id: string) => void
}

export default function QuickButtons({ onAction }: Props) {
  return (
    <div className="flex flex-wrap gap-2">
      {OPTIONS.map(({ id, emoji, label }) => (
        <button
          key={id}
          onClick={() => onAction(id)}
          className="flex items-center gap-1.5 px-3.5 py-2 rounded-full text-sm font-bold border border-white/8 bg-white/4 text-white/55 hover:bg-white/8 hover:text-white/85 hover:border-white/15 active:scale-95 transition-all"
        >
          <span className="text-base leading-none">{emoji}</span>
          <span>{label}</span>
        </button>
      ))}
    </div>
  )
}

'use client'

import { NEIGHBORHOODS, Neighborhood } from '@/lib/types'

interface Props {
  activeMunicipality: string
  activeNeighborhood: string | null
  onSelect: (n: Neighborhood | null) => void
}

const MUNICIPALITY_FILTER: Record<string, string> = {
  helsinki: 'Helsinki',
  espoo: 'Espoo',
  vantaa: 'Vantaa',
}

export default function NeighborhoodTiles({ activeMunicipality, activeNeighborhood, onSelect }: Props) {
  const visible = NEIGHBORHOODS.filter((n) => n.municipality === activeMunicipality)

  return (
    <div className="space-y-3">
      {/* Municipality tabs */}
      <div className="flex gap-1 bg-white/5 p-1 rounded-xl w-fit">
        {Object.entries(MUNICIPALITY_FILTER).map(([id, label]) => (
          <button
            key={id}
            onClick={() => onSelect(null)}
            className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${activeMunicipality === id ? 'bg-white/12 text-white' : 'text-white/30 hover:text-white/60'}`}
          >
            {label}
          </button>
        ))}
      </div>

      {/* Neighborhood grid */}
      <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-5 gap-2">
        {/* "Kaikki" tile */}
        <button
          onClick={() => onSelect(null)}
          className={`relative flex flex-col justify-between p-3.5 rounded-xl border text-left transition-all duration-150 hover:-translate-y-0.5 active:scale-95 min-h-[80px] ${
            activeNeighborhood === null
              ? 'border-purple-500/60 bg-purple-500/15'
              : 'border-white/8 bg-white/4 hover:bg-white/8 hover:border-white/15'
          }`}
        >
          <span className="text-2xl leading-none">🌆</span>
          <div>
            <p className={`text-sm font-black leading-tight ${activeNeighborhood === null ? 'text-purple-300' : 'text-white'}`}>
              Kaikki
            </p>
            <p className="text-white/30 text-[10px] font-medium truncate">{MUNICIPALITY_FILTER[activeMunicipality]}</p>
          </div>
          {activeNeighborhood === null && (
            <div className="absolute top-2 right-2 w-1.5 h-1.5 rounded-full bg-purple-400 animate-pulse-glow" />
          )}
        </button>

        {visible.map((n) => {
          const isActive = activeNeighborhood === n.id
          return (
            <button
              key={n.id}
              onClick={() => onSelect(isActive ? null : n)}
              className={`relative flex flex-col justify-between p-3.5 rounded-xl border text-left transition-all duration-150 hover:-translate-y-0.5 active:scale-95 min-h-[80px] overflow-hidden ${
                isActive
                  ? 'border-purple-500/60 bg-purple-500/12'
                  : 'border-white/7 bg-white/3 hover:bg-white/7 hover:border-white/15'
              }`}
            >
              {/* Subtle gradient bg */}
              <div className={`absolute inset-0 bg-gradient-to-br ${n.color} opacity-30`} />

              <div className="relative">
                <span className="text-xl leading-none">{n.emoji}</span>
              </div>
              <div className="relative">
                <p className={`text-sm font-black leading-tight ${isActive ? 'text-purple-300' : 'text-white'}`}>
                  {n.name}
                </p>
                <p className="text-white/30 text-[10px] font-medium truncate mt-0.5">{n.vibe}</p>
              </div>

              {isActive && (
                <div className="absolute top-2 right-2 w-1.5 h-1.5 rounded-full bg-purple-400 animate-pulse-glow" />
              )}
            </button>
          )
        })}
      </div>
    </div>
  )
}

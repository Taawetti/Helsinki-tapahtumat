'use client'

import { CATEGORIES, DateFilter, PriceFilter } from '@/lib/types'

interface ActiveFilters {
  dateFilter: DateFilter
  priceFilter: PriceFilter
  activeCategories: string[]
  municipality: string
}

interface Props {
  active: ActiveFilters
  onDateChange: (f: DateFilter) => void
  onMunicipalityChange: (m: string) => void
  onCategoryToggle: (id: string) => void
  onPriceChange: (p: PriceFilter) => void
  onClearAll: () => void
}

const DATE_CHIPS: { value: DateFilter; label: string }[] = [
  { value: 'today', label: 'Tänään' },
  { value: 'tonight', label: '🌙 Illalla' },
  { value: 'tomorrow', label: 'Huomenna' },
  { value: 'weekend', label: '🎉 Viikonloppu' },
  { value: 'week', label: 'Viikko' },
  { value: 'month', label: 'Kuukausi' },
]

const CITIES = ['helsinki', 'espoo', 'vantaa']

export default function QuickFilters({ active, onDateChange, onMunicipalityChange, onCategoryToggle, onPriceChange, onClearAll }: Props) {
  const hasActiveFilters = active.activeCategories.length > 0 || active.priceFilter !== 'all'

  return (
    <div className="space-y-3">
      {/* Date + City row */}
      <div className="flex gap-2 flex-wrap items-center">
        {/* Date pills */}
        <div className="flex gap-1 bg-white/5 p-1 rounded-xl overflow-x-auto scrollbar-none">
          {DATE_CHIPS.map((d) => {
            const isActive = active.dateFilter === d.value
            return (
              <button
                key={d.value}
                onClick={() => onDateChange(d.value)}
                className={`px-3 py-1.5 rounded-lg text-xs font-semibold whitespace-nowrap transition-all ${isActive ? 'text-white shadow-sm' : 'text-white/50 hover:text-white/80'}`}
                style={isActive ? { background: 'linear-gradient(135deg, #a855f7, #ec4899)' } : {}}
              >
                {d.label}
              </button>
            )
          })}
        </div>

        {/* City pills */}
        <div className="flex gap-1 bg-white/5 p-1 rounded-xl">
          {CITIES.map((c) => (
            <button
              key={c}
              onClick={() => onMunicipalityChange(c)}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold capitalize transition-all ${
                active.municipality === c
                  ? 'bg-white/15 text-white'
                  : 'text-white/50 hover:text-white/80'
              }`}
            >
              {c.charAt(0).toUpperCase() + c.slice(1)}
            </button>
          ))}
        </div>

        {/* Price filter */}
        <div className="flex gap-1 bg-white/5 p-1 rounded-xl">
          {([['all', 'Kaikki'], ['free', '🎁 Ilmaiset'], ['paid', '🎟 Maksulliset']] as [PriceFilter, string][]).map(([val, label]) => (
            <button
              key={val}
              onClick={() => onPriceChange(val)}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold whitespace-nowrap transition-all ${
                active.priceFilter === val
                  ? 'bg-white/15 text-white'
                  : 'text-white/50 hover:text-white/80'
              }`}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      {/* Category grid */}
      <div className="flex flex-wrap gap-2">
        {CATEGORIES.map((cat) => {
          const isActive = active.activeCategories.includes(cat.id)
          return (
            <button
              key={cat.id}
              onClick={() => onCategoryToggle(cat.id)}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-semibold border transition-all ${
                isActive
                  ? 'border-purple-500/60 text-purple-300 bg-purple-500/15'
                  : 'border-white/10 text-white/45 hover:border-white/25 hover:text-white/70'
              }`}
            >
              <span>{cat.emoji}</span>
              {cat.label}
            </button>
          )
        })}

        {hasActiveFilters && (
          <button
            onClick={onClearAll}
            className="px-3 py-1.5 rounded-full text-xs text-white/30 hover:text-white/60 border border-white/8 hover:border-white/20 transition-all"
          >
            ✕ Tyhjennä
          </button>
        )}
      </div>
    </div>
  )
}

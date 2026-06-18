'use client'

import { DateFilter, PriceFilter, CATEGORIES } from '@/lib/types'
import { useLanguage } from '@/contexts/LanguageContext'
import type { TranslationKey } from '@/lib/i18n'

interface Props {
  dateFilter: DateFilter
  onDateChange: (f: DateFilter) => void
  municipality: string
  onMunicipalityChange: (m: string) => void
  activeCategories: string[]
  onCategoryToggle: (id: string) => void
  priceFilter: PriceFilter
  onPriceChange: (p: PriceFilter) => void
}

const DATE_OPTIONS: { value: DateFilter; tKey: TranslationKey; sub?: string }[] = [
  { value: 'today',   tKey: 'date.today' },
  { value: 'tonight', tKey: 'filter.tonight_short', sub: '17→' },
  { value: 'tomorrow',tKey: 'date.tomorrow' },
  { value: 'weekend', tKey: 'date.weekend' },
  { value: 'week',    tKey: 'filter.week_short' },
  { value: 'month',   tKey: 'date.month' },
]

const MUNICIPALITIES = [
  { value: 'helsinki', label: 'Helsinki' },
  { value: 'espoo', label: 'Espoo' },
  { value: 'vantaa', label: 'Vantaa' },
]

const PRICE_OPTIONS: { value: PriceFilter; tKey: TranslationKey }[] = [
  { value: 'all',  tKey: 'filter.all_price' },
  { value: 'free', tKey: 'filter.free' },
  { value: 'paid', tKey: 'filter.paid' },
]

export default function FilterBar({
  dateFilter,
  onDateChange,
  municipality,
  onMunicipalityChange,
  activeCategories,
  onCategoryToggle,
  priceFilter,
  onPriceChange,
}: Props) {
  const { t } = useLanguage()
  return (
    <div className="space-y-3">
      {/* Row 1: Date + City + Price */}
      <div className="flex flex-wrap gap-2 items-center">
        {/* Date filter */}
        <div className="flex bg-white/5 rounded-xl p-1 gap-0.5 overflow-x-auto scrollbar-none">
          {DATE_OPTIONS.map((opt) => (
            <button
              key={opt.value}
              onClick={() => onDateChange(opt.value)}
              className={`relative px-3 py-1.5 rounded-lg text-sm font-medium transition-all whitespace-nowrap ${
                dateFilter === opt.value
                  ? 'bg-[#0072C6] text-white shadow-sm shadow-[#0072C6]/40'
                  : 'text-white/50 hover:text-white/80'
              }`}
            >
              {t(opt.tKey)}
              {opt.sub && (
                <span className={`ml-1 text-[10px] ${dateFilter === opt.value ? 'text-white/70' : 'text-white/30'}`}>
                  {opt.sub}
                </span>
              )}
            </button>
          ))}
        </div>

        {/* City filter */}
        <div className="flex bg-white/5 rounded-xl p-1 gap-0.5">
          {MUNICIPALITIES.map((m) => (
            <button
              key={m.value}
              onClick={() => onMunicipalityChange(m.value)}
              className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-all ${
                municipality === m.value
                  ? 'bg-white/15 text-white'
                  : 'text-white/50 hover:text-white/80'
              }`}
            >
              {m.label}
            </button>
          ))}
        </div>

        {/* Price filter */}
        <div className="flex bg-white/5 rounded-xl p-1 gap-0.5">
          {PRICE_OPTIONS.map((p) => (
            <button
              key={p.value}
              onClick={() => onPriceChange(p.value)}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${
                priceFilter === p.value
                  ? 'bg-white/15 text-white'
                  : 'text-white/50 hover:text-white/80'
              }`}
            >
              {t(p.tKey)}
            </button>
          ))}
        </div>
      </div>

      {/* Row 2: Category chips */}
      <div className="flex flex-wrap gap-2">
        {CATEGORIES.map((cat) => {
          const active = activeCategories.includes(cat.id)
          return (
            <button
              key={cat.id}
              onClick={() => onCategoryToggle(cat.id)}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium border transition-all ${
                active
                  ? 'bg-[#0072C6]/20 border-[#0072C6] text-[#4da8e8]'
                  : 'bg-transparent border-white/12 text-white/50 hover:border-white/30 hover:text-white/70'
              }`}
            >
              <span>{cat.emoji}</span>
              {cat.label}
            </button>
          )
        })}

        {/* Clear all categories */}
        {activeCategories.length > 0 && (
          <button
            onClick={() => activeCategories.forEach((id) => onCategoryToggle(id))}
            className="px-3 py-1.5 rounded-full text-xs text-white/30 hover:text-white/60 border border-white/8 hover:border-white/20 transition-all"
          >
            {t('common.clear')}
          </button>
        )}
      </div>
    </div>
  )
}

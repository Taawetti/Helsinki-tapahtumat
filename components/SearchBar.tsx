'use client'

import { useRef, useEffect, useState } from 'react'
import { Search, X } from 'lucide-react'
import { SEARCH_SUGGESTIONS } from '@/lib/types'
import { useLanguage } from '@/contexts/LanguageContext'

interface Props {
  value: string
  onChange: (v: string) => void
}

export default function SearchBar({ value, onChange }: Props) {
  const inputRef = useRef<HTMLInputElement>(null)
  const [focused, setFocused] = useState(false)
  const { t } = useLanguage()

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault()
        inputRef.current?.focus()
      }
    }
    document.addEventListener('keydown', handler)
    return () => document.removeEventListener('keydown', handler)
  }, [])

  return (
    <div className="relative w-full max-w-md">
      <Search size={15} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-white/30 pointer-events-none" />
      <input
        ref={inputRef}
        type="search"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onFocus={() => setFocused(true)}
        onBlur={() => setTimeout(() => setFocused(false), 150)}
        placeholder={t('search.placeholder')}
        className="w-full bg-white/7 border border-white/10 rounded-xl pl-9 pr-9 py-2.5 text-sm text-white placeholder:text-white/30 focus:outline-none focus:border-[#0072C6]/60 focus:bg-white/9 transition-all"
      />
      {value && (
        <button
          onClick={() => onChange('')}
          className="absolute right-3 top-1/2 -translate-y-1/2 text-white/30 hover:text-white/60 transition-colors"
          aria-label={t('common.clear')}
        >
          <X size={14} />
        </button>
      )}

      {/* Suggestion dropdown */}
      {focused && !value && (
        <div className="absolute top-full left-0 right-0 mt-2 bg-[#131820] border border-white/10 rounded-xl shadow-2xl shadow-black/60 z-50 overflow-hidden">
          <p className="text-white/30 text-[11px] font-semibold uppercase tracking-widest px-4 pt-3 pb-1">
            {t('search.popular')}
          </p>
          {SEARCH_SUGGESTIONS.map((s) => (
            <button
              key={s}
              onClick={() => onChange(s)}
              className="w-full text-left px-4 py-2.5 text-sm text-white/60 hover:bg-white/5 hover:text-white transition-colors flex items-center gap-2"
            >
              <Search size={12} className="text-white/20 shrink-0" />
              {s}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

'use client'

import { useState, useRef, useEffect } from 'react'
import { ChevronLeft, ChevronRight, Calendar } from 'lucide-react'

const MONTHS = ['Tammikuu','Helmikuu','Maaliskuu','Huhtikuu','Toukokuu','Kesäkuu',
                 'Heinäkuu','Elokuu','Syyskuu','Lokakuu','Marraskuu','Joulukuu']
const DAYS = ['Ma','Ti','Ke','To','Pe','La','Su']

interface Props {
  value: string        // 'YYYY-MM-DD' or ''
  onChange: (v: string) => void
  size?: 'sm' | 'md'
}

function toLocalDate(iso: string) {
  const [y, m, d] = iso.split('-').map(Number)
  return new Date(y, m - 1, d)
}

export default function DatePicker({ value, onChange, size = 'md' }: Props) {
  const today = new Date()
  today.setHours(0, 0, 0, 0)

  const [open, setOpen] = useState(false)
  const [view, setView] = useState<{ year: number; month: number }>(() => {
    if (value) { const d = toLocalDate(value); return { year: d.getFullYear(), month: d.getMonth() } }
    return { year: today.getFullYear(), month: today.getMonth() }
  })
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [])

  const selected = value ? toLocalDate(value) : null
  const { year, month } = view

  // Build calendar grid (Mon-first)
  const firstDay = new Date(year, month, 1)
  const startDow = (firstDay.getDay() + 6) % 7   // 0=Mon
  const daysInMonth = new Date(year, month + 1, 0).getDate()
  const cells: (number | null)[] = [
    ...Array(startDow).fill(null),
    ...Array.from({ length: daysInMonth }, (_, i) => i + 1),
  ]
  while (cells.length % 7 !== 0) cells.push(null)

  const select = (day: number) => {
    const mm = String(month + 1).padStart(2, '0')
    const dd = String(day).padStart(2, '0')
    onChange(`${year}-${mm}-${dd}`)
    setOpen(false)
  }

  const prev = () => setView(v => v.month === 0 ? { year: v.year - 1, month: 11 } : { ...v, month: v.month - 1 })
  const next = () => setView(v => v.month === 11 ? { year: v.year + 1, month: 0 } : { ...v, month: v.month + 1 })

  const label = value
    ? toLocalDate(value).toLocaleDateString('fi-FI', { day: 'numeric', month: 'numeric' })
    : null

  const btnSm = size === 'sm'

  return (
    <div className="relative" ref={ref}>
      {/* Trigger button */}
      <button
        onClick={() => setOpen(o => !o)}
        className={`flex items-center gap-1.5 font-black transition-all border-0 rounded-full cursor-pointer ${
          btnSm
            ? 'px-3 py-1.5 text-xs'
            : 'px-4 py-2 text-sm'
        } ${
          value
            ? 'text-white shadow-lg shadow-purple-500/20'
            : 'text-white/35 bg-white/5 hover:bg-white/10 hover:text-white/65'
        }`}
        style={value ? { background: 'linear-gradient(135deg,#a855f7,#ec4899)' } : {}}
      >
        <Calendar size={btnSm ? 11 : 13} />
        {label ?? (btnSm ? 'Päivä' : 'Valitse päivä')}
      </button>

      {/* Calendar dropdown */}
      {open && (
        <div
          className="absolute z-50 mt-2 rounded-2xl shadow-2xl overflow-hidden"
          style={{
            background: 'rgba(15,10,25,0.97)',
            border: '1px solid rgba(168,85,247,0.25)',
            backdropFilter: 'blur(20px)',
            width: 280,
            left: '50%',
            transform: 'translateX(-50%)',
          }}
        >
          {/* Header */}
          <div className="flex items-center justify-between px-4 pt-4 pb-2">
            <button onClick={prev} className="p-1.5 rounded-lg text-white/40 hover:text-white hover:bg-white/8 transition-all">
              <ChevronLeft size={16} />
            </button>
            <span className="text-sm font-black text-white tracking-wide">
              {MONTHS[month]} {year}
            </span>
            <button onClick={next} className="p-1.5 rounded-lg text-white/40 hover:text-white hover:bg-white/8 transition-all">
              <ChevronRight size={16} />
            </button>
          </div>

          {/* Day-of-week labels */}
          <div className="grid grid-cols-7 px-3 pb-1">
            {DAYS.map(d => (
              <div key={d} className="text-center text-[10px] font-bold text-white/25 py-1">{d}</div>
            ))}
          </div>

          {/* Date cells */}
          <div className="grid grid-cols-7 px-3 pb-4 gap-y-0.5">
            {cells.map((day, i) => {
              if (!day) return <div key={i} />
              const thisDate = new Date(year, month, day)
              const isToday = thisDate.getTime() === today.getTime()
              const isSel = selected && thisDate.getTime() === selected.getTime()
              const isPast = thisDate < today

              return (
                <button
                  key={i}
                  onClick={() => !isPast && select(day)}
                  disabled={isPast}
                  className={`
                    w-9 h-9 mx-auto rounded-xl text-sm font-bold transition-all
                    ${isPast ? 'text-white/15 cursor-default' : 'cursor-pointer'}
                    ${isSel ? 'text-white shadow-lg shadow-purple-500/30' : ''}
                    ${!isSel && !isPast ? 'text-white/70 hover:bg-white/10 hover:text-white' : ''}
                    ${isToday && !isSel ? 'text-purple-400' : ''}
                  `}
                  style={isSel ? { background: 'linear-gradient(135deg,#a855f7,#ec4899)' } : {}}
                >
                  {day}
                </button>
              )
            })}
          </div>

          {/* Footer: clear */}
          {value && (
            <div className="border-t border-white/5 px-4 py-2.5">
              <button
                onClick={() => { onChange(''); setOpen(false) }}
                className="text-xs text-white/30 hover:text-white/60 transition-all font-semibold"
              >
                Tyhjennä valinta
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  )
}

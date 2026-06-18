'use client'

import { useState, useRef, useEffect, useCallback } from 'react'
import { createPortal } from 'react-dom'
import { ChevronLeft, ChevronRight, Calendar } from 'lucide-react'
import { useLanguage } from '@/contexts/LanguageContext'

const MONTHS_FI = ['Tammikuu','Helmikuu','Maaliskuu','Huhtikuu','Toukokuu','Kesäkuu',
                   'Heinäkuu','Elokuu','Syyskuu','Lokakuu','Marraskuu','Joulukuu']
const MONTHS_EN = ['January','February','March','April','May','June',
                   'July','August','September','October','November','December']
const DAYS_FI = ['Ma','Ti','Ke','To','Pe','La','Su']
const DAYS_EN = ['Mo','Tu','We','Th','Fr','Sa','Su']

interface Props {
  value: string
  onChange: (v: string) => void
  size?: 'sm' | 'md'
}

function toLocalDate(iso: string) {
  const [y, m, d] = iso.split('-').map(Number)
  return new Date(y, m - 1, d)
}

export default function DatePicker({ value, onChange, size = 'md' }: Props) {
  const { t, lang } = useLanguage()
  const MONTHS = lang === 'fi' ? MONTHS_FI : MONTHS_EN
  const DAYS = lang === 'fi' ? DAYS_FI : DAYS_EN
  const today = new Date()
  today.setHours(0, 0, 0, 0)

  const [open, setOpen] = useState(false)
  const [pos, setPos] = useState({ top: 0, left: 0 })
  const [view, setView] = useState<{ year: number; month: number }>(() => {
    if (value) { const d = toLocalDate(value); return { year: d.getFullYear(), month: d.getMonth() } }
    return { year: today.getFullYear(), month: today.getMonth() }
  })
  const btnRef = useRef<HTMLButtonElement>(null)
  const dropRef = useRef<HTMLDivElement>(null)

  // Close on outside click
  useEffect(() => {
    if (!open) return
    const handler = (e: MouseEvent) => {
      if (
        btnRef.current && !btnRef.current.contains(e.target as Node) &&
        dropRef.current && !dropRef.current.contains(e.target as Node)
      ) setOpen(false)
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [open])

  const openCalendar = useCallback(() => {
    if (!btnRef.current) return
    const rect = btnRef.current.getBoundingClientRect()
    const dropW = 280
    let left = rect.left + rect.width / 2 - dropW / 2
    left = Math.max(8, Math.min(left, window.innerWidth - dropW - 8))
    setPos({ top: rect.bottom + window.scrollY + 8, left })
    setOpen(o => !o)
  }, [])

  const selected = value ? toLocalDate(value) : null
  const { year, month } = view

  const firstDay = new Date(year, month, 1)
  const startDow = (firstDay.getDay() + 6) % 7
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
    ? toLocalDate(value).toLocaleDateString(lang === 'fi' ? 'fi-FI' : 'en-GB', { day: 'numeric', month: 'numeric' })
    : null

  const btnSm = size === 'sm'

  const dropdown = open && typeof document !== 'undefined' ? createPortal(
    <div
      ref={dropRef}
      style={{
        position: 'absolute',
        top: pos.top,
        left: pos.left,
        width: 280,
        zIndex: 9999,
        background: 'rgba(15,10,25,0.97)',
        border: '1px solid rgba(168,85,247,0.3)',
        backdropFilter: 'blur(24px)',
        borderRadius: 20,
        boxShadow: '0 24px 60px rgba(0,0,0,0.7), 0 0 0 1px rgba(168,85,247,0.1)',
        overflow: 'hidden',
      }}
    >
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '16px 16px 8px' }}>
        <button onClick={prev} style={{ padding: 6, borderRadius: 8, background: 'transparent', border: 'none', color: 'rgba(255,255,255,0.4)', cursor: 'pointer' }}
          onMouseEnter={e => (e.currentTarget.style.color = '#fff')}
          onMouseLeave={e => (e.currentTarget.style.color = 'rgba(255,255,255,0.4)')}>
          <ChevronLeft size={16} />
        </button>
        <span style={{ fontSize: 14, fontWeight: 900, color: '#fff', letterSpacing: '0.02em' }}>
          {MONTHS[month]} {year}
        </span>
        <button onClick={next} style={{ padding: 6, borderRadius: 8, background: 'transparent', border: 'none', color: 'rgba(255,255,255,0.4)', cursor: 'pointer' }}
          onMouseEnter={e => (e.currentTarget.style.color = '#fff')}
          onMouseLeave={e => (e.currentTarget.style.color = 'rgba(255,255,255,0.4)')}>
          <ChevronRight size={16} />
        </button>
      </div>

      {/* Day labels */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7,1fr)', padding: '0 12px 4px' }}>
        {DAYS.map(d => (
          <div key={d} style={{ textAlign: 'center', fontSize: 10, fontWeight: 700, color: 'rgba(255,255,255,0.25)', padding: '4px 0' }}>{d}</div>
        ))}
      </div>

      {/* Cells */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7,1fr)', padding: '0 12px 16px', gap: '2px 0' }}>
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
              style={{
                width: 36, height: 36, margin: '0 auto', display: 'flex', alignItems: 'center', justifyContent: 'center',
                borderRadius: 10, border: 'none', cursor: isPast ? 'default' : 'pointer',
                fontSize: 13, fontWeight: 700, transition: 'all 0.15s',
                color: isPast ? 'rgba(255,255,255,0.15)' : isSel ? '#fff' : isToday ? '#c084fc' : 'rgba(255,255,255,0.7)',
                background: isSel ? 'linear-gradient(135deg,#a855f7,#ec4899)' : 'transparent',
                boxShadow: isSel ? '0 4px 12px rgba(168,85,247,0.4)' : 'none',
              }}
              onMouseEnter={e => { if (!isPast && !isSel) e.currentTarget.style.background = 'rgba(255,255,255,0.1)' }}
              onMouseLeave={e => { if (!isPast && !isSel) e.currentTarget.style.background = 'transparent' }}
            >
              {day}
            </button>
          )
        })}
      </div>

      {/* Clear */}
      {value && (
        <div style={{ borderTop: '1px solid rgba(255,255,255,0.06)', padding: '10px 16px' }}>
          <button
            onClick={() => { onChange(''); setOpen(false) }}
            style={{ background: 'none', border: 'none', color: 'rgba(255,255,255,0.3)', fontSize: 12, fontWeight: 600, cursor: 'pointer' }}
            onMouseEnter={e => (e.currentTarget.style.color = 'rgba(255,255,255,0.6)')}
            onMouseLeave={e => (e.currentTarget.style.color = 'rgba(255,255,255,0.3)')}
          >
            {t('common.clear_selection')}
          </button>
        </div>
      )}
    </div>,
    document.body
  ) : null

  return (
    <>
      <button
        ref={btnRef}
        onClick={openCalendar}
        className={`shrink-0 flex items-center gap-1.5 font-black transition-all border-0 rounded-full cursor-pointer ${
          btnSm ? 'px-3 py-1.5 text-xs' : 'px-4 py-2 text-sm'
        } ${value ? 'text-white shadow-lg shadow-purple-500/20' : 'text-white/35 bg-white/5 hover:bg-white/10 hover:text-white/65'}`}
        style={value ? { background: 'linear-gradient(135deg,#a855f7,#ec4899)' } : {}}
      >
        <Calendar size={btnSm ? 11 : 13} />
        {label ?? t('date.custom')}
      </button>
      {dropdown}
    </>
  )
}

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
  valueEnd?: string
  onChangeRange?: (start: string, end: string) => void
  size?: 'sm' | 'md'
}

function toLocalDate(iso: string) {
  const [y, m, d] = iso.split('-').map(Number)
  return new Date(y, m - 1, d)
}

function fmtIso(year: number, month: number, day: number) {
  return `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`
}

export default function DatePicker({ value, onChange, valueEnd, onChangeRange, size = 'md' }: Props) {
  const { t, lang } = useLanguage()
  const MONTHS = lang === 'fi' ? MONTHS_FI : MONTHS_EN
  const DAYS = lang === 'fi' ? DAYS_FI : DAYS_EN
  const today = new Date()
  today.setHours(0, 0, 0, 0)

  const rangeMode = !!onChangeRange

  const [open, setOpen] = useState(false)
  const [pos, setPos] = useState({ top: 0, left: 0 })
  const [view, setView] = useState<{ year: number; month: number }>(() => {
    if (value) { const d = toLocalDate(value); return { year: d.getFullYear(), month: d.getMonth() } }
    return { year: today.getFullYear(), month: today.getMonth() }
  })
  // Range picking state: pendingStart is set after first click, cleared after second
  const [pendingStart, setPendingStart] = useState<string | null>(null)
  const [hoverDate, setHoverDate] = useState<string | null>(null)
  const btnRef = useRef<HTMLButtonElement>(null)
  const dropRef = useRef<HTMLDivElement>(null)

  // Close on outside click
  useEffect(() => {
    if (!open) return
    const handler = (e: MouseEvent) => {
      if (
        btnRef.current && !btnRef.current.contains(e.target as Node) &&
        dropRef.current && !dropRef.current.contains(e.target as Node)
      ) { setOpen(false); setPendingStart(null); setHoverDate(null) }
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
    const dateStr = fmtIso(year, month, day)

    if (!rangeMode) {
      onChange(dateStr)
      setOpen(false)
      return
    }

    if (!pendingStart) {
      // First click: set pending start, keep calendar open
      setPendingStart(dateStr)
      setHoverDate(null)
    } else {
      if (dateStr >= pendingStart) {
        // Second click: commit range
        onChangeRange!(pendingStart, dateStr)
        setPendingStart(null)
        setHoverDate(null)
        setOpen(false)
      } else {
        // Clicked before pending start: reset start to this day
        setPendingStart(dateStr)
        setHoverDate(null)
      }
    }
  }

  const prev = () => setView(v => v.month === 0 ? { year: v.year - 1, month: 11 } : { ...v, month: v.month - 1 })
  const next = () => setView(v => v.month === 11 ? { year: v.year + 1, month: 0 } : { ...v, month: v.month + 1 })

  // Determine the effective range for highlighting (committed or in-progress)
  const effectiveStart = pendingStart || value
  const effectiveEnd = pendingStart ? (hoverDate || pendingStart) : valueEnd

  const btnSm = size === 'sm'

  // Button label
  let label: string | null = null
  if (rangeMode) {
    if (value && valueEnd) {
      const s = toLocalDate(value).toLocaleDateString(lang === 'fi' ? 'fi-FI' : 'en-GB', { day: 'numeric', month: 'numeric' })
      if (value === valueEnd) {
        label = s
      } else {
        const e = toLocalDate(valueEnd).toLocaleDateString(lang === 'fi' ? 'fi-FI' : 'en-GB', { day: 'numeric', month: 'numeric' })
        label = `${s} – ${e}`
      }
    } else if (value) {
      label = toLocalDate(value).toLocaleDateString(lang === 'fi' ? 'fi-FI' : 'en-GB', { day: 'numeric', month: 'numeric' })
    }
  } else {
    label = value
      ? toLocalDate(value).toLocaleDateString(lang === 'fi' ? 'fi-FI' : 'en-GB', { day: 'numeric', month: 'numeric' })
      : null
  }

  const hasSelection = rangeMode ? !!(value || valueEnd) : !!value

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
        border: '1px solid rgba(107,118,255,0.3)',
        backdropFilter: 'blur(24px)',
        borderRadius: 20,
        boxShadow: '0 24px 60px rgba(0,0,0,0.7), 0 0 0 1px rgba(107,118,255,0.1)',
        overflow: 'hidden',
      }}
    >
      {/* Hint when picking range end */}
      {rangeMode && pendingStart && (
        <div style={{ padding: '10px 16px 0', textAlign: 'center', fontSize: 11, fontWeight: 700, color: 'rgba(107,118,255,0.8)' }}>
          {lang === 'fi' ? 'Valitse loppupäivä' : 'Select end date'}
        </div>
      )}

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
          const dateStr = fmtIso(year, month, day)
          const thisDate = new Date(year, month, day)
          const isToday = thisDate.getTime() === today.getTime()
          const isPast = thisDate < today

          // Range highlight logic
          const isStart = !!(effectiveStart && dateStr === effectiveStart)
          const isEnd = !!(effectiveEnd && dateStr === effectiveEnd && effectiveEnd !== effectiveStart)
          const isInRange = !!(effectiveStart && effectiveEnd && dateStr > effectiveStart && dateStr < effectiveEnd)

          // Single-mode: just selected
          const isSel = !rangeMode && value === dateStr

          let bg = 'transparent'
          let color = isPast ? 'rgba(255,255,255,0.15)' : isToday ? '#a3abff' : 'rgba(255,255,255,0.7)'
          let borderRadius = 10
          let boxShadow = 'none'

          if (isSel) {
            bg = 'linear-gradient(150deg,#6b76ff,#5059e6)'
            color = '#fff'
            boxShadow = '0 4px 12px rgba(91,101,230,0.4)'
          } else if (isStart || isEnd) {
            bg = 'linear-gradient(150deg,#6b76ff,#5059e6)'
            color = '#fff'
            boxShadow = '0 4px 12px rgba(91,101,230,0.4)'
          } else if (isInRange) {
            bg = 'rgba(107,118,255,0.15)'
            color = '#fff'
            borderRadius = 0
          }

          const isPlain = !isPast && !isSel && !isStart && !isEnd && !isInRange
          return (
            <button
              key={i}
              onClick={() => !isPast && select(day)}
              onMouseEnter={e => {
                if (rangeMode && pendingStart && !isPast) setHoverDate(dateStr)
                if (isPlain) e.currentTarget.style.background = 'rgba(255,255,255,0.1)'
              }}
              onMouseLeave={e => {
                if (rangeMode && pendingStart) setHoverDate(null)
                if (isPlain) e.currentTarget.style.background = bg
              }}
              disabled={isPast}
              style={{
                width: 36, height: 36, margin: '0 auto', display: 'flex', alignItems: 'center', justifyContent: 'center',
                borderRadius, border: 'none', cursor: isPast ? 'default' : 'pointer',
                fontSize: 13, fontWeight: 700, transition: 'all 0.12s',
                color, background: bg, boxShadow,
              }}
            >
              {day}
            </button>
          )
        })}
      </div>

      {/* Clear */}
      {hasSelection && (
        <div style={{ borderTop: '1px solid rgba(255,255,255,0.06)', padding: '10px 16px' }}>
          <button
            onClick={() => {
              if (rangeMode) { onChangeRange!('', ''); setPendingStart(null) }
              else onChange('')
              setOpen(false)
            }}
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
        } ${hasSelection ? 'text-white' : 'text-white/35 bg-white/5 hover:bg-white/10 hover:text-white/65'}`}
        style={hasSelection ? { background: 'linear-gradient(150deg,#6b76ff,#5059e6)', boxShadow: '0 4px 16px -4px rgba(91,101,230,0.5)' } : {}}
      >
        <Calendar size={btnSm ? 11 : 13} />
        {label ?? t('date.custom')}
      </button>
      {dropdown}
    </>
  )
}

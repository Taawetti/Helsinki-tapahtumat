'use client'

import Link from 'next/link'
import { Event } from '@/lib/types'
import { formatTime } from '@/lib/utils'
import { useLanguage } from '@/contexts/LanguageContext'

// 12 distinct dark gradients with varied angles
const GRADIENTS = [
  'linear-gradient(135deg,#1e1b4b 0%,#312e81 55%,#4c1d95 100%)',
  'linear-gradient(155deg,#4a044e 0%,#86198f 55%,#701a75 100%)',
  'linear-gradient(135deg,#0c1445 0%,#1e3a8a 55%,#1d4ed8 100%)',
  'linear-gradient(160deg,#052e16 0%,#065f46 55%,#047857 100%)',
  'linear-gradient(135deg,#450a0a 0%,#991b1b 55%,#b91c1c 100%)',
  'linear-gradient(155deg,#0c2a4a 0%,#0e4d6e 55%,#0369a1 100%)',
  'linear-gradient(135deg,#4a0520 0%,#881337 55%,#9f1239 100%)',
  'linear-gradient(160deg,#431407 0%,#78350f 55%,#92400e 100%)',
  'linear-gradient(135deg,#042f2e 0%,#0f4c35 55%,#065f46 100%)',
  'linear-gradient(155deg,#2e1065 0%,#4c1d95 55%,#6d28d9 100%)',
  'linear-gradient(135deg,#14532d 0%,#166534 55%,#15803d 100%)',
  'linear-gradient(160deg,#1c1917 0%,#292524 55%,#44403c 100%)',
]

// Accent text color per gradient (for the large decorative emoji glow)
const ACCENT_COLORS = [
  '#818cf8', '#e879f9', '#60a5fa', '#34d399',
  '#f87171', '#38bdf8', '#fb7185', '#fbbf24',
  '#2dd4bf', '#a78bfa', '#4ade80', '#94a3b8',
]

function hashIdx(id: string, mod: number): number {
  let h = 0
  for (const c of id) h = (h * 31 + c.charCodeAt(0)) & 0xffff
  return h % mod
}

function getCategoryEmoji(categories: string[]): string {
  const s = (categories.join(' ')).toLowerCase()
  if (s.includes('rock') || s.includes('metal') || s.includes('punk')) return '🎸'
  if (s.includes('jazz') || s.includes('blues')) return '🎷'
  if (s.includes('klassinen') || s.includes('ooppera') || s.includes('baleetti')) return '🎻'
  if (s.includes('musiikki') || s.includes('konsertti') || s.includes('keikka')) return '🎵'
  if (s.includes('stand-up') || s.includes('komedia') || s.includes('huumori')) return '🎤'
  if (s.includes('teatteri') || s.includes('näytelmä') || s.includes('sirkus')) return '🎭'
  if (s.includes('elokuv')) return '🎬'
  if (s.includes('tanssi')) return '💃'
  if (s.includes('urheilu') || s.includes('liikunta') || s.includes('jääkiekko') || s.includes('jalkapallo')) return '⚽'
  if (s.includes('lapset') || s.includes('perhe')) return '🎠'
  if (s.includes('ruoka') || s.includes('juoma') || s.includes('viini')) return '🍷'
  if (s.includes('festivaali') || s.includes('juhla')) return '🎪'
  if (s.includes('taide') || s.includes('galleria') || s.includes('kuvataide')) return '🎨'
  if (s.includes('klubit') || s.includes('yöelämä') || s.includes('dj')) return '🎧'
  if (s.includes('kirjallisuus') || s.includes('kirja') || s.includes('runous')) return '📖'
  if (s.includes('ulkoilu') || s.includes('luonto')) return '🌿'
  if (s.includes('pubivisa') || s.includes('visa') || s.includes('tietokilpailu')) return '🧠'
  if (s.includes('karaoke')) return '🎤'
  return '✨'
}

interface Props {
  event: Event
  onClick: (e: Event) => void
  large?: boolean
}

export default function PosterCard({ event, onClick, large }: Props) {
  const idx = hashIdx(event.id, GRADIENTS.length)
  const gradient = GRADIENTS[idx]
  const accent = ACCENT_COLORS[idx]
  const emoji = getCategoryEmoji(event.categories)
  const hasImage = !!event.image
  const { t } = useLanguage()

  return (
    <Link
      href={`/e/${encodeURIComponent(event.id)}`}
      onClick={(e) => { e.preventDefault(); onClick(event) }}
      className="group relative w-full text-left rounded-xl overflow-hidden bg-[#111] hover:scale-[1.02] active:scale-[0.97] transition-transform duration-200 focus:outline-none focus-visible:ring-2 focus-visible:ring-[#6b76ff] block"
    >
      {/* Image / text poster area */}
      <div className="relative w-full overflow-hidden" style={{ aspectRatio: large ? '16/9' : '3/4' }}>

        {/* Gradient background */}
        <div className="absolute inset-0" style={{ background: gradient }} />

        {hasImage ? (
          /* Photo card */
          <>
            <img
              src={event.image!}
              alt={event.title}
              className="absolute inset-0 w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"
              onError={e => { (e.target as HTMLElement).style.display = 'none' }}
            />
            <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/10 to-transparent" />
          </>
        ) : (
          /* Text poster — no photo */
          <>
            {/* Large decorative emoji, faded */}
            <div
              className="absolute select-none pointer-events-none leading-none"
              style={{
                fontSize: large ? '9rem' : '7rem',
                top: '-8px',
                right: '-8px',
                opacity: 0.12,
                filter: `drop-shadow(0 0 30px ${accent})`,
              }}>
              {emoji}
            </div>

            {/* Subtle bottom gradient for time chip readability */}
            <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-transparent to-transparent" />

            {/* Title text in the poster area */}
            <div className="absolute inset-0 flex flex-col justify-center px-4 py-5">
              <div
                className="text-[10px] font-black uppercase tracking-widest mb-2 opacity-60"
                style={{ color: accent }}>
                {event.categories[0] || t('common.event_default')}
              </div>
              <h3
                className={`font-black text-white leading-tight ${large ? 'text-3xl' : 'text-xl'}`}
                style={{
                  textShadow: `0 2px 20px rgba(0,0,0,0.6), 0 0 60px ${accent}22`,
                  letterSpacing: '-0.02em',
                  wordBreak: 'break-word',
                  overflowWrap: 'break-word',
                  display: '-webkit-box',
                  WebkitLineClamp: 4,
                  WebkitBoxOrient: 'vertical',
                  overflow: 'hidden',
                }}>
                {event.title}
              </h3>
              {event.location?.name && (
                <p className="mt-2 text-[11px] opacity-50 text-white font-medium truncate">
                  {event.location.name}
                </p>
              )}
            </div>
          </>
        )}

        {/* Badges */}
        <div className="absolute top-2.5 left-2.5 flex gap-1.5 flex-wrap">
          {event.isFree && (
            <span className="text-[10px] font-black px-2 py-0.5 rounded-full bg-emerald-500 text-white tracking-wide">
              {t('common.free_badge')}
            </span>
          )}
        </div>

        {/* Time chip */}
        <div className="absolute bottom-2.5 right-2.5">
          <span className="text-[11px] font-bold px-2 py-0.5 rounded-full text-white/90 bg-black/50 backdrop-blur-sm">
            {formatTime(event.startTime)}
          </span>
        </div>
      </div>

      {/* Info row — only show venue/price here to avoid title duplication on text posters */}
      <div className="px-3 pt-2.5 pb-3 space-y-0.5">
        <p className="text-white font-bold text-[13px] leading-snug line-clamp-2 group-hover:text-[#c7caff] transition-colors">
          {event.title}
        </p>
        {event.location?.name && (
          <p className="text-white/40 text-[11px] truncate">{event.location.name}</p>
        )}
        {!event.isFree && event.price && (
          <p className="text-white/30 text-[11px]">{event.price}</p>
        )}
      </div>
    </Link>
  )
}

'use client'

// Opassivujen (kirpputorit, ilmaiset museot…) jaettu paikkalista:
// aukiolotila lasketaan selaimessa (käyttäjän kello) kuten muissakin
// korteissa, valinnainen "Avoinna nyt" -suodatin.

import { useMemo, useState } from 'react'
import { isOpenNow, getTodayHours } from '@/lib/opening-hours'

export interface GuidePlace {
  id: string
  name: string
  address: string | null
  lat: number | null
  lon: number | null
  openingHours: string | null
  www: string | null
  image?: string | null
  rating?: number | null
  reviews?: number | null
  /** Lyhyt lisärivi, esim. kaupunki tai tyyppi. */
  sub?: string | null
}

function fmtReviews(n: number): string {
  return n >= 1000 ? `${(n / 1000).toFixed(1)}k` : String(n)
}

function PlaceRow({ p, emoji }: { p: GuidePlace; emoji: string }) {
  const [imgOk, setImgOk] = useState(true)
  const open = p.openingHours ? isOpenNow(p.openingHours) : undefined
  const today = p.openingHours ? getTodayHours(p.openingHours) : null
  const www = p.www ? (/^https?:\/\//i.test(p.www) ? p.www : `https://${p.www}`) : null
  return (
    <li className="rounded-xl p-3.5 flex gap-3"
      style={{ background: 'rgba(255,255,255,.04)', border: '1px solid rgba(255,255,255,.07)' }}>
      {p.image && imgOk ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={p.image} onError={() => setImgOk(false)} alt={p.name} loading="lazy"
          className="w-20 h-20 object-cover rounded-lg shrink-0" />
      ) : (
        <div className="w-20 h-20 rounded-lg shrink-0 flex items-center justify-center text-2xl"
          style={{ background: 'rgba(255,255,255,.05)' }}>
          {emoji}
        </div>
      )}
      <div className="min-w-0 flex-1 space-y-1">
        <div className="flex items-baseline justify-between gap-2 flex-wrap">
          <h3 className="font-bold text-white text-[14.5px] leading-snug">
            {www ? (
              <a href={www} target="_blank" rel="noopener" className="hover:text-blue-300 transition-colors">{p.name} ↗</a>
            ) : p.name}
          </h3>
          {open !== undefined && (
            <span className={`text-[11px] font-black shrink-0 ${open ? 'text-emerald-400' : 'text-red-400/60'}`}>
              {open ? '● Avoinna' : '○ Suljettu'}
            </span>
          )}
        </div>
        <p className="text-[12.5px] text-white/50">
          {typeof p.rating === 'number' && (
            <span className="font-bold" style={{ color: '#e8c06a' }}>★ {p.rating.toFixed(1)}{p.reviews ? ` (${fmtReviews(p.reviews)})` : ''}</span>
          )}
          {typeof p.rating === 'number' && (p.address || p.sub) ? ' · ' : ''}
          {[p.address, p.sub].filter(Boolean).join(' · ')}
        </p>
        {today && (
          <p className={`text-[12px] ${open ? 'text-emerald-400/80' : 'text-white/40'}`}>Tänään {today}</p>
        )}
        <p className="text-[11px] text-white/30 pt-0.5">
          {p.lat && p.lon && (
            <>
              <a href={`https://maps.google.com/maps?q=${p.lat},${p.lon}`} target="_blank" rel="noopener"
                className="hover:text-white/60 transition-colors">kartalla ↗</a>
              {' · '}
              <a href={`https://maps.google.com/maps?daddr=${p.lat},${p.lon}&travelmode=transit`} target="_blank" rel="noopener"
                className="hover:text-white/60 transition-colors">reittiohjeet ↗</a>
            </>
          )}
        </p>
      </div>
    </li>
  )
}

export default function GuidePlaceList({ places, emoji, showOpenFilter = true }: {
  places: GuidePlace[]
  emoji: string
  showOpenFilter?: boolean
}) {
  const [openOnly, setOpenOnly] = useState(false)
  const list = useMemo(
    () => (openOnly ? places.filter((p) => p.openingHours && isOpenNow(p.openingHours) === true) : places),
    [places, openOnly],
  )
  return (
    <div className="space-y-4">
      {showOpenFilter && (
        <button onClick={() => setOpenOnly((v) => !v)}
          className="text-[13px] font-bold px-4 py-2 rounded-full transition-colors"
          style={openOnly
            ? { background: 'rgba(16,185,129,.2)', color: '#6ee7b7', border: '1px solid rgba(16,185,129,.4)' }
            : { background: 'rgba(255,255,255,.05)', color: 'rgba(255,255,255,.5)', border: '1px solid rgba(255,255,255,.08)' }}>
          ● Avoinna nyt
        </button>
      )}
      {list.length > 0 ? (
        <ul className="space-y-2">
          {list.map((p) => <PlaceRow key={p.id} p={p} emoji={emoji} />)}
        </ul>
      ) : (
        <p className="text-white/40 text-sm py-8 text-center">
          {openOnly ? 'Mikään ei ole juuri nyt auki — kokeile ilman suodatinta.' : 'Ei paikkoja listalla.'}
        </p>
      )}
    </div>
  )
}

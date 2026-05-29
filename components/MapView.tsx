'use client'

import { useEffect, useRef, useState, useCallback } from 'react'
import { Event, Restaurant } from '@/lib/types'

interface Props {
  events: Event[]
  onEventClick: (event: Event) => void
}

const HELSINKI_CENTER: [number, number] = [60.1699, 24.9384]

type ActiveLayer = 'events' | 'restaurants' | 'both'

function haversine(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371
  const dLat = (lat2 - lat1) * Math.PI / 180
  const dLon = (lon2 - lon1) * Math.PI / 180
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * Math.sin(dLon / 2) ** 2
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))
}

function fmtDist(km: number): string {
  return km < 1 ? `${Math.round(km * 1000)} m` : `${km.toFixed(1)} km`
}

function eventColor(event: Event): { color: string; emoji: string } {
  const text = [event.title, event.shortDescription, ...event.categories].join(' ').toLowerCase()
  if (event.isFree) return { color: '#10b981', emoji: '🎁' }
  if (/keikka|konsertti|live|bändi|musiikki/.test(text)) return { color: '#a855f7', emoji: '🎸' }
  if (/yökerho|nightclub|bileet|disko|rave|klubi|dj/.test(text)) return { color: '#ec4899', emoji: '🌙' }
  if (/baari|pub|bar|olut|beer|viini/.test(text)) return { color: '#f59e0b', emoji: '🍺' }
  if (/teatteri|tanssi|näytelmä|ooppera|baletti/.test(text)) return { color: '#ef4444', emoji: '🎭' }
  if (/taide|galleria|näyttely|museo/.test(text)) return { color: '#06b6d4', emoji: '🎨' }
  if (/urheilu|jalkapallo|jääkiekko|ottelu/.test(text)) return { color: '#3b82f6', emoji: '⚽' }
  return { color: '#0072C6', emoji: '📍' }
}

function restaurantColor(type: Restaurant['type']): { color: string; emoji: string } {
  switch (type) {
    case 'ravintola': return { color: '#f97316', emoji: '🍽' }
    case 'kahvila':   return { color: '#d97706', emoji: '☕' }
    case 'baari':     return { color: '#d946ef', emoji: '🍺' }
    case 'pikaruoka': return { color: '#ef4444', emoji: '🍔' }
    default:          return { color: '#6b7280', emoji: '📍' }
  }
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function makePinIcon(L: any, color: string, emoji: string, round = false) {
  const shape = round
    ? `border-radius:50%`
    : `border-radius:50% 50% 50% 4px;transform:rotate(-45deg)`
  const inner = round ? emoji : `<span style="transform:rotate(45deg)">${emoji}</span>`
  return L.divIcon({
    html: `<div style="width:30px;height:30px;${shape};background:${color};border:2px solid rgba(255,255,255,0.9);box-shadow:0 2px 8px rgba(0,0,0,0.6),0 0 10px ${color}66;display:flex;align-items:center;justify-content:center;font-size:13px">${inner}</div>`,
    className: '',
    iconSize: [30, 30],
    iconAnchor: round ? [15, 15] : [15, 26],
  })
}

const EVENT_LEGEND = [
  { color: '#a855f7', label: 'Keikka' },
  { color: '#ec4899', label: 'Yöelämä' },
  { color: '#f59e0b', label: 'Baari' },
  { color: '#ef4444', label: 'Teatteri' },
  { color: '#06b6d4', label: 'Taide' },
  { color: '#10b981', label: 'Ilmainen' },
  { color: '#0072C6', label: 'Muut' },
]

const REST_LEGEND = [
  { color: '#f97316', label: 'Ravintola' },
  { color: '#d97706', label: 'Kahvila' },
  { color: '#d946ef', label: 'Baari' },
  { color: '#ef4444', label: 'Pikaruoka' },
]

export default function MapView({ events, onEventClick }: Props) {
  const containerRef = useRef<HTMLDivElement>(null)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const mapRef = useRef<any>(null)
  const [mapReady, setMapReady] = useState(false)
  const [activeLayer, setActiveLayer] = useState<ActiveLayer>('events')
  const [restaurants, setRestaurants] = useState<Restaurant[]>([])
  const [restsLoading, setRestsLoading] = useState(false)
  const [userPos, setUserPos] = useState<[number, number] | null>(null)
  const [locating, setLocating] = useState(false)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const userMarkerRef = useRef<any>(null)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const eventMarkersRef = useRef<any[]>([])
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const restMarkersRef = useRef<any[]>([])

  // ── Init map ────────────────────────────────────────────
  useEffect(() => {
    if (!containerRef.current || mapRef.current) return
    let mounted = true

    import('leaflet').then((L) => {
      if (!mounted || !containerRef.current || mapRef.current) return
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      delete (L.Icon.Default.prototype as any)._getIconUrl

      const map = L.map(containerRef.current, {
        center: HELSINKI_CENTER,
        zoom: 12,
        zoomControl: true,
      })

      L.tileLayer('https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png', {
        attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> &copy; <a href="https://carto.com/attributions">CARTO</a>',
        subdomains: 'abcd',
        maxZoom: 20,
      }).addTo(map)

      mapRef.current = map
      setMapReady(true)
    })

    return () => {
      mounted = false
      if (mapRef.current) {
        mapRef.current.remove()
        mapRef.current = null
      }
    }
  }, [])

  // ── Fetch restaurants when needed ───────────────────────
  useEffect(() => {
    if (activeLayer === 'events' || restaurants.length > 0 || restsLoading) return
    setRestsLoading(true)
    fetch('/api/restaurants')
      .then(r => r.json())
      .then(data => setRestaurants(data.restaurants ?? []))
      .catch(() => {})
      .finally(() => setRestsLoading(false))
  }, [activeLayer, restaurants.length, restsLoading])

  // ── Event markers ───────────────────────────────────────
  useEffect(() => {
    if (!mapReady || !mapRef.current) return

    const showEvents = activeLayer !== 'restaurants'

    import('leaflet').then((L) => {
      // Always clear old event markers
      eventMarkersRef.current.forEach(m => { try { mapRef.current.removeLayer(m) } catch {} })
      eventMarkersRef.current = []

      if (!showEvents) return

      events.forEach((event) => {
        if (!event.location?.lat || !event.location?.lon) return
        const { color, emoji } = eventColor(event)
        const icon = makePinIcon(L, color, emoji, false)

        const time = new Date(event.startTime).toLocaleTimeString('fi-FI', { hour: '2-digit', minute: '2-digit' })
        const popup = `<div style="font-family:Inter,sans-serif;min-width:180px;max-width:220px">
          ${event.image ? `<img src="${event.image}" style="width:100%;height:80px;object-fit:cover;border-radius:6px;margin-bottom:8px" loading="lazy"/>` : ''}
          <p style="font-weight:700;font-size:13px;margin:0 0 4px;color:#fff;line-height:1.3">${event.title}</p>
          <p style="font-size:11px;color:${color};margin:0 0 2px;font-weight:600">${time}${event.isFree ? ' · 🎁 Maksuton' : ''}</p>
          <p style="font-size:11px;color:#777;margin:0">${event.location?.name || ''}</p>
        </div>`

        const marker = L.marker([event.location.lat, event.location.lon], { icon })
        marker.bindPopup(popup, { className: 'dark-popup', maxWidth: 240 })
        marker.on('click', () => onEventClick(event))
        marker.addTo(mapRef.current)
        eventMarkersRef.current.push(marker)
      })
    })
  }, [mapReady, events, onEventClick, activeLayer])

  // ── Restaurant markers ──────────────────────────────────
  useEffect(() => {
    if (!mapReady || !mapRef.current) return

    const showRests = activeLayer !== 'events'

    import('leaflet').then((L) => {
      restMarkersRef.current.forEach(m => { try { mapRef.current.removeLayer(m) } catch {} })
      restMarkersRef.current = []

      if (!showRests) return

      restaurants.forEach((r) => {
        if (!r.lat || !r.lon) return
        const { color, emoji } = restaurantColor(r.type)
        const dist = userPos ? haversine(userPos[0], userPos[1], r.lat!, r.lon!) : null
        const icon = makePinIcon(L, color, emoji, true)

        const popup = `<div style="font-family:Inter,sans-serif;min-width:160px;max-width:210px">
          <p style="font-weight:700;font-size:13px;margin:0 0 4px;color:#fff">${r.name}</p>
          ${r.description ? `<p style="font-size:11px;color:${color};margin:0 0 3px;font-weight:600;text-transform:capitalize">${r.description}</p>` : ''}
          ${r.address ? `<p style="font-size:11px;color:#888;margin:0 0 3px">${r.address}${r.city && r.city !== 'Helsinki' ? `, ${r.city}` : ''}</p>` : ''}
          ${dist !== null ? `<p style="font-size:11px;color:#aaa;margin:0 0 4px">📍 ${fmtDist(dist)} päässä</p>` : ''}
          ${r.www ? `<a href="${r.www}" target="_blank" rel="noopener noreferrer" style="font-size:11px;color:#a78bfa;font-weight:600;text-decoration:none">Nettisivu →</a>` : ''}
          ${r.phone ? `<p style="font-size:11px;color:#aaa;margin:${r.www ? '3px' : '0'} 0 0">${r.phone}</p>` : ''}
        </div>`

        const marker = L.marker([r.lat, r.lon], { icon })
        marker.bindPopup(popup, { className: 'dark-popup', maxWidth: 220 })
        marker.addTo(mapRef.current)
        restMarkersRef.current.push(marker)
      })
    })
  }, [mapReady, restaurants, activeLayer, userPos])

  // ── User position marker ────────────────────────────────
  useEffect(() => {
    if (!mapReady || !mapRef.current || !userPos) return
    import('leaflet').then((L) => {
      if (userMarkerRef.current) { try { mapRef.current.removeLayer(userMarkerRef.current) } catch {} }
      const icon = L.divIcon({
        html: `<div style="width:18px;height:18px;border-radius:50%;background:#3b82f6;border:3px solid #fff;box-shadow:0 0 0 5px rgba(59,130,246,0.25)"></div>`,
        className: '',
        iconSize: [18, 18],
        iconAnchor: [9, 9],
      })
      userMarkerRef.current = L.marker(userPos, { icon, zIndexOffset: 2000 })
        .bindPopup('<p style="color:#fff;font-family:Inter;font-size:12px;margin:0;font-weight:600">📍 Olet tässä</p>', { className: 'dark-popup' })
        .addTo(mapRef.current)
    })
  }, [mapReady, userPos])

  // ── Locate me ───────────────────────────────────────────
  const locateMe = useCallback(() => {
    if (!navigator.geolocation) return
    setLocating(true)
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const coords: [number, number] = [pos.coords.latitude, pos.coords.longitude]
        setUserPos(coords)
        if (mapRef.current) mapRef.current.setView(coords, 15)
        setLocating(false)
        if (activeLayer === 'events') setActiveLayer('both')
      },
      () => setLocating(false),
      { enableHighAccuracy: true, timeout: 10000 }
    )
  }, [activeLayer])

  const eventsOnMap = events.filter(e => e.location?.lat).length
  const restsOnMap = restaurants.filter(r => r.lat).length
  const legend = activeLayer === 'restaurants' ? REST_LEGEND : EVENT_LEGEND

  return (
    <div className="relative w-full rounded-2xl overflow-hidden border border-white/8"
      style={{ height: 'calc(100dvh - 148px)', minHeight: 480 }}>
      <div ref={containerRef} className="w-full h-full" />

      {/* Layer toggle */}
      <div className="absolute top-3 left-1/2 -translate-x-1/2 flex gap-1 bg-black/85 backdrop-blur-md rounded-xl p-1 z-[1000] shadow-lg">
        {([
          { id: 'events',      label: '📅 Tapahtumat' },
          { id: 'both',        label: '🗺 Kaikki'     },
          { id: 'restaurants', label: '🍽 Ravintolat' },
        ] as { id: ActiveLayer; label: string }[]).map(opt => (
          <button key={opt.id} onClick={() => setActiveLayer(opt.id)}
            className={`px-3 py-1.5 rounded-lg text-xs font-black transition-all ${
              activeLayer === opt.id
                ? 'bg-purple-600 text-white shadow-sm'
                : 'text-white/40 hover:text-white/70'
            }`}>
            {opt.label}
          </button>
        ))}
      </div>

      {/* Locate me */}
      <button onClick={locateMe} disabled={locating}
        className="absolute top-3 right-3 z-[1000] flex items-center gap-1.5 px-3 py-2 rounded-xl bg-black/85 backdrop-blur-md border border-white/10 text-white/60 hover:text-white text-xs font-bold transition-all shadow-lg disabled:opacity-60">
        {locating
          ? <span className="w-3 h-3 rounded-full border-2 border-purple-400 border-t-transparent animate-spin" />
          : <span>📍</span>}
        {userPos ? 'Päivitä' : 'Missä olen?'}
      </button>

      {/* Restaurant loading indicator */}
      {restsLoading && (
        <div className="absolute top-14 right-3 z-[1000] flex items-center gap-2 px-3 py-2 rounded-xl bg-black/85 text-white/50 text-xs">
          <span className="w-3 h-3 rounded-full border-2 border-white/30 border-t-white/70 animate-spin" />
          Haetaan ravintoloita…
        </div>
      )}

      {/* Legend */}
      <div className="absolute bottom-10 left-3 flex flex-col gap-1 bg-black/75 backdrop-blur-sm rounded-xl p-2.5 z-[1000]">
        {legend.map(({ color, label }) => (
          <div key={label} className="flex items-center gap-1.5">
            <div style={{ width: 9, height: 9, borderRadius: '50%', background: color, boxShadow: `0 0 5px ${color}` }} />
            <span style={{ fontSize: 10, color: 'rgba(255,255,255,0.5)', fontFamily: 'Inter,sans-serif' }}>{label}</span>
          </div>
        ))}
      </div>

      {/* Count badge */}
      <div className="absolute bottom-4 right-3 bg-black/75 backdrop-blur-sm text-white/45 text-xs px-3 py-1.5 rounded-full z-[1000]">
        {activeLayer === 'events'      && `${eventsOnMap} tapahtumaa`}
        {activeLayer === 'restaurants' && `${restsOnMap} paikkaa`}
        {activeLayer === 'both'        && `${eventsOnMap} tapahtumaa · ${restsOnMap} paikkaa`}
      </div>
    </div>
  )
}

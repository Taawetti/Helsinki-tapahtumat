'use client'

import { useEffect, useRef } from 'react'
import { Event } from '@/lib/types'

interface Props {
  events: Event[]
  onEventClick: (event: Event) => void
}

const HELSINKI_CENTER: [number, number] = [60.1699, 24.9384]

function markerColor(event: Event): { color: string; emoji: string } {
  const text = [event.title, event.shortDescription, ...event.categories].join(' ').toLowerCase()
  if (event.isFree) return { color: '#10b981', emoji: '🎁' }
  if (/keikka|konsertti|live|bändi|musiikki/.test(text)) return { color: '#a855f7', emoji: '🎸' }
  if (/yökerho|nightclub|bileet|disko|rave|klubi|dj/.test(text)) return { color: '#ec4899', emoji: '🌙' }
  if (/baari|pub|bar|olut|beer|viini/.test(text)) return { color: '#f59e0b', emoji: '🍺' }
  if (/teatteri|tanssi|näytelmä|ooppera|baletti/.test(text)) return { color: '#ef4444', emoji: '🎭' }
  if (/taide|galleria|näyttely|museo/.test(text)) return { color: '#06b6d4', emoji: '🎨' }
  if (/urheilu|jalkapallo|jääkiekko|ottelu/.test(text)) return { color: '#3b82f6', emoji: '⚽' }
  if (/ravintola|ruoka|illallinen|food/.test(text)) return { color: '#84cc16', emoji: '🍝' }
  if (/lapset|perhe|lasten|kids/.test(text)) return { color: '#f472b6', emoji: '👨‍👩‍👧' }
  if (/stand.?up|komedia/.test(text)) return { color: '#fb923c', emoji: '😂' }
  return { color: '#0072C6', emoji: '📍' }
}

export default function MapView({ events, onEventClick }: Props) {
  const containerRef = useRef<HTMLDivElement>(null)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const mapRef = useRef<any>(null)

  useEffect(() => {
    if (!containerRef.current || mapRef.current) return

    import('leaflet').then((L) => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      delete (L.Icon.Default.prototype as any)._getIconUrl
      L.Icon.Default.mergeOptions({
        iconRetinaUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png',
        iconUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png',
        shadowUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png',
      })

      const map = L.map(containerRef.current!, {
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
    })

    return () => {
      if (mapRef.current) {
        mapRef.current.remove()
        mapRef.current = null
      }
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    if (!mapRef.current) return

    import('leaflet').then((L) => {
      mapRef.current.eachLayer((layer: unknown) => {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        if ((layer as any) instanceof L.Marker) mapRef.current.removeLayer(layer)
      })

      events.forEach((event) => {
        if (!event.location?.lat || !event.location?.lon) return

        const { color, emoji } = markerColor(event)
        const icon = L.divIcon({
          html: `<div style="
            width:32px;height:32px;border-radius:50% 50% 50% 4px;
            background:${color};border:2px solid rgba(255,255,255,0.9);
            box-shadow:0 2px 8px rgba(0,0,0,0.6),0 0 12px ${color}88;
            display:flex;align-items:center;justify-content:center;
            font-size:14px;transform:rotate(-45deg);
          "><span style="transform:rotate(45deg)">${emoji}</span></div>`,
          className: '',
          iconSize: [32, 32],
          iconAnchor: [16, 28],
        })

        const time = new Date(event.startTime).toLocaleTimeString('fi-FI', { hour: '2-digit', minute: '2-digit' })
        const popupContent = `
          <div style="font-family:Inter,sans-serif;min-width:180px;max-width:220px">
            ${event.image ? `<img src="${event.image}" style="width:100%;height:80px;object-fit:cover;border-radius:6px;margin-bottom:8px" />` : ''}
            <p style="font-weight:700;font-size:13px;margin:0 0 4px;color:#fff;line-height:1.3">${event.title}</p>
            <p style="font-size:11px;color:${color};margin:0 0 2px;font-weight:600">${time}${event.isFree ? ' · 🎁 Maksuton' : ''}</p>
            <p style="font-size:11px;color:#666;margin:0">${event.location?.name || ''}</p>
          </div>
        `

        const marker = L.marker([event.location.lat, event.location.lon], { icon })
        marker.bindPopup(popupContent, { className: 'dark-popup', maxWidth: 240 })
        marker.on('click', () => onEventClick(event))
        marker.addTo(mapRef.current)
      })
    })
  }, [events, onEventClick])

  const LEGEND = [
    { color: '#a855f7', label: 'Keikka' },
    { color: '#ec4899', label: 'Yöelämä' },
    { color: '#f59e0b', label: 'Baari' },
    { color: '#ef4444', label: 'Teatteri' },
    { color: '#06b6d4', label: 'Taide' },
    { color: '#10b981', label: 'Ilmainen' },
    { color: '#0072C6', label: 'Muut' },
  ]

  return (
    <div className="relative w-full rounded-2xl overflow-hidden border border-white/8" style={{ height: '560px' }}>
      <div ref={containerRef} className="w-full h-full" />

      {/* Legend */}
      <div className="absolute top-3 left-3 flex flex-col gap-1 bg-black/70 backdrop-blur-sm rounded-xl p-2.5">
        {LEGEND.map(({ color, label }) => (
          <div key={label} className="flex items-center gap-1.5">
            <div style={{ width: 10, height: 10, borderRadius: '50%', background: color, boxShadow: `0 0 6px ${color}` }} />
            <span style={{ fontSize: 11, color: 'rgba(255,255,255,0.55)', fontFamily: 'Inter,sans-serif' }}>{label}</span>
          </div>
        ))}
      </div>

      <div className="absolute bottom-4 right-4 bg-black/70 backdrop-blur-sm text-white/50 text-xs px-3 py-1.5 rounded-full">
        {events.filter((e) => e.location?.lat).length} tapahtumaa kartalla
      </div>
    </div>
  )
}

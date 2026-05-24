'use client'

import { useEffect, useRef } from 'react'
import { Event } from '@/lib/types'

interface Props {
  events: Event[]
  onEventClick: (event: Event) => void
}

const HELSINKI_CENTER: [number, number] = [60.1699, 24.9384]

export default function MapView({ events, onEventClick }: Props) {
  const containerRef = useRef<HTMLDivElement>(null)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const mapRef = useRef<any>(null)

  useEffect(() => {
    if (!containerRef.current || mapRef.current) return

    import('leaflet').then((L) => {
      // Fix default icon paths for Next.js
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
  // Only run once on mount
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    if (!mapRef.current) return

    import('leaflet').then((L) => {
      // Clear existing markers
      mapRef.current.eachLayer((layer: unknown) => {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        if ((layer as any) instanceof L.Marker) mapRef.current.removeLayer(layer)
      })

      const blueIcon = L.divIcon({
        html: `<div style="width:12px;height:12px;background:#0072C6;border:2px solid white;border-radius:50%;box-shadow:0 0 6px rgba(0,114,198,0.8)"></div>`,
        className: '',
        iconSize: [12, 12],
        iconAnchor: [6, 6],
      })

      events.forEach((event) => {
        if (!event.location?.lat || !event.location?.lon) return

        const marker = L.marker([event.location.lat, event.location.lon], { icon: blueIcon })

        const popupContent = `
          <div style="font-family:Inter,sans-serif;max-width:200px">
            <p style="font-weight:600;font-size:13px;margin:0 0 4px;color:#fff">${event.title}</p>
            <p style="font-size:11px;color:#888;margin:0">${event.location.name || ''}</p>
          </div>
        `

        marker.bindPopup(popupContent, {
          className: 'dark-popup',
        })

        marker.on('click', () => onEventClick(event))
        marker.addTo(mapRef.current)
      })
    })
  }, [events, onEventClick])

  return (
    <div className="relative w-full rounded-2xl overflow-hidden border border-white/8" style={{ height: '560px' }}>
      <div ref={containerRef} className="w-full h-full" />
      <div className="absolute bottom-4 right-4 bg-black/70 backdrop-blur-sm text-white/50 text-xs px-3 py-1.5 rounded-full">
        {events.filter((e) => e.location?.lat).length} tapahtumaa kartalla
      </div>
    </div>
  )
}

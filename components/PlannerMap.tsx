'use client'

import { useEffect, useRef } from 'react'

interface MapItem {
  title: string
  location: string
  coords?: [number, number]
}

export default function PlannerMap({ items }: { items: MapItem[] }) {
  const containerRef = useRef<HTMLDivElement>(null)
  const instanceRef  = useRef<any>(null)

  useEffect(() => {
    const geocoded = items.filter(i => i.coords) as (MapItem & { coords: [number, number] })[]
    if (!containerRef.current || geocoded.length === 0) return

    let cancelled = false

    // Remove any existing map first (sync, before async import)
    if (instanceRef.current) {
      instanceRef.current.remove()
      instanceRef.current = null
    }

    import('leaflet').then((L) => {
      if (cancelled || !containerRef.current) return

      // Guard: another effect may have already created a map
      if (instanceRef.current) {
        instanceRef.current.remove()
        instanceRef.current = null
      }

      delete (L.Icon.Default.prototype as any)._getIconUrl

      const map = L.map(containerRef.current, {
        center: geocoded[0].coords,
        zoom: 13,
        zoomControl: true,
      })
      instanceRef.current = map

      L.tileLayer('https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png', {
        attribution: '© <a href="https://www.openstreetmap.org/copyright">OSM</a> © <a href="https://carto.com/">CartoDB</a>',
        maxZoom: 19,
      }).addTo(map)

      const latLngs: [number, number][] = []

      geocoded.forEach((item, i) => {
        const [lat, lng] = item.coords
        latLngs.push([lat, lng])

        const marker = L.marker([lat, lng], {
          icon: L.divIcon({
            html: `<div style="width:28px;height:28px;border-radius:50%;background:#6b76ff;color:#fff;font-size:11px;font-weight:900;display:flex;align-items:center;justify-content:center;border:2px solid rgba(255,255,255,.28);box-shadow:0 2px 10px rgba(0,0,0,.55);">${i + 1}</div>`,
            className: '',
            iconSize:   [28, 28],
            iconAnchor: [14, 14],
          }),
        })

        marker.addTo(map)
        marker.bindPopup(
          `<strong style="font-size:13px;font-family:system-ui;">${item.title}</strong>` +
          (item.location ? `<br><span style="color:#aaa;font-size:12px;">${item.location}</span>` : ''),
          { maxWidth: 200 }
        )
      })

      if (latLngs.length > 1) {
        L.polyline(latLngs, {
          color:     'rgba(107,118,255,.5)',
          weight:    2,
          dashArray: '6, 6',
        }).addTo(map)
        map.fitBounds(latLngs as any, { padding: [44, 44] })
      } else {
        map.setView(latLngs[0], 15)
      }
    })

    return () => {
      cancelled = true
      if (instanceRef.current) {
        instanceRef.current.remove()
        instanceRef.current = null
      }
    }
  }, [items])

  const geocodedCount = items.filter(i => i.coords).length

  if (geocodedCount === 0) {
    return (
      <div style={{
        height: 360, borderRadius: 12,
        background: 'rgba(107,118,255,.04)',
        border: '1px solid rgba(107,118,255,.12)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        flexDirection: 'column', gap: 10,
      }}>
        <div style={{ fontSize: 30 }}>🗺</div>
        <p style={{ fontSize: 13, color: 'rgba(255,255,255,.3)', margin: 0 }}>Haetaan sijainteja kartalle…</p>
      </div>
    )
  }

  return (
    <div>
      <div
        ref={containerRef}
        style={{ width: '100%', height: 360, borderRadius: 12, overflow: 'hidden' }}
      />
      {geocodedCount < items.length && (
        <p style={{ textAlign: 'right', fontSize: 11, color: 'rgba(255,255,255,.2)', margin: '5px 0 0' }}>
          {geocodedCount}/{items.length} sijaintia kartalla
        </p>
      )}
    </div>
  )
}

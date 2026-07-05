'use client'
import { useState, useCallback } from 'react'

export interface GeoCoords { lat: number; lon: number }

interface State { coords: GeoCoords | null; loading: boolean; denied: boolean }

export function useGeolocation() {
  const [state, setState] = useState<State>({ coords: null, loading: false, denied: false })

  const request = useCallback(() => {
    if (typeof navigator === 'undefined' || !navigator.geolocation) return
    setState(s => ({ ...s, loading: true }))
    navigator.geolocation.getCurrentPosition(
      pos => setState({ coords: { lat: pos.coords.latitude, lon: pos.coords.longitude }, loading: false, denied: false }),
      () => setState(s => ({ ...s, loading: false, denied: true })),
      { timeout: 8000, maximumAge: 300_000 }
    )
  }, [])

  const clear = useCallback(() => setState({ coords: null, loading: false, denied: false }), [])

  return { ...state, request, clear }
}

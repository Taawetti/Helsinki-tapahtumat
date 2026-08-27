'use client'

import { createContext, useContext, useState, useEffect, useCallback, ReactNode } from 'react'
import { Event } from '@/lib/types'
import { track } from '@/lib/track'

const KEY = 'hki-fav-v1'

interface FavCtx {
  favorites: Event[]
  toggle: (event: Event) => void
  isFavorite: (id: string) => boolean
  count: number
}

const Ctx = createContext<FavCtx>({ favorites: [], toggle: () => {}, isFavorite: () => false, count: 0 })

export function FavoritesProvider({ children }: { children: ReactNode }) {
  const [favorites, setFavorites] = useState<Event[]>([])

  useEffect(() => {
    try {
      const raw = localStorage.getItem(KEY)
      // eslint-disable-next-line react-hooks/set-state-in-effect -- localStorage-synkka mountissa
      if (raw) setFavorites(JSON.parse(raw))
    } catch {}
  }, [])

  const toggle = useCallback((event: Event) => {
    setFavorites(prev => {
      const oliJo = prev.some(e => e.id === event.id)
      const next = oliJo ? prev.filter(e => e.id !== event.id) : [...prev, event]
      try { localStorage.setItem(KEY, JSON.stringify(next)) } catch {}
      // Vain LISÄYS mitataan, ei poistoa. toggle on yksi funktio molemmille,
      // ja jos molemmat kirjattaisiin samana tapahtumana, luku olisi
      // merkityksetön: sama käyttäjä voi lisätä ja poistaa saman tapahtuman
      // monta kertaa. Lisäys on aikomussignaali, poisto ei ole.
      if (!oliJo) track('favorite_add', { eventId: event.id, label: event.title })
      return next
    })
  }, [])

  const isFavorite = useCallback((id: string) => favorites.some(e => e.id === id), [favorites])

  return <Ctx.Provider value={{ favorites, toggle, isFavorite, count: favorites.length }}>{children}</Ctx.Provider>
}

export const useFavorites = () => useContext(Ctx)

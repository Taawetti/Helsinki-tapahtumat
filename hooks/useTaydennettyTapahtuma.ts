// Infopaneelin täydennys kartan kevyelle riville (lib/tapahtumat-kevyt).
//
// Kartan kuukausipaketti tulee ilman kuvaustekstejä. Kun käyttäjä avaa pinnin,
// paneeli saa heti kevyen rivin (otsikko, aika, paikka, kuva, liput) ja tämä
// hook hakee kuvauksen: ensin muistivälimuistista (sama tapahtuma on usein jo
// ladattu listan päiväikkunassa), muuten tapahtuman oman päivän ikkunasta
// /api/events?start=P&end=P — sama osoite kuin listan päivähaussa, joten se
// osuu reunavälimuistiin ja kestää tyypillisesti 0,1–0,3 s. Jos täyttä riviä
// ei löydy (lähde pudotti tapahtuman välissä), kevyt rivi jää ja paneeli
// näyttää muun tiedon ilman kuvausta.

import { useEffect, useState } from 'react'
import type { Event } from '@/lib/types'
import { helsinkiDateOf } from '@/lib/helsinki-time'
import { tapahtumaHakuParams } from '@/lib/events-fetch'
import { taydennaKevyt } from '@/lib/tapahtumat-kevyt'
import { etsiTaysiValimuistista } from './useEvents'

interface Haettu { id: string; taysi: Event | null }

export function useTaydennettyTapahtuma(event: Event | null, municipality: string): { event: Event | null; kuvausLatautuu: boolean } {
  const [haettu, setHaettu] = useState<Haettu | null>(null)
  const id = event?.kevyt ? event.id : null
  const startTime = event?.kevyt ? event.startTime : null
  // Muistivälimuisti luetaan renderissä (puhdas luku), jotta efektissä ei
  // tarvita synkronista setStatea: listan jo lataama tapahtuma täydentyy heti.
  const muistista = id ? etsiTaysiValimuistista(id) : null

  useEffect(() => {
    if (!id || !startTime || muistista) return
    let elossa = true
    const controller = new AbortController()
    const params = tapahtumaHakuParams({ dateFilter: 'custom', customDate: helsinkiDateOf(startTime), page: 1, municipality })
    fetch(`/api/events?${params}`, { signal: controller.signal })
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(String(r.status)))))
      .then((d: { events?: Event[] }) => {
        if (!elossa) return
        setHaettu({ id, taysi: (d.events ?? []).find((e) => e.id === id && !e.kevyt) ?? null })
      })
      .catch(() => { if (elossa) setHaettu({ id, taysi: null }) })
    return () => { elossa = false; controller.abort() }
  }, [id, startTime, municipality, muistista])

  if (!event || !event.kevyt) return { event, kuvausLatautuu: false }
  if (muistista) return { event: taydennaKevyt(event, muistista), kuvausLatautuu: false }
  const osuma = haettu && haettu.id === event.id ? haettu : null
  return {
    event: osuma?.taysi ? taydennaKevyt(event, osuma.taysi) : event,
    kuvausLatautuu: !osuma,
  }
}

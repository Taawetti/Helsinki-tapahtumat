// Infopaneelin täydennys kartan kevyelle riville (lib/tapahtumat-kevyt).
//
// Kartan kuukausipaketti tulee ilman kuvaustekstejä. Kun käyttäjä avaa pinnin,
// paneeli saa heti kevyen rivin (otsikko, aika, paikka, kuva, liput) ja tämä
// hook hakee kuvauksen:
//   1. muistivälimuistista (sama tapahtuma on usein jo ladattu listan
//      päiväikkunassa) → heti;
//   2. tunnisteella /api/kuvaus (lib/kuvaus) → ~0,3 s myös kaukaiselle päivälle;
//   3. varalla tapahtuman oman päivän ikkunasta /api/events?start=P&end=P —
//      sama osoite kuin listan päivähaussa. Kylmänä 5–8 s, siksi vasta varalla
//      (omistaja 3.11.2026).
// Jos täyttä riviä ei löydy mistään, kevyt rivi jää ja paneeli näyttää muun
// tiedon ilman kuvausta.

import { useEffect, useRef, useState } from 'react'
import type { Event } from '@/lib/types'
import { helsinkiDateOf } from '@/lib/helsinki-time'
import { tapahtumaHakuParams } from '@/lib/events-fetch'
import { taydennaKevyt } from '@/lib/tapahtumat-kevyt'
import { KUVAUS_POLKU, kuvausParams, type KuvausVastaus } from '@/lib/kuvaus'
import { etsiTaysiValimuistista } from './useEvents'

interface Haettu { id: string; taysi: Event | null }

export function useTaydennettyTapahtuma(event: Event | null, municipality: string): { event: Event | null; kuvausLatautuu: boolean } {
  const [haettu, setHaettu] = useState<Haettu | null>(null)
  const id = event?.kevyt ? event.id : null
  const startTime = event?.kevyt ? event.startTime : null
  // Muistivälimuisti luetaan renderissä (puhdas luku), jotta efektissä ei
  // tarvita synkronista setStatea: listan jo lataama tapahtuma täydentyy heti.
  const muistista = id ? etsiTaysiValimuistista(id) : null
  // Kevyt rivi refissä: tunnistehaku palauttaa vain kuvauksen, joka liitetään
  // kevyeen riviin. Kirjoitus efektissä (React 19: ei ref-kirjoituksia
  // renderissä), luku vasta vastauksen saavuttua.
  const kevytRef = useRef(event)
  useEffect(() => { kevytRef.current = event })

  useEffect(() => {
    if (!id || !startTime || muistista) return
    let elossa = true
    const controller = new AbortController()
    const paiva = helsinkiDateOf(startTime)

    const tunnisteella = (): Promise<boolean> =>
      fetch(`${KUVAUS_POLKU}?${kuvausParams(id, paiva)}`, { signal: controller.signal })
        .then((r) => (r.ok ? r.json() : Promise.reject(new Error(String(r.status)))))
        .then((d: KuvausVastaus) => {
          const kevyt = kevytRef.current
          // Tyhjä kuvaus ei kelpaa: varareitti (päivän kooste) voi tuoda dedupen
          // täydentämän tekstin toisesta lähteestä. Palvelin vastaa tähän jo 404,
          // tämä on varmistus reunan vanhaa vastausta vastaan.
          if (!elossa || !kevyt || kevyt.id !== id || typeof d.description !== 'string' || !d.description.trim()) return false
          setHaettu({ id, taysi: { ...kevyt, description: d.description, shortDescription: d.shortDescription || kevyt.shortDescription, ...(d.descriptionEn ? { descriptionEn: d.descriptionEn } : {}) } })
          return true
        })
        .catch(() => false)

    const paivaikkunasta = (): Promise<void> => {
      const params = tapahtumaHakuParams({ dateFilter: 'custom', customDate: paiva, page: 1, municipality })
      return fetch(`/api/events?${params}`, { signal: controller.signal })
        .then((r) => (r.ok ? r.json() : Promise.reject(new Error(String(r.status)))))
        .then((d: { events?: Event[] }) => {
          if (!elossa) return
          setHaettu({ id, taysi: (d.events ?? []).find((e) => e.id === id && !e.kevyt) ?? null })
        })
        .catch(() => { if (elossa) setHaettu({ id, taysi: null }) })
    }

    tunnisteella().then((onnistui) => { if (!onnistui && elossa) return paivaikkunasta() })
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

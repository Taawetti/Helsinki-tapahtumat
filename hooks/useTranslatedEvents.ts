'use client'

// Tapahtumalistan sisältö englanniksi. Palauttaa listan sellaisenaan kun kieli
// on suomi, eli suomenkielinen polku ei muutu lainkaan.
//
// KAKSITASOINEN VÄLIMUISTI:
//   1. localStorage — sivun uudelleenlataus näyttää englannin heti, ilman
//      verkkokutsua ja ilman vilkkumista suomen kautta.
//   2. palvelimen taulu — uusi laite tai uusi kävijä saa saman käännöksen
//      maksamatta sitä uudestaan (app/api/translate).
//
// MIKSI EI PALVELINRENDERÖINTIÄ. Käännös vaatii Claude-kutsun, joka kestää
// sekunteja. Jos /api/events odottaisi sitä, koko sivu hidastuisi myös
// suomenkielisiltä käyttäjiltä. Siksi sisältö näytetään heti ja käännös
// täydentyy päälle — ensimmäisellä kerralla, sen jälkeen se on jo muistissa.

import { useEffect, useMemo, useRef, useState } from 'react'
import type { Event } from '@/lib/types'
import { applyTranslation, sourceHash, type TranslatedFields } from '@/lib/translate'

const LS_KEY = 'mt-tr-en-v1'
/** Kattona pidetään muistijälki kohtuullisena; vanhimmat karsitaan. */
const LS_MAX = 600
/** Montako pyydetään kerralla. Vastaa palvelimen MAX_ITEMS-rajaa. */
const CHUNK = 120

type Entry = TranslatedFields & { h: string }

/** Prosessin elinaikainen muisti — estää saman pyynnön kahdesti kun useampi
 *  komponentti käyttää koukkua samaan aikaan. */
const mem = new Map<string, Entry>()
const inFlight = new Set<string>()
let loaded = false

function loadLs(): void {
  if (loaded) return
  loaded = true
  try {
    const raw = localStorage.getItem(LS_KEY)
    if (!raw) return
    const obj = JSON.parse(raw) as Record<string, Entry>
    for (const [k, v] of Object.entries(obj)) {
      if (v && typeof v.title === 'string' && typeof v.h === 'string') mem.set(k, v)
    }
  } catch { /* rikkinäinen tai täysi localStorage — jatketaan ilman */ }
}

function saveLs(): void {
  try {
    const entries = [...mem.entries()].slice(-LS_MAX)
    localStorage.setItem(LS_KEY, JSON.stringify(Object.fromEntries(entries)))
  } catch { /* kiintiö täynnä — muisti toimii silti istunnon ajan */ }
}

/**
 * @param events lähdetapahtumat (suomeksi)
 * @param lang   nykyinen kieli
 * @returns      sama lista, englanniksi siltä osin kuin käännös on saatavilla
 */
export function useTranslatedEvents(events: Event[], lang: string): Event[] {
  // Kasvaa kun uusia käännöksiä saapuu → pakottaa uudelleenlaskennan.
  const [version, setVersion] = useState(0)
  // Yritetyt AVAIMELLA id|hash, ei pelkällä id:llä. useEvents hakee kahdessa
  // vaiheessa (LinkedEvents ensin, kaikki lähteet perään), ja toinen vaihe voi
  // korvata saman id:n RIKKAAMMALLA versiolla toisesta lähteestä — silloin
  // lähdeteksti ja siis hash muuttuvat. Pelkkään id:hen sidottu esto jätti
  // nämä tapahtumat pysyvästi kääntämättä (mitattu 25.8.2026: välimuistissa
  // oli oikea käännös, mutta ruudulla luki suomea). Hash mukana avaimessa →
  // muuttunut teksti käännetään uudelleen, mutta epäonnistunutta ei jäädä
  // hakkaamaan loputtomiin.
  const attempted = useRef<Set<string>>(new Set())

  useEffect(() => {
    if (lang !== 'en' || !events.length) return
    loadLs()

    // Puuttuvat = ei muistissa TAI lähdeteksti muuttunut hashin perusteella.
    const missing = events.filter((e) => {
      const h = sourceHash(e)
      const key = `${e.id}|${h}`
      const hit = mem.get(e.id)
      return (!hit || hit.h !== h) && !inFlight.has(key) && !attempted.current.has(key)
    })
    if (!missing.length) return

    const batch = missing.slice(0, CHUNK)
    const keys = batch.map((e) => `${e.id}|${sourceHash(e)}`)
    keys.forEach((k) => { inFlight.add(k); attempted.current.add(k) })

    let alive = true
    fetch('/api/translate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        lang: 'en',
        items: batch.map((e) => ({
          id: e.id,
          title: e.title,
          shortDescription: e.shortDescription,
          description: e.description,
        })),
      }),
    })
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => {
        const tr = data?.translations as Record<string, TranslatedFields> | undefined
        if (!tr) return
        let added = 0
        for (const e of batch) {
          const t = tr[e.id]
          if (!t?.title) continue
          mem.set(e.id, { ...t, h: sourceHash(e) })
          added++
        }
        if (added) { saveLs(); if (alive) setVersion((v) => v + 1) }
      })
      .catch(() => { /* verkkovirhe → sisältö jää suomeksi, ei kaadu */ })
      .finally(() => { keys.forEach((k) => inFlight.delete(k)) })

    return () => { alive = false }
    // events-viittaus vaihtuu joka haussa; id-lista riittää riippuvuudeksi.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lang, events.map((e) => `${e.id}|${sourceHash(e)}`).join(','), version])

  return useMemo(() => {
    if (lang !== 'en') return events
    loadLs()
    if (!mem.size) return events
    return events.map((e) => {
      const hit = mem.get(e.id)
      if (!hit || hit.h !== sourceHash(e)) return e
      return applyTranslation(e, hit)
    })
    // version pakottaa uudelleenlaskennan kun käännöksiä saapuu.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [events, lang, version])
}

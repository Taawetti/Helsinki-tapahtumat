'use client'

// Keskitetty paluupino: jokainen "ruudulta tuntuva" UI-kerros (paneeli,
// modaali, kategorialista, opas, kartta, hakunäkymä, välilehti) työntää
// avautuessaan YHDEN selainhistorian merkinnän, ja selaimen paluuele /
// Androidin paluunappi kuorii kerroksia yksi kerrallaan — vasta juuresta
// ele poistuu sivustolta normaalisti (käyttäjää ei vangita).
//
// MIKSI KESKITETTY: kolme paneelia teki tämän aiemmin kukin itsekseen
// (pushState + oma popstate-kuuntelija). Kahdeksalle uudelle kerrokselle
// kopioituna se olisi tuottanut "paina kahdesti taakse" -bugeja kerrosten
// mennessä päällekkäin. Yksi pino + yksi kuuntelija pitää järjestyksen.
//
// TOTEUTUKSEN YDIN — kaksi rakennetta ja toimijono:
//  - `pino`: avoimet UI-kerrokset (mitä sulkeutuu paluueleestä).
//  - `peili`: MEIDÄN työntämiemme historiamerkintöjen id:t historian
//    järjestyksessä — myös kuolleet/orvot. history.back() on ASYNKRONINEN,
//    joten "onko tämä merkintä historian kärki" ei voi nojata
//    history.stateen kesken operaatioiden; peili tietää sen aina.
//  - `jono`: back()- ja pushState-toimet SARJASSA. Ilman jonoa UI-sulku +
//    uusi avaus samassa tikissä (esim. paneelin "Paikan kaikki tapahtumat"
//    sulkee paneelin JA avaa hakunäkymän) tekisi pushStaten kesken
//    lentävän back():n ja uusi merkintä pyyhkiytyisi.
//
// Sivun uudelleenlataus tyhjentää pinon muttei historiaa: vanhoihin
// merkintöihin laskeutuva paluuele ei sulje mitään → yksi "tyhjä" askel
// voi jäädä — tunnettu ja vaaraton kompromissi.

import { useEffect, useRef } from 'react'

interface Kerros {
  id: number
  sulje: () => void
  elossa: boolean
}

let pino: Kerros[] = []
let peili: number[] = []
let seuraavaId = 1
let kuuntelijaAsennettu = false

type Toimi = { tyyppi: 'push'; id: number } | { tyyppi: 'back' }
let jono: Toimi[] = []
let odottaaOmaaPop = false

function aja(): void {
  if (odottaaOmaaPop) return
  const toimi = jono.shift()
  if (!toimi) return
  if (toimi.tyyppi === 'push') {
    history.pushState({ mtPino: toimi.id }, '')
    peili.push(toimi.id)
    aja()
  } else {
    odottaaOmaaPop = true
    peili.pop()
    history.back()
    // jatko popstate-käsittelijässä
  }
}

function asennaKuuntelija() {
  if (kuuntelijaAsennettu || typeof window === 'undefined') return
  kuuntelijaAsennettu = true
  window.addEventListener('popstate', (e) => {
    if (odottaaOmaaPop) {
      // Oma kuittaus-back valmistui — jatka jonoa.
      odottaaOmaaPop = false
      aja()
      return
    }
    // Käyttäjän paluuele (tai historiavalikon hyppy monta askelta kerralla):
    // suljetaan kaikki kerrokset laskeutumiskohteen yläpuolelta ja
    // synkataan peili samaan kohtaan.
    const kohde = (e.state as { mtPino?: number } | null)?.mtPino ?? 0
    while (peili.length > 0 && peili[peili.length - 1] > kohde) peili.pop()
    while (pino.length > 0 && pino[pino.length - 1].id > kohde) {
      const kerros = pino.pop()!
      if (kerros.elossa) {
        kerros.elossa = false
        kerros.sulje()
      }
    }
  })
}

/** UI:sta suljetun kerroksen historiamerkinnän kuittaus. */
function kuittaa(kerros: Kerros): void {
  const idx = pino.indexOf(kerros)
  if (idx !== -1) pino.splice(idx, 1)
  if (!kerros.elossa) return // paluuele sulki jo — historia on jo oikein
  kerros.elossa = false
  // Peruutetaan VAIN jos merkintä on meidän historiamme looginen kärki —
  // muuten se jää orvoksi keskelle (paluuele ohittaa sen yhdellä
  // ylimääräisellä askeleella, mikään ei rikkoudu).
  if (peili.length > 0 && peili[peili.length - 1] === kerros.id) {
    jono.push({ tyyppi: 'back' })
    aja()
  }
}

/** Rekisteröi UI-kerros paluupinoon. `auki` = kerros näkyvissä; `sulje`
 *  kutsutaan kun paluuele osuu tähän kerrokseen. Aina mountattuna oleville
 *  komponenteille anna auki totuusarvona (esim. !!event) — vakio true
 *  toimii vain ehdollisesti mountatuille (unmount = sulku). */
export function useTaaksepain(auki: boolean, sulje: () => void): void {
  const suljeRef = useRef(sulje)
  suljeRef.current = sulje
  const kerrosRef = useRef<Kerros | null>(null)

  useEffect(() => {
    asennaKuuntelija()
    if (auki && !kerrosRef.current) {
      const kerros: Kerros = { id: seuraavaId++, sulje: () => suljeRef.current(), elossa: true }
      pino.push(kerros)
      kerrosRef.current = kerros
      jono.push({ tyyppi: 'push', id: kerros.id })
      aja()
    } else if (!auki && kerrosRef.current) {
      const kerros = kerrosRef.current
      kerrosRef.current = null
      kuittaa(kerros)
    }
  }, [auki])

  useEffect(() => {
    return () => {
      if (kerrosRef.current) {
        kuittaa(kerrosRef.current)
        kerrosRef.current = null
      }
    }
  }, [])
}

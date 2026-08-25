'use client'

// Kielivalinta. Käännökset (lib/i18n.ts) ovat olleet valmiina 394 avaimella
// molemmilla kielillä, mutta valitsin poistettiin vahingossa etusivun
// uudistuksessa 15.7.2026 (commit ef4ef91) — sen jälkeen setLangilla ei ollut
// yhtään kutsujaa ja englanti oli saavuttamatonta koodia. Tämä palauttaa
// kytkimen JA lisää sen mitä alkuperäisestä puuttui: valinnan muistin ja
// selaimen kielen tunnistuksen.
//
// SSR-TURVA: palvelin renderöi aina 'fi' (ei tiedä selaimen kieltä eikä
// localStoragea). Selaimen kieli luetaan vasta mountin jälkeen efektissä,
// jolloin hydraatio ei riko HTML:ää. Siksi ensimmäinen maalaus on suomeksi
// myös englanninkielisellä käyttäjällä — vaihto tapahtuu heti sen jälkeen.

import { createContext, useContext, useState, useCallback, useEffect, type ReactNode } from 'react'
import { type Lang, type TranslationKey, getTranslation } from '@/lib/i18n'

const STORAGE_KEY = 'mt-lang'

interface LanguageContextValue {
  lang: Lang
  setLang: (lang: Lang) => void
  t: (key: TranslationKey) => string
}

const LanguageContext = createContext<LanguageContextValue>({
  lang: 'fi',
  setLang: () => {},
  t: (key) => key,
})

/** Selaimen kieli → tuettu kieli. Kaikki muu kuin suomi saa englannin:
 *  ruotsin- tai vironkieliselle turistille englanti on lähempänä kuin suomi. */
function detectLang(): Lang {
  if (typeof navigator === 'undefined') return 'fi'
  const langs = [navigator.language, ...(navigator.languages ?? [])]
  for (const l of langs) {
    if (!l) continue
    if (/^fi\b/i.test(l)) return 'fi'
  }
  return langs.some(Boolean) ? 'en' : 'fi'
}

/** @param initial Pakota kieli riippumatta selaimesta ja tallennetusta valinnasta.
 *  Käytössä /en-reitillä: se on OMA osoitteensa hakukoneille, joten sen on
 *  oltava englanniksi myös silloin kun käyttäjä on aiemmin valinnut suomen —
 *  muuten Googlen indeksoima sisältö ja käyttäjän näkemä eroaisivat. */
export function LanguageProvider({ children, initial }: { children: ReactNode; initial?: Lang }) {
  const [lang, setLangState] = useState<Lang>(initial ?? 'fi')

  // Tallennettu valinta voittaa selaimen kielen — käyttäjän oma päätös pysyy.
  useEffect(() => {
    if (initial) {
      if (typeof document !== 'undefined') document.documentElement.lang = initial
      return
    }
    const t0 = setTimeout(() => {
      let next: Lang | null = null
      try {
        const saved = localStorage.getItem(STORAGE_KEY)
        if (saved === 'fi' || saved === 'en') next = saved
      } catch { /* privaattitila */ }
      if (!next) next = detectLang()
      // Asetetaan AINA, myös 'fi'. Aiempi ehto `if (next !== 'fi')` oletti että
      // tila on lähtökohtaisesti 'fi', mutta /en pakottaa sen arvoon 'en' —
      // sieltä poistuttaessa efekti ajautuu uudelleen, luki localStoragesta
      // 'fi' eikä palauttanut tilaa, jolloin <html lang> sanoi 'fi' ja
      // käyttöliittymä näytti yhä englantia.
      setLangState(next)
      if (typeof document !== 'undefined') document.documentElement.lang = next
    }, 0)
    return () => clearTimeout(t0)
  }, [initial])

  const setLang = useCallback((l: Lang) => {
    setLangState(l)
    try { localStorage.setItem(STORAGE_KEY, l) } catch { /* privaattitila */ }
    if (typeof document !== 'undefined') document.documentElement.lang = l
  }, [])

  const t = useCallback((key: TranslationKey) => getTranslation(lang, key), [lang])

  return (
    <LanguageContext.Provider value={{ lang, setLang, t }}>
      {children}
    </LanguageContext.Provider>
  )
}

export function useLanguage() {
  return useContext(LanguageContext)
}

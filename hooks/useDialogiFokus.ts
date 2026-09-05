'use client'

// Dialogien fokushallinta (WCAG 2.2: 2.1.2 ei näppäimistöansaa, 2.4.3
// fokusjärjestys). Auditointi 5.9.2026: yksikään paneeli ei siirtänyt
// fokusta avattaessa, loukuttanut Tab-kiertoa eikä palauttanut fokusta
// avanneeseen elementtiin — näppäimistökäyttäjä jäi paneelin ALLE jäävään
// sisältöön eikä ruudunlukija huomannut koko paneelia.
//
// Käyttö: anna paneelin juurielementille ref + tabIndex={-1} ja kutsu
// useDialogiFokus(open, ref, onClose). Escape sulkee (onClose), Tab kiertää
// paneelin sisällä, ja sulkeutuessa fokus palaa avanneeseen elementtiin.

import { useEffect, useRef, type RefObject } from 'react'

const FOKUSOITAVAT =
  'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'

export function useDialogiFokus(
  open: boolean,
  ref: RefObject<HTMLElement | null>,
  onClose?: () => void,
) {
  // onClose refiin: paneelit luovat uuden sulkijan joka renderillä, eikä
  // effektin saa antaa purkautua (ja palauttaa fokusta!) kesken avoinnaolon.
  const onCloseRef = useRef(onClose)
  onCloseRef.current = onClose

  useEffect(() => {
    if (!open) return
    const avaaja = document.activeElement as HTMLElement | null
    // Fokus paneeliin liukuanimaation käynnistyttyä — heti kutsuttuna selain
    // vierittäisi transformoitua elementtiä ja liuku nykisi.
    const t = setTimeout(() => ref.current?.focus({ preventScroll: true }), 50)

    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        // Vain jos sulkija annettiin — pääpaneelit sitovat Escapen itse.
        if (onCloseRef.current) {
          e.stopPropagation()
          onCloseRef.current()
        }
        return
      }
      if (e.key !== 'Tab' || !ref.current) return
      const solmut = [...ref.current.querySelectorAll<HTMLElement>(FOKUSOITAVAT)]
        .filter((n) => n.offsetParent !== null)
      if (solmut.length === 0) {
        e.preventDefault()
        return
      }
      const eka = solmut[0]
      const vika = solmut[solmut.length - 1]
      const aktiivinen = document.activeElement
      // Fokus paneelin ulkopuolella (esim. juuri avattu) → sisään.
      if (!ref.current.contains(aktiivinen)) {
        e.preventDefault()
        ;(e.shiftKey ? vika : eka).focus()
        return
      }
      if (e.shiftKey && (aktiivinen === eka || aktiivinen === ref.current)) {
        e.preventDefault()
        vika.focus()
      } else if (!e.shiftKey && aktiivinen === vika) {
        e.preventDefault()
        eka.focus()
      }
    }
    document.addEventListener('keydown', onKey)
    return () => {
      clearTimeout(t)
      document.removeEventListener('keydown', onKey)
      // Fokus takaisin avanneeseen elementtiin, jos se on yhä sivulla.
      if (avaaja && document.contains(avaaja)) avaaja.focus({ preventScroll: true })
    }
  }, [open, ref])
}

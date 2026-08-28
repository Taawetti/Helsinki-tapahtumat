'use client'

// Sivun avauksen kirjaus. Tämä on kävijämittauksen perusta: kaikki muut
// tapahtumatyypit vaativat klikkauksen, joten ilman tätä kävijä joka saapuu,
// lukee illan tapahtumat ja poistuu ei näy missään luvussa — ei maajakaumassa
// eikä eri kävijöissä. Mitattu 28.8.2026: kannan 74 rivistä jokainen oli
// syntynyt klikkauksesta.
//
// JUURILAYOUTISSA, ei HomeClientissä. Näin kirjaus kattaa myös ne sivut jotka
// eivät renderöi sovellusnäkymää (/lataa, /tietosuoja, /lahteet) — ja sovellus
// itse tulee mukaan siinä sivussa, koska laskeutumissivut renderöivät
// HomeShellin saman layoutin alla.
//
// Poissulut hoituvat lib/trackissa ja palvelimella: kehityspalvelin,
// esikatselujulkaisut, ?notrack=1 -laitteet ja admin-istunto eivät kirjaudu.

import { useEffect, useRef } from 'react'
import { usePathname } from 'next/navigation'
import { track } from '@/lib/track'

export default function PageView() {
  const pathname = usePathname()
  // Sama polku ei kirjaudu kahdesti. Suojaa myös Reactin kehitystilan
  // kaksoisajolta — tuotannossa efekti ajetaan kerran, mutta vahti on
  // halpa eikä luku saa riippua siitä missä tilassa React on.
  const kirjattu = useRef<string | null>(null)

  useEffect(() => {
    if (!pathname || kirjattu.current === pathname) return
    kirjattu.current = pathname
    // Polku talteen, jotta 47 laskeutumissivun liikenteen näkee erikseen.
    // Hakuparametreja EI oteta mukaan: ne voivat sisältää hakusanan, ja
    // sivupolku riittää kertomaan mitä avattiin.
    track('pageview', { label: pathname })
  }, [pathname])

  return null
}

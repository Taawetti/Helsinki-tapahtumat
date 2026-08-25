// Englanninkielinen etusivu omassa osoitteessaan.
//
// MIKSI OMA REITTI EIKÄ PELKKÄ KYTKIN. Kielikytkin elää selaimessa
// (localStorage), joten Googlen indeksoima "/" on aina suomeksi eikä
// englanninkielinen versio näy hakutuloksissa lainkaan. Turistin pitää löytää
// tämä hakemalla "what to do in Helsinki today", joten englannille tarvitaan
// oma indeksoitava URL ja hreflang-parit.
//
// MIKSI /en EIKÄ /[lang]. Kaikki suomenkieliset sivut ovat jo indeksoituja
// osoitteissa /saunat, /tapahtumat/tanaan jne. Siirto [lang]-segmentin alle
// muuttaisi jokaisen niistä ja hukkaisi kertyneen hakukonenäkyvyyden.
//
// Kieli tulee contexts/LanguageGate.tsx:stä polun perusteella — tämä layout
// vastaa vain metatiedoista.
//
// HUOM <html lang>: juurilayout kiinnittää sen suomeksi eikä sisäkkäinen layout
// voi muuttaa sitä. LanguageProvider korjaa arvon mountissa, ja hreflang +
// englanninkielinen metadata kertovat kielen jo palvelimen HTML:ssä.

import type { Metadata } from 'next'

const BASE = process.env.NEXT_PUBLIC_SITE_URL || 'https://helsinki-tapahtumat.vercel.app'

export const metadata: Metadata = {
  // absolute ohittaa juuren mallin '%s | Mitä tänään Helsinki' — suomenkielinen
  // jälkiliite englanninkielisessä otsikossa söi tilaa hakutuloksessa.
  title: { absolute: 'What’s on in Helsinki today — events, gigs & things to do' },
  description:
    'Every event in Helsinki in one place — gigs, clubs, theatre, festivals, exhibitions, sports and free events. Updated daily from 45 sources.',
  openGraph: {
    title: 'What’s on in Helsinki today',
    description:
      'Gigs, clubs, theatre, festivals and free events in Helsinki — updated daily from 45 sources.',
    type: 'website',
    locale: 'en_GB',
    alternateLocale: ['fi_FI'],
    siteName: 'Mitä tänään',
    url: `${BASE}/en`,
    // Parametrit, koska parametriton /api/og piirtää suomenkielisen
    // oletuskortin ("HELSINKI TAPAHTUMAT") — englanninkielinen jako näyttäisi
    // suomea. Ks. app/api/og/route.tsx.
    images: [{
      url: '/api/og?brand=HELSINKI%20EVENTS&title=' + encodeURIComponent('What’s on in Helsinki today'),
      width: 1200,
      height: 630,
    }],
  },
  twitter: {
    card: 'summary_large_image',
    title: 'What’s on in Helsinki today',
    description: 'Gigs, clubs, theatre, festivals and free events in Helsinki.',
  },
  keywords: [
    'what to do in Helsinki', 'Helsinki events', 'Helsinki events today',
    'things to do in Helsinki', 'Helsinki gigs', 'Helsinki nightlife',
    'free events Helsinki', 'Helsinki concerts', 'Helsinki festivals',
    'Helsinki event calendar', 'Helsinki this weekend',
  ],
  alternates: {
    canonical: `${BASE}/en`,
    languages: {
      fi: BASE,
      en: `${BASE}/en`,
      'x-default': BASE,
    },
  },
}

export default function EnLayout(props: LayoutProps<'/en'>) {
  return <>{props.children}</>
}

import type { Metadata } from 'next'
import HomeShell from '@/components/HomeShell'

const BASE = process.env.NEXT_PUBLIC_SITE_URL || 'https://mitatanaan.fi'

// Canonical on sivukohtainen, ei juurilayoutissa: siellä se periytyi jokaiselle
// sivulle jolla ei ole omaansa ja teki niistä Googlen silmissä etusivun kopioita.
export const metadata: Metadata = {
  alternates: {
    canonical: BASE,
    // Kielipari. Englanninkielinen etusivu on omassa osoitteessaan, jotta se voi
    // ylipäänsä näkyä hakutuloksissa — kielikytkin yksin elää selaimessa eikä
    // Google näe sitä. x-default osoittaa suomeen, koska pääyleisö on täällä.
    languages: {
      fi: BASE,
      en: `${BASE}/en`,
      'x-default': BASE,
    },
  },
}

export default async function Page() {
  return <HomeShell />
}

'use client'

// Yksi kielikonteksti koko sovellukselle, mutta reittitietoinen.
//
// MIKSI TÄMÄ EIKÄ SISÄKKÄINEN PROVIDER. Englanninkielinen etusivu on omassa
// osoitteessaan /en, ja sen PALVELIMEN RENDERÖIMÄN HTML:n on oltava englantia —
// muuten Google indeksoi sielläkin suomea eikä koko reitistä ole hyötyä. Ensin
// tämä tehtiin kääriämällä /en-layout omaan LanguageProvideriin, mutta silloin
// providereita on kaksi sisäkkäin ja MOLEMPIEN efekti kirjoittaa
// <html lang>:iin. React ajaa lapsen efektin ensin ja juuren vasta perään, ja
// juuren efekti on lisäksi setTimeoutin takana — eli ulompi olisi aina
// ylikirjoittanut sisemmän ja /en olisi päätynyt lang="fi":hin.
//
// Polku luetaan usePathnamella, joka toimii myös palvelinrenderöinnissä eikä
// tee sivusta dynaamista — ISR säilyy kaikilla 11 SEO-sivulla.

import { usePathname } from 'next/navigation'
import { LanguageProvider } from '@/contexts/LanguageContext'

export default function LanguageGate({ children }: { children: React.ReactNode }) {
  const pathname = usePathname()
  return (
    <LanguageProvider initial={pathname === '/en' ? 'en' : undefined}>
      {children}
    </LanguageProvider>
  )
}

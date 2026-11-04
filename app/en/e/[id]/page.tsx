// Jaettu tapahtuma englanniksi: /en/e/<id>. Sama toteutus kuin /e/<id>
// (app/e/[id]/jaettu-sivu.tsx); kieli tulee polusta (contexts/LanguageGate),
// joten paneeli, otsikot ja Jaa-linkki ovat englanniksi.
import type { Metadata } from 'next'
import { jaettuMetadata, JaettuSivu, type Props } from '@/app/e/[id]/jaettu-sivu'

export async function generateMetadata(props: Props): Promise<Metadata> {
  return jaettuMetadata(props, 'en')
}

export default async function EnEventPage(props: Props) {
  return <JaettuSivu {...props} lang="en" />
}

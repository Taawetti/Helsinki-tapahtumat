// Jaettu tapahtuma suomeksi: /e/<id>. Toteutus jaettu-sivu.tsx:ssä, sama
// koodi palvelee englanninkielistä /en/e/<id>-reittiä (app/en/e).
import type { Metadata } from 'next'
import { jaettuMetadata, JaettuSivu, type Props } from './jaettu-sivu'

export async function generateMetadata(props: Props): Promise<Metadata> {
  return jaettuMetadata(props, 'fi')
}

export default async function EventPage(props: Props) {
  return <JaettuSivu {...props} lang="fi" />
}

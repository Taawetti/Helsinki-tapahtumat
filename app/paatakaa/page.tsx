import type { Metadata } from 'next'
import PaatakaaView from '@/components/PaatakaaView'

export const metadata: Metadata = {
  title: 'Päättäkää yhdessä — mitä tänään tehdään? | Mitä tänään',
  description: 'Jaa linkki kavereille, jokainen swaippaa ehdotuksia omalla puhelimellaan, ja AI kutoo äänistä valmiin illan kaaren. Helsingin paras tapa päättää yhdessä.',
  openGraph: {
    title: 'Päättäkää yhdessä — mitä tänään tehdään?',
    description: 'Swaipatkaa yhdessä → AI kutoo teille täydellisen illan kaaren.',
    type: 'website',
    locale: 'fi_FI',
  },
}

export default function PaatakaaPage() {
  return <PaatakaaView />
}

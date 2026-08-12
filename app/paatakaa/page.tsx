import type { Metadata } from 'next'
import PaatakaaView from '@/components/PaatakaaView'

export const metadata: Metadata = {
  title: 'Päättäkää yhdessä — mitä tänään tehdään? | Mitä tänään',
  description: 'Päättäkää yhdessä mitä tehdä Helsingissä: jaa linkki kavereille, swaippatkaa ehdotukset ja AI kutoo äänistä valmiin illan kaaren minuuteissa.',
  openGraph: {
    title: 'Päättäkää yhdessä — mitä tänään tehdään?',
    description: 'Päättäkää yhdessä mitä tehdä Helsingissä: jaa linkki kavereille, swaippatkaa ehdotukset ja AI kutoo äänistä valmiin illan kaaren minuuteissa.',
    type: 'website',
    locale: 'fi_FI',
  },
}

export default function PaatakaaPage() {
  return <PaatakaaView />
}

import type { Metadata } from 'next'
import PlannerView from '@/components/PlannerView'

export const metadata: Metadata = {
  title: 'Suunnittele Helsinki-reissu — Tekoäly suunnittelee päiväohjelmasi',
  description:
    'Tekoäly rakentaa sinulle täydellisen Helsinki-päiväohjelman. Kerro keitä matkustatte, milloin ja mikä kiinnostaa — saat aikataulutetun, personoidun suunnitelman reaaliaikaisella tapahtumadatalla.',
  openGraph: {
    title: 'Suunnittele Helsinki-reissu | Mitä tänään',
    description: 'Personoitu AI-päiväohjelma Helsinkiin — reaaliaikaiset tapahtumat, ravintolat ja aktiviteetit.',
    type: 'website',
  },
}

export default function SuunnittelePage() {
  return <PlannerView />
}

import type { Metadata } from 'next'
import VenueForm from './VenueForm'

const BASE = process.env.NEXT_PUBLIC_SITE_URL || 'https://mitatanaan.fi'

// Landing + lomake keikkapaikoille, baareille ja järjestäjille.
export const metadata: Metadata = {
  title: 'Julkaise ohjelmasi 2 minuutissa — ohjelma-ilmoittajalle',
  description: 'Keikkapaikka, baari tai tapahtumajärjestäjä? Ilmoita ohjelmasi Mitä tänään -palveluun: näkyvyys 41 tapahtumalähteen yhdistelmässä, oma venue-sivu ja paikka ryhmäpäätöspakoissa. Ilmainen julkaisu 2 minuutissa.',
  openGraph: {
    title: 'Julkaise ohjelmasi 2 minuutissa | Mitä tänään',
    description: 'Näkyvyys 41 tapahtumalähteen yhdistelmässä, oma venue-sivu ja ryhmäpäätöspakat. Ilmoita ohjelmasi Helsinkiin.',
    type: 'website',
    locale: 'fi_FI',
    // Ilman images-kenttää sivun oma openGraph korvasi juurilayoutin ja
    // jakokuva katosi kokonaan.
    images: [{ url: `/api/og?brand=HELSINKI%20TAPAHTUMAT&title=${encodeURIComponent('Julkaise ohjelmasi')}`, width: 1200, height: 630 }],
  },
  // Ilman omaa canonicalia tämä peri juurilayoutin arvon eli ilmoitti Googlelle
  // olevansa etusivu — sivu ei olisi voinut nousta hauille "ilmoita tapahtuma".
  alternates: { canonical: `${BASE}/ohjelma-ilmoittajalle` },
}

const SELLING_POINTS = [
  {
    emoji: '📡',
    title: 'Näkyvyys 41 lähteen yhdistelmässä',
    desc: 'Ohjelmasi näkyy samassa virrassa Helsingin suurimpien tapahtumalähteiden kanssa — ei kadonnut somealgoritmeihin.',
  },
  {
    emoji: '📍',
    title: 'Oma venue-sivu',
    desc: 'Kaikki paikkasi tulevat tapahtumat kootusti yhdellä sivulla — helppo linkittää omille asiakkaillesi.',
  },
  {
    emoji: '🧭',
    title: 'Mukana ryhmäpäätöspakoissa',
    desc: 'Päättäkää-ominaisuus ehdottaa ohjelmaasi ryhmille, jotka swaippaavat yhdessä illan suunnitelmaa.',
  },
]

export default function OhjelmaIlmoittajallePage() {
  return (
    <main className="max-w-lg mx-auto px-4 pt-10 pb-24 space-y-7">
      {/* Hero */}
      <div>
        <p className="text-white/30 text-[11px] font-black uppercase tracking-[.2em] mb-2">
          KEIKKAPAIKOILLE · BAAREILLE · JÄRJESTÄJILLE
        </p>
        <h1 className="font-black text-white leading-tight" style={{ fontSize: 'clamp(1.9rem,7vw,2.6rem)', letterSpacing: '-0.03em' }}>
          Julkaise ohjelmasi 2 minuutissa
        </h1>
        <p className="text-white/50 font-semibold mt-3 leading-relaxed">
          Täytä alle lomake — tarkistamme ilmoituksen ja julkaisemme ohjelman Mitä tänään -palvelussa yleensä vuorokaudessa.
        </p>
      </div>

      {/* Myyntipuhe: mitä ilmoittaja saa */}
      <div className="space-y-3">
        {SELLING_POINTS.map(p => (
          <div key={p.title} className="flex gap-3.5 rounded-2xl p-4"
            style={{ background: 'rgba(255,255,255,.03)', border: '1px solid rgba(255,255,255,.07)' }}>
            <span className="text-2xl leading-none shrink-0 mt-0.5">{p.emoji}</span>
            <div>
              <p className="font-black text-white text-[15px] leading-snug">{p.title}</p>
              <p className="text-white/45 text-[13px] font-semibold mt-1 leading-snug">{p.desc}</p>
            </div>
          </div>
        ))}
      </div>

      {/* Lomake */}
      <VenueForm />
    </main>
  )
}

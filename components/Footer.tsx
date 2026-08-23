'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { VIBES } from '@/lib/types'

// Sivuston footer — KAKSI ROOLIA (omistajan linjaus: "alhaalla ei saisi olla
// valikoita mitä käyttäjä käyttää", mutta SEO pitää olla kunnossa):
//
//   Sovelluksessa (/): pelkkä brändirivi. Käyttäjän valikot ovat ylhäällä —
//   kategoriat ruudukossa, kaupunginosat ja oppaat pillereissä.
//
//   Laskeutumissivuilla (/saunat, /terassit, /tapahtumat/*…): täysi
//   linkkifooter. Sinne Google ja hakijat tulevat, siellä sisäinen linkitys
//   tekee työnsä ja "katso myös" on aidosti hyödyllinen.
export default function Footer() {
  const pathname = usePathname()
  if (pathname === '/') {
    return (
      <footer className="border-t border-white/10 mt-16 pb-24 md:pb-8">
        <div className="max-w-5xl mx-auto px-4 pt-8">
          <p className="font-bold text-white">Mitä tänään</p>
          <p className="text-white/40 text-sm mt-1">Kaikki pääkaupunkiseudun tapahtumat yhdessä paikassa.</p>
          <p className="text-white/30 text-xs mt-6">© {new Date().getFullYear()} Mitä tänään</p>
        </div>
      </footer>
    )
  }
  return (
    <footer className="border-t border-white/10 mt-16 pb-24 md:pb-8">
      <div className="max-w-5xl mx-auto px-4 pt-10">
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-8 text-sm">
          <div>
            <p className="font-bold text-white mb-1">Mitä tänään</p>
            <p className="text-white/50 leading-relaxed">
              Kaikki pääkaupunkiseudun tapahtumat yhdessä paikassa.
            </p>
          </div>

          <nav aria-label="Tapahtumat">
            <p className="font-semibold text-white/80 mb-2">Tapahtumat</p>
            <ul className="space-y-1.5 text-white/50">
              <li><Link className="hover:text-white transition-colors" href="/tapahtumat/tanaan">Tapahtumat tänään</Link></li>
              <li><Link className="hover:text-white transition-colors" href="/tapahtumat/viikonloppu">Tapahtumat viikonloppuna</Link></li>
              <li><Link className="hover:text-white transition-colors" href="/tapahtumat/ilmaiset">Ilmaiset tapahtumat</Link></li>
              <li><Link className="hover:text-white transition-colors" href="/uutta-helsingissa">Uutta Helsingissä</Link></li>
              <li><Link className="hover:text-white transition-colors" href="/saunat">Saunat</Link></li>
              <li><Link className="hover:text-white transition-colors" href="/kirpputorit">Kirpputorit</Link></li>
              <li><Link className="hover:text-white transition-colors" href="/jamit">Jamit & open mic</Link></li>
              <li><Link className="hover:text-white transition-colors" href="/ilmaiset-museot">Ilmaiset museot</Link></li>
              <li><Link className="hover:text-white transition-colors" href="/terassit">Terassit</Link></li>
              <li><Link className="hover:text-white transition-colors" href="/yokerhot">Yökerhot</Link></li>
              <li><Link className="hover:text-white transition-colors" href="/pubivisat">Pubivisat</Link></li>
            </ul>
          </nav>

          <nav aria-label="Kategoriat">
            <p className="font-semibold text-white/80 mb-2">Kategoriat</p>
            <ul className="space-y-1.5 text-white/50">
              {VIBES.map((v) => (
                <li key={v.id}>
                  <Link className="hover:text-white transition-colors" href={`/tapahtumat/${v.id}`}>
                    {v.label}
                  </Link>
                </li>
              ))}
            </ul>
          </nav>

        </div>

        <p className="text-white/30 text-xs mt-10">
          © {new Date().getFullYear()} Mitä tänään
        </p>
      </div>
    </footer>
  )
}

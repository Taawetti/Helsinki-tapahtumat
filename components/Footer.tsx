import Link from 'next/link'
import { VIBES, NEIGHBORHOODS, NEIGHBORHOOD_INESSIVE } from '@/lib/types'
import { VENUE_PAGES } from '@/lib/venue-pages'

// Sivuston footer — ainoa paikka joka linkittää SPA:sta SEO-laskeutumissivuille
// (/tapahtumat/*, /ohjelma/*, vertikaalit). Sisäinen linkitys sekä käyttäjille
// että hakukoneille. Server-komponentti, renderöityy joka sivulle layout.tsx:stä.
export default function Footer() {
  return (
    <footer className="border-t border-white/10 mt-16 pb-24 md:pb-8">
      <div className="max-w-5xl mx-auto px-4 pt-10">
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-5 gap-8 text-sm">
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

          <nav aria-label="Kaupunginosat">
            <p className="font-semibold text-white/80 mb-2">Kaupunginosat</p>
            <ul className="space-y-1.5 text-white/50">
              {NEIGHBORHOODS.map((n) => (
                <li key={n.id}>
                  <Link className="hover:text-white transition-colors" href={`/tapahtumat/${n.id}`}>
                    Tapahtumat {NEIGHBORHOOD_INESSIVE[n.id] ?? n.name}
                  </Link>
                </li>
              ))}
            </ul>
          </nav>

          <nav aria-label="Keikkapaikat">
            <p className="font-semibold text-white/80 mb-2">Keikkapaikat</p>
            <ul className="space-y-1.5 text-white/50">
              {VENUE_PAGES.map((v) => (
                <li key={v.slug}>
                  <Link className="hover:text-white transition-colors" href={`/ohjelma/${v.slug}`}>
                    {v.name}
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

// Englanninkielisten laskeutumissivujen jaettu runko.
//
// MIKSI OMA RUNKO EIKÄ SUOMENKIELISTEN SIVUJEN MUOKKAUS. Suomenkieliset
// SEO-sivut ovat tällä hetkellä sivuston tuottavin omaisuus (mitattu 26.8.2026:
// 42 030 hakua/kk, valtaosin matalalla kilpailulla) ja ne ovat juuri
// indeksoitumassa. Niiden refaktorointi jaettuun runkoon toisi regressioriskin
// ilman hyötyä, joten ne jäävät koskematta. Tämä runko poistaa toiston VAIN
// uusien englanninkielisten sivujen kesken.
//
// MIKSI ENGLANNINKIELISET SLUGIT (/en/saunas eikä /en/saunat). Hakusana
// osoitteessa on Googlelle signaali, ja englanninkielinen hakija kirjoittaa
// "sauna helsinki" — mitattu 8 100 hakua/kk maailmanlaajuisesti.

import Link from 'next/link'

export interface EnSeeAlso {
  href: string
  label: string
}

interface Props {
  /** Sivun oma emoji + otsikko, esim. "🧖 Public saunas in Helsinki". */
  emoji: string
  title: string
  /** Murupolun viimeinen osa, esim. "Saunas". */
  crumb: string
  /** Lyhyt tilastorivi otsikon alla, esim. "41 public saunas · hours & prices". */
  stat: string
  /** Sama teksti kuin metadatan description — Googlen näkemä lupaus. */
  intro: string
  /** Sivun varsinainen sisältö (jaettu näkymäkomponentti). */
  children: React.ReactNode
  seeAlso: EnSeeAlso[]
  /** Lähdemaininta sivun alalaidassa. Rehellisyys datan alkuperästä. */
  sources: string
  /** Runko sovellusnäkymän ALLE eikä omaksi sivukseen. Kun laskeutumissivu
   *  avaa sovelluksen (HomeShell), tämä ei saa olla oma kokoruudun main —
   *  muuten sivulla olisi kaksi kehystä. Otsikko muuttuu samalla
   *  ruudunlukijoille näkyväksi mutta visuaalisesti piilotetuksi: sovelluksella
   *  on jo oma otsikkorivinsä, eikä sivulla saa olla kahta h1:tä. */
  asSection?: boolean
}

export default function EnGuidePage({ emoji, title, crumb, stat, intro, children, seeAlso, sources, asSection }: Props) {
  const Frame = asSection ? 'section' : 'main'
  return (
    <Frame
      className={asSection ? 'max-w-2xl mx-auto px-4 pb-10 pt-2 block text-white' : 'min-h-screen text-white'}
      style={asSection ? undefined : { background: '#0a0a0c' }}
    >
      <div className={asSection ? '' : 'max-w-2xl mx-auto px-4 py-8'}>
        {!asSection && (
          <nav className="text-sm text-white/35 mb-6 flex items-center gap-2">
            <Link href="/en" className="hover:text-white/70 transition-colors">Mitä tänään</Link>
            <span>/</span>
            <span className="text-white">{crumb}</span>
          </nav>
        )}

        <div className="mb-6">
          {asSection ? (
            <h1 className="sr-only">{title}</h1>
          ) : (
            <h1 className="text-3xl font-black mb-2" style={{ letterSpacing: '-0.02em' }}>{emoji} {title}</h1>
          )}
          {!asSection && <p className="text-white/50 mb-3">{stat}</p>}
          <p className="text-sm text-white/35 leading-relaxed">{intro}</p>
        </div>

        {children}

        <div className="mt-10">
          <p className="text-xs text-white/30 uppercase tracking-wider mb-2">See also</p>
          <div className="flex flex-wrap gap-2">
            {seeAlso.map((l) => (
              <Link key={l.href} href={l.href} className="text-sm px-3 py-1.5 rounded-full transition-colors"
                style={{ background: 'rgba(255,255,255,.06)', color: 'rgba(255,255,255,.7)' }}>{l.label}</Link>
            ))}
          </div>
        </div>

        <p className="mt-8 text-[11px] text-white/25 leading-relaxed">{sources}</p>
      </div>
    </Frame>
  )
}

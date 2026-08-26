'use client'

// Oma virhesivu. Aiemmin käytössä oli Next.js:n oletus: musta sivu jossa lukee
// englanniksi "404 · This page could not be found", ei logoa, ei yhtään linkkiä
// takaisin. Mitattu 26.8.2026: näkyvää tekstiä 40 merkkiä, linkkejä sivustolle 0.
//
// MIKSI TÄLLÄ ON VÄLIÄ. Sivuston reiteissä on ääkkösettömiä muotoja (tanaan,
// ilmaiset-museot), jotka on helppo kirjoittaa väärin — omistaja osui kahdesti
// peräkkäin muotoihin /sauna ja /tapahtumat/tanaa. Osoitteita kirjoitetaan
// käsin QR-korteista ja puskaradiosta, joten satunnainen kävijä päätyi
// umpikujaan josta ei päässyt mihinkään.
//
// Lähelle osuvat kirjoitusasut ohjataan oikeaan jo ennen tätä sivua
// (next.config.ts, redirects) — tämä on se mitä jää jäljelle kun ohjaus ei osu.

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useSyncExternalStore } from 'react'
import { useLanguage } from '@/contexts/LanguageContext'
import { Logo } from '@/components/Logo'

interface Pick { href: string; hrefEn: string; emoji: string; fi: string; en: string }

// Suosituimmat sivut mitatun hakuvolyymin mukaan (DataForSEO 26.8.2026):
// tapahtumat 12 100, keikat 9 900, sauna 8 100 (en), yökerhot 1 900.
//
// hrefEn osoittaa OLEMASSA OLEVAAN /en-reittiin. Tarkistettu app/en/:stä
// 26.8.2026 — englanninkielistä keikkasivua ei ole, joten sen tilalla on
// viikonloppu. Englanninkielistä kävijää ei saa pudottaa suomenkieliselle
// sivulle: hän tuli tänne jo kerran umpikujaan.
const PICKS: Pick[] = [
  { href: '/',                    hrefEn: '/en/events-today',        emoji: '🎉', fi: 'Tapahtumat tänään', en: 'Events today' },
  { href: '/tapahtumat/keikka',   hrefEn: '/en/events-this-weekend', emoji: '🎸', fi: 'Keikat',            en: 'This weekend' },
  { href: '/saunat',              hrefEn: '/en/saunas',              emoji: '🧖', fi: 'Saunat',            en: 'Saunas' },
  { href: '/yokerhot',            hrefEn: '/en/nightclubs',          emoji: '🪩', fi: 'Yökerhot',          en: 'Nightclubs' },
  { href: '/tapahtumat/ilmaiset', hrefEn: '/en/free-events',         emoji: '🆓', fi: 'Ilmaiset',          en: 'Free events' },
  { href: '/terassit',            hrefEn: '/en/terraces',            emoji: '☀️', fi: 'Terassit',          en: 'Terraces' },
]

// Kertoo onko koodi selaimessa vai palvelimella, ilman efektiä ja ilman
// hydraatiovirhettä. Palvelinlukema on false, selainlukema true, ja React
// vaihtaa niiden välillä vasta liitoksen jälkeen — juuri tähän tarkoitettu
// rajapinta. Vakiot moduulitasolla, jotta viittaus ei vaihdu joka renderöinnillä.
const subscribeNoop = () => () => {}
const onClient = () => true
const onServer = () => false

export default function NotFound() {
  const { t, lang } = useLanguage()
  const pathname = usePathname()
  const mounted = useSyncExternalStore(subscribeNoop, onClient, onServer)

  // Tämä sivu esirenderöidään kertaalleen juurilayoutissa, joka ei tunne
  // /en-etuliitettä — palvelin tuottaa siis aina suomea. Polku luetaan vasta
  // selaimessa, jolloin /en/mitä-vaan saa englannin. Kielivalitsimella valittu
  // englanti (lang) kelpaa myös suomenkielisellä polulla.
  const en = (mounted && (pathname === '/en' || pathname.startsWith('/en/'))) || lang === 'en'

  return (
    <main className="min-h-screen text-white flex items-start justify-center" style={{ background: '#0a0a0c' }}>
      <div className="max-w-lg w-full px-5 pt-24 pb-16">
        <Link href={en ? '/en' : '/'} className="flex items-center gap-2.5 mb-10 w-fit">
          <Logo size={16} />
        </Link>

        <p className="text-[11px] font-black uppercase tracking-[.2em] text-white/25 mb-2">404</p>
        <h1 className="text-3xl font-black mb-3" style={{ letterSpacing: '-0.02em' }}>{t('nf.title')}</h1>
        <p className="text-white/45 text-[14px] leading-relaxed mb-8">{t('nf.sub')}</p>

        <Link href={en ? '/en' : '/'}
          className="inline-flex items-center gap-2 px-5 py-3 rounded-2xl font-black text-[14px] text-white transition-all active:scale-[.98]"
          style={{ background: 'linear-gradient(150deg,#6b76ff,#5059e6)', boxShadow: '0 12px 32px -8px rgba(91,101,230,.55)' }}>
          {t('nf.home')} →
        </Link>

        <p className="text-xs text-white/30 uppercase tracking-wider mt-12 mb-3">{t('nf.popular')}</p>
        <div className="flex flex-wrap gap-2">
          {PICKS.map((p) => (
            <Link key={p.href} href={en ? p.hrefEn : p.href}
              className="text-sm px-3.5 py-2 rounded-full transition-colors hover:bg-white/10"
              style={{ background: 'rgba(255,255,255,.06)', color: 'rgba(255,255,255,.7)' }}>
              {p.emoji} {en ? p.en : p.fi}
            </Link>
          ))}
        </div>
      </div>
    </main>
  )
}

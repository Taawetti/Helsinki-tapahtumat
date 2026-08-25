'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { VIBES } from '@/lib/types'
import { useLanguage } from '@/contexts/LanguageContext'
import type { TranslationKey } from '@/lib/i18n'

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
  const { t } = useLanguage()
  if (pathname === '/') {
    return (
      <footer className="border-t border-white/10 mt-16 pb-24 md:pb-8">
        <div className="max-w-5xl mx-auto px-4 pt-8">
          <p className="font-bold text-white">Mitä tänään</p>
          <p className="text-white/40 text-sm mt-1">{t('footer.tagline')}</p>
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
              {t('footer.tagline')}
            </p>
          </div>

          <nav aria-label={t('nav.home')}>
            <p className="font-semibold text-white/80 mb-2">{t('nav.home')}</p>
            <ul className="space-y-1.5 text-white/50">
              <li><Link className="hover:text-white transition-colors" href="/tapahtumat/tanaan">{t('discover.grid_title')}</Link></li>
              <li><Link className="hover:text-white transition-colors" href="/tapahtumat/viikonloppu">{t('footer.events_weekend')}</Link></li>
              <li><Link className="hover:text-white transition-colors" href="/tapahtumat/ilmaiset">{t('footer.events_free')}</Link></li>
              <li><Link className="hover:text-white transition-colors" href="/uutta-helsingissa">{t('footer.whats_new')}</Link></li>
              <li><Link className="hover:text-white transition-colors" href="/saunat">{t('footer.saunas')}</Link></li>
              <li><Link className="hover:text-white transition-colors" href="/kirpputorit">{t('footer.flea_markets')}</Link></li>
              <li><Link className="hover:text-white transition-colors" href="/jamit">{t('footer.jams')}</Link></li>
              <li><Link className="hover:text-white transition-colors" href="/ilmaiset-museot">{t('footer.free_museums')}</Link></li>
              <li><Link className="hover:text-white transition-colors" href="/terassit">{t('footer.terraces')}</Link></li>
              <li><Link className="hover:text-white transition-colors" href="/yokerhot">{t('footer.nightclubs')}</Link></li>
              <li><Link className="hover:text-white transition-colors" href="/pubivisat">{t('footer.pub_quizzes')}</Link></li>
            </ul>
          </nav>

          <nav aria-label={t('footer.categories')}>
            <p className="font-semibold text-white/80 mb-2">{t('footer.categories')}</p>
            <ul className="space-y-1.5 text-white/50">
              {VIBES.map((v) => (
                <li key={v.id}>
                  <Link className="hover:text-white transition-colors" href={`/tapahtumat/${v.id}`}>
                    {t(v.tKey as TranslationKey)}
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

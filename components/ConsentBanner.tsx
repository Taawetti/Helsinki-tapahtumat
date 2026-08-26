'use client'

// Evästebanneri. Näytetään vain kun käyttäjä ei ole vielä valinnut.
//
// MIKSI USESYNCEXTERNALSTORE. Valinta asuu localStoragessa eli ulkoisessa
// tilassa, ja se voi muuttua myös muualla (tietosuojasivun "Vaihda valintaa").
// Tämä on juuri siihen tarkoitettu rajapinta: palvelin näkee null, selain
// lukee todellisen arvon vasta liitoksen jälkeen, eikä hydraatiovirhettä tule.
// useEffect + setState rikkoisi projektin lint-säännön eikä päivittyisi kun
// valinta vaihtuu samalla sivulla toisaalla.

import { useSyncExternalStore } from 'react'
import { useLanguage } from '@/contexts/LanguageContext'
import { subscribeConsent, readConsent, readConsentServer, setConsent } from '@/lib/consent'
import Link from 'next/link'

export default function ConsentBanner() {
  const { t, lang } = useLanguage()
  const choice = useSyncExternalStore(subscribeConsent, readConsent, readConsentServer)

  if (choice !== null) return null

  return (
    <div
      role="dialog"
      aria-label={t('consent.title')}
      className="fixed inset-x-3 bottom-3 md:left-auto md:right-5 md:bottom-5 md:w-[380px] z-[60] rounded-2xl p-4 shadow-2xl shadow-black/60"
      style={{ background: '#14141a', border: '1px solid rgba(255,255,255,.09)' }}
    >
      <p className="text-white font-black text-[14px] mb-1.5">{t('consent.title')}</p>
      <p className="text-white/50 text-[12.5px] leading-relaxed">{t('consent.body')}</p>

      <div className="flex items-center gap-2 mt-3.5">
        <button
          onClick={() => setConsent('granted')}
          className="flex-1 px-4 py-2.5 rounded-xl font-black text-[13px] text-white transition-transform active:scale-[.98]"
          style={{ background: 'linear-gradient(150deg,#6b76ff,#5059e6)' }}
        >
          {t('consent.accept')}
        </button>
        <button
          onClick={() => setConsent('denied')}
          className="flex-1 px-4 py-2.5 rounded-xl font-bold text-[13px] transition-colors hover:bg-white/10"
          style={{ background: 'rgba(255,255,255,.06)', color: 'rgba(255,255,255,.75)' }}
        >
          {t('consent.reject')}
        </button>
      </div>

      <Link
        href={lang === 'en' ? '/en/privacy' : '/tietosuoja'}
        className="inline-block mt-3 text-[11.5px] text-white/35 underline decoration-white/15 underline-offset-2 hover:text-white/60 transition-colors"
      >
        {t('consent.more')}
      </Link>
    </div>
  )
}

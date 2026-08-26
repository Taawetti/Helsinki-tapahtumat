'use client'

// Tietosuojaseloste. Jaettu suomen- ja englanninkielisen reitin kesken, jotta
// sisältö ei pääse eroamaan kieliversioiden välillä.
//
// Sisältö kuvaa mitä sovellus OIKEASTI tekee — ei yleistä mallipohjaa:
// evästeetön kävijälaskenta, Google Ads vasta suostumuksella, suosikit vain
// selaimen muistissa, uutiskirjeen sähköposti, tapahtumadata julkisista
// lähteistä. Jos jokin näistä muuttuu, tämä sivu on päivitettävä samalla.

import { useSyncExternalStore } from 'react'
import { useLanguage } from '@/contexts/LanguageContext'
import { subscribeConsent, readConsent, readConsentServer, setConsent } from '@/lib/consent'

// Rekisterinpitäjän yhteystieto. TYHJÄ = osiota ei näytetä lainkaan.
// Omistajan on täydennettävä tämä ennen mainoskampanjan alkua: seloste ilman
// yhteystietoa on vaillinainen. Jätetty tyhjäksi tarkoituksella, koska
// yhteystiedon julkaiseminen on omistajan päätös eikä minun.
const YHTEYSTIETO = ''

const PAIVITETTY = '26.8.2026'

export default function PrivacyView() {
  const { t, lang } = useLanguage()
  const choice = useSyncExternalStore(subscribeConsent, readConsent, readConsentServer)

  const SECTIONS: { h: string; p: string }[] = [
    { h: 'priv.h_analytics', p: 'priv.analytics' },
    { h: 'priv.h_ads',       p: 'priv.ads' },
    { h: 'priv.h_local',     p: 'priv.local' },
    { h: 'priv.h_email',     p: 'priv.email' },
    { h: 'priv.h_events',    p: 'priv.events' },
  ] as const as { h: string; p: string }[]

  const tilaTeksti =
    choice === 'granted' ? t('priv.granted') : choice === 'denied' ? t('priv.denied') : t('priv.unset')

  return (
    <main className="min-h-screen text-white" style={{ background: '#0a0a0c' }}>
      <div className="max-w-2xl mx-auto px-5 pt-14 pb-20">
        <h1 className="text-3xl font-black mb-2" style={{ letterSpacing: '-0.02em' }}>{t('priv.title')}</h1>
        <p className="text-white/25 text-[11px] uppercase tracking-wider mb-6">{t('priv.updated')} {PAIVITETTY}</p>
        <p className="text-white/50 text-[14px] leading-relaxed mb-10">{t('priv.intro')}</p>

        {SECTIONS.map((s) => (
          <section key={s.h} className="mb-8">
            <h2 className="text-[15px] font-black tracking-[.06em] uppercase text-white/70 mb-2">
              {t(s.h as Parameters<typeof t>[0])}
            </h2>
            <p className="text-white/45 text-[13.5px] leading-relaxed">
              {t(s.p as Parameters<typeof t>[0])}
            </p>
          </section>
        ))}

        {/* Suostumuksen peruuttaminen. Tämä ei ole koriste: valinnan on oltava
            yhtä helppo perua kuin antaa, eikä banneri palaa näkyviin itsestään
            valinnan jälkeen. */}
        <section className="mt-10 pt-6 rounded-2xl p-5" style={{ background: 'rgba(255,255,255,.04)' }}>
          <h2 className="text-[15px] font-black tracking-[.06em] uppercase text-white/70 mb-2">{t('priv.h_choice')}</h2>
          <p className="text-white/45 text-[13.5px] mb-4">
            {t('priv.current')}: <span className="text-white/80 font-bold">{tilaTeksti}</span>
          </p>
          <div className="flex flex-wrap gap-2">
            <button
              onClick={() => setConsent('granted')}
              disabled={choice === 'granted'}
              className="px-4 py-2.5 rounded-xl font-black text-[13px] text-white transition-transform active:scale-[.98] disabled:opacity-35"
              style={{ background: 'linear-gradient(150deg,#6b76ff,#5059e6)' }}
            >
              {t('consent.accept')}
            </button>
            <button
              onClick={() => setConsent('denied')}
              disabled={choice === 'denied'}
              className="px-4 py-2.5 rounded-xl font-bold text-[13px] transition-colors hover:bg-white/10 disabled:opacity-35"
              style={{ background: 'rgba(255,255,255,.06)', color: 'rgba(255,255,255,.75)' }}
            >
              {t('consent.reject')}
            </button>
          </div>
        </section>

        {YHTEYSTIETO && (
          <p className="mt-8 text-[12px] text-white/30 leading-relaxed">{YHTEYSTIETO}</p>
        )}

        <a href={lang === 'en' ? '/en' : '/'}
          className="inline-block mt-10 text-[13px] text-white/35 hover:text-white/70 transition-colors">
          ← {lang === 'en' ? 'Back to the app' : 'Takaisin sovellukseen'}
        </a>
      </div>
    </main>
  )
}

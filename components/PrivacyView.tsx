'use client'

// Tietosuojaseloste. Jaettu suomen- ja englanninkielisen reitin kesken, jotta
// sisältö ei pääse eroamaan kieliversioiden välillä.
//
// Sisältö kuvaa mitä sovellus OIKEASTI tekee — ei yleistä mallipohjaa:
// evästeetön kävijälaskenta, Google Ads vasta suostumuksella, suosikit vain
// selaimen muistissa, uutiskirjeen sähköposti, tapahtumadata julkisista
// lähteistä. Jos jokin näistä muuttuu, tämä sivu on päivitettävä samalla.

import { useEffect, useRef, useState, useSyncExternalStore, type FormEvent } from 'react'
import { useLanguage } from '@/contexts/LanguageContext'
import { subscribeConsent, readConsent, readConsentServer, setConsent } from '@/lib/consent'

// Rekisterinpitäjän NIMI. Osoitetta ei tarvita tähän: yhteydenotto hoituu
// sivun lomakkeella, joka lähettää viestin palvelimen kautta (osoite on
// ympäristömuuttujassa, ei koskaan selaimessa eikä tässä julkisessa repossa).
// Nimi on silti kerrottava — tietosuojaseloste kertoo KUKA tietoja käsittelee,
// ja lomake vastaa vain kysymykseen MITEN häneen saa yhteyden.
// TYHJÄ = riviä ei näytetä. Omistajan täytettävä ennen kampanjan alkua.
const REKISTERINPITAJA = ''

const PAIVITETTY = '26.8.2026'

export default function PrivacyView() {
  const { t, lang } = useLanguage()
  const choice = useSyncExternalStore(subscribeConsent, readConsent, readConsentServer)

  const [email, setEmail] = useState('')
  const [viesti, setViesti] = useState('')
  const [hunaja, setHunaja] = useState('')
  const [status, setStatus] = useState<'idle' | 'sending' | 'ok'>('idle')
  const [virhe, setVirhe] = useState('')
  // Avaushetki robottisuodatusta varten. Refiin eikä tilaan, koska tämä ei
  // vaikuta renderöintiin; luetaan vasta lähetyksessä.
  const avattuRef = useRef(0)
  // Kirjoitetaan vasta liitoksen jälkeen: palvelimella ei ole avaushetkeä, ja
  // renderissä laskettu aikaleima rikkoisi hydraation. Pelkkä refin kirjoitus,
  // ei tilamuutosta, joten ylimääräistä renderöintiä ei synny.
  useEffect(() => { avattuRef.current = Date.now() }, [])

  async function laheta(e: FormEvent) {
    e.preventDefault()
    if (!email.trim() || viesti.trim().length < 5) { setVirhe(t('priv.c_need')); return }
    setVirhe(''); setStatus('sending')
    try {
      const r = await fetch('/api/tietosuoja-yhteys', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, viesti, hunaja, avattu: avattuRef.current }),
      })
      if (!r.ok) throw new Error()
      setStatus('ok')
    } catch {
      setStatus('idle'); setVirhe(t('priv.c_err'))
    }
  }

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

        {/* Yhteydenotto lomakkeella. Sähköpostiosoitetta ei näytetä sivulla
            eikä se ole selaimeen lähtevässä koodissa — palvelin ratkaisee
            vastaanottajan ympäristömuuttujasta. */}
        <section className="mt-8">
          <h2 className="text-[15px] font-black tracking-[.06em] uppercase text-white/70 mb-2">{t('priv.h_contact')}</h2>
          <p className="text-white/45 text-[13.5px] leading-relaxed mb-4">{t('priv.contact_intro')}</p>

          {status === 'ok' ? (
            <p className="text-[13.5px] rounded-xl p-4" style={{ background: 'rgba(16,185,129,.10)', color: '#6ee7b7' }}>
              {t('priv.c_ok')}
            </p>
          ) : (
            <form onSubmit={laheta} className="space-y-2.5">
              <input
                type="email" value={email} onChange={(e) => setEmail(e.target.value)}
                placeholder={t('priv.c_email')} autoComplete="email" required maxLength={200}
                className="w-full px-4 py-3 rounded-xl text-[14px] text-white placeholder-white/25 outline-none focus:ring-2 focus:ring-[#6b76ff]/50"
                style={{ background: 'rgba(255,255,255,.05)', border: '1px solid rgba(255,255,255,.08)' }}
              />
              <textarea
                value={viesti} onChange={(e) => setViesti(e.target.value)}
                placeholder={t('priv.c_msg')} required rows={4} maxLength={4000}
                className="w-full px-4 py-3 rounded-xl text-[14px] text-white placeholder-white/25 outline-none focus:ring-2 focus:ring-[#6b76ff]/50 resize-y"
                style={{ background: 'rgba(255,255,255,.05)', border: '1px solid rgba(255,255,255,.08)' }}
              />
              {/* Hunajapurkki: ihminen ei näe tätä eikä täytä sitä. Robotit
                  täyttävät kaikki kentät. aria-hidden + tabIndex pitävät sen
                  myös ruudunlukijan ja sarkaimen ulottumattomissa. */}
              <input
                type="text" name="hunaja" value={hunaja} onChange={(e) => setHunaja(e.target.value)}
                tabIndex={-1} autoComplete="off" aria-hidden="true"
                style={{ position: 'absolute', left: '-9999px', width: 1, height: 1 }}
              />
              {virhe && <p className="text-[12.5px]" style={{ color: '#fca5a5' }}>{virhe}</p>}
              <button
                type="submit" disabled={status === 'sending'}
                className="px-5 py-2.5 rounded-xl font-black text-[13px] text-white transition-transform active:scale-[.98] disabled:opacity-50"
                style={{ background: 'linear-gradient(150deg,#6b76ff,#5059e6)' }}
              >
                {status === 'sending' ? t('priv.c_sending') : t('priv.c_send')}
              </button>
              <p className="text-[11.5px] text-white/25 leading-relaxed pt-1">{t('priv.c_reply')}</p>
            </form>
          )}

          {REKISTERINPITAJA && (
            <p className="mt-6 text-[12px] text-white/30 leading-relaxed">{REKISTERINPITAJA}</p>
          )}
        </section>

        <a href={lang === 'en' ? '/en' : '/'}
          className="inline-block mt-10 text-[13px] text-white/35 hover:text-white/70 transition-colors">
          ← {lang === 'en' ? 'Back to the app' : 'Takaisin sovellukseen'}
        </a>
      </div>
    </main>
  )
}

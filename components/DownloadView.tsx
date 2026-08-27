'use client'

// "Lataa sovellus" -sivu. Omistaja 26.8.2026: sivulle tarvitaan kohta josta
// sovelluksen voi ladata puhelimeen ja tietokoneelle.
//
// TÄRKEÄ TAUSTA: tämä on PWA, ei sovelluskaupan sovellus. Sitä ei "ladata"
// vaan asennetaan suoraan selaimesta. Sivun tehtävä on tehdä se ymmärrettäväksi
// ja helpoksi — siksi ohjeet ovat laitekohtaiset ja käyttäjän oma laite avataan
// ensin. Sovelluskauppaversio on tulossa myöhemmin; se sanotaan tässä ääneen,
// jottei kävijä jää etsimään sitä.
//
// Asennuspainike voi näkyä vain siellä missä selain sen sallii (Chrome, Edge).
// iOS:ssä asennus tehdään AINA jakovalikosta, eikä sitä voi laukaista koodista
// — siksi ohjeet ovat olemassa, eivät vain painike.

import { useState, useSyncExternalStore } from 'react'
import { useLanguage } from '@/contexts/LanguageContext'
import { Logo } from '@/components/Logo'
import { track } from '@/lib/track'
import {
  subscribeInstall, getInstallPrompt, getInstallPromptServer,
  isInstalled, detectPlatform, type Platform,
} from '@/lib/install'

const alwaysFalse = () => false

export default function DownloadView() {
  const { t, lang } = useLanguage()
  const prompt = useSyncExternalStore(subscribeInstall, getInstallPrompt, getInstallPromptServer)
  const asennettu = useSyncExternalStore(subscribeInstall, isInstalled, alwaysFalse)
  // Palvelin ei tunne laitetta; luetaan vasta selaimessa jotta ensimmäinen
  // maalaus on sama molemmissa eikä hydraatiovirhettä synny.
  const selaimessa = useSyncExternalStore(subscribeInstall, () => true, alwaysFalse)
  const [avattu, setAvattu] = useState<Platform | null>(null)

  const laite: Platform = avattu ?? (selaimessa ? detectPlatform() : 'desktop')

  async function asenna() {
    if (!prompt) return
    await prompt.prompt()
    const { outcome } = await prompt.userChoice
    if (outcome === 'accepted') track('install', { surface: 'download_page' })
  }

  const OHJEET: { id: Platform; otsikko: string; askeleet: string[] }[] = [
    { id: 'ios',     otsikko: 'dl.ios',     askeleet: ['dl.ios_1', 'dl.ios_2', 'dl.ios_3'] },
    { id: 'android', otsikko: 'dl.android', askeleet: ['dl.android_1', 'dl.android_2'] },
    { id: 'desktop', otsikko: 'dl.desktop', askeleet: ['dl.desktop_1', 'dl.desktop_2'] },
  ]

  type K = Parameters<typeof t>[0]

  return (
    <main className="min-h-screen text-white" style={{ background: '#0a0a0c' }}>
      <div className="max-w-lg mx-auto px-5 pt-14 pb-20">

        {/* Kuvake sellaisenaan — sama tiedosto joka kotinäytölle tulee, jotta
            kävijä tunnistaa sen asennuksen jälkeen. */}
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/icon-192.png" alt="" width={72} height={72}
          className="w-[72px] h-[72px] rounded-[18px] mb-5"
          style={{ boxShadow: '0 16px 40px -12px rgba(91,101,230,.5)' }} />

        <h1 className="text-3xl font-black mb-3" style={{ letterSpacing: '-0.02em' }}>{t('dl.title')}</h1>
        <p className="text-white/50 text-[14.5px] leading-relaxed mb-7">{t('dl.sub')}</p>

        {asennettu ? (
          <p className="text-[13.5px] rounded-xl p-4 mb-8"
            style={{ background: 'rgba(16,185,129,.10)', color: '#6ee7b7' }}>
            {t('dl.installed')}
          </p>
        ) : prompt ? (
          <button onClick={asenna}
            className="w-full px-5 py-3.5 rounded-2xl font-black text-[15px] text-white transition-transform active:scale-[.99] mb-8"
            style={{ background: 'linear-gradient(150deg,#6b76ff,#5059e6)', boxShadow: '0 14px 34px -10px rgba(91,101,230,.55)' }}>
            {t('dl.install_now')}
          </button>
        ) : null}

        {/* Laitevalinta. Oma laite on valmiiksi auki, mutta muutkin ovat
            saatavilla — moni katsoo ohjeen koneelta ja asentaa puhelimeen. */}
        <p className="text-xs text-white/30 uppercase tracking-wider mb-2.5">{t('dl.pick')}</p>
        <div className="flex flex-wrap gap-2 mb-5">
          {OHJEET.map((o) => (
            <button key={o.id} onClick={() => setAvattu(o.id)}
              className="text-sm px-3.5 py-2 rounded-full font-bold transition-colors"
              style={laite === o.id
                ? { background: 'linear-gradient(150deg,#6b76ff,#5059e6)', color: '#fff' }
                : { background: 'rgba(255,255,255,.06)', color: 'rgba(255,255,255,.65)' }}>
              {t(o.otsikko as K)}
            </button>
          ))}
        </div>

        <ol className="space-y-3 mb-10">
          {OHJEET.find((o) => o.id === laite)!.askeleet.map((k, i) => (
            <li key={k} className="flex gap-3">
              <span className="shrink-0 w-6 h-6 rounded-full flex items-center justify-center text-[12px] font-black"
                style={{ background: 'rgba(107,118,255,.16)', color: '#a3abff' }}>{i + 1}</span>
              <span className="text-white/60 text-[14px] leading-relaxed pt-0.5">{t(k as K)}</span>
            </li>
          ))}
        </ol>

        <h2 className="text-[15px] font-black tracking-[.06em] uppercase text-white/70 mb-3">{t('dl.why')}</h2>
        <ul className="space-y-2.5 mb-9">
          {(['dl.why_1', 'dl.why_2', 'dl.why_3'] as K[]).map((k) => (
            <li key={k} className="flex gap-2.5 text-white/50 text-[13.5px] leading-relaxed">
              <span style={{ color: '#6b76ff' }}>·</span>
              <span>{t(k)}</span>
            </li>
          ))}
        </ul>

        <p className="text-[12px] text-white/28 leading-relaxed">{t('dl.store_note')}</p>

        <div className="mt-10 pt-6" style={{ borderTop: '1px solid rgba(255,255,255,.07)' }}>
          <a href={lang === 'en' ? '/en' : '/'} className="inline-flex items-center gap-2 hover:opacity-80 transition-opacity">
            <Logo size={14} />
          </a>
        </div>
      </div>
    </main>
  )
}

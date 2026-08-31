'use client'

// Kelluva asennuskehote. Asennuslogiikka tulee lib/install.ts:stä.
//
// KOLME MUOTOA LAITTEEN MUKAAN (omistaja 1.9.2026: kaveri ei nähnyt
// asennuskehotetta lainkaan — hän avasi jaetun linkin, jolloin selain oli
// todennäköisesti WhatsAppin sisäinen tai iPhonen Safari, eikä kumpikaan
// laukaise beforeinstallprompt-tapahtumaa jota vanha banneri vaati):
//
//   1. prompt saatavilla (Android/työpöytä-Chrome) → suora Asenna-nappi
//   2. iOS Safari → ohje: Jaa → Lisää Kotivalikkoon (muuta tapaa iOS:llä
//      EI OLE — Apple ei tarjoa asennus-APIa millekään sivustolle)
//   3. sovelluksen sisäinen selain (WhatsApp, Instagram…) → kehote avata
//      sivu oikeassa selaimessa, koska asennus ei ole siellä mahdollista
//
// Työpöydällä ilman promptia (Safari/Firefox) banneria EI näytetä — siellä
// riittää yläpalkin pysyvä latausnappi, eikä työpöytäkäyttäjää kannata
// häiritä kelluvalla kehotteella jota ei voi täyttää yhdellä napilla.
//
// MIKSI JAETTU LÄHDE. Selain laukaisee beforeinstallprompt-tapahtuman VAIN
// KERRAN sivulatausta kohden. lib/install.ts ottaa tapahtuman talteen heti
// moduulin latautuessa, ja banneri ja latausivu lukevat samaa arvoa.

import { useEffect, useState, useSyncExternalStore } from 'react'
import Link from 'next/link'
import { X, Download, Share, ExternalLink } from 'lucide-react'
import { useLanguage } from '@/contexts/LanguageContext'
import {
  subscribeInstall, getInstallPrompt, getInstallPromptServer, isInstalled,
  detectPlatform, isInAppBrowser, isBannerDismissed, dismissBanner,
} from '@/lib/install'
import { track } from '@/lib/track'

const alwaysFalse = () => false

export default function InstallBanner() {
  const { t, lang } = useLanguage()
  const prompt = useSyncExternalStore(subscribeInstall, getInstallPrompt, getInstallPromptServer)
  const installed = useSyncExternalStore(subscribeInstall, isInstalled, alwaysFalse)
  const [dismissed, setDismissed] = useState(false)
  // Laitetieto vasta mountissa: palvelin ei tunne selainta, ja eri sisältö
  // palvelimen ja selaimen ensimmäisessä maalauksessa rikkoisi hydraation.
  const [laite, setLaite] = useState<'native' | 'ios' | 'inapp' | null>(null)

  useEffect(() => {
    // Hiljennetty banneri: laite jää nulliin eikä mitään renderöidä — yksi
    // setState riittää, erillistä dismissed-asetusta ei tarvita tässä.
    if (isBannerDismissed()) return
    // eslint-disable-next-line react-hooks/set-state-in-effect -- laitetunnistus mountissa (hydraatio)
    setLaite(isInAppBrowser() ? 'inapp' : detectPlatform() === 'ios' ? 'ios' : 'native')
  }, [])

  // native-muoto vaatii promptin; ios/inapp eivät (niissä ei promptia tule)
  const muoto = laite === 'native' ? (prompt ? 'native' : null) : laite
  if (!muoto || dismissed || installed) return null

  async function handleInstall() {
    if (!prompt) return
    await prompt.prompt()
    const { outcome } = await prompt.userChoice
    if (outcome === 'accepted') track('install', { surface: 'banner' })
    setDismissed(true)
  }

  function handleDismiss() {
    setDismissed(true)
    dismissBanner()
  }

  const lataaHref = lang === 'en' ? '/en/download' : '/lataa'

  return (
    <div className="fixed bottom-24 md:bottom-6 left-4 right-4 md:left-auto md:right-6 md:w-80 z-40 bg-[#131a2e] border border-[#6b76ff]/40 rounded-2xl p-4 shadow-2xl shadow-black/60 animate-slide-up">
      <div className="flex items-start gap-3">
        {/* Oikea sovelluskuvake eikä kirjain: banneri kehottaa asentamaan
            sovelluksen, joten sen on näytettävä se kuvake joka kotinäytölle
            oikeasti tulee. */}
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/icon-192.png" alt="" width={40} height={40} className="w-10 h-10 rounded-xl shrink-0" />
        <div className="flex-1 min-w-0">
          <p className="text-white font-semibold text-sm">{t('install.title')}</p>

          {muoto === 'native' && (
            <>
              <p className="text-white/50 text-xs mt-0.5">{t('install.desc')}</p>
              <button
                onClick={handleInstall}
                className="mt-3 flex items-center gap-1.5 bg-[#6b76ff] hover:bg-[#5059e6] text-white text-xs font-bold px-4 py-2 rounded-lg transition-colors"
              >
                <Download size={12} />
                {t('install.button')}
              </button>
            </>
          )}

          {muoto === 'ios' && (
            <>
              <p className="text-white/50 text-xs mt-0.5 leading-relaxed">
                <Share size={11} className="inline -mt-0.5 mr-1 text-[#a3abff]" />
                {t('install.ios_hint')}
              </p>
              <Link href={lataaHref} onClick={handleDismiss}
                className="mt-2.5 inline-flex items-center gap-1.5 text-[#a3abff] hover:text-white text-xs font-bold transition-colors">
                {t('install.guide')} →
              </Link>
            </>
          )}

          {muoto === 'inapp' && (
            <>
              <p className="text-white/50 text-xs mt-0.5 leading-relaxed">
                <ExternalLink size={11} className="inline -mt-0.5 mr-1 text-[#a3abff]" />
                {t('install.inapp_hint')}
              </p>
              <Link href={lataaHref} onClick={handleDismiss}
                className="mt-2.5 inline-flex items-center gap-1.5 text-[#a3abff] hover:text-white text-xs font-bold transition-colors">
                {t('install.guide')} →
              </Link>
            </>
          )}
        </div>
        <button onClick={handleDismiss} aria-label={t('common.close')}
          className="text-white/30 hover:text-white/60 transition-colors shrink-0 mt-0.5">
          <X size={16} />
        </button>
      </div>
    </div>
  )
}

'use client'

// Kelluva asennuskehote. Asennuslogiikka tulee lib/install.ts:stä.
//
// MIKSI JAETTU LÄHDE. Selain laukaisee beforeinstallprompt-tapahtuman VAIN
// KERRAN sivulatausta kohden. Aiemmin tämä komponentti kuunteli sitä itse
// useEffectissä — eli vasta liitoksen jälkeen — ja latausivu olisi kuunnellut
// erikseen. Kumpi tahansa olisi voinut jäädä ilman tapahtumaa ja sen painike
// kuolleeksi. lib/install.ts ottaa tapahtuman talteen heti moduulin
// latautuessa, ja molemmat lukevat samaa arvoa.

import { useState, useSyncExternalStore } from 'react'
import { X, Download } from 'lucide-react'
import { useLanguage } from '@/contexts/LanguageContext'
import { subscribeInstall, getInstallPrompt, getInstallPromptServer, isInstalled } from '@/lib/install'

const alwaysFalse = () => false

export default function InstallBanner() {
  const { t } = useLanguage()
  const prompt = useSyncExternalStore(subscribeInstall, getInstallPrompt, getInstallPromptServer)
  const installed = useSyncExternalStore(subscribeInstall, isInstalled, alwaysFalse)
  const [dismissed, setDismissed] = useState(false)

  // Istunnon aikainen sulkeminen luetaan vasta klikkauksessa ja mountissa
  // renderin ulkopuolella: sessionStorage voi heittää privaattitilassa.
  const piilotettu = dismissed || (() => {
    try { return sessionStorage.getItem('install-dismissed') === '1' } catch { return false }
  })()

  if (!prompt || piilotettu || installed) return null

  async function handleInstall() {
    if (!prompt) return
    await prompt.prompt()
    await prompt.userChoice
    setDismissed(true)
  }

  function handleDismiss() {
    setDismissed(true)
    try { sessionStorage.setItem('install-dismissed', '1') } catch { /* privaattitila */ }
  }

  return (
    <div className="fixed bottom-24 md:bottom-6 left-4 right-4 md:left-auto md:right-6 md:w-80 z-40 bg-[#131a2e] border border-[#6b76ff]/40 rounded-2xl p-4 shadow-2xl shadow-black/60 animate-slide-up">
      <div className="flex items-start gap-3">
        {/* Oikea sovelluskuvake eikä kirjain: banneri kehottaa asentamaan
            sovelluksen, joten sen on näytettävä se kuvake joka kotinäytölle
            oikeasti tulee. Aiemmin tässä oli vanha sininen H-laatta.
            Käyttää /icon-192.png:tä: VERSIO 3 -paketissa ei ole 96 px kokoa,
            eikä sitä saa generoida itse ("älä generoi kuvakkeita uudelleen"). */}
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/icon-192.png" alt="" width={40} height={40} className="w-10 h-10 rounded-xl shrink-0" />
        <div className="flex-1 min-w-0">
          <p className="text-white font-semibold text-sm">{t('install.title')}</p>
          <p className="text-white/50 text-xs mt-0.5">{t('install.desc')}</p>
          <button
            onClick={handleInstall}
            className="mt-3 flex items-center gap-1.5 bg-[#6b76ff] hover:bg-[#5059e6] text-white text-xs font-bold px-4 py-2 rounded-lg transition-colors"
          >
            <Download size={12} />
            {t('install.button')}
          </button>
        </div>
        <button onClick={handleDismiss} className="text-white/30 hover:text-white/60 transition-colors shrink-0 mt-0.5">
          <X size={16} />
        </button>
      </div>
    </div>
  )
}

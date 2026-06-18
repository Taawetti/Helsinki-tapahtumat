'use client'

import { useEffect, useState } from 'react'
import { X, Download } from 'lucide-react'
import { useLanguage } from '@/contexts/LanguageContext'

interface BeforeInstallPromptEvent extends Event {
  prompt(): Promise<void>
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>
}

export default function InstallBanner() {
  const [prompt, setPrompt] = useState<BeforeInstallPromptEvent | null>(null)
  const [dismissed, setDismissed] = useState(false)
  const [installed, setInstalled] = useState(false)
  const { t } = useLanguage()

  useEffect(() => {
    // Check if already installed
    if (window.matchMedia('(display-mode: standalone)').matches) {
      setInstalled(true)
      return
    }
    if (sessionStorage.getItem('install-dismissed')) {
      setDismissed(true)
      return
    }

    const handler = (e: Event) => {
      e.preventDefault()
      setPrompt(e as BeforeInstallPromptEvent)
    }
    window.addEventListener('beforeinstallprompt', handler)
    return () => window.removeEventListener('beforeinstallprompt', handler)
  }, [])

  if (!prompt || dismissed || installed) return null

  async function handleInstall() {
    if (!prompt) return
    await prompt.prompt()
    const { outcome } = await prompt.userChoice
    if (outcome === 'accepted') setInstalled(true)
    setDismissed(true)
  }

  function handleDismiss() {
    setDismissed(true)
    sessionStorage.setItem('install-dismissed', '1')
  }

  return (
    <div className="fixed bottom-24 md:bottom-6 left-4 right-4 md:left-auto md:right-6 md:w-80 z-40 bg-[#131a2e] border border-[#0072C6]/40 rounded-2xl p-4 shadow-2xl shadow-black/60 animate-slide-up">
      <div className="flex items-start gap-3">
        <div className="w-10 h-10 bg-[#0072C6] rounded-xl flex items-center justify-center text-white font-bold shrink-0">H</div>
        <div className="flex-1 min-w-0">
          <p className="text-white font-semibold text-sm">{t('install.title')}</p>
          <p className="text-white/50 text-xs mt-0.5">{t('install.desc')}</p>
          <button
            onClick={handleInstall}
            className="mt-3 flex items-center gap-1.5 bg-[#0072C6] hover:bg-[#0060a8] text-white text-xs font-bold px-4 py-2 rounded-lg transition-colors"
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

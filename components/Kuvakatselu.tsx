'use client'

// Kuvakatselu: kuva koko ruudun kokoisena. Syntyi kärkinoston julisteesta
// (omistaja 3.11.2026): 104 px leveässä pikkukuvassa esiintyjien nimet ja
// kasvot eivät erottuneet, ja koko leveyden kortti olisi puhelimessa yli
// 500 px korkea. Napautus avaa julisteen tähän kevyeen päällyskerrokseen:
// tumma tausta, kuva mahtuu ruutuun (object-contain), napautus mihin tahansa,
// ✕ tai Escape sulkee. Paluuele kuorii kerroksen (useTaaksepain) ja fokus
// palaa avanneeseen nappiin (useDialogiFokus) kuten muissa paneeleissa.

import { useEffect, useRef } from 'react'
import { X } from 'lucide-react'
import { useLanguage } from '@/contexts/LanguageContext'
import { useDialogiFokus } from '@/hooks/useDialogiFokus'
import { useTaaksepain } from '@/hooks/useTaaksepain'

export default function Kuvakatselu({ src, alt, open, onClose }: {
  src: string | null
  /** Kuvan selite ruudunlukijalle — tapahtuman nimi riittää. */
  alt: string
  open: boolean
  onClose: () => void
}) {
  const { t } = useLanguage()
  const ref = useRef<HTMLDivElement>(null)
  useDialogiFokus(open, ref, onClose)
  useTaaksepain(open, onClose)

  useEffect(() => {
    if (!open) return
    const edellinen = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => { document.body.style.overflow = edellinen }
  }, [open])

  if (!open || !src) return null
  return (
    <div
      ref={ref}
      role="dialog"
      aria-modal
      aria-label={alt}
      tabIndex={-1}
      onClick={onClose}
      className="fixed inset-0 z-[80] flex items-center justify-center animate-mtfade"
      style={{
        background: 'rgba(0,0,0,.92)',
        backdropFilter: 'blur(8px)',
        WebkitBackdropFilter: 'blur(8px)',
        padding: 'calc(16px + env(safe-area-inset-top, 0px)) 16px calc(16px + env(safe-area-inset-bottom, 0px))',
      }}
    >
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={src} alt={alt} className="max-w-full max-h-full object-contain rounded-xl animate-mtpop" style={{ boxShadow: '0 24px 60px -20px rgba(0,0,0,.9)' }} />
      <button
        type="button"
        onClick={onClose}
        aria-label={t('common.close')}
        className="absolute right-4 w-11 h-11 rounded-full flex items-center justify-center text-white transition-colors hover:bg-white/25"
        style={{ top: 'calc(16px + env(safe-area-inset-top, 0px))', background: 'rgba(255,255,255,.14)', backdropFilter: 'blur(6px)' }}
      >
        <X size={20} />
      </button>
    </div>
  )
}

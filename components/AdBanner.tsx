'use client'

import { useEffect } from 'react'

interface Props {
  slot: string
  format?: 'auto' | 'rectangle' | 'horizontal'
  className?: string
}

// Google AdSense -mainos. Näkyy vain kun NEXT_PUBLIC_ADSENSE_ID on asetettu.
// Rekisteröidy: https://adsense.google.com
export default function AdBanner({ slot, format = 'auto', className = '' }: Props) {
  const publisherId = process.env.NEXT_PUBLIC_ADSENSE_ID
  if (!publisherId) return null

  // eslint-disable-next-line react-hooks/rules-of-hooks
  useEffect(() => {
    try {
      // @ts-ignore
      ;(window.adsbygoogle = window.adsbygoogle || []).push({})
    } catch {}
  }, [])

  return (
    <div className={`overflow-hidden rounded-xl ${className}`}>
      <p className="text-[9px] text-white/15 text-center mb-1 font-bold tracking-widest uppercase">Mainos</p>
      <ins
        className="adsbygoogle"
        style={{ display: 'block' }}
        data-ad-client={publisherId}
        data-ad-slot={slot}
        data-ad-format={format}
        data-full-width-responsive="true"
      />
    </div>
  )
}

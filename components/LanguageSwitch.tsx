'use client'

// Kielivalitsin. Palautettu 25.8.2026 — edellinen poistettiin vahingossa
// commitissa ef4ef91 (15.7.2026), minkä jälkeen 394 valmista englanninkielistä
// käännöstä olivat saavuttamattomia.
//
// Tarkoituksella pieni ja tekstipohjainen: lippuemoji viestisi kansallisuutta
// eikä kieltä (englanti ei ole vain briteille), ja kaksikirjaiminen tunnus on
// se mitä käyttäjät osaavat etsiä.

import { useLanguage } from '@/contexts/LanguageContext'

export default function LanguageSwitch({ compact = false }: { compact?: boolean }) {
  const { lang, setLang } = useLanguage()
  const next = lang === 'fi' ? 'en' : 'fi'
  return (
    <button
      onClick={() => setLang(next)}
      aria-label={lang === 'fi' ? 'Switch to English' : 'Vaihda suomeksi'}
      title={lang === 'fi' ? 'In English' : 'Suomeksi'}
      className={`shrink-0 rounded-xl border transition-all font-black text-white/45 hover:text-white/80 border-white/8 bg-white/4 hover:bg-white/8 ${
        compact ? 'px-2 py-2 text-[11px]' : 'px-2.5 py-2 text-[11.5px]'
      }`}
    >
      {lang === 'fi' ? 'EN' : 'FI'}
    </button>
  )
}

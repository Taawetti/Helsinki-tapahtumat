'use client'

// Asennusohjeet alalevynä — ⋯-valikon "Lataa sovellus" -rivi (4.10.2026).
//
// MIKSI LEVY EIKÄ SIIRTYMÄ /lataa-SIVULLE. Rivi sulki ennen ⋯-levyn ja
// kutsui router.push('/lataa') samassa tikissä. Levyn sulku kulkee paluu-
// pinon (useTaaksepain) kautta ja tekee history.back():n; sen popstate ehti
// ennen reitittimen pushStatea ja Next palautti etusivun — käyttäjälle ei
// tapahtunut mitään (mitattu tuotannosta iPhone Safarilla, Android Chromella
// ja WhatsAppin sisäisellä selaimella, omistajan kaveri 4.10.2026). Levy
// toimii kuten jokainen muu ⋯-rivi: tilaa vaihtamalla, ilman reititystä.
//
// KOLME SISÄLTÖÄ kuten InstallBannerissa, valinta lib/install asennusMuoto:
//   native  — selain antoi beforeinstallprompt-tapahtuman → Asenna-nappi
//   ios     — Safarin Jaa → Lisää Koti-valikkoon (Apple ei tarjoa APIa)
//   android — ilman kehotetta: selaimen valikko → Asenna sovellus
//   inapp   — sovelluksen sisäinen selain (WhatsApp, Instagram…): asennus
//             ei ole mahdollista; kehotus avata oikeassa selaimessa + Kopioi
//             linkki, koska sisäisestä selaimesta ei aina pääse jakamaan
//   desktop — Chrome/Edge-kuvake ja Safarin Lisää Dockiin (levy on mobiili-
//             valikossa, mutta sisältö on silti oikea jos sitä kutsutaan)
//
// Laitetieto luetaan vasta mountissa: palvelin ei tunne selainta, ja eri
// sisältö palvelimen ja selaimen ensimmäisessä maalauksessa rikkoisi
// hydraation (sama oppi kuin InstallBannerissa).
//
// "Asennusohjeet →" on TAVALLINEN linkki (koko sivun lataus), ei Next Link:
// SPA-siirtymä avoimen levyn alta purkaisi levyn unmountissa ja paluupino
// joutuisi käsittelemään vieraan historiamerkinnän. Täysi lataus on
// harvinaiselle ohjesivulle oikea ja yksinkertainen ratkaisu.

import { useEffect, useState, useSyncExternalStore } from 'react'
import { Download, Share, ExternalLink, Copy, Check } from 'lucide-react'
import BottomSheet from '@/components/BottomSheet'
import { useLanguage } from '@/contexts/LanguageContext'
import {
  subscribeInstall, getInstallPrompt, getInstallPromptServer,
  detectPlatform, isInAppBrowser, asennusMuoto, naytaAsennuskehote, type Platform,
} from '@/lib/install'

interface Props {
  open: boolean
  onClose: () => void
}

export default function InstallSheet({ open, onClose }: Props) {
  const { t, lang } = useLanguage()
  const prompt = useSyncExternalStore(subscribeInstall, getInstallPrompt, getInstallPromptServer)
  const [laite, setLaite] = useState<{ sisainen: boolean; alusta: Platform } | null>(null)
  const [kopioitu, setKopioitu] = useState(false)

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- laitetunnistus mountissa (hydraatio)
    setLaite({ sisainen: isInAppBrowser(), alusta: detectPlatform() })
  }, [])

  useEffect(() => {
    if (!kopioitu) return
    const timer = setTimeout(() => setKopioitu(false), 2000)
    return () => clearTimeout(timer)
  }, [kopioitu])

  const muoto = laite ? asennusMuoto(!!prompt, laite.sisainen, laite.alusta) : null
  const lataaHref = lang === 'en' ? '/en/download' : '/lataa'

  async function asenna() {
    const tulos = await naytaAsennuskehote('sheet')
    // Hyväksytty → sovellus asentuu, levy pois. Hylätty tai kehote jo
    // käytetty → kehote on tyhjennetty ja levy näyttää laitteen ohjeet.
    if (tulos === 'accepted') onClose()
  }

  async function kopioiLinkki() {
    try {
      await navigator.clipboard.writeText(`${location.origin}/`)
      setKopioitu(true)
    } catch { /* leikepöytä estetty — teksti jää näkyviin, käyttäjä voi kirjoittaa osoitteen */ }
  }

  const askeleet: string[] =
    muoto === 'ios' ? [t('dl.ios_1'), t('dl.ios_2'), t('dl.ios_3')]
    : muoto === 'android' ? [t('dl.android_1'), t('install.android_menu')]
    : muoto === 'desktop' ? [t('dl.desktop_1'), t('dl.desktop_2')]
    : []

  return (
    <BottomSheet
      open={open}
      onClose={onClose}
      title={t('install.title')}
      subtitle={t('install.sheet_sub')}
      footer={
        <a href={lataaHref}
          className="flex items-center justify-center gap-1.5 min-h-11 text-[14px] font-black"
          style={{ color: '#a3abff' }}>
          {t('install.guide')} →
        </a>
      }
    >
      <div className="px-5 pt-2 pb-5 flex flex-col gap-4">
        <div className="flex items-center gap-3.5">
          {/* Oikea sovelluskuvake: se joka kotinäytölle oikeasti tulee. */}
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/icon-192.png" alt="" width={56} height={56} className="w-14 h-14 rounded-2xl shrink-0" />
          <p className="text-[14px] leading-[1.5]" style={{ color: 'rgba(255,255,255,.6)' }}>{t('install.desc')}</p>
        </div>

        {muoto === 'native' && (
          <button type="button" onClick={asenna}
            className="flex items-center justify-center gap-2 w-full h-14 rounded-[16px] font-black text-white text-[16px] transition-all active:scale-[.99]"
            style={{ background: 'linear-gradient(150deg,#6b76ff,#5059e6)', boxShadow: '0 12px 32px -8px rgba(91,101,230,.55)' }}>
            <Download size={20} />
            {t('install.button')}
          </button>
        )}

        {muoto === 'inapp' && (
          <>
            <p className="text-[15px] leading-[1.5] font-semibold text-white flex items-start gap-2">
              <ExternalLink size={18} className="shrink-0 mt-0.5" style={{ color: '#a3abff' }} />
              <span>{t('install.inapp_hint')}</span>
            </p>
            <button type="button" onClick={kopioiLinkki} aria-live="polite"
              className="flex items-center justify-center gap-2 w-full h-14 rounded-[16px] font-black text-[16px] transition-all active:scale-[.99]"
              style={{ border: '1px solid rgba(107,118,255,.35)', background: 'rgba(107,118,255,.08)', color: '#c7caff' }}>
              {kopioitu ? <Check size={20} /> : <Copy size={20} />}
              {kopioitu ? t('install.link_copied') : t('install.copy_link')}
            </button>
          </>
        )}

        {askeleet.length > 0 && (
          <ol className="flex flex-col gap-3">
            {askeleet.map((teksti, i) => (
              <li key={i} className="flex items-start gap-3">
                <span className="shrink-0 w-7 h-7 rounded-full flex items-center justify-center text-[13px] font-black text-white"
                  style={{ background: '#6b76ff' }}>
                  {i + 1}
                </span>
                <span className="text-[15px] leading-[1.5] font-semibold text-white/90 pt-0.5">
                  {muoto === 'ios' && i === 1 && <Share size={15} className="inline -mt-0.5 mr-1.5" style={{ color: '#a3abff' }} />}
                  {teksti}
                </span>
              </li>
            ))}
          </ol>
        )}
      </div>
    </BottomSheet>
  )
}

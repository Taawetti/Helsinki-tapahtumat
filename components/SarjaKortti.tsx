'use client'

// Yksi kortti festivaalisarjalle, jonka näytökset ovat eri paikoissa.
//
// Helsinki Comedy Festival 2026 (omistaja 23.9.2026): 11 näytöstä samana
// päivänä 11 eri paikassa, kaikilla sama lippu.fi:n festivaalikuva ja
// yleiskuvaus → ruudukko oli seinä samaa korttia, ja Eini Tavastialla hukkui
// niiden alle. Näytöksiä EI piiloteta: napautus vie listaan jossa jokainen
// aukeaa omana korttinaan lippulinkkeineen. Avaus on OMA tila (HomeClient
// avattuSarja), EI hakusana: hakusana vaihtaisi 90 päivän pikahakuun, joka ei
// sisällä lippu.fi-lähdettä — HCF:n haku antoi 0 tulosta (mitattu 23.9.2026).
// Ryhmittelysääntö on lib/tapahtumaperhe ryhmitaSarjat.

import { useLanguage } from '@/contexts/LanguageContext'
import type { Sarjaryhma } from '@/lib/tapahtumaperhe'
import { formatTime } from '@/lib/utils'

interface Props {
  ryhma: Sarjaryhma
  onOpen: (ryhma: Sarjaryhma) => void
}

export default function SarjaKortti({ ryhma, onOpen }: Props) {
  const { t } = useLanguage()
  const rivit = [...ryhma.tapahtumat].sort((a, b) => new Date(a.startTime).getTime() - new Date(b.startTime).getTime())
  const kuva = rivit.find((e) => e.image)?.image ?? null
  const paikat = [...new Set(rivit.map((e) => e.location?.name?.split(/[,/]/)[0].trim()).filter(Boolean))] as string[]
  const alku = formatTime(rivit[0].startTime)
  const loppu = formatTime(rivit[rivit.length - 1].startTime)
  const aika = alku === loppu ? alku : `${alku}–${loppu}`
  const naytetyt = paikat.slice(0, 3)
  const lisaa = paikat.length - naytetyt.length

  return (
    <button
      type="button"
      onClick={() => onOpen(ryhma)}
      className="group text-left w-full rounded-2xl overflow-hidden border border-[#f59e0b]/30 bg-[#141416] hover:border-[#f59e0b]/60 transition-colors"
      aria-label={`${ryhma.nimi}: ${rivit.length} ${t('series.shows')}`}
    >
      <div className="relative aspect-[16/10] bg-[#1a1a24]">
        {kuva && (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={kuva} alt="" loading="lazy" className="absolute inset-0 w-full h-full object-cover" />
        )}
        <div className="absolute inset-0" style={{ background: 'linear-gradient(to top, rgba(10,10,12,.92) 0%, rgba(10,10,12,.15) 60%)' }} />
        <span className="absolute top-2.5 left-2.5 text-[9px] font-black px-2.5 py-1.5 rounded-full text-white tracking-[.1em] uppercase"
          style={{ background: 'rgba(245,158,11,.9)' }}>
          🎪 {rivit.length} {t('series.shows_today')}
        </span>
        <div className="absolute bottom-2.5 left-3 right-3">
          <h3 className="font-black text-white text-[15px] leading-tight line-clamp-2" style={{ letterSpacing: '-0.01em' }}>
            {ryhma.nimi}
          </h3>
        </div>
      </div>
      <div className="p-3 space-y-1.5">
        <p className="text-white/70 text-xs font-semibold">🕐 {aika}</p>
        <p className="text-white/45 text-xs leading-relaxed line-clamp-2">
          📍 {naytetyt.join(' · ')}{lisaa > 0 ? ` · ${t('series.venues_more').replace('{n}', String(lisaa))}` : ''}
        </p>
        <p className="text-[#fbbf24] text-xs font-bold pt-0.5 group-hover:underline">{t('series.open')}</p>
      </div>
    </button>
  )
}

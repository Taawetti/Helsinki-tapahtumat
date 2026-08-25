'use client'

// /saunat-sivun asiakasosa: "Avoinna nyt" -suodatin ja saunarivit.
// Aukiolotila lasketaan selaimessa (käyttäjän kello, ei palvelimen) —
// sama isOpenNow-logiikka kuin sovelluksen korteissa.

import { useMemo, useState } from 'react'
import { isOpenNow, getTodayHours } from '@/lib/opening-hours'
import { useLanguage } from '@/contexts/LanguageContext'
import type { TranslationKey } from '@/lib/i18n'

export interface SaunaRow {
  id: string
  name: string
  address: string | null
  lat: number | null
  lon: number | null
  image: string | null
  www: string | null
  phone: string | null
  openingHours: string | null
  charge: string | null
  priceLevel: string | null
  rating: number | null
  reviews: number | null
  /** "Uusi elokuussa" — OSM:n uusi karttamerkintä (kuukausitaso). Valmis
   *  suomenkielinen teksti /saunat-SEO-sivua varten; käyttöliittymä käyttää
   *  newMonthia, jotta merkki kääntyy. */
  newLabel: string | null
  /** Kuukausi 1-12, tai null jos sauna ei ole uusi. */
  newMonth: number | null
  news: { title: string; url: string; source: string } | null
}

function fmtReviews(n: number): string {
  return n >= 1000 ? `${(n / 1000).toFixed(1)}k` : String(n)
}

function SaunaCard({ s }: { s: SaunaRow }) {
  const { t } = useLanguage()
  const [imgOk, setImgOk] = useState(true)
  const open = s.openingHours ? isOpenNow(s.openingHours) : undefined
  const today = s.openingHours ? getTodayHours(s.openingHours) : null
  const www = s.www ? (/^https?:\/\//i.test(s.www) ? s.www : `https://${s.www}`) : null
  // OSM:n charge-tagissa on joskus pelkkä kyllä/ei-arvo — ei näytetä.
  const price = s.charge && !/^(no|yes)$/i.test(s.charge.trim()) ? s.charge : s.priceLevel

  return (
    <li className="rounded-xl p-3.5 flex gap-3"
      style={{ background: 'rgba(255,255,255,.04)', border: '1px solid rgba(255,255,255,.07)' }}>
      {s.image && imgOk ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={s.image} onError={() => setImgOk(false)} alt={s.name} loading="lazy"
          className="w-24 h-24 object-cover rounded-lg shrink-0" />
      ) : (
        <div className="w-24 h-24 rounded-lg shrink-0 flex items-center justify-center text-3xl"
          style={{ background: 'rgba(255,255,255,.05)' }}>
          🧖
        </div>
      )}
      <div className="min-w-0 flex-1 space-y-1">
        <div className="flex items-baseline justify-between gap-2 flex-wrap">
          <h3 className="font-bold text-white text-[15px] leading-snug">
            {www ? (
              <a href={www} target="_blank" rel="noopener" className="hover:text-blue-300 transition-colors">{s.name} ↗</a>
            ) : s.name}
          </h3>
          <span className="flex items-center gap-1.5 shrink-0">
            {s.newMonth && (
              <span className="text-[10px] font-black px-2 py-0.5 rounded-full bg-emerald-500/15 text-emerald-300">
                {`${t('uutta.new_in')} ${t(`uutta.month_${s.newMonth}` as TranslationKey)}`}
              </span>
            )}
            {open !== undefined && (
              <span className={`text-[11px] font-black ${open ? 'text-emerald-400' : 'text-red-400/60'}`}>
                {open ? `● ${t('common.open')}` : `○ ${t('common.closed')}`}
              </span>
            )}
          </span>
        </div>
        <p className="text-[12.5px] text-white/50">
          {typeof s.rating === 'number' && (
            <span className="font-bold" style={{ color: '#e8c06a' }}>★ {s.rating.toFixed(1)}{s.reviews ? ` (${fmtReviews(s.reviews)})` : ''}</span>
          )}
          {typeof s.rating === 'number' && (s.address || today) ? ' · ' : ''}
          {s.address ?? ''}
        </p>
        {today && (
          <p className={`text-[12px] ${open ? 'text-emerald-400/80' : 'text-white/40'}`}>{t('date.today')} {today}</p>
        )}
        {price && <p className="text-[12px] text-amber-300/70">🎟 {price}</p>}
        {s.news && (
          <a href={s.news.url} target="_blank" rel="noopener"
            className="block text-[12px] leading-snug text-white/70 hover:text-white transition-colors">
            📰 {s.news.title} <span className="text-white/35">· {s.news.source} ↗</span>
          </a>
        )}
        <p className="text-[11px] text-white/30 pt-0.5">
          {s.lat && s.lon && (
            <>
              <a href={`https://maps.google.com/maps?q=${s.lat},${s.lon}`} target="_blank" rel="noopener"
                className="hover:text-white/60 transition-colors">{t('guides.on_map')}</a>
              {' · '}
              <a href={`https://maps.google.com/maps?daddr=${s.lat},${s.lon}&travelmode=transit`} target="_blank" rel="noopener"
                className="hover:text-white/60 transition-colors">{t('guides.directions')}</a>
            </>
          )}
          {s.phone && <>{s.lat ? ' · ' : ''}<a href={`tel:${s.phone}`} className="hover:text-white/60 transition-colors">{s.phone}</a></>}
        </p>
      </div>
    </li>
  )
}

export default function SaunatView({ saunas }: { saunas: SaunaRow[] }) {
  const { t } = useLanguage()
  const [openOnly, setOpenOnly] = useState(false)

  const newSaunas = useMemo(() => saunas.filter((s) => s.newLabel), [saunas])
  const rest = useMemo(() => {
    let list = saunas.filter((s) => !s.newLabel)
    if (openOnly) list = list.filter((s) => s.openingHours && isOpenNow(s.openingHours) === true)
    return list
  }, [saunas, openOnly])

  return (
    <div className="space-y-7">
      <button onClick={() => setOpenOnly((v) => !v)}
        className="text-[13px] font-bold px-4 py-2 rounded-full transition-colors"
        style={openOnly
          ? { background: 'rgba(16,185,129,.2)', color: '#6ee7b7', border: '1px solid rgba(16,185,129,.4)' }
          : { background: 'rgba(255,255,255,.05)', color: 'rgba(255,255,255,.5)', border: '1px solid rgba(255,255,255,.08)' }}>
        {'● '}{t('idea.open_now')}
      </button>

      {/* Uudet saunat ensin — koko sivun paras sisältö paikalliselle */}
      {!openOnly && newSaunas.length > 0 && (
        <section>
          <h2 className="text-[15px] font-black tracking-[.08em] uppercase mb-3" style={{ color: '#6ee7b7' }}>
            {t('guides.saunas_new')} <span className="text-white/30 font-bold">· {newSaunas.length}</span>
          </h2>
          <ul className="space-y-2">
            {newSaunas.map((s) => <SaunaCard key={s.id} s={s} />)}
          </ul>
        </section>
      )}

      <section>
        <h2 className="text-[15px] font-black tracking-[.08em] uppercase text-white/70 mb-3">
          {t('guides.saunas_all')} <span className="text-white/30 font-bold">· {rest.length}</span>
        </h2>
        {rest.length > 0 ? (
          <ul className="space-y-2">
            {rest.map((s) => <SaunaCard key={s.id} s={s} />)}
          </ul>
        ) : (
          <p className="text-white/40 text-sm py-8 text-center">
            {t('guides.saunas_none_open')}
          </p>
        )}
      </section>
    </div>
  )
}

'use client'

// Omat suunnitelmat (omistaja 2.11.2026: "suunnitelman voi tallentaa
// itselleen talteen ja tehdä vaikka monta valmiiksi"). Kaksi osaa
// Suunnitelma-välilehdelle: PALKKI otsikon alla (montako tallessa, avaa
// listan, "+ Uusi") ja LISTASHEET (yhteinen BottomSheet, HANDOFF-mobiili §9),
// josta suunnitelma avataan, luodaan tai poistetaan. Tallennus ja järjestys
// ovat lib/suunnitelma (varasto-osio, jarjestaSuunnitelmat) — tämä
// komponentti vain piirtää.
//
// Rivi: päivämerkki (viikonpäivä + päivä) · nimi tai varanimi · "Auki" /
// "Mennyt" -merkki · meta "la 7.11. · 4 askelta" · roskakori 44 px.
// Menneet himmennetään mutta säilytetään: ne voi avata pohjaksi uudelle.

import { useMemo } from 'react'
import { ChevronDown, Plus, Trash2 } from 'lucide-react'
import BottomSheet from '@/components/BottomSheet'
import { useLanguage } from '@/contexts/LanguageContext'
import { helsinkiToday } from '@/lib/helsinki-time'
import { jarjestaSuunnitelmat, onMennytSuunnitelma, SUUNNITELMA_MAX, type TallennettuSuunnitelma } from '@/lib/suunnitelma'

const PAIVA_RE = /^\d{4}-\d{2}-\d{2}$/

/** "la 7.11." / "Sat 7 Nov" — suunnitelman päivä on YYYY-MM-DD ilman aikaa,
 *  joten se tulkitaan keskipäiväksi eikä aikavyöhyke siirrä päivää. */
export function suunnitelmanPaivaTeksti(paiva: string, lang: 'fi' | 'en'): string {
  if (!PAIVA_RE.test(paiva)) return ''
  const d = new Date(`${paiva}T12:00:00`)
  if (Number.isNaN(d.getTime())) return ''
  return lang === 'fi'
    ? new Intl.DateTimeFormat('fi-FI', { weekday: 'short', day: 'numeric', month: 'numeric' }).format(d)
    : new Intl.DateTimeFormat('en-GB', { weekday: 'short', day: 'numeric', month: 'short' }).format(d)
}

/** Listassa näkyvä nimi: oma otsikko, muuten "Suunnitelma la 7.11.", muuten
 *  "Nimetön suunnitelma". */
export function suunnitelmanNimi(s: Pick<TallennettuSuunnitelma, 'otsikko' | 'paiva'>, t: (k: 'nav.suunnitelma' | 'plan.untitled') => string, lang: 'fi' | 'en'): string {
  if (s.otsikko.trim()) return s.otsikko.trim()
  const paiva = suunnitelmanPaivaTeksti(s.paiva, lang)
  return paiva ? `${t('nav.suunnitelma')} ${paiva}` : t('plan.untitled')
}

export function OmatSuunnitelmatPalkki({ maara, onAvaa, onUusi, uusiEstetty = false }: {
  maara: number
  onAvaa: () => void
  /** Puuttuva = "+ Uusi" ei näy (aktiivinen suunnitelma on jo tyhjä). */
  onUusi?: () => void
  /** Lista täynnä: nappi näkyy himmeänä, sheet kertoo syyn. */
  uusiEstetty?: boolean
}) {
  const { t } = useLanguage()
  return (
    <div className="flex items-center gap-2 flex-wrap">
      <button type="button" onClick={onAvaa}
        className="flex items-center gap-1.5 h-10 pl-3 pr-2.5 rounded-full text-[13px] font-black text-white/85 transition-all active:scale-95"
        style={{ background: 'rgba(255,255,255,.06)', border: '1px solid rgba(255,255,255,.13)' }}>
        <span aria-hidden>🗂</span>
        <span>{t('plan.list_title')}</span>
        <span className="text-white/45">· {maara}</span>
        <ChevronDown size={14} className="text-white/45" />
      </button>
      {onUusi && (
        <button type="button" onClick={onUusi} disabled={uusiEstetty}
          className="flex items-center gap-1 h-10 pl-2.5 pr-3.5 rounded-full text-[13px] font-black transition-all active:scale-95 disabled:opacity-40"
          style={{ border: '1px solid rgba(107,118,255,.45)', background: 'rgba(107,118,255,.08)', color: '#a3abff' }}>
          <Plus size={15} /> {t('plan.new_short')}
        </button>
      )}
    </div>
  )
}

function Merkki({ teksti, himmea = false }: { teksti: string; himmea?: boolean }) {
  return (
    <span className="shrink-0 text-[10px] font-black uppercase px-1.5 py-0.5 rounded-full"
      style={himmea
        ? { background: 'rgba(255,255,255,.08)', color: 'rgba(255,255,255,.55)', letterSpacing: '.06em' }
        : { background: 'rgba(107,118,255,.18)', color: '#c7caff', letterSpacing: '.06em' }}>
      {teksti}
    </span>
  )
}

/** Päivämerkki: viikonpäivä + päivänumero; päivättömälle kalenterikuvake. */
function PaivaMerkki({ paiva, lang }: { paiva: string; lang: 'fi' | 'en' }) {
  const kelpo = PAIVA_RE.test(paiva)
  const d = kelpo ? new Date(`${paiva}T12:00:00`) : null
  return (
    <span className="shrink-0 w-11 h-11 rounded-xl flex flex-col items-center justify-center leading-none" style={{ background: 'rgba(107,118,255,.12)' }} aria-hidden>
      {d ? (
        <>
          <span className="text-[10px] font-black uppercase" style={{ color: '#a3abff', letterSpacing: '.04em' }}>
            {new Intl.DateTimeFormat(lang === 'fi' ? 'fi-FI' : 'en-GB', { weekday: 'short' }).format(d).replace('.', '')}
          </span>
          <span className="text-[16px] font-black text-white mt-0.5">{d.getDate()}</span>
        </>
      ) : (
        <span className="text-[20px]">🗓</span>
      )}
    </span>
  )
}

export function OmatSuunnitelmatSheet({ open, onClose, suunnitelmat, aktiivinenId, onValitse, onPoista, onUusi }: {
  open: boolean
  onClose: () => void
  suunnitelmat: TallennettuSuunnitelma[]
  aktiivinenId: string
  onValitse: (id: string) => void
  onPoista: (id: string) => void
  onUusi: () => void
}) {
  const { t, lang } = useLanguage()
  const tanaan = helsinkiToday()
  const jarjestetyt = useMemo(() => jarjestaSuunnitelmat(suunnitelmat, tanaan), [suunnitelmat, tanaan])
  const taynna = suunnitelmat.length >= SUUNNITELMA_MAX
  return (
    <BottomSheet open={open} onClose={onClose} title={t('plan.list_title')} subtitle={t('plan.list_sub')} kapeaTyopoydalla
      footer={
        <div className="space-y-2">
          <button type="button" onClick={onUusi} disabled={taynna}
            className="flex items-center justify-center gap-2 w-full h-[52px] rounded-[16px] font-black text-white text-[15px] transition-all active:scale-[.99] disabled:opacity-40"
            style={{ background: 'linear-gradient(150deg,#6b76ff,#5059e6)', boxShadow: '0 12px 32px -8px rgba(91,101,230,.55)' }}>
            <Plus size={18} /> {t('plan.new')}
          </button>
          {taynna && <p className="text-center text-[12px] font-bold" style={{ color: '#ff9f43' }}>{t('plan.list_full')}</p>}
        </div>
      }>
      <div className="flex flex-col gap-1 px-3 pb-3 pt-1">
        {jarjestetyt.map((s) => {
          const aktiivinen = s.id === aktiivinenId
          const mennyt = onMennytSuunnitelma(s, tanaan)
          const paiva = suunnitelmanPaivaTeksti(s.paiva, lang)
          const meta = `${paiva || t('plan.no_date')} · ${s.askeleet.length} ${t('plan.steps')}`
          return (
            <div key={s.id} className="flex items-center gap-1 rounded-[14px] pr-1" style={aktiivinen ? { background: 'rgba(107,118,255,.12)' } : undefined}>
              <button type="button" onClick={() => onValitse(s.id)}
                className="flex-1 min-w-0 text-left flex items-center gap-3.5 min-h-[60px] px-3 py-2.5 rounded-[14px] text-white transition-colors active:bg-white/6"
                style={{ opacity: mennyt && !aktiivinen ? 0.6 : 1 }}>
                <PaivaMerkki paiva={s.paiva} lang={lang} />
                <span className="min-w-0 flex-1 flex flex-col gap-0.5">
                  <span className="flex items-center gap-2 min-w-0">
                    <span className="text-[16px] font-extrabold truncate" style={{ letterSpacing: '-0.01em', color: aktiivinen ? '#c7caff' : '#fff' }}>
                      {suunnitelmanNimi(s, t, lang)}
                    </span>
                    {aktiivinen && <Merkki teksti={t('plan.open_tag')} />}
                    {mennyt && <Merkki teksti={t('plan.past_tag')} himmea />}
                  </span>
                  <span className="text-[13px] font-medium truncate" style={{ color: 'rgba(255,255,255,.5)' }}>{meta}</span>
                </span>
              </button>
              <button type="button" onClick={() => onPoista(s.id)} aria-label={`${t('plan.delete')}: ${suunnitelmanNimi(s, t, lang)}`}
                className="shrink-0 w-11 h-11 rounded-full flex items-center justify-center text-white/40 hover:text-white transition-colors active:bg-white/10">
                <Trash2 size={17} />
              </button>
            </div>
          )
        })}
      </div>
    </BottomSheet>
  )
}

'use client'

import { X, CheckCircle } from 'lucide-react'
import { useState } from 'react'
import { useLanguage } from '@/contexts/LanguageContext'
import { VIBES } from '@/lib/types'
import type { TranslationKey } from '@/lib/i18n'

// Kategoriapillerit VIBES-listasta (design 8-ilmoita.png; ei festivaali/underground)
const FORM_VIBES = VIBES.filter((v) => v.id !== 'festivaali' && v.id !== 'underground')

interface Props {
  onClose: () => void
}

export default function JarjestajaForm({ onClose }: Props) {
  const { t } = useLanguage()
  const [sent, setSent] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [missing, setMissing] = useState<string[]>([])
  const [form, setForm] = useState({
    nimi: '', kuvaus: '', pvm: '', aika: '',
    paikka: '', hinta: '', linkki: '', email: '',
  })
  const [kategoriat, setKategoriat] = useState<string[]>([])

  type Field = keyof typeof form
  const set = (key: Field) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
    setForm(f => ({ ...f, [key]: e.target.value }))

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (loading) return
    // Validointi: pakolliset = nimi, päivämäärä, paikka, sähköposti
    const miss: string[] = []
    if (!form.nimi.trim()) miss.push(t('form.field_name'))
    if (!form.pvm.trim()) miss.push(t('form.field_date'))
    if (!form.paikka.trim()) miss.push(t('form.field_venue'))
    if (!form.email.trim() || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email)) miss.push(t('form.field_email'))
    setMissing(miss)
    if (miss.length > 0) return
    setLoading(true)
    setError('')
    try {
      const res = await fetch('/api/submit-event', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...form, kategoria: kategoriat.join(', ') }),
      })
      if (!res.ok) throw new Error()
      setSent(true)
    } catch {
      setError(t('form.error'))
    } finally {
      setLoading(false)
    }
  }

  const inputClass = "w-full bg-white/6 border border-white/8 rounded-xl px-4 py-3 text-[13px] text-white placeholder-white/25 focus:outline-none focus:border-[#6b76ff]/60 transition-colors"
  const labelClass = "text-[11px] font-black uppercase tracking-[.08em] text-white/40"

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4">
      <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" onClick={onClose} />
      <div className="relative w-full sm:max-w-lg rounded-t-[26px] sm:rounded-2xl overflow-hidden flex flex-col animate-sheet-up"
        style={{ background: '#0e1117', border: '1px solid rgba(255,255,255,0.08)', maxHeight: '92dvh' }}>

        {/* Kahva */}
        <div className="flex justify-center pt-2.5 shrink-0 sm:hidden">
          <div className="w-10 h-1 rounded-full bg-white/15" />
        </div>

        {/* Header */}
        <div className="flex items-start justify-between px-5 pt-3 pb-2 shrink-0">
          <div>
            <h2 className="text-[22px] font-black text-white" style={{ letterSpacing: '-0.02em' }}>{t('form.add_event')}</h2>
            <p className="text-white/40 text-[13px] mt-1 leading-snug">{t('form.subtitle')}</p>
          </div>
          <button onClick={onClose} aria-label={t('common.close')}
            className="shrink-0 w-10 h-10 rounded-full flex items-center justify-center border border-white/10 bg-white/6 text-white/50 hover:text-white transition-all">
            <X size={16} />
          </button>
        </div>

        {sent ? (
          <div className="p-8 flex flex-col items-center gap-4 text-center">
            <CheckCircle size={44} style={{ color: '#5fd9a6' }} />
            <div>
              <p className="font-black text-white text-[20px]">{t('form.success_title')}</p>
              <p className="text-white/45 text-sm mt-1.5 leading-relaxed max-w-xs">{t('form.success_sub')}</p>
            </div>
            <button onClick={onClose}
              className="px-8 py-3 rounded-full text-sm font-black text-white mt-2"
              style={{ background: 'linear-gradient(150deg,#6b76ff,#5059e6)', boxShadow: '0 10px 24px -8px rgba(91,101,230,.85)' }}>
              {t('common.close')}
            </button>
          </div>
        ) : (
          <form onSubmit={handleSubmit} noValidate className="px-5 pb-6 pt-2 space-y-3.5 overflow-y-auto">
            <div className="space-y-1.5">
              <label className={labelClass}>{t('form.field_name')} <span style={{ color: '#6b76ff' }}>*</span></label>
              <input value={form.nimi} onChange={set('nimi')} placeholder={t('form.field_name_ph')} className={inputClass} />
            </div>

            <div className="grid grid-cols-[3fr_2fr] gap-3">
              <div className="space-y-1.5">
                <label className={labelClass}>{t('form.field_date')} <span style={{ color: '#6b76ff' }}>*</span></label>
                <input type="date" value={form.pvm} onChange={set('pvm')} className={`${inputClass} [color-scheme:dark]`} />
              </div>
              <div className="space-y-1.5">
                <label className={labelClass}>{t('form.field_time')}</label>
                <input type="time" value={form.aika} onChange={set('aika')} className={`${inputClass} [color-scheme:dark]`} />
              </div>
            </div>

            <div className="space-y-1.5">
              <label className={labelClass}>{t('form.field_venue')} <span style={{ color: '#6b76ff' }}>*</span></label>
              <input value={form.paikka} onChange={set('paikka')} placeholder={t('form.field_venue_ph')} className={inputClass} />
            </div>

            <div className="space-y-1.5">
              <label className={labelClass}>{t('form.field_email')} <span style={{ color: '#6b76ff' }}>*</span></label>
              <input type="email" value={form.email} onChange={set('email')} placeholder="nimi@esimerkki.fi" className={inputClass} />
            </div>

            <div className="border-t border-white/6 my-1" />

            <div className="space-y-1.5">
              <label className={labelClass}>{t('form.field_category')}</label>
              <div className="flex gap-1.5 overflow-x-auto scrollbar-none -mx-5 px-5 pb-1">
                {FORM_VIBES.map(v => {
                  const active = kategoriat.includes(v.label)
                  return (
                    <button
                      key={v.id}
                      type="button"
                      onClick={() => setKategoriat(prev => active ? prev.filter(k => k !== v.label) : [...prev, v.label])}
                      className="shrink-0 px-3.5 py-2 rounded-full text-[12px] font-bold border transition-all"
                      style={active
                        ? { background: 'linear-gradient(150deg,#6b76ff,#5059e6)', borderColor: 'transparent', color: '#fff' }
                        : { background: 'rgba(255,255,255,0.05)', borderColor: 'rgba(255,255,255,0.1)', color: 'rgba(255,255,255,0.5)' }
                      }
                    >
                      {t(v.tKey as TranslationKey)}
                    </button>
                  )
                })}
              </div>
            </div>

            <div className="space-y-1.5">
              <label className={labelClass}>{t('form.field_price')}</label>
              <input value={form.hinta} onChange={set('hinta')} placeholder={t('form.field_price_ph')} className={inputClass} />
            </div>

            <div className="space-y-1.5">
              <label className={`${labelClass} flex items-center gap-2`}>
                {t('form.field_link')}
                <span className="px-2 py-0.5 rounded-full text-[9px] font-black tracking-[.06em] normal-case"
                  style={{ background: 'rgba(107,118,255,.15)', border: '1px solid rgba(107,118,255,.45)', color: '#a3abff' }}>
                  {t('form.link_recommended')}
                </span>
              </label>
              <input type="url" value={form.linkki} onChange={set('linkki')} placeholder="https://…" className={inputClass} />
              <p className="text-[11px] text-white/30 leading-snug">{t('form.link_help')}</p>
            </div>

            <div className="space-y-1.5">
              <label className={labelClass}>{t('form.field_desc')}</label>
              <textarea value={form.kuvaus} onChange={set('kuvaus')} placeholder={t('form.field_desc_ph')} rows={3}
                className={`${inputClass} resize-none`} />
            </div>

            {missing.length > 0 && (
              <div className="px-4 py-3 rounded-xl text-[12.5px] font-bold"
                style={{ background: 'rgba(255,111,96,.1)', border: '1px solid rgba(255,111,96,.3)', color: '#ff9d94' }}>
                {t('form.missing')} {missing.join(', ')}
              </div>
            )}
            {error && <p className="text-red-400/80 text-xs text-center">{error}</p>}

            <button type="submit" disabled={loading}
              className="w-full py-4 rounded-2xl font-black text-[14px] text-white hover:opacity-90 active:scale-[0.98] transition-all mt-1 disabled:opacity-60 flex items-center justify-center gap-2"
              style={{ background: 'linear-gradient(150deg,#6b76ff,#5059e6)', boxShadow: '0 10px 24px -8px rgba(91,101,230,.85)' }}>
              {loading && <span className="w-4 h-4 rounded-full border-2 border-white/40 border-t-white animate-spin" />}
              {loading ? t('form.sending') : t('form.submit')}
            </button>
            <p className="text-[11px] text-white/30 text-center leading-snug pb-1">{t('form.moderation')}</p>
          </form>
        )}
      </div>
    </div>
  )
}

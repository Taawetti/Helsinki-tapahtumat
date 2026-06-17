'use client'

import { X, CheckCircle } from 'lucide-react'
import { useState } from 'react'

const KATEGORIAT = [
  'Musiikki', 'Teatteri & Sirkus', 'Taide & Kulttuuri', 'Urheilu',
  'Ruoka & Juoma', 'Puisto & Ulkoilu', 'Lapset & Perhe',
  'Klubit & Yöelämä', 'Stand-up & Komedia', 'Muu',
]

interface Props {
  onClose: () => void
}

export default function JarjestajaForm({ onClose }: Props) {
  const [sent, setSent] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [form, setForm] = useState({
    nimi: '', kuvaus: '', pvm: '', aika: '',
    paikka: '', hinta: '', kategoria: '', linkki: '', email: '',
  })

  type Field = keyof typeof form
  const set = (key: Field) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) =>
    setForm(f => ({ ...f, [key]: e.target.value }))

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (loading) return
    setLoading(true)
    setError('')
    try {
      const res = await fetch('/api/submit-event', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(form),
      })
      if (!res.ok) throw new Error()
      setSent(true)
    } catch {
      setError('Lähetys epäonnistui. Tarkista tiedot ja yritä uudelleen.')
    } finally {
      setLoading(false)
    }
  }

  const inputClass = "w-full bg-white/5 border border-white/8 rounded-xl px-4 py-2.5 text-sm text-white placeholder-white/20 focus:outline-none focus:border-purple-500/40 transition-colors"

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4">
      <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" onClick={onClose} />
      <div className="relative w-full sm:max-w-lg rounded-t-3xl sm:rounded-2xl overflow-hidden flex flex-col"
        style={{ background: '#111118', border: '1px solid rgba(255,255,255,0.08)', maxHeight: '95dvh' }}>

        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-white/6 shrink-0">
          <div>
            <h2 className="text-base font-black text-white">Lisää tapahtuma</h2>
            <p className="text-white/30 text-xs mt-0.5">Täytä tiedot ja lähetä ehdotus</p>
          </div>
          <button onClick={onClose} className="p-2 rounded-xl border border-white/8 text-white/30 hover:text-white/70 transition-all">
            <X size={14} />
          </button>
        </div>

        {sent ? (
          <div className="p-8 flex flex-col items-center gap-4 text-center">
            <CheckCircle size={40} className="text-emerald-400" />
            <div>
              <p className="font-black text-white text-base">Kiitos ilmoituksesta!</p>
              <p className="text-white/40 text-sm mt-1">Tarkistamme tapahtuman ja otamme sinuun yhteyttä pian.</p>
            </div>
            <button onClick={onClose} className="px-6 py-2.5 rounded-xl text-sm font-bold text-white/60 border border-white/10 hover:text-white transition-all mt-2">
              Sulje
            </button>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="p-5 space-y-3 overflow-y-auto">
            <div className="space-y-1.5">
              <label className="text-[10px] font-black uppercase tracking-wide text-white/35">Tapahtuman nimi *</label>
              <input required value={form.nimi} onChange={set('nimi')} placeholder="esim. Flow Festival 2026" className={inputClass} />
            </div>

            <div className="space-y-1.5">
              <label className="text-[10px] font-black uppercase tracking-wide text-white/35">Kuvaus</label>
              <textarea value={form.kuvaus} onChange={set('kuvaus')} placeholder="Kerro lyhyesti tapahtumasta…" rows={3}
                className={`${inputClass} resize-none`} />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <label className="text-[10px] font-black uppercase tracking-wide text-white/35">Päivämäärä *</label>
                <input required type="date" value={form.pvm} onChange={set('pvm')}
                  className={`${inputClass} [color-scheme:dark]`} />
              </div>
              <div className="space-y-1.5">
                <label className="text-[10px] font-black uppercase tracking-wide text-white/35">Kellonaika</label>
                <input type="time" value={form.aika} onChange={set('aika')}
                  className={`${inputClass} [color-scheme:dark]`} />
              </div>
            </div>

            <div className="space-y-1.5">
              <label className="text-[10px] font-black uppercase tracking-wide text-white/35">Paikka *</label>
              <input required value={form.paikka} onChange={set('paikka')} placeholder="esim. Tavastia, Helsinki" className={inputClass} />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <label className="text-[10px] font-black uppercase tracking-wide text-white/35">Hinta</label>
                <input value={form.hinta} onChange={set('hinta')} placeholder="esim. 15 € / Maksuton" className={inputClass} />
              </div>
              <div className="space-y-1.5">
                <label className="text-[10px] font-black uppercase tracking-wide text-white/35">Kategoria</label>
                <select value={form.kategoria} onChange={set('kategoria')} className={inputClass}>
                  <option value="">Valitse…</option>
                  {KATEGORIAT.map(k => (
                    <option key={k} value={k} className="bg-[#111118]">{k}</option>
                  ))}
                </select>
              </div>
            </div>

            <div className="space-y-1.5">
              <label className="text-[10px] font-black uppercase tracking-wide text-white/35">Linkki lisätietoihin tai lipunmyyntiin</label>
              <input type="url" value={form.linkki} onChange={set('linkki')} placeholder="https://…" className={inputClass} />
            </div>

            <div className="space-y-1.5">
              <label className="text-[10px] font-black uppercase tracking-wide text-white/35">Järjestäjän sähköposti *</label>
              <input required type="email" value={form.email} onChange={set('email')} placeholder="info@tapahtuma.fi" className={inputClass} />
            </div>

            {error && <p className="text-red-400/80 text-xs text-center">{error}</p>}
            <button type="submit" disabled={loading}
              className="w-full py-3.5 rounded-xl font-black text-sm text-white hover:opacity-90 active:scale-[0.98] transition-all mt-1 disabled:opacity-60 flex items-center justify-center gap-2"
              style={{ background: 'linear-gradient(135deg,#a855f7,#ec4899)' }}>
              {loading && <span className="w-4 h-4 rounded-full border-2 border-white/40 border-t-white animate-spin" />}
              {loading ? 'Lähetetään…' : 'Lähetä ehdotus'}
            </button>
          </form>
        )}
      </div>
    </div>
  )
}

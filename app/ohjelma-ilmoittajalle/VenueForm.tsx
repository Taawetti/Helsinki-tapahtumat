'use client'

import { useState } from 'react'

// Venue-/järjestäjäilmoitus → sama /api/submit-event -putki kuin tavallinen
// tapahtumalomake (Brevo-sähköposti ylläpidolle). Kentät sovitettu API:n
// olemassa oleviin kenttiin — API:a ei tarvinnut muuttaa.
export default function VenueForm() {
  const [sent, setSent] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [form, setForm] = useState({
    nimi: '', paikka: '', pvm: '', aika: '', loppuu: '',
    linkki: '', kuvaus: '', email: '',
  })

  type Field = keyof typeof form
  const set = (key: Field) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
    setForm(f => ({ ...f, [key]: e.target.value }))

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (loading) return
    // Pakolliset: nimi, venue, päivämäärä, yhteys-email (peilaa API:n validointia)
    const miss: string[] = []
    if (!form.nimi.trim()) miss.push('tapahtuman nimi')
    if (!form.paikka.trim()) miss.push('venue')
    if (!form.pvm.trim()) miss.push('päivämäärä')
    if (!form.email.trim() || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email)) miss.push('sähköposti')
    if (miss.length > 0) { setError(`Täytä vielä: ${miss.join(', ')}`); return }
    setLoading(true); setError('')
    try {
      const res = await fetch('/api/submit-event', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        // kategoria-tagi erottaa ohjelma-ilmoittajat tavallisista ehdotuksista
        body: JSON.stringify({ ...form, kategoria: 'Ohjelma-ilmoittaja' }),
      })
      if (!res.ok) {
        // Näytä palvelimen tarkka syy (esim. virheellinen linkki)
        const data = await res.json().catch(() => null)
        setError(data?.error ?? 'Lähetys epäonnistui — yritä uudelleen')
        return
      }
      setSent(true)
    } catch {
      setError('Verkkovirhe — yritä uudelleen')
    } finally {
      setLoading(false)
    }
  }

  const inputClass = "w-full bg-white/6 border border-white/8 rounded-xl px-4 py-3 text-[14px] text-white placeholder-white/25 focus:outline-none focus:border-[#6b76ff]/60 transition-colors"
  const labelClass = "text-[11px] font-black uppercase tracking-[.08em] text-white/40"

  if (sent) {
    return (
      <div className="rounded-3xl p-8 text-center space-y-3"
        style={{ background: 'rgba(16,185,129,.06)', border: '1px solid rgba(16,185,129,.25)' }}>
        <p className="text-4xl">🎉</p>
        <p className="font-black text-white text-xl">Kiitos!</p>
        <p className="text-white/50 text-sm font-semibold leading-relaxed">
          Tarkistamme ja julkaisemme yleensä vuorokaudessa.
        </p>
      </div>
    )
  }

  return (
    <form onSubmit={handleSubmit} noValidate
      className="rounded-3xl p-5 sm:p-6 space-y-3.5"
      style={{ background: 'rgba(255,255,255,.04)', border: '1px solid rgba(255,255,255,.09)' }}>

      <div className="space-y-1.5">
        <label className={labelClass}>Tapahtuman nimi <span style={{ color: '#6b76ff' }}>*</span></label>
        <input value={form.nimi} onChange={set('nimi')} placeholder="Esim. Perjantai-keikka: Bändi X" className={inputClass} />
      </div>

      <div className="space-y-1.5">
        <label className={labelClass}>Venue <span style={{ color: '#6b76ff' }}>*</span></label>
        <input value={form.paikka} onChange={set('paikka')} placeholder="Esim. Bar Loose, Annankatu 21" className={inputClass} />
      </div>

      <div className="space-y-1.5">
        <label className={labelClass}>Päivämäärä <span style={{ color: '#6b76ff' }}>*</span></label>
        <input type="date" value={form.pvm} onChange={set('pvm')} className={`${inputClass} [color-scheme:dark]`} />
      </div>

      {/* Loppumisaika myös tässä: molemmat lomakkeet postaavat samaan
          /api/submit-event-reittiin, ja ilman kenttää tämän kautta tulleista
          ilmoituksista puuttuisi tieto jonka sovelluksen sisäinen lomake kysyy. */}
      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1.5">
          <label className={labelClass}>Alkaa</label>
          <input type="time" value={form.aika} onChange={set('aika')} className={`${inputClass} [color-scheme:dark]`} />
        </div>
        <div className="space-y-1.5">
          <label className={labelClass}>Päättyy</label>
          <input type="time" value={form.loppuu} onChange={set('loppuu')} className={`${inputClass} [color-scheme:dark]`} />
        </div>
      </div>

      <div className="space-y-1.5">
        <label className={labelClass}>Linkki lippuihin / infosivuun</label>
        <input type="url" value={form.linkki} onChange={set('linkki')} placeholder="https://…" className={inputClass} />
        <p className="text-[11px] text-white/30 leading-snug">Suora linkki lipunmyyntiin tai tapahtumasivulle ohjaa kiinnostuneet ostamaan.</p>
      </div>

      <div className="space-y-1.5">
        <label className={labelClass}>Kuvaus</label>
        <textarea value={form.kuvaus} onChange={set('kuvaus')} rows={3}
          placeholder="Kerro lyhyesti mitä ohjelmaa on luvassa" className={`${inputClass} resize-none`} />
      </div>

      <div className="space-y-1.5">
        <label className={labelClass}>Yhteys-email <span style={{ color: '#6b76ff' }}>*</span></label>
        <input type="email" value={form.email} onChange={set('email')} placeholder="nimi@venue.fi" className={inputClass} />
        <p className="text-[11px] text-white/30 leading-snug">Vain ylläpidon käyttöön — otamme yhteyttä jos tiedoissa on täydennettävää.</p>
      </div>

      {error && (
        <div className="px-4 py-3 rounded-xl text-[12.5px] font-bold"
          style={{ background: 'rgba(255,111,96,.1)', border: '1px solid rgba(255,111,96,.3)', color: '#ff9d94' }}>
          {error}
        </div>
      )}

      <button type="submit" disabled={loading}
        className="w-full py-4 rounded-2xl font-black text-[14px] text-white hover:opacity-90 active:scale-[0.98] transition-all disabled:opacity-60 flex items-center justify-center gap-2"
        style={{ background: 'linear-gradient(150deg,#6b76ff,#5059e6)', boxShadow: '0 10px 24px -8px rgba(91,101,230,.85)' }}>
        {loading && <span className="w-4 h-4 rounded-full border-2 border-white/40 border-t-white animate-spin" />}
        {loading ? 'Lähetetään…' : 'Lähetä ohjelma julkaistavaksi →'}
      </button>
      <p className="text-[11px] text-white/30 text-center leading-snug">Julkaisu on ilmaista. Tarkistamme jokaisen ilmoituksen ennen julkaisua.</p>
    </form>
  )
}

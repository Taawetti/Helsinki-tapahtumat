'use client'

import { Mail, X, CheckCircle } from 'lucide-react'
import { useState, useEffect } from 'react'

const STORAGE_KEY = 'hki-newsletter-v1'

export default function NewsletterBanner() {
  const [email, setEmail] = useState('')
  const [sent, setSent] = useState(false)
  const [hidden, setHidden] = useState(true)

  useEffect(() => {
    if (!localStorage.getItem(STORAGE_KEY)) setHidden(false)
  }, [])

  const dismiss = () => {
    localStorage.setItem(STORAGE_KEY, '1')
    setHidden(true)
  }

  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!email || loading) return
    setLoading(true)
    setError('')
    try {
      const res = await fetch('/api/newsletter', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email }),
      })
      if (!res.ok) throw new Error()
      setSent(true)
      localStorage.setItem(STORAGE_KEY, '1')
      setTimeout(dismiss, 3500)
    } catch {
      setError('Tilaus epäonnistui. Yritä uudelleen.')
    } finally {
      setLoading(false)
    }
  }

  if (hidden) return null

  return (
    <div className="rounded-2xl overflow-hidden" style={{ background: 'rgba(107,118,255,0.06)', border: '1px solid rgba(107,118,255,0.15)' }}>
      <div className="p-5">
        {sent ? (
          <div className="flex items-center gap-3">
            <CheckCircle size={20} className="text-emerald-400 shrink-0" />
            <div>
              <p className="text-white font-bold text-sm">Hienoa, tilaus vastaanotettu!</p>
              <p className="text-white/35 text-xs mt-0.5">Saat viikonlopun parhaat menot sähköpostiisi.</p>
            </div>
          </div>
        ) : (
          <>
            <div className="flex items-start justify-between mb-4">
              <div className="flex items-center gap-2.5">
                <div className="w-9 h-9 rounded-xl flex items-center justify-center shrink-0"
                  style={{ background: 'linear-gradient(150deg,#6b76ff,#5059e6)' }}>
                  <Mail size={15} className="text-white" />
                </div>
                <div>
                  <p className="text-white font-black text-sm leading-tight">Viikonlopun parhaat menot</p>
                  <p className="text-white/35 text-xs">Suoraan sähköpostiisi joka perjantai</p>
                </div>
              </div>
              <button onClick={dismiss} className="text-white/20 hover:text-white/50 transition-all p-1 -mr-1 -mt-1">
                <X size={14} />
              </button>
            </div>
            <form onSubmit={handleSubmit} className="flex flex-col gap-2">
              <div className="flex gap-2">
                <input
                  type="email"
                  value={email}
                  onChange={e => setEmail(e.target.value)}
                  placeholder="sähköpostisi@email.com"
                  disabled={loading}
                  className="flex-1 bg-white/6 border border-white/8 rounded-xl px-3 py-2.5 text-sm text-white placeholder-white/20 focus:outline-none focus:border-[#6b76ff]/40 transition-colors disabled:opacity-50"
                />
                <button type="submit" disabled={loading}
                  className="px-4 py-2.5 rounded-xl font-bold text-xs text-white shrink-0 hover:opacity-90 active:scale-95 transition-all disabled:opacity-60 flex items-center gap-1.5"
                  style={{ background: 'linear-gradient(150deg,#6b76ff,#5059e6)', boxShadow: '0 4px 12px -4px rgba(91,101,230,.5)' }}>
                  {loading && <span className="w-3 h-3 rounded-full border-2 border-white/40 border-t-white animate-spin" />}
                  Tilaa
                </button>
              </div>
              {error && <p className="text-red-400/80 text-xs">{error}</p>}
            </form>
          </>
        )}
      </div>
    </div>
  )
}

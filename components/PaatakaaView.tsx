'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import DatePicker from '@/components/DatePicker'
import ThemeArcs from '@/components/ThemeArcs'
import type { ThemeArc, ThemeArcPreset } from '@/components/ThemeArcs'
import { NEIGHBORHOODS } from '@/lib/types'
import type { GroupWhen, BudgetId } from '@/lib/candidate'
import type { GroupMode } from '@/lib/group'

// Osallistujan pysyvä anon-tunniste (localStorage).
function participantId(): string {
  if (typeof window === 'undefined') return ''
  let id = localStorage.getItem('paatakaa-voter-id')
  if (!id) { id = Math.random().toString(36).slice(2) + Date.now().toString(36); localStorage.setItem('paatakaa-voter-id', id) }
  return id
}

// Salainen host-tunniste: tallennetaan vain omaan selaimeen + palvelimelle
// (ei koskaan jaeta) → todistaa host-oikeuden ilman julkista host_id:tä.
function genHostSecret(): string {
  return Math.random().toString(36).slice(2) + Math.random().toString(36).slice(2) + Date.now().toString(36)
}

const MODES: { id: GroupMode; emoji: string; label: string; desc: string }[] = [
  { id: 'quick', emoji: '⚡', label: 'Pikapäätös', desc: 'Yksi voittaja — ratkeaa heti kun enemmistö tykkää samasta' },
  { id: 'arc', emoji: '🗺', label: 'Illan kaari', desc: 'Tykätyistä kudotaan koko illan suunnitelma vaiheineen' },
]

const WHENS: { id: GroupWhen; emoji: string; label: string }[] = [
  { id: 'tonight', emoji: '🌙', label: 'Tänä iltana' },
  { id: 'day', emoji: '☀️', label: 'Tänään koko päivä' },
  { id: 'weekend', emoji: '🗓', label: 'Viikonloppu' },
]

const SCENES: { id: string; emoji: string; label: string }[] = [
  { id: 'ruoka', emoji: '🍽', label: 'Ruoka & juoma' },
  { id: 'keikka', emoji: '🎸', label: 'Keikka/klubi' },
  { id: 'kulttuuri', emoji: '🎭', label: 'Kulttuuri' },
  { id: 'ulkona', emoji: '🌳', label: 'Ulkona' },
  { id: 'baarit', emoji: '🍸', label: 'Baarit' },
  { id: 'sauna', emoji: '🧖', label: 'Sauna' },
  { id: 'perhe', emoji: '👨‍👩‍👧', label: 'Perhe' },
  { id: 'ilmaista', emoji: '💸', label: 'Ilmaista' },
]

const BUDGETS: { id: BudgetId; label: string }[] = [
  { id: 'any', label: 'Kaikki' },
  { id: 'free', label: '💸 Vain ilmaiset' },
  { id: 'e', label: '€' },
  { id: 'ee', label: '€€' },
]

const ACTIVE = { background: 'linear-gradient(150deg,#6b76ff,#5059e6)', border: '1px solid transparent', boxShadow: '0 8px 20px -8px rgba(91,101,230,.6)' } as const
const INACTIVE = { background: 'rgba(255,255,255,.05)', border: '1px solid rgba(255,255,255,.09)' } as const

export default function PaatakaaView() {
  const router = useRouter()
  const [mode, setMode] = useState<GroupMode>('quick')
  const [when, setWhen] = useState<GroupWhen>('tonight')
  const [customStart, setCustomStart] = useState('')
  const [customEnd, setCustomEnd] = useState('')
  const [areas, setAreas] = useState<string[]>([])
  const [scenes, setScenes] = useState<string[]>([])
  const [budget, setBudget] = useState<BudgetId>('any')
  const [joinCode, setJoinCode] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [launchingArc, setLaunchingArc] = useState<string | null>(null)

  const toggleScene = (s: string) => setScenes(cur => cur.includes(s) ? cur.filter(x => x !== s) : [...cur, s])
  const toggleArea = (a: string) => setAreas(cur => cur.includes(a) ? cur.filter(x => x !== a) : [...cur, a])

  // Session luonti. Ilman argumenttia käytetään lomakkeen tilaa; teemakaari
  // antaa overrides-arvot (ohittaa myös custom-päivät ja alueet → koko kaupunki).
  async function create(overrides?: ThemeArcPreset): Promise<boolean> {
    if (loading) return false
    const m = overrides?.mode ?? mode
    const w = overrides?.when ?? when
    const s: string[] = overrides?.scenes ?? scenes
    const b = overrides?.budget ?? budget
    // Preset-laukaisu: synkataan lomake näkyviin arvoihin (jos luonti feilaa,
    // käyttäjä näkee mitä lähetettiin ja voi muokata).
    if (overrides) {
      setMode(m); setWhen(w); setScenes(s); setBudget(b)
      setAreas([]); setCustomStart(''); setCustomEnd('')
    }
    setLoading(true); setError(null)
    const hostSecret = genHostSecret()
    try {
      const res = await fetch('/api/group/create', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          when: w,
          fiilis: s,
          mode: m,
          hostId: participantId(),
          hostSecret,
          customStart: overrides ? null : (customStart || null),
          customEnd: overrides ? null : (customEnd || null),
          areas: overrides ? [] : areas,
          budget: b,
        }),
      })
      const data = await res.json()
      if (!res.ok) { setError(data.error || 'Luonti epäonnistui'); setLoading(false); return false }
      try { localStorage.setItem(`paatakaa-host-${data.code}`, hostSecret) } catch { /* privaattitila */ }
      router.push(`/paatakaa/${data.code}`)
      return true
    } catch {
      setError('Verkkovirhe — yritä uudelleen'); setLoading(false)
      return false
    }
  }

  // Teemakaaren laukaisu: yksi nappi → preset + välitön luonti.
  // Tuplaklikkaus estyy loading-guardilla + korttien disabled-tilalla.
  async function launchArc(arc: ThemeArc) {
    if (loading) return
    setLaunchingArc(arc.id)
    const ok = await create(arc.preset)
    if (!ok) setLaunchingArc(null)
  }

  return (
    <main className="max-w-lg mx-auto px-4 pt-6 pb-24 space-y-7">
      <div>
        <p className="text-white/30 text-[11px] font-black uppercase tracking-[.2em] mb-1">HELSINKI</p>
        <h1 className="font-black text-white leading-none" style={{ fontSize: 'clamp(1.9rem,7vw,2.8rem)', letterSpacing: '-0.03em' }}>
          Päättäkää yhdessä
        </h1>
        <p className="text-white/50 text-[15px] font-semibold mt-2 leading-snug">
          Jaa linkki kavereille → jokainen swaippaa ehdotuksia omalla puhelimellaan → äänistä valmis suunnitelma. 🍸🍽✨🎸
        </p>
      </div>

      {/* Teemakaaret — valmiit kaavat yhdellä napilla */}
      <ThemeArcs launchingId={launchingArc} onLaunch={launchArc} />

      <p className="text-white/25 text-[11px] font-black uppercase tracking-[.2em] text-center pt-1">
        — tai rakenna itse ↓ —
      </p>

      {/* Moodi */}
      <section>
        <h2 className="text-white/70 text-[13px] font-black uppercase tracking-wide mb-2">Miten päätetään?</h2>
        <div className="grid grid-cols-2 gap-2">
          {MODES.map(m => {
            const active = mode === m.id
            return (
              <button key={m.id} onClick={() => setMode(m.id)}
                className="flex flex-col items-start gap-1 rounded-2xl p-4 text-left transition-all active:scale-[.97]"
                style={active ? ACTIVE : INACTIVE}>
                <span className="text-2xl leading-none">{m.emoji}</span>
                <span className="text-[13.5px] font-black" style={{ color: active ? '#fff' : 'rgba(255,255,255,.7)' }}>{m.label}</span>
                <span className="text-[11px] font-semibold leading-snug" style={{ color: active ? 'rgba(255,255,255,.75)' : 'rgba(255,255,255,.35)' }}>{m.desc}</span>
              </button>
            )
          })}
        </div>
      </section>

      {/* Milloin */}
      <section>
        <h2 className="text-white/70 text-[13px] font-black uppercase tracking-wide mb-2">Milloin?</h2>
        <div className="grid grid-cols-3 gap-2 mb-3">
          {WHENS.map(w => {
            const active = when === w.id && !customStart
            return (
              <button key={w.id} onClick={() => { setWhen(w.id); setCustomStart(''); setCustomEnd('') }}
                className="flex flex-col items-center gap-1.5 rounded-2xl py-4 transition-all active:scale-[.97]"
                style={active ? ACTIVE : INACTIVE}>
                <span className="text-2xl leading-none">{w.emoji}</span>
                <span className="text-[12.5px] font-black text-center leading-tight" style={{ color: active ? '#fff' : 'rgba(255,255,255,.6)' }}>{w.label}</span>
              </button>
            )
          })}
        </div>
        <div className="rounded-2xl p-3" style={customStart ? { background: 'rgba(107,118,255,.12)', border: '1px solid rgba(107,118,255,.4)' } : { background: 'rgba(255,255,255,.03)', border: '1px solid rgba(255,255,255,.07)' }}>
          <p className="text-white/50 text-[11px] font-black uppercase tracking-wide mb-2 px-1">📅 Tai valitse päivä(t) itse</p>
          <DatePicker
            value={customStart}
            onChange={setCustomStart}
            valueEnd={customEnd}
            onChangeRange={(s, e) => { setCustomStart(s); setCustomEnd(e) }}
          />
          {customStart && (
            <button onClick={() => { setCustomStart(''); setCustomEnd('') }}
              className="text-white/40 text-[11px] font-bold mt-2 px-1 hover:text-white/70 transition-colors">
              ✕ Tyhjennä oma valinta
            </button>
          )}
        </div>
      </section>

      {/* Missä — monivalinta, ryhmitelty kunnittain (Espoo ja Vantaa ovat
          eri kaupunkeja kuin Helsinki, mutta kuuluvat pääkaupunkiseutuun) */}
      <section>
        <h2 className="text-white/70 text-[13px] font-black uppercase tracking-wide mb-2">Missä?</h2>
        <div className="flex flex-wrap gap-2 mb-3">
          <button onClick={() => setAreas([])}
            className="rounded-full px-3.5 py-2 transition-all active:scale-[.97]"
            style={areas.length === 0 ? ACTIVE : INACTIVE}>
            <span className="text-[13px] font-black" style={{ color: areas.length === 0 ? '#fff' : 'rgba(255,255,255,.55)' }}>🌆 Koko kaupunki</span>
          </button>
        </div>
        {(['helsinki', 'espoo', 'vantaa'] as const).map(muni => {
          const areasOfMuni = NEIGHBORHOODS.filter(n => n.municipality === muni)
          if (areasOfMuni.length === 0) return null
          const muniLabel = muni === 'helsinki' ? 'Helsingin kaupunginosat' : muni === 'espoo' ? 'Espoo (ei Helsinkiä)' : 'Vantaa (ei Helsinkiä)'
          return (
            <div key={muni} className="mb-3">
              <p className="text-white/30 text-[11px] font-black uppercase tracking-wide mb-1.5">{muniLabel}</p>
              <div className="flex flex-wrap gap-2">
                {areasOfMuni.map(n => {
                  const active = areas.includes(n.id)
                  return (
                    <button key={n.id} onClick={() => toggleArea(n.id)}
                      className="rounded-full px-3.5 py-2 transition-all active:scale-[.97]"
                      style={active ? ACTIVE : INACTIVE}>
                      <span className="text-[13px] font-black" style={{ color: active ? '#fff' : 'rgba(255,255,255,.55)' }}>{n.emoji} {n.name}</span>
                    </button>
                  )
                })}
              </div>
            </div>
          )
        })}
        {areas.length > 0 && (
          <p className="text-white/25 text-[12px] font-semibold mt-1">
            {areas.length === 1 ? 'Kaari pysyy kävelyetäisyydellä.' : `${areas.length} aluetta valittu — kaari pysyy tiiviinä.`}
          </p>
        )}
      </section>

      {/* Mitä */}
      <section>
        <h2 className="text-white/70 text-[13px] font-black uppercase tracking-wide mb-2">
          Mitä tehdään? <span className="text-white/30 normal-case font-bold">· valinnainen</span>
        </h2>
        <div className="flex flex-wrap gap-2">
          {SCENES.map(s => {
            const active = scenes.includes(s.id)
            return (
              <button key={s.id} onClick={() => toggleScene(s.id)}
                className="flex items-center gap-1.5 rounded-full px-3.5 py-2 transition-all active:scale-[.97]"
                style={active ? { background: 'rgba(107,118,255,.2)', border: '1px solid rgba(107,118,255,.5)' } : INACTIVE}>
                <span className="text-[15px] leading-none">{s.emoji}</span>
                <span className="text-[13px] font-black" style={{ color: active ? '#fff' : 'rgba(255,255,255,.55)' }}>{s.label}</span>
              </button>
            )
          })}
        </div>
        <p className="text-white/25 text-[12px] font-semibold mt-2">Valitut painottavat pakkaa vahvasti — ei rajaa pois.</p>
      </section>

      {/* Budjetti */}
      <section>
        <h2 className="text-white/70 text-[13px] font-black uppercase tracking-wide mb-2">Budjetti?</h2>
        <div className="flex flex-wrap gap-2">
          {BUDGETS.map(b => {
            const active = budget === b.id
            return (
              <button key={b.id} onClick={() => setBudget(b.id)}
                className="rounded-full px-3.5 py-2 transition-all active:scale-[.97]"
                style={active ? ACTIVE : INACTIVE}>
                <span className="text-[13px] font-black" style={{ color: active ? '#fff' : 'rgba(255,255,255,.55)' }}>{b.label}</span>
              </button>
            )
          })}
        </div>
      </section>

      {error && <p className="text-red-400/80 text-sm font-bold">{error}</p>}

      <button onClick={() => create()} disabled={loading}
        className="w-full rounded-2xl py-4 text-white font-black text-[16px] transition-all active:scale-[.98] disabled:opacity-60"
        style={{ background: 'linear-gradient(150deg,#6b76ff,#5059e6)', boxShadow: '0 12px 28px -10px rgba(91,101,230,.7)' }}>
        {loading ? 'Kootaan pakkaa…' : 'Luo ja jaa 🔗'}
      </button>

      {/* Liity koodilla */}
      <section className="pt-2 border-t border-white/8">
        <h2 className="text-white/50 text-[12px] font-black uppercase tracking-wide mb-2">Onko sinulla koodi?</h2>
        <div className="flex gap-2">
          <input value={joinCode} onChange={e => setJoinCode(e.target.value.toUpperCase().slice(0, 4))}
            placeholder="ABCD" maxLength={4}
            className="flex-1 rounded-xl px-4 py-3 text-white font-black text-lg tracking-[.3em] uppercase outline-none"
            style={{ background: 'rgba(255,255,255,.05)', border: '1px solid rgba(255,255,255,.12)' }} />
          <Link href={joinCode.length === 4 ? `/paatakaa/${joinCode}` : '#'}
            className="rounded-xl px-5 flex items-center font-black text-sm"
            style={{ background: joinCode.length === 4 ? 'rgba(255,255,255,.1)' : 'rgba(255,255,255,.04)', color: joinCode.length === 4 ? '#fff' : 'rgba(255,255,255,.3)' }}>
            Liity →
          </Link>
        </div>
      </section>
    </main>
  )
}

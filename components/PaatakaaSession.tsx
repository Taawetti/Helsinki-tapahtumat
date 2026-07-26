'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import Link from 'next/link'
import SwipeDeck from '@/components/SwipeDeck'
import type { Candidate } from '@/lib/candidate'
import { ROLE_META } from '@/lib/candidate'
import type { GroupSession } from '@/lib/group'

function getVoter(): { id: string; name: string } {
  if (typeof window === 'undefined') return { id: '', name: '' }
  try {
    let id = localStorage.getItem('paatakaa-voter-id')
    if (!id) { id = Math.random().toString(36).slice(2) + Date.now().toString(36); localStorage.setItem('paatakaa-voter-id', id) }
    return { id, name: localStorage.getItem('paatakaa-name') || '' }
  } catch {
    // Privaattitila / estetty localStorage → sessiokohtainen id muistissa
    return { id: Math.random().toString(36).slice(2) + Date.now().toString(36), name: '' }
  }
}

export default function PaatakaaSession({ code }: { code: string }) {
  const [session, setSession] = useState<GroupSession | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [voter, setVoter] = useState<{ id: string; name: string }>({ id: '', name: '' })
  const [nameDraft, setNameDraft] = useState('')
  const [joined, setJoined] = useState(false)
  const [synthesizing, setSynthesizing] = useState(false)
  const [swipedCount, setSwipedCount] = useState(0)
  const votedRef = useRef<Set<string>>(new Set())          // kaikki äänestetyt (kasvaa, persistoidaan)
  // JÄÄDYTETTY mount-hetken äänestetyt → deckCards-suodatin, joka EI kutistu
  // swaippauksen aikana (muuten doneSwiping laukeaisi puolivälissä).
  const [initialVoted, setInitialVoted] = useState<Set<string>>(new Set())
  const reqSeq = useRef(0)                                  // pollausvastausten järjestysvahti

  useEffect(() => {
    const v = getVoter()
    // eslint-disable-next-line react-hooks/set-state-in-effect -- äänestäjätiedon mount-synkkaus localStoragesta
    setVoter(v)
    if (v.name) setJoined(true)
    try {
      const saved = JSON.parse(localStorage.getItem(`paatakaa-voted-${code}`) || '[]')
      if (Array.isArray(saved)) { votedRef.current = new Set(saved); setInitialVoted(new Set(saved)) }
    } catch { /* ignore */ }
  }, [code])

  // Pollaus (2.5 s) — live-tila. Pysäytä kun kaari valmis.
  const refresh = useCallback(async () => {
    const seq = ++reqSeq.current
    try {
      const res = await fetch(`/api/group/${code}`, { cache: 'no-store' })
      const data = await res.json()
      if (seq !== reqSeq.current) return                    // vanhentunut vastaus → ohita (out-of-order)
      if (!res.ok) { setError(data.error || 'Sessiota ei löydy'); return }
      setSession(data as GroupSession)
    } catch { /* verkko-ongelma, seuraava poll yrittää */ }
  }, [code])

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- ensimmäinen pollaus mountissa; jatkuvuus hoituu setIntervallilla
    refresh()
    const iv = setInterval(() => { if (!synthesizing) refresh() }, 2500)
    return () => clearInterval(iv)
  }, [refresh, synthesizing])

  const saveName = () => {
    const n = nameDraft.trim().slice(0, 40)
    if (!n) return
    try { localStorage.setItem('paatakaa-name', n) } catch { /* privaattitila — nimi pysyy silti muistissa */ }
    setVoter(v => ({ ...v, name: n })); setJoined(true)
  }

  const vote = useCallback((card: Candidate, v: 'love' | 'skip') => {
    votedRef.current.add(card.id)
    try { localStorage.setItem(`paatakaa-voted-${code}`, JSON.stringify([...votedRef.current])) } catch { /* ignore */ }
    setSwipedCount(c => c + 1)
    fetch(`/api/group/${code}/vote`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ voterId: voter.id, voterName: voter.name, cardId: card.id, vote: v }),
    }).then(() => refresh()).catch(() => {})
  }, [code, voter, refresh])

  const synthesize = useCallback(async () => {
    setSynthesizing(true); setError(null)
    try {
      const res = await fetch(`/api/group/${code}/synthesize`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ hostId: voter.id }),
      })
      const data = await res.json().catch(() => ({}))
      // 202 = joku kutoo jo → ei virhe, pollaus hakee tuloksen. res.ok kattaa 202:n.
      if (!res.ok) { setError(data.error || 'Kutominen epäonnistui'); setSynthesizing(false); return }
      await refresh()
    } catch { setError('Verkkovirhe kutomisessa') }
    setSynthesizing(false)
  }, [code, refresh, voter.id])

  const shareUrl = typeof window !== 'undefined' ? window.location.href : `https://mitatanaan.fi/paatakaa/${code}`
  const share = async () => {
    const text = `Päätetään yhdessä mitä tehdään! Liity koodilla ${code}:`
    try {
      if (navigator.share) { await navigator.share({ title: 'Päättäkää yhdessä', text, url: shareUrl }); return }
    } catch { /* fall through */ }
    try { await navigator.clipboard.writeText(shareUrl); alert('Linkki kopioitu!') } catch { /* ignore */ }
  }
  const whatsappUrl = `https://wa.me/?text=${encodeURIComponent(`Päätetään yhdessä mitä tehdään! ${shareUrl}`)}`

  // Suodatus JÄÄDYTETYLLÄ initialVoted-joukolla (ei live votedRef) → deckCards.length
  // pysyy vakiona swaippauksen ajan, joten doneSwiping ei laukea puolivälissä.
  // SwipeDeck hoitaa session aikana swaipattujen ohituksen omalla seen-setillään.
  const deckCards = useMemo(
    () => (session?.candidates ?? []).filter(c => !initialVoted.has(c.id)),
    [session?.candidates, initialVoted],
  )
  const lovedCount = useMemo(() => {
    if (!session) return 0
    return Object.values(session.votes).filter(v => v.love > 0 && v.love >= v.skip).length
  }, [session])
  const isHost = !!session && (!session.hostId || session.hostId === voter.id)

  // ── Virhe / lataus ──
  if (error) return (
    <main className="max-w-lg mx-auto px-4 pt-16 text-center space-y-4">
      <p className="text-5xl">🤷</p>
      <p className="text-white/70 font-bold">{error}</p>
      <Link href="/paatakaa" className="inline-block rounded-xl px-5 py-3 font-black text-white" style={{ background: 'linear-gradient(150deg,#6b76ff,#5059e6)' }}>Luo uusi →</Link>
    </main>
  )
  if (!session) return (
    <main className="max-w-lg mx-auto px-4 pt-24 flex items-center justify-center gap-3">
      <div style={{ width: 16, height: 16, borderRadius: '50%', border: '2px solid rgba(107,118,255,.2)', borderTopColor: '#6b76ff', animation: 'spin .7s linear infinite' }} />
      <span className="text-white/50 font-bold">Ladataan sessiota…</span>
    </main>
  )

  // ── TULOS (AI-kaari valmis) ──
  if (session.status === 'done' && session.resultPlan) {
    const plan = session.resultPlan
    const byId = new Map(session.candidates.map(c => [c.id, c]))
    return (
      <main className="max-w-lg mx-auto px-4 pt-6 pb-24 space-y-5">
        <div>
          <p className="text-white/30 text-[11px] font-black uppercase tracking-[.2em] mb-1">PÄÄTÖS · {code}</p>
          <h1 className="font-black text-white leading-tight" style={{ fontSize: 'clamp(1.6rem,6vw,2.3rem)', letterSpacing: '-0.03em' }}>Teidän iltanne 🎉</h1>
          {plan.intro && <p className="text-white/60 text-[15px] font-semibold mt-2 leading-snug">{plan.intro}</p>}
        </div>
        <div className="space-y-3">
          {plan.arc.map((step, i) => {
            const c = step.cardId ? byId.get(step.cardId) : undefined
            return (
              <div key={i} className="rounded-2xl overflow-hidden" style={{ background: 'rgba(255,255,255,.04)', border: '1px solid rgba(255,255,255,.08)' }}>
                {c?.image && <div className="w-full" style={{ aspectRatio: '16/7' }}><img src={c.image} alt={step.title} className="w-full h-full object-cover" /></div>}
                <div className="p-4">
                  <div className="flex items-center gap-2 mb-1">
                    <span className="text-lg">{step.emoji}</span>
                    <span className="text-white/40 text-[11px] font-black uppercase tracking-wide">{i + 1}. vaihe{step.time ? ` · ${step.time}` : ''}</span>
                  </div>
                  <h3 className="font-black text-white text-[17px] leading-tight">{step.title}</h3>
                  {step.why && <p className="text-white/60 text-sm mt-1 leading-snug">{step.why}</p>}
                  {c?.url && <a href={c.url} target="_blank" rel="noopener noreferrer" className="inline-block text-[#8b93ff] text-xs font-black mt-2">Lisätiedot →</a>}
                </div>
              </div>
            )
          })}
        </div>
        {plan.outro && <p className="text-white/60 text-[15px] font-semibold leading-snug">{plan.outro}</p>}
        <div className="flex gap-3">
          <button onClick={share} className="flex-1 rounded-2xl py-3.5 text-white font-black" style={{ background: 'linear-gradient(150deg,#6b76ff,#5059e6)' }}>Jaa 🔗</button>
          <Link href="/paatakaa" className="flex-1 rounded-2xl py-3.5 text-center text-white/70 font-black" style={{ background: 'rgba(255,255,255,.08)' }}>Uusi päätös</Link>
        </div>
      </main>
    )
  }

  // ── NIMIPORTTI ──
  if (!joined) return (
    <main className="max-w-lg mx-auto px-4 pt-10 pb-24 space-y-6">
      <div>
        <p className="text-white/30 text-[11px] font-black uppercase tracking-[.2em] mb-1">LIITY · {code}</p>
        <h1 className="font-black text-white leading-tight" style={{ fontSize: 'clamp(1.7rem,6vw,2.4rem)', letterSpacing: '-0.03em' }}>Kuka olet?</h1>
        <p className="text-white/50 font-semibold mt-2">Etunimi riittää — muut näkevät kuka on mukana.</p>
      </div>
      <input value={nameDraft} onChange={e => setNameDraft(e.target.value)} placeholder="Etunimi" maxLength={40}
        onKeyDown={e => { if (e.key === 'Enter') saveName() }}
        className="w-full rounded-2xl px-4 py-4 text-white font-black text-lg outline-none"
        style={{ background: 'rgba(255,255,255,.05)', border: '1px solid rgba(255,255,255,.12)' }} />
      <button onClick={saveName} disabled={!nameDraft.trim()}
        className="w-full rounded-2xl py-4 text-white font-black text-[16px] disabled:opacity-50"
        style={{ background: 'linear-gradient(150deg,#6b76ff,#5059e6)' }}>Mukaan 🙌</button>
    </main>
  )

  // ── SWAIPPAUS + LIVE ──
  const doneSwiping = deckCards.length === 0 || swipedCount >= deckCards.length
  const isSynthesizing = synthesizing || session.status === 'synthesizing'

  return (
    <main className="max-w-lg mx-auto px-4 pt-5 pb-24">
      {/* Header: koodi, osallistujat, jako */}
      <div className="flex items-center justify-between mb-3">
        <div>
          <p className="text-white/30 text-[11px] font-black uppercase tracking-[.2em]">KOODI {code}</p>
          <p className="text-white/60 text-[13px] font-bold">
            {session.participants.length} mukana · {lovedCount} ❤️ tykättyä
          </p>
        </div>
        <div className="flex gap-2">
          <a href={whatsappUrl} target="_blank" rel="noopener noreferrer" className="rounded-full px-3 py-2 text-sm font-black" style={{ background: 'rgba(37,211,102,.15)', color: '#25d366' }}>WhatsApp</a>
          <button onClick={share} className="rounded-full px-3 py-2 text-sm font-black text-white" style={{ background: 'rgba(255,255,255,.1)' }}>Jaa 🔗</button>
        </div>
      </div>

      {/* Osallistujat */}
      {session.participants.length > 0 && (
        <div className="flex flex-wrap gap-1.5 mb-4">
          {session.participants.map(p => (
            <span key={p.id} className="text-[11px] font-black px-2.5 py-1 rounded-full text-white/70" style={{ background: 'rgba(255,255,255,.07)' }}>
              {p.id === voter.id ? `${p.name} (sinä)` : p.name}
            </span>
          ))}
        </div>
      )}

      {!doneSwiping ? (
        <SwipeDeck<Candidate>
          cards={deckCards}
          onSwipeRight={c => vote(c, 'love')}
          onSwipeLeft={c => vote(c, 'skip')}
          renderCard={(c, drag) => <CandidateCard c={c} drag={drag} />}
        />
      ) : (
        <div className="rounded-3xl p-6 text-center space-y-3" style={{ background: 'rgba(255,255,255,.04)', border: '1px solid rgba(255,255,255,.08)' }}>
          <p className="text-4xl">✅</p>
          <p className="text-white font-black text-lg">Kiitos, äänesi on tallessa!</p>
          <p className="text-white/50 font-semibold text-sm">Odota että muut swaippaavat — tai kutokaa kaari kun olette valmiita.</p>
        </div>
      )}

      {/* Kutominen — host (tai jos ei hostia) kun tykättyjä on. Näyttää "kutoo"
          myös kun serverin status on 'synthesizing' (toinen host käynnisti). */}
      {isHost && lovedCount >= 1 && (
        <button onClick={synthesize} disabled={isSynthesizing}
          className="w-full rounded-2xl py-4 mt-5 text-white font-black text-[16px] disabled:opacity-70"
          style={{ background: 'linear-gradient(150deg,#10b981,#059669)', boxShadow: '0 12px 28px -10px rgba(16,185,129,.6)' }}>
          {isSynthesizing ? '🪄 AI kutoo kaarta…' : `🪄 Kutokaa illan kaari (${lovedCount} ❤️)`}
        </button>
      )}
      {isSynthesizing && <p className="text-white/40 text-center text-sm font-bold mt-3">AI punoo tykätyistä johdonmukaisen illan… hetki.</p>}
      {!isHost && lovedCount >= 1 && !isSynthesizing && (
        <p className="text-white/35 text-center text-[13px] font-bold mt-5">Aloittaja kutoo kaaren kun ryhmä on valmis.</p>
      )}
    </main>
  )
}

// ── Kortti swaippaukseen ──
function CandidateCard({ c, drag }: { c: Candidate; drag: { swipeRight: boolean; swipeLeft: boolean } }) {
  return (
    <div className="relative w-full rounded-[24px] overflow-hidden" style={{ aspectRatio: '3/4', maxHeight: '62vh', background: '#15151b', boxShadow: '0 20px 50px -20px rgba(0,0,0,.8)', border: '1px solid rgba(255,255,255,.08)' }}>
      {c.image
        ? <img src={c.image} alt={c.title} className="absolute inset-0 w-full h-full object-cover" draggable={false} />
        : <div className="absolute inset-0 flex items-center justify-center text-7xl" style={{ background: 'linear-gradient(150deg,#1e1e28,#12121a)' }}>{c.emoji}</div>}
      <div className="absolute inset-0" style={{ background: 'linear-gradient(to top,rgba(10,10,12,.96) 0%,rgba(10,10,12,.2) 55%,transparent 100%)' }} />

      {/* Swipe-overlayt */}
      <div className="absolute top-5 left-5 text-3xl font-black px-3 py-1 rounded-xl transition-opacity" style={{ background: 'rgba(16,185,129,.9)', color: '#fff', opacity: drag.swipeRight ? 1 : 0, transform: 'rotate(-8deg)' }}>❤️</div>
      <div className="absolute top-5 right-5 text-3xl font-black px-3 py-1 rounded-xl transition-opacity" style={{ background: 'rgba(239,68,68,.9)', color: '#fff', opacity: drag.swipeLeft ? 1 : 0, transform: 'rotate(8deg)' }}>✕</div>

      <div className="absolute top-4 left-4">
        <span className="text-[11px] font-black px-2.5 py-1 rounded-full" style={{ background: 'rgba(0,0,0,.5)', color: '#fff', backdropFilter: 'blur(6px)' }}>
          {ROLE_META[c.role].emoji} {ROLE_META[c.role].label}
        </span>
      </div>

      <div className="absolute bottom-0 left-0 right-0 p-5">
        <div className="flex items-center gap-2 flex-wrap mb-1.5">
          {c.badge && <span className="text-[10px] font-black px-2 py-0.5 rounded-full bg-amber-500/20 text-amber-300">{c.badge}</span>}
          {c.rating != null && <span className="text-[11px] font-black px-2 py-0.5 rounded-full" style={{ background: 'rgba(251,191,36,.15)', color: '#fbbf24' }}>⭐ {c.rating.toFixed(1)}</span>}
          {c.time && <span className="text-[10px] font-black px-2 py-0.5 rounded-full bg-white/10 text-white/70">{c.time}</span>}
          {c.isOpen === true && <span className="text-[10px] font-black px-2 py-0.5 rounded-full bg-emerald-500/20 text-emerald-300">Auki</span>}
        </div>
        <h2 className="font-black text-white text-2xl leading-tight" style={{ letterSpacing: '-0.02em' }}>{c.title}</h2>
        {c.why && <p className="text-white/70 text-sm mt-1.5 leading-snug line-clamp-3">{c.why}</p>}
        {c.address && <p className="text-white/40 text-xs font-bold mt-1.5">📍 {c.address}</p>}
      </div>
    </div>
  )
}

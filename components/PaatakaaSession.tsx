'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import Link from 'next/link'
import SwipeDeck from '@/components/SwipeDeck'
import CandidateSheet from '@/components/CandidateSheet'
import GroupResultView from '@/components/GroupResultView'
import type { Candidate } from '@/lib/candidate'
import { ROLE_META } from '@/lib/candidate'
import type { GroupSession } from '@/lib/group'
import { GROUP_WHEN_LABELS, FIILIS_LABELS } from '@/lib/group'

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
  const [sheet, setSheet] = useState<Candidate | null>(null)      // napautettu kortti (detail sheet)
  const [pushOn, setPushOn] = useState(false)
  const [pushBusy, setPushBusy] = useState(false)
  const [actionBusy, setActionBusy] = useState(false)             // regenerate/rematch menossa
  const [swappingIdx, setSwappingIdx] = useState<number | null>(null)
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
      setPushOn(localStorage.getItem(`paatakaa-push-${code}`) === '1')
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

      // REMATCH-havainto: kierrosnumero vaihtui → nollaa paikallinen äänestysmuisti
      // (voted-setti on kierroskohtainen; serveri on jo poistanut äänet kannasta).
      try {
        const roundKey = `paatakaa-round-${code}`
        const stored = Number(localStorage.getItem(roundKey) || '0')
        if (data.round && data.round !== stored) {
          localStorage.setItem(roundKey, String(data.round))
          if (stored !== 0) { // eka lataus ei ole rematch
            votedRef.current = new Set()
            setInitialVoted(new Set())
            setSwipedCount(0)
            localStorage.removeItem(`paatakaa-voted-${code}`)
          }
        }
      } catch { /* privaattitila — round-nollaus ei toimi, ei kriittistä */ }

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

  // ↩️ Peruuta edellinen swaippi: poista ääni serveriltä + paikallisesta muistista.
  const undo = useCallback((card: Candidate) => {
    votedRef.current.delete(card.id)
    try { localStorage.setItem(`paatakaa-voted-${code}`, JSON.stringify([...votedRef.current])) } catch { /* ignore */ }
    setSwipedCount(c => Math.max(0, c - 1))
    fetch(`/api/group/${code}/vote`, {
      method: 'DELETE', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ voterId: voter.id, cardId: card.id }),
    }).then(() => refresh()).catch(() => {})
  }, [code, voter.id, refresh])

  const synthesize = useCallback(async (regenerate = false) => {
    setSynthesizing(true); setError(null)
    try {
      const res = await fetch(`/api/group/${code}/synthesize`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ hostId: voter.id, regenerate }),
      })
      const data = await res.json().catch(() => ({}))
      // 202 = joku kutoo jo → ei virhe, pollaus hakee tuloksen. res.ok kattaa 202:n.
      if (!res.ok) { setError(data.error || 'Kutominen epäonnistui'); setSynthesizing(false); return }
      await refresh()
    } catch { setError('Verkkovirhe kutomisessa') }
    setSynthesizing(false)
  }, [code, refresh, voter.id])

  // 🔀 Vaihda askel (deterministinen, ei AI:ta) — palauttaa koko päivitetyn kaaren.
  const swap = useCallback(async (stepIndex: number) => {
    setSwappingIdx(stepIndex)
    try {
      const res = await fetch(`/api/group/${code}/swap`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ hostId: voter.id, stepIndex }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) { setError(data.error || 'Vaihto epäonnistui'); return }
      if (data.plan && session) setSession({ ...session, resultPlan: data.plan })
      await refresh()
    } catch { setError('Verkkovirhe vaihdossa') }
    setSwappingIdx(null)
  }, [code, voter.id, session, refresh])

  // 🔁 Jatka samalla porukalla — uusi pakka, äänet nollaantuvat (round-bump).
  const rematch = useCallback(async () => {
    setActionBusy(true)
    try {
      const res = await fetch(`/api/group/${code}/rematch`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ hostId: voter.id }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) { setError(data.error || 'Uusi kierros epäonnistui'); setActionBusy(false); return }
      await refresh() // round-havainto nollaa paikallisen äänestysmuistin
    } catch { setError('Verkkovirhe uudessa kierroksessa') }
    setActionBusy(false)
  }, [code, voter.id, refresh])

  // 🔔 Ilmoita kun tulos valmis — sessiokohtainen push-tilaus.
  const togglePush = useCallback(async () => {
    if (typeof window === 'undefined' || !('serviceWorker' in navigator) || !('PushManager' in window)) return
    setPushBusy(true)
    try {
      const reg = await navigator.serviceWorker.ready
      if (pushOn) {
        const existing = await reg.pushManager.getSubscription()
        if (existing) {
          await fetch(`/api/group/${code}/push-subscribe`, {
            method: 'DELETE', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ endpoint: existing.endpoint }),
          }).catch(() => {})
          await existing.unsubscribe().catch(() => {})
        }
        setPushOn(false)
        try { localStorage.removeItem(`paatakaa-push-${code}`) } catch { /* ignore */ }
        return
      }
      const permission = await Notification.requestPermission()
      if (permission !== 'granted') return
      const existing = await reg.pushManager.getSubscription()
      const sub = existing ?? await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY,
      })
      const j = sub.toJSON()
      const res = await fetch(`/api/group/${code}/push-subscribe`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ voterId: voter.id, endpoint: j.endpoint, keys: j.keys }),
      })
      if (res.ok) {
        setPushOn(true)
        try { localStorage.setItem(`paatakaa-push-${code}`, '1') } catch { /* ignore */ }
      }
    } finally {
      setPushBusy(false)
    }
  }, [code, pushOn, voter.id])

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
  // Ryhmän top-tykätyt (näytetään VASTA kun omat swaippaukset tehty — ei bandwagon-biasta).
  const topLoved = useMemo(() => {
    if (!session) return []
    return session.candidates
      .map(c => ({ c, v: session.votes[c.id] }))
      .filter((x): x is { c: Candidate; v: { love: number; skip: number } } => !!x.v && x.v.love > 0 && x.v.love >= x.v.skip)
      .sort((a, b) => b.v.love - a.v.love || b.c._score - a.c._score)
      .slice(0, 6)
  }, [session])
  const isHost = !!session && (!session.hostId || session.hostId === voter.id)
  const allDone = !!session && session.participants.length > 0 && session.participants.every(p => p.done)

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

  // ── TULOS: PIKAPÄÄTÖS (enemmistö valitsi voittajan) ──
  if (session.status === 'done' && session.resultPlan?.kind === 'quick') {
    const plan = session.resultPlan
    const cta = plan.url ? (plan.role === 'program' ? 'Liput / lisätiedot →' : 'Verkkosivu →') : null
    return (
      <main className="max-w-lg mx-auto px-4 pt-8 pb-24 space-y-5">
        <div className="text-center">
          <p className="text-white/30 text-[11px] font-black uppercase tracking-[.2em] mb-1">PÄÄTÖS · {code}</p>
          <p className="text-6xl mb-2">🎉</p>
          <h1 className="font-black text-white leading-tight" style={{ fontSize: 'clamp(1.6rem,6vw,2.3rem)', letterSpacing: '-0.03em' }}>Päätös tehty!</h1>
          <p className="text-white/60 text-[15px] font-semibold mt-2">{plan.intro}</p>
          {plan.votesFor != null && plan.voterCount != null && (
            <p className="text-white/40 text-sm font-bold mt-1">Äänet {plan.votesFor}/{plan.voterCount} ❤️</p>
          )}
        </div>

        <div className="rounded-3xl overflow-hidden" style={{ background: 'rgba(255,255,255,.04)', border: '1px solid rgba(255,255,255,.1)' }}>
          {plan.image
            ? <div className="w-full" style={{ aspectRatio: '16/9' }}><img src={plan.image} alt={plan.title} className="w-full h-full object-cover" /></div>
            : <div className="w-full flex items-center justify-center text-7xl py-10" style={{ background: 'linear-gradient(150deg,#1e1e28,#12121a)' }}>{plan.emoji}</div>}
          <div className="p-5 space-y-2">
            <div className="flex items-center gap-2 flex-wrap">
              {plan.badge && <span className="text-[10px] font-black px-2 py-0.5 rounded-full bg-amber-500/20 text-amber-300">{plan.badge}</span>}
              {plan.rating != null && <span className="text-[11px] font-black" style={{ color: '#fbbf24' }}>⭐ {plan.rating.toFixed(1)}</span>}
              {plan.time && <span className="text-[10px] font-black px-2 py-0.5 rounded-full bg-white/10 text-white/70">{plan.time}</span>}
              {plan.isFree && <span className="text-[10px] font-black px-2 py-0.5 rounded-full bg-emerald-500/20 text-emerald-300">Ilmainen</span>}
            </div>
            <h2 className="font-black text-white text-2xl leading-tight">{plan.title}</h2>
            {plan.address && (
              <a href={`https://maps.google.com/?q=${encodeURIComponent(plan.address)}`} target="_blank" rel="noopener noreferrer"
                className="inline-block text-white/40 text-sm font-bold hover:text-white/70 transition-colors">📍 {plan.address} →</a>
            )}
            {cta && plan.url && (
              <a href={plan.url} target="_blank" rel="noopener noreferrer"
                className="block w-full rounded-2xl py-3.5 text-center text-white font-black mt-2"
                style={{ background: 'linear-gradient(150deg,#6b76ff,#5059e6)' }}>{cta}</a>
            )}
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <button onClick={share} className="rounded-2xl py-3.5 text-white font-black" style={{ background: 'linear-gradient(150deg,#6b76ff,#5059e6)' }}>Jaa 🔗</button>
          <Link href="/paatakaa" className="rounded-2xl py-3.5 text-center text-white/70 font-black" style={{ background: 'rgba(255,255,255,.08)' }}>Uusi päätös</Link>
          {isHost && (
            <button onClick={rematch} disabled={actionBusy}
              className="col-span-2 rounded-2xl py-3.5 font-black disabled:opacity-50"
              style={{ background: 'linear-gradient(150deg,#10b981,#059669)', color: '#fff' }}>
              {actionBusy ? '⏳ Kootaan pakkaa…' : '🔁 Jatka samalla porukalla'}
            </button>
          )}
        </div>
      </main>
    )
  }

  // ── TULOS: ILLAN KAARI (AI-synteesi) ──
  if (session.status === 'done' && session.resultPlan?.kind === 'arc') {
    return (
      <GroupResultView
        plan={session.resultPlan}
        code={code}
        isHost={isHost}
        busy={actionBusy || synthesizing}
        swappingIdx={swappingIdx}
        onSwap={swap}
        onRegenerate={() => { setActionBusy(true); synthesize(true).finally(() => setActionBusy(false)) }}
        onRematch={rematch}
        onShare={share}
      />
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
      {/* Sessiokonteksti näkyviin jo portilla: mitä ja milloin päätetään */}
      <div className="flex flex-wrap gap-1.5">
        <span className="text-[11px] font-black px-2.5 py-1 rounded-full text-white/70" style={{ background: 'rgba(107,118,255,.15)' }}>
          {session.mode === 'quick' ? '⚡ Pikapäätös' : '🗺 Illan kaari'}
        </span>
        <span className="text-[11px] font-black px-2.5 py-1 rounded-full text-white/70" style={{ background: 'rgba(255,255,255,.07)' }}>
          {GROUP_WHEN_LABELS[session.when].emoji} {GROUP_WHEN_LABELS[session.when].label}
        </span>
        {session.fiilis.map(f => (
          <span key={f} className="text-[11px] font-black px-2.5 py-1 rounded-full text-white/70" style={{ background: 'rgba(255,255,255,.07)' }}>
            {FIILIS_LABELS[f].emoji} {FIILIS_LABELS[f].label}
          </span>
        ))}
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
  const progressPct = deckCards.length ? Math.min(100, (swipedCount / deckCards.length) * 100) : 0

  return (
    <main className="max-w-lg mx-auto px-4 pt-5 pb-24">
      {/* Header: moodi + koodi, osallistujat, jako */}
      <div className="flex items-center justify-between mb-2">
        <div>
          <p className="text-white/30 text-[11px] font-black uppercase tracking-[.2em]">
            {session.mode === 'quick' ? '⚡ PIKAPÄÄTÖS' : '🗺 ILLAN KAARI'} · KOODI {code}{session.round > 1 ? ` · KIERROS ${session.round}` : ''}
          </p>
          <p className="text-white/60 text-[13px] font-bold">
            {session.participants.length} mukana · {lovedCount} ❤️ tykättyä
          </p>
        </div>
        <div className="flex gap-2">
          <button onClick={togglePush} disabled={pushBusy} aria-label="Ilmoita kun tulos valmis"
            className="rounded-full px-3 py-2 text-sm font-black disabled:opacity-50"
            style={{ background: pushOn ? 'rgba(16,185,129,.2)' : 'rgba(255,255,255,.1)', color: pushOn ? '#34d399' : '#fff' }}>
            {pushOn ? '🔕' : '🔔'}
          </button>
          <a href={whatsappUrl} target="_blank" rel="noopener noreferrer" className="rounded-full px-3 py-2 text-sm font-black" style={{ background: 'rgba(37,211,102,.15)', color: '#25d366' }}>WhatsApp</a>
          <button onClick={share} className="rounded-full px-3 py-2 text-sm font-black text-white" style={{ background: 'rgba(255,255,255,.1)' }}>Jaa 🔗</button>
        </div>
      </div>

      {/* Sessiokonteksti: milloin + fiilis */}
      <div className="flex flex-wrap gap-1.5 mb-3">
        <span className="text-[11px] font-black px-2.5 py-1 rounded-full text-white/50" style={{ background: 'rgba(255,255,255,.05)' }}>
          {GROUP_WHEN_LABELS[session.when].emoji} {GROUP_WHEN_LABELS[session.when].label}
        </span>
        {session.fiilis.map(f => (
          <span key={f} className="text-[11px] font-black px-2.5 py-1 rounded-full text-white/50" style={{ background: 'rgba(255,255,255,.05)' }}>
            {FIILIS_LABELS[f].emoji} {FIILIS_LABELS[f].label}
          </span>
        ))}
      </div>

      {/* Osallistujat + valmistilat */}
      {session.participants.length > 0 && (
        <div className="flex flex-wrap gap-1.5 mb-4">
          {session.participants.map(p => (
            <span key={p.id} className="text-[11px] font-black px-2.5 py-1 rounded-full"
              style={{
                background: p.done ? 'rgba(16,185,129,.15)' : 'rgba(255,255,255,.07)',
                color: p.done ? '#34d399' : 'rgba(255,255,255,.7)',
              }}>
              {p.id === voter.id ? `${p.name} (sinä)` : p.name} {p.done ? '✅' : `${p.swiped}/${session.deckSize}`}
            </span>
          ))}
        </div>
      )}

      {!doneSwiping ? (
        <>
          {/* Edistymispalkki */}
          <div className="flex items-center gap-2 mb-3">
            <div className="flex-1 h-1.5 rounded-full overflow-hidden" style={{ background: 'rgba(255,255,255,.08)' }}>
              <div className="h-full rounded-full transition-all duration-300" style={{ width: `${progressPct}%`, background: 'linear-gradient(90deg,#6b76ff,#5059e6)' }} />
            </div>
            <span className="text-white/40 text-[11px] font-black whitespace-nowrap">
              {Math.min(swipedCount + 1, deckCards.length)}/{deckCards.length}
            </span>
          </div>

          <SwipeDeck<Candidate>
            key={session.round}
            cards={deckCards}
            onSwipeRight={c => vote(c, 'love')}
            onSwipeLeft={c => vote(c, 'skip')}
            onTap={c => setSheet(c)}
            onUndo={undo}
            renderCard={(c, drag) => <CandidateCard c={c} drag={drag} />}
          />
          <p className="text-center text-white/25 text-[11px] font-bold mt-3">Napauta korttia nähdäksesi lisätiedot</p>
        </>
      ) : (
        <div className="space-y-4">
          <div className="rounded-3xl p-6 text-center space-y-3" style={{ background: 'rgba(255,255,255,.04)', border: '1px solid rgba(255,255,255,.08)' }}>
            <p className="text-4xl">✅</p>
            <p className="text-white font-black text-lg">Kiitos, äänesi on tallessa!</p>
            {allDone ? (
              <p className="text-emerald-300 font-black text-sm">🎉 Kaikki ovat valmiita — kaari voidaan kutoa!</p>
            ) : (
              <p className="text-white/50 font-semibold text-sm">
                {session.mode === 'quick'
                  ? '⚡ Voittaja ratkeaa heti kun enemmistö tykkää samasta — odota hetki.'
                  : 'Odota että muut swaippaavat — tai kutokaa kaari kun olette valmiita.'}
              </p>
            )}
          </div>

          {/* Ryhmän tilanne — top-tykätyt näkyviin vasta kun omat äänet annettu */}
          {topLoved.length > 0 && (
            <div className="rounded-3xl p-5 space-y-2.5" style={{ background: 'rgba(255,255,255,.03)', border: '1px solid rgba(255,255,255,.07)' }}>
              <p className="text-white/40 text-[11px] font-black uppercase tracking-wide">Ryhmän suosikit nyt</p>
              {topLoved.map(({ c, v }, i) => (
                <div key={c.id} className="flex items-center gap-3">
                  <span className="text-white/25 text-xs font-black w-4">{i + 1}.</span>
                  <span className="text-lg leading-none">{c.emoji}</span>
                  <span className="flex-1 text-white/80 text-sm font-bold truncate">{c.title}</span>
                  <span className="text-[12px] font-black" style={{ color: '#34d399' }}>{v.love} ❤️</span>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Kutominen — vain arc-moodi (quick ratkeaa äänistä automaattisesti).
          Näyttää "kutoo" myös kun serverin status on 'synthesizing'. */}
      {session.mode === 'arc' && isHost && lovedCount >= 1 && (
        <button onClick={() => synthesize()} disabled={isSynthesizing}
          className={`w-full rounded-2xl py-4 mt-5 text-white font-black text-[16px] disabled:opacity-70 ${allDone && !isSynthesizing ? 'animate-pulse' : ''}`}
          style={{ background: 'linear-gradient(150deg,#10b981,#059669)', boxShadow: '0 12px 28px -10px rgba(16,185,129,.6)' }}>
          {isSynthesizing ? '🪄 AI kutoo kaarta…' : allDone ? `🎉 Kaikki valmiita — kutokaa kaari (${lovedCount} ❤️)` : `🪄 Kutokaa illan kaari (${lovedCount} ❤️)`}
        </button>
      )}
      {session.mode === 'arc' && isSynthesizing && <p className="text-white/40 text-center text-sm font-bold mt-3">AI punoo tykätyistä johdonmukaisen illan… hetki.</p>}
      {session.mode === 'arc' && !isHost && lovedCount >= 1 && !isSynthesizing && (
        <p className="text-white/35 text-center text-[13px] font-bold mt-5">Aloittaja kutoo kaaren kun ryhmä on valmis.</p>
      )}

      {/* Kortin detail sheet (napautus) */}
      {sheet && <CandidateSheet c={sheet} onClose={() => setSheet(null)} />}
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
          {c.priceLevel != null && <span className="text-[10px] font-black px-2 py-0.5 rounded-full bg-white/10 text-white/60">{'€'.repeat(Math.min(4, c.priceLevel))}</span>}
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

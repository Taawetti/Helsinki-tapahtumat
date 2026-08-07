'use client'

import { useEffect, useMemo, useState } from 'react'
import dynamic from 'next/dynamic'
import Link from 'next/link'
import type { GroupArcPlan, PlanStep } from '@/lib/group'
import { roleLabel } from '@/lib/group'
import { isOpenAt } from '@/lib/opening-hours'

// PlannerMap lataa leafletin dynaamisesti — ei SSR:ää.
const PlannerMap = dynamic(() => import('@/components/PlannerMap'), { ssr: false })

// "Auki kaaren ajankohtana": true = auki, false = kiinni silloin, null = ei tietoa
function openAtStepTime(step: PlanStep, date?: string): boolean | null {
  if (!step.openingHours || !step.time || !date) return null
  const m = step.time.match(/(\d{1,2})[.:](\d{2})/)
  if (!m) return null
  const [y, mo, d] = date.split('-').map(Number)
  const open = isOpenAt(step.openingHours, new Date(y, mo - 1, d, Number(m[1]), Number(m[2])))
  return open === undefined ? null : open
}

// "klo 19.30" / "to 19.00" → tunteina; null jos ei aikaa
function hourOf(step: PlanStep): number | null {
  const m = step.time?.match(/(\d{1,2})[.:](\d{2})/)
  return m ? Number(m[1]) + Number(m[2]) / 60 : null
}

// Roolikohtainen kestofallback vanhoille sessioille (durH puuttuu ennen M1:tä)
const FALLBACK_DUR: Record<string, number> = { activity: 2, food: 1.5, drinks: 1, program: 2 }

// Karkea hinta-arvio per vaihe per henkilö (€). Näytetään haarukkana —
// tarkoitus on ryhmän yhteinen odotus, ei laskun tarkkuus.
function stepCost(step: PlanStep): number {
  if (step.isFree) return 0
  if (step.priceLevel) return [0, 12, 25, 45, 90][Math.min(4, step.priceLevel)]
  switch (step.role) {
    case 'food': return 25
    case 'drinks': return 15
    case 'program': return 20
    default: return 10
  }
}

interface Props {
  plan: GroupArcPlan
  code: string
  isHost: boolean
  busy: boolean                 // joku toiminto (kutominen/rematch) menossa
  swappingIdx: number | null
  onSwap: (i: number) => void
  onRegenerate: () => void
  onRematch: () => void
  onShare: () => void
}

// Ryhmäpäätöksen tulos (M2): illan kaari aikajanana — vaiheet kellonaikoineen,
// todelliset siirtymät ja puskurit näkyvissä, budjettiarvio ja TÄYSOSUMA-juhla.
export default function GroupResultView({
  plan, code, isHost, busy, swappingIdx, onSwap, onRegenerate, onRematch, onShare,
}: Props) {
  const mapItems = plan.arc
    .filter(s => s.lat != null && s.lon != null)
    .map(s => ({ title: s.title, location: s.address ?? '', coords: [s.lat!, s.lon!] as [number, number] }))

  // Budjettiarvio koko kaarelle (per henkilö, haarukka)
  const budget = useMemo(() => {
    const sum = plan.arc.reduce((acc, s) => acc + stepCost(s), 0)
    if (sum <= 0) return null
    const lo = Math.max(0, Math.round((sum * 0.8) / 5) * 5)
    const hi = Math.round((sum * 1.3) / 5) * 5
    return `~${lo}–${hi} €/hlö`
  }, [plan.arc])

  // TÄYSOSUMA-juhla: kerran per tulos (sessionStorage-muisti), kun koko porukka
  // on tykännyt vähintään yhdestä vaiheesta. Näytetään asynkronisesti
  // (setState vain timeout-callbackissa → ei hydration-/set-state-virhettä).
  const [celebrate, setCelebrate] = useState(false)
  useEffect(() => {
    if (!plan.arc.some(s => s.superMatch)) return
    try {
      if (sessionStorage.getItem(`paatakaa-celebrated-${code}`)) return
      sessionStorage.setItem(`paatakaa-celebrated-${code}`, '1')
    } catch { /* privaattitila — näytä silti */ }
    const t0 = setTimeout(() => setCelebrate(true), 60)
    const t1 = setTimeout(() => setCelebrate(false), 2460)
    return () => { clearTimeout(t0); clearTimeout(t1) }
  }, [code, plan.arc])

  const fmtDate = plan.date
    ? new Intl.DateTimeFormat('fi-FI', { timeZone: 'Europe/Helsinki', weekday: 'long', day: 'numeric', month: 'numeric' })
        .format(new Date(`${plan.date}T12:00:00`))
    : null

  return (
    <main className="max-w-lg mx-auto px-4 pt-6 pb-24 space-y-5">
      {/* TÄYSOSUMA-overlay (kerran) */}
      {celebrate && (
        <div className="fixed inset-0 z-50 flex items-center justify-center pointer-events-none"
          style={{ background: 'radial-gradient(ellipse at center, rgba(251,191,36,.18), transparent 65%)' }}>
          <div className="text-center" style={{ animation: 'paatakaa-pop .55s cubic-bezier(.2,1.6,.4,1) both' }}>
            <p className="text-7xl mb-2">🎉</p>
            <p className="font-black text-2xl text-amber-300 tracking-tight">TÄYSOSUMA!</p>
            <p className="text-white/70 font-bold text-sm mt-1">Koko porukka tykkäsi — tämä ilta on teidän.</p>
          </div>
        </div>
      )}
      <style jsx global>{`
        @keyframes paatakaa-pop {
          0% { transform: scale(.4); opacity: 0 }
          100% { transform: scale(1); opacity: 1 }
        }
      `}</style>

      {/* Hero */}
      <div>
        <p className="text-white/30 text-[11px] font-black uppercase tracking-[.2em] mb-1">PÄÄTÖS · {code}</p>
        <h1 className="font-black leading-tight"
          style={{
            fontSize: 'clamp(1.8rem,7vw,2.6rem)', letterSpacing: '-0.03em',
            background: 'linear-gradient(120deg,#fff 30%,#a3abff)', WebkitBackgroundClip: 'text', backgroundClip: 'text', color: 'transparent',
          }}>
          Teidän iltanne 🎉
        </h1>
        {plan.intro && <p className="text-white/60 text-[15px] font-semibold mt-2 leading-snug">{plan.intro}</p>}
        <div className="flex flex-wrap gap-1.5 mt-3">
          {fmtDate && (
            <span className="text-[11px] font-black px-2.5 py-1 rounded-full text-white/70" style={{ background: 'rgba(107,118,255,.15)' }}>
              📅 {fmtDate}
            </span>
          )}
          {budget && (
            <span className="text-[11px] font-black px-2.5 py-1 rounded-full text-white/70" style={{ background: 'rgba(16,185,129,.15)' }}>
              💶 Arvio {budget}
            </span>
          )}
          <span className="text-[11px] font-black px-2.5 py-1 rounded-full text-white/70" style={{ background: 'rgba(255,255,255,.07)' }}>
            {plan.arc.length} vaihetta
          </span>
        </div>
      </div>

      {/* Aikajana */}
      <div>
        {plan.arc.map((step, i) => {
          const meta = roleLabel(step.role)
          const cta = step.url
            ? step.role === 'program' ? 'Liput / lisätiedot →' : step.role === 'food' || step.role === 'drinks' ? 'Verkkosivu →' : 'Lisätiedot →'
            : null
          const openAt = openAtStepTime(step, plan.date)

          // Slack-laskenta edelliseen vaiheeseen (M1 takaa ≥ puskuri; vanhoilla
          // sessioilla durH voi puuttua → roolikohtainen fallback)
          let slackChip: { text: string; bg: string; fg: string } | null = null
          if (i > 0 && step.travelFromPrevMin != null) {
            const prev = plan.arc[i - 1]
            const prevH = hourOf(prev)
            const thisH = hourOf(step)
            if (prevH != null && thisH != null) {
              const durH = prev.durH ?? FALLBACK_DUR[prev.role] ?? 1.5
              const slack = thisH - (prevH + durH) - step.travelFromPrevMin / 60
              slackChip = slack >= 0.34
                ? { text: '✓ ehtää rauhassa', bg: 'rgba(16,185,129,.12)', fg: '#34d399' }
                : { text: '⚡ nopea siirtymä', bg: 'rgba(251,191,36,.12)', fg: '#fbbf24' }
            }
          }

          return (
            <div key={`${step.cardId ?? i}-${i}`} className="flex gap-3">
              {/* Aikajana-kisko: kellonaika + piste + viiva */}
              <div className="flex flex-col items-center w-11 shrink-0 pt-1">
                <span className="text-[12px] font-black text-white/80 whitespace-nowrap">
                  {step.time?.replace(/^klo /, '') ?? ''}
                </span>
                <span className="my-1.5 rounded-full"
                  style={{
                    width: 9, height: 9,
                    background: step.superMatch ? '#fbbf24' : '#6b76ff',
                    boxShadow: `0 0 12px ${step.superMatch ? 'rgba(251,191,36,.8)' : 'rgba(107,118,255,.8)'}`,
                  }} />
                {i < plan.arc.length - 1 && <span className="flex-1 w-px" style={{ background: 'rgba(255,255,255,.12)' }} />}
              </div>

              {/* Siirtymä + kortti */}
              <div className="flex-1 min-w-0 pb-5">
                {step.travelFromPrevMin != null && (
                  <div className="flex items-center gap-1.5 flex-wrap py-1.5">
                    {step.travelFromPrevMode === 'transit' ? (
                      <>
                        <span className="text-[11px] font-black px-2 py-0.5 rounded-full text-white/50" style={{ background: 'rgba(255,255,255,.05)' }}>
                          {step.travelFromPrevSummary ?? `🚶 ${step.travelFromPrevMin} min kävelyllä`}
                        </span>
                        {step.travelFromPrevUrl && (
                          <a href={step.travelFromPrevUrl} target="_blank" rel="noopener noreferrer"
                            className="text-[11px] font-black px-2 py-0.5 rounded-full"
                            style={{ background: 'rgba(107,118,255,.15)', color: '#a3abff' }}>
                            🚋 Reittiopas →
                          </a>
                        )}
                      </>
                    ) : (
                      <span className="text-[11px] font-black px-2 py-0.5 rounded-full text-white/50" style={{ background: 'rgba(255,255,255,.05)' }}>
                        🚶 {step.travelFromPrevMin} min
                      </span>
                    )}
                    {slackChip && (
                      <span className="text-[10px] font-black px-2 py-0.5 rounded-full" style={{ background: slackChip.bg, color: slackChip.fg }}>
                        {slackChip.text}
                      </span>
                    )}
                  </div>
                )}

                <div className="rounded-3xl overflow-hidden"
                  style={{
                    background: 'rgba(255,255,255,.045)',
                    border: `1px solid ${step.superMatch ? 'rgba(251,191,36,.35)' : 'rgba(255,255,255,.09)'}`,
                    boxShadow: step.superMatch ? '0 8px 32px -12px rgba(251,191,36,.25)' : '0 8px 32px -16px rgba(0,0,0,.6)',
                  }}>
                  {step.image && (
                    <div className="w-full" style={{ aspectRatio: '16/8' }}>
                      <img src={step.image} alt={step.title} className="w-full h-full object-cover" />
                    </div>
                  )}
                  <div className="p-4">
                    <div className="flex items-center gap-2 mb-1 flex-wrap">
                      <span className="text-lg">{step.emoji}</span>
                      <span className="text-white/40 text-[11px] font-black uppercase tracking-wide">
                        {i + 1}. vaihe · {meta.label}{step.time ? ` · ${step.time}` : ''}
                      </span>
                      {step.superMatch && (
                        <span className="text-[10px] font-black px-2 py-0.5 rounded-full bg-amber-500/20 text-amber-300">
                          🎉 TÄYSOSUMA
                        </span>
                      )}
                      {openAt === true && (
                        <span className="text-[10px] font-black px-2 py-0.5 rounded-full bg-emerald-500/20 text-emerald-300">
                          Auki ✓
                        </span>
                      )}
                    </div>
                    <h3 className="font-black text-white text-[17px] leading-tight">{step.title}</h3>
                    <div className="flex items-center gap-2 flex-wrap mt-1">
                      {step.rating != null && <span className="text-[11px] font-black" style={{ color: '#fbbf24' }}>⭐ {step.rating.toFixed(1)}</span>}
                      {step.badge && <span className="text-[10px] font-black px-2 py-0.5 rounded-full bg-amber-500/20 text-amber-300">{step.badge}</span>}
                      {step.isFree && <span className="text-[10px] font-black px-2 py-0.5 rounded-full bg-emerald-500/20 text-emerald-300">Ilmainen</span>}
                      {step.priceLevel != null && <span className="text-[11px] font-black text-white/50">{'€'.repeat(Math.min(4, step.priceLevel))}</span>}
                    </div>
                    {step.why && <p className="text-white/60 text-sm mt-1.5 leading-snug">{step.why}</p>}
                    {step.address && (
                      <a href={`https://maps.google.com/?q=${encodeURIComponent(step.address)}`} target="_blank" rel="noopener noreferrer"
                        className="inline-block text-white/40 text-xs font-bold mt-1.5 hover:text-white/70 transition-colors">
                        📍 {step.address} →
                      </a>
                    )}
                    <div className="flex items-center gap-3 mt-2.5">
                      {cta && step.url && (
                        <a href={step.url} target="_blank" rel="noopener noreferrer"
                          className="inline-block text-[#8b93ff] text-xs font-black">{cta}</a>
                      )}
                      {isHost && (
                        <button onClick={() => onSwap(i)} disabled={busy || swappingIdx !== null}
                          className="text-white/40 text-xs font-black hover:text-white/80 transition-colors disabled:opacity-40">
                          {swappingIdx === i ? '⏳ Vaihdetaan…' : '🔀 Vaihda askel'}
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            </div>
          )
        })}
      </div>

      {/* Koko kaaren kartta */}
      {mapItems.length >= 2 && (
        <div className="rounded-2xl overflow-hidden" style={{ border: '1px solid rgba(255,255,255,.08)' }}>
          <PlannerMap items={mapItems} />
        </div>
      )}

      {plan.outro && <p className="text-white/60 text-[15px] font-semibold leading-snug">{plan.outro}</p>}

      <div className="grid grid-cols-2 gap-3">
        <button onClick={onShare}
          className="rounded-2xl py-3.5 text-white font-black"
          style={{ background: 'linear-gradient(150deg,#6b76ff,#5059e6)' }}>
          Jaa 🔗
        </button>
        <Link href="/paatakaa"
          className="rounded-2xl py-3.5 text-center text-white/70 font-black"
          style={{ background: 'rgba(255,255,255,.08)' }}>
          Uusi päätös
        </Link>
        {isHost && (
          <>
            <button onClick={onRegenerate} disabled={busy}
              className="rounded-2xl py-3.5 text-white/80 font-black disabled:opacity-50"
              style={{ background: 'rgba(255,255,255,.08)' }}>
              {busy ? '🪄 Kudotaan…' : '🔄 Kudo uudelleen'}
            </button>
            <button onClick={onRematch} disabled={busy}
              className="rounded-2xl py-3.5 font-black disabled:opacity-50"
              style={{ background: 'linear-gradient(150deg,#10b981,#059669)', color: '#fff' }}>
              🔁 Jatka samalla porukalla
            </button>
          </>
        )}
      </div>
    </main>
  )
}

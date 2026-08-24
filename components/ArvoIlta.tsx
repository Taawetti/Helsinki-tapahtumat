'use client'

// 🎰 ARVO VALMIS ILTA — Idea-välilehden arvontakone (Päättäkää yhdessä
// -sivun seuraaja, omistajan linjaus: ryhmääänestys oli liian raskas, mutta
// kaavakone on kultaa). Yksi painallus → koko illan suunnitelma HETI:
// sama testattu kaarimoottori kuin ryhmäversiossa (aukiolot suunnitellulle
// hetkelle, oikeat keikka-ajat ankkureina, kävelyajat, yön raja) — mutta
// ilman linkkejä, sessioita ja odottelua. Jaa-nappi lähettää VALMIIN
// suunnitelman WhatsAppiin — päätös tapahtuu ryhmächatissa, ei täällä.

import { useCallback, useEffect, useRef, useState } from 'react'
import { X, MapPin, Navigation, MessageCircle, Copy, Check, Dices } from 'lucide-react'
import { ARCS, type ThemeArc } from '@/components/ThemeArcs'
import { planShareText } from '@/lib/arvo-ilta'
import type { GroupArcPlan, PlanStep } from '@/lib/group'

type WhenChoice = 'tonight' | 'weekend'

interface ApiResponse {
  plan: GroupArcPlan | null
  date: string
  reason: 'too-late' | 'no-arc' | 'empty-deck' | null
}

const WHEN_LABEL: Record<WhenChoice, string> = { tonight: '🌙 Tänä iltana', weekend: '🗓 Viikonloppuna' }

function fiDateLabel(iso: string): string {
  const d = new Date(`${iso}T12:00:00Z`)
  const wd = ['su', 'ma', 'ti', 'ke', 'to', 'pe', 'la'][d.getUTCDay()]
  return `${wd} ${d.getUTCDate()}.${d.getUTCMonth() + 1}.`
}

// ── Pysäkkirivi ─────────────────────────────────────────────────────────────

function StepRow({ step, onReroll, rerolling }: {
  step: PlanStep
  onReroll: () => void
  rerolling: boolean
}) {
  return (
    <>
      {typeof step.travelFromPrevMin === 'number' && step.travelFromPrevMin > 0 && (
        <li className="flex items-center gap-2 pl-6 text-[12px] text-white/35">
          {step.travelFromPrevMode === 'transit' ? '🚌' : '🚶'} ~{step.travelFromPrevMin} min
          {step.travelFromPrevMode === 'transit' && step.travelFromPrevUrl && (
            <a href={step.travelFromPrevUrl} target="_blank" rel="noopener"
              className="text-[#7aa7ff] hover:text-white transition-colors">Reittiopas ↗</a>
          )}
        </li>
      )}
      <li className="rounded-xl p-3.5 flex gap-3"
        style={{ background: 'rgba(255,255,255,.04)', border: '1px solid rgba(255,255,255,.07)' }}>
        <div className="shrink-0 w-14 text-center">
          <p className="text-[13px] font-black" style={{ color: '#a3abff' }}>{step.time ?? ''}</p>
          <p className="text-2xl leading-tight mt-0.5">{step.emoji}</p>
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-start justify-between gap-2">
            <p className="font-bold text-white text-[14.5px] leading-snug">
              {step.url ? (
                <a href={step.url} target="_blank" rel="noopener" className="hover:text-blue-300 transition-colors">{step.title} ↗</a>
              ) : step.title}
            </p>
            {/* Pysäkin uudelleenarvonta: vaihtaa VAIN tämän pysäkin */}
            <button onClick={onReroll} disabled={rerolling}
              aria-label={`Arvo tilalle toinen: ${step.title}`}
              className="shrink-0 p-1.5 rounded-lg text-white/40 hover:text-white transition-colors disabled:opacity-40"
              style={{ background: 'rgba(255,255,255,.06)' }}>
              <Dices size={15} className={rerolling ? 'animate-spin' : ''} />
            </button>
          </div>
          {step.why && <p className="text-[12.5px] text-white/55 leading-snug mt-0.5">{step.why}</p>}
          <p className="text-[11.5px] text-white/35 mt-1 flex items-center gap-1 flex-wrap">
            {step.isFree && <span className="text-emerald-400 font-bold">maksuton · </span>}
            {step.address && (<><MapPin size={10} className="inline shrink-0" /> {step.address}</>)}
            {step.lat && step.lon && (
              <a href={`https://maps.google.com/maps?daddr=${step.lat},${step.lon}&travelmode=transit`}
                target="_blank" rel="noopener" className="hover:text-white/70 transition-colors">
                · <Navigation size={10} className="inline" /> reitti ↗
              </a>
            )}
          </p>
        </div>
      </li>
    </>
  )
}

// ── Pääkomponentti: kaavachipit + suunnitelmapaneeli ────────────────────────

export default function ArvoIlta() {
  const [formula, setFormula] = useState<ThemeArc | null>(null)
  const [when, setWhen] = useState<WhenChoice>('tonight')
  const [variant, setVariant] = useState(0)
  const [excluded, setExcluded] = useState<string[]>([])
  const [rerollingId, setRerollingId] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [result, setResult] = useState<ApiResponse | null>(null)
  const [error, setError] = useState(false)
  const [copied, setCopied] = useState(false)
  // Pysäkkikohtainen ilmoitus ("ei löytynyt korvaajaa") — ei kaada suunnitelmaa.
  const [note, setNote] = useState<string | null>(null)
  // KILPAILUTILANNESUOJA: vain uusimman pyynnön vastaus saa kirjoittaa tilaa.
  // Ilman tätä hidas "tänä iltana" -vastaus yliajaisi nopean viikonloppu-
  // vastauksen ja paneeli näyttäisi VÄÄRÄN PÄIVÄN suunnitelman (mitattu
  // vastakkaistarkastuksessa) — juuri se mitä ei saa tapahtua.
  const reqSeq = useRef(0)

  const roll = useCallback(async (arc: ThemeArc, w: WhenChoice, v: number, ex: string[], keepDate?: string) => {
    const my = ++reqSeq.current
    const isReroll = ex.length > 0
    setLoading(!isReroll)
    setError(false)
    setNote(null)
    try {
      const res = await fetch('/api/arvo-ilta', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          formulaId: arc.id,
          scenes: arc.preset.scenes,
          budget: arc.preset.budget,
          when: w,
          maxSteps: Math.min(4, Math.max(2, arc.preset.scenes.length)),
          variant: v,
          excludeIds: ex,
          // Pysäkkiarvonta pysyy näkyvän suunnitelman päivässä myös keskiyön yli.
          date: keepDate,
        }),
      })
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      const json = await res.json() as ApiResponse
      if (my !== reqSeq.current) return   // vanhentunut vastaus — uudempi pyyntö voitti
      if (isReroll && !json.plan) {
        // Pysäkille ei löytynyt korvaajaa — SÄILYTÄ toimiva suunnitelma,
        // peru poissulku ja kerro syy. Koko suunnitelman hylkääminen
        // "ilta on liian pitkällä" -viestillä olisi väärä väite.
        setExcluded((prev) => prev.slice(0, -1))
        setNote('Tälle pysäkille ei löytynyt korvaajaa — muut vaihtoehdot ovat joko kiinni tai eivät ehdi aikatauluun.')
        return
      }
      setResult(json)
    } catch {
      if (my !== reqSeq.current) return
      if (isReroll) {
        // Verkkovirhe pysäkkiarvonnassa: peru poissulku, säilytä suunnitelma.
        setExcluded((prev) => prev.slice(0, -1))
        setNote('Arvonta epäonnistui — kokeile hetken päästä uudelleen.')
      } else {
        setError(true)
      }
    } finally {
      if (my === reqSeq.current) {
        setLoading(false)
        setRerollingId(null)
      }
    }
  }, [])

  const start = useCallback((arc: ThemeArc) => {
    // Kaavan oma esivalinta: viikonloppukaava (Ulkoilupäivä) avautuu
    // viikonlopulle, muut tälle illalle. 'day' pyöristyy iltaan — arvonta on
    // illan työkalu; koko päivän suunnittelu kuuluu viikonloppuun.
    const w: WhenChoice = arc.preset.when === 'weekend' ? 'weekend' : 'tonight'
    setFormula(arc)
    setWhen(w)
    setVariant(0)
    setExcluded([])
    setResult(null)
    roll(arc, w, 0, [])
  }, [roll])

  const changeWhen = useCallback((w: WhenChoice) => {
    if (!formula) return
    setWhen(w); setVariant(0); setExcluded([]); setResult(null)
    roll(formula, w, 0, [])
  }, [formula, roll])

  const rerollAll = useCallback(() => {
    if (!formula) return
    const v = (variant + 1) % 31          // palvelimen variant-katto on 30
    setVariant(v); setExcluded([]); setResult(null)
    roll(formula, when, v, [], result?.date)
  }, [formula, when, variant, roll, result])

  const rerollStep = useCallback((cardId: string) => {
    if (!formula || rerollingId) return   // yksi pysäkkiarvonta kerrallaan
    const ex = [...excluded, cardId]
    setExcluded(ex)
    setRerollingId(cardId)
    roll(formula, when, variant, ex, result?.date)
  }, [formula, when, variant, excluded, roll, rerollingId, result])

  const close = useCallback(() => {
    reqSeq.current++            // lennossa oleva vastaus ei saa avata paneelia uudelleen
    setFormula(null); setResult(null); setNote(null); setRerollingId(null); setLoading(false)
  }, [])

  useEffect(() => {
    if (!formula) return
    const esc = (e: KeyboardEvent) => { if (e.key === 'Escape') close() }
    document.addEventListener('keydown', esc)
    return () => document.removeEventListener('keydown', esc)
  }, [formula, close])

  const plan = result?.plan ?? null
  const shareText = plan && result ? planShareText(plan, fiDateLabel(result.date)) : ''

  return (
    <>
      {/* Kaavachipit — vaakascrollattava rivi */}
      <section className="mt-2">
        <div className="flex items-baseline gap-2 mb-2">
          <h2 className="font-black text-white text-[15px]" style={{ letterSpacing: '-0.01em' }}>🎰 Arvo valmis ilta</h2>
          <span className="text-[11px] text-white/35 font-medium">koko suunnitelma yhdellä painalluksella</span>
        </div>
        <div className="flex gap-2 overflow-x-auto scrollbar-none -mx-4 px-4 pb-1">
          {ARCS.map((a) => (
            <button key={a.id} onClick={() => start(a)}
              className="shrink-0 rounded-2xl px-3.5 py-2.5 text-left transition-transform active:scale-95"
              style={{ background: a.gradient, minWidth: 148 }}>
              <p className="text-[15px] leading-none">{a.emoji}</p>
              <p className="text-[12.5px] font-black text-white mt-1 leading-tight">{a.name}</p>
            </button>
          ))}
        </div>
      </section>

      {/* Suunnitelmapaneeli */}
      {formula && (
        <>
          <div className="fixed inset-0 z-40 bg-black/60" onClick={close} aria-hidden />
          <div role="dialog" aria-modal aria-label={formula.name}
            className="fixed inset-x-0 bottom-0 z-50 rounded-t-3xl overflow-hidden md:inset-x-auto md:right-0 md:top-0 md:bottom-0 md:rounded-none md:w-full md:max-w-lg">
            <div className="h-[92dvh] overflow-y-auto bg-[#0e1117] shadow-2xl md:h-full">
              <div className="md:hidden flex justify-center pt-3 pb-1">
                <div className="w-10 h-1 rounded-full bg-white/20" />
              </div>

              <div className="p-5 space-y-4">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="text-[11px] font-black uppercase tracking-[.12em] text-white/40">{formula.emoji} {formula.name}</p>
                    <h2 className="text-xl font-black text-white mt-0.5" style={{ letterSpacing: '-0.02em' }}>
                      {result ? fiDateLabel(result.date) : '…'}
                    </h2>
                  </div>
                  <button onClick={close} aria-label="Sulje"
                    className="p-2 bg-white/6 hover:bg-white/12 rounded-full text-white transition-colors">
                    <X size={16} />
                  </button>
                </div>

                {/* Milloin */}
                <div className="flex gap-2">
                  {(['tonight', 'weekend'] as WhenChoice[]).map((w) => (
                    <button key={w} onClick={() => changeWhen(w)}
                      className="text-[12px] font-bold px-3 py-1.5 rounded-full transition-colors"
                      style={when === w
                        ? { background: 'rgba(107,118,255,.25)', color: '#c7ccff', border: '1px solid rgba(107,118,255,.4)' }
                        : { background: 'rgba(255,255,255,.05)', color: 'rgba(255,255,255,.5)', border: '1px solid rgba(255,255,255,.08)' }}>
                      {WHEN_LABEL[w]}
                    </button>
                  ))}
                </div>

                {/* Sisältö */}
                {loading && (
                  <div className="space-y-2 py-2">
                    {[0, 1, 2].map((i) => <div key={i} className="rounded-xl skeleton-shimmer" style={{ height: 92 }} />)}
                    <p className="text-white/40 text-[13px] text-center pt-2">Arvotaan iltaa — aukiolot ja aikataulut tarkistetaan…</p>
                  </div>
                )}
                {error && (
                  <p className="text-white/50 text-sm py-6 text-center">Arvonta epäonnistui — kokeile hetken päästä uudelleen.</p>
                )}
                {!loading && !error && result && !plan && (
                  <div className="text-center py-6 space-y-3">
                    <p className="text-4xl">🌙</p>
                    <p className="text-white/60 text-sm leading-relaxed px-4">
                      {result.reason === 'too-late'
                        ? 'Ilta on jo niin pitkällä, ettei ehjää suunnitelmaa synny — paikat ehtivät kiinni.'
                        : 'Tälle päivälle ei löytynyt toteutettavaa yhdistelmää.'}
                    </p>
                    {when === 'tonight' && (
                      <button onClick={() => changeWhen('weekend')}
                        className="text-[13px] font-bold px-4 py-2.5 rounded-full text-white transition-transform active:scale-95"
                        style={{ background: 'linear-gradient(150deg,#6b76ff,#5059e6)' }}>
                        🗓 Arvo viikonlopulle
                      </button>
                    )}
                  </div>
                )}
                {!loading && plan && (
                  <>
                    {note && (
                      <p className="text-[12.5px] rounded-lg px-3 py-2 leading-snug"
                        style={{ background: 'rgba(251,191,36,.1)', border: '1px solid rgba(251,191,36,.2)', color: '#fcd34d' }}>
                        {note}
                      </p>
                    )}
                    <p className="text-[13px] text-white/55 leading-snug">{plan.intro}</p>
                    <ul className="space-y-2">
                      {plan.arc.map((s) => (
                        <StepRow key={`${s.cardId ?? s.title}`} step={s}
                          rerolling={rerollingId !== null}
                          onReroll={() => s.cardId && rerollStep(s.cardId)} />
                      ))}
                    </ul>
                    {plan.outro && <p className="text-[12px] text-white/35">{plan.outro}</p>}

                    {/* Toiminnot */}
                    <div className="flex flex-col gap-2 pt-1">
                      <button onClick={rerollAll}
                        className="flex items-center justify-center gap-2 text-white font-bold text-sm py-3 rounded-xl transition-transform active:scale-[0.98]"
                        style={{ background: 'rgba(255,255,255,.07)', border: '1px solid rgba(255,255,255,.12)' }}>
                        <Dices size={15} /> Arvo koko ilta uudelleen
                      </button>
                      <div className="grid grid-cols-2 gap-2">
                        <button
                          onClick={() => window.open(`https://wa.me/?text=${encodeURIComponent(shareText)}`, '_blank')}
                          className="flex items-center justify-center gap-1.5 font-bold text-sm py-3 rounded-xl border transition-colors"
                          style={{ background: 'rgba(37,211,102,.1)', borderColor: 'rgba(37,211,102,.25)', color: '#4ade80' }}>
                          <MessageCircle size={15} /> WhatsApp
                        </button>
                        <button
                          onClick={() => { navigator.clipboard.writeText(shareText); setCopied(true); setTimeout(() => setCopied(false), 2000) }}
                          className={`flex items-center justify-center gap-1.5 font-bold text-sm py-3 rounded-xl border transition-all ${copied ? 'text-emerald-400' : 'text-white/60'}`}
                          style={{ background: 'rgba(255,255,255,.05)', borderColor: copied ? 'rgba(16,185,129,.4)' : 'rgba(255,255,255,.1)' }}>
                          {copied ? <Check size={15} /> : <Copy size={15} />} {copied ? 'Kopioitu' : 'Kopioi'}
                        </button>
                      </div>
                    </div>
                    <p className="text-[10.5px] text-white/25 leading-relaxed">
                      Ajat on sovitettu paikkojen aukioloihin ja keikkojen todellisiin
                      alkuaikoihin kävelymatkoineen — tarkista silti liput ja pöytävaraukset
                      paikan omalta sivulta.
                    </p>
                  </>
                )}
              </div>
            </div>
          </div>
        </>
      )}
    </>
  )
}

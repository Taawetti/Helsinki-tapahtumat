'use client'

// 🎰 ARVO VALMIS ILTA — Idea-välilehden arvontakone. Käyttäjä KOKOAA illan
// palikoista (ruoka, keikka, kulttuuri, sauna…) ja kone arpoo valmiin,
// aikataulutetun suunnitelman (omistaja: "niistä voi valita mieleiset").
// Sama 13 testin lukitsema kaarimoottori kuin ryhmäversiossa: aukiolot
// suunnitellulle hetkelle, keikkojen oikeat alkuajat ankkureina, kävelyajat,
// yön raja — ja rehellinen "ei toteutettavissa" kun ilta ei synny.
//
// Kilpailutilannesuoja (reqSeq): vain uusimman pyynnön vastaus kirjoittaa
// tilaa — hidas "tänä iltana" -vastaus ei saa yliajaa viikonloppuvalintaa
// (väärän päivän suunnitelma oli mahdollinen ilman tätä; mitattu).

import { useCallback, useEffect, useRef, useState } from 'react'
import { X, MapPin, Navigation, MessageCircle, Copy, Check, Dices } from 'lucide-react'
import { planShareText } from '@/lib/arvo-ilta'
import type { SceneId } from '@/lib/candidate'
import type { GroupArcPlan, PlanStep } from '@/lib/group'

type WhenChoice = 'tonight' | 'weekend'

interface ApiResponse {
  plan: GroupArcPlan | null
  date: string
  reason: 'too-late' | 'no-arc' | 'empty-deck' | 'missing-scenes' | null
  missing?: SceneId[]
}

// ── Illan palikat — TIUKKA lupaus: palikka = pysäkki ────────────────────────
// (Omistaja 24.8.2026: "keikan pitää olla keikka, baarin baari, ravintolan
// ravintola". 'Perheelle' poistettu — ei oleteta mitä perhe haluaa. 'Ilmaista'
// ei ole pysäkki vaan budjettikytkin alla.)

const SCENES: { id: SceneId; emoji: string; label: string; tint: string }[] = [
  { id: 'ruoka',     emoji: '🍽',  label: 'Ruoka',             tint: '232,120,60' },
  { id: 'keikka',    emoji: '🎸', label: 'Keikka & klubi',    tint: '175,100,255' },
  { id: 'kulttuuri', emoji: '🎭', label: 'Kulttuuri & taide', tint: '120,130,255' },
  { id: 'sauna',     emoji: '🧖', label: 'Sauna',             tint: '240,110,110' },
  { id: 'baarit',    emoji: '🍸', label: 'Baarit',            tint: '95,180,255' },
  { id: 'ulkona',    emoji: '🌳', label: 'Ulkona',            tint: '95,217,140' },
]

// Ruokaa tai baaria ei voi luvata ilmaiseksi — kytkin harmaannuttaa ne.
const NEVER_FREE: SceneId[] = ['ruoka', 'baarit']

const WHEN_LABEL: Record<WhenChoice, string> = { tonight: '🌙 Tänä iltana', weekend: '🗓 Viikonloppuna' }

// Roolikohtainen liukuväri kuvattomille pysäkeille — sama julistekieli kuin
// tapahtumakorteissa.
const ROLE_GRADIENT: Record<string, string> = {
  activity: 'linear-gradient(135deg,#042f2e 0%,#0f4c35 55%,#065f46 100%)',
  food:     'linear-gradient(160deg,#431407 0%,#78350f 55%,#92400e 100%)',
  drinks:   'linear-gradient(155deg,#0c2a4a 0%,#0e4d6e 55%,#0369a1 100%)',
  program:  'linear-gradient(135deg,#2e1065 0%,#4c1d95 55%,#6d28d9 100%)',
}

function fiDateLabel(iso: string): string {
  const d = new Date(`${iso}T12:00:00Z`)
  const wd = ['su', 'ma', 'ti', 'ke', 'to', 'pe', 'la'][d.getUTCDay()]
  return `${wd} ${d.getUTCDate()}.${d.getUTCMonth() + 1}.`
}

// ── Pysäkkikortti — kuva tekee illasta houkuttelevan ────────────────────────

function StepCard({ step, onReroll, rerolling }: {
  step: PlanStep
  onReroll: () => void
  rerolling: boolean
}) {
  const [imgOk, setImgOk] = useState(true)
  const gradient = ROLE_GRADIENT[step.role] ?? ROLE_GRADIENT.activity
  return (
    <>
      {typeof step.travelFromPrevMin === 'number' && step.travelFromPrevMin > 0 && (
        <li className="flex items-center gap-2 pl-7 text-[12px] text-white/40" aria-label="siirtymä">
          <span className="inline-block w-px h-4 -ml-3" style={{ background: 'rgba(255,255,255,.15)' }} />
          {step.travelFromPrevMode === 'transit' ? '🚌' : '🚶'} ~{step.travelFromPrevMin} min
          {step.travelFromPrevMode === 'transit' && step.travelFromPrevUrl && (
            <a href={step.travelFromPrevUrl} target="_blank" rel="noopener"
              className="text-[#7aa7ff] hover:text-white transition-colors">Reittiopas ↗</a>
          )}
        </li>
      )}
      <li className="rounded-2xl overflow-hidden flex"
        style={{ background: 'rgba(255,255,255,.04)', border: '1px solid rgba(255,255,255,.08)' }}>
        {/* Kuva — groundattu faktakuva (Google/tapahtuma) roolijulisteen päällä.
            Juliste (liukuväri + emoji) piirtyy AINA alle: hidas tai kuollut
            kuva näyttää värikkään tiilen, ei mustaa aukkoa (mitattu lh3-viive). */}
        <div className="relative shrink-0 w-24 self-stretch" style={{ minHeight: 96, background: gradient }}>
          <div className="absolute inset-0 flex items-center justify-center text-3xl" aria-hidden>{step.emoji}</div>
          {step.image && imgOk && (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={step.image} onError={() => setImgOk(false)} alt=""
              className="absolute inset-0 w-full h-full object-cover" />
          )}
        </div>
        <div className="min-w-0 flex-1 p-3">
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0">
              <p className="text-[11.5px] font-black" style={{ color: '#a3abff' }}>{step.time ?? ''}</p>
              <p className="font-bold text-white text-[15px] leading-snug mt-0.5">
                {step.url ? (
                  <a href={step.url} target="_blank" rel="noopener" className="hover:text-blue-300 transition-colors">{step.title} ↗</a>
                ) : step.title}
              </p>
            </div>
            {/* Pysäkin uudelleenarvonta */}
            <button onClick={onReroll} disabled={rerolling}
              aria-label={`Arvo tilalle toinen: ${step.title}`}
              className="shrink-0 p-2 rounded-xl text-white/45 hover:text-white transition-colors disabled:opacity-40"
              style={{ background: 'rgba(255,255,255,.06)' }}>
              <Dices size={16} className={rerolling ? 'animate-spin' : ''} />
            </button>
          </div>
          {step.why && <p className="text-[12.5px] text-white/55 leading-snug mt-1">{step.why}</p>}
          <p className="text-[11.5px] text-white/35 mt-1.5 flex items-center gap-1 flex-wrap">
            {step.isFree && <span className="text-emerald-400 font-bold">maksuton ·</span>}
            {/* ★ vain jos why-teksti ei jo kerro arvosanaa — ei tuplana */}
            {typeof step.rating === 'number' && !step.why?.includes('arvostelua') && (
              <span style={{ color: '#e8c06a' }}>★ {step.rating.toFixed(1)} ·</span>
            )}
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

// ── Pääkomponentti ──────────────────────────────────────────────────────────

export default function ArvoIlta() {
  const [selected, setSelected] = useState<SceneId[]>([])
  const [freeOnly, setFreeOnly] = useState(false)
  const [open, setOpen] = useState(false)
  const [when, setWhen] = useState<WhenChoice>('tonight')
  const [variant, setVariant] = useState(0)
  const [excluded, setExcluded] = useState<string[]>([])
  const [rerollingId, setRerollingId] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [result, setResult] = useState<ApiResponse | null>(null)
  const [error, setError] = useState(false)
  const [copied, setCopied] = useState(false)
  const [note, setNote] = useState<string | null>(null)
  const reqSeq = useRef(0)

  const toggleScene = useCallback((id: SceneId) => {
    if (freeOnly && NEVER_FREE.includes(id)) return
    setSelected((prev) => prev.includes(id)
      ? prev.filter((x) => x !== id)
      : prev.length >= 4 ? prev : [...prev, id])
  }, [freeOnly])

  const toggleFree = useCallback(() => {
    setFreeOnly((prev) => {
      if (!prev) setSelected((sel) => sel.filter((s) => !NEVER_FREE.includes(s)))
      return !prev
    })
  }, [])

  const roll = useCallback(async (scenes: SceneId[], w: WhenChoice, v: number, ex: string[], keepDate?: string) => {
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
          scenes,                              // palikka = pysäkki (palvelin valvoo tiukasti)
          budget: freeOnly ? 'free' : 'any',
          when: w,
          variant: v,
          excludeIds: ex,
          date: keepDate,                      // pysäkkiarvonta pysyy näkyvän suunnitelman päivässä
        }),
      })
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      const json = await res.json() as ApiResponse
      if (my !== reqSeq.current) return        // vanhentunut vastaus
      if (isReroll && !json.plan) {
        setExcluded((prev) => prev.slice(0, -1))
        setNote('Tälle pysäkille ei löytynyt korvaajaa — muut vaihtoehdot ovat joko kiinni tai eivät ehdi aikatauluun.')
        return
      }
      setResult(json)
    } catch {
      if (my !== reqSeq.current) return
      if (isReroll) {
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
  }, [freeOnly])

  const start = useCallback(() => {
    if (selected.length === 0) return
    setOpen(true)
    setVariant(0)
    setExcluded([])
    setResult(null)
    roll(selected, when, 0, [])
  }, [selected, when, roll])

  const changeWhen = useCallback((w: WhenChoice) => {
    setWhen(w); setVariant(0); setExcluded([]); setResult(null)
    roll(selected, w, 0, [])
  }, [selected, roll])

  const rerollAll = useCallback(() => {
    const v = (variant + 1) % 31               // palvelimen variant-katto on 30
    setVariant(v); setExcluded([]); setResult(null)
    roll(selected, when, v, [], result?.date)
  }, [selected, when, variant, roll, result])

  const rerollStep = useCallback((cardId: string) => {
    if (rerollingId) return                    // yksi pysäkkiarvonta kerrallaan
    const ex = [...excluded, cardId]
    setExcluded(ex)
    setRerollingId(cardId)
    roll(selected, when, variant, ex, result?.date)
  }, [selected, when, variant, excluded, roll, rerollingId, result])

  const close = useCallback(() => {
    reqSeq.current++
    setOpen(false); setResult(null); setNote(null); setRerollingId(null); setLoading(false)
  }, [])

  useEffect(() => {
    if (!open) return
    const esc = (e: KeyboardEvent) => { if (e.key === 'Escape') close() }
    document.addEventListener('keydown', esc)
    return () => document.removeEventListener('keydown', esc)
  }, [open, close])

  const plan = result?.plan ?? null
  const shareText = plan && result ? planShareText(plan, fiDateLabel(result.date)) : ''
  // Hero: viimeisen kuvallisen pysäkin kuva (illan huipennus) — jos kuvia on
  // useampi, banneri ei toista ensimmäisen kortin kuvaa heti sen yläpuolella.
  const stepImages = plan?.arc.filter((s) => s.image).map((s) => s.image!) ?? []
  const heroImage = stepImages.length > 0 ? stepImages[stepImages.length - 1] : null
  const titleEmojis = selected.map((id) => SCENES.find((s) => s.id === id)?.emoji ?? '').join('')
  const titleLabel = selected.map((id) => SCENES.find((s) => s.id === id)?.label ?? '').join(' · ')

  return (
    <>
      {/* ── Palikkavalitsin ── */}
      <section className="mt-2">
        <div className="flex items-baseline gap-2 mb-2.5">
          <h2 className="font-black text-white text-[16px]" style={{ letterSpacing: '-0.01em' }}>🎰 Arvo valmis ilta</h2>
          <span className="text-[11px] text-white/35 font-medium">valitse palikat → kone aikatauluttaa</span>
        </div>
        <div className="grid grid-cols-3 gap-2">
          {SCENES.map((s) => {
            const on = selected.includes(s.id)
            const disabled = freeOnly && NEVER_FREE.includes(s.id)
            return (
              <button key={s.id} onClick={() => toggleScene(s.id)}
                aria-pressed={on} disabled={disabled}
                className="relative flex flex-col items-center justify-center gap-1 rounded-[16px] py-3 px-1 transition-all active:scale-95 disabled:opacity-30 disabled:active:scale-100"
                title={disabled ? 'Ei luvata ilmaiseksi — ota Vain ilmaista pois' : undefined}
                style={{
                  background: on
                    ? `radial-gradient(120% 100% at 50% 0%, rgba(${s.tint},.38), rgba(${s.tint},.10) 75%)`
                    : `radial-gradient(120% 100% at 50% 0%, rgba(${s.tint},.14), rgba(255,255,255,.03) 70%)`,
                  border: on ? `1.5px solid rgba(${s.tint},.75)` : '1px solid rgba(255,255,255,.07)',
                  boxShadow: on ? `0 6px 22px -8px rgba(${s.tint},.55)` : 'none',
                }}>
                {on && (
                  <span className="absolute top-1 right-1.5 w-4 h-4 rounded-full flex items-center justify-center"
                    style={{ background: `rgb(${s.tint})` }}>
                    <Check size={11} strokeWidth={3.5} className="text-black/80" />
                  </span>
                )}
                <span className="text-[22px] leading-none">{s.emoji}</span>
                <span className={`text-[10.5px] font-black text-center leading-tight ${on ? 'text-white' : 'text-white/70'}`}>{s.label}</span>
              </button>
            )
          })}
        </div>
        {/* Budjettikytkin — ei palikka: ilmaisuus ei ole pysäkki vaan rajaus */}
        <button onClick={toggleFree} aria-pressed={freeOnly}
          className="mt-2 flex items-center gap-2 text-[12px] font-bold px-3 py-2 rounded-full transition-colors"
          style={freeOnly
            ? { background: 'rgba(80,220,180,.18)', color: '#6ee7c7', border: '1px solid rgba(80,220,180,.45)' }
            : { background: 'rgba(255,255,255,.04)', color: 'rgba(255,255,255,.5)', border: '1px solid rgba(255,255,255,.08)' }}>
          <span className={`w-3.5 h-3.5 rounded-full flex items-center justify-center ${freeOnly ? '' : 'border border-white/25'}`}
            style={freeOnly ? { background: '#50dcb4' } : undefined}>
            {freeOnly && <Check size={10} strokeWidth={4} className="text-black/80" />}
          </span>
          💸 Vain ilmaista
        </button>
        <button onClick={start} disabled={selected.length === 0}
          className="mt-2.5 w-full flex items-center justify-center gap-2 rounded-[16px] py-3.5 font-black text-[14px] text-white transition-all active:scale-[0.98] disabled:opacity-40"
          style={{ background: 'linear-gradient(150deg,#6b76ff,#5059e6)', boxShadow: selected.length > 0 ? '0 10px 28px -10px rgba(91,101,230,.8)' : 'none' }}>
          <Dices size={16} />
          {selected.length === 0 ? 'Valitse illan palikat' : `Arvo ilta (${selected.length} ${selected.length === 1 ? 'palikka' : 'palikkaa'})`}
        </button>
      </section>

      {/* ── Suunnitelmapaneeli ── */}
      {open && (
        <>
          <div className="fixed inset-0 z-40 bg-black/60" onClick={close} aria-hidden />
          <div role="dialog" aria-modal aria-label="Arvottu ilta"
            className="fixed inset-x-0 bottom-0 z-50 rounded-t-3xl overflow-hidden md:inset-x-auto md:right-0 md:top-0 md:bottom-0 md:rounded-none md:w-full md:max-w-lg">
            <div className="h-[92dvh] overflow-y-auto bg-[#0e1117] shadow-2xl md:h-full">

              {/* Hero: ensimmäisen kuvallisen pysäkin kuva bannerina */}
              <div className="relative h-44 w-full shrink-0" style={{ background: 'linear-gradient(135deg,#16162a,#1e2440)' }}>
                {heroImage && (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={heroImage} alt="" className="absolute inset-0 w-full h-full object-cover" />
                )}
                <div className="absolute inset-0 bg-gradient-to-t from-[#0e1117] via-black/30 to-transparent" />
                <div className="md:hidden absolute top-2 inset-x-0 flex justify-center">
                  <div className="w-10 h-1 rounded-full bg-white/30" />
                </div>
                <button onClick={close} aria-label="Sulje"
                  className="absolute top-4 right-4 p-2 bg-black/50 hover:bg-black/80 rounded-full text-white transition-colors">
                  <X size={16} />
                </button>
                <div className="absolute bottom-3 left-5 right-5">
                  <p className="text-[11px] font-black uppercase tracking-[.14em] text-white/60">{titleEmojis} {titleLabel}</p>
                  <h2 className="text-2xl font-black text-white" style={{ letterSpacing: '-0.02em', textShadow: '0 2px 18px rgba(0,0,0,.7)' }}>
                    {result ? fiDateLabel(result.date) : 'Arvotaan…'}
                  </h2>
                </div>
              </div>

              <div className="p-5 space-y-4">
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

                {loading && (
                  <div className="space-y-2 py-2">
                    {[0, 1, 2].map((i) => <div key={i} className="rounded-2xl skeleton-shimmer" style={{ height: 104 }} />)}
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
                      {result.reason === 'missing-scenes' && result.missing?.length
                        ? `${result.missing
                            .map((m) => { const s = SCENES.find((x) => x.id === m); return s ? `${s.emoji} ${s.label}` : m })
                            .join(', ')} ei löytynyt tälle päivälle — emme ehdota mitään sinne päin.`
                        : result.reason === 'too-late'
                        ? 'Ilta on jo niin pitkällä, ettei ehjää suunnitelmaa synny — paikat ehtivät kiinni.'
                        : 'Näillä palikoilla ei löytynyt toteutettavaa yhdistelmää tälle päivälle.'}
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
                    <ul className="space-y-2">
                      {plan.arc.map((s) => (
                        <StepCard key={`${s.cardId ?? s.title}`} step={s}
                          rerolling={rerollingId !== null}
                          onReroll={() => s.cardId && rerollStep(s.cardId)} />
                      ))}
                    </ul>

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

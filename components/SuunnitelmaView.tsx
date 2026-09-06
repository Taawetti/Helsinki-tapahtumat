'use client'

// Suunnitelma-välilehti: käyttäjän itse kokoama päivän/illan ohjelma.
// Askeleet kerätään tapahtuma-/ravintola-/paikkapaneelien "Lisää
// suunnitelmaan" -napeista; täällä ne järjestetään (RAAHAAMALLA kahvasta
// tai ↑↓-nuolista), ajat sovitetaan (lib/suunnitelma sovitaAjat) ja valmis
// suunnitelma jaetaan linkkinä (/api/suunnitelma → /s/[token]).
//
// Kellonajat vaihdetaan iPhone-tyylisellä rullavalitsimella (AikaValitsin)
// — natiivi <input type="time"> oli puhelimella kömpelö (omistaja 6.9.2026).
//
// Raahaus: kahvasta (⠿) pointer-tapahtumilla — touch-action: none VAIN
// kahvassa, joten listan normaali vieritys ei häiriinny. Raahattu kortti
// seuraa sormea; pudotuskohta näytetään indigoviivana; järjestys
// vahvistetaan varastoon vasta irrotettaessa.

import { useMemo, useRef, useState, useSyncExternalStore } from 'react'
import dynamic from 'next/dynamic'
import { Loader2, X, ChevronUp, ChevronDown, Share2, AlertTriangle, GripVertical, Navigation } from 'lucide-react'
import { useLanguage } from '@/contexts/LanguageContext'
import {
  lueSuunnitelma, lueSuunnitelmaServer, tilaaSuunnitelma, sovitaAjat,
  poistaAskel, siirraAskelta, siirraIndeksiin, asetaOtsikko, asetaPaiva,
  asetaAlkuKlo, asetaKasinKlo, tyhjennaSuunnitelma, ROOLI_META,
  reittiohjeUrl, type VaroitusSyy, type SuunnitelmaAskel, type AskelData,
} from '@/lib/suunnitelma'
import type { Event } from '@/lib/types'
import RestaurantDetailPanel from '@/components/RestaurantDetailPanel'
import PlaceDetailPanel from '@/components/PlaceDetailPanel'
import { helsinkiToday } from '@/lib/helsinki-time'
import { track } from '@/lib/track'
import AikaValitsin from '@/components/AikaValitsin'
import { hasOwnEventPage } from '@/lib/event-links'

const PlannerMap = dynamic(() => import('@/components/PlannerMap'), { ssr: false })

const VAROITUS_AVAIN: Record<VaroitusSyy, string> = {
  kiinni: 'plan.warn_kiinni',
  'ei-ehdi': 'plan.warn_ei_ehdi',
  myohaan: 'plan.warn_myohaan',
  mennyt: 'plan.warn_mennyt',
}

export default function SuunnitelmaView({ onAvaaTapahtuma }: { onAvaaTapahtuma?: (e: Event) => void }) {
  const { t } = useLanguage()
  const suunnitelma = useSyncExternalStore(tilaaSuunnitelma, lueSuunnitelma, lueSuunnitelmaServer)
  const [jakoTila, setJakoTila] = useState<'idle' | 'busy' | 'done' | 'error'>('idle')
  const [jakoLinkki, setJakoLinkki] = useState<string | null>(null)
  /** Auki oleva aikavalitsin: askeleen id tai 'alku' (aloitusaika). */
  const [aikaAuki, setAikaAuki] = useState<string | null>(null)
  /** VARAtila: suppea infolevitys (askeleen id) niille askeleille, joilta
   *  puuttuu täysi lähdeolio (vanha varasto, jaetusta kopioitu pohja). */
  const [infoAuki, setInfoAuki] = useState<string | null>(null)
  /** Napautuksesta avattu OIKEA infopaneeli — sama kuin muualla sovelluksessa. */
  const [avattuRavintola, setAvattuRavintola] = useState<Extract<AskelData, { laji: 'ravintola' }> | null>(null)
  const [avattuPaikka, setAvattuPaikka] = useState<Extract<AskelData, { laji: 'paikka' }> | null>(null)

  // Askeleen napautus: avaa täyden paneelin jos lähdeolio on tallessa,
  // muuten togglaa suppean levityksen (AskelInfo).
  function avaaAskel(askel: SuunnitelmaAskel) {
    const d = askel.data
    if (d?.laji === 'tapahtuma' && onAvaaTapahtuma) return onAvaaTapahtuma(d.tapahtuma)
    if (d?.laji === 'ravintola') return setAvattuRavintola(d)
    if (d?.laji === 'paikka') return setAvattuPaikka(d)
    setInfoAuki(infoAuki === askel.id ? null : askel.id)
  }

  // ── Raahaus ──
  const listaRef = useRef<HTMLDivElement>(null)
  const raahausAlkuY = useRef(0)
  const [raahaus, setRaahaus] = useState<{ id: string; dy: number; kohde: number; lahto: number } | null>(null)

  const sovitetut = useMemo(() => sovitaAjat(suunnitelma, new Date()), [suunnitelma])

  const karttaItemit = useMemo(
    () => sovitetut
      .filter((r) => r.askel.lat != null && r.askel.lon != null)
      .map((r) => ({ title: `${r.klo} ${r.askel.nimi}`, location: r.askel.osoite ?? '', coords: [r.askel.lat!, r.askel.lon!] as [number, number] })),
    [sovitetut],
  )

  // Google Maps -kävelyreitti askelten järjestyksessä — nappi kartan alla.
  const reittiUrl = useMemo(() => reittiohjeUrl(sovitetut.map((r) => r.askel)), [sovitetut])

  function kohdeIndeksi(clientY: number, raahattuId: string): number {
    const kortit = [...(listaRef.current?.querySelectorAll<HTMLElement>('[data-askel-id]') ?? [])]
      .filter((el) => el.dataset.askelId !== raahattuId)
    let kohde = 0
    for (const el of kortit) {
      const r = el.getBoundingClientRect()
      if (clientY > r.top + r.height / 2) kohde++
    }
    return kohde
  }

  function raahausAlkaa(e: React.PointerEvent, id: string, indeksi: number) {
    e.preventDefault()
    ;(e.currentTarget as HTMLElement).setPointerCapture(e.pointerId)
    raahausAlkuY.current = e.clientY
    setRaahaus({ id, dy: 0, kohde: indeksi, lahto: indeksi })
  }

  function raahausLiikkuu(e: React.PointerEvent) {
    if (!raahaus) return
    const dy = e.clientY - raahausAlkuY.current
    setRaahaus({ ...raahaus, dy, kohde: kohdeIndeksi(e.clientY, raahaus.id) })
  }

  function raahausLoppuu() {
    if (!raahaus) return
    if (raahaus.kohde !== raahaus.lahto) siirraIndeksiin(raahaus.id, raahaus.kohde)
    setRaahaus(null)
  }

  async function jaa() {
    if (jakoTila === 'busy') return
    setJakoTila('busy')
    try {
      const res = await fetch('/api/suunnitelma', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          otsikko: suunnitelma.otsikko,
          paiva: suunnitelma.paiva,
          alkuKlo: suunnitelma.alkuKlo,
          // data (täysi lähdeolio) ei kuulu jakoon — snapshot-kentät riittävät
          // jaetulla sivulla, ja API:n siivoaAskel pudottaisi sen joka tapauksessa.
          askeleet: sovitetut.map((r) => {
            const { data: _pois, ...askel } = r.askel
            return { ...askel, klo: r.klo, kavelyMin: r.kavelyMin }
          }),
        }),
      })
      if (!res.ok) throw new Error(String(res.status))
      const { token, poistoAvain } = (await res.json()) as { token: string; poistoAvain: string }
      const url = `${location.origin}/s/${token}`
      try {
        const avaimet = JSON.parse(localStorage.getItem('jaetut-suunnitelmat') ?? '{}') as Record<string, string>
        avaimet[token] = poistoAvain
        localStorage.setItem('jaetut-suunnitelmat', JSON.stringify(avaimet))
      } catch { /* privaattitila */ }
      setJakoLinkki(url)
      track('share', { label: 'suunnitelma', meta: `${sovitetut.length} askelta` })
      if (navigator.share) {
        await navigator.share({ title: suunnitelma.otsikko || 'Mitä tänään — suunnitelma', url }).catch(() => {})
        setJakoTila('done')
      } else {
        await navigator.clipboard.writeText(url)
        setJakoTila('done')
      }
    } catch {
      setJakoTila('error')
    }
  }

  const aikaAskel = aikaAuki && aikaAuki !== 'alku'
    ? sovitetut.find((r) => r.askel.id === aikaAuki)
    : null

  return (
    <main className="max-w-3xl mx-auto px-4 pt-5 pb-28 space-y-5">
      <h1 className="font-black text-white text-[22px]" style={{ letterSpacing: '-0.02em' }}>
        🗓 {t('nav.suunnitelma')}
        {sovitetut.length > 0 && <span className="text-white/30 text-[14px] font-bold ml-2">· {sovitetut.length} {t('plan.steps')}</span>}
      </h1>

      {sovitetut.length === 0 ? (
        <div className="flex flex-col items-center py-20 text-center gap-3">
          <span className="text-5xl">🗓</span>
          <p className="text-white font-black text-lg">{t('plan.empty_title')}</p>
          <p className="text-white/40 text-sm max-w-sm leading-relaxed">{t('plan.empty_sub')}</p>
        </div>
      ) : (
        <>
          {/* Otsikko + päivä + aloitusaika */}
          <div className="space-y-3 rounded-2xl p-4" style={{ background: 'rgba(255,255,255,.04)', border: '1px solid rgba(255,255,255,.08)' }}>
            <input
              value={suunnitelma.otsikko}
              onChange={(e) => asetaOtsikko(e.target.value)}
              placeholder={t('plan.title_ph')}
              className="w-full bg-transparent text-white font-black text-[17px] placeholder:text-white/25 focus:outline-none"
            />
            <div className="flex items-center gap-3 flex-wrap">
              <label className="flex items-center gap-2 text-[12px] font-bold text-white/45">
                {t('plan.date')}
                <input type="date" value={suunnitelma.paiva} min={helsinkiToday()}
                  onChange={(e) => asetaPaiva(e.target.value)}
                  className="bg-white/6 border border-white/10 rounded-lg px-2 py-1.5 text-white text-[13px] [color-scheme:dark]" />
              </label>
              <span className="flex items-center gap-2 text-[12px] font-bold text-white/45">
                {t('plan.start')}
                <button onClick={() => setAikaAuki('alku')}
                  className="bg-white/6 border border-white/10 rounded-lg px-3 py-1.5 text-white text-[13px] font-black">
                  {suunnitelma.alkuKlo ?? (sovitetut[0]?.klo ?? '18:00')}
                </button>
              </span>
            </div>
          </div>

          {/* Aikajana */}
          <div ref={listaRef} className="space-y-2">
            {sovitetut.map((r, i) => {
              const raahattava = raahaus?.id === r.askel.id
              // Pudotusviiva: näytetään sen kortin YLÄPUOLELLA jonka kohdalle
              // raahattu putoaisi (indeksit ilman raahattua itseään).
              const indeksiIlman = raahaus && !raahattava
                ? sovitetut.filter((x) => x.askel.id !== raahaus.id).findIndex((x) => x.askel.id === r.askel.id)
                : -1
              const viivaYlle = raahaus && !raahattava && indeksiIlman === raahaus.kohde && raahaus.kohde !== raahaus.lahto
              return (
                <div key={r.askel.id}>
                  {viivaYlle && <div className="h-0.5 rounded-full my-1" style={{ background: '#6b76ff' }} />}
                  {r.kavelyMin !== undefined && !raahaus && (
                    <p className="text-white/25 text-[11px] font-bold pl-14 py-0.5">🚶 {r.kavelyMin} min {t('plan.walk')}</p>
                  )}
                  <div data-askel-id={r.askel.id}
                    className="flex gap-2 rounded-2xl p-3 items-start"
                    style={{
                      background: raahattava ? 'rgba(30,32,44,.98)' : 'rgba(255,255,255,.04)',
                      border: `1px solid ${r.varoitus ? 'rgba(255,159,67,.4)' : raahattava ? 'rgba(107,118,255,.5)' : 'rgba(255,255,255,.08)'}`,
                      transform: raahattava ? `translateY(${raahaus!.dy}px) scale(1.02)` : undefined,
                      boxShadow: raahattava ? '0 14px 34px -8px rgba(0,0,0,.7)' : undefined,
                      zIndex: raahattava ? 10 : undefined,
                      position: 'relative',
                      transition: raahattava ? 'none' : 'transform .15s',
                    }}>
                    {/* Raahauskahva — touch-action none VAIN tässä */}
                    <button
                      onPointerDown={(e) => raahausAlkaa(e, r.askel.id, i)}
                      onPointerMove={raahausLiikkuu}
                      onPointerUp={raahausLoppuu}
                      onPointerCancel={raahausLoppuu}
                      aria-label={t('plan.drag')}
                      className="shrink-0 self-center p-1 -ml-1 text-white/25 cursor-grab active:cursor-grabbing"
                      style={{ touchAction: 'none' }}>
                      <GripVertical size={17} />
                    </button>
                    {/* Aika: ankkuri kiinteä, muut avaavat rullavalitsimen */}
                    <div className="shrink-0 w-[52px] text-center self-center">
                      {r.askel.ankkuriISO ? (
                        <span className="block text-[#a3abff] font-black text-[14px]">{r.klo}</span>
                      ) : (
                        <>
                          <button onClick={() => setAikaAuki(r.askel.id)}
                            className="w-[52px] text-[#a3abff] font-black text-[13px] text-center border border-white/10 rounded-lg py-1 bg-white/4">
                            {r.klo}
                          </button>
                          {!r.askel.kasinKlo && (
                            <span className="block text-white/25 text-[9px] font-bold mt-0.5">{t('plan.time_auto')}</span>
                          )}
                        </>
                      )}
                    </div>
                    {r.askel.kuva && (
                      /* eslint-disable-next-line @next/next/no-img-element */
                      <img src={r.askel.kuva} alt="" loading="lazy" className="w-12 h-12 rounded-xl object-cover shrink-0" />
                    )}
                    <div className="min-w-0 flex-1 cursor-pointer" role="button" tabIndex={0}
                      onClick={() => avaaAskel(r.askel)}
                      onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); avaaAskel(r.askel) } }}>
                      <p className="text-white font-bold text-[14px] leading-snug">{ROOLI_META[r.askel.rooli].emoji} {r.askel.nimi}</p>
                      {r.askel.osoite && <p className="text-white/35 text-[12px] truncate">{r.askel.osoite}</p>}
                      {r.varoitus && (
                        <p className="flex items-center gap-1 text-[12px] font-bold mt-0.5" style={{ color: '#ff9f43' }}>
                          <AlertTriangle size={12} /> {t(VAROITUS_AVAIN[r.varoitus] as Parameters<typeof t>[0])}
                        </p>
                      )}
                      {infoAuki === r.askel.id && <AskelInfo askel={r.askel} />}
                    </div>
                    <div className="shrink-0 flex flex-col gap-0.5">
                      <button onClick={() => siirraAskelta(r.askel.id, -1)} disabled={i === 0} aria-label="↑"
                        className="p-1 text-white/35 hover:text-white disabled:opacity-20"><ChevronUp size={15} /></button>
                      <button onClick={() => siirraAskelta(r.askel.id, 1)} disabled={i === sovitetut.length - 1} aria-label="↓"
                        className="p-1 text-white/35 hover:text-white disabled:opacity-20"><ChevronDown size={15} /></button>
                    </div>
                    <button onClick={() => poistaAskel(r.askel.id)} aria-label={t('common.close')}
                      className="shrink-0 p-1.5 text-white/30 hover:text-white"><X size={15} /></button>
                  </div>
                </div>
              )
            })}
            {/* Pudotusviiva listan loppuun */}
            {raahaus && raahaus.kohde >= sovitetut.length - 1 && raahaus.kohde !== raahaus.lahto && (
              <div className="h-0.5 rounded-full my-1" style={{ background: '#6b76ff' }} />
            )}
          </div>

          {/* Kartta + reittiohjeet */}
          {karttaItemit.length > 0 && (
            <div className="space-y-2">
              <div className="rounded-2xl overflow-hidden border border-white/10" style={{ height: 260 }}>
                <PlannerMap items={karttaItemit} />
              </div>
              {reittiUrl && (
                <a href={reittiUrl} target="_blank" rel="noopener noreferrer"
                  onClick={() => track('external_click', { surface: 'plan', label: 'reittiohjeet' })}
                  className="flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl font-bold text-[13px] border border-white/10 text-white/70 hover:text-white transition-colors">
                  <Navigation size={14} /> {t('plan.directions')} ↗
                </a>
              )}
            </div>
          )}

          {/* Toiminnot */}
          <div className="flex items-center gap-2 flex-wrap">
            <button onClick={jaa} disabled={jakoTila === 'busy'}
              className="flex items-center gap-2 px-5 py-3 rounded-xl font-black text-white text-[14px] transition-all active:scale-95 disabled:opacity-60"
              style={{ background: 'linear-gradient(150deg,#6b76ff,#5059e6)', boxShadow: '0 8px 20px -6px rgba(91,101,230,.6)' }}>
              {jakoTila === 'busy' ? <Loader2 size={15} className="animate-spin" /> : <Share2 size={15} />}
              {jakoTila === 'busy' ? t('plan.sharing') : t('plan.share')}
            </button>
            <button onClick={() => { if (confirm(t('plan.clear_confirm'))) tyhjennaSuunnitelma() }}
              className="px-4 py-3 rounded-xl font-bold text-white/45 hover:text-white text-[13px] border border-white/10 transition-colors">
              {t('plan.clear')}
            </button>
          </div>
          {jakoTila === 'done' && jakoLinkki && (
            <p className="text-emerald-400 text-[13px] font-bold break-all">✓ {t('plan.share_done')} {jakoLinkki}</p>
          )}
          {jakoTila === 'error' && (
            <p className="text-[13px] font-bold" style={{ color: '#ff9f43' }}>{t('plan.share_error')}</p>
          )}
        </>
      )}

      {/* Rullavalitsin: aloitusaika tai askeleen aika */}
      {aikaAuki === 'alku' && (
        <AikaValitsin
          otsikko={t('plan.start')}
          arvo={suunnitelma.alkuKlo ?? sovitetut[0]?.klo ?? '18:00'}
          onValmis={(klo) => { asetaAlkuKlo(klo); setAikaAuki(null) }}
          onAuto={() => { asetaAlkuKlo(undefined); setAikaAuki(null) }}
          onSulje={() => setAikaAuki(null)}
        />
      )}
      {aikaAskel && (
        <AikaValitsin
          otsikko={aikaAskel.askel.nimi}
          arvo={aikaAskel.askel.kasinKlo ?? aikaAskel.klo}
          onValmis={(klo) => { asetaKasinKlo(aikaAskel.askel.id, klo); setAikaAuki(null) }}
          onAuto={() => { asetaKasinKlo(aikaAskel.askel.id, undefined); setAikaAuki(null) }}
          onSulje={() => setAikaAuki(null)}
        />
      )}

      {/* Askeleen napautuksesta avautuvat OIKEAT infopaneelit — samat
          komponentit kuin Ravintolat- ja opasnäkymissä. Tapahtuma avataan
          HomeClientin globaaliin EventDetailPaneliin (onAvaaTapahtuma). */}
      <RestaurantDetailPanel
        r={avattuRavintola?.ravintola ?? null}
        tyyli={avattuRavintola?.tyyli}
        onClose={() => setAvattuRavintola(null)}
      />
      <PlaceDetailPanel
        paikka={avattuPaikka?.paikka ?? null}
        guideSlug={avattuPaikka?.guideSlug ?? ''}
        onClose={() => setAvattuPaikka(null)}
      />
    </main>
  )
}

// ── Askeleen infokortti: kuvaus + turvalinkit (sama sisältö jaetulla sivulla) ──
function AskelInfo({ askel }: { askel: { viiteId?: string; kuvaus?: string; linkki?: string | null; kuva?: string | null; nimi: string } }) {
  const { t } = useLanguage()
  const omaSivu = askel.viiteId && hasOwnEventPage({ id: askel.viiteId })
  if (!askel.kuvaus && !askel.linkki && !omaSivu && !askel.kuva) return null
  return (
    <div className="mt-2 space-y-2" onClick={(e) => e.stopPropagation()}>
      {askel.kuva && (
        /* eslint-disable-next-line @next/next/no-img-element */
        <img src={askel.kuva} alt="" loading="lazy" className="w-full max-h-44 object-cover rounded-xl" />
      )}
      {askel.kuvaus && <p className="text-white/55 text-[12.5px] leading-relaxed">{askel.kuvaus}</p>}
      <div className="flex gap-3">
        {askel.linkki && (
          <a href={askel.linkki} target="_blank" rel="noopener noreferrer"
            className="text-[12.5px] font-black" style={{ color: '#a3abff' }}>
            {t('common.more_info')} →
          </a>
        )}
        {omaSivu && (
          <a href={`/e/${encodeURIComponent(askel.viiteId!)}`} target="_blank" rel="noopener"
            className="text-[12.5px] font-black" style={{ color: '#a3abff' }}>
            {t('detail.read_more')} →
          </a>
        )}
      </div>
    </div>
  )
}

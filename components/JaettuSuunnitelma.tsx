'use client'

// Jaetun suunnitelman klienttiosat: kartta, "Kopioi omaksi pohjaksi" ja
// tekijän oma poistonappi (poistoavain selaimen localStoragessa).

import { useMemo, useRef, useState } from 'react'
import dynamic from 'next/dynamic'
import { useRouter } from 'next/navigation'
import { Navigation, X } from 'lucide-react'
import { korvaaSuunnitelma, reittiohjeUrl, tunnitKloksi, type SuunnitelmaAskel, type AskelRooli } from '@/lib/suunnitelma'
import { openIntervalsForDate } from '@/lib/opening-hours'
import { formatDateRange } from '@/lib/utils'
import { useLanguage } from '@/contexts/LanguageContext'
import { useDialogiFokus } from '@/hooks/useDialogiFokus'
import { useTaaksepain } from '@/hooks/useTaaksepain'
import { track } from '@/lib/track'

const PlannerMap = dynamic(() => import('@/components/PlannerMap'), { ssr: false })

export interface JaettuAskelDTO {
  tyyppi: string
  nimi: string
  osoite?: string
  lat?: number
  lon?: number
  kuva?: string | null
  klo?: string
  kavelyMin?: number
  rooli?: string
  ankkuriISO?: string
  loppuISO?: string
  kuvaus?: string
  linkki?: string | null
  aukiolot?: string
  paikkaNimi?: string
  hinta?: string
  tyyppiNimike?: string
  puhelin?: string
  arvosana?: number
  arvosteluja?: number
}

const ROOLI_EMOJI: Record<string, string> = {
  tekeminen: '🧭', ruoka: '🍽', drinkit: '🍸', ohjelma: '🎟',
}

/** Aukiolorivi SUUNNITELMAN PÄIVÄLLE (ei "tänään") — vastaanottaja katsoo
 *  korttia usein eri päivänä kuin suunnitelma toteutuu. */
function aukioloRivi(aukiolot: string | undefined, paiva: string | null | undefined): { teksti: string; auki: boolean } | null {
  if (!aukiolot) return null
  const kelpo = paiva && /^\d{4}-\d{2}-\d{2}$/.test(paiva)
  const day = kelpo ? new Date(`${paiva}T12:00:00`) : new Date()
  const valit = openIntervalsForDate(aukiolot, day)
  if (valit === null) return null
  const vk = day.toLocaleDateString('fi-FI', { weekday: 'short' })
  if (valit.length === 0) return { teksti: `${vk} suljettu`, auki: false }
  return {
    teksti: `${vk} ${valit.map((v) => `${tunnitKloksi(v.from)}–${tunnitKloksi(v.to)}`).join(', ')}`,
    auki: true,
  }
}

/** Viikon aukiolorivit suunnitelman viikolta — sama sisältö kuin sovelluksen
 *  ravintolakortin viikkolistassa, johdettu snapshotin opening_hours-stringistä. */
function viikkoAukiolot(aukiolot: string | undefined, paiva: string | null | undefined): { nimi: string; tunnit: string; tanaan: boolean }[] | null {
  if (!aukiolot) return null
  const kelpo = paiva && /^\d{4}-\d{2}-\d{2}$/.test(paiva)
  const ankkuri = kelpo ? new Date(`${paiva}T12:00:00`) : new Date()
  // Maanantai ankkuripäivän viikolta (getDay: su=0).
  const maOffset = (ankkuri.getDay() + 6) % 7
  const rivit: { nimi: string; tunnit: string; tanaan: boolean }[] = []
  let tuntematon = false
  for (let i = 0; i < 7; i++) {
    const d = new Date(ankkuri)
    d.setDate(ankkuri.getDate() - maOffset + i)
    const valit = openIntervalsForDate(aukiolot, d)
    if (valit === null) { tuntematon = true; break }
    rivit.push({
      nimi: d.toLocaleDateString('fi-FI', { weekday: 'short' }),
      tunnit: valit.length === 0 ? 'suljettu' : valit.map((v) => `${tunnitKloksi(v.from)}–${tunnitKloksi(v.to)}`).join(', '),
      tanaan: i === maOffset,
    })
  }
  return tuntematon || rivit.length === 0 ? null : rivit
}

/** Askeleen kunnollinen infopaneeli — sama alhaalta nouseva kortti kuin
 *  sovelluksen paneeleissa (omistaja 6.9.2026: pieni rivilevitys ei riitä,
 *  myös vastaanottajan pitää saada oikea kortti). Rakennetaan jaon
 *  SNAPSHOT-kentistä: kokonaisia lähdeolioita ei tallenneta palvelimelle
 *  (auditoinnin linjaus), joten tämä on tarkoituksella oma komponenttinsa
 *  eikä sovelluksen EventDetailPanel. Paluuele ja Escape sulkevat. */
function JaettuAskelPaneeli({ askel, paiva, onClose }: { askel: JaettuAskelDTO | null; paiva?: string | null; onClose: () => void }) {
  const { t } = useLanguage()
  const panelRef = useRef<HTMLDivElement>(null)
  useDialogiFokus(!!askel, panelRef, onClose)
  useTaaksepain(!!askel, onClose)
  if (!askel) return null
  const aukiolo = aukioloRivi(askel.aukiolot, paiva)
  const viikko = viikkoAukiolot(askel.aukiolot, paiva)
  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center" role="dialog" aria-modal="true">
      <div className="absolute inset-0" style={{ background: 'rgba(0,0,0,.62)', backdropFilter: 'blur(4px)' }} onClick={onClose} />
      <div ref={panelRef} tabIndex={-1}
        className="relative w-full sm:max-w-lg max-h-[88vh] overflow-y-auto rounded-t-3xl sm:rounded-3xl outline-none"
        style={{ background: '#111219', border: '1px solid rgba(255,255,255,.1)', boxShadow: '0 -18px 60px rgba(0,0,0,.6)' }}>
        {askel.kuva && (
          /* eslint-disable-next-line @next/next/no-img-element */
          <img src={askel.kuva} alt="" className="w-full object-cover" style={{ aspectRatio: '16 / 10' }} />
        )}
        <button onClick={onClose} aria-label={t('common.close')}
          className="absolute top-3 right-3 p-2 rounded-full text-white"
          style={{ background: 'rgba(0,0,0,.55)', backdropFilter: 'blur(6px)' }}>
          <X size={18} />
        </button>
        <div className="p-5 pb-7 space-y-3">
          {askel.tyyppiNimike && (
            <p className="text-[11px] font-black uppercase tracking-[.12em] text-white/35">{askel.tyyppiNimike}</p>
          )}
          <h2 className="font-black text-white text-[22px] leading-tight" style={{ letterSpacing: '-0.02em' }}>
            {ROOLI_EMOJI[askel.rooli ?? ''] ?? '📍'} {askel.nimi}
          </h2>
          {(aukiolo || askel.arvosana !== undefined) && (
            <div className="flex items-center gap-2 flex-wrap">
              {aukiolo && (
                <span className="px-2.5 py-1 rounded-full text-[12px] font-bold"
                  style={aukiolo.auki
                    ? { background: 'rgba(16,185,129,.13)', color: '#34d399' }
                    : { background: 'rgba(255,159,67,.13)', color: '#ff9f43' }}>
                  {aukiolo.auki ? '● ' : '○ '}{aukiolo.teksti}
                </span>
              )}
              {askel.arvosana !== undefined && (
                <span className="px-2.5 py-1 rounded-full text-[12px] font-bold text-white/80"
                  style={{ background: 'rgba(255,255,255,.08)' }}>
                  ⭐ {askel.arvosana.toFixed(1).replace('.', ',')}{askel.arvosteluja ? ` (${askel.arvosteluja})` : ''}
                </span>
              )}
            </div>
          )}
          {/* Tietolaatikko — sama rakenne kuin sovelluksen korteissa */}
          {(askel.klo || askel.paikkaNimi || askel.osoite || askel.hinta || askel.puhelin) && (
            <div className="rounded-2xl p-3.5 space-y-2" style={{ background: 'rgba(255,255,255,.04)', border: '1px solid rgba(255,255,255,.08)' }}>
              {askel.ankkuriISO ? (
                /* Tapahtuma: sama aikarivi kuin sovelluksen kortissa
                   ("su 6. syyskuuta klo 19.00–20.15"). */
                <p className="text-[13.5px] font-bold text-white/85">🕐 <span style={{ color: '#a3abff' }}>{formatDateRange(askel.ankkuriISO, askel.loppuISO ?? null, 'fi')}</span></p>
              ) : askel.klo ? (
                <p className="text-[13.5px] font-bold text-white/85">🕐 <span style={{ color: '#a3abff' }}>klo {askel.klo}</span></p>
              ) : null}
              {(askel.paikkaNimi || askel.osoite) && (
                <p className="text-[13.5px] font-bold text-white/85">
                  📍 {askel.paikkaNimi}{askel.paikkaNimi && askel.osoite ? <span className="text-white/45 font-semibold"> · {askel.osoite}</span> : !askel.paikkaNimi ? askel.osoite : null}
                </p>
              )}
              {askel.hinta && <p className="text-[13.5px] font-bold text-white/85">🎟 {askel.hinta}</p>}
              {askel.puhelin && (
                <p className="text-[13.5px] font-bold">
                  <a href={`tel:${askel.puhelin.replace(/[^+0-9]/g, '')}`} className="text-white/85">📞 {askel.puhelin}</a>
                </p>
              )}
            </div>
          )}
          {viikko && (
            <div className="rounded-2xl p-3.5" style={{ background: 'rgba(255,255,255,.04)', border: '1px solid rgba(255,255,255,.08)' }}>
              {viikko.map((r) => (
                <p key={r.nimi} className="flex justify-between text-[12.5px] py-0.5 font-bold"
                  style={{ color: r.tanaan ? '#a3abff' : 'rgba(255,255,255,.5)' }}>
                  <span className="capitalize">{r.nimi}</span><span>{r.tunnit}</span>
                </p>
              ))}
            </div>
          )}
          {askel.kuvaus && <p className="text-white/60 text-[14px] leading-relaxed whitespace-pre-line">{askel.kuvaus}</p>}
          {askel.linkki && (
            <a href={askel.linkki} target="_blank" rel="noopener noreferrer"
              className="inline-flex items-center gap-2 px-5 py-3 rounded-xl font-black text-white text-[14px] mt-1 transition-all active:scale-95"
              style={{ background: 'linear-gradient(150deg,#6b76ff,#5059e6)', boxShadow: '0 8px 20px -6px rgba(91,101,230,.6)' }}>
              {t('common.more_info')} →
            </a>
          )}
        </div>
      </div>
    </div>
  )
}

/** Askellista aikajanakiskolla — napautus avaa kunnollisen infopaneelin
 *  (JaettuAskelPaneeli). Numeropallot lasketaan SAMALLA säännöllä kuin
 *  kartan pinnit (PlannerMap numeroi koordinaatilliset askeleet
 *  järjestyksessä) — kortin ② on siis aina kartan ②. Koordinaatiton
 *  askel saa numerottoman pisteen. */
export function JaettuAskeleet({ askeleet, paiva }: { askeleet: JaettuAskelDTO[]; paiva?: string | null }) {
  const [valittu, setValittu] = useState<JaettuAskelDTO | null>(null)
  let pinNro = 0
  const nrot = askeleet.map((a) => (a.lat != null && a.lon != null ? ++pinNro : null))
  return (
    <div className="relative">
      {/* Kisko numeropallojen takana — pallot peittävät sen omalla taustallaan */}
      <div className="absolute left-[13px] top-8 bottom-8 w-px" style={{ background: 'rgba(255,255,255,.12)' }} />
      <div className="space-y-2">
        {askeleet.map((a, i) => (
          <div key={i}>
            {a.kavelyMin !== undefined && a.kavelyMin !== null && (
              <div className="flex items-center gap-3 py-0.5">
                <span className="w-7 shrink-0" />
                <span className="text-white/30 text-[11px] font-bold">🚶 {a.kavelyMin} min kävely</span>
              </div>
            )}
            <div className="flex gap-3 items-stretch">
              <span className="relative shrink-0 w-7 flex flex-col items-center pt-3">
                {nrot[i] !== null ? (
                  <span className="w-7 h-7 shrink-0 rounded-full flex items-center justify-center text-[11px] font-black text-white"
                    style={{ background: '#6b76ff', border: '2px solid rgba(255,255,255,.28)', boxShadow: '0 2px 10px rgba(0,0,0,.55)' }}>
                    {nrot[i]}
                  </span>
                ) : (
                  <span className="w-2.5 h-2.5 mt-2 shrink-0 rounded-full"
                    style={{ background: 'rgba(255,255,255,.3)', boxShadow: '0 0 0 5px #0a0a0c' }} />
                )}
                {/* Viimeinen askel peittää kiskon pallon alapuolelta — muuten
                    kisko jatkuisi avatun infokortin ohi tyhjään. */}
                {i === askeleet.length - 1 && (
                  <span className="absolute left-0 right-0 bottom-0" style={{ top: 44, background: '#0a0a0c' }} />
                )}
              </span>
              <button onClick={() => setValittu(a)}
                className="min-w-0 flex-1 text-left flex gap-3 rounded-2xl p-3 items-start"
                style={{ background: 'rgba(255,255,255,.04)', border: '1px solid rgba(255,255,255,.08)' }}>
                <span className="shrink-0 w-[46px] text-center text-[#a3abff] font-black text-[14px] pt-0.5">{a.klo ?? ''}</span>
                {a.kuva && (
                  /* eslint-disable-next-line @next/next/no-img-element */
                  <img src={a.kuva} alt="" className="w-12 h-12 rounded-xl object-cover shrink-0" />
                )}
                <span className="min-w-0 flex-1">
                  <span className="block font-bold text-white text-[15px] leading-snug">{ROOLI_EMOJI[a.rooli ?? ''] ?? '📍'} {a.nimi}</span>
                  {a.osoite && <span className="block text-white/40 text-[12.5px] truncate">{a.osoite}</span>}
                </span>
                <span className="shrink-0 self-center text-white/25 text-[18px] font-bold pr-0.5">›</span>
              </button>
            </div>
          </div>
        ))}
      </div>
      <JaettuAskelPaneeli askel={valittu} paiva={paiva} onClose={() => setValittu(null)} />
    </div>
  )
}

export function JaettuKartta({ askeleet }: { askeleet: JaettuAskelDTO[] }) {
  const { t } = useLanguage()
  const itemit = useMemo(
    () => askeleet
      .filter((a) => a.lat != null && a.lon != null)
      .map((a) => ({ title: `${a.klo ?? ''} ${a.nimi}`.trim(), location: a.osoite ?? '', coords: [a.lat!, a.lon!] as [number, number] })),
    [askeleet],
  )
  // Sama Google Maps -kävelyreitti kuin omassa suunnitelmassa — myös linkin
  // saanut kaveri pääsee suoraan navigoimaan.
  const reittiUrl = useMemo(() => reittiohjeUrl(askeleet), [askeleet])
  if (itemit.length === 0) return null
  return (
    <div className="space-y-2">
      <div className="rounded-2xl overflow-hidden border border-white/10" style={{ height: 260 }}>
        <PlannerMap items={itemit} />
      </div>
      {reittiUrl && (
        <a href={reittiUrl} target="_blank" rel="noopener noreferrer"
          onClick={() => track('external_click', { surface: 'jaettu', label: 'reittiohjeet' })}
          className="flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl font-bold text-[13px] border border-white/10 text-white/70 hover:text-white transition-colors">
          <Navigation size={14} /> {t('plan.directions')} ↗
        </a>
      )}
    </div>
  )
}

export function JaettuToiminnot({ token, otsikko, paiva, alkuKlo, askeleet }: {
  token: string
  otsikko: string | null
  paiva: string | null
  alkuKlo: string | null
  askeleet: JaettuAskelDTO[]
}) {
  const { t } = useLanguage()
  const router = useRouter()
  const [kopioitu, setKopioitu] = useState(false)
  const [poistettu, setPoistettu] = useState(false)
  // Poistonappi näkyy vain tekijälle: avain tallentui jakohetkellä.
  const poistoAvain = useMemo(() => {
    try {
      return (JSON.parse(localStorage.getItem('jaetut-suunnitelmat') ?? '{}') as Record<string, string>)[token] ?? null
    } catch { return null }
  }, [token])

  function kopioi() {
    const roolit: AskelRooli[] = ['tekeminen', 'ruoka', 'drinkit', 'ohjelma']
    korvaaSuunnitelma({
      otsikko: otsikko ?? '',
      paiva: paiva ?? '',
      alkuKlo: alkuKlo ?? undefined,
      askeleet: askeleet.map((a): SuunnitelmaAskel => ({
        id: '',
        tyyppi: (['tapahtuma', 'ravintola', 'paikka'].includes(a.tyyppi) ? a.tyyppi : 'oma') as SuunnitelmaAskel['tyyppi'],
        nimi: a.nimi,
        osoite: a.osoite,
        lat: a.lat,
        lon: a.lon,
        kuva: a.kuva ?? null,
        ankkuriISO: a.ankkuriISO,
        // Jaetut ajat säilyvät kopiossa käsin asetettuina — muokattavissa.
        kasinKlo: a.ankkuriISO ? undefined : a.klo,
        rooli: roolit.includes(a.rooli as AskelRooli) ? (a.rooli as AskelRooli) : 'tekeminen',
        // Koko tilannekuva mukaan: kopioitu suunnitelma säilyttää infokortit,
        // aukiolovaroitukset ja uudelleenjaossa samat tiedot.
        aukiolot: a.aukiolot ?? null,
        loppuISO: a.loppuISO,
        kuvaus: a.kuvaus,
        linkki: a.linkki ?? null,
        paikkaNimi: a.paikkaNimi,
        hinta: a.hinta ?? null,
        tyyppiNimike: a.tyyppiNimike,
        puhelin: a.puhelin ?? null,
        arvosana: a.arvosana,
        arvosteluja: a.arvosteluja,
      })),
    })
    setKopioitu(true)
    setTimeout(() => router.push('/'), 900)
  }

  async function poista() {
    if (!poistoAvain || !confirm(t('plan.clear_confirm'))) return
    const res = await fetch('/api/suunnitelma', {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ token, avain: poistoAvain }),
    })
    if (res.ok) setPoistettu(true)
  }

  if (poistettu) return <p className="text-emerald-400 font-bold text-[14px]">✓ {t('plan.deleted')}</p>

  return (
    <div className="space-y-2">
    <div className="flex items-center gap-2 flex-wrap">
      <button onClick={kopioi}
        className="px-5 py-3 rounded-xl font-black text-white text-[14px] transition-all active:scale-95"
        style={{ background: 'linear-gradient(150deg,#6b76ff,#5059e6)', boxShadow: '0 8px 20px -6px rgba(91,101,230,.6)' }}>
        {kopioitu ? `✓ ${t('plan.copied')}` : `🗓 ${t('plan.copy_template')}`}
      </button>
      <a href="/" className="px-4 py-3 rounded-xl font-bold text-white/60 hover:text-white text-[13px] border border-white/10 transition-colors">
        {t('plan.open_app')}
      </a>
      {poistoAvain && (
        <button onClick={poista}
          className="px-4 py-3 rounded-xl font-bold text-[13px] border transition-colors"
          style={{ color: '#ff9f43', borderColor: 'rgba(255,159,67,.35)' }}>
          {t('plan.delete_shared')}
        </button>
      )}
    </div>
    {/* Vastaanottajan kaksi luontevaa huolta ("mitä minulle tapahtuu?" ja
        "sotkenko kaverin suunnitelman?") kuitataan ennen painallusta. */}
    <p className="text-white/35 text-[12px] font-bold">{t('plan.copy_hint')}</p>
    </div>
  )
}

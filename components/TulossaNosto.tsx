'use client'

// "✦ JOULUKUUN NOSTO" — etusivun kärkinosto (lib/nostot). Osion otsikko on
// tapahtuman kuukausi (kuukausiOtsikko): "Joulukuun nosto", useammalle
// "Joulukuun nostot"; eri kuukausien nostot ovat omia ryhmiään omalla
// otsikollaan (omistaja 4.11.2026). Yksi leveä kortti per nosto:
// juliste vasemmalla, päivä + paikka, otsikko, koukkurivi (esiintyjät),
// sosiaalinen todiste ja lippunappi hintoineen. "Mainos"-merkki maksetuissa.
//
// MIKSI NÄIN (omistaja 27.10.2026: "tästä pitää olla hyötyä artistille"):
// kortti ei vain kerro vaan myy — nimet, hinta ja todiste vastaavat kysymyksiin
// ennen klikkausta, kuten heron "Liput alk. 30€" -nappi. Kortti on matala
// (HANDOFF-mobiili: etusivu ei saa työntää Illan nostoja ruudun alle), mutta
// juliste on tarpeeksi iso erottuakseen ruudukosta. Juliste on 128 × 171 px
// myös puhelimessa (omistaja 3.11.2026: 104 px oli liian pieni). Julisteen
// napautus avaa infopaneelin kuten muukin kortti (omistaja 23.11.2026: "kun
// kortista painaa kuvaa niin se näyttää kuvan vaan, sen pitäisi viedä info
// kortin aukaisuun siitäkin"). Aiemmin juliste avautui koko kokoon
// (components/Kuvakatselu); paneelissa kuva näkyy jo isona.
//
// TYÖPÖYTÄ (omistaja 12.11.2026: "tietokoneella nostokortti on vaisu"):
// puhelimen mitat 1 180 px leveässä kortissa jättivät kaksi kolmasosaa
// tyhjäksi. md-leveydestä (768 px) ylöspäin juliste on 184 × 245 px ja otsikko
// 30–38 px; lg-leveydestä (1024 px) ylöspäin oikeassa reunassa on oma palsta:
// päivä isolla, viikonpäivä + kellonaika ja lippunappi, ja ylärivillä on
// silloin vain paikka, ettei päivä toistu. Kolmas palsta vasta lg:stä, koska
// 800 px:n tabletilla se katkaisi otsikon. lg:stä ylöspäin juliste on 232 × 309
// px kiinni kortin vasemmassa reunassa koko korkeudelta (omistaja 12.11.2026:
// "miksi kuva on niin pieni verrattuna laatikkoon" — pystykuva täytti jo
// korkeuden, joten ainoa keino on korkeampi kortti ja juliste ilman kehystä).
// Puhelimen asettelu ei muutu; nappi on DOM:ssa kahdesti mutta vain toinen näkyy.
//
// YKSI ISO KORTTI, MUUT RIVEINÄ (omistaja 23.11.2026: "kännykällä kaksi
// nostoa ja pitää scrollata jonkin verran että pääsee tämän päivän
// tapahtumiin"). Sovelluksen lupaus on "mitä tänään", joten kärki ei saa
// työntää päivän tapahtumia kahden ruudullisen alle. Ensimmäinen nosto
// (omistajan jarjestys, käytännössä lähin) saa koko kortin; muut näkyvät sen
// alla yhtenä kapeana "Tulossa myös" -rivinä per nosto: päivä, otsikko ja
// nuoli. Rivin napautus avaa saman infopaneelin kuin kortti ja kirjaa
// promo_view'n samalla säännöllä, joten kampanjaraportti pysyy vertailukelpoisena
// (kapea rivi kerää vähemmän näyttöjä — se on oikea tieto, ei vika). Kun
// ensimmäinen nosto on ohi, seuraava nousee itsestään isoksi. Otsikko on
// ison kortin kuukausi ("Marraskuun nosto"); rivillä päivä kertoo kuukauden.
//
// Napautus avaa saman infopaneelin kuin muualla (onOpen → pinta 'promo');
// lippunappi vie suoraan lippukauppaan ja kirjautuu external_clickinä samalla
// pinnalla — kampanjan luvut erottuvat herosta ja ruudukosta. Kortti on div
// eikä button, koska sen sisällä on linkki: button-elementin sisään ei saa
// laittaa toista interaktiivista elementtiä.
//
// NÄYTTÖKERTA (omistaja 3.11.2026: "jotta voin osoittaa miten tapahtumaa on
// klikattu" — napautusluku ilman nähtyjen lukua ei kerro mitään). Kortti
// kirjaa promo_view'n, kun vähintään puolet siitä on ollut ruudulla ja
// välilehti on esillä. KERRAN PER SIVULATAUS per nosto, ei per renderöinti:
// osion vaihto (Kartta → Tapahtumat) liittää kortin uudestaan, eikä sama
// katsoja saa paisuttaa näyttökertoja. Kirjaus menee samaa putkea kuin
// pageview (lib/track), joten kehityspalvelin, ?notrack=1 ja admin-istunto
// jäävät pois. Ei tunnistetta — sama tietosuoja-asema kuin sivun avauksella.

import { useEffect, useRef, type RefObject } from 'react'
import { Ticket, ArrowUpRight } from 'lucide-react'
import type { Event } from '@/lib/types'
import { kuukausiOtsikko, ryhmitteleKuukausittain, type Nosto } from '@/lib/nostot'
import { useLanguage } from '@/contexts/LanguageContext'
import { affiliateUrl, stripPriceFromPrefix } from '@/lib/utils'
import { track } from '@/lib/track'
import { externalUrlFor } from '@/lib/event-links'
import { formatEventDate, nostoPaivays } from '@/lib/helsinki-time'

function verkkotunnus(url: string): string {
  try { return new URL(url).hostname.replace(/^www\./, '') } catch { return '' }
}

/** Nostot, joiden näyttökerta on jo kirjattu tällä sivulatauksella. */
const kirjatutNaytot = new Set<string>()

function kirjaaNaytto(n: Nosto): void {
  if (kirjatutNaytot.has(n.id)) return
  kirjatutNaytot.add(n.id)
  // meta = noston tunniste, jotta saman tapahtuman kaksi kampanjaa erottuvat.
  track('promo_view', { surface: 'promo', eventId: n.event.id, label: n.event.title, meta: n.id })
}

/** Kirjaa näyttökerran, kun kortti on ollut puoliksi ruudulla esillä olevalla
 *  välilehdellä. Taustavälilehdelle auennut sivu odottaa, kunnes välilehti
 *  tulee esiin — "nähty" tarkoittaa nähtyä. */
function useNayttokerta(ref: RefObject<HTMLDivElement | null>, n: Nosto): void {
  useEffect(() => {
    const el = ref.current
    if (!el || kirjatutNaytot.has(n.id)) return
    // Ilman IntersectionObserveria (hyvin vanha selain) kirjataan heti:
    // kortti on etusivun kärjessä, joten se on käytännössä ruudulla.
    if (typeof IntersectionObserver === 'undefined') { kirjaaNaytto(n); return }
    const kunValilehtiEsilla = () => {
      if (document.visibilityState !== 'visible') return
      document.removeEventListener('visibilitychange', kunValilehtiEsilla)
      kirjaaNaytto(n)
    }
    const vahti = new IntersectionObserver((merkinnat) => {
      if (!merkinnat.some((m) => m.isIntersecting)) return
      vahti.disconnect()
      if (document.visibilityState === 'visible') kirjaaNaytto(n)
      else document.addEventListener('visibilitychange', kunValilehtiEsilla)
    }, { threshold: 0.5 })
    vahti.observe(el)
    return () => {
      vahti.disconnect()
      document.removeEventListener('visibilitychange', kunValilehtiEsilla)
    }
  }, [ref, n])
}

export default function TulossaNosto({ nostot, onOpen }: { nostot: Nosto[]; onOpen: (e: Event) => void }) {
  const { lang, t } = useLanguage()
  if (nostot.length === 0) return null
  const [iso, ...muut] = nostot
  const kuukausi = ryhmitteleKuukausittain([iso])[0].kuukausi
  return (
    <section aria-label={t('promo.title')} className="mt-1 md:mt-5">
      {/* Otsikko ison kortin kuukaudesta; yleinen "Tulossa" vain jos kuukautta ei saada. */}
      <p className="text-[11px] font-black uppercase tracking-[.12em] mb-2" style={{ color: 'rgba(255,255,255,.5)' }}>
        ✦ {kuukausiOtsikko(kuukausi, 1, lang === 'en' ? 'en' : 'fi') ?? t('promo.title')}
      </p>
      <NostoKortti n={iso} onOpen={onOpen} />
      {muut.length > 0 && (
        <div className="mt-2 space-y-1.5">
          {muut.map((n) => <NostoRivi key={n.id} n={n} onOpen={onOpen} />)}
        </div>
      )}
    </section>
  )
}

/** Kapea rivi toiselle ja sitä seuraaville nostoille: "Tulossa myös ·
 *  ke 9.12. · Jannan joulu – Ystävien kanssa →". Pieni juliste vasemmalla,
 *  jotta rivi tunnistuu samaksi tapahtumaksi kuin myöhemmin iso kortti. */
function NostoRivi({ n, onOpen }: { n: Nosto; onOpen: (e: Event) => void }) {
  const { lang, t } = useLanguage()
  const rivi = useRef<HTMLDivElement>(null)
  useNayttokerta(rivi, n)
  const e = n.event
  const kieli = lang === 'en' ? 'en' : 'fi'
  const avaa = () => onOpen(e)
  return (
    <div ref={rivi} role="button" tabIndex={0} onClick={avaa}
      onKeyDown={(ev) => { if (ev.key === 'Enter' || ev.key === ' ') { ev.preventDefault(); avaa() } }}
      className="relative flex items-center gap-3 rounded-xl px-3 py-2 cursor-pointer focus:outline-none focus-visible:ring-2 focus-visible:ring-[#6b76ff]"
      style={{ background: '#111118', border: '1px solid rgba(107,118,255,.18)' }}>
      {e.image ? (
        /* eslint-disable-next-line @next/next/no-img-element */
        <img src={e.image} alt="" className="block w-[36px] h-[48px] rounded-md object-cover shrink-0" />
      ) : (
        <div className="w-[36px] h-[48px] rounded-md shrink-0 flex items-center justify-center text-base" style={{ background: 'rgba(255,255,255,.06)' }}>✦</div>
      )}
      <div className="min-w-0 flex-1">
        <p className="text-[10.5px] font-black uppercase tracking-[.12em] truncate" style={{ color: '#a3abff' }}>
          {t('promo.also')} · {formatEventDate(e.startTime, kieli)}
        </p>
        <p className="text-[14px] md:text-[15px] font-black text-white leading-tight truncate">{e.title}</p>
      </div>
      {n.mainos && (
        <span className="text-[10px] font-black uppercase tracking-[.1em] px-2 py-0.5 rounded-full shrink-0"
          style={{ background: 'rgba(255,255,255,.14)', color: 'rgba(255,255,255,.85)' }}>{t('promo.ad')}</span>
      )}
      <ArrowUpRight size={16} className="shrink-0" style={{ color: '#a3abff' }} />
    </div>
  )
}

/** Yksi nostokortti. Oma komponentti, jotta näyttökerran vahti (hook) saa
 *  oman viitteen jokaiseen korttiin. */
function NostoKortti({ n, onOpen }: { n: Nosto; onOpen: (e: Event) => void }) {
  const { lang, t } = useLanguage()
  const kortti = useRef<HTMLDivElement>(null)
  useNayttokerta(kortti, n)
  const e = n.event
  const url = externalUrlFor(e)
  const kieli = lang === 'en' ? 'en' : 'fi'
  // Sama kaava kuin heron CTA:ssa: hinta nappiin, jos se tiedetään.
  const nappi = e.isFree
    ? t('common.free')
    : e.price
      ? `${t('discover.tickets_from')} ${stripPriceFromPrefix(e.price)}`
      : e.ticketUrl && url === e.ticketUrl ? t('promo.tickets') : t('promo.more')
  const avaa = () => onOpen(e)
  const kuva = e.image
  const paikka = e.location?.name
  // Työpöydän päivälohko. Ilman kelvollista aikaa kortti pysyy yksipalstaisena
  // ja ylärivi näyttää päivän kaikilla leveyksillä.
  const paiva = nostoPaivays(e.startTime, kieli)
  const lippunappi = (koko: 'puhelin' | 'tyopoyta') => url && (
    <a href={affiliateUrl(url) ?? url} target="_blank" rel="noopener noreferrer"
      onClick={(ev) => { ev.stopPropagation(); track('external_click', { surface: 'promo', eventId: e.id, label: e.title, meta: verkkotunnus(url) }) }}
      className={koko === 'tyopoyta'
        ? 'hidden lg:inline-flex items-center gap-2 px-5 py-3 rounded-xl text-[15px] font-black text-white whitespace-nowrap'
        : `shrink-0 inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-[13px] font-black text-white${paiva ? ' lg:hidden' : ''}`}
      style={{ background: 'linear-gradient(150deg,#6b76ff,#5059e6)', boxShadow: '0 8px 20px -8px rgba(91,101,230,.9)' }}>
      <Ticket size={koko === 'tyopoyta' ? 16 : 14} /> {nappi} <ArrowUpRight size={koko === 'tyopoyta' ? 15 : 13} />
    </a>
  )
  return (
    <div ref={kortti} role="button" tabIndex={0} onClick={avaa}
      onKeyDown={(ev) => { if (ev.key === 'Enter' || ev.key === ' ') { ev.preventDefault(); avaa() } }}
      className="relative overflow-hidden rounded-2xl md:rounded-[22px] cursor-pointer focus:outline-none focus-visible:ring-2 focus-visible:ring-[#6b76ff]"
      style={{ background: '#111118', border: '1px solid rgba(107,118,255,.25)' }}>
      {/* Tausta: sama juliste sumennettuna ja tummennettuna. Työpöydällä
          juliste saa näkyä enemmän ja oikea reuna jää valoisammaksi. */}
      {e.image && (
        <div className="absolute inset-0 bg-cover bg-center opacity-45 md:opacity-60" style={{ backgroundImage: `url(${e.image})`, filter: 'blur(28px) saturate(1.2)', transform: 'scale(1.3)' }} />
      )}
      <div className="absolute inset-0 md:hidden" style={{ background: 'linear-gradient(90deg, rgba(10,10,12,.86) 0%, rgba(10,10,12,.72) 55%, rgba(10,10,12,.55) 100%)' }} />
      <div className="absolute inset-0 hidden md:block" style={{ background: 'radial-gradient(60% 130% at 88% 50%, rgba(255,255,255,.08), transparent 70%), linear-gradient(90deg, rgba(10,10,12,.9) 0%, rgba(10,10,12,.74) 40%, rgba(10,10,12,.42) 100%)' }} />

      <div className="relative flex gap-3.5 p-3.5 md:gap-6 md:p-6 lg:gap-0 lg:p-0 items-stretch">
        {kuva ? (
          /* Pelkkä kuva: napautus kuplii kortin onClickiin ja avaa infopaneelin. */
          // eslint-disable-next-line @next/next/no-img-element
          <img src={kuva} alt="" className="block shrink-0 w-[128px] h-[171px] md:w-[184px] md:h-[245px] lg:w-[232px] lg:h-[309px] object-cover rounded-xl md:rounded-2xl lg:rounded-none shadow-[0_16px_40px_-14px_rgba(0,0,0,.85)] lg:shadow-none" />
        ) : (
          <div className="w-[128px] h-[171px] md:w-[184px] md:h-[245px] lg:w-[232px] lg:h-[309px] rounded-xl md:rounded-2xl lg:rounded-none shrink-0 flex items-center justify-center text-3xl" style={{ background: 'rgba(255,255,255,.06)' }}>✦</div>
        )}
        <div className="min-w-0 flex-1 flex flex-col lg:justify-center lg:py-6 lg:pl-7 lg:pr-6">
          {/* Oikean reunan varaus vain kun Mainos-merkki on kulmassa — muuten
              päivä ja paikka saavat koko palstan (isompi juliste kavensi sitä).
              Leveällä ruudulla päivä on omassa lohkossaan, joten ylärivillä on vain paikka. */}
          <p className={`text-[11px] md:text-[12px] font-black uppercase tracking-[.12em]${n.mainos ? (paiva ? ' pr-16 lg:pr-0' : ' pr-16') : ''}`} style={{ color: '#a3abff' }}>
            <span className={paikka && paiva ? 'lg:hidden' : undefined}>{formatEventDate(e.startTime, kieli)}</span>
            {paikka && <><span className={paiva ? 'lg:hidden' : undefined}> · </span>{paikka}</>}
          </p>
          {/* Puhelimessa kolme riviä: isompi juliste kaventaa tekstipalstan. */}
          <h3 className="font-black text-white leading-[1.05] mt-1 md:mt-2 text-[20px] md:text-[30px] lg:text-[34px] xl:text-[38px] line-clamp-3 md:line-clamp-2" style={{ letterSpacing: '-0.02em' }}>
            {e.title}
          </h3>
          {n.koukku && (
            <p className="text-[13px] md:text-[16px] xl:text-[17px] text-white/80 leading-snug mt-1 md:mt-2 line-clamp-2">{n.koukku}</p>
          )}
          <div className="mt-auto lg:mt-4 pt-2 lg:pt-0 flex items-end justify-between gap-3 flex-wrap">
            {n.todiste ? (
              <p className="text-[11.5px] md:text-[13.5px] font-bold leading-snug" style={{ color: '#fcd34d' }}>★ {n.todiste}</p>
            ) : <span />}
            {lippunappi('puhelin')}
          </div>
        </div>
        {paiva && (
          <div className={`hidden lg:flex flex-col items-end justify-between shrink-0 pl-6 pr-6 py-6 min-w-[224px] border-l border-white/10${n.mainos ? ' pt-12' : ''}`}>
            <div className="text-right">
              <p className="text-[44px] xl:text-[52px] font-black text-white leading-none" style={{ letterSpacing: '-0.03em' }}>{paiva.paiva}</p>
              <p className="mt-2 text-[12px] font-black uppercase tracking-[.12em]" style={{ color: '#a3abff' }}>{paiva.rivi}</p>
            </div>
            {lippunappi('tyopoyta')}
          </div>
        )}
      </div>

      {/* "Mainos": lakisääteinen merkintä maksetussa nostossa — aina näkyvissä */}
      {n.mainos && (
        <span className="absolute top-3 right-3 text-[10px] font-black uppercase tracking-[.1em] px-2 py-0.5 rounded-full"
          style={{ background: 'rgba(255,255,255,.14)', color: 'rgba(255,255,255,.85)', backdropFilter: 'blur(6px)' }}>
          {t('promo.ad')}
        </span>
      )}
    </div>
  )
}

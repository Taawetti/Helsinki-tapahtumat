'use client'

// Kävijätilastot admin-näkymässä.
//
// MIKSI OMA TIEDOSTO: app/admin/page.tsx on jo yli tuhat riviä, eikä siitä
// kannata tehdä pidempää. Välilehti kutsuu tätä yhdellä rivillä.
//
// EI KAAVIOKIRJASTOA. Palkit ovat diveja ja leveys on prosentti suurimmasta —
// sama kuvio kuin julkisella /raportti-sivulla. Kirjaston lisääminen kasvattaisi
// pakettia eikä toisi tähän mitään.

import { useCallback, useEffect, useState } from 'react'
import { onkoPoissuljettu, asetaPoissulku } from '@/lib/track'
import { helsinkiToday } from '@/lib/helsinki-time'
import { siirraPaivaa, type TapahtumaTilasto } from '@/lib/kavijatilastot'

interface Rivi { nimi: string; maara: number }
interface Data {
  paivat: number
  rivejaLuettu: number
  kattoTayttyi: boolean
  maarat: Record<string, number>
  kaynnit: number
  sivut: Rivi[]
  tapahtumatAvaukset: Rivi[]
  lippuklikit: Rivi[]
  ulkoisetKlikit: Rivi[]
  suosikit: Rivi[]
  pinnat: Rivi[]
  osiot: Rivi[]
  oppaat: Rivi[]
  kategoriat: Rivi[]
  haut: Rivi[]
  maat: Rivi[]
  maatLippuklikit: Rivi[]
  ilmanMaata: number
  kaupungitFI: Rivi[]
  kaupungitFILippu: Rivi[]
  maakunnat: Record<string, number>
  kaupunkiMaarat: Record<string, number>
  eriKavijat: number
  kavijatKuukausittain: Record<string, number>
  ilmanKavijaa: number
  from: string
  to: string
  paivittain: { paiva: string; kaynnit: number; kavijat: number; avaukset: number; ulkoiset: number }[]
  tapahtumat: { id: string; nimi: string; maara: number }[]
  tapahtuma: TapahtumaTilasto | null
  lippukauppaKlikit: Rivi[]
}

const KUUKAUDET = ['tammi','helmi','maalis','huhti','touko','kesä','heinä','elo','syys','loka','marras','joulu']
const kuukausiNimi = (avain: string) => {
  const [v, k] = avain.split('-')
  const i = Number(k) - 1
  return KUUKAUDET[i] ? `${KUUKAUDET[i]}kuu ${v}` : avain
}

// Suomen maakunnat ISO 3166-2 -koodeilla. KAIKKI 19 näytetään aina, myös ne
// joista ei ole yhtään käyntiä — omistajan pyyntö. Tyhjä maakunta on itsessään
// tieto: se kertoo mistä päin Suomea EI vielä tulla.
const MAAKUNNAT: [string, string][] = [
  ['18', 'Uusimaa'], ['19', 'Varsinais-Suomi'], ['11', 'Pirkanmaa'],
  ['14', 'Pohjois-Pohjanmaa'], ['08', 'Keski-Suomi'], ['15', 'Pohjois-Savo'],
  ['17', 'Satakunta'], ['16', 'Päijät-Häme'], ['09', 'Kymenlaakso'],
  ['06', 'Kanta-Häme'], ['13', 'Pohjois-Karjala'], ['12', 'Pohjanmaa'],
  ['03', 'Etelä-Pohjanmaa'], ['02', 'Etelä-Karjala'], ['04', 'Etelä-Savo'],
  ['10', 'Lappi'], ['05', 'Kainuu'], ['07', 'Keski-Pohjanmaa'], ['01', 'Ahvenanmaa'],
]

// Kymmenen suurinta kaupunkia väkiluvun mukaan. Nimet ovat samassa muodossa
// jossa sijaintipalvelu ne antaa, jotta osuma löytyy.
const SUURET_KAUPUNGIT = [
  'Helsinki', 'Espoo', 'Tampere', 'Vantaa', 'Oulu',
  'Turku', 'Jyväskylä', 'Kuopio', 'Lahti', 'Pori',
]

// Maakoodit ihmisluettavaksi. Vain yleisimmät nimetään; muut näkyvät koodina,
// mikä on parempi kuin väärä tai puuttuva nimi.
const MAAT: Record<string, string> = {
  FI: 'Suomi', SE: 'Ruotsi', NO: 'Norja', DK: 'Tanska', EE: 'Viro',
  DE: 'Saksa', GB: 'Britannia', US: 'Yhdysvallat', FR: 'Ranska', NL: 'Alankomaat',
  ES: 'Espanja', IT: 'Italia', PL: 'Puola', RU: 'Venäjä', LV: 'Latvia', LT: 'Liettua',
  CA: 'Kanada', AU: 'Australia', JP: 'Japani', CH: 'Sveitsi', AT: 'Itävalta', BE: 'Belgia',
}
const maaNimi = (koodi: string) => MAAT[koodi] ? `${MAAT[koodi]} (${koodi})` : koodi

// Päiväkohtainen jakso (omistaja 25.10.2026): kaksi kahvaa, joilla valitaan
// alku- ja loppupäivä enintään MAX_PAIVAA päivää taaksepäin. Esiasetukset
// ensin — se on valitsin, johon tartutaan useimmin. Kaikki näkymän luvut
// lasketaan samasta jaksosta, jotta ne täsmäävät keskenään.
const MAX_PAIVAA = 120
const ESIASETUKSET: { nimi: string; alku: number; loppu: number }[] = [
  { nimi: 'Tänään', alku: 0, loppu: 0 },
  { nimi: 'Eilen', alku: 1, loppu: 1 },
  { nimi: '7 pv', alku: 6, loppu: 0 },
  { nimi: '30 pv', alku: 29, loppu: 0 },
  { nimi: '90 pv', alku: 89, loppu: 0 },
]
/** Seurattava tapahtuma muistetaan tällä laitteella — pelkkä käyttömukavuus. */
const SEURATTAVA_AVAIN = 'mt-admin-seurattava'

const muotoilePaiva = (paiva: string, vuosi = false) => {
  const [v, k, p] = paiva.split('-')
  return `${Number(p)}.${Number(k)}.${vuosi ? v : ''}`
}

// Ihmisluettavat nimet tapahtumatyypeille. Tietokannassa ne ovat lyhyitä
// tunnisteita, mutta näytöllä niiden pitää kertoa mitä ne tarkoittavat.
const NIMET: Record<string, string> = {
  pageview: 'Sivun avaus',
  engaged: 'Sitoutunut käynti',
  returning: 'Palaava kävijä',
  event_open: 'Tapahtuma avattu',
  ticket_click: 'Klikkaus lippukauppaan',
  external_click: 'Klikkaus ulos (lue lisää)',
  favorite_add: 'Tallennettu suosikiksi',
  section: 'Osion vaihto',
  guide_open: 'Opas avattu',
  category: 'Kategoria valittu',
  search: 'Haku',
  map_open: 'Kartta avattu',
  install: 'Sovellus asennettu',
  venue_events: 'Paikan tapahtumat avattu',
  newsletter: 'Uutiskirje tilattu',
  share: 'Suunnitelma jaettu',
  plan_add: 'Suunnitelmaan lisätty askel',
  plan_copy: 'Jaettu suunnitelma kopioitu',
}

// Yhden rivin selite jokaiseen laatikkoon: MISTÄ luku syntyy (omistajan
// pyyntö 6.9.2026). Lähde: track()-kutsupaikat — pidä ajan tasalla kun
// mittauspisteitä lisätään.
const SELITTEET: Record<string, string> = {
  pageview: 'Sivun avaus — kirjautuu heti, myös pelkkä lukeminen ilman klikkauksia.',
  engaged: 'Kerran käynnissä, kun käyttö ylittää kynnyksen (esim. toinen tapahtuma-avaus tai siirtymä lipunmyyjälle).',
  returning: 'Kävijä, jonka tunniste on nähty aiemminkin tässä kuussa — kerran käynnissä.',
  event_open: 'Tapahtumakortin avaus mistä tahansa: ruudukko, poiminnat, hero, haku, kartta, Idea, opas, paikan lista.',
  ticket_click: 'Siirtymä lipunmyyjän sivulle tapahtumakortista — lähin asia ostoon.',
  external_click: 'Muu klikkaus ulos: Lue lisää -linkit, paikkojen omat sivut, reittiohjeet.',
  favorite_add: 'Tapahtuma tallennettu suosikiksi (sydän).',
  section: 'Osion vaihto navigaatiosta (Tapahtumat, Idea, Ravintolat, Uutta, Suunnitelma).',
  guide_open: 'Opas avattu (saunat, kirpputorit, jamit, museot…).',
  category: 'Kategorialaatan valinta etusivulla.',
  search: 'Haku — vain vähintään 3 merkin haut, kirjataan kun kirjoittaminen loppuu.',
  map_open: 'Karttanäkymän avaus.',
  install: 'Sovellus asennettu kotivalikkoon. Lasketaan kahdella tavalla: selaimen asennuskehote hyväksyttiin (Android ja työpöytä-Chrome), TAI sovellus avattiin kotivalikon kuvakkeesta ensimmäistä kertaa tällä laitteella. Jälkimmäinen on ainoa tapa nähdä iPhone-asennukset — Apple ei kerro asennushetkeä, joten iPhone-asennus näkyy vasta kun sovellus avataan kotivalikosta.',
  venue_events: 'Infokortin päätoiminto "Paikan kaikki tapahtumat". Näkyy niillä tapahtumilla joilla ei ole omaa linkkiä eikä paikan kotisivua — ennen 13.9.2026 samassa kohdassa oli Google-hakunappi, joka kirjautui kohtaan "Klikkaus ulos".',
  newsletter: 'Uutiskirjeen tilaus lähetetty.',
  share: 'Suunnitelman "Jaa"-nappi: jakolinkki luotu palvelimelle.',
  plan_add: '"Lisää suunnitelmaan" -napin painallus tapahtuma-, ravintola- tai paikkakortissa.',
  plan_copy: 'Jaetun linkin vastaanottaja painoi "Tee tästä oma suunnitelma".',
}

function Palkit({ otsikko, rivit, selite }: { otsikko: string; rivit: Rivi[]; selite?: string }) {
  const max = Math.max(1, ...rivit.map((r) => r.maara))
  return (
    <div className="mb-8">
      <h3 className="text-sm font-bold text-white mb-1">{otsikko}</h3>
      {selite && <p className="text-xs text-gray-500 mb-3">{selite}</p>}
      {rivit.length === 0 ? (
        <p className="text-xs text-gray-600">Ei vielä dataa.</p>
      ) : (
        <div className="space-y-1.5">
          {rivit.map((r) => (
            <div key={r.nimi} className="flex items-center gap-3">
              <span className="text-xs text-gray-300 w-28 sm:w-64 shrink-0 truncate" title={r.nimi}>{r.nimi}</span>
              <div className="flex-1 h-4 rounded bg-white/5 overflow-hidden">
                <div className="h-full rounded" style={{
                  width: `${Math.round((r.maara / max) * 100)}%`,
                  background: 'linear-gradient(90deg,#6b76ff,#5059e6)',
                }} />
              </div>
              <span className="text-xs text-gray-400 w-12 shrink-0 text-right tabular-nums">{r.maara}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

interface PaivaArvo { paiva: string; arvo: number }

/** Päiväpylväät: yksi sarja, jokainen jakson päivä omana pylväänään (myös
 *  nollat). Pylväs enintään 24 px leveä, pyöristetty vain yläpäästä, 2 px
 *  väli; huippuarvo suoraan pylvään päälle ja muut arvot osoittimella.
 *  Päivämäärät harvakseltaan, jotta ne eivät mene päällekkäin. Divejä, ei
 *  kaaviokirjastoa — sama linja kuin Palkit-komponentissa. */
function PaivaPylvaat({ otsikko, sarja, selite }: { otsikko: string; sarja: PaivaArvo[]; selite?: string }) {
  const n = sarja.length
  const max = Math.max(1, ...sarja.map((s) => s.arvo))
  const summa = sarja.reduce((a, s) => a + s.arvo, 0)
  const huippu = sarja.findIndex((s) => s.arvo === max)
  // Akselin päivämäärät: noin kuusi tasavälein ja viimeinen, ellei se osu
  // liian lähelle edellistä.
  const askel = Math.max(1, Math.ceil(n / 6))
  const indeksit = new Set<number>()
  for (let i = 0; i < n; i += askel) indeksit.add(i)
  const viimeinenAskel = Math.floor((n - 1) / askel) * askel
  if (n - 1 - viimeinenAskel < askel / 2) indeksit.delete(viimeinenAskel)
  indeksit.add(n - 1)
  return (
    <div className="mb-8">
      <div className="flex items-baseline justify-between gap-3 mb-1">
        <h3 className="text-sm font-bold text-white">{otsikko}</h3>
        <span className="text-xs text-gray-400 tabular-nums">{summa} yhteensä · huippu {summa ? max : 0}</span>
      </div>
      {selite && <p className="text-xs text-gray-500 mb-3">{selite}</p>}
      {n === 0 || summa === 0 ? (
        <p className="text-xs text-gray-600">Ei dataa valitulla jaksolla.</p>
      ) : (
        <div>
          <div className="flex items-end gap-[2px] h-28 pt-5" style={{ borderBottom: '1px solid rgba(255,255,255,.1)' }}>
            {sarja.map((s, i) => (
              <div key={s.paiva} className="group relative flex-1 h-full flex items-end justify-center">
                <div className="w-full max-w-[24px] rounded-t-[4px]" style={{
                  height: s.arvo > 0 ? `${Math.max(2, (s.arvo / max) * 100)}%` : '1px',
                  background: s.arvo > 0 ? 'linear-gradient(180deg,#6b76ff,#5059e6)' : 'rgba(255,255,255,.12)',
                }} />
                {/* Huippuarvo pylvään PÄÄLLE (ei sisään): alareuna pylvään korkeudella,
                    yläpuolen pt-5 antaa tilan korkeimmankin pylvään numerolle. */}
                {i === huippu && (
                  <span className="absolute left-1/2 -translate-x-1/2 text-[10px] text-gray-300 tabular-nums group-hover:opacity-0"
                    style={{ bottom: `calc(${Math.max(2, (s.arvo / max) * 100)}% + 2px)` }}>{s.arvo}</span>
                )}
                <div className="pointer-events-none absolute top-0 left-1/2 -translate-x-1/2 -translate-y-full opacity-0 group-hover:opacity-100 transition-opacity rounded-md px-2 py-1 text-[11px] whitespace-nowrap z-10"
                  style={{ background: 'rgba(18,18,22,.98)', border: '1px solid rgba(255,255,255,.12)' }}>
                  <span className="text-white font-bold tabular-nums">{s.arvo}</span>
                  <span className="text-gray-400"> · {muotoilePaiva(s.paiva, true)}</span>
                </div>
              </div>
            ))}
          </div>
          <div className="relative h-4 mt-1">
            {sarja.map((s, i) => indeksit.has(i) && (
              <span key={s.paiva} className="absolute text-[10px] text-gray-500 tabular-nums -translate-x-1/2 whitespace-nowrap"
                style={{ left: `${((i + 0.5) / n) * 100}%` }}>
                {muotoilePaiva(s.paiva)}
              </span>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

export default function AdminStats() {
  // Jakso päivinä taaksepäin: alku ≥ loppu, 0 = tänään. Päivämäärät johdetaan
  // Helsinki-päivästä, ei selaimen vyöhykkeestä.
  const [alku, setAlku] = useState(29)
  const [loppu, setLoppu] = useState(0)
  const [tanaan] = useState(() => helsinkiToday())
  const from = siirraPaivaa(tanaan, -alku)
  const to = siirraPaivaa(tanaan, -loppu)
  // Seurattava tapahtuma ja nimihaku sen valintaan.
  const [seurattava, setSeurattava] = useState<{ id: string; nimi: string } | null>(null)
  const [haku, setHaku] = useState('')
  const [data, setData] = useState<Data | null>(null)
  const [virhe, setVirhe] = useState('')
  // Alkuarvo true ja lasku vasta odotuksen jälkeen: näin efekti ei aseta tilaa
  // synkronisesti (projektin lint-sääntö kieltää sen, koska se aiheuttaa
  // ketjuuntuvia renderöintejä). Jakson vaihto asettaa latauksen päälle
  // painikkeen käsittelijässä, mikä on käyttäjän toimi eikä efekti.
  const [lataa, setLataa] = useState(true)
  // Laitekohtainen poissulku. Luetaan vasta napin painalluksessa ja mountin
  // jälkeen, jottei palvelimen ja selaimen ensimmäinen maalaus eroa.
  const [poissuljettu, setPoissuljettu] = useState(false)
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- mount-synkkaus selaimen muistista
    setPoissuljettu(onkoPoissuljettu())
  }, [])

  // HUOM: yhtään setStatea ei saa kutsua ennen ensimmäistä awaitia. Efekti
  // kutsuu tätä, ja lint-sääntö seuraa kutsun funktion sisälle — synkroninen
  // tilamuutos efektistä aiheuttaisi ketjuuntuvan renderöinnin.
  const hae = useCallback(async (from: string, to: string, tapahtumaId: string | null) => {
    try {
      const params = new URLSearchParams({ from, to })
      if (tapahtumaId) params.set('tapahtuma', tapahtumaId)
      const r = await fetch(`/api/admin/stats?${params}`)
      const j = await r.json()
      if (!r.ok) {
        setVirhe(j.tauluPuuttuu
          ? 'Tietokanta on vanhempaa versiota: aja sql/create-click-events.sql uudelleen Supabasen SQL-editorissa. Se on turvallista ajaa monta kertaa ja lisää puuttuvat sarakkeet.'
          : (j.error ?? 'Haku epäonnistui'))
        setData(null)
      } else {
        setVirhe('')
        setData(j)
      }
    } catch {
      setVirhe('Haku epäonnistui')
    } finally {
      setLataa(false)
    }
  }, [])

  // Muistettu seurattava luetaan mountin jälkeen selaimen muistista.
  useEffect(() => {
    try {
      const m = localStorage.getItem(SEURATTAVA_AVAIN)
      // eslint-disable-next-line react-hooks/set-state-in-effect -- mount-synkkaus selaimen muistista
      if (m) setSeurattava(JSON.parse(m))
    } catch { /* privaattitila tai rikkinäinen arvo */ }
  }, [])

  // Haku viiveellä: liukusäätimen veto tuottaa kymmeniä arvoja sekunnissa,
  // ja vain viimeinen haetaan. Tila asetetaan ajastimen callbackissa, ei
  // suoraan efektissä (lint-sääntö). Edellinen data pysyy näkyvissä
  // himmennettynä, kunnes uusi saapuu — ei tyhjää välitilaa.
  useEffect(() => {
    const t = setTimeout(() => { setLataa(true); void hae(from, to, seurattava?.id ?? null) }, 350)
    return () => clearTimeout(t)
  }, [hae, from, to, seurattava])

  const valitseSeurattava = (t: { id: string; nimi: string } | null) => {
    setSeurattava(t)
    try {
      if (t) localStorage.setItem(SEURATTAVA_AVAIN, JSON.stringify(t))
      else localStorage.removeItem(SEURATTAVA_AVAIN)
    } catch { /* privaattitila */ }
  }
  // Kahvat voivat mennä ristiin — silloin ne vaihtavat paikkaa.
  const asetaJakso = (a: number, l: number) => { setAlku(Math.max(a, l)); setLoppu(Math.min(a, l)) }
  const paiviaValittu = alku - loppu + 1
  const jaksoTeksti = from === to ? muotoilePaiva(from, true) : `${muotoilePaiva(from)}–${muotoilePaiva(to, true)} · ${paiviaValittu} pv`
  const ehdokkaat = (data?.tapahtumat ?? [])
    .filter((t) => !haku.trim() || t.nimi.toLowerCase().includes(haku.trim().toLowerCase()))
    .slice(0, 12)

  return (
    // Sama kehys kuin muilla admin-välilehdillä (max-w-6xl + padding). Ilman
    // tätä tilastot menivät reunaan reunaan ja kapealla ruudulla palkkirivit
    // ylivuotoivat — lukujen sarake jäi näkymättömiin oikean reunan taakse.
    <div className="p-4 sm:p-6 max-w-6xl mx-auto">
      {/* Omat käynnit pois. Kolme tasoa, mutta vain yksi vaatii toimenpiteen:
          admin-istunto ja kehitysympäristö karsiutuvat itsestään. */}
      <div className="rounded-xl p-4 mb-6" style={{ background: 'rgba(255,255,255,.04)' }}>
        <p className="text-sm font-bold text-white mb-1">Omat käynnit</p>
        <p className="text-xs text-gray-500 leading-relaxed mb-3">
          Kirjautuneena adminiin käyntejäsi ei kirjata koskaan, eikä kehityspalvelimelta
          tai esikatselujulkaisuista tallennu mitään. Sulje tämä laite pois myös silloin
          kun selaat sivustoa tavallisesti ilman kirjautumista.
        </p>
        <div className="flex items-center gap-3">
          <button
            onClick={() => { asetaPoissulku(!poissuljettu); setPoissuljettu(!poissuljettu) }}
            className="px-3 py-1.5 text-xs font-bold rounded-lg transition-colors"
            style={poissuljettu
              ? { background: 'rgba(16,185,129,.15)', color: '#6ee7b7' }
              : { background: 'rgba(255,255,255,.08)', color: 'rgba(255,255,255,.8)' }}>
            {poissuljettu ? 'Tämä laite on suljettu pois' : 'Sulje tämä laite pois'}
          </button>
          <span className="text-[11px] text-gray-600">
            {poissuljettu ? 'Paina uudelleen jos haluat mitata tämänkin laitteen.' : 'Koskee vain tätä selainta.'}
          </span>
        </div>
      </div>

      {/* JAKSO: esiasetukset ensin, sitten kaksikahvainen päiväliukusäädin.
          Vasen kahva = jakson alku, oikea = loppu, molemmat Helsinki-päiviä.
          Kaikki alla olevat luvut lasketaan tästä samasta jaksosta. */}
      <div className="rounded-xl p-4 mb-6" style={{ background: 'rgba(255,255,255,.04)' }}>
        <div className="flex items-center gap-2 flex-wrap mb-3">
          {ESIASETUKSET.map((e) => (
            <button key={e.nimi} onClick={() => asetaJakso(e.alku, e.loppu)}
              className={`px-3 py-1.5 text-xs font-bold rounded-lg transition-colors ${
                alku === e.alku && loppu === e.loppu ? 'bg-purple-600 text-white' : 'bg-white/5 text-gray-400 hover:text-white'
              }`}>
              {e.nimi}
            </button>
          ))}
          <span className="ml-auto text-sm font-bold text-white tabular-nums">{jaksoTeksti}</span>
          {lataa && <span className="text-xs text-gray-500">Haetaan…</span>}
        </div>
        <div className="relative h-8">
          <style>{`
            .mt-liuku { -webkit-appearance: none; appearance: none; background: transparent; pointer-events: none; position: absolute; inset: 0; width: 100%; height: 100%; margin: 0; }
            .mt-liuku::-webkit-slider-runnable-track { background: transparent; }
            .mt-liuku::-moz-range-track { background: transparent; }
            .mt-liuku::-webkit-slider-thumb { -webkit-appearance: none; pointer-events: auto; width: 18px; height: 18px; border-radius: 9999px; background: #fff; border: 3px solid #6b76ff; cursor: grab; }
            .mt-liuku::-moz-range-thumb { pointer-events: auto; width: 18px; height: 18px; border-radius: 9999px; background: #fff; border: 3px solid #6b76ff; cursor: grab; }
          `}</style>
          <div className="absolute left-0 right-0 top-1/2 h-1 -translate-y-1/2 rounded bg-white/10" />
          <div className="absolute top-1/2 h-1 -translate-y-1/2 rounded"
            style={{ left: `${((MAX_PAIVAA - alku) / MAX_PAIVAA) * 100}%`, right: `${(loppu / MAX_PAIVAA) * 100}%`, background: 'linear-gradient(90deg,#6b76ff,#5059e6)' }} />
          {/* Kun kahvat ovat päällekkäin oikeassa reunassa (esim. Tänään), alkukahva
              nostetaan päällimmäiseksi, jotta sitä pääsee vetämään vasemmalle. */}
          <input type="range" className="mt-liuku" min={0} max={MAX_PAIVAA} step={1} value={MAX_PAIVAA - alku} aria-label="Jakson alkupäivä"
            style={{ zIndex: alku === loppu && alku < MAX_PAIVAA / 2 ? 3 : 1 }}
            onChange={(e) => asetaJakso(MAX_PAIVAA - Number(e.target.value), loppu)} />
          <input type="range" className="mt-liuku" min={0} max={MAX_PAIVAA} step={1} value={MAX_PAIVAA - loppu} aria-label="Jakson loppupäivä"
            style={{ zIndex: 2 }}
            onChange={(e) => asetaJakso(alku, MAX_PAIVAA - Number(e.target.value))} />
        </div>
        <div className="flex justify-between gap-3 text-[10px] text-gray-500 tabular-nums">
          <span>{muotoilePaiva(siirraPaivaa(tanaan, -MAX_PAIVAA), true)}</span>
          <span className="text-center">Vedä kahvoja: vasen on jakson alku, oikea loppu. Sama päivä molemmissa näyttää yhden päivän.</span>
          <span>tänään</span>
        </div>
      </div>

      {virhe && (
        <p className="text-sm rounded-lg p-4 mb-6" style={{ background: 'rgba(239,68,68,.1)', color: '#fca5a5' }}>
          {virhe}
        </p>
      )}

      {data && (
        <div className={lataa ? 'opacity-60 transition-opacity' : 'transition-opacity'}>
          {/* Rehellisyys katosta: jos raja tuli vastaan, luvut ovat vajaita ja
              se on sanottava ääneen eikä piilotettava. */}
          {data.kattoTayttyi && (
            <p className="text-xs rounded-lg p-3 mb-6" style={{ background: 'rgba(245,158,11,.1)', color: '#fcd34d' }}>
              Luettu {data.rivejaLuettu} riviä eli lukukatto tuli vastaan — luvut ovat
              vajaita tältä jaksolta. Lyhennä jaksoa tai tee koostetaulu.
            </p>
          )}

          {/* ERI KÄVIJÄT ensimmäisenä: se on se luku jota omistaja kysyy
              ensimmäisenä ja jonka hän kertoo eteenpäin. */}
          <div className="rounded-2xl p-5 mb-6"
            style={{ background: 'linear-gradient(150deg,rgba(107,118,255,.16),rgba(80,89,230,.08))', border: '1px solid rgba(107,118,255,.25)' }}>
            <div className="flex items-baseline gap-6 flex-wrap">
              <div>
                <div className="text-4xl font-black text-white tabular-nums">{data.eriKavijat}</div>
                <div className="text-[12px] text-white/60 mt-1">eri kävijää valitulla jaksolla</div>
              </div>
              <div>
                <div className="text-4xl font-black text-white tabular-nums">{data.kaynnit}</div>
                <div className="text-[12px] text-white/60 mt-1">käyntiä yhteensä</div>
              </div>
            </div>
            <p className="text-[11px] text-white/35 mt-2.5 leading-relaxed">
              Laskettu ilman evästeitä ja ilman IP-osoitteen tallennusta. Tunniste vaihtuu
              kuukausittain, joten kuukauden sisällä luku on tarkka — yli kuukausirajan
              menevällä jaksolla sama kävijä voi näkyä kahtena.
              {data.ilmanKavijaa > 0 && ` ${data.ilmanKavijaa} riviltä tunniste puuttuu.`}
            </p>
            <p className="text-[11px] text-white/35 mt-2 leading-relaxed">
              Käynti kirjataan heti sivun avautuessa, joten myös se joka vain lukee
              eikä klikkaa mitään näkyy luvuissa ja maajakaumassa. Jos käyntejä on
              enemmän kuin kävijöitä, sama ihminen on palannut.
            </p>
            {Object.keys(data.kavijatKuukausittain).length > 0 && (
              <div className="flex flex-wrap gap-x-5 gap-y-1 mt-3.5 pt-3.5" style={{ borderTop: '1px solid rgba(255,255,255,.08)' }}>
                {Object.entries(data.kavijatKuukausittain).sort().map(([k, v]) => (
                  <div key={k}>
                    <span className="text-lg font-black text-white tabular-nums">{v}</span>
                    <span className="text-[11px] text-white/40 ml-1.5">{kuukausiNimi(k)}</span>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* PÄIVÄKOHTAISET SARJAT: valitun jakson jokainen päivä omana
              pylväänään, myös nollat. Yksi sarja per kaavio — kaksi mitta-
              asteikkoa samassa kuvassa johtaisi harhaan. */}
          <PaivaPylvaat otsikko="Käynnit päivittäin"
            sarja={data.paivittain.map((p) => ({ paiva: p.paiva, arvo: p.kaynnit }))}
            selite="Sivun avaukset Helsinki-päivittäin. Osoitin pylvään päällä näyttää päivän luvun." />
          <PaivaPylvaat otsikko="Eri kävijät päivittäin"
            sarja={data.paivittain.map((p) => ({ paiva: p.paiva, arvo: p.kavijat }))}
            selite="Eri kävijätunnisteita päivän aikana. Sama ihminen eri päivinä lasketaan joka päivälle erikseen." />

          {/* TAPAHTUMAN SEURANTA (omistaja 25.10.2026: Jannan joulun näkyvyys).
              Luvut syntyvät samoista mittauspisteistä kuin muukin näkymä:
              event_open (kortti), external_click (ulos, meta = verkkotunnus),
              plan_add (otsikolla) ja pageview /e/<id> (jaettu sivu). */}
          <div className="rounded-2xl p-5 mb-8" style={{ background: 'rgba(255,255,255,.04)', border: '1px solid rgba(255,255,255,.08)' }}>
            <h3 className="text-sm font-bold text-white mb-1">Tapahtuman seuranta</h3>
            <p className="text-xs text-gray-500 leading-relaxed mb-3">
              Valitse tapahtuma, niin sen luvut näkyvät valitulta jaksolta: kortin avaukset,
              klikkaukset ulos (lippukauppaan ja muualle), Lisää suunnitelmaan ja jaetun
              /e/-sivun avaukset. Valinta muistetaan tällä laitteella.
            </p>
            <input value={haku} onChange={(e) => setHaku(e.target.value)} placeholder="Hae tapahtuman nimellä…"
              className="w-full rounded-lg px-3 py-2 text-sm text-white outline-none mb-2"
              style={{ background: 'rgba(255,255,255,.06)', border: '1px solid rgba(255,255,255,.1)' }} />
            <div className="flex flex-wrap gap-1.5 mb-4">
              {ehdokkaat.map((t) => (
                <button key={t.id} onClick={() => valitseSeurattava({ id: t.id, nimi: t.nimi })}
                  className="px-2.5 py-1 text-xs font-bold rounded-lg transition-colors"
                  style={seurattava?.id === t.id
                    ? { background: 'rgba(107,118,255,.25)', color: '#c7caff', border: '1px solid rgba(107,118,255,.5)' }
                    : { background: 'rgba(255,255,255,.06)', color: 'rgba(255,255,255,.7)', border: '1px solid transparent' }}>
                  {t.nimi} <span className="text-gray-500 font-medium">· {t.maara}</span>
                </button>
              ))}
              {ehdokkaat.length === 0 && (
                <span className="text-xs text-gray-600">Ei avattuja tapahtumia tällä haulla valitulla jaksolla.</span>
              )}
            </div>

            {seurattava && (
              <div className="flex items-center gap-3 mb-4 flex-wrap">
                <span className="text-base font-black text-white">{seurattava.nimi}</span>
                <span className="text-[11px] text-gray-500">{seurattava.id}</span>
                <button onClick={() => valitseSeurattava(null)} className="ml-auto text-xs text-gray-400 hover:text-white">Lopeta seuranta</button>
              </div>
            )}
            {seurattava && !data.tapahtuma && (
              <p className="text-xs text-gray-600">Ei mittauksia tälle tapahtumalle valitulla jaksolla.</p>
            )}
            {seurattava && data.tapahtuma && (
              <>
                <div className="grid grid-cols-2 md:grid-cols-5 gap-3 mb-5">
                  {[
                    { arvo: data.tapahtuma.avaukset, nimi: 'Kortin avausta', selite: `${data.tapahtuma.eriAvaajat} eri kävijää` },
                    { arvo: data.tapahtuma.lippuklikit, nimi: 'Klikkausta lippukauppaan', selite: 'lippu.fi, Ticketmaster, Tiketti…' },
                    { arvo: data.tapahtuma.ulkoisetKlikit - data.tapahtuma.lippuklikit, nimi: 'Muuta klikkausta ulos', selite: 'paikan sivu, lue lisää' },
                    { arvo: data.tapahtuma.suunnitelmaan, nimi: 'Lisätty suunnitelmaan', selite: 'otsikon perusteella' },
                    { arvo: data.tapahtuma.jaetunSivunKaynnit, nimi: 'Jaetun sivun avausta', selite: '/e/-linkki' },
                  ].map((k) => (
                    <div key={k.nimi} className="rounded-xl p-3.5" style={{ background: 'rgba(255,255,255,.05)' }}>
                      <div className="text-2xl font-black text-white tabular-nums">{k.arvo}</div>
                      <div className="text-[11px] text-gray-300 mt-0.5 font-bold">{k.nimi}</div>
                      <div className="text-[10.5px] text-gray-600 mt-0.5">{k.selite}</div>
                    </div>
                  ))}
                </div>
                <PaivaPylvaat otsikko="Avaukset päivittäin"
                  sarja={data.tapahtuma.paivittain.map((p) => ({ paiva: p.paiva, arvo: p.avaukset }))} />
                <PaivaPylvaat otsikko="Klikkaukset ulos päivittäin"
                  sarja={data.tapahtuma.paivittain.map((p) => ({ paiva: p.paiva, arvo: p.ulkoiset }))}
                  selite={`Kaikki uloslinkit; niistä lippukauppaan ${data.tapahtuma.lippuklikit}.`} />
                <div className="grid md:grid-cols-2 gap-x-8">
                  <Palkit otsikko="Mistä kortti avattiin" rivit={data.tapahtuma.pinnat}
                    selite="search = haku, grid = ruudukko, hero = karuselli, promo = Tulossa-kärkinosto, share = jaettu linkki, map = kartta, picks = poiminnat." />
                  <Palkit otsikko="Minne klikattiin" rivit={data.tapahtuma.domainit} selite="Uloslinkin verkkotunnus." />
                  <Palkit otsikko="Maat" rivit={data.tapahtuma.maat.map((r) => ({ ...r, nimi: maaNimi(r.nimi) }))} />
                  <Palkit otsikko="Paikkakunnat (Suomi)" rivit={data.tapahtuma.kaupungitFI} />
                </div>
                {data.tapahtuma.ensimmainen && (
                  <p className="text-[11px] text-gray-600">
                    Jakson ensimmäinen mittaus {new Date(data.tapahtuma.ensimmainen).toLocaleString('fi-FI', { timeZone: 'Europe/Helsinki' })}.
                  </p>
                )}
              </>
            )}
          </div>

          {/* Suunnitelmalaatikot näkyvät nollinakin — muuten uuden ominaisuuden
              käyttöä ei huomaisi ennen kuin dataa jo on. */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-8">
            {Object.entries({ plan_add: 0, share: 0, plan_copy: 0, ...data.maarat })
              .sort((a, b) => b[1] - a[1])
              .map(([k, v]) => (
                <div key={k} className="rounded-xl p-4" style={{ background: 'rgba(255,255,255,.04)' }}>
                  <div className="text-2xl font-black text-white tabular-nums">{v}</div>
                  <div className="text-[11px] text-gray-400 mt-0.5 font-bold">{NIMET[k] ?? k}</div>
                  {SELITTEET[k] && (
                    <div className="text-[10.5px] text-gray-600 mt-1 leading-snug">{SELITTEET[k]}</div>
                  )}
                </div>
              ))}
          </div>

          <Palkit otsikko="Käydyimmät sivut" rivit={data.sivut}
            selite="Sivun osoite. / on sovelluksen etusivu ja /en sen englanninkielinen osoite; muut ovat laskeutumissivuja, jotka kilpailevat hakutuloksista." />
          <Palkit otsikko="Klikkaukset lippukauppaan" rivit={data.lippukauppaKlikit.length ? data.lippukauppaKlikit : data.lippuklikit}
            selite="Uloslinkit lipunmyyjien sivuille (lippu.fi, Ticketmaster, Tiketti, Kide…). Tämä on lähin asia ostoon. Sovellus EI näe toteutuiko osto — vain että käyttäjä siirtyi lipunmyyjälle." />
          <Palkit otsikko="Avatuimmat tapahtumat" rivit={data.tapahtumatAvaukset} />
          <Palkit otsikko="Mistä tapahtumat avataan" rivit={data.pinnat}
            selite="grid = tapahtumaruudukko, picks = parhaat poiminnat, hero = etusivun karuselli, promo = Tulossa-kärkinosto (mainospaikka), search = haku, map = kartta, idea = ideapakka, guide = opas, venue = paikan lista." />
          <Palkit otsikko="Käytetyimmät osiot" rivit={data.osiot} />
          <Palkit otsikko="Tallennetuimmat suosikeiksi" rivit={data.suosikit} />
          <Palkit otsikko="Avatuimmat oppaat" rivit={data.oppaat} />
          <Palkit otsikko="Valituimmat kategoriat" rivit={data.kategoriat} />
          <Palkit otsikko="Muut uloslinkit" rivit={data.ulkoisetKlikit}
            selite="Lue lisää -linkit ja paikkojen sivut, eli klikkaukset jotka eivät menneet lippukauppaan." />
          <Palkit otsikko="Haetuimmat sanat" rivit={data.haut}
            selite="Vain vähintään kolmen merkin haut, kirjattu vasta kun kirjoittaminen loppui." />

          <Palkit otsikko="Mistä maasta klikkaukset tulevat"
            rivit={data.maat.map((r) => ({ ...r, nimi: maaNimi(r.nimi) }))}
            selite={`Kaikki mitatut toiminnot maan mukaan. Maa tulee Vercelin sijaintitiedosta — vain maan tarkkuudella, ei IP-osoitetta.${data.ilmanMaata > 0 ? ` ${data.ilmanMaata} riviltä maa puuttuu (paikallinen kehitys tai tuntematon).` : ''}`} />

          {/* Kaikki maakunnat, myös nollat — niin näkee mistä ei tulla. */}
          <Palkit otsikko="Maakunnat"
            rivit={MAAKUNNAT
              .map(([koodi, nimi]) => ({ nimi, maara: data.maakunnat[koodi] ?? 0 }))
              .sort((a, b) => b.maara - a.maara)}
            selite="Kaikki 19 maakuntaa. Nolla tarkoittaa ettei tältä alueelta ole vielä yhtään mitattua toimintoa." />

          {/* Kymmenen suurinta kaupunkia omana listanaan, myös nollat. */}
          <Palkit otsikko="10 suurinta kaupunkia"
            rivit={SUURET_KAUPUNGIT
              .map((nimi) => ({ nimi, maara: data.kaupunkiMaarat[nimi] ?? 0 }))
              .sort((a, b) => b.maara - a.maara)}
            selite="Väkiluvultaan suurimmat, järjestettynä mitatun käytön mukaan." />

          <Palkit otsikko="Kaikki paikkakunnat" rivit={data.kaupungitFI}
            selite="Vain Suomesta tulleet. HUOM: sijainti on IP-paikannusta — moni mobiiliverkon käyttäjä näkyy Helsingissä oikeasta sijainnista riippumatta, joten luvut ovat suuntaa antavia." />

          <Palkit otsikko="Lippuklikit paikkakunnittain (Suomi)" rivit={data.kaupungitFILippu} />

          <Palkit otsikko="Lippuklikit maittain"
            rivit={data.maatLippuklikit.map((r) => ({ ...r, nimi: maaNimi(r.nimi) }))}
            selite="Eri kysymys kuin yllä: mistä maasta tulevat ne joilla on ostoaikomus." />
        </div>
      )}
    </div>
  )
}

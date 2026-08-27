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

interface Rivi { nimi: string; maara: number }
interface Data {
  paivat: number
  rivejaLuettu: number
  kattoTayttyi: boolean
  maarat: Record<string, number>
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

const JAKSOT = [7, 30, 90] as const

// Ihmisluettavat nimet tapahtumatyypeille. Tietokannassa ne ovat lyhyitä
// tunnisteita, mutta näytöllä niiden pitää kertoa mitä ne tarkoittavat.
const NIMET: Record<string, string> = {
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
  newsletter: 'Uutiskirje tilattu',
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
              <span className="text-xs text-gray-300 w-64 shrink-0 truncate" title={r.nimi}>{r.nimi}</span>
              <div className="flex-1 h-4 rounded bg-white/5 overflow-hidden">
                <div className="h-full rounded" style={{
                  width: `${Math.round((r.maara / max) * 100)}%`,
                  background: 'linear-gradient(90deg,#6b76ff,#5059e6)',
                }} />
              </div>
              <span className="text-xs text-gray-400 w-12 text-right tabular-nums">{r.maara}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

export default function AdminStats() {
  const [paivat, setPaivat] = useState<number>(30)
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
  const hae = useCallback(async (d: number) => {
    try {
      const r = await fetch(`/api/admin/stats?days=${d}`)
      const j = await r.json()
      if (!r.ok) {
        setVirhe(j.tauluPuuttuu
          ? 'Taulua click_events ei ole vielä luotu. Aja sql/create-click-events.sql Supabasen SQL-editorissa.'
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

  // eslint-disable-next-line react-hooks/set-state-in-effect -- datan mount-lataus (hae on useCallback, joka hakee ja asettaa tilan)
  useEffect(() => { void hae(paivat) }, [hae, paivat])

  return (
    <div>
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

      <div className="flex items-center gap-2 mb-6">
        {JAKSOT.map((d) => (
          <button key={d} onClick={() => { setLataa(true); setPaivat(d) }}
            className={`px-3 py-1.5 text-xs font-bold rounded-lg transition-colors ${
              paivat === d ? 'bg-purple-600 text-white' : 'bg-white/5 text-gray-400 hover:text-white'
            }`}>
            {d} pv
          </button>
        ))}
        {lataa && <span className="text-xs text-gray-500">Haetaan…</span>}
      </div>

      {virhe && (
        <p className="text-sm rounded-lg p-4 mb-6" style={{ background: 'rgba(239,68,68,.1)', color: '#fca5a5' }}>
          {virhe}
        </p>
      )}

      {data && (
        <>
          {/* Rehellisyys katosta: jos raja tuli vastaan, luvut ovat vajaita ja
              se on sanottava ääneen eikä piilotettava. */}
          {data.kattoTayttyi && (
            <p className="text-xs rounded-lg p-3 mb-6" style={{ background: 'rgba(245,158,11,.1)', color: '#fcd34d' }}>
              Luettu {data.rivejaLuettu} riviä eli lukukatto tuli vastaan — luvut ovat
              vajaita tältä jaksolta. Lyhennä jaksoa tai tee koostetaulu.
            </p>
          )}

          <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-8">
            {Object.entries(data.maarat)
              .sort((a, b) => b[1] - a[1])
              .map(([k, v]) => (
                <div key={k} className="rounded-xl p-4" style={{ background: 'rgba(255,255,255,.04)' }}>
                  <div className="text-2xl font-black text-white tabular-nums">{v}</div>
                  <div className="text-[11px] text-gray-500 mt-0.5">{NIMET[k] ?? k}</div>
                </div>
              ))}
          </div>

          <Palkit otsikko="Klikkaukset lippukauppaan" rivit={data.lippuklikit}
            selite="Tämä on lähin asia ostoon. Sovellus EI näe toteutuiko osto — vain että käyttäjä siirtyi lipunmyyjälle." />
          <Palkit otsikko="Avatuimmat tapahtumat" rivit={data.tapahtumatAvaukset} />
          <Palkit otsikko="Mistä tapahtumat avataan" rivit={data.pinnat}
            selite="grid = tapahtumaruudukko, picks = parhaat poiminnat, hero = etusivun karuselli, search = haku, map = kartta, idea = ideapakka, guide = opas, venue = paikan lista." />
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
        </>
      )}
    </div>
  )
}

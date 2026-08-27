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
}

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
        </>
      )}
    </div>
  )
}

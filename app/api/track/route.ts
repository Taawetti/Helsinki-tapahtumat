// Kävijätapahtumien vastaanotto.
//
// MIKSI OMA REITTI. Selain ei kirjoita Supabaseen missään tässä projektissa —
// kaikilla tauluilla on RLS päällä eikä yhdelläkään ole INSERT-policyä, joten
// kirjoitus tapahtuu aina palvelinpuolelta service_role-avaimella. Tämä reitti
// noudattaa samaa kuviota kuin /api/subscribe ja /api/translate.
//
// EI TALLENNETA TUNNISTETTA. Rivit eivät sisällä laite-, istunto- eikä
// käyttäjätunnistetta eikä IP-osoitetta. Ilman tunnistetta data ei ole
// henkilötietoa, jolloin tietosuojaselostetta ei tarvitse muuttaa eikä
// evästesuostumusta kysyä. Jos tähän joskus lisätään tunniste, seloste on
// päivitettävä samalla — ks. sql/create-click-events.sql.
//
// JULKINEN REITTI = ROSKAPOSTIRISKI. Projektissa ei ole rate limitointia
// missään, joten suojaus tehdään muodolla: sallittu joukko tapahtumatyyppejä,
// katto erän koolle ja pituusrajat jokaiselle kentälle. Tuntematon tyyppi
// pudotetaan hiljaa — vastaus on silti ok, jottei mittaus koskaan riko
// sovellusta eikä robotti saa vihjettä siitä mikä sen pysäytti.

import { createHash } from 'node:crypto'
import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase'
import { SESSION_COOKIE as ADMIN_COOKIE } from '@/lib/admin-auth'
import { onRobotti } from '@/lib/bot'

/** Sallitut tapahtumatyypit. Vapaa teksti kelpaisi kenelle tahansa roskan
 *  syöttäjälle ja tekisi raporteista lukukelvottomia. */
const SALLITUT = new Set([
  // Sivun avaus. TÄMÄ ON AINOA TYYPPI JOKA EI VAADI KLIKKAUSTA — ilman sitä
  // kävijä joka saapuu, lukee ja poistuu ei näkyisi missään luvussa, ei edes
  // eri kävijöissä. Mitattu 28.8.2026: kannassa oli 74 riviä ja jokainen
  // niistä oli syntynyt klikkauksesta.
  'pageview',
  'event_open',      // tapahtuman tietopaneeli avattiin
  'ticket_click',    // ulos lippukauppaan (canBuyTickets = true)
  'external_click',  // ulos muualle (lue lisää, paikan sivu, haku)
  'favorite_add',    // tapahtuma tallennettiin suosikiksi
  'section',         // sovelluksen osio avattiin (tapahtumat/idea/ravintolat/uutta)
  'guide_open',      // opas avattiin
  'category',        // kategoria- tai tunnelmasuodatin valittiin
  'search',          // haku tehtiin
  'map_open',        // kartta avattiin
  'install',         // sovellus asennettiin
  'newsletter',      // uutiskirje tilattiin
])

const MAX_ERA = 20
const MAX_PITUUS = 200

const siisti = (v: unknown): string | null => {
  if (typeof v !== 'string') return null
  const s = v.trim().replace(/\s+/g, ' ')
  return s ? s.slice(0, MAX_PITUUS) : null
}

interface Rivi {
  kind: string; surface: string | null; event_id: string | null
  label: string | null; meta: string | null; country: string | null; city: string | null; region: string | null; visitor: string | null
}

/** Maa Vercelin sijaintiotsakkeesta. Vercel asettaa sen jokaiseen pyyntöön
 *  reunalla; paikallisesti sitä ei ole, jolloin arvo jää tyhjäksi.
 *
 *  MIKSI TÄMÄ EI RIKO TUNNISTEETTOMUUTTA: tallennamme vain kaksikirjaimisen
 *  maakoodin, emme IP-osoitetta emmekä kaupunkia. Maan tarkkuudella kukaan ei
 *  ole tunnistettavissa, joten rivit pysyvät ei-henkilötietona. ÄLÄ lisää
 *  tähän kaupunkia (x-vercel-ip-city) tai IP:tä miettimättä selostetta uusiksi. */
function maa(req: NextRequest): string | null {
  const c = req.headers.get('x-vercel-ip-country')
  // Kaksi isoa kirjainta tai ei mitään — näin otsakkeen roskaa ei päädy kantaan.
  return c && /^[A-Z]{2}$/.test(c) ? c : null
}

/** Kaupunki samasta lähteestä. Vercel URL-koodaa arvon, joten "Jyväskylä"
 *  saapuu muodossa "Jyv%C3%A4skyl%C3%A4" — ilman purkua kanta täyttyisi
 *  lukukelvottomista nimistä. */
/** Kävijätiiviste eri kävijöiden laskemiseen.
 *
 *  IP-OSOITETTA EI TALLENNETA. Siitä lasketaan tiiviste yhdessä selaimen
 *  tunnisteen ja salaisen suolan kanssa, ja vain tiiviste menee kantaan.
 *  Selaimeen ei kirjoiteta mitään, joten evästesuostumusta ei tarvita.
 *
 *  SUOLA VAIHTUU KUUKAUSITTAIN. Pysyvä suola tekisi tiivisteestä pysyvän
 *  tunnisteen, jolla saman ihmisen voisi yhdistää kuukausien yli. Kuukauden
 *  sisällä luku on tarkka; kuukausien välillä yhteys katkeaa tarkoituksella.
 *
 *  Suola otetaan ympäristöstä eikä koodista: koodi on julkisessa repossa, ja
 *  arvattavalla suolalla tiivisteen voisi laskea takaisin IP-osoitteeksi. */
function kavijatiiviste(req: NextRequest): string | null {
  const salaisuus = process.env.TRACK_SALT || process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!salaisuus) return null
  const ip = (req.headers.get('x-forwarded-for') ?? '').split(',')[0].trim()
    || req.headers.get('x-real-ip') || ''
  const ua = req.headers.get('user-agent') ?? ''
  if (!ip) return null
  const kuukausi = new Date().toISOString().slice(0, 7) // YYYY-MM
  return createHash('sha256').update(`${ip}|${ua}|${kuukausi}|${salaisuus}`).digest('hex').slice(0, 16)
}

/** Maakunta ISO 3166-2 -koodina. Vercel lähettää joko pelkän numeron ("18")
 *  tai maakoodillisen muodon ("FI-18") — normalisoidaan kaksinumeroiseksi,
 *  jotta raportissa on yksi muoto eikä kahta rinnakkaista. */
function maakunta(req: NextRequest): string | null {
  const r = req.headers.get('x-vercel-ip-country-region')
  if (!r) return null
  const m = r.trim().toUpperCase().match(/(?:^|-)([0-9]{1,2})$/)
  return m ? m[1].padStart(2, '0') : null
}

function kaupunki(req: NextRequest): string | null {
  const raw = req.headers.get('x-vercel-ip-city')
  if (!raw) return null
  let nimi = raw
  try { nimi = decodeURIComponent(raw) } catch { /* viallinen koodaus: käytä raakaa */ }
  nimi = nimi.trim()
  // Pituusraja ja merkkirajaus: kantaan ei päädy otsakkeen roskaa.
  return nimi && nimi.length <= 60 ? nimi : null
}

export async function POST(req: NextRequest) {
  // ROBOTIT EIVÄT OLE KÄVIJÖITÄ. Ennen tallennusta, jotta ne eivät päädy
  // myöskään kävijätiivisteeseen eivätkä maajakaumaan. Ks. lib/bot.ts —
  // sivulatauskirjaus teki tästä pakollisen.
  if (onRobotti(req.headers.get('user-agent'))) return NextResponse.json({ ok: true })

  // OMISTAJAN OMAT KÄYNNIT POIS. Jos selaimessa on voimassa admin-istunto,
  // kirjauksia ei tallenneta lainkaan. Tämä on karsinnan tärkein taso: se
  // toimii vaikka selaimen muisti tyhjenisi tai laite vaihtuisi, koska eväste
  // seuraa kirjautumista eikä laitetta.
  //
  // Evästeen OLEMASSAOLO riittää — allekirjoitusta ei tarvitse tarkistaa.
  // Väärennetty eväste johtaisi vain siihen ettei väärentäjän omia klikkauksia
  // lasketa, mikä ei hyödytä ketään eikä vahingoita dataa.
  if (req.cookies.get(ADMIN_COOKIE)) return NextResponse.json({ ok: true })

  let body: { events?: unknown }
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ ok: true })
  }

  const era = Array.isArray(body.events) ? body.events.slice(0, MAX_ERA) : []
  const maakoodi = maa(req)
  const kaupunkiNimi = kaupunki(req)
  const maakuntaKoodi = maakunta(req)
  const kavija = kavijatiiviste(req)
  const rivit: Rivi[] = []

  for (const raw of era) {
    if (!raw || typeof raw !== 'object') continue
    const e = raw as Record<string, unknown>
    const kind = siisti(e.kind)
    if (!kind || !SALLITUT.has(kind)) continue
    rivit.push({
      kind,
      surface: siisti(e.surface),
      event_id: siisti(e.eventId),
      label: siisti(e.label),
      meta: siisti(e.meta),
      country: maakoodi,
      city: kaupunkiNimi,
      region: maakuntaKoodi,
      visitor: kavija,
    })
  }

  if (rivit.length === 0) return NextResponse.json({ ok: true })

  if (!supabaseAdmin) {
    console.error('[track] SUPABASE_SERVICE_ROLE_KEY puuttuu')
    // Mittaus ei saa koskaan näkyä käyttäjälle virheenä.
    return NextResponse.json({ ok: true })
  }

  const { error } = await supabaseAdmin.from('click_events').insert(rivit)
  if (error) console.error('[track] insert:', error.message)

  return NextResponse.json({ ok: true })
}

// Etsii lähteet jotka ovat HILJAA RIKKI — vastaavat 200 OK mutta eivät tuota
// yhtään tapahtumaa. Tämä on maanantain korjausagentin syöte.
//
// EI KÄYTÄ TEKOÄLYÄ. Tämä on tarkoituksellista: se osa joka päättää MITÄ
// tutkitaan pitää olla mitattu, ei pääteltyä. Agentti saa siis listan jota se
// ei ole itse keksinyt.
//
// EROTTELU KAUSI vs. VIKA. Yksittäinen nollaviikko on normaali: mitattu
// 22.8.2026 että 16/45 lähteestä oli laillisesti tyhjä sillä viikolla (venue
// hiljaisella viikolla, kausi ohi). Siksi ehto on nolla SEKÄ 7 ETTÄ 60 päivän
// ikkunassa. Tällä erottelulla löytyivät tänään helmet, espoo, lippu, kide ja
// kulttuuritalo — ja sillä rajautuivat pois apollo, glivelab, korjaamo ja
// savoy, jotka olivat vain hiljaisia sillä viikolla.
//
// EI-VASTANNEET LÄHTEET OHITETAAN. `ok:false` tarkoittaa verkkohäiriötä tai
// timeouttia, ei kuolemaa — ja aggregaatin kylmäkäynnistys voi pudottaa
// kymmeniä lähteitä kerralla. Vain "vastasi hyvin, palautti tyhjää" on se
// hiljainen kuolema jota etsitään.
//
// Aja:  npx tsx scripts/find-broken-sources.ts
//       npx tsx scripts/find-broken-sources.ts --json
//       npx tsx scripts/find-broken-sources.ts --origin http://localhost:3000

import { KNOWN_SILENT, TRIAGE_STALE_DAYS, daysSinceChecked } from '../lib/source-triage'

const PROD = 'https://helsinki-tapahtumat.vercel.app'

interface SourceStat { name: string; ok: boolean; count: number }
interface Payload { total?: number; sources?: SourceStat[] }

const args = process.argv.slice(2)
const asJson = args.includes('--json')
const originIdx = args.indexOf('--origin')
const origin = originIdx >= 0 ? args[originIdx + 1] : (process.env.TARGET_ORIGIN || PROD)

function isoDay(offsetDays: number): string {
  return new Date(Date.now() + offsetDays * 86400000).toISOString().slice(0, 10)
}

async function fetchWindow(days: number): Promise<Payload | null> {
  const start = isoDay(0)
  const end = isoDay(days - 1)
  const url = `${origin}/api/events?start=${start}&end=${end}&page=1`
  try {
    // Aggregaatti tekee 45 rinnakkaista alihakua; kylmänä se on hidas.
    const res = await fetch(url, { signal: AbortSignal.timeout(120_000) })
    if (!res.ok) return null
    return (await res.json()) as Payload
  } catch {
    return null
  }
}

async function main() {
  // Lämmitysajo heitetään pois: kylmällä Vercel-instanssilla osa lähteistä
  // timeouttaa, jolloin ne näyttäisivät kuolleilta. Sama syy kuin
  // checkSourceHealthin uudelleenyrityksessä.
  await fetchWindow(7)

  const short = await fetchWindow(7)
  const long = await fetchWindow(60)

  if (!short || !long) {
    const msg = `Aggregaattia ei saatu luettua osoitteesta ${origin} — ei voida päätellä mitään.`
    if (asJson) console.log(JSON.stringify({ error: msg, candidates: [], declined: [] }, null, 2))
    else console.error(msg)
    // Poistutaan nollalla: tämä ei ole lähdevika vaan ajon este, eikä siitä
    // pidä syntyä PR-yritystä.
    process.exit(0)
  }

  const longByName = new Map((long.sources ?? []).map((s) => [s.name, s]))
  const today = isoDay(0)

  const silent: SourceStat[] = []
  for (const s of short.sources ?? []) {
    if (!s.ok || s.count !== 0) continue        // vastaamaton tai tuottava → ei ehdokas
    const l = longByName.get(s.name)
    if (!l || !l.ok || l.count !== 0) continue  // tuottaa pidemmällä ikkunalla → kausi
    silent.push(s)
  }

  const candidates = silent.filter((s) => !(s.name in KNOWN_SILENT)).map((s) => s.name)
  const declined = silent
    .filter((s) => s.name in KNOWN_SILENT)
    .map((s) => ({
      name: s.name,
      reason: KNOWN_SILENT[s.name].reason,
      checkedDaysAgo: daysSinceChecked(s.name, today),
      stale: daysSinceChecked(s.name, today) > TRIAGE_STALE_DAYS,
    }))

  const result = {
    origin,
    checkedAt: new Date().toISOString(),
    totalSources: (short.sources ?? []).length,
    eventsShortWindow: short.total ?? null,
    candidates,
    declined,
    staleDeclined: declined.filter((d) => d.stale).map((d) => d.name),
  }

  if (asJson) {
    console.log(JSON.stringify(result, null, 2))
    return
  }

  console.log(`Kohde: ${origin}`)
  console.log(`Lähteitä ${result.totalSources}, tapahtumia 7 pv:n ikkunassa ${result.eventsShortWindow}\n`)

  if (candidates.length === 0) {
    console.log('✓ Ei uusia hiljaa rikkinäisiä lähteitä.')
  } else {
    console.log(`${candidates.length} LÄHDETTÄ HILJAA RIKKI (0 tapahtumaa sekä 7 että 60 pv:n ikkunassa):`)
    for (const c of candidates) console.log(`   • ${c}`)
  }

  if (declined.length > 0) {
    console.log(`\nTutkittu ja hylätty aiemmin (${declined.length}) — ei tutkita uudelleen:`)
    for (const d of declined) {
      const age = Number.isFinite(d.checkedDaysAgo) ? `${d.checkedDaysAgo} pv sitten` : 'päivä tuntematon'
      console.log(`   • ${d.name} (${age})${d.stale ? '  ⚠ perustelu vanhentunut, tarkista' : ''}`)
    }
  }

  if (result.staleDeclined.length > 0) {
    console.log(`\n⚠ ${result.staleDeclined.length} hylkäysperustelua on yli ${TRIAGE_STALE_DAYS} pv vanha: ${result.staleDeclined.join(', ')}`)
  }
}

main()

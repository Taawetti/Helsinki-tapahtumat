// Kävijätilastojen kooste admin-näkymälle — puhdas ja testattava
// (scripts/test-categories.ts). Reitti /api/admin/stats hakee rivit ja kutsuu
// koostaTilastot; näkymä components/AdminStats piirtää tuloksen.
//
// MIKSI PÄIVÄKOHTAINEN (omistaja 25.10.2026): aiempi näkymä osasi vain
// "viimeiset 7/30/90 päivää" -ikkunan, jossa tämän päivän luvut hukkuvat
// kuukauden massaan. Nyt jakso valitaan Helsinki-päivinä (alku ja loppu), ja
// jokaisesta päivästä palautetaan oma rivi, jotta kampanjan vaikutuksen näkee
// päivän tarkkuudella.
//
// MIKSI TAPAHTUMAKOHTAINEN: omistaja haluaa seurata yksittäisen tapahtuman
// (Jannan joulu, Kallion kirkko 9.12.2026) näkyvyyttä. Mittaus tallentaa jo
// event_id:n avauksiin ja uloslinkkeihin, uloslinkin verkkotunnuksen
// meta-kenttään, suunnitelmaan lisäyksen otsikolla ja jaetun /e/-sivun
// avauksen polkuna — tämä kooste vain lukee ne yhteen.
//
// Päivärajat ovat Helsinki-päiviä. 00:30 Helsinkiä on UTC:nä edellisen päivän
// 21:30Z — UTC-päivä antaisi väärän päivän kaikille yön tapahtumille.

import { helsinkiDateOf, helsinkiHourOf, helsinkiISO } from './helsinki-time'

export interface KlikkiRivi {
  kind: string
  surface: string | null
  event_id: string | null
  label: string | null
  meta: string | null
  country: string | null
  city: string | null
  region: string | null
  visitor: string | null
  created_at: string
}

export interface Rivi { nimi: string; maara: number }

export const PAIVA_RE = /^\d{4}-\d{2}-\d{2}$/
/** Pisin sallittu jakso päivinä — pidempi luettaisiin katon yli. */
export const MAX_JAKSO_PV = 366

// ── Päivämatematiikka ───────────────────────────────────────────────────────

/** YYYY-MM-DD ± n päivää (UTC-aritmetiikka päivämerkkijonolle, ei kellonaikaa). */
export function siirraPaivaa(paiva: string, n: number): string {
  const [y, m, d] = paiva.split('-').map(Number)
  return new Date(Date.UTC(y, m - 1, d + n)).toISOString().slice(0, 10)
}

/** Helsinki-päivän alku UTC-hetkenä. DST-tietoinen myös siirtymäpäivinä:
 *  25.10.2026 (kesäaika päättyy klo 4) alkaa 24.10. 21:00Z ja 26.10. alkaa
 *  25.10. 22:00Z. Kokeillaan molemmat offsetit ja valitaan se, jolla Helsinki-
 *  kello näyttää 00:00 kyseisenä päivänä. */
export function helsinkiPaivanAlku(paiva: string): string {
  const [y, m, d] = paiva.split('-').map(Number)
  for (const offsetH of [3, 2]) {
    const t = new Date(Date.UTC(y, m - 1, d, 0, 0) - offsetH * 3_600_000).toISOString()
    if (helsinkiDateOf(t) === paiva && helsinkiHourOf(t) === 0) return t
  }
  return new Date(helsinkiISO(y, m, d, 0, 0)).toISOString()
}

/** Päivät from…to (molemmat mukana). Tyhjä, jos väli on nurin tai liian pitkä. */
export function paivatValilla(from: string, to: string): string[] {
  if (!PAIVA_RE.test(from) || !PAIVA_RE.test(to) || from > to) return []
  const paivat: string[] = []
  for (let p = from; p <= to && paivat.length <= MAX_JAKSO_PV; p = siirraPaivaa(p, 1)) paivat.push(p)
  return paivat
}

// ── Lippukaupat ─────────────────────────────────────────────────────────────
// Uloslinkki näihin verkkotunnuksiin on "klikkaus lippukauppaan" — lähin asia
// ostoon, jonka sovellus näkee. Lista on tarkoituksella lyhyt ja nimetty.
const LIPPUKAUPAT = ['lippu.fi', 'lippupiste.fi', 'ticketmaster.', 'tiketti.fi', 'kide.app', 'eventim.', 'billetto.', 'fienta.', 'eventbrite.', 'liveto.', 'tickets.']

export function onLippukauppa(domain: string | null | undefined): boolean {
  if (!domain) return false
  const d = domain.toLowerCase().replace(/^www\./, '')
  // Pisteeseen päättyvä merkintä on brändin alku (ticketmaster.fi, .com…);
  // muut ovat tarkkoja verkkotunnuksia aliverkkotunnuksineen.
  return LIPPUKAUPAT.some((k) => k.endsWith('.') ? d.includes(k) : d === k || d.endsWith(`.${k}`))
}

/** Jakson rajat pyynnöstä: ?from/?to Helsinki-päivinä, tai vanha ?days=N
 *  (N viimeistä päivää tähän päivään asti). Kelvoton päivä → days-ikkuna,
 *  nurin oleva väli käännetään, liian pitkä lyhennetään lopusta taaksepäin. */
export function ratkaiseJakso(q: { from?: string | null; to?: string | null; days?: string | null }, tanaan: string): { from: string; to: string } {
  let from = q.from ?? ''
  let to = q.to ?? ''
  if (!PAIVA_RE.test(from) || !PAIVA_RE.test(to)) {
    const paivat = Math.min(Math.max(Number(q.days ?? 30) || 30, 1), 365)
    to = tanaan
    from = siirraPaivaa(tanaan, -(paivat - 1))
  }
  if (from > to) [from, to] = [to, from]
  if (paivatValilla(from, to).length > MAX_JAKSO_PV) from = siirraPaivaa(to, -(MAX_JAKSO_PV - 1))
  return { from, to }
}

// ── Apurit ──────────────────────────────────────────────────────────────────

/** Laskee esiintymät ja palauttaa suurimmat ensin. */
export function top(rivit: KlikkiRivi[], avain: (r: KlikkiRivi) => string | null, n = 15): Rivi[] {
  const m = new Map<string, number>()
  for (const r of rivit) {
    const k = avain(r)
    if (!k) continue
    m.set(k, (m.get(k) ?? 0) + 1)
  }
  return [...m.entries()].sort((a, b) => b[1] - a[1]).slice(0, n).map(([nimi, maara]) => ({ nimi, maara }))
}

const eriKavijoita = (rivit: KlikkiRivi[]) => new Set(rivit.map((r) => r.visitor).filter(Boolean)).size

// ── Tapahtumakohtainen erittely ─────────────────────────────────────────────

export interface TapahtumaTilasto {
  id: string
  /** Yleisin otsikko avauksista — lähde voi kirjoittaa sen eri tavoin. */
  nimi: string | null
  avaukset: number
  eriAvaajat: number
  ulkoisetKlikit: number
  lippuklikit: number
  /** plan_add-rivit otsikon perusteella: niissä ei ole event_id:tä. */
  suunnitelmaan: number
  /** Jaetun /e/<id>-sivun avaukset (pageview). */
  jaetunSivunKaynnit: number
  /** Jakson ensimmäinen mittaus tälle tapahtumalle. */
  ensimmainen: string | null
  pinnat: Rivi[]
  domainit: Rivi[]
  maat: Rivi[]
  kaupungitFI: Rivi[]
  paivittain: { paiva: string; avaukset: number; ulkoiset: number; lippuklikit: number }[]
}

export function koostaTapahtuma(rivit: KlikkiRivi[], id: string, paivat: string[]): TapahtumaTilasto | null {
  const omat = rivit.filter((r) => r.event_id === id)
  const avaukset = omat.filter((r) => r.kind === 'event_open')
  const ulkoiset = omat.filter((r) => r.kind === 'external_click')
  const nimi = top(avaukset.length ? avaukset : omat, (r) => r.label, 1)[0]?.nimi ?? null
  // Suunnitelmaan lisäys kirjataan otsikolla ilman event_id:tä (lib/suunnitelma).
  const suunnitelmaan = nimi ? rivit.filter((r) => r.kind === 'plan_add' && r.label === nimi).length : 0
  // Jaetun sivun polku on /e/<id> URL-koodattuna (components/PageView kirjaa pathnamen).
  const polut = new Set([`/e/${id}`, `/e/${encodeURIComponent(id)}`])
  const jaetunSivunKaynnit = rivit.filter((r) => r.kind === 'pageview' && r.label && polut.has(r.label)).length
  if (omat.length === 0 && suunnitelmaan === 0 && jaetunSivunKaynnit === 0) return null

  const paivaMap = new Map(paivat.map((p) => [p, { paiva: p, avaukset: 0, ulkoiset: 0, lippuklikit: 0 }]))
  for (const r of omat) {
    const rivi = paivaMap.get(helsinkiDateOf(r.created_at))
    if (!rivi) continue
    if (r.kind === 'event_open') rivi.avaukset++
    if (r.kind === 'external_click') { rivi.ulkoiset++; if (onLippukauppa(r.meta)) rivi.lippuklikit++ }
  }
  return {
    id,
    nimi,
    avaukset: avaukset.length,
    eriAvaajat: eriKavijoita(avaukset),
    ulkoisetKlikit: ulkoiset.length,
    lippuklikit: ulkoiset.filter((r) => onLippukauppa(r.meta)).length,
    suunnitelmaan,
    jaetunSivunKaynnit,
    ensimmainen: omat.map((r) => r.created_at).sort()[0] ?? null,
    pinnat: top(avaukset, (r) => r.surface),
    domainit: top(ulkoiset, (r) => r.meta),
    maat: top(omat, (r) => r.country, 10),
    kaupungitFI: top(omat.filter((r) => r.country === 'FI'), (r) => r.city, 10),
    paivittain: [...paivaMap.values()],
  }
}

// ── Koko kooste ─────────────────────────────────────────────────────────────

export interface KoosteAsetukset {
  /** Helsinki-päivät, molemmat mukana. */
  from: string
  to: string
  /** Seurattavan tapahtuman event_id, tai null. */
  tapahtumaId?: string | null
}

export function koostaTilastot(rivit: KlikkiRivi[], a: KoosteAsetukset) {
  const paivat = paivatValilla(a.from, a.to)
  const vain = (k: string) => rivit.filter((r) => r.kind === k)

  const maarat: Record<string, number> = {}
  for (const r of rivit) maarat[r.kind] = (maarat[r.kind] ?? 0) + 1

  // Päiväkohtainen sarja: jokaiselle jakson päivälle rivi, myös nollille —
  // tyhjä päivä on tieto eikä aukko.
  const paivaMap = new Map(paivat.map((p) => [p, { paiva: p, kaynnit: 0, kavijat: new Set<string>(), avaukset: 0, ulkoiset: 0 }]))
  for (const r of rivit) {
    const rivi = paivaMap.get(helsinkiDateOf(r.created_at))
    if (!rivi) continue
    if (r.kind === 'pageview') rivi.kaynnit++
    if (r.kind === 'event_open') rivi.avaukset++
    if (r.kind === 'external_click') rivi.ulkoiset++
    if (r.visitor) rivi.kavijat.add(r.visitor)
  }

  // Tapahtumalista seurattavan valintaan: eniten avatut event_id:llä.
  const avauksetIdlla = new Map<string, { nimi: string; maara: number }>()
  for (const r of vain('event_open')) {
    if (!r.event_id) continue
    const t = avauksetIdlla.get(r.event_id)
    if (t) { t.maara++; if (!t.nimi && r.label) t.nimi = r.label }
    else avauksetIdlla.set(r.event_id, { nimi: r.label ?? '', maara: 1 })
  }
  const tapahtumat = [...avauksetIdlla.entries()]
    .sort((x, y) => y[1].maara - x[1].maara)
    .slice(0, 60)
    .map(([id, t]) => ({ id, nimi: t.nimi || id, maara: t.maara }))

  return {
    from: a.from,
    to: a.to,
    paivat: paivat.length,
    maarat,
    // ERI KÄVIJÄT. Tiiviste on kuukausikohtainen, joten luku on tarkka
    // kuukauden sisällä. Jaksolla joka ylittää kuukausirajan sama ihminen voi
    // esiintyä kahtena — se on tietoinen hinta siitä ettei kenenkään käyntejä
    // yhdistetä kuukausien yli. Näkymä kertoo tämän.
    eriKavijat: eriKavijoita(rivit),
    // Kuukausittain, jotta kasvun näkee. Avain YYYY-MM (Helsinki-kuukausi).
    kavijatKuukausittain: (() => {
      const kk: Record<string, Set<string>> = {}
      for (const r of rivit) {
        if (!r.visitor || !r.created_at) continue
        const k = helsinkiDateOf(r.created_at).slice(0, 7)
        ;(kk[k] ??= new Set()).add(r.visitor)
      }
      return Object.fromEntries(Object.entries(kk).map(([k, v]) => [k, v.size]))
    })(),
    ilmanKavijaa: rivit.filter((r) => !r.visitor).length,
    // KÄYNNIT. Ainoa luku joka ei vaadi kävijältä klikkausta, joten tämä on
    // lähin vastine "kävijämäärälle".
    kaynnit: vain('pageview').length,
    paivittain: [...paivaMap.values()].map((p) => ({ paiva: p.paiva, kaynnit: p.kaynnit, kavijat: p.kavijat.size, avaukset: p.avaukset, ulkoiset: p.ulkoiset })),
    tapahtumat,
    tapahtuma: a.tapahtumaId ? koostaTapahtuma(rivit, a.tapahtumaId, paivat) : null,
    sivut:              top(vain('pageview'), (r) => r.label, 25),
    tapahtumatAvaukset: top(vain('event_open'), (r) => r.label),
    lippuklikit:        top(vain('ticket_click'), (r) => r.label),
    // Lippukauppaan menneet uloslinkit verkkotunnuksen mukaan (external_click,
    // meta = domain). Vanha ticket_click-laji ei enää kirjaudu, joten tämä on
    // nykyinen "lähin asia ostoon".
    lippukauppaKlikit:  top(vain('external_click').filter((r) => onLippukauppa(r.meta)), (r) => r.label),
    ulkoisetKlikit:     top(vain('external_click'), (r) => r.label),
    suosikit:           top(vain('favorite_add'), (r) => r.label),
    pinnat:             top(vain('event_open'), (r) => r.surface),
    osiot:              top(vain('section'), (r) => r.label),
    oppaat:             top(vain('guide_open'), (r) => r.label),
    kategoriat:         top(vain('category'), (r) => r.label),
    haut:               top(vain('search'), (r) => r.label, 25),
    maat:               top(rivit, (r) => r.country, 20),
    maatLippuklikit:    top(vain('ticket_click'), (r) => r.country, 20),
    ilmanMaata:         rivit.filter((r) => !r.country).length,
    kaupungitFI:        top(rivit.filter((r) => r.country === 'FI'), (r) => r.city, 25),
    kaupungitFILippu:   top(rivit.filter((r) => r.country === 'FI' && r.kind === 'ticket_click'), (r) => r.city, 15),
    // Maakunnat ja suuret kaupungit raakana koodi→määrä, jotta näkymä
    // täydentää nollat (ks. AdminStats).
    maakunnat: (() => {
      const m: Record<string, number> = {}
      for (const r of rivit) if (r.country === 'FI' && r.region) m[r.region] = (m[r.region] ?? 0) + 1
      return m
    })(),
    kaupunkiMaarat: (() => {
      const m: Record<string, number> = {}
      for (const r of rivit) if (r.country === 'FI' && r.city) m[r.city] = (m[r.city] ?? 0) + 1
      return m
    })(),
  }
}

export type Tilastot = ReturnType<typeof koostaTilastot>

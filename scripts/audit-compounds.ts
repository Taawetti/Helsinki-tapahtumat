// YHDYSSANA-AUDITOINTI — estää luokittelun substring-miinojen LUOKAN.
//
// Tausta (tuotantobugit 2026-08-21): VIBES-avainsanan oletusmoodi on substring,
// mikä on TARKOITUKSELLINEN suomen yhdyssanoille (joulu·konsertti → 'konsert',
// kuva·taide → 'taide'). Mutta sama moodi osui myös sanoihin joissa avainsana
// ylittää morfeemirajan ja tarkoittaa aivan muuta:
//     'yökerho'  ⊂ käsit·yökerho   (käsityö+kerho)  → neulontakerho = yöelämää
//     'yöelämä'  ⊂ t·yöelämä·än    (työ+elämä)      → työnhakuinfo = yöelämää
//     'baari'    ⊂ sauna·baari·ssa                  → käsityöryhmä = baari
//     'kokoelma' ⊂ essee·kokoelma                   → kirjailijavierailu = museo
// Yksittäisen avainsanan korjaaminen hoitaa yhden tapauksen, ei luokkaa: joka
// uusi lähde tuo uutta sanastoa, ja seuraava miina löytyy vasta tuotannosta.
//
// TÄMÄ portti kääntää asetelman: jokainen avainsanan sisäosuma Helsingin
// todelliseen tapahtumasanastoon on joko HYVÄKSYTTY (aito yhdyssana) tai
// buildi kaatuu. Uusi hyväksymätön pari = kehittäjä katsoo sen ENNEN julkaisua.
//
// Aja:  npx tsx scripts/audit-compounds.ts
//       npx tsx scripts/audit-compounds.ts --update   (lisää uudet parit TODO-perustelulla)
//
// HUOM: --update EI ohita katselmointia — auditointi kaatuu niin kauan kuin
// yhdenkin parin perustelu on "TODO". Perustelu on kirjoitettava käsin.

import { readFileSync, writeFileSync } from 'node:fs'
import { VIBES } from '../lib/types'
import { NIGHTLIFE_TIERS } from '../lib/nightlife'

const VOCAB_PATH = 'fixtures/vocab-helsinki.json'
const GOLDEN_PATH = 'fixtures/compound-golden.json'
const TODO = 'TODO'

type Golden = { approved: Record<string, string>; rejected: Record<string, string> }

const vocab: Record<string, string> = JSON.parse(readFileSync(VOCAB_PATH, 'utf8'))
let golden: Golden
try {
  golden = JSON.parse(readFileSync(GOLDEN_PATH, 'utf8'))
} catch {
  golden = { approved: {}, rejected: {} }
}

const update = process.argv.includes('--update')
const errors: string[] = []
const newPairs: Record<string, string> = {}

// 1) MOODIVALIDOINTI. matchesKeyword tuntee kolme moodia: '^x' (tokenin alku),
//    'x y' (fraasi) ja 'x' (substring). Jos joku lisää neljännen merkinnän tai
//    kirjoitusvirheellisen sigilin, sääntö kuolee HILJAA — tokenisoija ei tuota
//    sellaista merkkiä koskaan. Siksi tuntematon muoto kaataa auditoinnin.
// VAIN '^' on tuettu sigil (lib/event-classify.ts matchesKeyword). '~' tai muu
// merkki ei osuisi koskaan, koska tokenisoija ei tuota sitä → sääntö kuolisi
// hiljaa. Siksi tuntematon sigil kaataa auditoinnin.
const VALID_KEYWORD = /^\^?[\p{L}\p{N}]+(?: [\p{L}\p{N}]+)*$/u
for (const vibe of VIBES) {
  for (const [list, kws] of [['keywords', vibe.keywords], ['excludeKeywords', vibe.excludeKeywords ?? []]] as const) {
    for (const kw of kws) {
      if (!VALID_KEYWORD.test(kw)) {
        errors.push(`TUNTEMATON AVAINSANAMUOTO: ${vibe.id}.${list} → ${JSON.stringify(kw)}`)
      }
    }
  }
}

// 2) SISÄOSUMIEN SKANNAUS. Vain paljas yksisanainen avainsana voi osua sanan
//    keskelle: '^x' ankkuroi alkuun ja fraasit sisältävät välilyönnin.
const pairs = new Map<string, { vibe: string; list: string; kw: string; token: string }>()
const phraseKeywords: { vibe: string; list: string; kw: string }[] = []
for (const vibe of VIBES) {
  for (const [list, kws] of [['keywords', vibe.keywords], ['excludeKeywords', vibe.excludeKeywords ?? []]] as const) {
    for (const kw of kws) {
      if (kw.startsWith('^')) continue
      if (kw.includes(' ')) { phraseKeywords.push({ vibe: vibe.id, list, kw }); continue }
      for (const token of Object.keys(vocab)) {
        if (token === kw) continue
        const idx = token.indexOf(kw)
        if (idx > 0) pairs.set(`${vibe.id}.${list}|${kw}|${token}`, { vibe: vibe.id, list, kw, token })
      }
    }
  }
}

// 2b) FRAASIAVAINSANAT: matchesKeywordin fraasimoodi on substring yhdistettyyn
//     token-jonoon, joten fraasi voi osua TOKENIRAJAN YLI. Esim. 'dj set' osuu
//     tekstiin "... odj set ..." koska joined-jono on " odj set ". Tarkistetaan
//     fraasin ensimmäinen sana tokenien päätteenä (ei-identtinen token).
const phraseKeys = new Set<string>()
for (const { vibe, list, kw } of phraseKeywords) {
  const firstWord = kw.split(' ')[0]
  for (const token of Object.keys(vocab)) {
    if (token === firstWord) continue
    if (!token.endsWith(firstWord)) continue
    const key = `${vibe}.${list}|${kw}|${token}`
    phraseKeys.add(key)
    if (key in golden.rejected) {
      errors.push(`TUNNETTU VIRHEPARI PALASI (fraasi): "${kw}" voi osua tokenirajan yli sanan "${token}" jälkeen (${vibe}.${list})`)
      continue
    }
    if (key in golden.approved) {
      if (golden.approved[key].trim() === TODO) errors.push(`KATSELMOIMATON PARI: "${kw}" / "${token}" — kirjoita perustelu.`)
      continue
    }
    newPairs[key] = TODO
    errors.push(
      `UUSI HYVÄKSYMÄTÖN FRAASIOSUMA: "${kw}" alkaa sanalla "${firstWord}", joka on sanan "${token}" pääte (${vibe}.${list})\n` +
      `    esimerkki: ${vocab[token]}\n` +
      `    → fraasi voi osua "${token} ${kw.split(' ').slice(1).join(' ')}" -kohtaan. Hyväksy jos vaaraton, muuten kirjoita fraasi tarkemmin.`,
    )
  }
}

// 3) VERTAA GOLDENIIN
for (const [key, info] of pairs) {
  if (key in golden.rejected) {
    errors.push(
      `TUNNETTU VIRHEPARI PALASI: "${info.kw}" ⊂ "${info.token}" (${info.vibe}.${info.list})\n` +
      `    syy kirjattu aiemmin: ${golden.rejected[key]}\n` +
      `    korjaa avainsana (esim. '^${info.kw}') — älä siirrä paria approved-osioon.`,
    )
    continue
  }
  if (key in golden.approved) {
    if (golden.approved[key].trim() === TODO) {
      errors.push(`KATSELMOIMATON PARI: "${info.kw}" ⊂ "${info.token}" — kirjoita perustelu TODO:n tilalle (${GOLDEN_PATH}).`)
    }
    continue
  }
  newPairs[key] = TODO
  errors.push(
    `UUSI HYVÄKSYMÄTÖN YHDYSSANAOSUMA: "${info.kw}" ⊂ "${info.token}"  (${info.vibe}.${info.list})\n` +
    `    esimerkki: ${vocab[info.token]}\n` +
    `    → jos "${info.token}" on aito yhdyssana jossa "${info.kw}" on sama morfeemi, lisää se approved-osioon perusteluineen.\n` +
    `    → jos merkitys on eri (kuten käsit·yökerho), korjaa avainsana muotoon '^${info.kw}' ja kirjaa pari rejected-osioon.`,
  )
}

// 3b) NIGHTLIFE-PISTEYTYKSEN KUVIOT SAMAA SANASTOA VASTEN. Barbaari-tapaus
// 2.9.2026 ("Barbaarirannikon merirosvot" sai 3 baaripistettä ja nousi heroon)
// oli TOINEN osamerkkijono-yhdyssanaosuma tuotannossa; VIBES-avainsanoilla
// vartija oli, nightlifeScoren regexeillä ei. Sama triage-mekaniikka:
// jokainen ETULIITTEELLINEN sisäosuma (osuma alkaa keskeltä tokenia) vaatii
// approved- tai rejected-verdiktin. Tokenin ALUSTA alkava osuma on avainsanan
// oma taivutusmuoto (askartelu→askartelua) eikä vaadi katselmointia — vaara
// piilee vain siinä, että EDELTÄVÄ osa muuttaa merkityksen (bar+baari,
// käsit+yökerho, tragi+komedia).
const nlKeys = new Set<string>()
for (const { pisteet, kuvio } of NIGHTLIFE_TIERS) {
  for (const token of Object.keys(vocab)) {
    const m = token.match(kuvio)
    if (!m || m.index === undefined || m.index === 0) continue
    const key = `nl${pisteet}|${m[0]}|${token}`
    nlKeys.add(key)
    if (key in golden.rejected) {
      errors.push(
        `TUNNETTU VIRHEPARI PALASI (nightlife): "${m[0]}" osuu sanan "${token}" sisään (${pisteet} p)\n` +
        `    syy kirjattu aiemmin: ${golden.rejected[key]}\n` +
        `    korjaa kuvio lookbehind-suojalla — älä siirrä paria approved-osioon.`,
      )
      continue
    }
    if (key in golden.approved) {
      if (golden.approved[key].trim() === TODO) errors.push(`KATSELMOIMATON PARI (nightlife): "${m[0]}" ⊂ "${token}" — kirjoita perustelu.`)
      continue
    }
    newPairs[key] = TODO
    errors.push(
      `UUSI HYVÄKSYMÄTÖN NIGHTLIFE-OSUMA: "${m[0]}" ⊂ "${token}" (${pisteet} p)\n` +
      `    esimerkki: ${vocab[token]}\n` +
      `    → jos yhdyssana kuuluu tähän pistetasoon aidosti, hyväksy perusteluineen; muuten korjaa kuvio.`,
    )
  }
}

// REJECTED-vartijat myös silloin kun kuvio EI enää osu: jos rejected-parin
// token on sanastossa mutta osumaa ei tule, suoja toimii — mutta jos joku
// poistaa lookbehindin, osuma palaa ja yllä oleva silmukka hälyttää.

// 4) SIIVOUS: approved-pari jonka avainsana ei enää ole VIBES:issä on kuollutta
//    painoa. Elossa olevat = substring-parit JA fraasiparit.
const liveKeys = new Set([...pairs.keys(), ...phraseKeys, ...nlKeys])
const stale = Object.keys(golden.approved).filter((k) => !liveKeys.has(k))

if (update && Object.keys(newPairs).length > 0) {
  const merged: Golden = {
    approved: Object.fromEntries(Object.entries({ ...golden.approved, ...newPairs }).sort(([a], [b]) => a.localeCompare(b))),
    rejected: golden.rejected,
  }
  writeFileSync(GOLDEN_PATH, JSON.stringify(merged, null, 2) + '\n')
  console.log(`--update: lisätty ${Object.keys(newPairs).length} paria approved-osioon perusteluna "${TODO}".`)
  console.log('Kirjoita jokaiselle oikea perustelu — auditointi kaatuu niin kauan kuin TODO on jäljellä.')
  process.exit(1)
}

console.log(`Yhdyssana-auditointi: ${pairs.size} sisäosumaa · ${Object.keys(golden.approved).length} hyväksyttyä · ${Object.keys(golden.rejected).length} kiellettyä`)
if (stale.length > 0) console.log(`  huom: ${stale.length} approved-paria ei enää esiinny (avainsana muuttunut) — voi siivota`)

if (errors.length > 0) {
  console.error(`\n${errors.length} ongelma(a):\n`)
  console.error(errors.join('\n\n'))
  console.error(`\nAja "npx tsx scripts/audit-compounds.ts --update" lisätäksesi uudet parit katselmoitavaksi.`)
  process.exit(1)
}
console.log('  ✓ ei hyväksymättömiä sisäosumia')

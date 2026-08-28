// Uniformi hakusanasuodatus aggregaatin lopputulokseen — PUHDAS,
// fixture-testattava (scripts/test-categories.ts).
//
// Käyttäjäraportti 8/2026: "punk"-haku toi 779 tulosta (käytännössä koko
// syöte suodattamatta) mm. luontokävelyn ja kirjastopäivän. Syy: keyword
// vaikutti vain osaan lähteistä, ja LinkedEventsin oma text-haku on
// löysä osasanaosuma myös kuvauksiin (Punkaharju ym.). Korjaus: tarkka
// osuma OTSAKOSTA, KATEGORIOISTA ja VIBEISTÄ — kuvausta ja venue-nimeä
// ei käytetä (niiden osasanaosumat ovat genrehaussa roskaa).
//
// Osuma vaaditaan KOKONAISENA SANANA (\b...\b), ei osasanana: muuten
// "kaupunki" (kaupunkiluonto/-kulttuuri/-suunnittelu-kategoriat) ja
// "Punkaharju" osuvat hakuun "punk". Sivuvaikutus (hyväksytty): taivutukset
// kuten "punkkia"/"punkin" eivät osu — tarkkuus on tässä tärkeämpi kuin
// recall, koska haku on käyttäjän kirjoittama vapaateksti.
import type { Event } from './types'

export function eventMatchesKeyword(e: Event, keyword: string): boolean {
  const q = keyword.trim().toLowerCase()
  if (!q) return true
  const esc = q.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  const hay = [
    e.title.toLowerCase(),
    ...e.categories.map(c => c.toLowerCase()),
    ...(e.vibes ?? []).map(v => v.toLowerCase()),
  ].join(' ')
  return new RegExp(`\\b${esc}\\b`).test(hay)
}

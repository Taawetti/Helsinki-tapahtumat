// Uniformi hakusanasuodatus aggregaatin lopputulokseen — PUHDAS,
// fixture-testattava (scripts/test-categories.ts).
//
// Käyttäjäraportti 8/2026: "punk"-haku toi 779 tulosta (käytännössä koko
// syöte suodattamatta) mm. luontokävelyn ja kirjastopäivän. Syy: keyword
// vaikutti vain osaan lähteistä, ja LinkedEventsin oma text-haku on
// löysä osasanaosuma myös kuvauksiin (Punkaharju ym.). Korjaus: tarkka
// osuma OTSAKOSTA, KATEGORIOISTA ja VIBEISTÄ — kuvausta ja venue-nimeä
// ei käytetä (niiden osasanaosumat ovat genrehaussa roskaa).
import type { Event } from './types'

export function eventMatchesKeyword(e: Event, keyword: string): boolean {
  const q = keyword.trim().toLowerCase()
  if (!q) return true
  if (e.title.toLowerCase().includes(q)) return true
  if (e.categories.some(c => c.toLowerCase().includes(q))) return true
  if ((e.vibes ?? []).some(v => v.toLowerCase().includes(q))) return true
  return false
}

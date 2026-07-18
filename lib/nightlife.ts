import { Event } from './types'

// Terrace/outdoor keyword match — shared by the home feed's summer carousel
// and the /terassit SEO page.
export const TERRACE_REGEX = /terassi|ulkoilma|outdoor|puisto|esplanadi|kasarmitori|allas|ranta|ulkoilta|kesäohjelma/

// Keyword-tiered nightlife relevance score. Shared by the home feed
// (hero + "Illan parhaat" carousel) and the evening push digest.
export function nightlifeScore(e: Event): number {
  const text = [e.title, e.shortDescription, ...e.categories].join(' ').toLowerCase()
  if (/festivaali|festival|festarit/.test(text)) return 8
  if (/keikka|konsertti|live[\s-]?musiikki|bändi|gig/.test(text)) return 7
  if (/klubi|dj[\s-]?set|yökerho|disco|rave|after[\s-]?party/.test(text)) return 6
  if (/jääkiekko|jalkapallo|ottelu|urheilu|koripallo/.test(text)) return 5
  if (/stand[\s-]?up|komedia|comedy/.test(text)) return 4
  if (/baari|pub|cocktail|terassi/.test(text)) return 3
  if (/ravintola|illallinen|pop[\s-]?up|ruoka/.test(text)) return 2
  if (/näyttely|museo|luento|seminaari|workshop|työpaja/.test(text)) return -1
  return e.image ? 1 : 0
}

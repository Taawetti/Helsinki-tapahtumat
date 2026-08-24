// Ryhmäpäätöskoneen jaetut tyypit + apurit (client + server).
import type { Candidate, GroupWhen, CandidateRole } from '@/lib/candidate'

// 'arc' = AI kutoo illan kaaren tykätyistä · 'quick' = ensimmäinen
// enemmistön ❤️ saanut kortti voittaa heti.
export type GroupMode = 'arc' | 'quick'


// ── Tulokset ──────────────────────────────────────────────────────────────

// Yksi kaaren vaihe. Server GROUNDAA faktat (title/address/url/image/lat/lon)
// session candidates-snapshotista cardId:n perusteella — AI kirjoittaa vain
// järjestyksen ja perustelut, joten hallusinoituja paikkoja/linkkejä ei pääse tulokseen.
export interface PlanStep {
  cardId?: string
  role: string
  emoji: string
  title: string
  time?: string
  why: string
  // Groundatut faktat (jos cardId tunnistettiin):
  address?: string
  url?: string
  image?: string | null
  lat?: number
  lon?: number
  rating?: number
  badge?: string
  isFree?: boolean
  priceLevel?: number
  openingHours?: string          // OSM opening_hours — "auki kaaren ajankohtana" -merkintöjä varten
  superMatch?: boolean             // kaikki osallistujat tykkäsivät
  durH?: number                    // suunniteltu kesto tunteina (aikajanan/slack-laskennan apu)
  travelFromPrevMin?: number       // kävelyaika edellisestä vaiheesta (haversine)
  travelFromPrevMode?: 'walk' | 'transit'  // 'transit' kun kävely > 25 min → Reittiopas-linkki
  travelFromPrevUrl?: string       // reittiopas.hsl.fi-reittilinkki (vain transit-moodissa)
  travelFromPrevSummary?: string   // Digitransit-tarkennus: "~32 min · bussi 14"
}

export interface GroupArcPlan {
  kind: 'arc'
  engine?: 'ai' | 'rules'      // 'rules' = deterministinen (0 €), 'ai' = Claude
  variant?: number             // deterministisen kiertovariantti ("kudo uudelleen")
  date?: string                // kaaren päivämäärä (ISO) — aukioloarkojen ratkaisu
  intro: string
  arc: PlanStep[]
  outro?: string
}

export interface GroupQuickPlan {
  kind: 'quick'
  cardId: string
  title: string                    // groundattu
  intro: string                    // esim. "Enemmistö valitsi — päätös tehty!"
  // Groundatut voittajakortin faktat:
  emoji?: string
  role?: string
  image?: string | null
  address?: string
  url?: string
  time?: string
  rating?: number
  badge?: string
  isFree?: boolean
  lat?: number
  lon?: number
  openingHours?: string
  votesFor?: number
  voterCount?: number
}

export type GroupResult = GroupArcPlan | GroupQuickPlan

// Vanha tyyppialias (AI-synteesin välimuoto parse-vaiheessa).
export type GroupPlan = GroupArcPlan


// ── Näyttölabelit (client) ────────────────────────────────────────────────









// ── Etäisyys ──────────────────────────────────────────────────────────────

// Haversine-metrit kahden pisteen välillä.
export function haversineMeters(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371000
  const toRad = (d: number) => (d * Math.PI) / 180
  const dLat = toRad(lat2 - lat1)
  const dLon = toRad(lon2 - lon1)
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2
  return 2 * R * Math.asin(Math.sqrt(a))
}

// Kävelyaika minuutteina: linnuntie × 1.3 (katuverkko) / 5 km/h.
// Palauttaa undefined jos pisteet puuttuvat tai ovat käytännössä samat.
export function walkMinutesBetween(
  a: { lat?: number; lon?: number },
  b: { lat?: number; lon?: number },
): number | undefined {
  if (a.lat == null || a.lon == null || b.lat == null || b.lon == null) return undefined
  const m = haversineMeters(a.lat, a.lon, b.lat, b.lon)
  if (m < 150) return undefined // sama kortteli — ei erillistä siirtymää
  return Math.max(1, Math.round(((m * 1.3) / 5000) * 60))
}

// ROLE_META-label tyyppiturvallisena kaaren vaiheille (tuntematon rooli → fallback).
import { ROLE_META } from '@/lib/candidate'

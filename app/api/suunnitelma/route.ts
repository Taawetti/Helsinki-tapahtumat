// Jaetut suunnitelmat: POST luo jakolinkin (snapshot Supabaseen), DELETE
// poistaa oman jaon poistoavaimella. Snapshot — EI viittauksia tapahtuma-
// id:ihin — koska tapahtumat vanhenevat ja jaettu linkki säilyy (omistajan
// linjaus 6.9.2026: linkki säilyy, tekijä voi poistaa itse).
import { NextRequest, NextResponse } from 'next/server'
import { randomBytes } from 'node:crypto'
import { supabaseAdmin } from '@/lib/supabase'
import { rateLimit, clientIp } from '@/lib/rate-limit'
import { ASKEL_MAX } from '@/lib/suunnitelma'
import { isCompetitorUrl, onMaksunkeruuUrl } from '@/lib/event-links'

interface JaettuAskel {
  tyyppi: string
  nimi: string
  osoite?: string
  lat?: number
  lon?: number
  kuva?: string | null
  klo?: string
  kavelyMin?: number
  rooli?: string
  ankkuriISO?: string
  loppuISO?: string
  kuvaus?: string
  linkki?: string | null
  aukiolot?: string
  paikkaNimi?: string
  hinta?: string
  tyyppiNimike?: string
  puhelin?: string
  arvosana?: number
  arvosteluja?: number
}

const teksti = (v: unknown, max: number): string | undefined =>
  typeof v === 'string' && v.trim() ? v.trim().slice(0, max) : undefined

const luku = (v: unknown): number | undefined =>
  typeof v === 'number' && Number.isFinite(v) ? v : undefined

function siivoaAskel(raaka: unknown): JaettuAskel | null {
  if (!raaka || typeof raaka !== 'object') return null
  const a = raaka as Record<string, unknown>
  const nimi = teksti(a.nimi, 120)
  if (!nimi) return null
  const kuva = teksti(a.kuva, 600)
  return {
    tyyppi: teksti(a.tyyppi, 20) ?? 'oma',
    nimi,
    osoite: teksti(a.osoite, 160),
    lat: luku(a.lat),
    lon: luku(a.lon),
    // Vain https-kuvat — jaettu sivu renderöi nämä.
    kuva: kuva && /^https:\/\//.test(kuva) ? kuva : null,
    klo: teksti(a.klo, 5),
    kavelyMin: luku(a.kavelyMin),
    rooli: teksti(a.rooli, 20),
    ankkuriISO: teksti(a.ankkuriISO, 40),
    loppuISO: teksti(a.loppuISO, 40),
    kuvaus: teksti(a.kuvaus, 5000),
    // Vain https ja ei kilpailijalle/maksunkeruulle — sama portti kuin sovelluksessa.
    linkki: (() => {
      const u = teksti(a.linkki, 600)
      return u && /^https:\/\//.test(u) && !isCompetitorUrl(u) && !onMaksunkeruuUrl(u) ? u : null
    })(),
    // Rikastettu tilannekuva vastaanottajan infopaneelia varten — yksittäisiä
    // rajattuja kenttiä, ei koskaan kokonaisia lähdeolioita (auditointi 5.9.2026).
    aukiolot: teksti(a.aukiolot, 400),
    paikkaNimi: teksti(a.paikkaNimi, 120),
    hinta: teksti(a.hinta, 160),
    tyyppiNimike: teksti(a.tyyppiNimike, 60),
    // Puhelin renderöidään tel:-linkkinä — vain numeromaiset merkit kelpaavat.
    puhelin: (() => {
      const p = teksti(a.puhelin, 30)
      return p && /^[+0-9 ()-]{5,25}$/.test(p) ? p : undefined
    })(),
    arvosana: (() => {
      const n = luku(a.arvosana)
      return n !== undefined && n >= 0 && n <= 5 ? Math.round(n * 10) / 10 : undefined
    })(),
    arvosteluja: (() => {
      const n = luku(a.arvosteluja)
      return n !== undefined && n >= 0 ? Math.min(Math.round(n), 999999) : undefined
    })(),
  }
}

export async function POST(req: NextRequest) {
  if (!rateLimit(`suunnitelma:${clientIp(req)}`, 10, 60 * 60_000)) {
    return NextResponse.json({ error: 'Liian monta jakoa. Yritä myöhemmin.' }, { status: 429 })
  }
  if (!supabaseAdmin) return NextResponse.json({ error: 'Palvelinvirhe' }, { status: 500 })

  const body = await req.json().catch(() => null) as Record<string, unknown> | null
  if (!body || !Array.isArray(body.askeleet) || body.askeleet.length === 0) {
    return NextResponse.json({ error: 'Suunnitelma on tyhjä' }, { status: 400 })
  }
  const askeleet = body.askeleet.slice(0, ASKEL_MAX).map(siivoaAskel).filter(Boolean) as JaettuAskel[]
  if (askeleet.length === 0) return NextResponse.json({ error: 'Suunnitelma on tyhjä' }, { status: 400 })

  const token = randomBytes(8).toString('base64url').replace(/[-_]/g, 'a').slice(0, 10)
  const poistoAvain = randomBytes(18).toString('base64url')

  const { error } = await supabaseAdmin.from('jaetut_suunnitelmat').insert({
    token,
    poisto_avain: poistoAvain,
    otsikko: teksti(body.otsikko, 80) ?? null,
    paiva: teksti(body.paiva, 10) ?? null,
    alku_klo: teksti(body.alkuKlo, 5) ?? null,
    askeleet,
  })
  if (error) {
    console.error('[suunnitelma] insert:', error.message)
    return NextResponse.json({ error: 'Tallennus epäonnistui' }, { status: 500 })
  }
  return NextResponse.json({ token, poistoAvain })
}

export async function DELETE(req: NextRequest) {
  if (!supabaseAdmin) return NextResponse.json({ error: 'Palvelinvirhe' }, { status: 500 })
  const body = await req.json().catch(() => null) as { token?: string; avain?: string } | null
  if (!body?.token || !body?.avain) return NextResponse.json({ error: 'Puutteelliset tiedot' }, { status: 400 })
  const { data, error } = await supabaseAdmin
    .from('jaetut_suunnitelmat')
    .delete()
    .eq('token', body.token)
    .eq('poisto_avain', body.avain)
    .select('token')
  if (error) {
    console.error('[suunnitelma] delete:', error.message)
    return NextResponse.json({ error: 'Poisto epäonnistui' }, { status: 500 })
  }
  if (!data || data.length === 0) return NextResponse.json({ error: 'Ei löytynyt' }, { status: 404 })
  return NextResponse.json({ ok: true })
}

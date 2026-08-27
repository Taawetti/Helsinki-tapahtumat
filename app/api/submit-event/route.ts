import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase'

const BREVO_API = 'https://api.brevo.com/v3'

// Osoiterivi viestin alalaidassa. Oli kovakoodattu vanha vercel.app-osoite,
// joka ei vastaa lähettäjän domainia — ristiriita lähettäjän ja sisällön
// välillä on yksi signaali jota roskapostisuodattimet painottavat.
const SITE_HOST = (process.env.NEXT_PUBLIC_SITE_URL || 'https://mitatanaan.fi')
  .replace(/^https?:\/\//, '').replace(/\/+$/, '')

interface EventSubmission {
  nimi: string
  kuvaus?: string
  pvm: string
  aika?: string
  /** Loppumisaika. Ilman tätä kestoltaan pitkä tapahtuma (näyttely, festari)
   *  näyttäisi ilmoituksessa yhdeltä kellonlyömältä. */
  loppuu?: string
  paikka: string
  hinta?: string
  kategoria?: string
  linkki?: string
  email: string
  /** Kuva data-URL-muodossa. Selain pienentää sen ennen lähetystä. */
  kuva?: string
}

/** Kellonaikaosuus päivämäärärivin perään.
 *
 *  Kaikki neljä yhdistelmää on käsiteltävä erikseen: pelkkä loppumisaika on
 *  mahdollinen, koska lomakkeessa kumpikaan aikakenttä ei ole pakollinen. Jos
 *  se liimattaisiin suoraan päivämäärän perään ("2026-09-15–23.30"), rivi
 *  näyttäisi päivämääräväliltä eikä kellonajalta. */
function timeLabel(alkaa: string | undefined, loppuu: string | undefined): string {
  const a = (alkaa ?? '').trim()
  const l = (loppuu ?? '').trim()
  if (a && l) return ` klo ${escHtml(a)}–${escHtml(l)}`
  if (a) return ` klo ${escHtml(a)}`
  if (l) return ` (päättyy klo ${escHtml(l)})`
  return ''
}

function escHtml(s: string | undefined): string {
  if (!s) return ''
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

const SALLITUT_KUVAT: Record<string, string> = {
  'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp',
}
const KUVA_MAX_TAVUA = 5 * 1024 * 1024

/** Tallentaa ilmoittajan kuvan ja palauttaa julkisen osoitteen.
 *
 *  Palauttaa null jos kuvaa ei ole tai se ei kelpaa — kuva ei saa KOSKAAN estää
 *  ilmoituksen lähtemistä. Ilmoitus on tärkeämpi kuin sen kuva, ja rikkinäisen
 *  kuvan takia hukattu tapahtumaehdotus olisi pahin lopputulos.
 *
 *  Tiedostonimi arvotaan palvelimella: käyttäjän antama nimi voisi sisältää
 *  polkuja tai päällekirjoittaa toisen ilmoittajan kuvan. */
async function lataaKuva(dataUrl: string | undefined): Promise<string | null> {
  if (!dataUrl || !supabaseAdmin) return null
  const m = /^data:([a-z/+.-]+);base64,(.+)$/i.exec(dataUrl.trim())
  if (!m) return null
  const [, mime, b64] = m
  const pate = SALLITUT_KUVAT[mime.toLowerCase()]
  if (!pate) return null

  let bytes: Buffer
  try { bytes = Buffer.from(b64, 'base64') } catch { return null }
  if (bytes.length === 0 || bytes.length > KUVA_MAX_TAVUA) return null

  const nimi = `${Date.now()}-${Math.random().toString(36).slice(2, 10)}.${pate}`
  const { error } = await supabaseAdmin.storage
    .from('event-images')
    .upload(nimi, bytes, { contentType: mime, upsert: false })
  if (error) {
    console.error('[submit-event] kuvan lataus:', error.message)
    return null
  }
  return supabaseAdmin.storage.from('event-images').getPublicUrl(nimi).data.publicUrl
}

function safeLink(url: string | undefined): string | null {
  if (!url) return null
  return /^https?:\/\//i.test(url) ? url : null
}

export async function POST(req: NextRequest) {
  const body: EventSubmission = await req.json().catch(() => null)

  if (!body?.nimi || !body?.pvm || !body?.paikka || !body?.email) {
    return NextResponse.json({ error: 'Pakolliset kentät puuttuvat' }, { status: 400 })
  }
  // Muotovalidointi palvelinpuolella (design-speksi): email + URL
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(body.email)) {
    return NextResponse.json({ error: 'Virheellinen sähköpostiosoite' }, { status: 400 })
  }
  if (body.linkki && !/^https?:\/\/\S+\.\S+/i.test(body.linkki)) {
    return NextResponse.json({ error: 'Virheellinen linkki — käytä muotoa https://…' }, { status: 400 })
  }

  const apiKey = process.env.BREVO_API_KEY
  const adminEmail = process.env.ADMIN_EMAIL
  const senderEmail = process.env.BREVO_SENDER_EMAIL

  if (!apiKey || !adminEmail || !senderEmail) {
    console.error('[submit-event] Ympäristömuuttujat puuttuvat')
    return NextResponse.json({ error: 'Palvelinvirhe' }, { status: 500 })
  }

  const link = safeLink(body.linkki)
  const kuvaUrl = await lataaKuva(body.kuva)
  const htmlContent = `
    <h2 style="font-family:sans-serif;color:#a855f7;">Uusi tapahtumaehdotus — Mitä tänään</h2>
    <table style="font-family:sans-serif;font-size:14px;border-collapse:collapse;width:100%;max-width:600px;">
      <tr><td style="padding:6px 12px;font-weight:bold;color:#666;width:140px;">Nimi</td><td style="padding:6px 12px;">${escHtml(body.nimi)}</td></tr>
      <tr style="background:#f9f9f9;"><td style="padding:6px 12px;font-weight:bold;color:#666;">Päivämäärä</td><td style="padding:6px 12px;">${escHtml(body.pvm)}${timeLabel(body.aika, body.loppuu)}</td></tr>
      <tr><td style="padding:6px 12px;font-weight:bold;color:#666;">Paikka</td><td style="padding:6px 12px;">${escHtml(body.paikka)}</td></tr>
      ${body.hinta ? `<tr style="background:#f9f9f9;"><td style="padding:6px 12px;font-weight:bold;color:#666;">Hinta</td><td style="padding:6px 12px;">${escHtml(body.hinta)}</td></tr>` : ''}
      ${body.kategoria ? `<tr><td style="padding:6px 12px;font-weight:bold;color:#666;">Kategoria</td><td style="padding:6px 12px;">${escHtml(body.kategoria)}</td></tr>` : ''}
      ${link ? `<tr style="background:#f9f9f9;"><td style="padding:6px 12px;font-weight:bold;color:#666;">Linkki</td><td style="padding:6px 12px;"><a href="${link}">${escHtml(body.linkki)}</a></td></tr>` : ''}
      ${body.kuvaus ? `<tr><td style="padding:6px 12px;font-weight:bold;color:#666;">Kuvaus</td><td style="padding:6px 12px;">${escHtml(body.kuvaus)}</td></tr>` : ''}
      <tr style="background:#f9f9f9;"><td style="padding:6px 12px;font-weight:bold;color:#666;">Järjestäjä</td><td style="padding:6px 12px;"><a href="mailto:${escHtml(body.email)}">${escHtml(body.email)}</a></td></tr>
      ${kuvaUrl ? `<tr><td style="padding:6px 12px;font-weight:bold;color:#666;">Kuva</td><td style="padding:6px 12px;"><a href="${kuvaUrl}">${kuvaUrl}</a></td></tr>` : ''}
    </table>
    ${kuvaUrl ? `<p style="margin-top:16px;"><a href="${kuvaUrl}"><img src="${kuvaUrl}" alt="" style="max-width:420px;border-radius:8px;" /></a></p>` : ''}
    <p style="font-family:sans-serif;font-size:12px;color:#999;margin-top:24px;">Lähetetty sivustolta ${SITE_HOST} — vastaa tähän viestiin, niin vastaus menee ilmoittajalle.</p>
  `

  try {
    const res = await fetch(`${BREVO_API}/smtp/email`, {
      method: 'POST',
      headers: {
        'api-key': apiKey,
        'Content-Type': 'application/json',
        'Accept': 'application/json',
      },
      body: JSON.stringify({
        // Nimi vastaa sivuston brändiä. Vanha "Helsinki Tapahtumat" ei
        // vastannut lähettäjän domainia eikä sivustoa, mikä on
        // roskapostisuodattimelle epäjohdonmukaisuussignaali.
        // EI kysymysmerkkiä: ääkkösellinen nimi MIME-koodataan, ja nimen
        // sisällä oleva "?" rikkoo koodauksen (todettu 26.8.2026).
        sender: { name: 'Mitä tänään', email: senderEmail },
        to: [{ email: adminEmail }],
        replyTo: { email: body.email },
        // EI escHtml: subject on pelkkää tekstiä, joten HTML-escapetus näkyisi
        // postilaatikossa raakana ("Kalle &amp; Kaverit"). Rivinvaihdot pois,
        // koska ne rikkoisivat otsikkokentän.
        subject: `Tapahtumaehdotus: ${body.nimi.replace(/\s+/g, ' ').trim()} — ${body.pvm}`,
        htmlContent,
        // TEKSTIVERSIO MUKAAN. Pelkkää HTML:ää sisältävä viesti saa
        // roskapostisuodattimilta selvästi huonomman pistemäärän kuin
        // kaksiosainen viesti. Tämä on halvin yksittäinen parannus
        // perillemenoon, eikä se vaadi mitään DNS-muutosta.
        textContent: [
          'Uusi tapahtumaehdotus — Mitä tänään',
          '',
          `Nimi: ${body.nimi}`,
          `Päivämäärä: ${body.pvm}${timeLabel(body.aika, body.loppuu)}`,
          `Paikka: ${body.paikka}`,
          body.hinta ? `Hinta: ${body.hinta}` : '',
          body.kategoria ? `Kategoria: ${body.kategoria}` : '',
          link ? `Linkki: ${body.linkki}` : '',
          body.kuvaus ? `Kuvaus: ${body.kuvaus}` : '',
          `Järjestäjä: ${body.email}`,
          kuvaUrl ? `Kuva: ${kuvaUrl}` : '',
          '',
          `Lähetetty sivustolta ${SITE_HOST}. Vastaa tähän viestiin, niin vastaus menee ilmoittajalle.`,
        ].filter(Boolean).join('\n'),
      }),
    })

    if (!res.ok) {
      const err = await res.json().catch(() => ({}))
      console.error('[submit-event] Brevo error:', res.status, err)
      return NextResponse.json({ error: 'Lähetys epäonnistui' }, { status: 500 })
    }

    return NextResponse.json({ ok: true })
  } catch (err) {
    console.error('[submit-event] fetch error:', err)
    return NextResponse.json({ error: 'Palvelinvirhe' }, { status: 500 })
  }
}

// Tietosuojasivun yhteydenottolomake.
//
// MIKSI LOMAKE EIKÄ NÄKYVÄ SÄHKÖPOSTIOSOITE. Omistaja 26.8.2026: yhteystiedon
// on toimittava, mutta osoitetta ei haluta sivulle. Osoite luetaan tässä
// ympäristömuuttujasta eikä se päädy koskaan selaimeen — HTML:ssä on vain
// lomake, ja vastaanottaja ratkaistaan palvelimella.
//
// EIKÄ MYÖSKÄÄN KOODIIN: tämä repo on julkinen (tarkistettu GitHubin API:sta
// 26.8.2026), joten kovakoodattu osoite olisi yhtä julkinen kuin sivulla oleva.
//
// Sama Brevo-putki kuin tapahtumailmoituksella (app/api/submit-event) — se on
// tuotannossa toimiva polku, joten tälle ei rakenneta omaa rinnakkaista.

import { NextRequest, NextResponse } from 'next/server'

const BREVO_API = 'https://api.brevo.com/v3'

const esc = (s: string) =>
  s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')

export async function POST(req: NextRequest) {
  let body: { email?: string; viesti?: string; hunaja?: string; avattu?: number }
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'Virheellinen pyyntö' }, { status: 400 })
  }

  // Hunajapurkki: kenttä on piilotettu näkyvistä, joten ihminen ei täytä sitä.
  // Robotit täyttävät kaikki kentät. Vastataan onnistumisella, jotta robotti ei
  // opi mikä esti sen.
  if (body.hunaja) return NextResponse.json({ ok: true })

  // Lomake lähetettynä alle sekunnissa avaamisesta on robotti — ihminen ei ehdi
  // kirjoittaa viestiä siinä ajassa.
  if (typeof body.avattu === 'number' && Date.now() - body.avattu < 1500) {
    return NextResponse.json({ ok: true })
  }

  const email = (body.email ?? '').trim()
  const viesti = (body.viesti ?? '').trim()

  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) {
    return NextResponse.json({ error: 'Tarkista sähköpostiosoite' }, { status: 400 })
  }
  if (viesti.length < 5) {
    return NextResponse.json({ error: 'Kirjoita viesti' }, { status: 400 })
  }
  if (viesti.length > 4000 || email.length > 200) {
    return NextResponse.json({ error: 'Viesti on liian pitkä' }, { status: 400 })
  }

  const apiKey = process.env.BREVO_API_KEY
  const senderEmail = process.env.BREVO_SENDER_EMAIL
  // Oma muuttuja jos tietosuojapostit halutaan eri osoitteeseen kuin muut
  // ylläpitoviestit; muuten sama kuin tapahtumailmoituksilla.
  const vastaanottaja = process.env.PRIVACY_EMAIL || process.env.ADMIN_EMAIL

  if (!apiKey || !senderEmail || !vastaanottaja) {
    console.error('[tietosuoja-yhteys] Ympäristömuuttujat puuttuvat')
    return NextResponse.json({ error: 'Palvelinvirhe' }, { status: 500 })
  }

  const htmlContent = `
    <h2 style="font-family:sans-serif;color:#6b76ff;">Tietosuojayhteydenotto — Mitä tänään?</h2>
    <table style="font-family:sans-serif;font-size:14px;border-collapse:collapse;width:100%;max-width:600px;">
      <tr><td style="padding:6px 12px;font-weight:bold;color:#666;width:120px;">Lähettäjä</td>
          <td style="padding:6px 12px;"><a href="mailto:${esc(email)}">${esc(email)}</a></td></tr>
      <tr style="background:#f9f9f9;"><td style="padding:6px 12px;font-weight:bold;color:#666;vertical-align:top;">Viesti</td>
          <td style="padding:6px 12px;white-space:pre-wrap;">${esc(viesti)}</td></tr>
    </table>
    <p style="font-family:sans-serif;font-size:12px;color:#999;margin-top:24px;">
      Lähetetty tietosuojasivun lomakkeelta. Vastaa suoraan tähän viestiin —
      vastaus menee lähettäjälle.
    </p>
  `

  try {
    const res = await fetch(`${BREVO_API}/smtp/email`, {
      method: 'POST',
      headers: { 'api-key': apiKey, 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify({
        // Lähettäjän nimessä ei kysymysmerkkiä, vaikka tuotenimi on
        // "Mitä tänään?". Sama muoto kuin muissa lähtevissä viesteissä.
        //
        // HUOM seuraavalle lukijalle: epäilin ensin että kysymysmerkki rikkoo
        // otsikon MIME-koodauksen, ja kirjoitin sen tähän varmana. Se oli
        // arvaus ja se oli VÄÄRÄ — todellinen syy löytyi lokista: Brevo-tilillä
        // oli IP-rajoitus päällä ja se torjui Vercelin osoitteen (401
        // unauthorized). Sama virhe kaatoi myös tapahtumailmoituslomakkeen.
        // Nimi jätettiin silti ASCII-muotoon, koska se on yhtenäinen muiden
        // viestien kanssa, mutta se EI ollut vika.
        sender: { name: 'Mitä tänään', email: senderEmail },
        to: [{ email: vastaanottaja }],
        // Vastaa-painike osuu suoraan kysyjään ilman että osoitetta tarvitsee
        // kopioida viestin rungosta.
        replyTo: { email },
        subject: `Tietosuoja: ${email}`,
        htmlContent,
      }),
    })
    if (!res.ok) {
      // Runko mukaan lokiin: pelkkä status ei kerro miksi Brevo torjui.
      const virhe = await res.text().catch(() => '')
      console.error('[tietosuoja-yhteys] Brevo error:', res.status, virhe.slice(0, 400))
      return NextResponse.json({ error: 'Lähetys epäonnistui' }, { status: 500 })
    }
    return NextResponse.json({ ok: true })
  } catch (e) {
    console.error('[tietosuoja-yhteys]', e)
    return NextResponse.json({ error: 'Lähetys epäonnistui' }, { status: 500 })
  }
}

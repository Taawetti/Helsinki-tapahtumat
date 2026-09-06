import { ImageResponse } from 'next/og'
import { NextRequest } from 'next/server'

export const runtime = 'edge'

// Kuvan alalaidan osoiterivi. Oli kovakoodattu 'mitatanaan.fi',
// eli JOKA jaettu linkki näytti vanhan osoitteen sen jälkeen kun domain vaihtui
// mitatanaan.fi:hin (havaittu 26.8.2026). Johdetaan nyt samasta muuttujasta kuin
// canonicalit, jotta se ei voi jäädä jälkeen uudestaan.
const SITE_HOST = (process.env.NEXT_PUBLIC_SITE_URL || 'https://mitatanaan.fi')
  .replace(/^https?:\/\//, '')
  .replace(/\/+$/, '')

export async function GET(req: NextRequest) {
  const { searchParams } = req.nextUrl
  const title = searchParams.get('title') || 'Helsinki Tapahtumat'
  const date = searchParams.get('date') || ''
  const location = searchParams.get('location') || ''
  const isFree = searchParams.get('free') === '1'
  // img vain omasta kuvavarastosta: parametri haetaan PALVELIMELLA, joten
  // rajaamaton URL oli sekä SSRF-reitti että tapa tuottaa sivuston brändillä
  // varustettuja jakokortteja mielivaltaisella kuvalla (auditointi 5.9.2026).
  // Vieras osoite → kortti renderöityy siististi ilman kuvaa.
  const imageUrl = (() => {
    const raw = searchParams.get('img') || ''
    if (!raw) return ''
    try {
      const u = new URL(raw)
      if (u.protocol !== 'https:') return ''
      const omaHost = process.env.NEXT_PUBLIC_SUPABASE_URL ? new URL(process.env.NEXT_PUBLIC_SUPABASE_URL).hostname : ''
      if (omaHost && u.hostname === omaHost) return raw
      if (u.hostname === 'mitatanaan.fi' || u.hostname.endsWith('.mitatanaan.fi')) return raw
      return ''
    } catch {
      return ''
    }
  })()
  // Yläreunan tunnusrivi on parametroitu, jotta englanninkielinen /en saa
  // englanninkielisen jakokortin. Oletus pitää kaikki vanhat kutsut ennallaan.
  const brand = searchParams.get('brand') || 'HELSINKI TAPAHTUMAT'

  return new ImageResponse(
    (
      <div
        style={{
          width: '1200px',
          height: '630px',
          display: 'flex',
          flexDirection: 'column',
          background: '#080b10',
          fontFamily: 'system-ui, sans-serif',
          position: 'relative',
          overflow: 'hidden',
        }}
      >
        {/* Background image */}
        {imageUrl && (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={imageUrl}
            alt=""
            style={{
              position: 'absolute',
              inset: 0,
              width: '100%',
              height: '100%',
              objectFit: 'cover',
              opacity: 0.35,
            }}
          />
        )}

        {/* Gradient overlay */}
        <div
          style={{
            position: 'absolute',
            inset: 0,
            background: 'linear-gradient(135deg, #080b10 0%, #0a1020 50%, #080b10 100%)',
            opacity: imageUrl ? 0.75 : 1,
            display: 'flex',
          }}
        />

        {/* Blue accent line */}
        <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: '4px', background: '#6b76ff', display: 'flex' }} />

        {/* Content — MITTAKAAVA: WhatsApp/iMessage kutistaa kortin ~320 px
            leveäksi, eli kaikki näkyy ~27 % koossa. Alkuperäiset koot (otsikko
            52 px, logo 44 px, alarivi 18 px) olivat pikkukortissa lukukelvottomia
            ja kuva näytti tyhjältä mustalta laatalta (omistaja 6.9.2026).
            Siksi typografia on mitoitettu ISOKSI: sen pitää toimia peukalon
            kokoisena, ei työpöydällä. */}
        <div style={{ position: 'relative', display: 'flex', flexDirection: 'column', justifyContent: 'space-between', height: '100%', padding: '48px 56px' }}>

          {/* Top: logo */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
            {/* TUNNUS: toimitettu kuvake-PNG sellaisenaan, ei piirrettyä
                polkua. KUVAKE-OHJE.md VERSIO 3 kieltää vektoripolun erikseen —
                se oli juuri se virhe joka teki tuotannon kuvakkeesta väärän
                näköisen. Merkki on Inter 900:n kysymysmerkki, ja se tulee
                näihin kuviin valmiina PNG:nä.

                Osoite johdetaan pyynnön originista eikä ympäristömuuttujasta:
                näin kuva tulee aina samasta deploysta joka pyyntöä palvelee,
                eikä se voi osoittaa vanhaan julkaisuun.

                Reunan pyöristys on VAIN esitystapa tässä kortissa. Tiedosto
                itse on neliö ilman pyöristystä, kuten ohje vaatii — käyttis
                pyöristää sen laitteella itse. */}
            <img
              src={`${req.nextUrl.origin}/icon-192.png`}
              width={68} height={68}
              style={{ borderRadius: '15px' }}
              alt=""
            />
            <span style={{ color: 'rgba(255,255,255,0.92)', fontSize: '30px', fontWeight: 800, letterSpacing: '-0.01em' }}>Mitä tänään</span>
            <span style={{ color: 'rgba(255,255,255,0.22)', fontSize: '24px' }}>·</span>
            <span style={{ color: 'rgba(255,255,255,0.5)', fontSize: '23px', fontWeight: 600, letterSpacing: '0.05em' }}>{brand}</span>
          </div>

          {/* Middle: title */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '16px', flex: 1, justifyContent: 'center' }}>
            {isFree && (
              <div style={{ display: 'flex' }}>
                <span style={{ background: '#10b981', color: 'white', fontSize: '22px', fontWeight: 700, padding: '6px 20px', borderRadius: '999px', letterSpacing: '0.05em' }}>MAKSUTON</span>
              </div>
            )}
            <div style={{ fontSize: title.length > 80 ? '52px' : title.length > 45 ? '64px' : '80px', fontWeight: 800, color: 'white', lineHeight: 1.08, letterSpacing: '-0.02em', maxWidth: '1060px' }}>
              {title}
            </div>
          </div>

          {/* Bottom: meta */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '32px' }}>
            {date && (
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px', color: '#8b94ff', fontSize: '31px', fontWeight: 700 }}>
                <span>📅</span>
                <span>{date}</span>
              </div>
            )}
            {location && (
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px', color: 'rgba(255,255,255,0.6)', fontSize: '29px', fontWeight: 600 }}>
                <span>📍</span>
                <span>{location}</span>
              </div>
            )}
            <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: '8px', color: 'rgba(255,255,255,0.35)', fontSize: '24px' }}>
              <span>{SITE_HOST}</span>
            </div>
          </div>
        </div>
      </div>
    ),
    { width: 1200, height: 630 }
  )
}

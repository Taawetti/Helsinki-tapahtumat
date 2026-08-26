import { ImageResponse } from 'next/og'
import { NextRequest } from 'next/server'

export const runtime = 'edge'

// Kuvan alalaidan osoiterivi. Oli kovakoodattu 'helsinki-tapahtumat.vercel.app',
// eli JOKA jaettu linkki näytti vanhan osoitteen sen jälkeen kun domain vaihtui
// mitatanaan.fi:hin (havaittu 26.8.2026). Johdetaan nyt samasta muuttujasta kuin
// canonicalit, jotta se ei voi jäädä jälkeen uudestaan.
const SITE_HOST = (process.env.NEXT_PUBLIC_SITE_URL || 'https://helsinki-tapahtumat.vercel.app')
  .replace(/^https?:\/\//, '')
  .replace(/\/+$/, '')

export async function GET(req: NextRequest) {
  const { searchParams } = req.nextUrl
  const title = searchParams.get('title') || 'Helsinki Tapahtumat'
  const date = searchParams.get('date') || ''
  const location = searchParams.get('location') || ''
  const isFree = searchParams.get('free') === '1'
  const imageUrl = searchParams.get('img') || ''
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

        {/* Content */}
        <div style={{ position: 'relative', display: 'flex', flexDirection: 'column', justifyContent: 'space-between', height: '100%', padding: '56px 64px' }}>

          {/* Top: logo */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            {/* TUNNUS: laatta + nimi, sitten erotin ja hakusanarivi.
                Laatta on sama kuin kotinäytön kuvakkeessa (merkki 88 % laatan
                korkeudesta, keskitetty) — omistaja 26.8.2026: tunnuksen on
                oltava täsmälleen sama joka paikassa. Aiemmin tässä oli paljas
                merkki ilman laattaa, ja sitä ennen vanha sininen H-laatta.

                Raaka <svg> eikä Logo-komponentti: Satori (next/og) renderöi
                vain rajattua osajoukkoa eikä osaa currentColoria, joten fill on
                kirjoitettava auki. Polku on sama kuin components/Logo.tsx:ssä. */}
            <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
              <div style={{
                width: '44px', height: '44px', borderRadius: '12px',
                background: 'linear-gradient(150deg,#6b76ff,#5059e6)',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
              }}>
                <svg width="25" height="39" viewBox="20 4 61 96">
                  <path d="M 20 38 C 20 19 32 4 50 4 C 68 4 81 17 81 34 C 81 48 70 54 63 60 C 58 64.5 57 67 57 72 L 57 78 L 41 78 L 41 70 C 41 63 44 58 51 52 C 59 45 66 42 66 33 C 66 24 59 17 50 17 C 41 17 35 24 35 34 Z" fill="#ffffff" />
                  <circle cx="49" cy="91" r="9" fill="#ffffff" />
                </svg>
              </div>
              <span style={{ color: 'rgba(255,255,255,0.88)', fontSize: '19px', fontWeight: 800, letterSpacing: '-0.01em' }}>Mitä tänään</span>
            </div>
            <span style={{ color: 'rgba(255,255,255,0.22)', fontSize: '15px' }}>·</span>
            <span style={{ color: 'rgba(255,255,255,0.45)', fontSize: '15px', fontWeight: 600, letterSpacing: '0.05em' }}>{brand}</span>
          </div>

          {/* Middle: title */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '16px', flex: 1, justifyContent: 'center' }}>
            {isFree && (
              <div style={{ display: 'flex' }}>
                <span style={{ background: '#10b981', color: 'white', fontSize: '14px', fontWeight: 700, padding: '4px 14px', borderRadius: '999px', letterSpacing: '0.05em' }}>MAKSUTON</span>
              </div>
            )}
            <div style={{ fontSize: title.length > 60 ? '42px' : '52px', fontWeight: 800, color: 'white', lineHeight: 1.1, maxWidth: '900px' }}>
              {title}
            </div>
          </div>

          {/* Bottom: meta */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '32px' }}>
            {date && (
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', color: '#6b76ff', fontSize: '20px', fontWeight: 600 }}>
                <span>📅</span>
                <span>{date}</span>
              </div>
            )}
            {location && (
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', color: 'rgba(255,255,255,0.5)', fontSize: '18px' }}>
                <span>📍</span>
                <span>{location}</span>
              </div>
            )}
            <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: '8px', color: 'rgba(255,255,255,0.3)', fontSize: '16px' }}>
              <span>{SITE_HOST}</span>
            </div>
          </div>
        </div>
      </div>
    ),
    { width: 1200, height: 630 }
  )
}

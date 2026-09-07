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

  // Suunnitelmajaon oma kortti: WhatsApp kutistaa kuvan ~320 px leveäksi,
  // joten tunnusrivin pitää olla ISO ja kortilla oma tunnistettava motiivi
  // (aikajanan numeropallot + kisko — sama kieli kuin tuotteessa).
  // Geneerinen malli alla jää tapahtuma- ja laskeutumissivuille ennalleen.
  if (searchParams.get('malli') === 'suunnitelma') {
    const pallo = (nro: string) => (
      <div style={{
        width: '58px', height: '58px', borderRadius: '50%', background: '#6b76ff',
        border: '3px solid rgba(255,255,255,.3)', color: 'white', fontSize: '26px',
        fontWeight: 800, display: 'flex', alignItems: 'center', justifyContent: 'center',
        boxShadow: '0 4px 18px rgba(0,0,0,.5)',
      }}>{nro}</div>
    )
    const palkki = (leveys: number) => (
      <div style={{ width: `${leveys}px`, height: '18px', borderRadius: '9px', background: 'rgba(255,255,255,.16)', display: 'flex' }} />
    )
    const viiva = (
      <div style={{ width: '0px', height: '52px', borderLeft: '3px dashed rgba(163,171,255,.4)', marginLeft: '28px', display: 'flex' }} />
    )
    return new ImageResponse(
      (
        <div style={{
          width: '1200px', height: '630px', display: 'flex', background: '#080b10',
          fontFamily: 'system-ui, sans-serif', position: 'relative', overflow: 'hidden',
        }}>
          {/* Indigohehku — sama brändikieli kuin jaetun sivun kutsukortissa */}
          <div style={{
            position: 'absolute', inset: 0, display: 'flex',
            background: 'radial-gradient(95% 90% at 15% 5%, rgba(107,118,255,.45) 0%, rgba(107,118,255,.14) 42%, rgba(8,11,16,0) 72%)',
          }} />
          <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: '6px', background: '#6b76ff', display: 'flex' }} />

          <div style={{ display: 'flex', flexDirection: 'column', justifyContent: 'space-between', flex: 1, padding: '54px 0 54px 60px', position: 'relative' }}>
            {/* Tunnusrivi ISOLLA + SUUNNITELMA-pilleri */}
            <div style={{ display: 'flex', alignItems: 'center', gap: '20px' }}>
              <img src={`${req.nextUrl.origin}/icon-192.png`} width={92} height={92} style={{ borderRadius: '21px' }} alt="" />
              <span style={{ color: 'white', fontSize: '46px', fontWeight: 800, letterSpacing: '-0.01em' }}>Mitä tänään?</span>
              <span style={{
                background: 'rgba(107,118,255,.18)', border: '2px solid rgba(107,118,255,.55)',
                color: '#b6bcff', fontSize: '25px', fontWeight: 800, letterSpacing: '0.14em',
                padding: '10px 22px', borderRadius: '999px',
              }}>SUUNNITELMA</span>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '22px', maxWidth: '740px' }}>
              <div style={{
                fontSize: title.length > 40 ? '60px' : '84px', fontWeight: 800, color: 'white',
                lineHeight: 1.06, letterSpacing: '-0.02em',
              }}>{title}</div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                {date ? <div style={{ display: 'flex', color: '#a3abff', fontSize: '35px', fontWeight: 700 }}>{date}</div> : null}
                {location ? <div style={{ display: 'flex', color: 'rgba(255,255,255,.6)', fontSize: '31px', fontWeight: 600 }}>{location}</div> : null}
              </div>
            </div>

            <div style={{ display: 'flex', color: 'rgba(255,255,255,.4)', fontSize: '27px', fontWeight: 600 }}>{SITE_HOST}</div>
          </div>

          {/* Aikajanamotiivi oikealla — abstrakti suunnitelma */}
          <div style={{ display: 'flex', flexDirection: 'column', justifyContent: 'center', width: '360px', padding: '0 70px 0 10px', position: 'relative' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '22px' }}>{pallo('1')}{palkki(180)}</div>
            {viiva}
            <div style={{ display: 'flex', alignItems: 'center', gap: '22px' }}>{pallo('2')}{palkki(130)}</div>
            {viiva}
            <div style={{ display: 'flex', alignItems: 'center', gap: '22px' }}>{pallo('3')}{palkki(160)}</div>
          </div>
        </div>
      ),
      { width: 1200, height: 630 }
    )
  }

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

import { ImageResponse } from 'next/og'
import type { NextRequest } from 'next/server'
import { supabase } from '@/lib/supabase'
import type { GroupResult, GroupArcPlan, GroupQuickPlan } from '@/lib/group'

export const runtime = 'edge'

type Props = { params: Promise<{ code: string }> }

// Tulos voi muuttua kun kaari kudotaan uudelleen → lyhyt cache.
const CACHE = 'public, max-age=300, s-maxage=300'

// Pitkät tekstit mahtumaan julisteeseen.
function cut(s: string, n: number) {
  const t = (s || '').trim()
  return t.length > n ? t.slice(0, n - 1).trimEnd() + '…' : t
}

// Haetaan päätetty sessio — epäonnistuminen → yleinen juliste (ei 404-kuvaa).
async function fetchResult(code: string): Promise<GroupResult | null> {
  if (!supabase) return null
  try {
    const { data } = await supabase
      .from('group_sessions')
      .select('status, result_plan')
      .eq('id', code)
      .maybeSingle()
    if (data?.status !== 'done' || !data.result_plan) return null
    return data.result_plan as GroupResult
  } catch {
    return null
  }
}

// Yhteinen kehys: tumma yö-tausta + violet/sininen hehku, sama perus kuin /api/og.
function Shell({ children }: { children: React.ReactNode }) {
  return (
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
      {/* Hehku: violetti vas. ylhäällä, sininen oik. alhaalla */}
      <div
        style={{
          position: 'absolute',
          inset: 0,
          display: 'flex',
          background:
            'radial-gradient(700px 420px at 12% 0%, rgba(139, 92, 246, 0.28), transparent), radial-gradient(760px 460px at 92% 100%, rgba(0, 114, 198, 0.26), transparent)',
        }}
      />
      {/* Aksenttiviiva yläreunaan */}
      <div
        style={{
          position: 'absolute',
          top: 0,
          left: 0,
          right: 0,
          height: '4px',
          display: 'flex',
          background: 'linear-gradient(90deg, #8b5cf6, #0072C6)',
        }}
      />
      <div
        style={{
          position: 'relative',
          display: 'flex',
          flexDirection: 'column',
          height: '100%',
          padding: '48px 64px',
        }}
      >
        {children}
      </div>
    </div>
  )
}

function Header({ code }: { code: string }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
      <span style={{ color: 'rgba(255,255,255,0.55)', fontSize: '18px', fontWeight: 700, letterSpacing: '0.14em' }}>
        PÄÄTÖS · {code}
      </span>
      <span style={{ fontSize: '20px' }}>🎉</span>
    </div>
  )
}

function Footer() {
  return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: 'auto' }}>
      <span style={{ color: 'rgba(255,255,255,0.45)', fontSize: '17px', fontWeight: 600 }}>
        Mitä tänään · Päättäkää yhdessä
      </span>
      <span style={{ color: 'rgba(255,255,255,0.25)', fontSize: '15px' }}>
        helsinki-tapahtumat.vercel.app
      </span>
    </div>
  )
}

// ARC: kudottu ilta vaiheineen (max 4 riviä, ylimääräiset "+N muuta").
function ArcPoster({ plan, code }: { plan: GroupArcPlan; code: string }) {
  const steps = plan.arc
  const overflow = steps.length > 4
  const shown = overflow ? steps.slice(0, 3) : steps

  let dateLine = ''
  if (plan.date) {
    try {
      dateLine = new Date(`${plan.date}T12:00:00`).toLocaleDateString('fi-FI', {
        weekday: 'long',
        day: 'numeric',
        month: 'long',
      })
    } catch {
      dateLine = plan.date
    }
  }

  return (
    <Shell>
      <Header code={code} />
      <div style={{ display: 'flex', flexDirection: 'column', marginTop: '30px' }}>
        <div style={{ fontSize: '54px', fontWeight: 800, color: 'white', lineHeight: 1.05 }}>
          Teidän iltanne 🎉
        </div>
        <div style={{ display: 'flex', marginTop: '10px', fontSize: '20px', color: 'rgba(255,255,255,0.55)' }}>
          {dateLine ? `📅 ${dateLine}` : cut(plan.intro, 80)}
        </div>
      </div>

      {/* Vaiheet allekkain */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '12px', marginTop: '26px' }}>
        {shown.map((s, i) => (
          <div
            key={i}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '16px',
              padding: '13px 22px',
              borderRadius: '16px',
              // Täysosuma korostuu amberilla
              background: s.superMatch ? 'rgba(245, 158, 11, 0.14)' : 'rgba(255, 255, 255, 0.05)',
              border: s.superMatch ? '2px solid rgba(245, 158, 11, 0.55)' : '1px solid rgba(255, 255, 255, 0.09)',
            }}
          >
            <span style={{ fontSize: '28px' }}>{s.emoji || '📍'}</span>
            <span
              style={{
                flex: 1,
                fontSize: '23px',
                fontWeight: 700,
                color: s.superMatch ? '#fbbf24' : 'white',
              }}
            >
              {cut(s.title, 38)}
            </span>
            {s.superMatch && <span style={{ fontSize: '18px' }}>✨</span>}
            {s.isFree && (
              <span style={{ fontSize: '14px', fontWeight: 700, color: '#10b981', letterSpacing: '0.06em' }}>
                ILMAINEN
              </span>
            )}
            {s.time && (
              <span style={{ fontSize: '20px', fontWeight: 600, color: 'rgba(255,255,255,0.6)' }}>{s.time}</span>
            )}
          </div>
        ))}
        {overflow && (
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              padding: '13px 22px',
              borderRadius: '16px',
              border: '1px dashed rgba(255, 255, 255, 0.18)',
              color: 'rgba(255,255,255,0.5)',
              fontSize: '20px',
              fontWeight: 600,
            }}
          >
            → +{steps.length - 3} muuta
          </div>
        )}
      </div>

      <Footer />
    </Shell>
  )
}

// QUICK: yksi voittaja.
function QuickPoster({ plan, code }: { plan: GroupQuickPlan; code: string }) {
  return (
    <Shell>
      <Header code={code} />
      <div
        style={{
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          flex: 1,
          gap: '14px',
        }}
      >
        <div style={{ display: 'flex', fontSize: '96px' }}>{plan.emoji || '🎉'}</div>
        <div
          style={{
            fontSize: '24px',
            fontWeight: 700,
            letterSpacing: '0.12em',
            color: '#fbbf24',
          }}
        >
          PÄÄTÖS TEHTY! 🎉
        </div>
        <div
          style={{
            fontSize: '52px',
            fontWeight: 800,
            color: 'white',
            lineHeight: 1.1,
            textAlign: 'center',
            maxWidth: '950px',
          }}
        >
          {cut(plan.title, 60)}
        </div>
      </div>
      <Footer />
    </Shell>
  )
}

// YLEINEN: sessio kesken / ei tulosta — kutsu mukaan päättämään.
function GenericPoster({ code }: { code: string }) {
  return (
    <Shell>
      <Header code={code} />
      <div
        style={{
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'center',
          flex: 1,
          gap: '18px',
        }}
      >
        <div style={{ fontSize: '64px', fontWeight: 800, color: 'white', lineHeight: 1.05 }}>
          Päättäkää yhdessä
        </div>
        <div style={{ fontSize: '26px', color: 'rgba(255,255,255,0.6)', maxWidth: '820px', lineHeight: 1.35 }}>
          Swaippaa ja päätetään yhdessä mitä tehdään — AI kutoo äänistä valmiin illan kaaren.
        </div>
        <div style={{ display: 'flex', marginTop: '8px' }}>
          <span
            style={{
              fontSize: '18px',
              fontWeight: 700,
              letterSpacing: '0.1em',
              color: '#fbbf24',
              border: '1px solid rgba(245, 158, 11, 0.5)',
              background: 'rgba(245, 158, 11, 0.12)',
              borderRadius: '999px',
              padding: '8px 20px',
            }}
          >
            KOODI {code}
          </span>
        </div>
      </div>
      <Footer />
    </Shell>
  )
}

export async function GET(_req: NextRequest, { params }: Props) {
  const { code: raw } = await params
  const code = (raw || '').toUpperCase()

  const result = await fetchResult(code)

  let poster: React.ReactElement
  if (result?.kind === 'arc' && result.arc.length > 0) {
    poster = <ArcPoster plan={result} code={code} />
  } else if (result?.kind === 'quick') {
    poster = <QuickPoster plan={result} code={code} />
  } else {
    poster = <GenericPoster code={code} />
  }

  return new ImageResponse(poster, {
    width: 1200,
    height: 630,
    headers: { 'Cache-Control': CACHE },
  })
}

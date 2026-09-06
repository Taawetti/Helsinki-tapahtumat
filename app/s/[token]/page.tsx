// Jaettu suunnitelma — palvelinrenderöity katselusivu. Snapshot Supabasesta:
// nimet, ajat, osoitteet ja kuvat tallennettiin jakohetkellä, joten linkki
// ei mätäne vaikka alkuperäiset tapahtumat vanhenevat. Ei indeksointiin —
// jaettu suunnitelma on puolijulkinen (linkin tietävät näkevät).
import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { supabaseAdmin } from '@/lib/supabase'
import { JaettuKartta, JaettuToiminnot, JaettuAskeleet, type JaettuAskelDTO } from '@/components/JaettuSuunnitelma'

export const dynamic = 'force-dynamic'

const BASE = process.env.NEXT_PUBLIC_SITE_URL || 'https://mitatanaan.fi'

interface Rivi {
  token: string
  otsikko: string | null
  paiva: string | null
  alku_klo: string | null
  askeleet: JaettuAskelDTO[]
}

async function hae(token: string): Promise<Rivi | null> {
  if (!supabaseAdmin || !/^[A-Za-z0-9]{6,16}$/.test(token)) return null
  const { data } = await supabaseAdmin
    .from('jaetut_suunnitelmat')
    .select('token, otsikko, paiva, alku_klo, askeleet')
    .eq('token', token)
    .maybeSingle()
  return (data as Rivi | null) ?? null
}

function paivaTeksti(paiva: string | null): string {
  if (!paiva) return ''
  try {
    return new Date(`${paiva}T12:00:00Z`).toLocaleDateString('fi-FI', {
      weekday: 'long', day: 'numeric', month: 'long', timeZone: 'UTC',
    })
  } catch { return paiva }
}

type Props = { params: Promise<{ token: string }> }

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { token } = await params
  const rivi = await hae(token)
  if (!rivi) return { title: 'Suunnitelmaa ei löydy', robots: { index: false } }
  const otsikko = rivi.otsikko || 'Suunnitelma'
  const kuvaus = `${paivaTeksti(rivi.paiva)} · ${rivi.askeleet.length} pysähdystä — Mitä tänään`
  const og = `${BASE}/api/og?brand=SUUNNITELMA&title=${encodeURIComponent(otsikko)}&date=${encodeURIComponent(paivaTeksti(rivi.paiva))}&location=${encodeURIComponent(`${rivi.askeleet.length} pysähdystä`)}`
  return {
    title: otsikko,
    description: kuvaus,
    robots: { index: false, follow: false },
    openGraph: { title: otsikko, description: kuvaus, images: [{ url: og, width: 1200, height: 630 }] },
    twitter: { card: 'summary_large_image', title: otsikko, description: kuvaus, images: [og] },
  }
}

export default async function JaettuSuunnitelmaSivu({ params }: Props) {
  const { token } = await params
  const rivi = await hae(token)
  if (!rivi) notFound()

  // Kutsukortin tunnusluvut snapshotista.
  const kavelyYht = rivi.askeleet.reduce((sum, a) => sum + (a.kavelyMin ?? 0), 0)
  const ajat = rivi.askeleet.map((a) => a.klo).filter(Boolean) as string[]
  const alkaa = rivi.alku_klo || ajat[0]

  return (
    <main className="min-h-screen text-white" style={{ background: '#0a0a0c' }}>
      <div className="max-w-2xl mx-auto px-4 py-6 sm:py-10 space-y-4">

        {/* Kutsukortti — sama brändikieli kuin jakokuvassa (/api/og):
            indigohehku, tunnusrivi, iso otsikko ja tunnuslukupillerit.
            Tämä sivu on usein ensikosketus koko sovellukseen (linkki tulee
            WhatsApissa), joten yläosan pitää näyttää kutsulta, ei listalta. */}
        <div className="rounded-3xl p-5 sm:p-7"
          style={{
            border: '1px solid rgba(255,255,255,.1)',
            background: 'radial-gradient(120% 90% at 15% 0%, rgba(107,118,255,.22) 0%, rgba(107,118,255,.07) 45%, rgba(255,255,255,.02) 100%)',
          }}>
          <div className="flex items-center gap-2.5">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/icon-192.png" alt="" width={30} height={30} style={{ borderRadius: 8 }} />
            <span className="text-[13.5px] font-black text-white/90">Mitä tänään?</span>
            <span className="text-white/25 text-[12px]">·</span>
            <span className="text-[11px] font-black uppercase tracking-[.16em]" style={{ color: '#a3abff' }}>
              Suunnitelma
            </span>
          </div>
          <h1 className="font-black text-[30px] sm:text-[36px] leading-[1.08] mt-4" style={{ letterSpacing: '-0.02em' }}>
            {rivi.otsikko || 'Suunnitelma'}
          </h1>
          {rivi.paiva && (
            /* Iso alkukirjain koodissa, EI CSS capitalize -luokalla — se
               isontaisi joka sanan ("Sunnuntai 6. Syyskuuta · Klo"). */
            <p className="font-bold text-[15px] mt-2" style={{ color: '#a3abff' }}>
              {(() => { const p = paivaTeksti(rivi.paiva); return p.charAt(0).toUpperCase() + p.slice(1) })()}
              {alkaa ? <span className="text-white/55"> · klo {alkaa}</span> : null}
            </p>
          )}
          <div className="flex gap-2 flex-wrap mt-4">
            <span className="px-3 py-1.5 rounded-full text-[12px] font-bold text-white/75"
              style={{ background: 'rgba(255,255,255,.07)', border: '1px solid rgba(255,255,255,.1)' }}>
              📍 {rivi.askeleet.length} pysähdystä
            </span>
            {kavelyYht > 0 && (
              <span className="px-3 py-1.5 rounded-full text-[12px] font-bold text-white/75"
                style={{ background: 'rgba(255,255,255,.07)', border: '1px solid rgba(255,255,255,.1)' }}>
                🚶 {kavelyYht} min kävelyä
              </span>
            )}
            {ajat.length >= 2 && (
              /* "19:00–23:31" luki kuin ilta PÄÄTTYISI viimeisen pysähdyksen
                 alkuaikaan (omistaja 6.9.2026) — sanotaan suoraan mitä luku on.
                 Aloitusaika näkyy jo yllä päivärivillä. */
              <span className="px-3 py-1.5 rounded-full text-[12px] font-bold text-white/75"
                style={{ background: 'rgba(255,255,255,.07)', border: '1px solid rgba(255,255,255,.1)' }}>
                🕐 Viimeinen pysähdys {ajat[ajat.length - 1]}
              </span>
            )}
          </div>
        </div>

        <JaettuAskeleet askeleet={rivi.askeleet} paiva={rivi.paiva} />

        <JaettuKartta askeleet={rivi.askeleet} />
        <JaettuToiminnot token={rivi.token} otsikko={rivi.otsikko} paiva={rivi.paiva} alkuKlo={rivi.alku_klo} askeleet={rivi.askeleet} />

        <p className="text-center text-white/30 text-[11.5px] font-bold pt-2 pb-4">
          Suunnitelma on koottu <a href="/" className="underline decoration-white/20 hover:text-white/60">Mitä tänään</a> -sovelluksella · mitatanaan.fi
        </p>
      </div>
    </main>
  )
}

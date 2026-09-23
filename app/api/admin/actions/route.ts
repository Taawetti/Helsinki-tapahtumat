// Automaatioiden tila admin-paneeliin — GitHub Actions -ajot työnkulkua
// kohden. Omistaja 23.9.2026: "en halua sähköpostiin noita ilmoituksia enää,
// anna tällaiset virheilmoitukset vaikka admin paneeliin." CI oli kaatunut
// 39 pushia peräkkäin ja viikkoajo neljä maanantaita, ja jokainen lähetti
// sähköpostin — mutta kumpikaan ei näkynyt missään sovelluksen omassa
// näkymässä.
//
// Repo on julkinen, joten GitHubin REST-rajapinta vastaa ilman tunnusta
// (60 pyyntöä/h/IP). Vastaus välimuistitetaan 10 min: adminin avaus ei
// voi kulutta kiintiötä. Kaatuneille ajoille haetaan lisäksi työvaiheet,
// jotta paneeli kertoo MIKÄ askel kaatui (esim. "Lint" tai "Hae
// ravintoloiden syyt") — pelkkä punainen pallo ei auta.

import { NextRequest, NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/admin-auth'

const REPO = 'Taawetti/Helsinki-tapahtumat'
const API = `https://api.github.com/repos/${REPO}/actions`
const HEADERS = { 'User-Agent': 'mitatanaan-admin', Accept: 'application/vnd.github+json' }

interface Run {
  id: number
  name: string
  display_title: string
  head_sha: string
  event: string
  status: string
  conclusion: string | null
  created_at: string
  html_url: string
  jobs_url: string
  path: string
}
interface Job { name: string; conclusion: string | null; steps: { name: string; conclusion: string | null }[] }

export interface AutomaatioTila {
  nimi: string
  tiedosto: string
  tila: 'ok' | 'virhe' | 'kesken' | 'peruttu'
  aika: string
  commit: string
  otsikko: string
  url: string
  /** Kaatunut askel, jos tiedossa. */
  askel: string | null
  /** Montako viimeistä ajoa on kaatunut peräkkäin. */
  perakkain: number
  /** Viimeinen onnistunut ajo, jos 100 viimeisen joukossa. */
  viimeinenOk: string | null
}

async function hae<T>(url: string): Promise<T | null> {
  try {
    const res = await fetch(url, { headers: HEADERS, next: { revalidate: 600 } })
    if (!res.ok) return null
    return (await res.json()) as T
  } catch {
    return null
  }
}

function tila(r: Run): AutomaatioTila['tila'] {
  if (r.status !== 'completed') return 'kesken'
  if (r.conclusion === 'success') return 'ok'
  if (r.conclusion === 'cancelled' || r.conclusion === 'skipped') return 'peruttu'
  return 'virhe'
}

export async function GET(req: NextRequest) {
  const authError = await requireAdmin(req)
  if (authError) return authError

  const data = await hae<{ workflow_runs: Run[] }>(`${API}/runs?per_page=100`)
  if (!data) return NextResponse.json({ error: 'GitHub ei vastannut' }, { status: 502 })

  // Uusin ajo per työnkulku + peräkkäisten kaatumisten määrä.
  const perTyonkulku = new Map<string, Run[]>()
  for (const r of data.workflow_runs) {
    if (r.status !== 'completed') continue
    ;(perTyonkulku.get(r.name) ?? perTyonkulku.set(r.name, []).get(r.name)!).push(r)
  }

  const ulos: AutomaatioTila[] = []
  for (const [nimi, ajot] of perTyonkulku) {
    const uusin = ajot[0]
    let perakkain = 0
    for (const a of ajot) { if (a.conclusion === 'success') break; perakkain++ }
    const ok = ajot.find((a) => a.conclusion === 'success')
    let askel: string | null = null
    if (tila(uusin) === 'virhe') {
      const jobs = await hae<{ jobs: Job[] }>(uusin.jobs_url)
      const kaatunut = jobs?.jobs.flatMap((j) => j.steps.filter((s) => s.conclusion === 'failure').map((s) => `${j.name} › ${s.name}`))[0]
      askel = kaatunut ?? null
    }
    ulos.push({
      nimi, tiedosto: uusin.path.replace('.github/workflows/', ''), tila: tila(uusin),
      aika: uusin.created_at, commit: uusin.head_sha.slice(0, 7), otsikko: uusin.display_title,
      url: uusin.html_url, askel, perakkain, viimeinenOk: ok?.created_at ?? null,
    })
  }
  // Rikkinäiset ensin, sitten aakkoset.
  ulos.sort((a, b) => Number(a.tila === 'ok') - Number(b.tila === 'ok') || a.nimi.localeCompare(b.nimi, 'fi'))
  return NextResponse.json({ ajot: ulos, haettu: new Date().toISOString() },
    { headers: { 'Cache-Control': 'private, max-age=300' } })
}

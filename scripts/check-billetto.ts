// Väliaikainen Billetto-avaintesti: kokeilee Public Event Search -endpointia
// parilla auth-header-muodolla. EI tulosta avaimia — vain status + tulosmäärä.
import { readFileSync } from 'fs'

const env = Object.fromEntries(
  readFileSync('.env.local', 'utf8').split('\n')
    .filter((l) => l.includes('=') && !l.trim().startsWith('#'))
    .map((l) => { const i = l.indexOf('='); return [l.slice(0, i).trim(), l.slice(i + 1).trim().replace(/^["']|["']$/g, '')] }),
)
const pub = env.BILLETTO_API_KEY
const sec = env.BILLETTO_API_SECRET

if (!pub || !sec) {
  console.error('❌ BILLETTO_API_KEY / BILLETTO_API_SECRET puuttuu .env.local:sta')
  process.exit(1)
}
console.log(`Avaimet löytyvät (key ${pub.length} merkkiä, secret ${sec.length} merkkiä)`)

const authVariants: Record<string, string> = {
  'Api-Keypair: pub:sec': `Api-Keypair: ${pub}:${sec}`,
  'Authorization Basic base64': `Authorization: Basic ${Buffer.from(`${pub}:${sec}`).toString('base64')}`,
  'Api-Keypair: keypair=pub:sec': `Api-Keypair: keypair=${pub}:${sec}`,
}

const endpoints = [
  'https://billetto.dk/api/v3/public/events?limit=3',
  'https://billetto.fi/api/v3/public/events?limit=3',
  'https://billetto.dk/api/v3/events/public?limit=3',
]

async function main() {
  let found = false
  for (const url of endpoints) {
    for (const [label, header] of Object.entries(authVariants)) {
      const [name, value] = header.split(/: (.+)/)
      try {
        const res = await fetch(url, {
          headers: { accept: 'application/json', [name]: value },
          signal: AbortSignal.timeout(10000),
        })
        const text = await res.text()
        let countInfo = ''
        try {
          const j = JSON.parse(text)
          const arr = j.data ?? j.events ?? j
          countInfo = Array.isArray(arr) ? ` — ${arr.length} tapahtumaa` : ` — keys: ${Object.keys(j).slice(0, 5).join(',')}`
        } catch { countInfo = ` — (ei JSON: ${text.slice(0, 60)})` }
        console.log(`${res.status} ${url}  [${label}]${countInfo}`)
        if (res.ok) {
          found = true
          console.log(`\n✅ TOIMII: ${url} + ${label}`)
          // Näytä yhden tapahtuman nimi todisteeksi (ei salaista dataa)
          try {
            const j = JSON.parse(text)
            const arr = j.data ?? j.events ?? []
            if (Array.isArray(arr) && arr[0]) console.log(`   Esimerkki: "${arr[0].title ?? arr[0].name ?? JSON.stringify(arr[0]).slice(0, 80)}"`)
          } catch { /* ignore */ }
          return
        }
      } catch (e) {
        console.log(`ERR  ${url}  [${label}] — ${String(e).slice(0, 60)}`)
      }
    }
  }
  if (!found) console.log('\n❌ Mikään yhdistelmä ei toiminut — avain ei ehkä ole aktivoitunut vielä (support), tai FI-endpoint puuttuu.')
}

main().catch((e) => { console.error(e); process.exit(1) })

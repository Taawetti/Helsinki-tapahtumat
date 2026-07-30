// Vain luku: mitä weekly-discover on tuonut festivals-tauluun.
import { createClient } from '@supabase/supabase-js'
import { readFileSync } from 'fs'

const env = Object.fromEntries(
  readFileSync('.env.local', 'utf8').split('\n')
    .filter((l) => l.includes('=') && !l.trim().startsWith('#'))
    .map((l) => { const i = l.indexOf('='); return [l.slice(0, i).trim(), l.slice(i + 1).trim().replace(/^["']|["']$/g, '')] }),
)
const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY)

async function main() {
  // Muoto: mitä sarakkeita taulussa on
  const { data: sample } = await sb.from('festivals').select('*').limit(1)
  console.log('Sarakkeet:', sample?.[0] ? Object.keys(sample[0]).join(', ') : '(tyhjä)')

  const { count: total } = await sb.from('festivals').select('*', { count: 'exact', head: true })
  const { count: active } = await sb.from('festivals').select('*', { count: 'exact', head: true }).eq('active', true)
  console.log(`\nYhteensä ${total} riviä, joista active=${active}`)

  // Viimeisimmät 20 created_at:n mukaan
  const { data: recent } = await sb.from('festivals')
    .select('id, name, start_date, end_date, active, created_at')
    .order('created_at', { ascending: false })
    .limit(20)

  console.log('\n20 viimeisintä riviä (created_at ↓):')
  for (const f of recent ?? []) {
    const created = (f.created_at ?? '').slice(0, 10)
    const dates = `${f.start_date ?? '?'} → ${f.end_date ?? '?'}`
    console.log(`  ${created}  ${(f.name ?? '?').slice(0, 45).padEnd(45)}  ${dates}  active=${f.active}`)
  }

  // Viimeisen 30 vrk tuonnit
  const since = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString()
  const { count: recentCount } = await sb.from('festivals')
    .select('*', { count: 'exact', head: true }).gte('created_at', since)
  console.log(`\nViimeisen 30 vrk aikana tuotu: ${recentCount} riviä`)
}

main().catch((e) => { console.error(e); process.exit(1) })

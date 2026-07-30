// Väliaikainen tarkistusskripti: onko ryhmäpäätös v2 -skeema kunnossa Supabasessa.
// Ajo: npx tsx scripts/check-group-v2.ts
import { createClient } from '@supabase/supabase-js'
import { readFileSync } from 'fs'

const env = Object.fromEntries(
  readFileSync('.env.local', 'utf8')
    .split('\n')
    .filter((l) => l.includes('=') && !l.trim().startsWith('#'))
    .map((l) => {
      const i = l.indexOf('=')
      return [l.slice(0, i).trim(), l.slice(i + 1).trim().replace(/^["']|["']$/g, '')]
    }),
)

const url = env.NEXT_PUBLIC_SUPABASE_URL
const key = env.SUPABASE_SERVICE_ROLE_KEY
if (!url || !key) {
  console.error('❌ NEXT_PUBLIC_SUPABASE_URL tai SUPABASE_SERVICE_ROLE_KEY puuttuu .env.local:sta')
  process.exit(1)
}

const sb = createClient(url, key)
let fail = 0
const ok = (name: string, cond: boolean, extra = '') => {
  console.log(`${cond ? '✅' : '❌'} ${name}${extra ? ` — ${extra}` : ''}`)
  if (!cond) fail++
}

async function main() {
  // 1. v2-sarakkeet group_sessions-taulussa (mode, round)
  const { error: e1 } = await sb.from('group_sessions').select('id, mode, round, status').limit(1)
  ok('group_sessions: mode + round -sarakkeet löytyvät', !e1, e1 ? e1.message : 'kysely onnistui')

  // 2. group_push-taulu
  const { error: e2 } = await sb.from('group_push').select('id').limit(1)
  ok('group_push-taulu olemassa', !e2, e2 ? e2.message : 'kysely onnistui')

  // 3. Perustaulut ennallaan
  const { error: e3 } = await sb.from('group_votes').select('id').limit(1)
  ok('group_votes-taulu kunnossa', !e3, e3 ? e3.message : 'kysely onnistui')

  // 4. Anon-luku group_sessions:stä toimii (RLS-policy — klientin pollaus riippuu tästä)
  const anon = createClient(url, env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? key)
  const { error: e4 } = await anon.from('group_sessions').select('id').limit(1)
  ok('anon-luku group_sessions (RLS)', !e4, e4 ? e4.message : 'kysely onnistui')

  // 5. Rivelaskennat
  const { count: sessCount } = await sb.from('group_sessions').select('*', { count: 'exact', head: true })
  const { count: voteCount } = await sb.from('group_votes').select('*', { count: 'exact', head: true })
  console.log(`ℹ️  group_sessions: ${sessCount} riviä, group_votes: ${voteCount} riviä`)
}

main().then(
  () => process.exit(fail ? 1 : 0),
  (err) => { console.error('❌ odottamaton virhe:', err); process.exit(1) },
)

// Sessiokohtainen push-ilmoitus ryhmäpäätöskoneen osallistujille
// ("kaari valmis" / "voittaja selvillä"). Erillään päivittäisestä
// digest-pushista — tilaukset elävät group_push-taulussa ja siivoutuvat
// session mukana (ON DELETE CASCADE).
import { supabaseAdmin } from '@/lib/supabase'
import { sendToSubscribers } from '@/lib/webpush'

export async function sendGroupPush(
  sessionId: string,
  payload: { title: string; body: string; url: string },
  opts?: { voterId?: string },
): Promise<void> {
  if (!supabaseAdmin) return
  try {
    let query = supabaseAdmin
      .from('group_push')
      .select('endpoint, p256dh, auth, voter_id')
      .eq('session_id', sessionId)
    // Kohdennus yhdelle osallistujalle (esim. viimeinen swaippaamaton)
    if (opts?.voterId) query = query.eq('voter_id', opts.voterId)
    const { data: subs } = await query
    if (!subs?.length) return

    const { staleEndpoints } = await sendToSubscribers(subs, () =>
      JSON.stringify({ title: payload.title, body: payload.body, url: payload.url, tag: `group-${sessionId}` }),
    )
    if (staleEndpoints.length) {
      await supabaseAdmin.from('group_push').delete().in('endpoint', staleEndpoints)
    }
  } catch (err) {
    console.error('[group-push] lähetys epäonnistui:', err)
  }
}

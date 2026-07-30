// Sessiokohtainen push-ilmoitus ryhmäpäätöskoneen osallistujille
// ("kaari valmis" / "voittaja selvillä"). Erillään päivittäisestä
// digest-pushista — tilaukset elävät group_push-taulussa ja siivoutuvat
// session mukana (ON DELETE CASCADE).
import { supabaseAdmin } from '@/lib/supabase'
import { sendToSubscribers } from '@/lib/webpush'

export async function sendGroupPush(sessionId: string, payload: { title: string; body: string; url: string }): Promise<void> {
  if (!supabaseAdmin) return
  try {
    const { data: subs } = await supabaseAdmin
      .from('group_push')
      .select('endpoint, p256dh, auth')
      .eq('session_id', sessionId)
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

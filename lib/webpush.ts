import webpush from 'web-push'

webpush.setVapidDetails(
  'mailto:timo.heinamaki@datagorilla.fi',
  process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY!,
  process.env.VAPID_PRIVATE_KEY!
)

export default webpush

export interface PushSubRow {
  endpoint: string
  p256dh: string
  auth: string
  preferred_categories?: string | null
}

// Shared send loop for push digests (morning /api/push, evening cron).
// Collects expired subscriptions (410 Gone / 404) for the caller to delete
// so both digests keep identical delivery and cleanup behavior.
export async function sendToSubscribers(
  subs: PushSubRow[],
  payloadFor: (sub: PushSubRow) => string,
): Promise<{ sent: number; staleEndpoints: string[] }> {
  const staleEndpoints: string[] = []
  let sent = 0

  await Promise.allSettled(
    subs.map(async (sub) => {
      try {
        await webpush.sendNotification(
          { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } },
          payloadFor(sub)
        )
        sent++
      } catch (err: unknown) {
        const code = (err && typeof err === 'object' && 'statusCode' in err)
          ? (err as { statusCode: number }).statusCode
          : 0
        if (code === 410 || code === 404) staleEndpoints.push(sub.endpoint)
      }
    })
  )

  return { sent, staleEndpoints }
}

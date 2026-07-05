import webpush from 'web-push'

webpush.setVapidDetails(
  'mailto:timo.heinamaki@datagorilla.fi',
  process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY!,
  process.env.VAPID_PRIVATE_KEY!
)

export default webpush

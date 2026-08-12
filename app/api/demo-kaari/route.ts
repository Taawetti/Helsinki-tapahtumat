import { NextRequest, NextResponse } from 'next/server'
import { unstable_cache } from 'next/cache'
import { buildDemoArc } from '@/lib/demo-arc'

// Demo-kaari etusivun "katso miltä näyttää" -kortille. Raskas kooste
// (pakanrakennus kokoaa monta lähdettä) → Data Cache 30 min (reitti on
// dynaaminen originin takia, joten välimuisti on laskennan tasolla).
// Ei koskaan 5xx eteenpäin kortille: null on validi "ei esimerkkiä juuri nyt".
const getDemoPlan = unstable_cache(
  async (origin: string) => buildDemoArc(origin),
  ['demo-kaari-plan'],
  { revalidate: 1800 },
)

export async function GET(req: NextRequest) {
  try {
    const plan = await getDemoPlan(req.nextUrl.origin)
    return NextResponse.json({ plan })
  } catch (err) {
    console.error('demo-kaari:', err)
    return NextResponse.json({ plan: null })
  }
}

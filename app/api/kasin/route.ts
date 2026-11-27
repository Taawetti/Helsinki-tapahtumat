// Käsin lisätyt tapahtumat ulkoisena lähteenä (lib/kasin-lisatyt).
// Sama sopimus kuin muilla lähdereiteillä: ?start=YYYY-MM-DD&end=YYYY-MM-DD,
// molemmat päivät mukaan, vastaus { events }.

import { NextRequest, NextResponse } from 'next/server'
import { kasinValilla } from '@/lib/kasin-lisatyt'

export async function GET(req: NextRequest) {
  const { searchParams } = req.nextUrl
  const start = searchParams.get('start') || new Date().toISOString().slice(0, 10)
  const end = searchParams.get('end') || start
  // Puskuri vuorokausi kumpaankin suuntaan: aikaleimat ovat Helsingin aikaa,
  // ja koostaja rajaa sivun päivät itse (lib/lahdevarasto, /api/events).
  const alku = new Date(start).getTime() - 86400000
  const loppu = new Date(end).getTime() + 2 * 86400000
  if (Number.isNaN(alku) || Number.isNaN(loppu)) return NextResponse.json({ events: [] })
  return NextResponse.json({ events: kasinValilla(alku, loppu) })
}

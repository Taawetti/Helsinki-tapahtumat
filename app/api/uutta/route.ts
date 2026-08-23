// Uutta Helsingissä -data sovelluksen sisäiselle Uutta-välilehdelle.
// Sama kokoaminen kuin SEO-sivulla /uutta-helsingissa (lib/uutta-data.ts).

import { NextResponse } from 'next/server'
import { assembleNewInHelsinki } from '@/lib/uutta-data'

export const revalidate = 3600

export async function GET() {
  const uutta = await assembleNewInHelsinki()
  return NextResponse.json({ uutta })
}

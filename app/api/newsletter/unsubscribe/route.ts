import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

const BASE = process.env.NEXT_PUBLIC_SITE_URL || 'https://mitatanaan.fi'

export async function GET(req: NextRequest) {
  const token = req.nextUrl.searchParams.get('token')

  if (!token) {
    return new NextResponse(errorPage('Virheellinen linkki', 'Peruutuslinkki puuttuu tai on virheellinen.'), {
      headers: { 'Content-Type': 'text/html; charset=utf-8' },
      status: 400,
    })
  }

  const { error } = await supabase
    .from('newsletter_subscribers')
    .update({ active: false })
    .eq('unsubscribe_token', token)
    .eq('active', true)

  if (error) {
    return new NextResponse(errorPage('Virhe', 'Peruuttaminen epäonnistui. Yritä uudelleen tai ota yhteyttä.'), {
      headers: { 'Content-Type': 'text/html; charset=utf-8' },
      status: 500,
    })
  }

  return new NextResponse(successPage(), {
    headers: { 'Content-Type': 'text/html; charset=utf-8' },
  })
}

function successPage(): string {
  return `<!DOCTYPE html><html lang="fi"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Tilaus peruttu</title>
  <style>*{box-sizing:border-box;margin:0;padding:0}body{background:#0a0b0f;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;min-height:100dvh;display:flex;align-items:center;justify-content:center;padding:24px}.card{max-width:400px;width:100%;text-align:center}.emoji{font-size:48px;margin-bottom:20px}.h1{font-size:24px;font-weight:800;color:#fff;margin-bottom:12px}.p{font-size:14px;color:rgba(255,255,255,0.45);line-height:1.6;margin-bottom:28px}.btn{display:inline-block;background:rgba(107,118,255,0.15);border:1px solid rgba(107,118,255,0.25);color:#6b76ff;font-size:14px;font-weight:700;text-decoration:none;padding:12px 24px;border-radius:12px}</style>
  </head><body><div class="card"><div class="emoji">👋</div><h1 class="h1">Tilaus peruttu</h1><p class="p">Olet perunut Mitä tänään -uutiskirjeen tilauksen. Toivottavasti nähdään vielä sovelluksessa!</p><a href="${BASE}" class="btn">Takaisin sovellukseen</a></div></body></html>`
}

function errorPage(title: string, msg: string): string {
  return `<!DOCTYPE html><html lang="fi"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${title}</title>
  <style>*{box-sizing:border-box;margin:0;padding:0}body{background:#0a0b0f;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;min-height:100dvh;display:flex;align-items:center;justify-content:center;padding:24px}.card{max-width:400px;width:100%;text-align:center}.h1{font-size:22px;font-weight:800;color:#fff;margin-bottom:10px}.p{font-size:14px;color:rgba(255,255,255,0.4);line-height:1.6;margin-bottom:24px}.btn{display:inline-block;background:rgba(255,255,255,0.06);color:rgba(255,255,255,0.5);font-size:13px;font-weight:600;text-decoration:none;padding:10px 20px;border-radius:10px}</style>
  </head><body><div class="card"><h1 class="h1">⚠️ ${title}</h1><p class="p">${msg}</p><a href="${BASE}" class="btn">Takaisin etusivulle</a></div></body></html>`
}

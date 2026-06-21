import { NextRequest, NextResponse } from 'next/server'
import { Event } from '@/lib/types'

const VF_KEY = process.env.VISITFINLAND_API_KEY
const VF_ENDPOINT = process.env.VISITFINLAND_ENDPOINT || 'https://api.businessfinland.fi/traveldatahub'

interface VFProductInfo {
  name: string
  language: string
  description: string
  webshopUrl?: string
  url?: string
}

interface VFImage {
  largeUrl: string
  thumbnailUrl: string
  coverPhoto: boolean
}

interface VFAddress {
  city: string
  streetName: string
}

interface VFAvailability {
  startDate: string
  startTime: string | null
  endDate: string | null
  endTime: string | null
}

interface VFPricing {
  fromPrice: number | null
  pricingType: string
}

interface VFProduct {
  id: string
  type: string
  urlPrimary: string | null
  productInformations: VFProductInfo[]
  productImages: VFImage[]
  postalAddresses: VFAddress[]
  productAvailabilities: VFAvailability[]
  productPricings: VFPricing[]
  company: { businessName: string; websiteUrl: string } | null
}

function normalize(p: VFProduct, start: string): Event | null {
  const avail = p.productAvailabilities.find(a => a.startDate >= start) ?? p.productAvailabilities[0]
  if (!avail?.startDate) return null

  const info = p.productInformations.find(i => i.language === 'fi')
    ?? p.productInformations.find(i => i.language === 'en')
    ?? p.productInformations[0]
  if (!info?.name) return null

  const address = p.postalAddresses[0]
  const image = p.productImages.find(i => i.coverPhoto)?.largeUrl
    ?? p.productImages[0]?.largeUrl
    ?? null

  const pricing = p.productPricings[0]
  const isFree = !pricing || pricing.pricingType === 'free' || pricing.fromPrice === 0
  const price = pricing?.fromPrice ? `${pricing.fromPrice} €` : null

  const startTime = avail.startTime
    ? `${avail.startDate}T${avail.startTime}`
    : `${avail.startDate}T10:00:00`
  const endTime = avail.endDate
    ? avail.endTime
      ? `${avail.endDate}T${avail.endTime}`
      : `${avail.endDate}T22:00:00`
    : null

  const infoUrl = p.urlPrimary
    ?? p.productInformations.find(i => i.url)?.url
    ?? p.company?.websiteUrl
    ?? ''

  return {
    id: `vf-${p.id}`,
    title: info.name,
    shortDescription: info.description?.slice(0, 160) ?? '',
    description: info.description ?? '',
    startTime,
    endTime,
    location: address
      ? { name: address.streetName, streetAddress: address.streetName, city: address.city }
      : { name: 'Helsinki', streetAddress: '', city: 'Helsinki' },
    image,
    isFree,
    price,
    ticketUrl: infoUrl,
    infoUrl,
    categories: ['Matkailu', 'Tapahtuma'],
    source: 'linked-events',
  }
}

const QUERY = `
  query Events($start: date!, $end: date!, $city: String!) {
    product(
      where: {
        type: { _eq: event }
        postalAddresses: { city: { _ilike: $city } }
        productAvailabilities: {
          startDate: { _gte: $start }
          endDate: { _lte: $end }
        }
      }
      limit: 100
    ) {
      id
      type
      urlPrimary
      productInformations { name language description webshopUrl url }
      productImages { largeUrl thumbnailUrl coverPhoto }
      postalAddresses { city streetName }
      productAvailabilities { startDate startTime endDate endTime }
      productPricings { fromPrice pricingType }
      company { businessName websiteUrl }
    }
  }
`

export async function GET(req: NextRequest) {
  if (!VF_KEY) return NextResponse.json({ events: [] })

  const { searchParams } = req.nextUrl
  const start = searchParams.get('start') || new Date().toISOString().slice(0, 10)
  const end = searchParams.get('end') || start

  try {
    const res = await fetch(VF_ENDPOINT, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'ocp-apim-subscription-key': VF_KEY,
      },
      body: JSON.stringify({ query: QUERY, variables: { start, end, city: 'Helsinki' } }),
      next: { revalidate: 3600, tags: ['events'] },
      signal: AbortSignal.timeout(10000),
    })

    if (!res.ok) return NextResponse.json({ events: [] })

    const { data } = await res.json()
    const products: VFProduct[] = data?.product ?? []

    const events: Event[] = products
      .map(p => normalize(p, start))
      .filter((e): e is Event => e !== null)

    return NextResponse.json({ events })
  } catch {
    return NextResponse.json({ events: [] })
  }
}

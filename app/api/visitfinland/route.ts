import { NextResponse } from 'next/server'

// Visit Finland DataHub — GraphQL API for Finnish tourism events
// Registration: https://datahub.visitfinland.com (Business Finland -tili)
// After registration set env vars: VISITFINLAND_API_KEY, VISITFINLAND_ENDPOINT
const VF_KEY = process.env.VISITFINLAND_API_KEY
const VF_ENDPOINT = process.env.VISITFINLAND_ENDPOINT

export async function GET() {
  if (!VF_KEY || !VF_ENDPOINT) {
    // Scaffold: returns empty until credentials are configured
    // 1. Register at https://datahub.visitfinland.com
    // 2. Set VISITFINLAND_API_KEY and VISITFINLAND_ENDPOINT in .env.local / Vercel
    return NextResponse.json({ events: [] })
  }

  // TODO: implement GraphQL query after registration
  // The DataHub exposes tourism events/activities via GraphQL
  // Product types: ACTIVITY, ATTRACTION, RESTAURANT, ACCOMMODATION
  // Filter by region: UUSIMAA or municipality code
  return NextResponse.json({ events: [] })
}

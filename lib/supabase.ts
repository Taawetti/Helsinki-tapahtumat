import { createClient } from '@supabase/supabase-js'

const url = process.env.NEXT_PUBLIC_SUPABASE_URL
const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
const service = process.env.SUPABASE_SERVICE_ROLE_KEY

export function isSupabaseConfigured() {
  return Boolean(url && anon)
}

// Public client for reads — used in API routes
export const supabase = url && anon
  ? createClient(url, anon)
  : null

// Service role client for admin writes — never exposed to browser
export const supabaseAdmin = url && service
  ? createClient(url, service, { auth: { persistSession: false } })
  : null

export interface DbVenueRating {
  venue_key: string
  google_rating: number | null
  review_count: number | null
  price_level: string | null
  description: string | null
  last_updated: string
}

export interface DbRecurringEvent {
  id: string
  title: string
  short_description: string
  venue: string
  address: string
  lat: number | null
  lon: number | null
  weekday: number
  start_hour: number
  start_minute: number
  duration_minutes: number
  is_free: boolean
  price: string | null
  ticket_url: string | null
  info_url: string | null
  categories: string[]
  active_months: number[] | null
  active: boolean
  created_at?: string
}

export interface DbFestival {
  id: string
  name: string
  short_name: string
  start_date: string
  end_date: string
  time: string
  venue_name: string
  address: string
  city: string
  ticket_url: string
  info_url: string
  image: string | null
  categories: string[]
  is_free: boolean
  description: string
  active: boolean
  created_at?: string
}

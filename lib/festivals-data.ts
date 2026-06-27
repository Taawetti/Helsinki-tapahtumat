import { DbFestival } from '@/lib/supabase'

export interface FestivalDef {
  id: string
  name: string
  shortName: string
  startDate: string
  endDate: string
  time: string
  venueName: string
  address: string
  city: string
  ticketUrl: string
  infoUrl: string
  image: string | null
  categories: string[]
  isFree: boolean
  description: string
}

export function fromDb(row: DbFestival): FestivalDef {
  return {
    id: row.id,
    name: row.name,
    shortName: row.short_name,
    startDate: row.start_date,
    endDate: row.end_date,
    time: row.time,
    venueName: row.venue_name,
    address: row.address,
    city: row.city,
    ticketUrl: row.ticket_url,
    infoUrl: row.info_url,
    image: row.image,
    categories: row.categories,
    isFree: row.is_free,
    description: row.description,
  }
}

export const FESTIVALS_STATIC: FestivalDef[] = []

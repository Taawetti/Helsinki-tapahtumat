declare module 'opening_hours' {
  interface NominatimData {
    lat?: number
    lon?: number
    address?: { country_code?: string; state?: string }
  }
  type Interval = [Date, Date, boolean | undefined, string | undefined]
  export default class OpeningHours {
    constructor(value: string, nominatim?: NominatimData | null, optional?: unknown)
    getState(date?: Date): boolean
    getOpenIntervals(from: Date, to: Date): Interval[]
    getNextChange(date?: Date, maxDate?: Date): Date | undefined
  }
}

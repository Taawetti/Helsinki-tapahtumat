// Open-meteo-sää ryhmäpäätöksen pakalle — ilmainen, ei API-avainta.
// Sateen uhatessa ulkokohteet painuvat alas ja sisäkohteet korostuvat.

export interface WeatherSignal {
  rainExpected: boolean
  precipMm: number
}

// Päiväkohtainen sade-ennuste Helsingin keskukselle. Forecast-ikkuna ~14 vrk;
// sen ulkopuolella (tai virheessä) null → ei painotusta kumpaankaan suuntaan.
export async function fetchRainExpected(dateISO: string): Promise<WeatherSignal | null> {
  try {
    const today = new Date().toISOString().slice(0, 10)
    const maxDate = new Date(Date.now() + 13 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10)
    if (dateISO < today || dateISO > maxDate) return null

    const params = new URLSearchParams({
      latitude: '60.1699',
      longitude: '24.9384',
      daily: 'precipitation_sum,weathercode',
      timezone: 'Europe/Helsinki',
      start_date: dateISO,
      end_date: dateISO,
    })
    const res = await fetch(`https://api.open-meteo.com/v1/forecast?${params}`, {
      next: { revalidate: 3 * 3600 },
      signal: AbortSignal.timeout(5000),
    })
    if (!res.ok) return null
    const data = await res.json()
    const precip = Number(data?.daily?.precipitation_sum?.[0] ?? 0)
    const code = Number(data?.daily?.weathercode?.[0] ?? 0)
    // WMO-koodit: 51-67 tihku/sade, 71-77 lumi, 80-82 kuurot, 95-99 ukkonen
    const rainCode = (code >= 51 && code <= 67) || (code >= 71 && code <= 77) || (code >= 80 && code <= 82) || code >= 95
    return { rainExpected: precip >= 2 || rainCode, precipMm: precip }
  } catch {
    return null
  }
}

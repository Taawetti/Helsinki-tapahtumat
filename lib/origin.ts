// Oma julkinen osoite palvelinpuolen sisäisille hauille (kooste, nostot).
// Tuotannossa NEXT_PUBLIC_SITE_URL tai apex; kehityspalvelimella oma portti,
// jotta paikallinen esikatselu näyttää paikalliset muutokset (korjaukset,
// nostot) eikä tuotannon dataa — mitattu 27.10.2026: kärkikortti näytti
// localhostissa tuotannon vanhan otsikon, koska haku kävi mitatanaan.fi:ssä.
export function omaOrigin(): string {
  if (process.env.NEXT_PUBLIC_SITE_URL) return process.env.NEXT_PUBLIC_SITE_URL
  if (process.env.NODE_ENV === 'development') return `http://localhost:${process.env.PORT ?? 3000}`
  return 'https://mitatanaan.fi'
}

// Kuratoidut aukiolokorjaukset venueille — kun OSM/Google-tuntidata on
// vanhentunutta tai väärää (liiketoiminnan todelliset ajat vaihtuvat,
// rekisterit laahaavat). Avain: normalisoitu venue-nimi (lowercase, trim).
// Arvo: OSM opening_hours -merkkijono, joka YLIAJAA lähteen aukioloajan.
//
// Tapa 8/2026: Kyrö Sauna Bar — OSM väitti Fr 16–24 (vanha Kasarmitori-
// sijainti), mutta paikan oman sivun mukaan Ma–La 12–21, Su 12–19.
// Lähde: visit.kyrodistillery.com/pages/kyro-sauna-bar

const OVERRIDES: Record<string, string> = {
  'kyrö sauna bar': 'Mo-Sa 12:00-21:00; Su 12:00-19:00',
}

/** Palauttaa kuratoidun aukiolokorjauksen venue-nimelle, tai undefined. */
export function venueHoursOverride(name: string): string | undefined {
  return OVERRIDES[name.toLowerCase().trim()]
}

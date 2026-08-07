// Skraperireittien yhtenäinen itseraportointi (meta-kenttä JSON-vastauksessa).
//
// Tarkoitus: hiljainen rikkoutuminen ei enää jää piiloon. Jokainen venue-
// skraperireitti kertoo vastauksessaan:
//   live         = parsittujen kohteiden määrä ENNEN start/end-ikkunafiltteriä.
//                  Jos live == 0 pitkään, parseri tai sivu on todennäköisesti
//                  rikki (kanaria seuraa putkea ja hälyttää).
//   scrapeError  = kova virhe: fetch epäonnistui, HTTP !ok, poikkeus,
//                  tai tunnetusti epäilyttävä "parse yielded 0".
//                  null kun kaikki kunnossa.
//
// Kanaria (/api/cron/source-health) lukee nämä päivittäin ja päivittää
// source_health_state-taulun putket. Reitit eivät itse päätä hälyttämisestä.

export interface ScrapeMeta {
  live: number
  scrapeError: string | null
}

export function scrapeMeta(live: number, scrapeError: string | null = null): { meta: ScrapeMeta } {
  return { meta: { live, scrapeError } }
}

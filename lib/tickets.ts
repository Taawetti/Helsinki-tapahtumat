// "Osta liput" -lupaus ansaitaan, ei peritä kentästä (omistaja 25.8.2026:
// "lukee osta liput jos sieltä oikeasti saa ostettua liput"). Aiemmin nappi
// sanoi "Osta liput" aina kun ticketUrl oli asetettu — ja esim. Stadissa-
// lähde laittoi oman LISTAUSSIVUNSA siihen kenttään (mitattu 25.8.: 188
// stadissa.fi-linkkiä viikon datassa lippulupauksella).
//
// Whitelist on EVIDENSSIPOHJAINEN: viikon livedatan ticketUrl-domainit
// luokiteltu (lippu.fi 130, kide.app 79, ra.co 16, ticketmaster.fi 7 …).
// Mukana vain domainit joilla OSTO tapahtuu sillä sivustolla — venue-sivut
// jotka vain LINKITTÄVÄT kauppaan (tavastiaklubi.fi, barloose.com,
// kansallisteatteri.fi) jäävät pois: yksi klikki kauppaan ≠ kauppa, ja
// väärä lupaus syö luottamusta. Listaa saa laajentaa tapauskohtaisesti kun
// venue myy todistetusti omalla domainillaan.

const TICKET_SHOP_DOMAINS = [
  // Lippukaupat ja -alustat
  'lippu.fi',
  'lippupiste.fi',
  'tiketti.fi',
  'ticketmaster.fi',
  'ticketmaster.com',
  'fienta.com',
  'billetto.fi',
  'billetto.com',
  'kide.app',
  'ra.co',
  'eventim.fi',
  'eventim-light.com',
  'biletti.fi',
  'holvi.com',
  'johku.com',        // mm. suomenlinna.johku.com (lauttaristeilyt/opastukset)
  'nostage.fi',       // kauppa.nostage.fi
  'eventu.al',
  'getyourguide.com',
  // Paikat jotka myyvät omalla domainillaan (omistaja nimesi Allaksen)
  'allaspool.fi',
  'oopperabaletti.fi',
  'finnkino.fi',
  'shop.alvaraalto.fi',
]

/** Onko osoite oikea lippukauppa — sivu jolla oston voi viedä loppuun? */
export function isTicketShopUrl(url: string | null | undefined): boolean {
  if (!url) return false
  let host: string
  try {
    host = new URL(url).hostname.toLowerCase().replace(/^www\./, '')
  } catch {
    return false
  }
  return TICKET_SHOP_DOMAINS.some((d) => host === d || host.endsWith(`.${d}`))
}

/** Saako tapahtumalle näyttää "Osta liput"? Ilmainen tapahtuma ei koskaan
 *  (Kino Kivinokka -tapaus: maksuton rantaleffa lupasi lippukauppaa),
 *  muuten vain kun ticketUrl on oikea kauppa. */
export function canBuyTickets(e: { ticketUrl?: string | null; isFree?: boolean }): boolean {
  if (e.isFree) return false
  return isTicketShopUrl(e.ticketUrl)
}

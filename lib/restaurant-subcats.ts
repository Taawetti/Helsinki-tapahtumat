// Ravintolalistan alaluokka-avaimen käännös datan avaimeksi.
//
// Ravintolat-välilehden SUB_CATS käyttää suomenkielisiä UI-tunnisteita
// (olut, viini, urheilu), mutta Supabasen venue_ratings.sub_categories ja
// kartan suodattimet käyttävät englanninkielisiä (craft_beer, wine, sports).
// Kartan osiokonteksti tarvitsee saman käännöksen kun valinta siirtyy
// listalta kartalle, joten taulu on omassa tiedostossaan: HomeClient ei saa
// importata RestaurantsView'ta staattisesti, koska se ladataan dynaamisesti
// (ssr: false) ja staattinen import vetäisi koko komponentin päänippuun.
export const SUB_TO_DB: Record<string, string> = {
  olut: 'craft_beer',
  viini: 'wine',
  urheilu: 'sports',
}

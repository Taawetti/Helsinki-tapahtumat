// Kartan taustatiilet — YKSI määrittely, jota sekä MapView että PlannerMap
// käyttävät. Aiemmin sama osoite oli kirjoitettu molempiin, ja kun CARTO
// muuttui, molemmat rikkoutuivat erikseen.
//
// MIKSI TÄMÄ VAIHDETTIIN 26.8.2026. CARTO alkoi vaatia API-avainta ja polttaa
// nyt tekstin "API KEY REQUIRED · carto.com/basemaps/apikey" JOKAISEEN tiileen
// jonka se palvelee ilman avainta. Vesileima näkyi tuotannossa koko kartan yli.
// Todennettu hakemalla tiili suoraan: leima on kuvassa riippumatta siitä mistä
// pyyntö tulee (kokeiltu ilman Refereriä, localhostilta ja mitatanaan.fi:ltä —
// tavulleen sama 27 405 tavun kuva).
//
// MIKSI EI OPENSTREETMAPIN OMAT TIILET. Ne palauttivat testissä HTTP 418
// "Access blocked — App is not following the tile usage policy of
// OpenStreetMap's volunteer-run servers". OSM:n vapaaehtoispalvelimet eivät ole
// tarkoitettu sovelluksen taustakartaksi, joten sitä ei edes yritetä.
//
// MIKSI ESRI TOPO. Vertailin Helsingin keskustan tiiltä neljästä lähteestä
// samassa zoomissa: Esri Light Gray oli lähes tyhjä (ei kadunnimiä), Esri
// Street oli oranssinruskea ja riiteli sovelluksen indigon kanssa, Esri Topo
// oli lähimpänä nykyistä — vaalea pohja, siniset vedet, selkeät kadunnimet.

export interface Basemap {
  url: string
  attribution: string
  maxZoom: number
  subdomains?: string
}

/** CARTO-avain ympäristöstä. Jos se on asetettu, palataan alkuperäiseen
 *  Voyager-tyyliin ilman vesileimaa — ulkoasu on silloin täsmälleen se mikä
 *  ennen oli. Ilman avainta käytetään Esriä, jotta kartta ei ole rikki. */
export function getBasemap(): Basemap {
  const key = process.env.NEXT_PUBLIC_CARTO_API_KEY

  if (key) {
    return {
      url: `https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png?api_key=${key}`,
      attribution:
        '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> &copy; <a href="https://carto.com/attributions">CARTO</a>',
      subdomains: 'abcd',
      maxZoom: 20,
    }
  }

  // HUOM osoitteen järjestys: Esri käyttää muotoa {z}/{y}/{x}, ei {z}/{x}/{y}.
  // Väärin päin kartta näyttäisi väärää paikkaa maailmasta. Ei {s}- eikä
  // {r}-tukea, joten subdomains jätetään pois.
  return {
    url: 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Topo_Map/MapServer/tile/{z}/{y}/{x}',
    attribution:
      'Tiles &copy; <a href="https://www.esri.com/">Esri</a> &mdash; Esri, HERE, Garmin, Intermap, GEBCO, USGS, NGA, &copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
    maxZoom: 19,
  }
}

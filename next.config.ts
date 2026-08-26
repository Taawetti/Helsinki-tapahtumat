import type { NextConfig } from 'next'
import path from 'path'

const nextConfig: NextConfig = {

  // Lähelle osuvat kirjoitusasut oikeaan osoitteeseen. Mitattu 26.8.2026:
  // omistaja osui kahdesti peräkkäin muotoihin /sauna ja /tapahtumat/tanaa ja
  // sai Next.js:n oletusvirhesivun, jossa ei ollut yhtään linkkiä takaisin.
  // Sivuston reiteissä on ääkkösettömiä muotoja (tanaan, viikonloppu,
  // ilmaiset-museot), ja osoitteita kirjoitetaan käsin QR-korteista.
  //
  // TIETOINEN RAJAUS: tämä on käsin koottu lista yleisimmistä kirjoitusasuista,
  // EI arvausalgoritmi. Väärä arvaus veisi kävijän väärälle sivulle, mikä on
  // huonompi kuin virhesivu. permanent: false (307), koska nämä ovat
  // kirjoitusvirheitä eivätkä pysyviä osoitteenmuutoksia — Google ei saa
  // indeksoida niitä sivun oikeana osoitteena.
  async redirects() {
    const map: Record<string, string> = {
      // yksikkö/monikko
      '/sauna': '/saunat',
      '/terassi': '/terassit',
      '/yokerho': '/yokerhot',
      '/pubivisa': '/pubivisat',
      '/kirpputori': '/kirpputorit',
      '/jami': '/jamit',
      '/ilmainen-museo': '/ilmaiset-museot',
      '/ilmaiset-museo': '/ilmaiset-museot',
      // puuttuva kirjain tai ääkkösmuoto
      '/tapahtumat/tanaa': '/tapahtumat/tanaan',
      // Ääkkönen ei kulje osoitteessa sellaisenaan vaan prosenttikoodattuna.
      // Mitattu 26.8.2026: raakana kirjoitettu 'ä' EI osu koskaan, koska
      // palvelin näkee polun muodossa %C3%A4. Molemmat muodot mukana.
      '/tapahtumat/tänään': '/tapahtumat/tanaan',
      '/tapahtumat/t%C3%A4n%C3%A4%C3%A4n': '/tapahtumat/tanaan',
      '/tapahtumat/viikonlopu': '/tapahtumat/viikonloppu',
      '/tapahtumat/ilmainen': '/tapahtumat/ilmaiset',
      '/uutta': '/uutta-helsingissa',
      '/uutta-helsingissä': '/uutta-helsingissa',
      '/uutta-helsingiss%C3%A4': '/uutta-helsingissa',
      '/tapahtumat/sornäinen': '/tapahtumat/sornainen',
      '/tapahtumat/sorn%C3%A4inen': '/tapahtumat/sornainen',
      '/tapahtumat/sörnäinen': '/tapahtumat/sornainen',
      '/tapahtumat/s%C3%B6rn%C3%A4inen': '/tapahtumat/sornainen',
      // luontevat arvaukset joita ei ole olemassa
      '/tapahtumat': '/tapahtumat/tanaan',
      '/keikat': '/tapahtumat/keikka',
      '/tanaan': '/tapahtumat/tanaan',
      '/ilmaiset': '/tapahtumat/ilmaiset',
      '/viikonloppu': '/tapahtumat/viikonloppu',
      // englanninkieliset vastineet
      '/en/sauna': '/en/saunas',
      '/en/nightclub': '/en/nightclubs',
      '/en/terrace': '/en/terraces',
      '/en/events': '/en/events-today',
      '/en/free': '/en/free-events',
      '/en/pub-quiz': '/en/pub-quizzes',
      '/en/flea-market': '/en/flea-markets',
      '/en/free-museum': '/en/free-museums',
      '/en/jam-session': '/en/jam-sessions',
    }
    return Object.entries(map).map(([source, destination]) => ({ source, destination, permanent: false }))
  },
  images: {
    remotePatterns: [
      { protocol: 'https', hostname: '**.hel.fi' },
      { protocol: 'https', hostname: '**.hel.ninja' },
      { protocol: 'https', hostname: 'res.cloudinary.com' },
      { protocol: 'https', hostname: '**.linkedevents.fi' },
    ],
  },
  // Force both ESM import('leaflet') and CJS require('leaflet') inside
  // leaflet.markercluster to share the same module instance. Without this,
  // the two import paths see different objects and markerClusterGroup is never
  // visible on the L namespace we import.
  turbopack: {
    resolveAlias: {
      'leaflet': 'leaflet/dist/leaflet-src.js',
    },
  },
  webpack: (config, { isServer }) => {
    if (!isServer) {
      config.resolve.alias = {
        ...(config.resolve.alias as Record<string, string>),
        'leaflet': path.resolve(process.cwd(), 'node_modules/leaflet/dist/leaflet-src.js'),
      }
    }
    return config
  },
}

export default nextConfig

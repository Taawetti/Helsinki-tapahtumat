// Robottitunnistus kävijämittausta varten.
//
// MIKSI TÄMÄ ON OLEMASSA: sivulatauskirjaus (28.8.2026) muutti robottien
// merkityksen. Sitä ennen rivi syntyi vain klikkauksesta, eivätkä robotit
// klikkaa mitään — nyt jokainen JavaScriptiä suorittava indeksointirobotti
// kirjautuisi kävijäksi. Googlebot ja Bingbot suorittavat JS:n, joten ilman
// tätä "eri kävijät" olisi osittain hakukoneiden luku ja maajakauma näyttäisi
// robottien konesalien maat.
//
// TARKISTUS TEHDÄÄN PALVELIMELLA (app/api/track). Robotti ei aja selaimen
// poissulkulogiikkaa puolestamme, joten selainpuolen tarkistus ei auttaisi.
//
// TÄMÄ EI OLE TÄYDELLINEN eikä yritä olla. Kuvio kattaa yleisimmät robotit;
// tuntematon pääsee läpi. Vaihtoehto — estää kaikki joita ei tunnisteta
// selaimeksi — pudottaisi oikeita kävijöitä, mikä on pahempi virhe.

const OSAT = [
  // Hakukoneet ja indeksoijat. 'bot\b' kattaa Googlebotin, bingbotin,
  // AhrefsBotin ym.; 'bot/' kattaa muodon "Googlebot/2.1".
  'bot\\b', 'bot/', 'crawler', 'spider', 'slurp',
  // Selainautomaatio. Myös omat Playwright-varmennukseni osuvat tähän, mikä
  // on tarkoitus: niiden ei kuulu näkyä omistajan luvuissa.
  'headlesschrome', 'puppeteer', 'playwright', 'phantomjs',
  // Mittaus- ja valvontatyökalut
  'lighthouse', 'gtmetrix', 'pingdom', 'uptime', 'monitor',
  // Komentorivi ja HTTP-kirjastot
  'curl/', 'wget', 'python-requests', 'axios/', 'node-fetch',
  'go-http-client', 'java/', 'okhttp',
  // Linkin esikatselu. Slackbot, Twitterbot, Discordbot, LinkedInBot ja
  // Applebot osuvat jo 'bot\\b':hen, joten tässä vain ne jotka eivät osu.
  // PALJAS 'preview' OLI TÄSSÄ HETKEN JA POISTETTIIN: se on liian väljä sana
  // pudottamaan oikean kävijän hiljaa. Bingin esikatselu nimetään erikseen.
  'facebookexternalhit', 'whatsapp', 'telegram', 'bingpreview',
]

const ROBOTTI = new RegExp(OSAT.join('|'), 'i')

/** Onko user-agent robotti? Tyhjä otsake tulkitaan robotiksi: jokainen oikea
 *  selain lähettää user-agentin, joten sen puuttuminen on itsessään signaali. */
export function onRobotti(userAgent: string | null | undefined): boolean {
  if (!userAgent) return true
  return ROBOTTI.test(userAgent)
}

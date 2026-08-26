// Google Ads -tagi (gtag.js) Consent Mode v2:n kanssa.
//
// JÄRJESTYS ON KOKO JUTUN YDIN. Suostumuksen oletusarvot on asetettava ENNEN
// kuin gtag.js latautuu. Jos järjestys menee toisin päin, skripti ehtii asettaa
// mainosevästeet ennen kuin käyttäjä on valinnut mitään — juuri se mitä
// ennakkosuostumus tarkoittaa, ja juuri se mitä ei saa tapahtua.
// beforeInteractive ajetaan ennen afterInteractivea, joten Next.js takaa
// järjestyksen; siksi nämä ovat kaksi erillistä Script-elementtiä eivätkä yksi.
//
// Mainostajan antama asennusohje ("liitä jokaisen sivun <head>-elementtiin") on
// kirjoitettu käsin tehdylle HTML-sivustolle. Tämä on Next.js-sovellus, jossa
// juurilayout renderöityy jokaiselle sivulle — tagi on siis tässä KERRAN, ja
// silti kaikilla sivuilla. Kahdesti lisättynä konversiot laskettaisiin tuplana.

import Script from 'next/script'
import { ADS_ID } from '@/lib/consent'

export default function GoogleTag() {
  return (
    <>
      <Script id="consent-default" strategy="beforeInteractive">
        {`
          window.dataLayer = window.dataLayer || [];
          function gtag(){dataLayer.push(arguments);}
          window.gtag = gtag;
          // Kaikki evätty kunnes käyttäjä valitsee. ad_user_data ja
          // ad_personalization tulivat pakollisiksi 3/2024 — pelkkä ad_storage
          // ei enää riitä ETA-liikenteelle.
          gtag('consent', 'default', {
            ad_storage: 'denied',
            ad_user_data: 'denied',
            ad_personalization: 'denied',
            analytics_storage: 'denied',
            // Odota bannerin vastausta ennen kuin osumia lähetetään, jotta
            // heti hyväksyvän käyttäjän käynti ei katoa mittauksesta.
            wait_for_update: 500
          });

          // AIEMMIN TALLENNETTU VALINTA TOISTETAAN HETI.
          // Ilman tätä hyväksyntä koski vain sitä yhtä sivulatausta jolla
          // nappia painettiin: seuraavalla latauksella oletus asetti kaiken
          // uudelleen denied-tilaan, eikä mikään kertonut gtagille että
          // käyttäjä oli jo hyväksynyt. Kampanja olisi mitannut murto-osan
          // todellisista käynneistä, ja tietosuojasivu olisi silti näyttänyt
          // "Mainosevästeet hyväksytty". Tämä ajetaan ennen gtag.js:ää, joten
          // valinta on voimassa ensimmäisestä osumasta alkaen.
          try {
            var mtC = localStorage.getItem('mt-consent-v1');
            if (mtC === 'granted' || mtC === 'denied') {
              gtag('consent', 'update', {
                ad_storage: mtC,
                ad_user_data: mtC,
                ad_personalization: mtC,
                analytics_storage: mtC
              });
            }
          } catch (e) { /* privaattitila: jää denied-tilaan, mikä on oikea oletus */ }
        `}
      </Script>

      <Script id="gtag-js" strategy="afterInteractive"
        src={`https://www.googletagmanager.com/gtag/js?id=${ADS_ID}`} />

      <Script id="gtag-config" strategy="afterInteractive">
        {`
          gtag('js', new Date());
          gtag('config', '${ADS_ID}');
        `}
      </Script>
    </>
  )
}

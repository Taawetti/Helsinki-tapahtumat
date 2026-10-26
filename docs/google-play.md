# Google Play -julkaisu (Android)

Sovellus julkaistaan Google Playhin **Trusted Web Activity** -kääreenä: Android-
sovellus, joka avaa mitatanaan.fi:n koko ruudussa ilman selaimen palkkeja.
Sovelluksen sisältö on aina tuotantosivusto — kauppapakettia ei tarvitse
päivittää, kun sivusto muuttuu. Uusi paketti tarvitaan vain, jos nimi, kuvake,
pikavalinnat tai paketin asetukset muuttuvat.

## Mitä repossa on

- `public/manifest.webmanifest` — nimi, kuvakkeet (512 px + maskable),
  pikavalinnat (shortcuts) ja kauppakuvat (screenshots). Paketti lukee nämä.
- `public/.well-known/assetlinks.json` — Digital Asset Links: yhdistää Android-
  paketin `fi.mitatanaan.app` tähän verkkotunnukseen. Ilman tätä sovellus näyttää
  selaimen osoitepalkin. Listassa on oltava SEKÄ lataustunnuksen (upload key)
  ETTÄ Play App Signingin sormenjälki (Play Console → Setup → App signing →
  App signing key certificate → SHA-256).
- `public/screenshots/` — 9:16-kuvakaappaukset (1188×2112) Play-listaukseen.

## Mitä repon ulkopuolella on (ÄLÄ COMMITOI)

`~/Documents/MitaTanaan-Play/`:
- `signing.keystore` + `avaimen-salasanat.txt` — lataustunnus. Varmuuskopioi.
- `mita-tanaan-release.aab` — Play Consoleen ladattava paketti (versionCode 1).
- `mita-tanaan-release.apk` — testiasennus puhelimeen (ei kauppaan).

## Paketin rakentaminen uudelleen

PWABuilderin pakkauspalvelu (sama kuin pwabuilder.com → Android), kutsuttu
suoraan: `POST https://pwabuilder-cloudapk.azurewebsites.net/generateAppPackage`
JSON-rungolla (packageId `fi.mitatanaan.app`, host, name, launcherName, iconUrl,
maskableIconUrl, webManifestUrl, shortcuts, signingMode `mine` + keystore
base64-muodossa ja salasanat). Nosta `appVersionCode` joka julkaisussa (1, 2, 3…)
— Play hylkää paketin, jonka versionCode ei kasva.

## Julkaisun vaiheet Play Consolessa

1. Kehittäjätili (play.google.com/console): organisaatio Broven Oy (vaatii
   D-U-N-S-numeron) tai henkilötili (vaatii suljetun testin 12 testaajalla
   14 päivää ennen tuotantoa). Kertamaksu 25 USD.
2. Luo sovellus → Setup → App signing: kopioi "App signing key certificate"
   -kohdan SHA-256 ja lisää se `assetlinks.json`-listaan toiseksi riviksi.
3. Testing → Internal testing → lataa `.aab`, lisää testaajien sähköpostit.
4. Store listing: nimi, lyhyt kuvaus (80 merkkiä), pitkä kuvaus, kuvake 512×512,
   feature graphic 1024×500, vähintään 2 puhelinkuvakaappausta.
5. App content: tietosuojaseloste https://mitatanaan.fi/tietosuoja, Data safety,
   sisältöluokitus, kohdeyleisö, mainokset (Google Ads -tagi on sivustolla).
6. Production → release → tarkastus (1–7 päivää).

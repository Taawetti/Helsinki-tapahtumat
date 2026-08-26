# Kuvake & logo — ohje Claude Codelle

> **VERSIO 3 — korvaa kaiken aiemman. Lue tämä laatikko ensin.**
>
> Aiemmat versiot menivät pieleen, koska ohje sisälsi **käsin piirretyn SVG-polun**, joka ei
> ollut sama merkki kuin hyväksytty design. Kuvake on tuotannossa väärän näköisenä — tämä korjaa sen.
>
> Merkki on **Inter 900 -fontin kysymysmerkki**, ei piirros. PNG-tiedostot on tuotettu
> juuri siitä fontista. **Älä piirrä SVG-polkua, älä generoi kuvakkeita uudelleen, älä korvaa
> merkkiä ikonikirjaston kysymysmerkillä.** Käytä annettuja tiedostoja sellaisenaan, ja
> yläpalkissa oikeaa Inter-tekstimerkkiä.
>
> **Poista ensin vanhat kuvaketiedostot** `public/`-kansiosta sekä mahdolliset
> `app/icon.*`, `app/favicon.ico`, `app/apple-icon.*` — muuten Next.js tai selain
> näyttää vanhaa.

Valittu suunta: **2B "Täysi kysymys"** — valkoinen Inter 900 -kysymysmerkki indigo-gradienttilaatalla,
merkki täyttää laatan reunojen yli. Sama indigo kuin sovelluksessa jo on (`#6b76ff → #5059e6`).

---

## ANNA TÄMÄ CLAUDE CODELLE

Kopioi alla oleva laatikko sellaisenaan. Tee tämä **omana tehtävänään**, ei muiden muutosten seassa.

```
Lue design_handoff_mita_tanaan/logo/KUVAKE-OHJE.md kokonaan ja toteuta se.
Aloita ohjeen alussa olevasta VERSIO 3 -laatikosta — kuvake on nyt tuotannossa
väärän näköisenä ja tämä korjaa sen.

Kriittiset säännöt:
- Kuvakemerkki on Inter 900 -fontin kysymysmerkki. Kansiossa logo/ on siitä
  tuotetut valmiit PNG-tiedostot. Käytä niitä SELLAISENAAN.
- ÄLÄ piirrä SVG-polkua kysymysmerkistä. ÄLÄ generoi kuvakkeita uudelleen.
  ÄLÄ käytä ikonikirjaston (lucide, heroicons tms.) kysymysmerkkiä.
  Aiempi yritys epäonnistui juuri tästä syystä.
- Poista vanhat kuvaketiedostot ennen uusien kopiointia (public/ sekä
  app/icon.*, app/favicon.ico, app/apple-icon.*).

Tehtävät:
1. Kopioi tiedostot public/-kansioon ohjeen "Mihin tiedostot menevät" -taulukon mukaan.
2. Lisää favicon- ja kuvakeviittaukset (app/layout.tsx metadata + manifest).
3. Korvaa yläpalkin nykyinen "M"-pallo ohjeen kohdan 3 Logo-komponentilla.
4. Lisää og-image metadataan.

Kun olet valmis: listaa muutetut tiedostot ja kerro erikseen, mistä kuvakkeen
merkki tuli (pitää olla logo/-kansion PNG, ei piirretty eikä ikonikirjastosta).
```

---

## Mitä tiedostot ovat

| Tiedosto | Mihin |
|---|---|
| `icon-1024.png` | **Master.** App Store / Google Play. Kaikki muut koot on skaalattu tästä. |
| `icon-512.png`, `icon-192.png` | PWA-kuvakkeet (manifest). |
| `apple-touch-icon-180.png` | iPhonen kotinäyttö. |
| `icon-152.png`, `icon-120.png` | iPad ja vanhemmat iPhonet. |
| `icon-32.png`, `icon-16.png` | Favicon selaimen välilehdellä. |
| `maskable-512.png` | PWA:n "maskable"-kuvake — merkki mahtuu turva-alueelle kun selain rajaa ympyräksi. |
| `adaptive-foreground-432.png` | Androidin mukautuva kuvake, **etuala** (läpinäkyvä). |
| `adaptive-background-432.png` | Androidin mukautuva kuvake, **tausta** (gradientti). |
| `mark-white-512.png` | Pelkkä valkoinen merkki läpinäkyvällä taustalla — latausruutuun. |
| `og-image-1200x630.png` | Kuva, joka näkyy kun linkki jaetaan WhatsAppissa, Facebookissa, Slackissa. |

**Miksi eri kokoluokkia:** tavallisissa kuvakkeissa merkki täyttää laatan reunojen yli (kuten
designissa), mutta `maskable`- ja `adaptive`-versioissa se on vain 54–56 %, koska Android leikkaa
reunoilta jopa kolmanneksen pois. Nämä eivät ole vahinkoja — älä yhtenäistä niitä.

**SVG-tiedostoja ei ole tarkoituksella.** Merkki on fonttimerkki: yläpalkissa se ladotaan tekstinä
(kohta 3), kuvakkeissa käytetään valmiita PNG:itä. Älä tee SVG-versiota piirtämällä — se on juuri
se virhe joka teki edellisestä kuvakkeesta väärän näköisen.

---

## Mihin tiedostot menevät

Kopioi `design_handoff_mita_tanaan/logo/` → projektin `public/`:

```
public/favicon-32.png            ← icon-32.png
public/favicon-16.png            ← icon-16.png
public/apple-touch-icon.png      ← apple-touch-icon-180.png
public/icon-192.png              ← icon-192.png
public/icon-512.png              ← icon-512.png
public/icon-maskable-512.png     ← maskable-512.png
public/icon-1024.png             ← icon-1024.png   (vain kauppaa varten, ei sivustolle)
public/og-image.png              ← og-image-1200x630.png
public/splash-mark.png           ← mark-white-512.png
public/android/foreground.png    ← adaptive-foreground-432.png
public/android/background.png    ← adaptive-background-432.png
```

---

## 1. Metadata (`app/layout.tsx`)

```ts
export const metadata: Metadata = {
  title: 'Mitä tänään? — Helsingin tapahtumat',
  description: 'Keikat, tapahtumat, ravintolat ja tekemistä Helsingissä tänään.',
  manifest: '/manifest.webmanifest',
  icons: {
    icon: [
      { url: '/favicon-32.png', sizes: '32x32', type: 'image/png' },
      { url: '/favicon-16.png', sizes: '16x16', type: 'image/png' },
      { url: '/icon-192.png', sizes: '192x192', type: 'image/png' },
      { url: '/icon-512.png', sizes: '512x512', type: 'image/png' },
    ],
    apple: [{ url: '/apple-touch-icon.png', sizes: '180x180' }],
  },
  openGraph: {
    title: 'Mitä tänään? — Helsingin tapahtumat',
    description: 'Keikat, tapahtumat, ravintolat ja tekemistä Helsingissä tänään.',
    images: [{ url: '/og-image.png', width: 1200, height: 630 }],
    locale: 'fi_FI',
    type: 'website',
  },
  twitter: { card: 'summary_large_image', images: ['/og-image.png'] },
};

export const viewport: Viewport = { themeColor: '#0a0a0c' };
```

**Huom:** jos projektissa on `app/icon.png`, `app/favicon.ico` tai `app/apple-icon.png`, Next.js
käyttää niitä automaattisesti ja ne **ohittavat** yllä olevat. Poista vanhat, muuten vanha kuvake jää.

## 2. Manifest (`public/manifest.webmanifest`)

```json
{
  "name": "Mitä tänään? — Helsingin tapahtumat",
  "short_name": "Mitä tänään?",
  "description": "Keikat, tapahtumat, ravintolat ja tekemistä Helsingissä tänään.",
  "start_url": "/",
  "display": "standalone",
  "background_color": "#0a0a0c",
  "theme_color": "#0a0a0c",
  "lang": "fi",
  "icons": [
    { "src": "/icon-192.png", "sizes": "192x192", "type": "image/png" },
    { "src": "/icon-512.png", "sizes": "512x512", "type": "image/png" },
    { "src": "/icon-maskable-512.png", "sizes": "512x512", "type": "image/png", "purpose": "maskable" }
  ]
}
```

## 3. Yläpalkin merkki

Nykyinen yläpalkki käyttää pyöreää "M"-laattaa (indigo-gradientti + kirjain M). Etsi se ja korvaa.

Merkki ladotaan **tekstinä Inter 900:lla** — sovellus lataa Interin jo. Ei SVG:tä, ei kuvaa.

Luo `components/Logo.tsx`:

```tsx
export function Logo() {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 1 }}>
      <span style={{ fontWeight: 800, fontSize: 16, color: '#fff', letterSpacing: '-.025em' }}>
        Mitä tänään
      </span>
      <span style={{
        fontWeight: 900, fontSize: 21, lineHeight: 1, color: '#6b76ff',
        letterSpacing: '-.05em', transform: 'translateY(1px)',
      }}>
        ?
      </span>
    </div>
  );
}
```

Käytä `<Logo />` siinä missä nykyinen "M"-pallo + teksti on.

**Merkki tulee nimen perään**, ei eteen — se on nimen kysymysmerkki, ei erillinen ikoni.
Varmista että `font-family` periytyy Interiksi; jos ei, lisää `fontFamily: 'Inter, sans-serif'`.

## 4. Latausruutu (jos appi asennetaan kotinäytölle)

Tausta `#0a0a0c`, keskellä `splash-mark.png` noin 96 px leveänä. Ei tekstiä, ei spinneriä.

---

## Säännöt

**Tee näin**
- Käytä valmiita PNG-tiedostoja sellaisenaan.
- Kuvakkeen laatta on **neliö ilman pyöristyksiä** — iOS ja Android pyöristävät sen itse. Jos
  pyöristät valmiiksi, tulee kaksinkertaiset kulmat.
- Aksenttiväri pysyy indigona (`#6b76ff`). Kuvake ei tuo uusia värejä.
- Nimi kirjoitetaan **"Mitä tänään?"** kysymysmerkillä otsikoissa, kaupan tiedoissa ja metadatassa.

**Älä tee näin**
- **Älä piirrä kysymysmerkkiä SVG-polkuna.** Merkki on Inter 900 -fonttimerkki. Tämä on se virhe
  joka meni tuotantoon aiemmin.
- Älä käytä ikonikirjaston kysymysmerkkiä (lucide `HelpCircle` tms.).
- Älä lisää kuvakkeeseen varjoa, hehkua, kehystä tai tekstiä.
- Älä käytä `maskable`- tai `adaptive`-versioita tavallisena kuvakkeena.
- Älä läpinäkyvöi iOS-kuvaketta. Applen kuvakkeessa ei saa olla läpinäkyvyyttä.
- Älä laita merkkiä nimen eteen.

---

## Tarkistus lopuksi

- [ ] Kuvake näyttää samalta kuin `icon-1024.png` — paksu valkoinen kysymysmerkki, joka ulottuu
      laatan ylä- ja alareunan yli. Vertaa silmällä.
- [ ] Välilehden favicon vaihtunut (tyhjennä selaimen välimuisti — favicon jää usein muistiin).
- [ ] Puhelimen kotinäytölle lisätty sivu näyttää uuden kuvakkeen.
- [ ] Linkin jakaminen WhatsAppiin näyttää og-kuvan.
- [ ] Yläpalkissa ei ole enää "M"-palloa, ja "?" on nimen perässä.
- [ ] Koodissa ei ole yhtään käsin kirjoitettua `<path d="...">` -kysymysmerkkiä.

# Kuvake & logo — ohje Claude Codelle

Valittu suunta: **2B "Täysi kysymys"** — valkoinen kysymysmerkki indigo-gradienttilaatalla.
Sama indigo kuin sovelluksessa jo on (`#6b76ff → #5059e6`), joten värejä ei tarvitse muuttaa muualta.

---

## ANNA TÄMÄ CLAUDE CODELLE

Kopioi alla oleva laatikko sellaisenaan. Tee tämä **omana tehtävänään**, ei muiden muutosten seassa.

```
Lue design_handoff_mita_tanaan/logo/KUVAKE-OHJE.md ja toteuta se.

Lyhyesti: kansiossa design_handoff_mita_tanaan/logo/ on valmiit logo- ja
kuvaketiedostot (valkoinen kysymysmerkki indigo-gradienttilaatalla). Tehtäväsi:

1. Kopioi tiedostot public/-kansioon ohjeen "Mihin tiedostot menevät" -taulukon
   mukaan. Käytä valmiita tiedostoja sellaisenaan — ÄLÄ piirrä tai generoi
   kuvakkeita uudelleen, äläkä muuta niiden värejä, muotoa tai marginaaleja.
2. Lisää favicon- ja kuvakeviittaukset (app/layout.tsx metadata + manifest).
3. Korvaa yläpalkin nykyinen "M"-pallo uudella merkillä ohjeen
   "Yläpalkin merkki" -osion koodilla.
4. Lisää some-jakokuva (og-image) metadataan.

Noudata ohjeen "Säännöt"-osiota tarkasti. Kun olet valmis, kerro mitkä tiedostot
lisäsit ja mitä muutit, ja mainitse jos jokin puuttui.
```

---

## Mitä tiedostot ovat

| Tiedosto | Mihin |
|---|---|
| `app-icon.svg` | Kuvakkeen alkuperäinen vektori (laatta + merkki). Lähde, josta kaikki PNG:t on tehty. |
| `mark-white.svg` | Pelkkä merkki valkoisena, läpinäkyvä tausta. Käyttöliittymään tummalla pohjalla. |
| `mark-indigo.svg` | Pelkkä merkki indigona. Vaalealle pohjalle. |
| `mark-black.svg` | Pelkkä merkki mustana. Yksivärisiin tulosteisiin. |
| `mark-currentcolor.svg` | Merkki, joka perii tekstin värin (`currentColor`). Kätevin React-komponenttiin. |
| `icon-1024.png` | App Store / Google Play -kuvake. |
| `icon-512.png`, `icon-192.png` | PWA-kuvakkeet (manifest). |
| `apple-touch-icon-180.png` | iPhonen kotinäyttö. |
| `icon-152.png`, `icon-120.png` | iPad ja vanhemmat iPhonet. |
| `icon-32.png`, `icon-16.png` | Favicon selaimen välilehdellä. |
| `maskable-512.png` | PWA:n "maskable"-kuvake — merkki mahtuu turva-alueelle, kun selain rajaa ympyräksi. |
| `adaptive-foreground-432.png` | Androidin mukautuva kuvake, **etuala** (läpinäkyvä). |
| `adaptive-background-432.png` | Androidin mukautuva kuvake, **tausta** (gradientti). |
| `mark-white-512.png` | Latausruutuun (splash) tummalla pohjalla. |
| `og-image-1200x630.png` | Kuva, joka näkyy kun linkki jaetaan WhatsAppissa, Facebookissa, Slackissa. |

**Miksi kolme eri kokoluokkaa samasta merkistä:** isoissa kuvakkeissa merkki on 88 % laatan korkeudesta, faviconeissa 94 % (pieni kuvake tarvitsee enemmän mustetta pysyäkseen luettavana), ja maskable/adaptive-versioissa vain 55–58 %, koska Android leikkaa reunoilta jopa kolmanneksen pois. Nämä eivät ole vahinkoja — älä yhtenäistä niitä.

---

## Mihin tiedostot menevät

Kopioi `design_handoff_mita_tanaan/logo/` → projektin `public/`:

```
public/favicon-32.png              ← icon-32.png
public/favicon-16.png              ← icon-16.png
public/apple-touch-icon.png        ← apple-touch-icon-180.png
public/icon-192.png                ← icon-192.png
public/icon-512.png                ← icon-512.png
public/icon-maskable-512.png       ← maskable-512.png
public/icon-1024.png               ← icon-1024.png        (vain kauppaa varten, ei sivustolle)
public/og-image.png                ← og-image-1200x630.png
public/logo-mark.svg               ← mark-white.svg
public/splash-mark.png             ← mark-white-512.png
public/android/foreground.png      ← adaptive-foreground-432.png
public/android/background.png      ← adaptive-background-432.png
```

---

## 1. Metadata (`app/layout.tsx`)

Lisää tai yhdistä olemassa olevaan `metadata`-objektiin:

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

**Huom:** jos projektissa on jo `app/icon.png`, `app/favicon.ico` tai `app/apple-icon.png`, Next.js käyttää niitä automaattisesti ja ne **ohittavat** yllä olevat. Poista tai korvaa vanhat, muuten vanha kuvake jää voimaan.

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

Luo `components/Logo.tsx`:

```tsx
export function LogoMark({ size = 26, className = '' }: { size?: number; className?: string }) {
  return (
    <svg viewBox="20 4 61 96" width={size * 0.635} height={size} className={className}
         role="img" aria-label="Mitä tänään">
      <path d="M 20 38 C 20 19 32 4 50 4 C 68 4 81 17 81 34 C 81 48 70 54 63 60 C 58 64.5 57 67 57 72 L 57 78 L 41 78 L 41 70 C 41 63 44 58 51 52 C 59 45 66 42 66 33 C 66 24 59 17 50 17 C 41 17 35 24 35 34 Z"
            fill="currentColor" />
      <circle cx="49" cy="91" r="9" fill="currentColor" />
    </svg>
  );
}

export function Logo() {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
      <span style={{ fontWeight: 800, fontSize: 16, color: '#fff', letterSpacing: '-.025em' }}>
        Mitä tänään
      </span>
      <LogoMark size={21} className="text-[#6b76ff]" />
    </div>
  );
}
```

Käytä `<Logo />` siinä missä nykyinen "M"-pallo + teksti on. **Merkki tulee nimen perään**, ei eteen — se on nimen kysymysmerkki, ei erillinen ikoni.

## 4. Latausruutu (jos appi asennetaan kotinäytölle)

Tausta `#0a0a0c`, keskellä `splash-mark.png` noin 96 px leveänä. Ei tekstiä, ei spinneriä.

---

## Säännöt

**Tee näin**
- Käytä valmiita tiedostoja sellaisenaan.
- Kuvakkeen laatta on **neliö ilman pyöristyksiä** — iOS ja Android pyöristävät sen itse. Jos pyöristät sen valmiiksi, lopputulos saa kaksinkertaiset kulmat.
- Sovelluksen aksenttiväri pysyy indigona (`#6b76ff`). Kuvake ei tuo uusia värejä.
- Nimi kirjoitetaan **"Mitä tänään?"** kysymysmerkillä otsikoissa, kaupan tiedoissa ja metadatassa.

**Älä tee näin**
- Älä generoi kuvakkeita uudelleen tekstistä tai fontista. Merkki on vektoripolku juuri siksi, ettei se riipu fontin saatavuudesta — Inter-fontilla ladottu "?" näyttää eri laitteilla eri paksuiselta.
- Älä lisää kuvakkeeseen varjoa, hehkua, kehystä tai tekstiä.
- Älä käytä `maskable`- tai `adaptive`-versioita tavallisena kuvakkeena — niissä merkki on tarkoituksella pienempi ja näyttäisi hukkuvan.
- Älä läpinäkyvöi iOS-kuvaketta. Applen kuvakkeessa ei saa olla läpinäkyvyyttä.
- Älä laita merkkiä nimen eteen.

---

## Jos tarvitset .ico-tiedoston

Nykyselaimet lukevat PNG-faviconit, joten `.ico` ei ole pakollinen. Jos jokin vanha järjestelmä sitä vaatii, tee se `icon-32.png`:stä ja `icon-16.png`:stä — älä piirrä uutta.

## Tarkistus lopuksi

- [ ] Välilehden favicon vaihtunut (tyhjennä selaimen välimuisti — favicon jää usein muistiin).
- [ ] Puhelimen kotinäytölle lisätty sivu näyttää uuden kuvakkeen.
- [ ] Linkin jakaminen WhatsAppiin näyttää og-kuvan.
- [ ] Yläpalkissa ei ole enää "M"-palloa.
- [ ] Kuvake näkyy ja tunnistuu myös 16 px:n kokoisena.

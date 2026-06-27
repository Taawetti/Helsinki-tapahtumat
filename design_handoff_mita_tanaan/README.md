# Handoff: "Mitä tänään" — Helsinki-tapahtumasovelluksen UI-uudistus

## Yleiskuvaus
Tämä paketti kuvaa Helsinki-tapahtumasovelluksen ("Mitä tänään") visuaalisen ja toiminnallisen
uudistuksen. Sovellus auttaa käyttäjiä — myös turisteja — löytämään Helsingistä tapahtumia, keikkoja,
ravintoloita ja tekemistä. Tavoite: Suomen paras, Netflix/Prime-tyylisen helppokäyttöinen ja visuaalisesti
houkutteleva tapahtumasovellus. Liput/keikat ovat etusijalla (affiliate-tuotto lipuista).

Uudistus rakentaa olemassa olevan koodikannan (`Taawetti/Helsinki-tapahtumat`, Next.js) päälle:
sama sivurakenne, samat datakentät — uusi visuaalinen ilme + uudet selailu- ja löytämiskokemukset.

## Kuvakaappaukset (näkymät)
Kansiossa `screenshots/` on referenssikuva jokaisesta näkymästä:
- `1-koti.png` — Koti (Tapahtumat & keikat)
- `2-idea.png` — Idea (pyyhkäisy)
- `3-ravintolat.png` — Ravintolat (etusivu / Ruokapaikat)
- `4-ravintolat-kahvilat.png` — Ravintolat → Kahvilat (kaksitasoinen suodatus)
- `5-aktiviteetit.png` — Aktiviteetit
- `6-kartta.png` — Kartta (Leaflet, tasot + suodattimet)
- `7-suosikit.png` — Suosikit

---

## Designtiedostoista (LUE ENSIN)
Tämän paketin `.dc.html`-tiedostot ovat **HTML:llä tehtyjä design-referenssejä** — prototyyppejä, jotka
näyttävät tavoitellun ulkoasun ja käyttäytymisen. **Ne eivät ole tuotantokoodia kopioitavaksi sellaisenaan.**

Tehtävä: **toteuta nämä designit olemassa olevassa koodikannassa** (Next.js / React, Tailwind) sen
vakiintuneilla kuvioilla ja kirjastoilla. Älä raahaa HTML:ää sellaisenaan tuotantoon. `.dc.html` on
sisäinen prototyyppimuoto (custom-template-runtime, `support.js`) — käytä sitä vain visuaalisena ja
toiminnallisena referenssinä. Avaa tiedosto selaimessa nähdäksesi lopputuloksen.

## Tarkkuus (Fidelity)
**Hi-fi** — pikselintarkka. Värit, typografia, välistykset, animaatiot ja vuorovaikutus ovat lopullisia.
Toteuta UI mahdollisimman tarkasti koodikannan omilla komponenteilla ja Tailwind-tokeneilla.

---

## Designjärjestelmä (Design tokens)

### Värit
| Token | Arvo | Käyttö |
|---|---|---|
| Tausta (Midnight) | `#0a0a0c` | Sovelluksen pohja |
| Karttapohja | `#0a0d16` | Leaflet-säiliön tausta |
| Ember-gradientti (aksentti) | `linear-gradient(150deg, #6b76ff, #5059e6)` | CTA-napit, aktiivinen tila, korostukset |
| Aksentti-kiinteä | `#6b76ff` | Aktiivinen ikoni, linkit ("Kaikki ›"), pinnit |
| Aksentti vaalea (teksti) | `#a3abff`, `#aab2ff`, `#c7caff` | Ylätunnisteet, badge-tekstit |
| Kultabadge (Michelin/klassikko) | `#e8c06a`, teksti `#1c1407` | Palkitut, klassikkokahvilat |
| Vihreä (avoinna / helmi / ilmainen) | `#5fd9a6`, `#a7e8c8` | Status "Avoinna", piilohelmet, ilmainen |
| Sininen (ravintolapinnit / kortit) | `#5f96ff` | Karttapinnit, korttisävyt |
| Violetti (yöelämä) | `#af82ff` / `rgba(175,130,255,…)` | Klubit, yöelämän sävyt |
| Syaani | `#5fc8eb` | Vaihteleva korttisävy |
| Teksti valkoinen | `#fff` | Otsikot |
| Teksti himmeä | `rgba(255,255,255,.4–.6)` | Toissijainen teksti, passiiviset ikonit |
| Pintakortit | `rgba(255,255,255,.04–.08)` + `1px solid rgba(255,255,255,.07–.1)` | Listakortit |

**Korttien sävyt vaihtelevat tarkoituksella** (sininen/violetti/vihreä/amber) — älä tee kaikkia indigoiksi.
Indigo (`#6b76ff→#5059e6`) on vain aksentti. (Aiempi versio käytti lämmintä ember-punaa; nykyinen ilme on indigo-Midnight.)

### Typografia
- Fontti: **Inter** (400/500/600/700/800/900). Otsikot painavia (800–900), tiukka letter-spacing (`-.02em`…`-.04em`).
- Sovellusotsikko (esim. "HELSINKI"): 900, ~40–48px, suuraakkoset.
- Osio-otsikot ("Illan keikat"): 900, ~17px.
- Korttinimet: 800, 13–18px.
- Metateksti: 600, 9.5–11px, `rgba(255,255,255,.5)`.
- Yläbadge-labelit: 800–900, 9px, letter-spacing `.08–.14em`, suuraakkoset.

### Pyöristykset & varjot
- Kortit: `border-radius: 16–22px`. Pillerit/chipsit: `999px`. Puhelinkehys: `48px`.
- Hero-varjo: `0 22px 50px -20px rgba(91,101,230,.4)`. Listakortit: `0 14px 30px -16px rgba(0,0,0,.7)`.
- CTA-hehku: `0 10px 24px -8px rgba(91,101,230,.85)`.
- Aktiivisen ikonin hehku: `filter: drop-shadow(0 0 8px rgba(91,101,230,.5))`.

### Animaatiot (keyframet)
- `mtfade` 0.25s ease — sivunvaihdon pehmeä esiintulo.
- `mtpop` 0.22s ease — kortin/modalin esiintulo (scale .94→1).
- `mtdrift` 18s ease infinite — taustan aksentti-hehkun hidas liike.
- `sheetUp` — detalji-paneelin nousu alhaalta.

---

## Sovelluksen rakenne (alanavigaatio)
Kuusi välilehteä (vastaa koodin rakennetta). Alapalkki: tumma `rgba(10,10,12,.94)` + `backdrop-filter: blur(18px)`,
`border-top: 1px solid rgba(255,255,255,.07)`, korkeus 72px, `grid` 6 saraketta. Aktiivinen välilehti = indigo-aksentti
`#6b76ff` + drop-shadow-hehku, passiivinen = `rgba(255,255,255,.4)`.

Ikonit (värilliset emojit): 🏠 **Koti** · 🎲 **Idea** · 🍽 **Ravintolat** · 🧖 **Aktiviteetit** · 🗺 **Kartta** · ♥ **Suosikit**.
(Vaihtoehtoinen monoline-SVG-ikonisetti löytyy tiedostosta `Alaikonit - vaihtoehdot.dc.html` — ei käytössä, mutta referenssinä.)

---

## Näkymät

### 1. Koti — Tapahtumat & keikat (`page === 'koti'`)
**Tarkoitus:** tapahtumien ja keikkojen löytäminen; liput edellä konversiolle.

**Layout (ylhäältä alas):**
1. **Ylätunniste:** iso "HELSINKI" -otsikko (900) + päivämäärä ("perjantai 26. kesäkuuta"). Helsinki isolla on
   tarkoituksellinen — sovellus on vain Helsinkiin. Oikealla 🔔-ilmoituskello (aksenttipiste) + käyttäjäavatar.
2. **Hakukenttä:** "Etsi keikkoja, tapahtumia, artisteja…", korkeus 46px, `rgba(255,255,255,.07)`.
   (HUOM: prototyypissä haku on visuaalinen; toteuta toimiva haku koodikannan hakulogiikalla.)
3. **Päivämäärävalitsin (rivi):** pikavalinnat **Tänään · Huomenna · 🎉 Viikonloppu · Tämä viikko** +
   📅-nappi joka avaa **jakso-kalenterin** (alku–loppu). Katso "Päivämäärävalinta" alla.
4. **VIBES-alakategoriat (vaakavieritettävät pillerit):** Kaikki · 🎸 Keikka · 🌙 Yöelämä · 🍺 Baari / Pub ·
   ⚽ Urheilu · 😂 Stand up · 🏛 Museo · 👨‍👩‍👧 Lapset & Perhe · 🛠 Työpaja & Kurssi · 🎭 Teatteri & Tanssi · 🎨 Taide.
   (= koodin VIBES-lista.) Valittu = aksentti-täyttö + hehku.
5. **Hero-kortti "✦ ILLAN NOSTO":** iso tapahtumakortti (aspect 16/10), kuvapaikka, gradienttiverho,
   badge "Viimeiset liput", ♡-tallenna, otsikko (esim. Olavi Uusivirta), **aksentti-CTA "Liput alk. 32€ →"** + aika.
6. **Vaakarivit (karusellit), tärkeysjärjestyksessä — ajankohtaisin ylimmäs:**
   - **Illan keikat 🎸** — keikkakortit, kukin "Osta →" + hinta.
   - **Alkaa pian lähelläsi ⏱** — kortit "⏱ 45 min · 0.8 km", "Liput →".
   - **Top 10 tänään** — isot numerot (1,2,3…) taustalla, kortit.
   - **Urheilu tänään ⚽** — jääkiekko/jalkapallo/koris, "Liput →".
   - **Tänä viikonloppuna 🎉** — (näytä myös arkena; sisältö mukautuu).
   - **Ilmaiseksi tänään 🎁** — badge "ILMAINEN".
   - **Jotain yllättävää ✨** — "Yllätä minut ›". Epätavalliset tapahtumat (sauna+jooga, silent disco, yömelonta).

Jokainen kortti avaa **detalji-paneelin** (ks. alla). Kaikissa "Kaikki ›" -linkki otsikon oikealla.

### 2. Idea (`page === 'idea'`) — pyyhkäisy-löytäminen
**Tarkoitus:** "en tiedä mitä tehdä nyt" -tilanne. Pyyhkäise illan ehdotuksia.
- Otsikko "Etkö tiedä mitä tehdä? 🎲" + "Kaikki ehdotukset tapahtuvat **tänä iltana**".
- **Valitsin:** **⚡ Juuri nyt** / **Koko ilta** (segmented). "Juuri nyt" suosii pian alkavia.
- ♥-laskuri ("0 listalla") oikealla.
- **Korttipakka (pyyhkäistävä):** iso kortti (aspect 16/13). Vetä oikealle = ♥ tallenna, vasemmalle = ✕ ohita.
  Kortti näyttää: tag + ★-arvosana, edistyminen (1/6), "⏱ alkaa 35 min · 0.6 km", venue, otsikko, "Tänään 21.00 · alk. 32€",
  ja **lyhyt kuvaus suoraan kortissa** (esim. "Kotimaisen rockin suosikki livenä Tavastialla…").
- **Napautus** avaa detalji-paneelin (täydet tiedot). **Drag-kynnys:** liike > 8px = pyyhkäisy, alle = napautus.
  Pyyhkäisyn raja ±100px laukaisee advance.
- Alapainikkeet: ✕ (ohita) · "Liput →" · ♥ (iso aksentti). Tyhjä-tila lopussa: "Kävit illan läpi! N suosikkia".

### 3. Ravintolat (`page === 'ravintolat'`)
**Tarkoitus:** ruokapaikkojen, kahviloiden, baarien ja yökerhojen löytäminen.

**Kaksitasoinen suodatus:**
- **Tyyppivälilehdet (underline-tabit):** 🍽 Ruokapaikat · ☕ Kahvilat · 🍸 Baarit · 🌃 Yökerhot.
- **Alakategoriat (underline-tabit, vaihtuvat tyypin mukaan):**
  - **Ruokapaikat (= koodin CUISINE_CATEGORIES):** Kaikki · 🏆 Palkitut · 🇫🇮 Pohjoismainen · 🍣 Japanilainen · 🍕 Pizza ·
    🍝 Italialainen · 🍜 Aasialainen · 🍔 Hampurilaiset · 🌱 Kasvis · 🌯 Kebab · 🫒 Välimeri · 🍛 Intialainen ·
    🐟 Kala & meri · 🥩 Pihvi & grilli · 🌮 Meksikolainen · 🍰 Dessert.
  - **Kahvilat:** Kaikki · 🎩 Klassikot · 🥖 Ranskalaiset · 📖 Boheemit · ☕ Erikoiskahvilat · 🔥 Paahtimot · 🥐 Brunssi.
  - **Baarit:** Kaikki · 🍸 Cocktail · 🍺 Olutbaarit · 🍷 Viinibaarit · 🏟 Sporttibaarit.
  - **Yökerhot:** Kaikki · 🎧 Tekno · 🪩 Pop & hitit · 🌃 Kattoklubit.

**Käyttäytyminen:**
- Kun alakategoria = **"Kaikki"**, näytetään **etusivu-näkymä** = hero + vaakarivit (suosittelevat). Kun jokin
  muu alakategoria valitaan, näytetään **pystylista** kaikista sen kategorian paikoista.
- **Hero** (pyyhkäistävä karuselli) tyyppikohtaisin badgein (⭐ MICHELIN, ☕ SUOSITTU KAHVILA jne.) + "Varaa pöytä →".
- **Vaakarivit per tyyppi (tunnelma/tilanne-lähtöiset, eivät päällekkäin alakategorioiden kanssa):**
  - **Ruokapaikat:** 🔥 Suosituimmat juuri nyt · 🍴 Lounaspaikat · 🆕 Uutta Helsingissä · 🏆 Palkitut & Michelin · 🇫🇮 Suomalaiset ravintolat (alimpana).
  - **Kahvilat:** 🎩 Arvostetut klassikot · 🥖 Ranskalaistunnelmaa · 📖 Boheemi & rauhallinen.
  - **Baarit:** 🍸 Tyylikkäät cocktailbaarit · 🍺 Laadukkaat olutravintolat · 🏟 Sporttibaarit · 💎 Piilotetut helmet.
  - **Yökerhot:** 🎤 Tänään esiintyy · 🆓 Vapaa sisäänpääsy · 🏙 Kattoterassit · 🔥 Suositut yökerhot.
- **Viikon poiminnat** -rivi (kumppanimainonta — affiliate/maksettu nosto).
- **Listakortti:** ikoni/kuva, nimi, kategoria+kaupunginosa, status (● Avoinna / Sulkeutuu 23, vihreä/amber),
  €-taso, ★ Google-arvosana + arvostelumäärä, etäisyys. Avaa detaljin.

### 4. Aktiviteetit (`page === 'aktiviteetit'`)
**Tarkoitus:** saunat, museot, nähtävyydet, puistot, rannat jne.
- **Alakategoriat:** Kaikki · 🧖 Saunat · 🌄 Näköpaikat · 🏛 Museot · 🏖 Uimarannat · 🌳 Puistot · 🛍 Markkinat · 🖼 Galleriat · 🛠 Työpajat.
- Sama logiikka kuin Ravintolat: "Kaikki" = hero + rivit, muu kategoria = pystylista.
- **Hero** (pyyhkäistävä), esim. Löyly ("Varaa vuoro →").
- **Vaakarivit:** ❤️ Helsingin helmet (Suomenlinna, Tuomiokirkko, Temppeliaukio, Löyly, Oodi — turisteille) ·
  ☔ Sateen sattuessa (sisäkohteet) · 🆓 Ilmaiseksi · 📅 Tänään auki. Ajankohtaisin ylimmäs; Helsingin helmet alemmas
  (ei muutu päivittäin).
- **Listakortti:** kuten ravintoloissa + 📍 reittiohjeet, ★ Google-arvosana, kesto, hinta/Ilmainen, ♿ Esteetön -merkki, nettisivu.

### 5. Kartta (`page === 'kartta'`) — toimiva Leaflet-kartta
**Tarkoitus:** kohteiden selailu kartalla. (Vastaa koodin `MapView.tsx` -toteutusta.)
- **Leaflet 1.9.4** + CARTO **dark_all** -laatat (`https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png`).
  Keskitys Helsinki `[60.1699, 24.9384]`, zoom 13. `attributionControl: false`, `zoomControl: true`.
- **Tasovalitsimet (pillerit):** 🎟 Tapahtumat (indigo-aksentti `#6b76ff`) · 🍽 Ravintolat (sininen `#5f96ff`) · 🧖 Tekemistä (vihreä `#5fd9a6`).
  Päälle/pois. Aktiivisen pillerin tausta = tason väri.
- **Toinen suodatinrivi (vaakavieritettävä):** 📅-päivänappi (avaa saman jakso-kalenterin) + alakategoriat
  päällä olevien tasojen mukaan. **Ravintolat-taso on kaksitasoinen:** ensin tyyppinapit (Ruokapaikat/Kahvilat/
  Baarit/Yökerhot), ja valitun tyypin alakategoriat ilmestyvät **omalle toiselle rivilleen** (↳-merkki, sininen reuna)
  — aina näkyvissä ilman pitkää vieritystä. Tapahtumat/Tekemistä-tasoilla yhden tason alakategoriat.
- **Pinnit:** tapahtumat = aksentti-pisaramuoto (teardrop), ravintolat/tekeminen = pyöreät, tason värillä, valkoinen
  reuna + hehku. Emoji keskellä. Napautus → popup (nimi + tyyppi + "Avaa tiedot →"); klikkaus avaa detaljin.
- **📍 Paikanna** -nappi: geolokaatio, keskittää karttaan + sininen sijaintimerkki. Suodatus reaaliajassa.
- **Tärkeää toteutuksessa:** kutsu `map.invalidateSize()` viiveellä kun karttavälilehti aktivoituu (muuten kartta
  jää puolityhjäksi ennen kuin korkeus asettuu).

### 6. Suosikit (`page === 'suosikit'`)
Tallennettujen kohteiden lista (♥). Kortit kuten muualla, status + aika + hinta.

---

## Detalji-paneeli (kaikki kohteet)
Avautuu kortin/pinnin napautuksesta (`state.detail = key`). Nousee alhaalta (`sheetUp`).
- **Ylä:** kuva/gradientti, ♥-tallenna + ✕-sulje (oikea yläkulma), kategoria-yläteksti + iso nimi.
- **Status-badge** (Avoinna/Liput myynnissä — vihreä, tai amber).
- **Faktalista** (vain relevantit kentät näytetään):
  - Tapahtumat: 💶 hinta · ⏱ kesto · 🕐 aika · 🚪 Ovet (klo) · 🎫 kokoonpano/lämppäri · 🔞 ikäraja · 🏷 Järjestäjä · 📍 osoite + etäisyys.
  - Ravintolat/aktiviteetit: ⭐ Google-arvosana + arvostelumäärä · 💶 €-taso · ⏱ kesto · 🕐 aukiolot · 📍 osoite + etäisyys · 📞 puhelin.
- **Merkit:** Ilmainen (vihreä), ♿ Esteetön (sininen), palkinto (kulta).
- **Kuvaus:** pidempi kuvausteksti (`long`), ei sama lyhyt kuin kortilla.
- **CTA-napit:** aksentti **"Osta liput →" / "Varaa pöytä →"**, sekä **🗺 Kartalla** (kytkee Kartta-välilehteen),
  **➜ Reittiohjeet** (Google Maps transit), **🌐 Nettisivu**.
  - HUOM: "Näytä kartalla" + "Reittiohjeet" tulevat yhteen; tapahtumissa tämä on jo koodissa, ravintoloissa lisätty.
  - Reittiohjeet-URL: `https://maps.google.com/maps?daddr=<lat>,<lon>&travelmode=transit` (tai osoite, jos ei koordinaatteja).

---

## Päivämäärävalinta (jakso-kalenteri)
- 📅-nappi (Koti + Kartta) avaa kalenterimodalin (`mtpop`).
- **Jakso:** ensin "Valitse alkupäivä" → valitse → "Valitse loppupäivä" → valitse. Välipäivät korostuvat
  (aksentti-täyttö `rgba(91,101,230,.2)`), alku/loppu vahvalla aksentti-gradientilla.
- **Sama päivä kahdesti** = vain yksi päivä napissa (esim. "📅 pe 26.6.", ei "26.6. – 26.6.").
- Nappiteksti: jakso "📅 pe 28.6. – su 30.6.", yksi päivä "📅 pe 26.6.", tyhjä "📅 Valitse jakso" / "📅 Päivä".
- "Tyhjennä valinta" nollaa. Pikavalinnat (Tänään/Huomenna/Viikonloppu) nollautuvat kun jakso valitaan ja päinvastoin.
- Menneet päivät eivät ole valittavissa. Suomenkieliset kuukaudet/päivät.

---

## Tilanhallinta (state)
Keskeiset tilamuuttujat (prototyypin React-luokassa; sovita koodikannan tilanhallintaan):
- `page` — aktiivinen välilehti (koti/idea/ravintolat/aktiviteetit/kartta/suosikit).
- `detail` — avoinna olevan kohteen avain (null = paneeli kiinni).
- `vibe` — Koti-sivun valittu VIBE-alakategoria.
- `restType` (ruoka/kahvila/baari/yokerho) + `restSub` — Ravintolat-sivun tyyppi + alakategoria.
- `act` — Aktiviteetit-alakategoria.
- `idx`, `saved`, `dragX`, `dragging`, `ideaMode` (juurinyt/kaikki) — Idea-pyyhkäisy.
- `koDay`, `koStart`, `koEnd`, `koPending`, `koView`, `koCalOpen` — päivämäärävalinta.
- `mapLayers {events,rest,act}`, `mapSub`, `mapRestType` — kartan suodattimet.
- `heroRav`, `heroAkt` — hero-karusellien indeksit.

Datahaut: prototyypin data on staattista demodataa. Toteuta oikeat haut koodikannan APIsta
(`/api/restaurants` jne.). **Älä keksi tilastoja/numeroita joita ei oikeasti ole** (esim. "85 % myyty"
vain jos lipputieto on saatavilla; muuten jätä pois). Kortit näyttävät vain todennettavia kenttiä.

---

## Assetit
- **Fontti:** Inter (Google Fonts) — koodikannassa todennäköisesti jo käytössä.
- **Leaflet 1.9.4** (CSS + JS, unpkg) + CARTO dark_all -laatat. Koodikannassa karttatoteutus on jo
  (`MapView.tsx`) — käytä sitä; tämä on visuaalinen referenssi.
- **Kuvat:** prototyypissä kuvapaikat ovat `image-slot` -placeholdereita. Käytä oikeita kohdekuvia APIsta.
- **Ikonit:** alanavi käyttää värillisiä emojeja. Vaihtoehtoinen SVG-setti: `Alaikonit - vaihtoehdot.dc.html`.
- Ei Anthropic-brändiassetteja.

## Tiedostot tässä paketissa
- `Mitä tänään - Sovellus (sivut).dc.html` — **pääprototyyppi**, kaikki 6 sivua + detalji + kartta + kalenteri.
- `Alaikonit - vaihtoehdot.dc.html` — alanavin ikonivaihtoehdot (monoline-SVG), referenssi.
- `support.js`, `image-slot.js` — prototyyppi-runtime (tarvitaan vain .dc.html:n avaamiseen selaimessa, EI tuotantoon).

### Avaaminen
Avaa `.dc.html` selaimessa (tarvitsee `support.js` + `image-slot.js` samassa kansiossa) nähdäksesi
toimivan prototyypin: navigoi alapalkista, kokeile kalenteria, pyyhkäisyä, karttaa ja suodattimia.

---

## Toteutuksen tarkistuslista (laatu edellä — ei bugeja)
- [ ] Kaikki 6 välilehteä toimivat ja säilyttävät oman tilansa.
- [ ] Ravintolat & Aktiviteetit: "Kaikki" = hero + rivit; muu alakategoria = pystylista.
- [ ] Kartta: `invalidateSize()` viiveellä; tasot + kaksitasoinen ravintolasuodatus; pinnit klikattavissa.
- [ ] Päivämäärävalinta: jakso, sama-päivä-yksi-label, menneet estetty, pikavalinnat synkassa.
- [ ] Detalji: pidempi kuvaus + vain todennettavat faktat; CTA:t (liput/varaa, kartalla, reittiohjeet, nettisivu).
- [ ] Idea: pyyhkäisy ja napautus erottuvat (8px-kynnys); ♥/✕/Liput.
- [ ] Liput-CTA:t affiliate-linkkeineen kaikkialla missä on lippuja.
- [ ] Värit datasta/brändistä; aksenttiväri vain korostuksena; ei keksittyjä numeroita.
- [ ] Saavutettavuus: hit-targetit ≥ 44px; kontrastit riittävät tummalla pohjalla.

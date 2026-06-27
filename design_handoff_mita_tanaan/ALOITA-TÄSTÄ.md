# ALOITA TÄSTÄ — anna tämä viesti Claude Codelle

> **Ohje sinulle:** Avaa projektisi (repo `Taawetti/Helsinki-tapahtumat`) Claude Codessa,
> varmista että tämä `design-handoff`-kansio on projektin sisällä (tai sen vieressä),
> ja **kopioi alla oleva harmaa lohko sellaisenaan** Claude Coden viestikenttään.
> Se on ainoa prompti jonka tarvitset — Claude Code etenee sen ohjeen mukaan osa kerrallaan.

---

```
Lue ensin design-handoff/README.md kokonaan ja katso kuvat kansiosta
design-handoff/screenshots/. Tämä on hyväksytty, lopullinen visuaalinen suunta
"Mitä tänään" -sovellukselle.

TÄRKEÄT REUNAEHDOT:
- Toteuta muutokset OLEMASSA OLEVAAN Next.js-koodiin (komponentit kuten EventsView,
  RestaurantsView, ActivitiesView, MapView, navigaatio). ÄLÄ aloita tyhjästä äläkä
  kopioi .dc.html-tiedostoja tuotantoon — ne ovat vain visuaalinen referenssi.
- Käytä OIKEAA dataani. Älä keksi tapahtumia, hintoja, arvosanoja tai "85 % myyty"
  -tyyppisiä lukuja. Jos jokin tieto puuttuu datasta, jätä se pois.
- Liput/keikat ovat etusijalla (affiliate-tuotto) — varmista että ne ovat näkyvästi esillä.

ETENE TÄSSÄ JÄRJESTYKSESSÄ. Tee yksi vaihe kerrallaan, pysähdy jokaisen jälkeen ja
kerro mitä teit, jotta voin tarkistaa ennen seuraavaa:

1) Väritys + alanavigaatio: indigo-aksentti (#6b76ff → #5059e6), tumma Midnight-pohja,
   alapalkin 6 välilehteä (Koti, Idea, Ravintolat, Aktiviteetit, Kartta, Suosikit) ja
   aktiivisen välilehden hehku.
2) Koti-sivu (screenshots/1-koti.png): hero-nosto, jakso-kalenteri, VIBES-pillerit,
   vaakarivit.
3) Ravintolat (3-ravintolat.png + 4-ravintolat-kahvilat.png): kaksitasoinen suodatus
   (Ruokapaikat / Kahvilat / Baarit / Yökerhot + alakategoriat) ja vaakarivit.
4) Aktiviteetit (5-aktiviteetit.png).
5) Kartta (6-kartta.png): Leaflet + CARTO dark, tasovalitsimet, alakategoria-suodatus,
   pinnit oikealla datalla.
6) Idea (pyyhkäisy) ja Suosikit (7-suosikit.png).

Aloita vaiheesta 1. Älä tee kaikkia vaiheita kerralla.
```

---

## Paketin sisältö
- `README.md` — täysi suunnitteluspeksi (värit, typografia, kaikki näkymät, vuorovaikutus, tarkistuslista)
- `screenshots/` — referenssikuva jokaisesta näkymästä
- `Mitä tänään - Sovellus (sivut).dc.html` — toimiva prototyyppi (avaa selaimessa)
- `Alaikonit - vaihtoehdot.dc.html` — alanavigaation ikonivaihtoehdot
- `support.js`, `image-slot.js` — prototyypin ajonaikaiset tiedostot (ei tuotantoon)

## Muistilista sinulle
Anna yllä oleva prompti **kerran**. Kun Claude Code on tehnyt vaiheen, katso tulos selaimessa.
Jos jokin on pielessä, sano se omin sanoin (esim. "hero-kortin napit ovat väärän väriset, korjaa")
ennen kuin pyydät seuraavaa vaihetta.

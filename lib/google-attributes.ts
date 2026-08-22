// Google Business -profiilin (DataForSEO my_business_info) attribuuttiavaimet →
// suomenkielinen tagi + emoji. Jaettu ravintola- ja aktiviteettikorttien kesken
// (molemmat lukevat saman google_raw.attributes.available_attributes-rakenteen).
//
// TÄRKEÄÄ: avaimet ovat DataForSEO:n TODELLISIA avaimia (havaittu tuotannon
// google_raw-datasta, ei arvattu). Ryhmät: accessibility, amenities, offerings,
// service_options, atmosphere, crowd, children, payments, planning, parking,
// popular_for, highlights, dining_options. Tuntemattomat avaimet ohitetaan
// pickAttributesissa — raakoja konekielisiä avaimia ei näytetä. Usea avain voi
// mapata samaan labeliin (dedup pickAttributesissa).
// ── ARVOJÄRJESTYS (rank) ────────────────────────────────────────────────────
// Kortilla näytetään vain 10 tagia, ja aiemmin ne valittiin JSON-avainten
// järjestyksessä. Se tarkoitti että maksutavat ja parkkipaikat voittivat aina:
// mitattu tuotannon datasta (1529 paikkaa, ka 27,7 attribuuttia, 81 %:lla yli 10)
//
//     Terassi          omaa  637  →  näkyi     2
//     Romanttinen      omaa  148  →  näkyi     1
//     Live-musiikkia   omaa  132  →  näkyi     4
//     Trendikäs        omaa  536  →  näkyi    14
//     Kortti käy       omaa 1297  →  näkyi  1274
//     Lähimaksu        omaa 1256  →  näkyi  1180
//
// Syy: ensimmäinen ryhmä on 722 paikalla 'crowd' ja 426:lla 'pets', ja kortti
// täyttyi niistä. Siksi jokaisella tagilla on nyt arvoluokka:
//   1 = erottava — vastaa kysymykseen "miksi juuri tänne tänä iltana"
//   2 = hyödyllinen konteksti — varaus, yleisö, esteettömyys, ruoka-ajat
//   3 = vakiovaruste — maksutavat, parkki, WC. Tosi harvoin ratkaisee valinnan.
// pickAttributes lajittelee näiden mukaan VAKAASTI, joten saman luokan sisällä
// järjestys säilyy ennallaan eikä tulos heittelehdi.
type Rank = 1 | 2 | 3

export const ATTR_LABELS: Record<string, { emoji: string; label: string; rank: Rank; a11y?: true }> = {
  // ── Esteettömyys ────────────────────────────────────────────────
  has_wheelchair_accessible_entrance: { emoji: '♿', label: 'Esteetön sisäänkäynti', rank: 2, a11y: true },
  has_wheelchair_accessible_restroom: { emoji: '♿', label: 'Esteetön WC', rank: 2, a11y: true },
  has_wheelchair_accessible_seating: { emoji: '♿', label: 'Esteetön istumapaikka', rank: 2, a11y: true },
  has_wheelchair_accessible_parking: { emoji: '♿', label: 'Esteetön parkki', rank: 2, a11y: true },
  has_wheelchair_accessible_elevator: { emoji: '♿', label: 'Esteetön hissi', rank: 2, a11y: true },
  has_hearing_loop: { emoji: '🦻', label: 'Induktiosilmukka', rank: 2, a11y: true },
  has_assisted_listening_devices: { emoji: '🦻', label: 'Kuunteluapuvälineet', rank: 2, a11y: true },
  // ── Tilat / mukavuudet ──────────────────────────────────────────
  has_restaurant: { emoji: '🍽', label: 'Ravintola', rank: 2 },
  has_cafe: { emoji: '☕', label: 'Kahvila', rank: 2 },
  has_bar_onsite: { emoji: '🍸', label: 'Baari', rank: 2 },
  has_wi_fi: { emoji: '📶', label: 'Wifi', rank: 2 },
  has_restroom: { emoji: '🚻', label: 'WC', rank: 3 },
  has_restroom_unisex: { emoji: '🚻', label: 'Unisex-WC', rank: 3 },
  has_seating: { emoji: '🪑', label: 'Istumapaikkoja', rank: 3 },
  has_seating_outdoors: { emoji: '☀️', label: 'Terassi', rank: 1 },
  has_sauna: { emoji: '🧖', label: 'Sauna', rank: 1 },
  has_gift_shop: { emoji: '🎁', label: 'Myymälä', rank: 2 },
  has_catering: { emoji: '🍱', label: 'Catering', rank: 2 },
  has_lactation_space: { emoji: '🍼', label: 'Imetystila', rank: 2 },
  has_live_performances: { emoji: '🎭', label: 'Esityksiä', rank: 1 },
  // ── Palveluvaihtoehdot ──────────────────────────────────────────
  serves_dine_in: { emoji: '🍽', label: 'Paikan päällä', rank: 3 },
  has_table_service: { emoji: '🧑‍🍳', label: 'Pöytiintarjoilu', rank: 2 },
  has_private_dining_room: { emoji: '🚪', label: 'Yksityistila', rank: 2 },
  has_takeout: { emoji: '🥡', label: 'Takeaway', rank: 2 },
  has_delivery: { emoji: '🛵', label: 'Kotiinkuljetus', rank: 2 },
  has_no_contact_delivery: { emoji: '🛵', label: 'Kontaktiton kuljetus', rank: 3 },
  has_curbside_pickup: { emoji: '🚗', label: 'Nouto autolle', rank: 3 },
  has_drive_through: { emoji: '🚗', label: 'Drive-in', rank: 3 },
  // ── Tarjonta (ruoka/juoma) ──────────────────────────────────────
  serves_alcohol: { emoji: '🍸', label: 'Alkoholia', rank: 2 },
  serves_liquor: { emoji: '🥃', label: 'Väkeviä', rank: 2 },
  serves_beer: { emoji: '🍺', label: 'Olutta', rank: 2 },
  serves_beer_notable: { emoji: '🍺', label: 'Olutta', rank: 1 },
  serves_wine: { emoji: '🍷', label: 'Viiniä', rank: 2 },
  serves_wine_notable: { emoji: '🍷', label: 'Viiniä', rank: 1 },
  serves_late_night_food: { emoji: '🌃', label: 'Yöruokaa', rank: 1 },
  serves_cocktails: { emoji: '🍸', label: 'Cocktaileja', rank: 1 },
  serves_cocktails_notable: { emoji: '🍸', label: 'Cocktaileja', rank: 1 },
  serves_coffee: { emoji: '☕', label: 'Kahvia', rank: 2 },
  serves_coffee_notable: { emoji: '☕', label: 'Kahvia', rank: 1 },
  serves_tea_notable: { emoji: '🍵', label: 'Teetä', rank: 1 },
  serves_dessert: { emoji: '🍰', label: 'Jälkiruokia', rank: 2 },
  serves_dessert_notable: { emoji: '🍰', label: 'Jälkiruokia', rank: 1 },
  serves_small_plates: { emoji: '🍢', label: 'Pieniä annoksia', rank: 2 },
  serves_vegetarian: { emoji: '🥗', label: 'Kasvisruokaa', rank: 1 },
  serves_vegan: { emoji: '🌱', label: 'Vegaaniruokaa', rank: 1 },
  serves_breakfast: { emoji: '🍳', label: 'Aamiaista', rank: 2 },
  serves_breakfast_popular: { emoji: '🍳', label: 'Aamiaista', rank: 2 },
  serves_brunch: { emoji: '🥐', label: 'Brunssia', rank: 2 },
  serves_lunch: { emoji: '🍴', label: 'Lounasta', rank: 2 },
  serves_lunch_popular: { emoji: '🍴', label: 'Lounasta', rank: 2 },
  serves_dinner: { emoji: '🌙', label: 'Illallista', rank: 2 },
  serves_dinner_popular: { emoji: '🌙', label: 'Illallista', rank: 2 },
  // ── Suosittu / käyttötapa ───────────────────────────────────────
  quick_bite: { emoji: '⚡', label: 'Pikapala', rank: 2 },
  // ── Tunnelma (feels_*) ──────────────────────────────────────────
  feels_casual: { emoji: '👕', label: 'Rento', rank: 1 },
  feels_cozy: { emoji: '🛋', label: 'Viihtyisä', rank: 1 },
  feels_quiet: { emoji: '🤫', label: 'Rauhallinen', rank: 1 },
  feels_historic: { emoji: '🏛', label: 'Historiallinen', rank: 1 },
  feels_upscale: { emoji: '🥂', label: 'Fiini', rank: 1 },
  feels_hip: { emoji: '✨', label: 'Trendikäs', rank: 1 },
  feels_romantic: { emoji: '💕', label: 'Romanttinen', rank: 1 },
  suitable_for_watching_sports: { emoji: '📺', label: 'Urheilua', rank: 1 },
  has_live_music: { emoji: '🎵', label: 'Live-musiikkia', rank: 1 },
  // ── Yleisö ──────────────────────────────────────────────────────
  welcomes_families: { emoji: '👨‍👩‍👧', label: 'Perheystävällinen', rank: 2 },
  welcomes_children: { emoji: '👶', label: 'Lapsille sopiva', rank: 2 },
  welcomes_lgbtq: { emoji: '🏳️‍🌈', label: 'LGBTQ-ystävällinen', rank: 2 },
  is_transgender_safespace: { emoji: '🏳️‍⚧️', label: 'Transturvallinen', rank: 2 },
  suitable_for_groups: { emoji: '👥', label: 'Ryhmille', rank: 2 },
  suitable_for_solo_dining: { emoji: '🧍', label: 'Sopii yksin', rank: 2 },
  welcomes_dogs: { emoji: '🐕', label: 'Koirat ok', rank: 2 },
  allows_dogs_inside: { emoji: '🐕', label: 'Koirat ok', rank: 2 },
  allows_dogs_outside: { emoji: '🐕', label: 'Koirat ok (ulkona)', rank: 2 },
  // ── Lapset ──────────────────────────────────────────────────────
  has_childrens_menu: { emoji: '🧒', label: 'Lastenmenu', rank: 2 },
  has_high_chairs: { emoji: '🪑', label: 'Syöttötuolit', rank: 3 },
  has_kid_friendly_activities: { emoji: '🎈', label: 'Lapsille tekemistä', rank: 2 },
  has_discounts_for_kids: { emoji: '🎟', label: 'Lastenalennukset', rank: 3 },
  has_changing_tables: { emoji: '🍼', label: 'Hoitopöytä', rank: 3 },
  // ── Varaus / suunnittelu ────────────────────────────────────────
  recommends_reservations: { emoji: '📅', label: 'Varaus suositeltu', rank: 2 },
  recommends_reservations_dinner: { emoji: '📅', label: 'Varaus suositeltu', rank: 2 },
  recommends_reservations_brunch: { emoji: '📅', label: 'Varaus suositeltu', rank: 2 },
  accepts_reservations: { emoji: '📅', label: 'Varattavissa', rank: 2 },
  recommends_appointment: { emoji: '📅', label: 'Ajanvaraus suositeltu', rank: 2 },
  recommend_getting_tickets_ahead: { emoji: '🎫', label: 'Liput etukäteen', rank: 2 },
  usually_a_wait: { emoji: '⏳', label: 'Yleensä jonoa', rank: 2 },
  // ── Parkki ──────────────────────────────────────────────────────
  has_parking_lot_free: { emoji: '🅿️', label: 'Ilmainen parkki', rank: 3 },
  has_parking_street_free: { emoji: '🅿️', label: 'Ilmainen parkki', rank: 3 },
  has_parking_garage_free: { emoji: '🅿️', label: 'Ilmainen parkki', rank: 3 },
  has_parking_lot_paid: { emoji: '🅿️', label: 'Maksullinen parkki', rank: 3 },
  has_parking_street_paid: { emoji: '🅿️', label: 'Maksullinen parkki', rank: 3 },
  has_parking_garage_paid: { emoji: '🅿️', label: 'Maksullinen parkki', rank: 3 },
  // ── Maksu ───────────────────────────────────────────────────────
  pay_credit_card: { emoji: '💳', label: 'Kortti käy', rank: 3 },
  pay_debit_card: { emoji: '💳', label: 'Kortti käy', rank: 3 },
  pay_mobile_nfc: { emoji: '📱', label: 'Lähimaksu', rank: 3 },
  // ── Muut ────────────────────────────────────────────────────────
  has_admission_fee: { emoji: '🎫', label: 'Pääsymaksu', rank: 2 },
  // ── LISÄTTY 8/2026: mitattu 73 labeloimatonta avainta (2584 esiintymää),
  //    joista nämä ovat illan aikeita — juuri se mitä tapahtumasovelluksen
  //    kuuluu tarjota. Luvut ovat todellisia esiintymiä tuotannon datassa.
  has_all_you_can_eat_always:     { emoji: '🍽', label: 'Buffet', rank: 1 },          // 189
  has_counter_service:            { emoji: '🧾', label: 'Tiskiltä', rank: 3 },        // 181
  has_bar_games:                  { emoji: '🎯', label: 'Pelejä', rank: 1 },          // 127
  popular_with_students:          { emoji: '🎓', label: 'Opiskelijoiden suosiossa', rank: 1 }, // 121
  has_salad_bar:                  { emoji: '🥗', label: 'Salaattibaari', rank: 1 },   // 120
  serves_organic:                 { emoji: '🌿', label: 'Luomua', rank: 1 },          // 118
  serves_happy_hour_drinks:       { emoji: '🍻', label: 'Happy hour', rank: 1 },      // 117
  is_owned_by_women:              { emoji: '♀️', label: 'Naisten omistama', rank: 2 }, // 87
  serves_food_at_bar:             { emoji: '🍽', label: 'Ruokaa baaritiskillä', rank: 2 }, // 73
  suitable_for_working_on_laptop: { emoji: '💻', label: 'Sopii työskentelyyn', rank: 1 }, // 71
  serves_happy_hour_food:         { emoji: '🍟', label: 'Happy hour -ruokaa', rank: 1 }, // 60
  serves_healthy:                 { emoji: '🥦', label: 'Terveellistä', rank: 2 },    // 44
  has_seating_rooftop:            { emoji: '🏙', label: 'Kattoterassi', rank: 1 },    // 39
  requires_reservations:          { emoji: '📅', label: 'Varaus vaaditaan', rank: 2 }, // 39
  serves_halal_food:              { emoji: '☪️', label: 'Halal', rank: 1 },            // 34
  has_dancing:                    { emoji: '💃', label: 'Tanssilattia', rank: 1 },    // 34
  has_trivia_night:               { emoji: '❓', label: 'Tietovisa', rank: 1 },        // 32
  has_fireplace:                  { emoji: '🔥', label: 'Takka', rank: 1 },           // 32
  has_karaoke_nights:             { emoji: '🎤', label: 'Karaoke', rank: 1 },         // 20
  quick_visit:                    { emoji: '⚡', label: 'Nopea käynti', rank: 2 },     // 17
  has_arcade_games:               { emoji: '🕹', label: 'Pelihalli', rank: 1 },       // 14
  allows_outside_food:            { emoji: '🥪', label: 'Omat eväät sallittu', rank: 2 }, // 14
  // ── Legacy-aliakset (aktiviteettien vanha mappaus) — pidetään ettei
  //    yksikään aiemmin näytetty tagi katoa refaktoroinnissa ───────────
  has_bar: { emoji: '🍸', label: 'Baari', rank: 2 },
  has_outdoor_seating: { emoji: '☀️', label: 'Terassi', rank: 1 },
  is_lgbtq_friendly: { emoji: '🏳️‍🌈', label: 'LGBTQ-ystävällinen', rank: 2 },
  allows_dogs: { emoji: '🐕', label: 'Koirat ok', rank: 2 },
  has_parking: { emoji: '🅿️', label: 'Parkki', rank: 3 },
  has_free_parking: { emoji: '🅿️', label: 'Ilmainen parkki', rank: 3 },
  has_free_street_parking: { emoji: '🅿️', label: 'Ilmainen parkki', rank: 3 },
  has_gender_neutral_restroom: { emoji: '🚻', label: 'Sukupuolineutraali WC', rank: 3 },
}

// Poimi näytettävät attribuutit ryhmistä (litistetään + suomennetaan + dedup +
// järjestetään arvon mukaan). Palautusmuoto on ennallaan { emoji, label }, joten
// kutsupaikkoja ei tarvinnut muuttaa — vain järjestys muuttuu.
export function pickAttributes(
  attrs: Record<string, string[]> | null,
  limit?: number,
): { emoji: string; label: string }[] {
  if (!attrs) return []
  type Picked = { emoji: string; label: string; rank: Rank; a11y?: true }
  const picked: Picked[] = []
  const byLabel = new Map<string, Picked>()
  for (const group of Object.values(attrs)) {
    // google_raw on validoimatonta JSONia — varmista taulukko ettei render kaadu
    for (const k of (Array.isArray(group) ? group : [])) {
      const m = ATTR_LABELS[k]
      if (!m) continue
      // dedup labelin mukaan (esim. pay_credit_card + pay_debit_card = "Kortti käy")
      const prev = byLabel.get(m.label)
      if (!prev) {
        const entry = { ...m }
        byLabel.set(m.label, entry)
        picked.push(entry)
      } else if (m.rank < prev.rank) {
        // Sama label, parempi arvoluokka → korota. Tarpeen koska esim.
        // serves_beer (2) ja serves_beer_notable (1) tuottavat molemmat
        // "Olutta": ilman korotusta järjestys riippuisi siitä kumpi sattui
        // olemaan JSONissa ensin, eli juuri siitä sattumasta jota tämä korjaa.
        prev.rank = m.rank
      }
    }
  }
  // VAKAA lajittelu: saman arvoluokan sisällä alkuperäinen järjestys säilyy,
  // joten sama paikka näyttää aina samat tagit samassa järjestyksessä.
  const sorted = picked.sort((a, b) => a.rank - b.rank)
  const strip = (t: { emoji: string; label: string }) => ({ emoji: t.emoji, label: t.label })
  if (limit == null || sorted.length <= limit) return sorted.map(strip)

  const top = sorted.slice(0, limit)

  // ESTEETTÖMYYDELLE TAATTU PAIKKA. Mediaanipaikalla on 9 rank 1 -tagia ja
  // 43 %:lla vähintään 10, joten pelkkä arvojärjestys jätti esteettömyyden
  // näkyviin vain 22 %:lle niistä joilla se on. Pyörätuolia käyttävälle se on
  // koko listan tärkein tieto eikä sitä voi jättää kilpailun varaan: jos
  // paikalla on esteettömyystagi mutta yksikään ei mahtunut, korvataan
  // vähäarvoisin näytettävä sillä. Enintään yksi — tarkempi erittely kuuluu
  // paikan omalle sivulle, ei tagipilveen.
  if (!top.some((t) => t.a11y)) {
    const a11y = sorted.find((t) => t.a11y)
    if (a11y) top[top.length - 1] = a11y
  }
  return top.map(strip)
}

// ── SUODATTIMET ─────────────────────────────────────────────────────────────
//
// Ennen tätä yhtäkään ~28 attribuutista ei voinut suodattaa, koska rikas data ei
// ollut listavastauksessa lainkaan — tieto oli olemassa paikka kerrallaan mutta
// sitä ei voinut kysyä koko joukolta. Nämä ovat kysymyksiä joihin Google Maps
// vastaa huonosti ja joihin meillä on kate (mitatut paikkamäärät suluissa).
//
// Lippu on lyhyt tunniste, ei koko attribuuttijoukko: 3583 ravintolaa × muutama
// merkkijono on mitätön lisä vastaukseen, kun taas koko google_raw olisi 13,5 MB.
export const FILTER_FLAGS: { id: string; emoji: string; label: string; keys: string[] }[] = [
  { id: 'terassi', emoji: '☀️', label: 'Terassi', keys: ['has_seating_outdoors', 'has_outdoor_seating', 'has_seating_rooftop'] }, // 637
  { id: 'kasvis', emoji: '🥗', label: 'Kasvisruokaa', keys: ['serves_vegetarian'] },                                              // 669
  { id: 'vegaani', emoji: '🌱', label: 'Vegaania', keys: ['serves_vegan'] },                                                       // 461
  { id: 'yoruoka', emoji: '🌃', label: 'Yöruokaa', keys: ['serves_late_night_food'] },                                             // 434
  { id: 'varattavissa', emoji: '📅', label: 'Varattavissa', keys: ['accepts_reservations', 'recommends_reservations', 'recommends_reservations_dinner'] }, // 676
  { id: 'koirat', emoji: '🐕', label: 'Koirat ok', keys: ['welcomes_dogs', 'allows_dogs_inside', 'allows_dogs_outside'] },        // 379
  { id: 'esteeton', emoji: '♿', label: 'Esteetön', keys: ['has_wheelchair_accessible_entrance'] },                                 // 783
  { id: 'live', emoji: '🎵', label: 'Live-musiikkia', keys: ['has_live_music', 'has_live_performances'] },                          // 132
]

const FLAG_BY_KEY = new Map<string, string>()
for (const f of FILTER_FLAGS) for (const k of f.keys) FLAG_BY_KEY.set(k, f.id)

/** Attribuuttiryhmistä → lyhyet suodatintunnisteet. Ajetaan palvelimella kerran
 *  rikastuksen haun yhteydessä, ei selaimessa jokaista korttia kohden. */
export function deriveFlags(attrs: Record<string, string[]> | null | undefined): string[] {
  if (!attrs || typeof attrs !== 'object') return []
  const out = new Set<string>()
  for (const group of Object.values(attrs)) {
    for (const k of (Array.isArray(group) ? group : [])) {
      const id = FLAG_BY_KEY.get(k)
      if (id) out.add(id)
    }
  }
  return [...out]
}

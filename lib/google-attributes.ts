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

import type { TranslationKey } from './i18n'

type Rank = 1 | 2 | 3

// labelKey on käännösavain (lib/i18n.ts) ja label sen suomenkielinen arvo
// sanasta sanaan. Molemmat pidetään: labelKey on se mitä renderöidään, label
// on turvaverkko (ja lukukelpoinen dokumentaatio siitä mitä avain tarkoittaa).
// Jokaisen uniikin labelin jakavat rivit jakavat myös saman labelKeyn.
export const ATTR_LABELS: Record<string, { emoji: string; label: string; labelKey: TranslationKey; rank: Rank; a11y?: true }> = {
  // ── Esteettömyys ────────────────────────────────────────────────
  has_wheelchair_accessible_entrance: { emoji: '♿', label: 'Esteetön sisäänkäynti', labelKey: 'attr.accessible_entrance', rank: 2, a11y: true },
  has_wheelchair_accessible_restroom: { emoji: '♿', label: 'Esteetön WC', labelKey: 'attr.accessible_restroom', rank: 2, a11y: true },
  has_wheelchair_accessible_seating: { emoji: '♿', label: 'Esteetön istumapaikka', labelKey: 'attr.accessible_seating', rank: 2, a11y: true },
  has_wheelchair_accessible_parking: { emoji: '♿', label: 'Esteetön parkki', labelKey: 'attr.accessible_parking', rank: 2, a11y: true },
  has_wheelchair_accessible_elevator: { emoji: '♿', label: 'Esteetön hissi', labelKey: 'attr.accessible_elevator', rank: 2, a11y: true },
  has_hearing_loop: { emoji: '🦻', label: 'Induktiosilmukka', labelKey: 'attr.hearing_loop', rank: 2, a11y: true },
  has_assisted_listening_devices: { emoji: '🦻', label: 'Kuunteluapuvälineet', labelKey: 'attr.assisted_listening', rank: 2, a11y: true },
  // ── Tilat / mukavuudet ──────────────────────────────────────────
  has_restaurant: { emoji: '🍽', label: 'Ravintola', labelKey: 'attr.restaurant', rank: 2 },
  has_cafe: { emoji: '☕', label: 'Kahvila', labelKey: 'attr.cafe', rank: 2 },
  has_bar_onsite: { emoji: '🍸', label: 'Baari', labelKey: 'attr.bar', rank: 2 },
  has_wi_fi: { emoji: '📶', label: 'Wifi', labelKey: 'attr.wifi', rank: 2 },
  has_restroom: { emoji: '🚻', label: 'WC', labelKey: 'attr.restroom', rank: 3 },
  has_restroom_unisex: { emoji: '🚻', label: 'Unisex-WC', labelKey: 'attr.unisex_restroom', rank: 3 },
  has_seating: { emoji: '🪑', label: 'Istumapaikkoja', labelKey: 'attr.seating', rank: 3 },
  has_seating_outdoors: { emoji: '☀️', label: 'Terassi', labelKey: 'attr.outdoor_seating', rank: 1 },
  has_sauna: { emoji: '🧖', label: 'Sauna', labelKey: 'attr.sauna', rank: 1 },
  has_gift_shop: { emoji: '🎁', label: 'Myymälä', labelKey: 'attr.shop', rank: 2 },
  has_catering: { emoji: '🍱', label: 'Catering', labelKey: 'attr.catering', rank: 2 },
  has_lactation_space: { emoji: '🍼', label: 'Imetystila', labelKey: 'attr.nursing_room', rank: 2 },
  has_live_performances: { emoji: '🎭', label: 'Esityksiä', labelKey: 'attr.live_performances', rank: 1 },
  // ── Palveluvaihtoehdot ──────────────────────────────────────────
  serves_dine_in: { emoji: '🍽', label: 'Paikan päällä', labelKey: 'attr.dine_in', rank: 3 },
  has_table_service: { emoji: '🧑‍🍳', label: 'Pöytiintarjoilu', labelKey: 'attr.table_service', rank: 2 },
  has_private_dining_room: { emoji: '🚪', label: 'Yksityistila', labelKey: 'attr.private_room', rank: 2 },
  has_takeout: { emoji: '🥡', label: 'Takeaway', labelKey: 'attr.takeout', rank: 2 },
  has_delivery: { emoji: '🛵', label: 'Kotiinkuljetus', labelKey: 'attr.delivery', rank: 2 },
  has_no_contact_delivery: { emoji: '🛵', label: 'Kontaktiton kuljetus', labelKey: 'attr.no_contact_delivery', rank: 3 },
  has_curbside_pickup: { emoji: '🚗', label: 'Nouto autolle', labelKey: 'attr.curbside_pickup', rank: 3 },
  has_drive_through: { emoji: '🚗', label: 'Drive-in', labelKey: 'attr.drive_through', rank: 3 },
  // ── Tarjonta (ruoka/juoma) ──────────────────────────────────────
  serves_alcohol: { emoji: '🍸', label: 'Alkoholia', labelKey: 'attr.alcohol', rank: 2 },
  serves_liquor: { emoji: '🥃', label: 'Väkeviä', labelKey: 'attr.spirits', rank: 2 },
  serves_beer: { emoji: '🍺', label: 'Olutta', labelKey: 'attr.beer', rank: 2 },
  serves_beer_notable: { emoji: '🍺', label: 'Olutta', labelKey: 'attr.beer', rank: 1 },
  serves_wine: { emoji: '🍷', label: 'Viiniä', labelKey: 'attr.wine', rank: 2 },
  serves_wine_notable: { emoji: '🍷', label: 'Viiniä', labelKey: 'attr.wine', rank: 1 },
  serves_late_night_food: { emoji: '🌃', label: 'Yöruokaa', labelKey: 'attr.late_night_food', rank: 1 },
  serves_cocktails: { emoji: '🍸', label: 'Cocktaileja', labelKey: 'attr.cocktails', rank: 1 },
  serves_cocktails_notable: { emoji: '🍸', label: 'Cocktaileja', labelKey: 'attr.cocktails', rank: 1 },
  serves_coffee: { emoji: '☕', label: 'Kahvia', labelKey: 'attr.coffee', rank: 2 },
  serves_coffee_notable: { emoji: '☕', label: 'Kahvia', labelKey: 'attr.coffee', rank: 1 },
  serves_tea_notable: { emoji: '🍵', label: 'Teetä', labelKey: 'attr.tea', rank: 1 },
  serves_dessert: { emoji: '🍰', label: 'Jälkiruokia', labelKey: 'attr.dessert', rank: 2 },
  serves_dessert_notable: { emoji: '🍰', label: 'Jälkiruokia', labelKey: 'attr.dessert', rank: 1 },
  serves_small_plates: { emoji: '🍢', label: 'Pieniä annoksia', labelKey: 'attr.small_plates', rank: 2 },
  serves_vegetarian: { emoji: '🥗', label: 'Kasvisruokaa', labelKey: 'attr.vegetarian', rank: 1 },
  serves_vegan: { emoji: '🌱', label: 'Vegaaniruokaa', labelKey: 'attr.vegan', rank: 1 },
  serves_breakfast: { emoji: '🍳', label: 'Aamiaista', labelKey: 'attr.breakfast', rank: 2 },
  serves_breakfast_popular: { emoji: '🍳', label: 'Aamiaista', labelKey: 'attr.breakfast', rank: 2 },
  serves_brunch: { emoji: '🥐', label: 'Brunssia', labelKey: 'attr.brunch', rank: 2 },
  serves_lunch: { emoji: '🍴', label: 'Lounasta', labelKey: 'attr.lunch', rank: 2 },
  serves_lunch_popular: { emoji: '🍴', label: 'Lounasta', labelKey: 'attr.lunch', rank: 2 },
  serves_dinner: { emoji: '🌙', label: 'Illallista', labelKey: 'attr.dinner', rank: 2 },
  serves_dinner_popular: { emoji: '🌙', label: 'Illallista', labelKey: 'attr.dinner', rank: 2 },
  // ── Suosittu / käyttötapa ───────────────────────────────────────
  quick_bite: { emoji: '⚡', label: 'Pikapala', labelKey: 'attr.quick_bite', rank: 2 },
  // ── Tunnelma (feels_*) ──────────────────────────────────────────
  feels_casual: { emoji: '👕', label: 'Rento', labelKey: 'attr.casual', rank: 1 },
  feels_cozy: { emoji: '🛋', label: 'Viihtyisä', labelKey: 'attr.cozy', rank: 1 },
  feels_quiet: { emoji: '🤫', label: 'Rauhallinen', labelKey: 'attr.quiet', rank: 1 },
  feels_historic: { emoji: '🏛', label: 'Historiallinen', labelKey: 'attr.historic', rank: 1 },
  feels_upscale: { emoji: '🥂', label: 'Fiini', labelKey: 'attr.upscale', rank: 1 },
  feels_hip: { emoji: '✨', label: 'Trendikäs', labelKey: 'attr.trendy', rank: 1 },
  feels_romantic: { emoji: '💕', label: 'Romanttinen', labelKey: 'attr.romantic', rank: 1 },
  suitable_for_watching_sports: { emoji: '📺', label: 'Urheilua', labelKey: 'attr.sports_on_tv', rank: 1 },
  has_live_music: { emoji: '🎵', label: 'Live-musiikkia', labelKey: 'attr.live_music', rank: 1 },
  // ── Yleisö ──────────────────────────────────────────────────────
  welcomes_families: { emoji: '👨‍👩‍👧', label: 'Perheystävällinen', labelKey: 'attr.family_friendly', rank: 2 },
  welcomes_children: { emoji: '👶', label: 'Lapsille sopiva', labelKey: 'attr.kid_friendly', rank: 2 },
  welcomes_lgbtq: { emoji: '🏳️‍🌈', label: 'LGBTQ-ystävällinen', labelKey: 'attr.lgbtq_friendly', rank: 2 },
  is_transgender_safespace: { emoji: '🏳️‍⚧️', label: 'Transturvallinen', labelKey: 'attr.transgender_safespace', rank: 2 },
  suitable_for_groups: { emoji: '👥', label: 'Ryhmille', labelKey: 'attr.good_for_groups', rank: 2 },
  suitable_for_solo_dining: { emoji: '🧍', label: 'Sopii yksin', labelKey: 'attr.solo_dining', rank: 2 },
  welcomes_dogs: { emoji: '🐕', label: 'Koirat ok', labelKey: 'attr.dog_friendly', rank: 2 },
  allows_dogs_inside: { emoji: '🐕', label: 'Koirat ok', labelKey: 'attr.dog_friendly', rank: 2 },
  allows_dogs_outside: { emoji: '🐕', label: 'Koirat ok (ulkona)', labelKey: 'attr.dogs_outside', rank: 2 },
  // ── Lapset ──────────────────────────────────────────────────────
  has_childrens_menu: { emoji: '🧒', label: 'Lastenmenu', labelKey: 'attr.kids_menu', rank: 2 },
  has_high_chairs: { emoji: '🪑', label: 'Syöttötuolit', labelKey: 'attr.high_chairs', rank: 3 },
  has_kid_friendly_activities: { emoji: '🎈', label: 'Lapsille tekemistä', labelKey: 'attr.kids_activities', rank: 2 },
  has_discounts_for_kids: { emoji: '🎟', label: 'Lastenalennukset', labelKey: 'attr.kids_discounts', rank: 3 },
  has_changing_tables: { emoji: '🍼', label: 'Hoitopöytä', labelKey: 'attr.changing_table', rank: 3 },
  // ── Varaus / suunnittelu ────────────────────────────────────────
  recommends_reservations: { emoji: '📅', label: 'Varaus suositeltu', labelKey: 'attr.reservations_recommended', rank: 2 },
  recommends_reservations_dinner: { emoji: '📅', label: 'Varaus suositeltu', labelKey: 'attr.reservations_recommended', rank: 2 },
  recommends_reservations_brunch: { emoji: '📅', label: 'Varaus suositeltu', labelKey: 'attr.reservations_recommended', rank: 2 },
  accepts_reservations: { emoji: '📅', label: 'Varattavissa', labelKey: 'attr.accepts_reservations', rank: 2 },
  recommends_appointment: { emoji: '📅', label: 'Ajanvaraus suositeltu', labelKey: 'attr.appointment_recommended', rank: 2 },
  recommend_getting_tickets_ahead: { emoji: '🎫', label: 'Liput etukäteen', labelKey: 'attr.tickets_ahead', rank: 2 },
  usually_a_wait: { emoji: '⏳', label: 'Yleensä jonoa', labelKey: 'attr.usually_a_wait', rank: 2 },
  // ── Parkki ──────────────────────────────────────────────────────
  has_parking_lot_free: { emoji: '🅿️', label: 'Ilmainen parkki', labelKey: 'attr.free_parking', rank: 3 },
  has_parking_street_free: { emoji: '🅿️', label: 'Ilmainen parkki', labelKey: 'attr.free_parking', rank: 3 },
  has_parking_garage_free: { emoji: '🅿️', label: 'Ilmainen parkki', labelKey: 'attr.free_parking', rank: 3 },
  has_parking_lot_paid: { emoji: '🅿️', label: 'Maksullinen parkki', labelKey: 'attr.paid_parking', rank: 3 },
  has_parking_street_paid: { emoji: '🅿️', label: 'Maksullinen parkki', labelKey: 'attr.paid_parking', rank: 3 },
  has_parking_garage_paid: { emoji: '🅿️', label: 'Maksullinen parkki', labelKey: 'attr.paid_parking', rank: 3 },
  // ── Maksu ───────────────────────────────────────────────────────
  pay_credit_card: { emoji: '💳', label: 'Kortti käy', labelKey: 'attr.cards_accepted', rank: 3 },
  pay_debit_card: { emoji: '💳', label: 'Kortti käy', labelKey: 'attr.cards_accepted', rank: 3 },
  pay_mobile_nfc: { emoji: '📱', label: 'Lähimaksu', labelKey: 'attr.contactless_payment', rank: 3 },
  // ── Muut ────────────────────────────────────────────────────────
  has_admission_fee: { emoji: '🎫', label: 'Pääsymaksu', labelKey: 'attr.admission_fee', rank: 2 },
  // ── LISÄTTY 8/2026: mitattu 73 labeloimatonta avainta (2584 esiintymää),
  //    joista nämä ovat illan aikeita — juuri se mitä tapahtumasovelluksen
  //    kuuluu tarjota. Luvut ovat todellisia esiintymiä tuotannon datassa.
  has_all_you_can_eat_always:     { emoji: '🍽', label: 'Buffet', labelKey: 'attr.buffet', rank: 1 },          // 189
  has_counter_service:            { emoji: '🧾', label: 'Tiskiltä', labelKey: 'attr.counter_service', rank: 3 },        // 181
  has_bar_games:                  { emoji: '🎯', label: 'Pelejä', labelKey: 'attr.bar_games', rank: 1 },          // 127
  popular_with_students:          { emoji: '🎓', label: 'Opiskelijoiden suosiossa', labelKey: 'attr.popular_with_students', rank: 1 }, // 121
  has_salad_bar:                  { emoji: '🥗', label: 'Salaattibaari', labelKey: 'attr.salad_bar', rank: 1 },   // 120
  serves_organic:                 { emoji: '🌿', label: 'Luomua', labelKey: 'attr.organic', rank: 1 },          // 118
  serves_happy_hour_drinks:       { emoji: '🍻', label: 'Happy hour', labelKey: 'attr.happy_hour', rank: 1 },      // 117
  is_owned_by_women:              { emoji: '♀️', label: 'Naisten omistama', labelKey: 'attr.women_owned', rank: 2 }, // 87
  serves_food_at_bar:             { emoji: '🍽', label: 'Ruokaa baaritiskillä', labelKey: 'attr.food_at_bar', rank: 2 }, // 73
  suitable_for_working_on_laptop: { emoji: '💻', label: 'Sopii työskentelyyn', labelKey: 'attr.laptop_friendly', rank: 1 }, // 71
  serves_happy_hour_food:         { emoji: '🍟', label: 'Happy hour -ruokaa', labelKey: 'attr.happy_hour_food', rank: 1 }, // 60
  serves_healthy:                 { emoji: '🥦', label: 'Terveellistä', labelKey: 'attr.healthy', rank: 2 },    // 44
  has_seating_rooftop:            { emoji: '🏙', label: 'Kattoterassi', labelKey: 'attr.rooftop_seating', rank: 1 },    // 39
  requires_reservations:          { emoji: '📅', label: 'Varaus vaaditaan', labelKey: 'attr.reservations_required', rank: 2 }, // 39
  serves_halal_food:              { emoji: '☪️', label: 'Halal', labelKey: 'attr.halal', rank: 1 },            // 34
  has_dancing:                    { emoji: '💃', label: 'Tanssilattia', labelKey: 'attr.dance_floor', rank: 1 },    // 34
  has_trivia_night:               { emoji: '❓', label: 'Tietovisa', labelKey: 'attr.trivia_night', rank: 1 },        // 32
  has_fireplace:                  { emoji: '🔥', label: 'Takka', labelKey: 'attr.fireplace', rank: 1 },           // 32
  has_karaoke_nights:             { emoji: '🎤', label: 'Karaoke', labelKey: 'attr.karaoke', rank: 1 },         // 20
  quick_visit:                    { emoji: '⚡', label: 'Nopea käynti', labelKey: 'attr.quick_visit', rank: 2 },     // 17
  has_arcade_games:               { emoji: '🕹', label: 'Pelihalli', labelKey: 'attr.arcade_games', rank: 1 },       // 14
  allows_outside_food:            { emoji: '🥪', label: 'Omat eväät sallittu', labelKey: 'attr.outside_food_allowed', rank: 2 }, // 14
  // ── Legacy-aliakset (aktiviteettien vanha mappaus) — pidetään ettei
  //    yksikään aiemmin näytetty tagi katoa refaktoroinnissa ───────────
  has_bar: { emoji: '🍸', label: 'Baari', labelKey: 'attr.bar', rank: 2 },
  has_outdoor_seating: { emoji: '☀️', label: 'Terassi', labelKey: 'attr.outdoor_seating', rank: 1 },
  is_lgbtq_friendly: { emoji: '🏳️‍🌈', label: 'LGBTQ-ystävällinen', labelKey: 'attr.lgbtq_friendly', rank: 2 },
  allows_dogs: { emoji: '🐕', label: 'Koirat ok', labelKey: 'attr.dog_friendly', rank: 2 },
  has_parking: { emoji: '🅿️', label: 'Parkki', labelKey: 'attr.parking', rank: 3 },
  has_free_parking: { emoji: '🅿️', label: 'Ilmainen parkki', labelKey: 'attr.free_parking', rank: 3 },
  has_free_street_parking: { emoji: '🅿️', label: 'Ilmainen parkki', labelKey: 'attr.free_parking', rank: 3 },
  has_gender_neutral_restroom: { emoji: '🚻', label: 'Sukupuolineutraali WC', labelKey: 'attr.gender_neutral_restroom', rank: 3 },
}

// Poimi näytettävät attribuutit ryhmistä (litistetään + käännösavain + dedup +
// järjestetään arvon mukaan). Palautusmuoto on { emoji, label, labelKey }: label
// säilyy ennallaan, labelKey on LISÄYS, joten vanhat kutsupaikat kääntyvät
// muuttumattomina. Käännös tehdään kutsupaikassa (t(labelKey)) eikä täällä,
// jotta tämä moduuli pysyy irti i18n-ajonaikaisesta riippuvuudesta — sitä
// käytetään myös palvelimella, missä useLanguage-hookia ei ole.
export function pickAttributes(
  attrs: Record<string, string[]> | null,
  limit?: number,
): { emoji: string; label: string; labelKey: TranslationKey }[] {
  if (!attrs) return []
  type Picked = { emoji: string; label: string; labelKey: TranslationKey; rank: Rank; a11y?: true }
  const picked: Picked[] = []
  const byKey = new Map<TranslationKey, Picked>()
  for (const group of Object.values(attrs)) {
    // google_raw on validoimatonta JSONia — varmista taulukko ettei render kaadu
    for (const k of (Array.isArray(group) ? group : [])) {
      const m = ATTR_LABELS[k]
      if (!m) continue
      // dedup labelKeyn mukaan (esim. pay_credit_card + pay_debit_card =
      // 'attr.cards_accepted'). Aiemmin dedup tehtiin labelin mukaan; tulos on
      // sama, koska label ↔ labelKey on bijektio (123 riviä, 101 uniikkia
      // labelia, 101 uniikkia avainta, eikä kaksi eri labelia jaa avainta).
      // labelKey on silti oikeampi peruste: se on se mitä ruudulla renderöidään,
      // joten dedup osuu näkyvään tekstiin myös englanniksi.
      const prev = byKey.get(m.labelKey)
      if (!prev) {
        const entry = { ...m }
        byKey.set(m.labelKey, entry)
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
  const strip = (t: Picked) => ({ emoji: t.emoji, label: t.label, labelKey: t.labelKey })
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

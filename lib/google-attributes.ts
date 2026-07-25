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
export const ATTR_LABELS: Record<string, { emoji: string; label: string }> = {
  // ── Esteettömyys ────────────────────────────────────────────────
  has_wheelchair_accessible_entrance: { emoji: '♿', label: 'Esteetön sisäänkäynti' },
  has_wheelchair_accessible_restroom: { emoji: '♿', label: 'Esteetön WC' },
  has_wheelchair_accessible_seating: { emoji: '♿', label: 'Esteetön istumapaikka' },
  has_wheelchair_accessible_parking: { emoji: '♿', label: 'Esteetön parkki' },
  has_wheelchair_accessible_elevator: { emoji: '♿', label: 'Esteetön hissi' },
  has_hearing_loop: { emoji: '🦻', label: 'Induktiosilmukka' },
  has_assisted_listening_devices: { emoji: '🦻', label: 'Kuunteluapuvälineet' },
  // ── Tilat / mukavuudet ──────────────────────────────────────────
  has_restaurant: { emoji: '🍽', label: 'Ravintola' },
  has_cafe: { emoji: '☕', label: 'Kahvila' },
  has_bar_onsite: { emoji: '🍸', label: 'Baari' },
  has_wi_fi: { emoji: '📶', label: 'Wifi' },
  has_restroom: { emoji: '🚻', label: 'WC' },
  has_restroom_unisex: { emoji: '🚻', label: 'Unisex-WC' },
  has_seating: { emoji: '🪑', label: 'Istumapaikkoja' },
  has_seating_outdoors: { emoji: '☀️', label: 'Terassi' },
  has_sauna: { emoji: '🧖', label: 'Sauna' },
  has_gift_shop: { emoji: '🎁', label: 'Myymälä' },
  has_catering: { emoji: '🍱', label: 'Catering' },
  has_lactation_space: { emoji: '🍼', label: 'Imetystila' },
  has_live_performances: { emoji: '🎭', label: 'Esityksiä' },
  // ── Palveluvaihtoehdot ──────────────────────────────────────────
  serves_dine_in: { emoji: '🍽', label: 'Paikan päällä' },
  has_table_service: { emoji: '🧑‍🍳', label: 'Pöytiintarjoilu' },
  has_private_dining_room: { emoji: '🚪', label: 'Yksityistila' },
  has_takeout: { emoji: '🥡', label: 'Takeaway' },
  has_delivery: { emoji: '🛵', label: 'Kotiinkuljetus' },
  has_no_contact_delivery: { emoji: '🛵', label: 'Kontaktiton kuljetus' },
  has_curbside_pickup: { emoji: '🚗', label: 'Nouto autolle' },
  has_drive_through: { emoji: '🚗', label: 'Drive-in' },
  // ── Tarjonta (ruoka/juoma) ──────────────────────────────────────
  serves_alcohol: { emoji: '🍸', label: 'Alkoholia' },
  serves_liquor: { emoji: '🥃', label: 'Väkeviä' },
  serves_beer: { emoji: '🍺', label: 'Olutta' },
  serves_beer_notable: { emoji: '🍺', label: 'Olutta' },
  serves_wine: { emoji: '🍷', label: 'Viiniä' },
  serves_wine_notable: { emoji: '🍷', label: 'Viiniä' },
  serves_late_night_food: { emoji: '🌃', label: 'Yöruokaa' },
  serves_cocktails: { emoji: '🍸', label: 'Cocktaileja' },
  serves_cocktails_notable: { emoji: '🍸', label: 'Cocktaileja' },
  serves_coffee: { emoji: '☕', label: 'Kahvia' },
  serves_coffee_notable: { emoji: '☕', label: 'Kahvia' },
  serves_tea_notable: { emoji: '🍵', label: 'Teetä' },
  serves_dessert: { emoji: '🍰', label: 'Jälkiruokia' },
  serves_dessert_notable: { emoji: '🍰', label: 'Jälkiruokia' },
  serves_small_plates: { emoji: '🍢', label: 'Pieniä annoksia' },
  serves_vegetarian: { emoji: '🥗', label: 'Kasvisruokaa' },
  serves_vegan: { emoji: '🌱', label: 'Vegaaniruokaa' },
  serves_breakfast: { emoji: '🍳', label: 'Aamiaista' },
  serves_breakfast_popular: { emoji: '🍳', label: 'Aamiaista' },
  serves_brunch: { emoji: '🥐', label: 'Brunssia' },
  serves_lunch: { emoji: '🍴', label: 'Lounasta' },
  serves_lunch_popular: { emoji: '🍴', label: 'Lounasta' },
  serves_dinner: { emoji: '🌙', label: 'Illallista' },
  serves_dinner_popular: { emoji: '🌙', label: 'Illallista' },
  // ── Suosittu / käyttötapa ───────────────────────────────────────
  quick_bite: { emoji: '⚡', label: 'Pikapala' },
  // ── Tunnelma (feels_*) ──────────────────────────────────────────
  feels_casual: { emoji: '👕', label: 'Rento' },
  feels_cozy: { emoji: '🛋', label: 'Viihtyisä' },
  feels_quiet: { emoji: '🤫', label: 'Rauhallinen' },
  feels_historic: { emoji: '🏛', label: 'Historiallinen' },
  feels_upscale: { emoji: '🥂', label: 'Fiini' },
  feels_hip: { emoji: '✨', label: 'Trendikäs' },
  feels_romantic: { emoji: '💕', label: 'Romanttinen' },
  suitable_for_watching_sports: { emoji: '📺', label: 'Urheilua' },
  has_live_music: { emoji: '🎵', label: 'Live-musiikkia' },
  // ── Yleisö ──────────────────────────────────────────────────────
  welcomes_families: { emoji: '👨‍👩‍👧', label: 'Perheystävällinen' },
  welcomes_children: { emoji: '👶', label: 'Lapsille sopiva' },
  welcomes_lgbtq: { emoji: '🏳️‍🌈', label: 'LGBTQ-ystävällinen' },
  is_transgender_safespace: { emoji: '🏳️‍⚧️', label: 'Transturvallinen' },
  suitable_for_groups: { emoji: '👥', label: 'Ryhmille' },
  suitable_for_solo_dining: { emoji: '🧍', label: 'Sopii yksin' },
  welcomes_dogs: { emoji: '🐕', label: 'Koirat ok' },
  allows_dogs_inside: { emoji: '🐕', label: 'Koirat ok' },
  allows_dogs_outside: { emoji: '🐕', label: 'Koirat ok (ulkona)' },
  // ── Lapset ──────────────────────────────────────────────────────
  has_childrens_menu: { emoji: '🧒', label: 'Lastenmenu' },
  has_high_chairs: { emoji: '🪑', label: 'Syöttötuolit' },
  has_kid_friendly_activities: { emoji: '🎈', label: 'Lapsille tekemistä' },
  has_discounts_for_kids: { emoji: '🎟', label: 'Lastenalennukset' },
  has_changing_tables: { emoji: '🍼', label: 'Hoitopöytä' },
  // ── Varaus / suunnittelu ────────────────────────────────────────
  recommends_reservations: { emoji: '📅', label: 'Varaus suositeltu' },
  recommends_reservations_dinner: { emoji: '📅', label: 'Varaus suositeltu' },
  recommends_reservations_brunch: { emoji: '📅', label: 'Varaus suositeltu' },
  accepts_reservations: { emoji: '📅', label: 'Varattavissa' },
  recommends_appointment: { emoji: '📅', label: 'Ajanvaraus suositeltu' },
  recommend_getting_tickets_ahead: { emoji: '🎫', label: 'Liput etukäteen' },
  usually_a_wait: { emoji: '⏳', label: 'Yleensä jonoa' },
  // ── Parkki ──────────────────────────────────────────────────────
  has_parking_lot_free: { emoji: '🅿️', label: 'Ilmainen parkki' },
  has_parking_street_free: { emoji: '🅿️', label: 'Ilmainen parkki' },
  has_parking_garage_free: { emoji: '🅿️', label: 'Ilmainen parkki' },
  has_parking_lot_paid: { emoji: '🅿️', label: 'Maksullinen parkki' },
  has_parking_street_paid: { emoji: '🅿️', label: 'Maksullinen parkki' },
  has_parking_garage_paid: { emoji: '🅿️', label: 'Maksullinen parkki' },
  // ── Maksu ───────────────────────────────────────────────────────
  pay_credit_card: { emoji: '💳', label: 'Kortti käy' },
  pay_debit_card: { emoji: '💳', label: 'Kortti käy' },
  pay_mobile_nfc: { emoji: '📱', label: 'Lähimaksu' },
  // ── Muut ────────────────────────────────────────────────────────
  has_admission_fee: { emoji: '🎫', label: 'Pääsymaksu' },
  // ── Legacy-aliakset (aktiviteettien vanha mappaus) — pidetään ettei
  //    yksikään aiemmin näytetty tagi katoa refaktoroinnissa ───────────
  has_bar: { emoji: '🍸', label: 'Baari' },
  has_outdoor_seating: { emoji: '☀️', label: 'Terassi' },
  is_lgbtq_friendly: { emoji: '🏳️‍🌈', label: 'LGBTQ-ystävällinen' },
  allows_dogs: { emoji: '🐕', label: 'Koirat ok' },
  has_parking: { emoji: '🅿️', label: 'Parkki' },
  has_free_parking: { emoji: '🅿️', label: 'Ilmainen parkki' },
  has_free_street_parking: { emoji: '🅿️', label: 'Ilmainen parkki' },
  has_gender_neutral_restroom: { emoji: '🚻', label: 'Sukupuolineutraali WC' },
}

// Poimi näytettävät attribuutit ryhmistä (litistetään + suomennetaan + dedup).
export function pickAttributes(attrs: Record<string, string[]> | null): { emoji: string; label: string }[] {
  if (!attrs) return []
  const out: { emoji: string; label: string }[] = []
  const seen = new Set<string>()
  for (const group of Object.values(attrs)) {
    // google_raw on validoimatonta JSONia — varmista taulukko ettei render kaadu
    for (const k of (Array.isArray(group) ? group : [])) {
      const m = ATTR_LABELS[k]
      // dedup labelin mukaan (esim. pay_credit_card + pay_debit_card = "Kortti käy")
      if (m && !seen.has(m.label)) { seen.add(m.label); out.push(m) }
    }
  }
  return out
}

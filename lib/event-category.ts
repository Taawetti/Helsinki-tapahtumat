// Julistekortin yläteksti ja emoji tapahtuman kategorioista.
//
// MIKSI. Kortin yläteksti oli event.categories[0] eli lähteen oma merkkijono, ja
// se on suomea myös englanninkielisessä käyttöliittymässä. Sitä ei voi kääntää
// lähteestä: mitattu 25.8.2026 LinkedEventsin otoksesta (100 tapahtumaa), vain
// 6 %:lla on name.en ja 4 %:lla se poikkeaa suomalaisesta — ja niissä name.fi on
// tyhjä. Kategoriasanasto on lisäksi pitkähäntäinen (viikon aineistossa 59 eri
// ensimmäistä kategoriaa) ja osa arvoista ei ole kategorioita lainkaan vaan
// kaupunginosien nimiä ('Kivenlahti') tai hallintotermejä ('osallistuminen').
//
// Siksi englanninkielinen teksti JOHDETAAN samasta avainsanaketjusta joka valitsee
// emojin — ei käännetä arvausta arvaukselta. Suomeksi näytetään edelleen lähteen
// oma kategoria sellaisenaan, joten suomenkielinen ulosanti ei muutu.
//
// EMOJIKETJU ON SÄILYTETTÄVÄ ENNALLAAN. Järjestys ja osumaehdot ovat samat kuin
// PosterCardin aiemmassa getCategoryEmoji-funktiossa, jotta yhdenkään kortin
// emoji ei vaihdu. Uudet säännöt (työpaja, keskustelu, opastus, hyvinvointi) on
// lisätty vasta ketjun LOPPUUN ja ne käyttävät oletusemojia '✨', joten ne eivät
// voi muuttaa aiemmin osuneiden korttien ulkoasua.

import type { TranslationKey } from './i18n'

export interface EventCategoryTag {
  emoji: string
  /** Yläteksti englanniksi. Suomeksi käytetään lähteen omaa kategoriaa. */
  tKey: TranslationKey
}

const CHAIN: { any: string[]; emoji: string; tKey: TranslationKey }[] = [
  { any: ['rock', 'metal', 'punk'],                          emoji: '🎸', tKey: 'legend.concert' },
  { any: ['jazz', 'blues'],                                  emoji: '🎷', tKey: 'evcat.jazz' },
  { any: ['klassinen', 'ooppera', 'baleetti'],               emoji: '🎻', tKey: 'evcat.classical' },
  { any: ['musiikki', 'konsertti', 'keikka'],                emoji: '🎵', tKey: 'evcat.music' },
  { any: ['stand-up', 'komedia', 'huumori'],                 emoji: '🎤', tKey: 'evcat.standup' },
  { any: ['teatteri', 'näytelmä', 'sirkus'],                 emoji: '🎭', tKey: 'legend.theatre' },
  { any: ['elokuv'],                                         emoji: '🎬', tKey: 'evcat.film' },
  { any: ['tanssi'],                                         emoji: '💃', tKey: 'evcat.dance' },
  { any: ['urheilu', 'liikunta', 'jääkiekko', 'jalkapallo'], emoji: '⚽', tKey: 'legend.sport' },
  { any: ['lapset', 'perhe'],                                emoji: '🎠', tKey: 'evcat.kids' },
  { any: ['ruoka', 'juoma', 'viini'],                        emoji: '🍷', tKey: 'evcat.food' },
  { any: ['festivaali', 'juhla'],                            emoji: '🎪', tKey: 'legend.festival' },
  { any: ['taide', 'galleria', 'kuvataide'],                 emoji: '🎨', tKey: 'legend.art' },
  { any: ['klubit', 'yöelämä', 'dj'],                        emoji: '🎧', tKey: 'legend.nightlife' },
  { any: ['kirjallisuus', 'kirja', 'runous'],                emoji: '📖', tKey: 'evcat.literature' },
  { any: ['ulkoilu', 'luonto'],                              emoji: '🌿', tKey: 'evcat.outdoors' },
  { any: ['pubivisa', 'visa', 'tietokilpailu'],              emoji: '🧠', tKey: 'evcat.quiz' },
  { any: ['karaoke'],                                        emoji: '🎤', tKey: 'evcat.karaoke' },
  // Tästä alaspäin: ketjun laajennus. KAIKKI käyttävät oletusemojia '✨', joten
  // yhdenkään kortin emoji ei voi muuttua — vain englanninkielinen teksti paranee.
  //
  // Yläosan säännöt osuvat vain perusmuotoon, ja lähdedata on enimmäkseen
  // monikossa: mitattu viikon aineistosta 25.8.2026, esim. 'Keikat ja konsertit'
  // ei sisällä sanaa 'keikka' eikä 'konsertti', joten se putosi oletukseen.
  // Nämä säännöt osuvat vartaloon ja kattavat taivutusmuodot.
  { any: ['keik', 'konsert', 'musiik'],                      emoji: '✨', tKey: 'evcat.music' },
  { any: ['näyttely', 'museo'],                              emoji: '✨', tKey: 'legend.exhibition' },
  { any: ['työpaja', 'kurssi'],                              emoji: '✨', tKey: 'evcat.workshop' },
  { any: ['keskustelu', 'luento'],                           emoji: '✨', tKey: 'evcat.talk' },
  { any: ['opastus', 'kierros'],                             emoji: '✨', tKey: 'evcat.tour' },
  { any: ['hyvinvointi'],                                    emoji: '✨', tKey: 'evcat.wellbeing' },
  { any: ['klubi'],                                          emoji: '✨', tKey: 'legend.nightlife' },
  { any: ['baari'],                                          emoji: '✨', tKey: 'legend.bar' },
  { any: ['lasten', 'leikki'],                               emoji: '✨', tKey: 'evcat.kids' },
  { any: ['kulttuuri'],                                      emoji: '✨', tKey: 'evcat.culture' },
]

const FALLBACK: EventCategoryTag = { emoji: '✨', tKey: 'common.event_default' }

export function classifyEventCategory(categories: string[]): EventCategoryTag {
  const s = categories.join(' ').toLowerCase()
  for (const rule of CHAIN) {
    if (rule.any.some((needle) => s.includes(needle))) return { emoji: rule.emoji, tKey: rule.tKey }
  }
  return FALLBACK
}

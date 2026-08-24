import type { GroupWhen, BudgetId, SceneId } from '@/lib/candidate'
import type { GroupMode } from '@/lib/group'

// Teemakaari-preset: valmis kaava, joka TÄYTTÄÄ luontilomakkeen yhdellä
// napilla — käyttäjä valitsee itse päivän (tai muuttaa mitä tahansa) ennen
// kuin sessio luodaan. Arvot vastaavat luontilomakkeen kenttiä.
export interface ThemeArcPreset {
  when: GroupWhen
  scenes: SceneId[]
  budget: BudgetId
}

export interface ThemeArc {
  id: string
  emoji: string
  name: string
  desc: string
  gradient: string
  preset: ThemeArcPreset
}

export const ARCS: ThemeArc[] = [
  {
    id: 'sauna-keikka',
    emoji: '🧖🍽🎸',
    name: 'Sauna, sapuska & keikka',
    desc: 'Koko illan klassikko kolmessa vaiheessa',
    gradient: 'linear-gradient(150deg,#ff8a5c,#d63b6e)',
    preset: { when: 'tonight', scenes: ['sauna', 'ruoka', 'keikka'], budget: 'any' },
  },
  {
    id: 'taide-viini',
    emoji: '🎨🍷',
    name: 'Taidetta ja viiniä',
    desc: 'Näyttely tai teatteri + lasillinen päälle',
    gradient: 'linear-gradient(150deg,#a855f7,#6d28d9)',
    preset: { when: 'tonight', scenes: ['kulttuuri', 'baarit'], budget: 'ee' },
  },
  {
    id: 'nollabudjetti',
    emoji: '🆓',
    name: 'Nollabudjetti',
    desc: 'Vain ilmaisia juttuja',
    gradient: 'linear-gradient(150deg,#2dd4bf,#0d9488)',
    preset: { when: 'tonight', scenes: ['ilmaista'], budget: 'free' },
  },
  {
    id: 'lapset',
    emoji: '👨‍👩‍👧',
    name: 'Lapset mukana',
    desc: 'Perheohjelmaa ja ruokaa päivänvalossa',
    gradient: 'linear-gradient(150deg,#38bdf8,#2563eb)',
    preset: { when: 'day', scenes: ['perhe', 'ruoka'], budget: 'any' },
  },
  {
    id: 'baariretki',
    emoji: '🍻',
    name: 'Baariretki',
    desc: 'Hyvät baarit ja live-ilta samassa kaaressa',
    gradient: 'linear-gradient(150deg,#fbbf24,#d97706)',
    preset: { when: 'tonight', scenes: ['baarit', 'keikka'], budget: 'any' },
  },
  {
    id: 'ulkoilu',
    emoji: '🌳',
    name: 'Ulkoilupäivä',
    desc: 'Ulkokohteet + sapuska',
    gradient: 'linear-gradient(150deg,#84cc16,#4d7c0f)',
    preset: { when: 'weekend', scenes: ['ulkona', 'ruoka'], budget: 'any' },
  },
]

'use client'

import type { GroupWhen, BudgetId, SceneId } from '@/lib/candidate'
import type { GroupMode } from '@/lib/group'

// Teemakaari-preset: valmis kaava, jolla ryhmäpäätössessio luodaan yhdellä
// napilla ilman lomakkeen konfigurointia. Arvot vastaavat luontilomakkeen kenttiä.
export interface ThemeArcPreset {
  mode: GroupMode
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

const ARCS: ThemeArc[] = [
  {
    id: 'sauna-keikka',
    emoji: '🧖🍽🎸',
    name: 'Sauna, sapuska & keikka',
    desc: 'Koko illan klassikko kolmessa vaiheessa',
    gradient: 'linear-gradient(150deg,#ff8a5c,#d63b6e)',
    preset: { mode: 'arc', when: 'tonight', scenes: ['sauna', 'ruoka', 'keikka'], budget: 'any' },
  },
  {
    id: 'taide-viini',
    emoji: '🎨🍷',
    name: 'Taidetta ja viiniä',
    desc: 'Näyttely tai teatteri + lasillinen päälle',
    gradient: 'linear-gradient(150deg,#a855f7,#6d28d9)',
    preset: { mode: 'arc', when: 'tonight', scenes: ['kulttuuri', 'baarit'], budget: 'ee' },
  },
  {
    id: 'nollabudjetti',
    emoji: '🆓',
    name: 'Nollabudjetti',
    desc: 'Vain ilmaisia juttuja tänä iltana',
    gradient: 'linear-gradient(150deg,#2dd4bf,#0d9488)',
    preset: { mode: 'arc', when: 'tonight', scenes: ['ilmaista'], budget: 'free' },
  },
  {
    id: 'lapset',
    emoji: '👨‍👩‍👧',
    name: 'Lapset mukana',
    desc: 'Perheohjelmaa ja ruokaa päivänvalossa',
    gradient: 'linear-gradient(150deg,#38bdf8,#2563eb)',
    preset: { mode: 'arc', when: 'day', scenes: ['perhe', 'ruoka'], budget: 'any' },
  },
  {
    id: 'baariretki',
    emoji: '🍻',
    name: 'Baariretki',
    desc: 'Hyvät baarit ja live-ilta samassa kaaressa',
    gradient: 'linear-gradient(150deg,#fbbf24,#d97706)',
    preset: { mode: 'arc', when: 'tonight', scenes: ['baarit', 'keikka'], budget: 'any' },
  },
  {
    id: 'ulkoilu',
    emoji: '🌳',
    name: 'Ulkoilupäivä',
    desc: 'Viikonlopun ulkokohteet + sapuska',
    gradient: 'linear-gradient(150deg,#84cc16,#4d7c0f)',
    preset: { mode: 'arc', when: 'weekend', scenes: ['ulkona', 'ruoka'], budget: 'any' },
  },
]

export default function ThemeArcs({ launchingId, onLaunch }: {
  launchingId: string | null
  onLaunch: (arc: ThemeArc) => void
}) {
  const busy = launchingId !== null
  return (
    <section>
      <h2 className="text-white/70 text-[13px] font-black uppercase tracking-wide mb-1">Valmis kaava</h2>
      <p className="text-white/40 text-[12px] font-semibold mb-3">Yksi nappi ja porukka swaippaa — ei säätöä.</p>
      <div className="grid grid-cols-2 gap-2">
        {ARCS.map(arc => {
          const launching = launchingId === arc.id
          return (
            <button key={arc.id} onClick={() => onLaunch(arc)} disabled={busy}
              className="relative flex flex-col items-start gap-1 rounded-2xl p-4 text-left transition-all active:scale-[.97] disabled:opacity-60"
              style={{ background: arc.gradient, boxShadow: '0 10px 24px -12px rgba(0,0,0,.55)' }}>
              {launching && (
                <span className="absolute right-3 top-3 h-4 w-4 rounded-full border-2 border-white/40 border-t-white animate-spin" />
              )}
              <span className="text-2xl leading-none">{arc.emoji}</span>
              <span className="text-[13.5px] font-black text-white leading-tight">{arc.name}</span>
              <span className="text-[11px] font-semibold leading-snug text-white/75">
                {launching ? 'Luodaan sessiota…' : arc.desc}
              </span>
            </button>
          )
        })}
      </div>
    </section>
  )
}

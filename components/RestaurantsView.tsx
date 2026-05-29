'use client'

import { useState, useEffect, useMemo } from 'react'
import { Search, MapPin, Globe, Phone, X, ChevronDown } from 'lucide-react'
import type { Restaurant } from '@/lib/types'

const TYPE_OPTIONS = [
  { id: 'all',       label: 'Kaikki'       },
  { id: 'ravintola', label: '🍽 Ravintolat' },
  { id: 'kahvila',   label: '☕ Kahvilat'   },
  { id: 'baari',     label: '🍺 Baarit'     },
  { id: 'pikaruoka', label: '🍔 Pikaruoka'  },
] as const

type TypeFilter = (typeof TYPE_OPTIONS)[number]['id']

const PAGE_SIZE = 48

function typeStyle(type: Restaurant['type']) {
  switch (type) {
    case 'ravintola': return { cls: 'bg-amber-500/15 text-amber-300/80',   label: 'Ravintola' }
    case 'kahvila':   return { cls: 'bg-emerald-500/15 text-emerald-300/80', label: 'Kahvila'   }
    case 'baari':     return { cls: 'bg-fuchsia-500/15 text-fuchsia-300/80', label: 'Baari'     }
    case 'pikaruoka': return { cls: 'bg-orange-500/15 text-orange-300/80',   label: 'Pikaruoka' }
    default:          return { cls: 'bg-white/8 text-white/35',              label: 'Paikka'    }
  }
}

function RestaurantCard({ r }: { r: Restaurant }) {
  const { cls, label } = typeStyle(r.type)
  return (
    <div className="rounded-2xl border border-white/6 overflow-hidden bg-white/3 hover:bg-white/5 transition-colors">
      {r.image && (
        <div className="relative w-full overflow-hidden" style={{ aspectRatio: '16/8' }}>
          <img src={r.image} alt={r.name} className="w-full h-full object-cover" loading="lazy" />
          <div className="absolute inset-0" style={{ background: 'linear-gradient(to top,rgba(8,8,12,0.5) 0%,transparent 60%)' }} />
        </div>
      )}
      <div className="p-4 space-y-2">
        <div className="flex items-start justify-between gap-2">
          <h3 className="font-bold text-white text-sm leading-tight">{r.name}</h3>
          <span className={`shrink-0 text-[10px] font-black px-2 py-0.5 rounded-full ${cls}`}>{label}</span>
        </div>
        {r.description && (
          <p className="text-white/40 text-xs capitalize">{r.description}</p>
        )}
        {r.address && (
          <div className="flex items-center gap-1.5 text-white/30 text-xs">
            <MapPin size={10} className="shrink-0" />
            <span>{r.address}{r.city && r.city !== 'Helsinki' ? `, ${r.city}` : ''}</span>
          </div>
        )}
        {(r.www || r.phone) && (
          <div className="flex items-center gap-3 pt-0.5">
            {r.www && (
              <a href={r.www} target="_blank" rel="noopener noreferrer"
                className="flex items-center gap-1 text-[10px] font-bold text-purple-400/70 hover:text-purple-300 transition-colors">
                <Globe size={10} /> Nettisivu
              </a>
            )}
            {r.phone && (
              <a href={`tel:${r.phone}`}
                className="flex items-center gap-1 text-[10px] font-bold text-white/30 hover:text-white/60 transition-colors">
                <Phone size={10} /> {r.phone}
              </a>
            )}
          </div>
        )}
      </div>
    </div>
  )
}

export default function RestaurantsView() {
  const [restaurants, setRestaurants] = useState<Restaurant[]>([])
  const [total, setTotal] = useState(0)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [search, setSearch] = useState('')
  const [typeFilter, setTypeFilter] = useState<TypeFilter>('all')
  const [shown, setShown] = useState(PAGE_SIZE)

  useEffect(() => {
    setLoading(true)
    fetch('/api/restaurants')
      .then(r => r.json())
      .then(data => {
        setRestaurants(data.restaurants ?? [])
        setTotal(data.total ?? 0)
        setError('')
      })
      .catch(() => setError('Ravintoloiden lataus epäonnistui'))
      .finally(() => setLoading(false))
  }, [])

  // Reset pagination when filters change
  useEffect(() => { setShown(PAGE_SIZE) }, [search, typeFilter])

  const filtered = useMemo(() => {
    let result = restaurants
    if (typeFilter !== 'all') result = result.filter(r => r.type === typeFilter)
    if (search.trim()) {
      const q = search.toLowerCase()
      result = result.filter(r =>
        r.name.toLowerCase().includes(q) ||
        r.address.toLowerCase().includes(q) ||
        r.description.toLowerCase().includes(q)
      )
    }
    return result
  }, [restaurants, typeFilter, search])

  const visible = filtered.slice(0, shown)
  const hasMore = shown < filtered.length

  return (
    <main className="max-w-6xl mx-auto px-4 pt-5 pb-20 space-y-5">

      {/* Heading */}
      <div>
        <h1 className="font-black text-white leading-none select-none"
          style={{ fontSize: 'clamp(2rem,8vw,4rem)', letterSpacing: '-0.03em' }}>
          Ravintolat
        </h1>
        <p className="text-white/25 text-sm mt-1">Helsinki-alue — ravintolat, kahvilat ja baarit</p>
      </div>

      {/* Search */}
      <div className="relative">
        <Search size={15} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-white/25 pointer-events-none" />
        <input
          type="search"
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder="Hae nimellä, osoitteella tai keittiötyylillä…"
          className="w-full pl-9 pr-9 py-3 bg-white/5 border border-white/8 rounded-xl text-sm text-white placeholder-white/20 focus:outline-none focus:border-purple-500/40 transition-colors"
        />
        {search && (
          <button onClick={() => setSearch('')} className="absolute right-3 top-1/2 -translate-y-1/2 text-white/30 hover:text-white/60">
            <X size={14} />
          </button>
        )}
      </div>

      {/* Type filter */}
      <div className="flex gap-2 overflow-x-auto scrollbar-none -mx-4 px-4">
        {TYPE_OPTIONS.map(opt => (
          <button key={opt.id} onClick={() => setTypeFilter(opt.id)}
            className={`shrink-0 px-4 py-2 rounded-full text-sm font-black transition-all ${
              typeFilter === opt.id
                ? 'text-white shadow-lg shadow-purple-500/20'
                : 'text-white/35 bg-white/5 hover:bg-white/8 hover:text-white/65'
            }`}
            style={typeFilter === opt.id ? { background: 'linear-gradient(135deg,#a855f7,#ec4899)' } : {}}>
            {opt.label}
          </button>
        ))}
      </div>

      {/* Count */}
      {!loading && !error && (
        <p className="text-white/20 text-xs font-bold">
          {loading ? '' : `${filtered.length.toLocaleString('fi-FI')} paikkaa`}
          {!loading && !search && typeFilter === 'all' && total > 0 && (
            <span className="text-white/12"> ({total.toLocaleString('fi-FI')} yhteensä)</span>
          )}
        </p>
      )}

      {/* Loading skeletons */}
      {loading && (
        <div className="space-y-5">
          <div className="flex items-center gap-3 text-white/30 text-sm">
            <div className="w-4 h-4 rounded-full border-2 border-purple-500/40 border-t-purple-400 animate-spin shrink-0" />
            <span>Haetaan ravintoloita kartalta… Hetken kärsivällisyyttä.</span>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {Array.from({ length: 12 }).map((_, i) => (
              <div key={i} className="rounded-2xl overflow-hidden bg-white/3">
                <div className="h-24 bg-white/4 animate-pulse" />
                <div className="p-4 space-y-2">
                  <div className="h-4 bg-white/4 rounded animate-pulse w-4/5" />
                  <div className="h-3 bg-white/4 rounded animate-pulse w-1/2" />
                  <div className="h-3 bg-white/3 rounded animate-pulse w-3/4" />
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Error */}
      {error && (
        <div className="rounded-xl p-4 bg-red-950/30 border border-red-800/30 text-red-300 text-sm">{error}</div>
      )}

      {/* Grid */}
      {!loading && visible.length > 0 && (
        <>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {visible.map(r => <RestaurantCard key={r.id} r={r} />)}
          </div>

          {hasMore && (
            <div className="flex justify-center pt-2">
              <button
                onClick={() => setShown(s => s + PAGE_SIZE)}
                className="flex items-center gap-2 text-sm font-bold px-8 py-3 rounded-xl border border-white/10 text-white/45 hover:text-white hover:border-white/20 bg-white/3 transition-all">
                <ChevronDown size={15} />
                Lataa lisää ({filtered.length - shown} jäljellä)
              </button>
            </div>
          )}
        </>
      )}

      {/* Empty */}
      {!loading && !error && filtered.length === 0 && (
        <div className="flex flex-col items-center py-24 text-center gap-4">
          <span className="text-5xl">🍽</span>
          <div>
            <p className="text-white/50 font-bold">Ei tuloksia</p>
            <p className="text-white/25 text-sm mt-1">Kokeile eri hakusanaa tai tyhjennä suodattimet</p>
          </div>
          {(search || typeFilter !== 'all') && (
            <button onClick={() => { setSearch(''); setTypeFilter('all') }}
              className="text-sm font-bold px-4 py-2 rounded-xl border border-purple-500/30 text-purple-400/70 hover:text-purple-300 hover:border-purple-500/50 transition-all">
              Tyhjennä suodattimet
            </button>
          )}
        </div>
      )}
    </main>
  )
}

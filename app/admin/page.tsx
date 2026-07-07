'use client'

import { useState, useEffect, useCallback, useRef } from 'react'
import { useRouter } from 'next/navigation'

// ── Festivals ────────────────────────────────────────────────────────────────

interface Festival {
  id: string
  name: string
  shortName: string
  startDate: string
  endDate: string
  time: string
  venueName: string
  address: string
  city: string
  ticketUrl: string
  infoUrl: string
  image: string | null
  categories: string[]
  isFree: boolean
  description: string
  active: boolean
}

const EMPTY_FESTIVAL: Omit<Festival, 'id'> = {
  name: '', shortName: '', startDate: '', endDate: '', time: '12:00',
  venueName: '', address: '', city: 'Helsinki', ticketUrl: '', infoUrl: '',
  image: null, categories: [], isFree: false, description: '', active: true,
}

function festivalFromDb(row: Record<string, unknown>): Festival {
  return {
    id: row.id as string,
    name: row.name as string,
    shortName: row.short_name as string,
    startDate: row.start_date as string,
    endDate: row.end_date as string,
    time: row.time as string,
    venueName: row.venue_name as string,
    address: row.address as string,
    city: row.city as string,
    ticketUrl: row.ticket_url as string,
    infoUrl: row.info_url as string,
    image: row.image as string | null,
    categories: row.categories as string[],
    isFree: row.is_free as boolean,
    description: row.description as string,
    active: row.active as boolean,
  }
}

// ── Recurring events ─────────────────────────────────────────────────────────

interface RecurringEvent {
  id: string
  title: string
  shortDescription: string
  venue: string
  address: string
  lat: number | null
  lon: number | null
  weekday: number
  startHour: number
  startMinute: number
  durationMinutes: number
  isFree: boolean
  price: string
  ticketUrl: string
  infoUrl: string
  categories: string[]
  activeMonths: string
  active: boolean
}

const EMPTY_RECURRING: Omit<RecurringEvent, 'id'> = {
  title: '', shortDescription: '', venue: '', address: '',
  lat: null, lon: null, weekday: 1, startHour: 19, startMinute: 0,
  durationMinutes: 120, isFree: true, price: '', ticketUrl: '', infoUrl: '',
  categories: [], activeMonths: '', active: true,
}

const WEEKDAYS = ['Sunnuntai', 'Maanantai', 'Tiistai', 'Keskiviikko', 'Torstai', 'Perjantai', 'Lauantai']

function recurringFromDb(row: Record<string, unknown>): RecurringEvent {
  return {
    id: row.id as string,
    title: row.title as string,
    shortDescription: row.short_description as string,
    venue: row.venue as string,
    address: row.address as string,
    lat: row.lat as number | null,
    lon: row.lon as number | null,
    weekday: row.weekday as number,
    startHour: row.start_hour as number,
    startMinute: row.start_minute as number,
    durationMinutes: row.duration_minutes as number,
    isFree: row.is_free as boolean,
    price: (row.price as string) ?? '',
    ticketUrl: (row.ticket_url as string) ?? '',
    infoUrl: (row.info_url as string) ?? '',
    categories: row.categories as string[],
    activeMonths: Array.isArray(row.active_months) ? (row.active_months as number[]).join(', ') : '',
    active: row.active as boolean,
  }
}

// ── Main component ────────────────────────────────────────────────────────────

type Tab = 'festivals' | 'recurring'

export default function AdminPage() {
  const router = useRouter()
  const [tab, setTab] = useState<Tab>('festivals')
  const [refreshing, setRefreshing] = useState(false)
  const [refreshResult, setRefreshResult] = useState('')
  const [enriching, setEnriching] = useState(false)
  const [enrichResult, setEnrichResult] = useState('')
  const enrichStopRef = useRef(false)
  const [enrichingSubs, setEnrichingSubs] = useState(false)
  const [enrichSubsResult, setEnrichSubsResult] = useState('')
  const enrichSubsStopRef = useRef(false)
  const [enrichingImages, setEnrichingImages] = useState(false)
  const [enrichImagesResult, setEnrichImagesResult] = useState('')
  const enrichImagesStopRef = useRef(false)
  const [imageSamples, setImageSamples] = useState<{ name: string; image: string }[]>([])
  const imageTestDoneRef = useRef(false)
  const [enrichingActivityImages, setEnrichingActivityImages] = useState(false)
  const [enrichActivityImagesResult, setEnrichActivityImagesResult] = useState('')
  const enrichActivityImagesStopRef = useRef(false)
  const activityImageTestDoneRef = useRef(false)

  async function handleLogout() {
    await fetch('/api/admin/auth', { method: 'DELETE' })
    router.push('/admin/login')
  }

  async function handleEnrichRestaurants() {
    if (enriching) { enrichStopRef.current = true; return }
    setEnriching(true)
    enrichStopRef.current = false
    setEnrichResult('Aloitetaan...')
    let totalProcessed = 0
    let totalEnriched = 0

    while (!enrichStopRef.current) {
      const res = await fetch('/api/admin/enrich-restaurant-cuisines', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ limit: 50 }),
      })
      const data = await res.json()
      if (data.error) { setEnrichResult('Virhe: ' + data.error); break }

      totalProcessed += data.processed
      totalEnriched += data.enriched
      setEnrichResult(`Käsitelty ${totalProcessed} • Kategoria löytyi ${totalEnriched} • Jäljellä ${data.remaining}`)

      if (data.remaining === 0 || data.processed === 0) {
        setEnrichResult(`✓ Valmis — käsitelty ${totalProcessed}, kategoria ${totalEnriched}:lle`)
        break
      }
    }
    setEnriching(false)
  }

  async function handleEnrichSubcategories() {
    if (enrichingSubs) { enrichSubsStopRef.current = true; return }
    setEnrichingSubs(true)
    enrichSubsStopRef.current = false
    setEnrichSubsResult('Aloitetaan...')
    let totalProcessed = 0
    let totalEnriched = 0

    while (!enrichSubsStopRef.current) {
      const res = await fetch('/api/admin/enrich-subcategories', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ limit: 150 }),
      })
      const data = await res.json()
      if (data.error) { setEnrichSubsResult('Virhe: ' + data.error); break }

      totalProcessed += data.processed
      totalEnriched += data.enriched
      setEnrichSubsResult(`Käsitelty ${totalProcessed} • Kategorioitu ${totalEnriched} • Jäljellä ${data.remaining}`)

      if (data.remaining === 0 || data.processed === 0) {
        setEnrichSubsResult(`✓ Valmis — käsitelty ${totalProcessed}, kategorioitu ${totalEnriched}:lle`)
        break
      }
    }
    setEnrichingSubs(false)
  }

  async function handleEnrichActivityImages() {
    if (enrichingActivityImages) { enrichActivityImagesStopRef.current = true; return }
    setEnrichingActivityImages(true)
    enrichActivityImagesStopRef.current = false
    setEnrichActivityImagesResult('Aloitetaan...')
    let totalProcessed = 0
    let totalUpdated = 0

    while (!enrichActivityImagesStopRef.current) {
      const limit = !activityImageTestDoneRef.current ? 20 : 50
      const res = await fetch('/api/admin/enrich-activity-images', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ limit }),
      })
      const data = await res.json()
      if (data.error) { setEnrichActivityImagesResult('Virhe: ' + data.error); break }

      totalProcessed += data.processed
      totalUpdated += data.updated
      if (data.samples?.length > 0) setImageSamples(data.samples)
      setEnrichActivityImagesResult(`Käsitelty ${totalProcessed} • Kuva löytyi ${totalUpdated}:lle • Jäljellä ${data.remaining}`)

      if (!activityImageTestDoneRef.current) {
        activityImageTestDoneRef.current = true
        setEnrichActivityImagesResult(`✋ Ensimmäinen erä valmis — tarkista kuvat alla, paina uudelleen jatkaaksesi (Jäljellä ${data.remaining})`)
        setEnrichingActivityImages(false)
        return
      }

      if (data.remaining === 0 || data.processed === 0) {
        setEnrichActivityImagesResult(`✓ Valmis — käsitelty ${totalProcessed}, kuva ${totalUpdated}:lle`)
        break
      }
    }
    setEnrichingActivityImages(false)
  }

  async function handleEnrichImages() {
    if (enrichingImages) { enrichImagesStopRef.current = true; return }
    setEnrichingImages(true)
    enrichImagesStopRef.current = false
    setEnrichImagesResult('Aloitetaan...')
    setImageSamples([])
    let totalProcessed = 0
    let totalUpdated = 0

    while (!enrichImagesStopRef.current) {
      const res = await fetch('/api/admin/enrich-restaurant-images', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ limit: 50 }),
      })
      const data = await res.json()
      if (data.error) { setEnrichImagesResult('Virhe: ' + data.error); break }

      totalProcessed += data.processed
      totalUpdated += data.updated
      if (data.samples?.length > 0) setImageSamples(data.samples)
      setEnrichImagesResult(`Käsitelty ${totalProcessed} • Kuva löytyi ${totalUpdated}:lle • Jäljellä ${data.remaining}`)

      if (data.remaining === 0 || data.processed === 0) {
        setEnrichImagesResult(`✓ Valmis — käsitelty ${totalProcessed}, kuva ${totalUpdated}:lle`)
        break
      }
    }
    setEnrichingImages(false)
  }

  async function handleRefreshRatings() {
    setRefreshing(true)
    setRefreshResult('')
    const res = await fetch('/api/admin/refresh-ratings', { method: 'POST' })
    const data = await res.json()
    if (data.error) {
      setRefreshResult('Virhe: ' + data.error)
    } else {
      setRefreshResult(`Päivitetty ${data.updated} paikan arvosanat`)
    }
    setRefreshing(false)
  }

  return (
    <div className="min-h-screen bg-gray-950 text-white">
      {/* Header */}
      <div className="border-b border-white/8 px-6 py-4 flex items-center justify-between">
        <div>
          <div className="font-bold text-lg">Helsinki Tapahtumat</div>
          <div className="text-gray-400 text-sm">Admin</div>
        </div>
        <div className="flex items-center gap-3 flex-wrap justify-end">
          {enrichResult && <span className={`text-xs ${enrichResult.startsWith('✓') ? 'text-green-400' : 'text-yellow-400'}`}>{enrichResult}</span>}
          {enrichSubsResult && <span className={`text-xs ${enrichSubsResult.startsWith('✓') ? 'text-green-400' : 'text-yellow-400'}`}>{enrichSubsResult}</span>}
          {enrichImagesResult && <span className={`text-xs ${enrichImagesResult.startsWith('✓') ? 'text-green-400' : enrichImagesResult.startsWith('✋') ? 'text-blue-400' : 'text-yellow-400'}`}>{enrichImagesResult}</span>}
          {enrichActivityImagesResult && <span className={`text-xs ${enrichActivityImagesResult.startsWith('✓') ? 'text-green-400' : enrichActivityImagesResult.startsWith('✋') ? 'text-blue-400' : 'text-yellow-400'}`}>{enrichActivityImagesResult}</span>}
          {refreshResult && <span className="text-green-400 text-xs">{refreshResult}</span>}
          <button
            onClick={handleEnrichRestaurants}
            className={`text-sm transition-colors ${enriching ? 'text-red-400 hover:text-red-300' : 'text-orange-400 hover:text-orange-300'}`}
          >
            {enriching ? '⏹ Pysäytä' : '🍽 Rikasta ravintolat'}
          </button>
          <button
            onClick={handleEnrichSubcategories}
            className={`text-sm transition-colors ${enrichingSubs ? 'text-red-400 hover:text-red-300' : 'text-purple-400 hover:text-purple-300'}`}
          >
            {enrichingSubs ? '⏹ Pysäytä' : '🎯 Enrichoi kategoriat'}
          </button>
          <button
            onClick={handleEnrichImages}
            className={`text-sm transition-colors ${enrichingImages ? 'text-red-400 hover:text-red-300' : 'text-cyan-400 hover:text-cyan-300'}`}
          >
            {enrichingImages ? '⏹ Pysäytä' : '📸 Hae kuvat'}
          </button>
          <button
            onClick={handleEnrichActivityImages}
            className={`text-sm transition-colors ${enrichingActivityImages ? 'text-red-400 hover:text-red-300' : 'text-teal-400 hover:text-teal-300'}`}
          >
            {enrichingActivityImages ? '⏹ Pysäytä' : '🏃 Aktiviteettien kuvat'}
          </button>
          <button
            onClick={handleRefreshRatings}
            disabled={refreshing}
            className="text-gray-400 hover:text-white text-sm transition-colors disabled:opacity-40"
          >
            {refreshing ? 'Haetaan...' : '★ Päivitä arvosanat'}
          </button>
          <button
            onClick={handleLogout}
            className="text-gray-400 hover:text-white text-sm transition-colors"
          >
            Kirjaudu ulos
          </button>
        </div>
      </div>

      {/* Image samples preview */}
      {imageSamples.length > 0 && (
        <div className="border-b border-white/8 px-6 py-3 bg-cyan-500/5">
          <div className="text-xs text-cyan-400 mb-2 font-medium">Esimerkkikuvia Google Businessista — tarkista laatu:</div>
          <div className="flex gap-3 overflow-x-auto pb-1">
            {imageSamples.map((s, i) => (
              <div key={i} className="shrink-0 w-24">
                <img src={s.image} alt={s.name} className="w-24 h-16 object-cover rounded-lg bg-gray-800" onError={e => { (e.target as HTMLImageElement).style.display = 'none' }} />
                <div className="text-xs text-gray-400 mt-1 truncate">{s.name}</div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Tabs */}
      <div className="border-b border-white/8 px-6 flex gap-1">
        {(['festivals', 'recurring'] as Tab[]).map(t => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`px-4 py-3 text-sm font-medium border-b-2 transition-colors ${
              tab === t
                ? 'border-purple-500 text-white'
                : 'border-transparent text-gray-400 hover:text-white'
            }`}
          >
            {t === 'festivals' ? 'Festivaalit' : 'Toistuvat tapahtumat'}
          </button>
        ))}
      </div>

      {tab === 'festivals' ? <FestivalsTab /> : <RecurringTab />}
    </div>
  )
}

// ── Festivals tab ─────────────────────────────────────────────────────────────

function FestivalsTab() {
  const router = useRouter()
  const [festivals, setFestivals] = useState<Festival[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [modal, setModal] = useState<'add' | 'edit' | null>(null)
  const [editing, setEditing] = useState<Festival | null>(null)
  const [form, setForm] = useState<Omit<Festival, 'id'>>(EMPTY_FESTIVAL)
  const [saving, setSaving] = useState(false)
  const [deleteId, setDeleteId] = useState<string | null>(null)
  const [search, setSearch] = useState('')
  const [addedUrls, setAddedUrls] = useState<Set<string>>(new Set())
  const pendingAddUrl = useRef<string | null>(null)
  const [updating, setUpdating] = useState(false)
  const [updateResult, setUpdateResult] = useState<{ name: string; changes: Record<string, string> }[]>([])
  const [discovering, setDiscovering] = useState(false)
  const [autoImported, setAutoImported] = useState<{ name: string; startDate: string }[]>([])
  const [discoverResult, setDiscoverResult] = useState<{
    updated: { name: string; changes: Record<string, string> }[]
    candidates: { title: string; url: string; snippet: string; event: { name?: string; startDate?: string; endDate?: string; venue?: string; address?: string; ticketUrl?: string } | null }[]
  } | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    const res = await fetch('/api/admin/festivals')
    if (res.status === 401) { router.push('/admin/login'); return }
    const data = await res.json()
    if (data.error) { setError(data.error); setLoading(false); return }
    setFestivals(data.festivals.map(festivalFromDb))
    setLoading(false)
  }, [router])

  useEffect(() => { load() }, [load])

  function openAdd(prefill?: Partial<Omit<Festival, 'id'>>, fromUrl?: string) {
    pendingAddUrl.current = fromUrl ?? null
    setForm({ ...EMPTY_FESTIVAL, ...prefill })
    setEditing(null)
    setModal('add')
  }
  function openEdit(f: Festival) { setForm({ ...f }); setEditing(f); setModal('edit') }

  async function handleUpdate() {
    setUpdating(true)
    setUpdateResult([])
    const res = await fetch('/api/admin/discover-festivals', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ mode: 'update' }),
    })
    const data = await res.json()
    if (data.error) { alert('Virhe: ' + data.error); setUpdating(false); return }
    setUpdateResult(data.updated ?? [])
    setUpdating(false)
    if (data.updated?.length > 0) load()
  }

  async function handleDiscover() {
    setDiscovering(true)
    setDiscoverResult(null)
    setAutoImported([])
    const res = await fetch('/api/admin/discover-festivals', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ mode: 'discover' }),
    })
    const data = await res.json()
    if (data.error) { alert('Virhe: ' + data.error); setDiscovering(false); return }

    // Auto-import candidates with complete data
    if (data.candidates?.length > 0) {
      const importRes = await fetch('/api/admin/bulk-import-festivals', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ candidates: data.candidates }),
      })
      const importData = await importRes.json()
      if (importData.imported?.length > 0) {
        setAutoImported(importData.imported)
        setAddedUrls(new Set(data.candidates.map((c: { url: string }) => c.url)))
        load()
      }
    }

    setDiscoverResult(data)
    setDiscovering(false)
  }

  async function handleSave() {
    setSaving(true)
    const payload = {
      ...form,
      id: editing?.id,
      categories: typeof form.categories === 'string'
        ? (form.categories as string).split(',').map(c => c.trim()).filter(Boolean)
        : form.categories,
    }
    const res = await fetch('/api/admin/festivals', {
      method: modal === 'add' ? 'POST' : 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    })
    const data = await res.json()
    if (data.error) { alert('Virhe: ' + data.error); setSaving(false); return }
    if (modal === 'add' && pendingAddUrl.current) {
      setAddedUrls(prev => new Set([...prev, pendingAddUrl.current!]))
      pendingAddUrl.current = null
    }
    setModal(null); setSaving(false); load()
  }

  async function handleDelete(id: string) {
    const res = await fetch(`/api/admin/festivals?id=${id}`, { method: 'DELETE' })
    const data = await res.json()
    if (data.error) { alert('Virhe: ' + data.error); return }
    setDeleteId(null); load()
  }

  const filtered = festivals.filter(f =>
    !search || f.name.toLowerCase().includes(search.toLowerCase()) || f.city.toLowerCase().includes(search.toLowerCase())
  )

  return (
    <div className="max-w-6xl mx-auto p-6">
      <div className="flex items-center gap-3 mb-4">
        <input
          type="text" value={search} onChange={e => setSearch(e.target.value)}
          placeholder="Hae nimellä tai kaupungilla..."
          className="flex-1 bg-gray-900 border border-white/10 rounded-lg px-4 py-2 text-white placeholder-gray-500 focus:outline-none focus:border-purple-500"
        />
        <span className="text-gray-500 text-sm">{festivals.length} kpl</span>
        <button
          onClick={handleUpdate}
          disabled={updating || discovering}
          className="bg-gray-800 hover:bg-gray-700 disabled:opacity-40 text-white font-semibold px-4 py-2 rounded-lg transition-colors whitespace-nowrap text-sm"
        >
          {updating ? '🔄 Päivitetään...' : '🔄 Päivitä tiedot'}
        </button>
        <button
          onClick={handleDiscover}
          disabled={discovering || updating}
          className="bg-gray-800 hover:bg-gray-700 disabled:opacity-40 text-white font-semibold px-4 py-2 rounded-lg transition-colors whitespace-nowrap text-sm"
        >
          {discovering ? '🔍 Etsitään... (1–2 min)' : '🔍 Etsi uusia'}
        </button>
        <button onClick={() => openAdd()} className="bg-purple-600 hover:bg-purple-500 text-white font-semibold px-5 py-2 rounded-lg transition-colors whitespace-nowrap">
          + Lisää uusi
        </button>
      </div>

      {/* Update results */}
      {updateResult.length > 0 && (
        <div className="mb-4 bg-green-500/8 border border-green-500/20 rounded-xl p-4">
          <div className="font-semibold text-green-400 mb-2">✓ Päivitetty ({updateResult.length} festivaalia)</div>
          <div className="space-y-1">
            {updateResult.map(u => (
              <div key={u.name} className="text-sm text-gray-300">
                <span className="font-medium">{u.name}</span>
                <span className="text-gray-500 ml-2">{Object.entries(u.changes).map(([k, v]) => `${k}: ${v}`).join(', ')}</span>
              </div>
            ))}
          </div>
        </div>
      )}
      {/* Auto-imported */}
      {autoImported.length > 0 && (
        <div className="mb-4 bg-green-500/8 border border-green-500/20 rounded-xl p-4">
          <div className="font-semibold text-green-400 mb-2">✓ Lisätty automaattisesti ({autoImported.length} kpl)</div>
          <div className="space-y-0.5">
            {autoImported.map((f, i) => (
              <div key={i} className="text-sm text-gray-300">
                {f.name} <span className="text-gray-500 text-xs">{f.startDate}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Discover results */}
      {discoverResult && (
        <div className="mb-6 space-y-4">
          {discoverResult.candidates.length > 0 ? (
            <div className="bg-amber-500/8 border border-amber-500/20 rounded-xl p-4">
              <div className="font-semibold text-amber-400 mb-3">
                Uusia ehdotuksia ({discoverResult.candidates.length} kpl) — tarkista ja lisää
              </div>
              <div className="space-y-3">
                {discoverResult.candidates.map((c, i) => (
                  <div key={i} className="bg-white/3 rounded-lg p-3 flex items-start gap-3">
                    <div className="flex-1 min-w-0">
                      <div className="font-medium text-white text-sm">{c.event?.name || c.title}</div>
                      {c.event?.startDate && (
                        <div className="text-amber-300/70 text-xs mt-0.5">
                          {formatDate(c.event.startDate)}{c.event.endDate && c.event.endDate !== c.event.startDate ? ` – ${formatDate(c.event.endDate)}` : ''}{c.event.venue ? ` · ${c.event.venue}` : ''}
                        </div>
                      )}
                      {!c.event?.startDate && (
                        <div className="text-gray-500 text-xs mt-0.5 line-clamp-2">{c.snippet}</div>
                      )}
                      <a href={c.url} target="_blank" rel="noopener noreferrer" className="text-blue-400/60 text-xs hover:text-blue-400 transition-colors">{c.url}</a>
                    </div>
                    {addedUrls.has(c.url) ? (
                      <span className="text-green-400 text-xs font-semibold px-3 py-1.5 bg-green-500/10 rounded-lg whitespace-nowrap shrink-0">✓ Lisätty</span>
                    ) : (
                      <button
                        onClick={() => openAdd({
                          name: c.event?.name || c.title,
                          shortName: c.event?.name || c.title,
                          startDate: c.event?.startDate || '',
                          endDate: c.event?.endDate || c.event?.startDate || '',
                          venueName: c.event?.venue || '',
                          address: c.event?.address || '',
                          ticketUrl: c.event?.ticketUrl || '',
                          infoUrl: c.url,
                        }, c.url)}
                        className="bg-purple-600 hover:bg-purple-500 text-white text-xs font-semibold px-3 py-1.5 rounded-lg transition-colors whitespace-nowrap shrink-0"
                      >
                        + Lisää
                      </button>
                    )}
                  </div>
                ))}
              </div>
            </div>
          ) : (
            <div className="text-gray-500 text-sm">Ei uusia tapahtumia löytynyt.</div>
          )}
        </div>
      )}

      {error && <div className="bg-red-500/10 border border-red-500/20 rounded-lg px-4 py-3 text-red-400 mb-6">{error}</div>}

      {loading ? (
        <div className="text-center text-gray-400 py-20">Ladataan...</div>
      ) : (
        <div className="bg-gray-900 rounded-2xl border border-white/8 overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-white/8 text-gray-400 text-xs uppercase tracking-wider">
                <th className="text-left px-4 py-3">Tapahtuma</th>
                <th className="text-left px-4 py-3">Päivät</th>
                <th className="text-left px-4 py-3">Paikka</th>
                <th className="text-left px-4 py-3">Kaupunki</th>
                <th className="text-left px-4 py-3">Tila</th>
                <th className="px-4 py-3"></th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((f, i) => (
                <tr key={f.id} className={`border-b border-white/5 hover:bg-white/3 transition-colors ${i === filtered.length - 1 ? 'border-b-0' : ''}`}>
                  <td className="px-4 py-3">
                    <div className="font-medium text-white">{f.shortName}</div>
                    <div className="text-gray-500 text-xs truncate max-w-48">{f.name}</div>
                  </td>
                  <td className="px-4 py-3 text-gray-300">
                    {f.startDate === f.endDate ? formatDate(f.startDate) : `${formatDate(f.startDate)} – ${formatDate(f.endDate)}`}
                  </td>
                  <td className="px-4 py-3 text-gray-300 truncate max-w-36">{f.venueName}</td>
                  <td className="px-4 py-3 text-gray-300">{f.city}</td>
                  <td className="px-4 py-3">
                    {f.active
                      ? <span className="text-green-400 text-xs bg-green-500/10 px-2 py-0.5 rounded-full">Aktiivinen</span>
                      : <span className="text-gray-500 text-xs bg-white/5 px-2 py-0.5 rounded-full">Piilotettu</span>}
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2 justify-end">
                      <button onClick={() => openEdit(f)} className="text-gray-400 hover:text-white transition-colors px-2 py-1 rounded hover:bg-white/5">Muokkaa</button>
                      <button onClick={() => setDeleteId(f.id)} className="text-gray-500 hover:text-red-400 transition-colors px-2 py-1 rounded hover:bg-red-500/5">Poista</button>
                    </div>
                  </td>
                </tr>
              ))}
              {filtered.length === 0 && (
                <tr><td colSpan={6} className="text-center text-gray-500 py-12">{search ? 'Ei hakutuloksia' : 'Ei tapahtumia'}</td></tr>
              )}
            </tbody>
          </table>
        </div>
      )}

      {modal && (
        <div className="fixed inset-0 bg-black/70 flex items-center justify-center p-4 z-50" onClick={e => { if (e.target === e.currentTarget) setModal(null) }}>
          <div className="bg-gray-900 rounded-2xl border border-white/10 w-full max-w-2xl max-h-[90vh] overflow-y-auto">
            <div className="px-6 py-4 border-b border-white/8 flex items-center justify-between">
              <h2 className="font-semibold text-white">{modal === 'add' ? 'Lisää festivaali' : 'Muokkaa festivaalia'}</h2>
              <button onClick={() => setModal(null)} className="text-gray-400 hover:text-white">✕</button>
            </div>
            <div className="p-6 grid grid-cols-2 gap-4">
              <div className="col-span-2"><Field label="Nimi *" value={form.name} onChange={v => setForm(f => ({ ...f, name: v }))} /></div>
              <Field label="Lyhytnimi *" value={form.shortName} onChange={v => setForm(f => ({ ...f, shortName: v }))} />
              <Field label="Aika" value={form.time} onChange={v => setForm(f => ({ ...f, time: v }))} placeholder="12:00" />
              <Field label="Alkupäivä *" value={form.startDate} onChange={v => setForm(f => ({ ...f, startDate: v }))} type="date" />
              <Field label="Loppupäivä *" value={form.endDate} onChange={v => setForm(f => ({ ...f, endDate: v }))} type="date" />
              <Field label="Tapahtumapaikka *" value={form.venueName} onChange={v => setForm(f => ({ ...f, venueName: v }))} />
              <Field label="Kaupunki" value={form.city} onChange={v => setForm(f => ({ ...f, city: v }))} />
              <div className="col-span-2"><Field label="Osoite" value={form.address} onChange={v => setForm(f => ({ ...f, address: v }))} /></div>
              <Field label="Lippulinkki *" value={form.ticketUrl} onChange={v => setForm(f => ({ ...f, ticketUrl: v }))} placeholder="https://" />
              <Field label="Infosivun URL *" value={form.infoUrl} onChange={v => setForm(f => ({ ...f, infoUrl: v }))} placeholder="https://" />
              <div className="col-span-2"><Field label="Kuva URL" value={form.image || ''} onChange={v => setForm(f => ({ ...f, image: v || null }))} placeholder="https://..." /></div>
              <div className="col-span-2">
                <Field label="Kategoriat (pilkulla erotettu)" value={Array.isArray(form.categories) ? form.categories.join(', ') : form.categories} onChange={v => setForm(f => ({ ...f, categories: v as unknown as string[] }))} placeholder="Musiikki, Festivaali, Rock" />
              </div>
              <div className="col-span-2">
                <label className="block text-xs text-gray-400 mb-1">Kuvaus</label>
                <textarea value={form.description} onChange={e => setForm(f => ({ ...f, description: e.target.value }))} rows={3} className="w-full bg-gray-800 border border-white/10 rounded-lg px-3 py-2 text-white placeholder-gray-500 focus:outline-none focus:border-purple-500 resize-none text-sm" />
              </div>
              <div className="flex items-center gap-3">
                <label className="flex items-center gap-2 cursor-pointer">
                  <input type="checkbox" checked={form.isFree} onChange={e => setForm(f => ({ ...f, isFree: e.target.checked }))} className="w-4 h-4 accent-purple-500" />
                  <span className="text-sm text-gray-300">Ilmainen</span>
                </label>
              </div>
              <div className="flex items-center gap-3 justify-end">
                <label className="flex items-center gap-2 cursor-pointer">
                  <input type="checkbox" checked={form.active} onChange={e => setForm(f => ({ ...f, active: e.target.checked }))} className="w-4 h-4 accent-purple-500" />
                  <span className="text-sm text-gray-300">Aktiivinen</span>
                </label>
              </div>
            </div>
            <div className="px-6 pb-6 flex gap-3 justify-end">
              <button onClick={() => setModal(null)} className="px-5 py-2 rounded-lg text-gray-400 hover:text-white hover:bg-white/5 transition-colors">Peruuta</button>
              <button onClick={handleSave} disabled={saving || !form.name || !form.startDate || !form.venueName} className="bg-purple-600 hover:bg-purple-500 disabled:opacity-40 text-white font-semibold px-5 py-2 rounded-lg transition-colors">
                {saving ? 'Tallennetaan...' : modal === 'add' ? 'Lisää' : 'Tallenna'}
              </button>
            </div>
          </div>
        </div>
      )}

      {deleteId && (
        <div className="fixed inset-0 bg-black/70 flex items-center justify-center p-4 z-50">
          <div className="bg-gray-900 rounded-2xl border border-white/10 p-6 max-w-sm w-full">
            <h3 className="font-semibold text-white mb-2">Poista festivaali?</h3>
            <p className="text-gray-400 text-sm mb-6">Tätä toimintoa ei voi perua.</p>
            <div className="flex gap-3 justify-end">
              <button onClick={() => setDeleteId(null)} className="px-4 py-2 text-gray-400 hover:text-white transition-colors">Peruuta</button>
              <button onClick={() => handleDelete(deleteId)} className="bg-red-600 hover:bg-red-500 text-white font-semibold px-4 py-2 rounded-lg transition-colors">Poista</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

// ── Recurring tab ─────────────────────────────────────────────────────────────

function RecurringTab() {
  const router = useRouter()
  const [events, setEvents] = useState<RecurringEvent[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [modal, setModal] = useState<'add' | 'edit' | null>(null)
  const [editing, setEditing] = useState<RecurringEvent | null>(null)
  const [form, setForm] = useState<Omit<RecurringEvent, 'id'>>(EMPTY_RECURRING)
  const [saving, setSaving] = useState(false)
  const [deleteId, setDeleteId] = useState<string | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    const res = await fetch('/api/admin/recurring')
    if (res.status === 401) { router.push('/admin/login'); return }
    const data = await res.json()
    if (data.error) { setError(data.error); setLoading(false); return }
    setEvents(data.events.map(recurringFromDb))
    setLoading(false)
  }, [router])

  useEffect(() => { load() }, [load])

  function openAdd() { setForm(EMPTY_RECURRING); setEditing(null); setModal('add') }
  function openEdit(e: RecurringEvent) { setForm({ ...e }); setEditing(e); setModal('edit') }

  async function handleSave() {
    setSaving(true)
    const payload = {
      ...form,
      id: editing?.id,
      categories: typeof form.categories === 'string'
        ? (form.categories as string).split(',').map(c => c.trim()).filter(Boolean)
        : form.categories,
    }
    const res = await fetch('/api/admin/recurring', {
      method: modal === 'add' ? 'POST' : 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    })
    const data = await res.json()
    if (data.error) { alert('Virhe: ' + data.error); setSaving(false); return }
    setModal(null); setSaving(false); load()
  }

  async function handleDelete(id: string) {
    const res = await fetch(`/api/admin/recurring?id=${id}`, { method: 'DELETE' })
    const data = await res.json()
    if (data.error) { alert('Virhe: ' + data.error); return }
    setDeleteId(null); load()
  }

  return (
    <div className="max-w-6xl mx-auto p-6">
      <div className="flex items-center gap-3 mb-6">
        <div className="flex-1 text-gray-400 text-sm">Tapahtumat jotka toistuvat joka viikko samana viikonpäivänä</div>
        <span className="text-gray-500 text-sm">{events.length} kpl</span>
        <button onClick={openAdd} className="bg-purple-600 hover:bg-purple-500 text-white font-semibold px-5 py-2 rounded-lg transition-colors whitespace-nowrap">
          + Lisää uusi
        </button>
      </div>

      {error && <div className="bg-red-500/10 border border-red-500/20 rounded-lg px-4 py-3 text-red-400 mb-6">{error}</div>}

      {loading ? (
        <div className="text-center text-gray-400 py-20">Ladataan...</div>
      ) : (
        <div className="bg-gray-900 rounded-2xl border border-white/8 overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-white/8 text-gray-400 text-xs uppercase tracking-wider">
                <th className="text-left px-4 py-3">Tapahtuma</th>
                <th className="text-left px-4 py-3">Päivä & aika</th>
                <th className="text-left px-4 py-3">Paikka</th>
                <th className="text-left px-4 py-3">Tila</th>
                <th className="px-4 py-3"></th>
              </tr>
            </thead>
            <tbody>
              {events.map((e, i) => (
                <tr key={e.id} className={`border-b border-white/5 hover:bg-white/3 transition-colors ${i === events.length - 1 ? 'border-b-0' : ''}`}>
                  <td className="px-4 py-3">
                    <div className="font-medium text-white">{e.title}</div>
                    <div className="text-gray-500 text-xs truncate max-w-48">{e.shortDescription}</div>
                  </td>
                  <td className="px-4 py-3 text-gray-300">
                    {WEEKDAYS[e.weekday]} {String(e.startHour).padStart(2, '0')}:{String(e.startMinute).padStart(2, '0')}
                  </td>
                  <td className="px-4 py-3 text-gray-300 truncate max-w-36">{e.venue}</td>
                  <td className="px-4 py-3">
                    {e.active
                      ? <span className="text-green-400 text-xs bg-green-500/10 px-2 py-0.5 rounded-full">Aktiivinen</span>
                      : <span className="text-gray-500 text-xs bg-white/5 px-2 py-0.5 rounded-full">Piilotettu</span>}
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2 justify-end">
                      <button onClick={() => openEdit(e)} className="text-gray-400 hover:text-white transition-colors px-2 py-1 rounded hover:bg-white/5">Muokkaa</button>
                      <button onClick={() => setDeleteId(e.id)} className="text-gray-500 hover:text-red-400 transition-colors px-2 py-1 rounded hover:bg-red-500/5">Poista</button>
                    </div>
                  </td>
                </tr>
              ))}
              {events.length === 0 && (
                <tr><td colSpan={5} className="text-center text-gray-500 py-12">Ei toistuvia tapahtumia</td></tr>
              )}
            </tbody>
          </table>
        </div>
      )}

      {modal && (
        <div className="fixed inset-0 bg-black/70 flex items-center justify-center p-4 z-50" onClick={e => { if (e.target === e.currentTarget) setModal(null) }}>
          <div className="bg-gray-900 rounded-2xl border border-white/10 w-full max-w-2xl max-h-[90vh] overflow-y-auto">
            <div className="px-6 py-4 border-b border-white/8 flex items-center justify-between">
              <h2 className="font-semibold text-white">{modal === 'add' ? 'Lisää toistuva tapahtuma' : 'Muokkaa tapahtumaa'}</h2>
              <button onClick={() => setModal(null)} className="text-gray-400 hover:text-white">✕</button>
            </div>
            <div className="p-6 grid grid-cols-2 gap-4">
              <div className="col-span-2"><Field label="Nimi *" value={form.title} onChange={v => setForm(f => ({ ...f, title: v }))} /></div>
              <div className="col-span-2"><Field label="Lyhyt kuvaus" value={form.shortDescription} onChange={v => setForm(f => ({ ...f, shortDescription: v }))} /></div>
              <div>
                <label className="block text-xs text-gray-400 mb-1">Viikonpäivä *</label>
                <select
                  value={form.weekday}
                  onChange={e => setForm(f => ({ ...f, weekday: Number(e.target.value) }))}
                  className="w-full bg-gray-800 border border-white/10 rounded-lg px-3 py-2 text-white focus:outline-none focus:border-purple-500 text-sm"
                >
                  {WEEKDAYS.map((d, i) => <option key={i} value={i}>{d}</option>)}
                </select>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <Field label="Alkaa (tunti)" value={String(form.startHour)} onChange={v => setForm(f => ({ ...f, startHour: Number(v) }))} type="number" />
                <Field label="Minuutti" value={String(form.startMinute)} onChange={v => setForm(f => ({ ...f, startMinute: Number(v) }))} type="number" />
              </div>
              <Field label="Kesto (min)" value={String(form.durationMinutes)} onChange={v => setForm(f => ({ ...f, durationMinutes: Number(v) }))} type="number" />
              <Field label="Hinta (esim. 10–15 €)" value={form.price} onChange={v => setForm(f => ({ ...f, price: v }))} placeholder="jätä tyhjäksi jos ilmainen" />
              <Field label="Paikka *" value={form.venue} onChange={v => setForm(f => ({ ...f, venue: v }))} />
              <Field label="Kaupunki/Osoite" value={form.address} onChange={v => setForm(f => ({ ...f, address: v }))} />
              <Field label="Infosivun URL" value={form.infoUrl} onChange={v => setForm(f => ({ ...f, infoUrl: v }))} placeholder="https://" />
              <Field label="Lippulinkki" value={form.ticketUrl} onChange={v => setForm(f => ({ ...f, ticketUrl: v }))} placeholder="https://" />
              <div className="col-span-2">
                <Field label="Kategoriat (pilkulla erotettu)" value={Array.isArray(form.categories) ? form.categories.join(', ') : form.categories} onChange={v => setForm(f => ({ ...f, categories: v as unknown as string[] }))} placeholder="Jazz, Musiikki, Baari" />
              </div>
              <div className="col-span-2">
                <Field label="Aktiiviset kuukaudet (pilkulla, esim. 6,7,8 = kesä–elokuu, tyhjä = ympäri vuoden)" value={form.activeMonths} onChange={v => setForm(f => ({ ...f, activeMonths: v }))} placeholder="6, 7, 8" />
              </div>
              <div className="flex items-center gap-3">
                <label className="flex items-center gap-2 cursor-pointer">
                  <input type="checkbox" checked={form.isFree} onChange={e => setForm(f => ({ ...f, isFree: e.target.checked }))} className="w-4 h-4 accent-purple-500" />
                  <span className="text-sm text-gray-300">Ilmainen</span>
                </label>
              </div>
              <div className="flex items-center gap-3 justify-end">
                <label className="flex items-center gap-2 cursor-pointer">
                  <input type="checkbox" checked={form.active} onChange={e => setForm(f => ({ ...f, active: e.target.checked }))} className="w-4 h-4 accent-purple-500" />
                  <span className="text-sm text-gray-300">Aktiivinen</span>
                </label>
              </div>
            </div>
            <div className="px-6 pb-6 flex gap-3 justify-end">
              <button onClick={() => setModal(null)} className="px-5 py-2 rounded-lg text-gray-400 hover:text-white hover:bg-white/5 transition-colors">Peruuta</button>
              <button onClick={handleSave} disabled={saving || !form.title || !form.venue} className="bg-purple-600 hover:bg-purple-500 disabled:opacity-40 text-white font-semibold px-5 py-2 rounded-lg transition-colors">
                {saving ? 'Tallennetaan...' : modal === 'add' ? 'Lisää' : 'Tallenna'}
              </button>
            </div>
          </div>
        </div>
      )}

      {deleteId && (
        <div className="fixed inset-0 bg-black/70 flex items-center justify-center p-4 z-50">
          <div className="bg-gray-900 rounded-2xl border border-white/10 p-6 max-w-sm w-full">
            <h3 className="font-semibold text-white mb-2">Poista toistuva tapahtuma?</h3>
            <p className="text-gray-400 text-sm mb-6">Tätä toimintoa ei voi perua.</p>
            <div className="flex gap-3 justify-end">
              <button onClick={() => setDeleteId(null)} className="px-4 py-2 text-gray-400 hover:text-white transition-colors">Peruuta</button>
              <button onClick={() => handleDelete(deleteId)} className="bg-red-600 hover:bg-red-500 text-white font-semibold px-4 py-2 rounded-lg transition-colors">Poista</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

// ── Shared components ─────────────────────────────────────────────────────────

function Field({ label, value, onChange, type = 'text', placeholder }: {
  label: string; value: string; onChange: (v: string) => void; type?: string; placeholder?: string
}) {
  return (
    <div>
      <label className="block text-xs text-gray-400 mb-1">{label}</label>
      <input type={type} value={value} onChange={e => onChange(e.target.value)} placeholder={placeholder}
        className="w-full bg-gray-800 border border-white/10 rounded-lg px-3 py-2 text-white placeholder-gray-500 focus:outline-none focus:border-purple-500 text-sm" />
    </div>
  )
}

function formatDate(d: string): string {
  if (!d) return ''
  const [y, m, day] = d.split('-')
  return `${day}.${m}.${y}`
}

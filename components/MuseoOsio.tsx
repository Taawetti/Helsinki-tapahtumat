'use client'

// Museot-paikkalista Museo-kategorian tapahtumaruudukon PERÄÄN.
//
// Omistaja 23.9.2026: "kun klikkaan museo kategoriasta niin se antaa
// museotapahtumat — siinä voisi olla kuten kirpputorit-oppaassa: ensin
// tapahtumat ja sen jälkeen museot." Museo on ainoa peruskategoria jossa
// paikka on yhtä kiinnostava kuin tapahtuma: museoon mennään vaikka siellä
// ei olisi erillistä tapahtumaa. Muihin kategorioihin tätä EI tehdä.
//
// Sama kortti ja paneeli kuin oppaissa (PlaceCard / PlaceDetailPanel), jotta
// museo näyttää ja käyttäytyy samoin kuin ilmaiset museot -oppaassa. Data
// /api/activities (OSM + Google-rikastus): mitattu 23.9.2026 90 museota,
// kaikilla kuva ja aukioloajat. Haetaan vasta kun osio näytetään.

import { useEffect, useMemo, useState } from 'react'
import { useLanguage } from '@/contexts/LanguageContext'
import type { Activity } from '@/lib/types'
import PlaceDetailPanel, { type PaikkaTieto } from '@/components/PlaceDetailPanel'
import { PlaceCard, CardGrid, SectionHead } from '@/components/GuideInlineView'

let valimuisti: Activity[] | null = null

export default function MuseoOsio() {
  const { t } = useLanguage()
  const [museot, setMuseot] = useState<Activity[] | null>(valimuisti)
  const [valittu, setValittu] = useState<PaikkaTieto | null>(null)

  useEffect(() => {
    if (valimuisti) return
    let elossa = true
    fetch('/api/activities')
      .then((r) => (r.ok ? r.json() : { activities: [] }))
      .then((d: { activities?: Activity[] }) => {
        valimuisti = d.activities ?? []
        if (elossa) setMuseot(valimuisti)
      })
      .catch(() => { if (elossa) setMuseot([]) })
    return () => { elossa = false }
  }, [])

  const kortit = useMemo<PaikkaTieto[]>(() => {
    const seen = new Set<string>()
    return (museot ?? [])
      .filter((a) => a.category === 'museo')
      .filter((a) => { const k = a.name.toLowerCase().trim(); if (seen.has(k)) return false; seen.add(k); return true })
      // Kuvalliset ensin, sitten Google-arvosana (vähintään 50 arviota jotta
      // yksittäinen 5.0 ei ohita Ateneumia), sitten nimi.
      .sort((a, b) => {
        const ka = a.image ? 0 : 1, kb = b.image ? 0 : 1
        if (ka !== kb) return ka - kb
        const ra = (a.reviewCount ?? 0) >= 50 ? (a.rating ?? 0) : 0
        const rb = (b.reviewCount ?? 0) >= 50 ? (b.rating ?? 0) : 0
        if (ra !== rb) return rb - ra
        return a.name.localeCompare(b.name, 'fi')
      })
      .map((a) => ({
        id: a.id, name: a.name, address: a.address || null, image: a.image,
        emoji: '🏛', kicker: t('cat.museo'),
        topBadge: a.fee === false ? t('guides.free_badge') : null,
        bottomChip: a.rating != null && (a.reviewCount ?? 0) >= 50 ? `★ ${a.rating.toFixed(1)}` : null,
        www: a.www, lat: a.lat ?? null, lon: a.lon ?? null, phone: a.phone, openingHours: a.openingHours ?? null,
      }))
  }, [museot, t])

  if (museot !== null && kortit.length === 0) return null

  return (
    <div className="mt-8">
      <SectionHead sub={t('cat.museums_sub')}>🏛 {t('cat.museums_title')}{kortit.length ? ` · ${kortit.length}` : ''}</SectionHead>
      {museot === null ? (
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
          {Array.from({ length: 8 }).map((_, i) => <div key={i} className="rounded-xl bg-white/5 animate-pulse" style={{ aspectRatio: '3/4' }} />)}
        </div>
      ) : (
        <CardGrid>
          {kortit.map((p) => <PlaceCard key={p.id} paikka={p} onOpen={setValittu} />)}
        </CardGrid>
      )}
      {/* guideSlug '' → jakolinkki osoittaa etusivulle: tämä ei ole opas. */}
      <PlaceDetailPanel paikka={valittu} guideSlug="" onClose={() => setValittu(null)} />
    </div>
  )
}

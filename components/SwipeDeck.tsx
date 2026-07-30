'use client'

import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react'

// Geneerinen Tinder-swaippi. Irrotettu IdeaView'n tuotantokovennetusta
// mekaniikasta: hiiri/stylus = React Pointer Events + setPointerCapture, kosketus
// = NATIIVIT Touch Eventit (välttää iOS Safarin pointercancel-bugin). Suunnan
// lukitus + preventDefault vain vaakadragissa (pystyscroll säilyy). Deck hallitsee
// itse pinon etenemisen (seen-setti); parent antaa kortit + swipe-callbackit.
interface SwipeDeckProps<T extends { id: string }> {
  cards: T[]
  onSwipeRight: (card: T) => void   // ❤️
  onSwipeLeft: (card: T) => void    // ✕
  onTap?: (card: T) => void
  onUndo?: (card: T) => void        // ↩️ peruuta edellinen swaippi (parent siivoaa äänen)
  renderCard: (card: T, drag: { dragX: number; swipeRight: boolean; swipeLeft: boolean }) => ReactNode
  emptyState?: ReactNode
  threshold?: number
}

export default function SwipeDeck<T extends { id: string }>({
  cards, onSwipeRight, onSwipeLeft, onTap, onUndo, renderCard, emptyState, threshold = 80,
}: SwipeDeckProps<T>) {
  const [seen, setSeen] = useState<Set<string>>(new Set())
  const [history, setHistory] = useState<T[]>([])  // swaippausjärjestys undoa varten
  const [dragX, setDragX] = useState(0)
  const [exitDir, setExitDir] = useState<'left' | 'right' | null>(null)
  const isDragging = useRef(false)
  const dragStartX = useRef(0)
  const dragStartY = useRef(0)
  const lastDx = useRef(0)
  const lastDy = useRef(0)
  const committing = useRef(false)   // estä saman kortin tupla-commit exit-animaation (220 ms) aikana
  const cardRef = useRef<HTMLDivElement>(null)

  const current = cards.find(c => !seen.has(c.id)) ?? null
  const next = current ? cards.find(c => !seen.has(c.id) && c.id !== current.id) ?? null : null

  const commit = useCallback((dir: 'left' | 'right') => {
    if (!current || committing.current) return
    committing.current = true
    const card = current
    if (dir === 'right') onSwipeRight(card); else onSwipeLeft(card)
    setExitDir(dir)
    setTimeout(() => {
      setSeen(s => { const n = new Set(s); n.add(card.id); return n })
      setHistory(h => [...h, card])
      setDragX(0); setExitDir(null)
      committing.current = false
    }, 220)
  }, [current, onSwipeRight, onSwipeLeft])

  // ↩️ Peruuta: palauta viimeisin kortti pakkaan ja ilmoita parentille (äänen siivous).
  const undo = () => {
    const last = history[history.length - 1]
    if (!last || committing.current) return
    setHistory(h => h.slice(0, -1))
    setSeen(s => { const n = new Set(s); n.delete(last.id); return n })
    onUndo?.(last)
  }

  const endDrag = useCallback((dx: number, dy: number) => {
    isDragging.current = false
    if (Math.abs(dx) < 10 && Math.abs(dy) < 10) { // TAP
      if (current && onTap) onTap(current)
      setDragX(0); return
    }
    if (dx > threshold) commit('right')
    else if (dx < -threshold) commit('left')
    else setDragX(0) // snap takaisin
  }, [commit, current, onTap, threshold])

  // Vakaa viittaus endDragiin → natiivi touch-useEffect ei tarvitse endDragia
  // deps-listaan (muuten parentin re-render kesken dragin remounttaisi kuuntelijat
  // ja nollaisi dragin — esim. 2.5 s pollaus).
  const endDragRef = useRef(endDrag)
  // Refin kirjoitus efektissä: touch-kuuntelijat kutsuvat tätä vasta commit-vaiheen jälkeen
  useEffect(() => {
    endDragRef.current = endDrag
  })

  // Pointer-polku (hiiri/stylus) — kosketus ohitetaan, natiivipolku hoitaa
  const onPointerDown = useCallback((e: React.PointerEvent) => {
    if (e.pointerType === 'touch') return
    dragStartX.current = e.clientX; dragStartY.current = e.clientY
    isDragging.current = true
    cardRef.current?.setPointerCapture(e.pointerId)
  }, [])
  const onPointerMove = useCallback((e: React.PointerEvent) => {
    if (e.pointerType === 'touch' || !isDragging.current) return
    setDragX(e.clientX - dragStartX.current)
  }, [])
  const onPointerUp = useCallback((e: React.PointerEvent) => {
    if (e.pointerType === 'touch' || !isDragging.current) return
    endDrag(e.clientX - dragStartX.current, e.clientY - dragStartY.current)
  }, [endDrag])

  // Natiivi touch-polku (iOS-kovennus) — kuuntelijat remounttaavat kun kortti vaihtuu
  useEffect(() => {
    const card = cardRef.current
    if (!card) return
    let startX = 0, startY = 0, dragging = false, horizontal = false
    const onTouchStart = (e: TouchEvent) => {
      if (e.touches.length !== 1) return
      startX = e.touches[0].clientX; startY = e.touches[0].clientY
      lastDx.current = 0; lastDy.current = 0
      dragging = true; horizontal = false; isDragging.current = true
    }
    const onTouchMove = (e: TouchEvent) => {
      if (!dragging || e.touches.length !== 1) return
      const dx = e.touches[0].clientX - startX
      const dy = e.touches[0].clientY - startY
      lastDx.current = dx; lastDy.current = dy
      if (!horizontal) {
        if (Math.abs(dx) < 5 && Math.abs(dy) < 5) return                                       // dead zone
        if (Math.abs(dy) >= Math.abs(dx)) { dragging = false; isDragging.current = false; setDragX(0); return } // pysty → luovuta
        horizontal = true
      }
      e.preventDefault()                                                                        // estä sivuscroll vain vaakadragissa
      setDragX(dx)
    }
    const onTouchEnd = () => {
      if (!dragging) return
      dragging = false
      endDragRef.current(lastDx.current, lastDy.current)
    }
    const onTouchCancel = () => { dragging = false; isDragging.current = false; setDragX(0) }
    card.addEventListener('touchstart', onTouchStart, { passive: true })
    card.addEventListener('touchmove', onTouchMove, { passive: false })   // EI-passiivinen → preventDefault sallittu
    card.addEventListener('touchend', onTouchEnd, { passive: true })
    card.addEventListener('touchcancel', onTouchCancel, { passive: true })
    return () => {
      card.removeEventListener('touchstart', onTouchStart)
      card.removeEventListener('touchmove', onTouchMove)
      card.removeEventListener('touchend', onTouchEnd)
      card.removeEventListener('touchcancel', onTouchCancel)
    }
  }, [current])

  if (!current) return <>{emptyState ?? null}</>

  const cardTransform = exitDir === 'right'
    ? 'translateX(110%) rotate(12deg)'
    : exitDir === 'left'
    ? 'translateX(-110%) rotate(-12deg)'
    : `translateX(${dragX}px) rotate(${dragX * 0.04}deg)`
  const swipeRight = dragX > 20
  const swipeLeft = dragX < -20

  return (
    <div className="w-full" style={{ overscrollBehavior: 'none' }}>
      {/* Pino: overflow-hidden estää lentävän kortin sivuvuodon (iOS-zoom) */}
      <div className="relative w-full overflow-hidden" style={{ touchAction: 'pan-y' }}>
        {/* Seuraavan kortin silmäys taustalla — Tinder-tyylinen pinonsyvyys */}
        {next && (
          <div className="absolute inset-0" aria-hidden
            style={{ transform: 'scale(0.94) translateY(12px)', opacity: 0.65, pointerEvents: 'none' }}>
            {renderCard(next, { dragX: 0, swipeRight: false, swipeLeft: false })}
          </div>
        )}
        <div
          ref={cardRef}
          key={current.id}
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
          onPointerCancel={() => { isDragging.current = false; setDragX(0) }}
          className="select-none"
          style={{
            transform: cardTransform,
            // eslint-disable-next-line react-hooks/refs -- isDragging elää refissä ilman re-renderiä; transition-valinta tarvitsee sen
            transition: isDragging.current ? 'none' : 'transform 220ms cubic-bezier(.34,1.56,.64,1)',
            touchAction: 'pan-y',
            cursor: 'grab',
          }}
        >
          {renderCard(current, { dragX, swipeRight, swipeLeft })}
        </div>
      </div>

      {/* Napit — sama logiikka kuin swaipilla */}
      <div className="flex items-center justify-center gap-6 pt-5">
        {onUndo && (
          <button onClick={undo} disabled={!history.length} aria-label="Peruuta edellinen"
            className="w-11 h-11 rounded-full flex items-center justify-center text-lg active:scale-90 transition-all disabled:opacity-30"
            style={{ background: 'rgba(255,255,255,.06)', border: '1px solid rgba(255,255,255,.12)' }}>↩️</button>
        )}
        <button onClick={() => commit('left')} aria-label="Ohita"
          className="w-14 h-14 rounded-full flex items-center justify-center text-2xl active:scale-90 transition-transform"
          style={{ background: 'rgba(255,255,255,.08)', border: '1px solid rgba(255,90,90,.35)' }}>✕</button>
        <button onClick={() => commit('right')} aria-label="Tykkää"
          className="w-16 h-16 rounded-full flex items-center justify-center text-3xl active:scale-90 transition-transform"
          style={{ background: 'linear-gradient(150deg,#10b981,#059669)', boxShadow: '0 10px 24px -8px rgba(16,185,129,.7)' }}>❤️</button>
        {/* Symmetrinen täyte undo-napille → ✕/❤️ pysyvät keskellä */}
        {onUndo && <div className="w-11 h-11" aria-hidden />}
      </div>
    </div>
  )
}

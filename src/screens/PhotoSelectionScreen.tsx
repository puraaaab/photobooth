import React, { useState, useCallback, useEffect, useRef, useMemo } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { useSessionStore } from '@/store/sessionStore'
import { useToast } from '@/components/ui/Toast'
import { layoutEngine } from '@/engines/LayoutEngine'
import { getPhotoUrl } from '@/utils/photoUrl'

import { useSettingsStore } from '@/store/settingsStore'
import { useQueueStore } from '@/store/queueStore'
import { RefreshCw, Check, X } from 'lucide-react'

interface PhotoSelectionScreenProps {
  onBack: () => void
  onNext: () => void
  onRetakePhoto?: (photoId: string) => void
}

// Personality messages — appear once per threshold
const SELECTION_MESSAGES: Array<{ threshold: number; msg: string }> = [
  { threshold: 1,  msg: '1 picked.' },
  { threshold: 4,  msg: "Okay, we're getting somewhere." },
  { threshold: 8,  msg: "Nice picks." },
]

export function PhotoSelectionScreen({ onBack, onNext, onRetakePhoto }: PhotoSelectionScreenProps) {
  const { settings } = useSettingsStore()
  const {
    session,
    togglePhotoSelection,
    selectAllPhotos,
    clearPhotoSelection,
    toggleFavorite,
    fillSlotContext,
    setFillSlotContext,
    setLayout,
  } = useSessionStore()

  const { toast } = useToast()

  const [previewPhoto, setPreviewPhoto]   = useState<string | null>(null)
  const [filterMode, setFilterMode]       = useState<'all' | 'favorites'>('all')
  const [gridSize, setGridSize]           = useState<'sm' | 'md' | 'lg'>('md')
  const [layoutStyle, setLayoutStyle]     = useState<'uniform' | 'masonry'>('masonry')
  const [boothMsg, setBoothMsg]           = useState<string | null>(null)
  const msgTimerRef                       = useRef<ReturnType<typeof setTimeout> | null>(null)
  const shownThresholds                   = useRef<Set<number>>(new Set())

  const photos      = session?.photos ?? []
  const selectedIds = session?.selectedPhotoIds ?? []

  const displayedPhotos = filterMode === 'favorites'
    ? photos.filter(p => p.isFavorite)
    : photos

  const selectedCount = selectedIds.length
  const totalCount    = photos.length

  const previewIndex = previewPhoto
    ? displayedPhotos.findIndex(p => p.id === previewPhoto)
    : -1

  // Synchronize ticket status to EDITING
  useEffect(() => {
    if (session?.ticketId) {
      useQueueStore.getState().updateTicketStatus(session.ticketId, 'EDITING', {
        photoCount: session.photos?.length ?? 0,
        sessionId: session.id,
      })
    }
  }, [session?.ticketId, session?.photos?.length, session?.id])

  // Personality message logic
  useEffect(() => {
    const applicable = SELECTION_MESSAGES
      .filter(m => selectedCount >= m.threshold && !shownThresholds.current.has(m.threshold))
      .sort((a, b) => b.threshold - a.threshold)

    if (applicable.length > 0) {
      const msg = applicable[0]
      shownThresholds.current.add(msg.threshold)
      setBoothMsg(msg.msg)
      if (msgTimerRef.current) clearTimeout(msgTimerRef.current)
      msgTimerRef.current = setTimeout(() => setBoothMsg(null), 2400)
    }
  }, [selectedCount])

  const previewPhotoObj = previewPhoto
    ? displayedPhotos.find(p => p.id === previewPhoto)
    : null

  const openPreview  = (photoId: string) => setPreviewPhoto(photoId)
  const closePreview = () => setPreviewPhoto(null)

  const previewNext = () => {
    if (previewIndex < displayedPhotos.length - 1)
      setPreviewPhoto(displayedPhotos[previewIndex + 1].id)
  }
  const prevPreview = () => {
    if (previewIndex > 0)
      setPreviewPhoto(displayedPhotos[previewIndex - 1].id)
  }

  const PINTEREST_ASPECT_RATIOS = ['3/4', '4/5', '1/1', '2/3', '4/3', '5/6', '3/4', '4/5']

  // Responsive column count: user grid size toggle clamped to viewport width
  const [viewportCols, setViewportCols] = useState(3)
  useEffect(() => {
    const update = () => {
      const w = window.innerWidth
      let cols: number
      if (w <= 850) {
        // iPad portrait or mobile
        cols = { sm: 3, md: 2, lg: 1 }[gridSize]
      } else if (w <= 1180) {
        // iPad landscape / tablet
        cols = { sm: 4, md: 3, lg: 2 }[gridSize]
      } else if (w <= 1440) {
        cols = { sm: 5, md: 4, lg: 3 }[gridSize]
      } else {
        cols = { sm: 6, md: 5, lg: 4 }[gridSize]
      }
      setViewportCols(cols)
    }
    update()
    window.addEventListener('resize', update)
    return () => window.removeEventListener('resize', update)
  }, [gridSize])

  const columnCount = viewportCols

  const columns = useMemo(() => {
    const MOODBOARD_LANES = Math.max(2, columnCount)
    const cols: Array<Array<{ photo: typeof photos[number]; originalIndex: number; aspectRatio: string }>> = Array.from(
      { length: MOODBOARD_LANES },
      () => []
    )
    displayedPhotos.forEach((photo, i) => {
      let ratio = PINTEREST_ASPECT_RATIOS[i % PINTEREST_ASPECT_RATIOS.length]
      if (photo.metadata?.width && photo.metadata?.height) {
        const natural = photo.metadata.width / photo.metadata.height
        if (Math.abs(natural - 1) < 0.08) ratio = '1/1'
        else if (natural > 1.3) ratio = '4/3'
        else if (natural < 0.65) ratio = '2/3'
      }
      cols[i % MOODBOARD_LANES].push({ photo, originalIndex: i, aspectRatio: ratio })
    })
    return cols
  }, [displayedPhotos, columnCount])

  const handleCardClick = (photoId: string, originalIndex: number) => {
    const isNowSelected = !selectedIds.includes(photoId)
    togglePhotoSelection(photoId)
    if (fillSlotContext && isNowSelected) {
      toast(`Shot #${originalIndex + 1} added for Strip ${fillSlotContext.stripIndex + 1}!`, 'success')
    }
  }

  return (
    <div className="flex h-full" style={{ overflow: 'hidden', position: 'relative' }}>
      {/* ─── Photo Grid ───────────────────────────────────────────────────── */}
      <div className="flex flex-col flex-1 overflow-hidden">
        {/* Toolbar */}
        <div
          className="screen-toolbar"
          style={{ justifyContent: 'space-between' }}
        >
          <div>
            <div style={{ display: 'flex', alignItems: 'baseline', gap: 'var(--space-2)' }}>
              <span
                className="count-num"
                style={{
                  fontFamily: 'var(--font-display)',
                  fontSize: 'var(--text-2xl)',
                  fontWeight: 'var(--font-bold)',
                  letterSpacing: 'var(--letter-spacing-display, 0.08em)',
                }}
              >
                {selectedCount}
              </span>
              <span style={{ fontFamily: 'var(--font-mono)', fontSize: 'var(--text-sm)', color: 'var(--color-text-tertiary)' }}>
                of {totalCount} selected
              </span>
            </div>

            {/* Personality message — appears briefly */}
            <AnimatePresence mode="wait">
              {boothMsg && (
                <motion.p
                  key={boothMsg}
                  initial={{ opacity: 0, y: 3 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0 }}
                  transition={{ duration: 0.16 }}
                  style={{
                    fontFamily: 'var(--font-display)',
                    fontSize: 'var(--text-sm)',
                    color: 'var(--color-accent)',
                    letterSpacing: 'var(--letter-spacing-display, 0.08em)',
                    marginTop: 1,
                  }}
                >
                  {boothMsg}
                </motion.p>
              )}
            </AnimatePresence>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-3)' }}>
            {/* Filter mode */}
            <div style={{ display: 'flex', borderRadius: 'var(--radius-md)', border: '3px solid var(--color-border-subtle)', overflow: 'hidden' }}>
              {(['all', 'favorites'] as const).map(mode => (
                <button
                  key={mode}
                  onClick={() => setFilterMode(mode)}
                  style={{
                    padding: '6px 12px',
                    background: filterMode === mode ? 'var(--color-bg-active)' : 'transparent',
                    border: 'none',
                    color: filterMode === mode ? 'var(--color-text-primary)' : 'var(--color-text-tertiary)',
                    fontFamily: 'var(--font-mono)',
                    fontSize: 'var(--text-xs)',
                    letterSpacing: '0.08em',
                    textTransform: 'uppercase',
                    cursor: 'pointer',
                    transition: 'all var(--transition-snap)',
                  }}
                >
                  {mode === 'all' ? `All (${totalCount})` : `★ (${photos.filter(p => p.isFavorite).length})`}
                </button>
              ))}
            </div>

            {/* Grid density */}
            <div style={{ display: 'flex', gap: 2 }}>
              {(['sm', 'md', 'lg'] as const).map(size => (
                <button
                  key={size}
                  onClick={() => setGridSize(size)}
                  style={{
                    width: 28,
                    height: 28,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    background: gridSize === size ? 'var(--color-bg-active)' : 'transparent',
                    border: '1px solid var(--color-border-subtle)',
                    borderRadius: 'var(--radius-sm)',
                    cursor: 'pointer',
                    gap: 1.5,
                    transition: 'background var(--transition-snap)',
                  }}
                  title={`${size === 'sm' ? '8 in a row (Compact)' : size === 'md' ? '6 in a row (Standard)' : '4 in a row (Large)'} grid`}
                >
                  {/* Mini grid icon */}
                  {size === 'sm' && (
                    <svg width="10" height="10" viewBox="0 0 10 10" fill="var(--color-text-tertiary)">
                      <rect x="0" y="0" width="2" height="10" rx="0.5" />
                      <rect x="3" y="0" width="2" height="10" rx="0.5" />
                      <rect x="6" y="0" width="2" height="10" rx="0.5" />
                      <rect x="9" y="0" width="1" height="10" rx="0.5" />
                    </svg>
                  )}
                  {size === 'md' && (
                    <svg width="10" height="10" viewBox="0 0 10 10" fill="var(--color-text-tertiary)">
                      <rect x="0" y="0" width="4" height="4" rx="0.5" /><rect x="6" y="0" width="4" height="4" rx="0.5" />
                      <rect x="0" y="6" width="4" height="4" rx="0.5" /><rect x="6" y="6" width="4" height="4" rx="0.5" />
                    </svg>
                  )}
                  {size === 'lg' && (
                    <svg width="10" height="10" viewBox="0 0 10 10" fill="var(--color-text-tertiary)">
                      <rect x="0" y="0" width="10" height="10" rx="0.5" />
                    </svg>
                  )}
                </button>
              ))}
            </div>

            {/* Layout Mode Toggle: Studio Grid vs Moodboard */}
            <div style={{ display: 'flex', borderRadius: 'var(--radius-sm)', border: '1px solid var(--color-border-subtle)', overflow: 'hidden' }}>
              <button
                type="button"
                onClick={() => setLayoutStyle('uniform')}
                style={{
                  padding: '5px 9px',
                  fontSize: 10,
                  fontFamily: 'var(--font-mono)',
                  letterSpacing: '0.05em',
                  fontWeight: layoutStyle === 'uniform' ? 700 : 500,
                  background: layoutStyle === 'uniform' ? 'var(--color-bg-active)' : 'transparent',
                  color: layoutStyle === 'uniform' ? 'var(--color-text-primary)' : 'var(--color-text-tertiary)',
                  border: 'none',
                  cursor: 'pointer',
                  transition: 'all 0.15s ease',
                }}
                title="Uniform Studio Grid (un-cropped 3:2 cards, sequential order)"
              >
                STUDIO GRID
              </button>
              <button
                type="button"
                onClick={() => setLayoutStyle('masonry')}
                style={{
                  padding: '5px 9px',
                  fontSize: 10,
                  fontFamily: 'var(--font-mono)',
                  letterSpacing: '0.05em',
                  fontWeight: layoutStyle === 'masonry' ? 700 : 500,
                  background: layoutStyle === 'masonry' ? 'var(--color-bg-active)' : 'transparent',
                  color: layoutStyle === 'masonry' ? 'var(--color-text-primary)' : 'var(--color-text-tertiary)',
                  border: 'none',
                  cursor: 'pointer',
                  transition: 'all 0.15s ease',
                }}
                title="Pinterest Moodboard (staggered cards)"
              >
                MOODBOARD
              </button>
            </div>
          </div>
        </div>

        {/* Fill Slot Guidance Banner — Asks user which shot they want to choose */}
        <AnimatePresence>
          {fillSlotContext && (
            <motion.div
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: 'auto' }}
              exit={{ opacity: 0, height: 0 }}
              transition={{ duration: 0.2 }}
              style={{
                background: 'linear-gradient(90deg, rgba(109, 6, 38, 0.15) 0%, rgba(247, 241, 234, 0.95) 100%)',
                borderBottom: '2px solid var(--color-brand)',
                borderTop: '1px solid rgba(109, 6, 38, 0.25)',
                padding: '12px 24px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                gap: 16,
                flexWrap: 'wrap',
                boxShadow: '0 4px 16px rgba(0, 0, 0, 0.35)',
                zIndex: 20,
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
                <div
                  style={{
                    width: 36,
                    height: 36,
                    borderRadius: '50%',
                    background: 'var(--color-brand)',
                    color: '#F7F1EA',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    fontWeight: 900,
                    fontSize: 22,
                    boxShadow: '0 2px 10px rgba(109, 6, 38, 0.35)',
                    flexShrink: 0,
                  }}
                >
                  +
                </div>
                <div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <span
                      style={{
                        background: 'rgba(109, 6, 38, 0.12)',
                        color: 'var(--color-brand)',
                        border: '1px solid var(--color-brand)',
                        fontFamily: 'var(--font-mono)',
                        fontSize: 12,
                        fontWeight: 700,
                        padding: '2px 8px',
                        borderRadius: 3,
                        letterSpacing: '0.06em',
                      }}
                    >
                      EXTRA SPOT
                    </span>
                    <span
                      style={{
                        fontFamily: 'var(--font-display)',
                        fontSize: 'var(--text-xl)',
                        color: 'var(--color-offwhite)',
                        letterSpacing: 'var(--letter-spacing-display, 0.08em)',
                      }}
                    >
                      WHICH SHOT WOULD YOU LIKE TO ADD TO STRIP {fillSlotContext.stripIndex + 1}?
                    </span>
                  </div>
                  <p style={{ fontFamily: 'var(--font-mono)', fontSize: 13, color: 'var(--color-text-secondary)', marginTop: 2 }}>
                    Tap any shot from your roll below to pick it and complete your strip!
                  </p>
                </div>
              </div>

              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <button
                  className="btn btn-secondary btn-sm"
                  onClick={() => setFillSlotContext(null)}
                  style={{ fontSize: 13, fontFamily: 'var(--font-mono)' }}
                >
                  Cancel
                </button>
                <button
                  className="btn btn-primary btn-sm"
                  onClick={() => {
                    setFillSlotContext(null)
                    onNext()
                  }}
                  style={{
                    fontSize: 13,
                    fontWeight: 700,
                    letterSpacing: '0.04em',
                    background: 'var(--color-brand)',
                    color: '#F7F1EA',
                    display: 'flex',
                    alignItems: 'center',
                    gap: 6,
                    boxShadow: '0 2px 8px rgba(109, 6, 38, 0.35)',
                  }}
                >
                  <span style={{ fontSize: 14, fontWeight: 900 }}>+</span>
                  <span>DONE · BACK TO STRIP {fillSlotContext.stripIndex + 1}</span>
                </button>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Photo Grid — Pinterest Masonry Layout */}
        <div style={{ flex: 1, overflowY: 'auto', padding: 'var(--space-4) var(--space-6)' }}>
          {displayedPhotos.length === 0 ? (
            <div
              style={{
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                justifyContent: 'center',
                height: '100%',
                gap: 'var(--space-3)',
                color: 'var(--color-text-tertiary)',
              }}
            >
              <div
                style={{
                  width: 40,
                  height: 40,
                  borderRadius: '50%',
                  border: '1px solid var(--color-border-subtle)',
                }}
              />
              <p style={{ fontFamily: 'var(--font-mono)', fontSize: 'var(--text-xs)', textTransform: 'uppercase', letterSpacing: '0.1em' }}>
                {filterMode === 'favorites' ? 'No favorites yet.' : 'Pick a few.'}
              </p>
            </div>
          ) : layoutStyle === 'uniform' ? (
            <div
              style={{
                display: 'grid',
                gridTemplateColumns: `repeat(${columnCount}, minmax(0, 1fr))`,
                gap: 12,
                paddingBottom: 'var(--space-16)',
              }}
            >
              {displayedPhotos.map((photo, i) => {
                const isSelected = selectedIds.includes(photo.id)

                return (
                  <motion.div
                    key={photo.id}
                    className={`pinterest-pin-card${isSelected ? ' selected' : ''}`}
                    initial={{ opacity: 0, y: 12 }}
                    animate={{ opacity: 1, y: 0 }}
                    whileTap={{ y: 2, scale: 0.96 }}
                    transition={{ delay: i * 0.015, duration: 0.2, type: 'spring', stiffness: 450, damping: 18, mass: 0.8 }}
                    onClick={() => handleCardClick(photo.id, i)}
                    onDoubleClick={() => openPreview(photo.id)}
                    role="checkbox"
                    aria-checked={isSelected}
                    aria-label={`Photo ${i + 1}${isSelected ? ' (selected)' : ''}`}
                    tabIndex={0}
                    onKeyDown={e => e.key === 'Enter' && handleCardClick(photo.id, i)}
                    style={{ height: '100%', touchAction: 'manipulation' }}
                  >
                    {/* Image media container with uniform 3:2 camera aspect ratio */}
                    <div className="pinterest-pin-media" style={{ aspectRatio: '3/2', position: 'relative' }}>
                      <img
                        src={getPhotoUrl(photo.originalUrl || photo.previewUrl || photo.originalPath || photo.thumbnailUrl)}
                        alt={`Photo ${i + 1}`}
                        decoding="async"
                        style={{ width: '100%', height: '100%', objectFit: 'cover', imageRendering: 'auto' }}
                      />

                      {/* Prominent Shot Number Badge in top-left */}
                      <div
                        style={{
                          position: 'absolute',
                          top: 6,
                          left: 6,
                          background: isSelected ? 'var(--color-brand)' : 'rgba(43, 5, 16, 0.85)',
                          color: '#ffffff',
                          fontFamily: 'var(--font-mono)',
                          fontSize: 10,
                          fontWeight: 800,
                          padding: '2px 6px',
                          borderRadius: 3,
                          letterSpacing: '0.06em',
                          boxShadow: '0 2px 4px rgba(0,0,0,0.4)',
                          backdropFilter: 'blur(4px)',
                          border: isSelected ? '1px solid #ffffff' : '1px solid rgba(255,255,255,0.2)',
                          zIndex: 3,
                        }}
                      >
                        #{String(i + 1).padStart(2, '0')}
                      </div>

                      {/* Hover overlay with Quick View */}
                      <div className="pinterest-pin-overlay">
                        <button
                          className="pinterest-pin-view-btn"
                          onClick={e => {
                            e.stopPropagation()
                            openPreview(photo.id)
                          }}
                          aria-label="Preview fullscreen"
                        >
                          <svg width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.5">
                            <path d="M1 5V1h4M11 5V1H7M1 7v4h4M11 7v4H7" />
                          </svg>
                          <span>VIEW</span>
                        </button>
                        {settings.kiosk.retakeAllowance > 0 && onRetakePhoto && (
                          <button
                            className="pinterest-pin-view-btn"
                            onClick={e => {
                              e.stopPropagation()
                              onRetakePhoto(photo.id)
                            }}
                            aria-label="Retake this photo"
                            style={{ marginLeft: 6, background: 'rgba(47, 1, 14, 0.85)' }}
                          >
                            <RefreshCw size={11} />
                            <span>RETAKE</span>
                          </button>
                        )}
                      </div>

                      {/* Bonus reward tag when returning to fill a spot */}
                      {fillSlotContext && !isSelected && (
                        <div
                          style={{
                            position: 'absolute',
                            bottom: 8,
                            left: 8,
                            right: 8,
                            background: 'var(--color-brand)',
                            color: '#F7F1EA',
                            fontFamily: 'var(--font-mono)',
                            fontSize: 10,
                            fontWeight: 800,
                            textAlign: 'center',
                            padding: '5px 6px',
                            borderRadius: 4,
                            letterSpacing: '0.04em',
                            boxShadow: '0 2px 8px rgba(0, 0, 0, 0.4)',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            gap: 4,
                            zIndex: 2,
                          }}
                        >
                          <span style={{ fontSize: 13, fontWeight: 900, lineHeight: 1 }}>+</span>
                          <span>ADD TO STRIP {fillSlotContext.stripIndex + 1}</span>
                        </div>
                      )}

                      {/* Round check mark */}
                      <div className="pinterest-pin-check" aria-hidden="true">
                        {isSelected ? (
                          <svg width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="var(--color-bg)" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
                            <path d="M2.5 6.2l2.5 2.5L9.5 3.5" />
                          </svg>
                        ) : (
                          <svg width="10" height="10" viewBox="0 0 10 10" fill="none" stroke="white" strokeWidth="1.5" strokeLinecap="round" opacity="0.6">
                            <circle cx="5" cy="5" r="3.5" />
                          </svg>
                        )}
                      </div>
                    </div>

                    {/* Card footer */}
                    <div className="pinterest-pin-footer">
                      <div>
                        <div className="pinterest-pin-title">
                          SHOT {String(i + 1).padStart(2, '0')}
                        </div>
                        <div className="pinterest-pin-sub">
                          {photo.metadata?.format ? `${photo.metadata.format.toUpperCase()} · ` : ''}ROLL #1
                        </div>
                      </div>

                      {/* Star icon button */}
                      <button
                        className={`pinterest-pin-star-btn${photo.isFavorite ? ' active' : ''}`}
                        onClick={e => {
                          e.stopPropagation()
                          toggleFavorite(photo.id)
                        }}
                        title={photo.isFavorite ? 'Remove from favorites' : 'Add to favorites'}
                        aria-label={photo.isFavorite ? 'Remove from favorites' : 'Add to favorites'}
                      >
                        <svg
                          width="15"
                          height="15"
                          viewBox="0 0 24 24"
                          fill={photo.isFavorite ? 'var(--color-brand)' : 'none'}
                          stroke={photo.isFavorite ? 'var(--color-brand)' : 'currentColor'}
                          strokeWidth="2"
                          strokeLinecap="round"
                          strokeLinejoin="round"
                        >
                          <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" />
                        </svg>
                      </button>
                    </div>
                  </motion.div>
                )
              })}
            </div>
          ) : (
            <div className="pinterest-masonry-wrapper">
              {columns.map((colItems, colIdx) => (
                <div key={colIdx} className="pinterest-masonry-col">
                  {colItems.map(({ photo, originalIndex, aspectRatio }) => {
                    const isSelected = selectedIds.includes(photo.id)

                    return (
                      <motion.div
                        key={photo.id}
                        className={`pinterest-pin-card${isSelected ? ' selected' : ''}`}
                        initial={{ opacity: 0, y: 14 }}
                        animate={{ opacity: 1, y: 0 }}
                        whileTap={{ y: 2, scale: 0.96 }}
                        transition={{ delay: originalIndex * 0.02, type: 'spring', stiffness: 450, damping: 18, mass: 0.8 }}
                        onClick={() => handleCardClick(photo.id, originalIndex)}
                        onDoubleClick={() => openPreview(photo.id)}
                        role="checkbox"
                        aria-checked={isSelected}
                        aria-label={`Photo ${originalIndex + 1}${isSelected ? ' (selected)' : ''}`}
                        tabIndex={0}
                        onKeyDown={e => e.key === 'Enter' && handleCardClick(photo.id, originalIndex)}
                        style={{ touchAction: 'manipulation' }}
                      >
                        {/* Image media container with Pinterest aspect ratio */}
                        <div className="pinterest-pin-media" style={{ aspectRatio }}>
                          <img
                            src={getPhotoUrl(photo.originalUrl || photo.previewUrl || photo.originalPath || photo.thumbnailUrl)}
                            alt={`Photo ${originalIndex + 1}`}
                            decoding="async"
                            style={{ width: '100%', height: '100%', objectFit: 'cover', imageRendering: 'auto' }}
                          />

                          {/* Hover overlay with Quick View */}
                          <div className="pinterest-pin-overlay">
                            <button
                              className="pinterest-pin-view-btn"
                              onClick={e => {
                                e.stopPropagation()
                                openPreview(photo.id)
                              }}
                              aria-label="Preview fullscreen"
                            >
                              <svg width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.5">
                                <path d="M1 5V1h4M11 5V1H7M1 7v4h4M11 7v4H7" />
                              </svg>
                              <span>VIEW</span>
                            </button>
                            {settings.kiosk.retakeAllowance > 0 && onRetakePhoto && (
                              <button
                                className="pinterest-pin-view-btn"
                                onClick={e => {
                                  e.stopPropagation()
                                  onRetakePhoto(photo.id)
                                }}
                                aria-label="Retake this photo"
                                style={{ marginLeft: 6, background: 'rgba(47, 1, 14, 0.85)' }}
                              >
                                <RefreshCw size={11} />
                                <span>RETAKE</span>
                              </button>
                            )}
                          </div>

                          {/* Bonus reward tag when returning to fill a spot */}
                          {fillSlotContext && !isSelected && (
                            <div
                              style={{
                                position: 'absolute',
                                bottom: 8,
                                left: 8,
                                right: 8,
                                background: 'var(--color-brand)',
                                color: '#F7F1EA',
                                fontFamily: 'var(--font-mono)',
                                fontSize: 12,
                                fontWeight: 800,
                                textAlign: 'center',
                                padding: '5px 6px',
                                borderRadius: 4,
                                letterSpacing: '0.04em',
                                boxShadow: '0 2px 8px rgba(0, 0, 0, 0.4)',
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                                gap: 4,
                                zIndex: 2,
                              }}
                            >
                              <span style={{ fontSize: 13, fontWeight: 900, lineHeight: 1 }}>+</span>
                              <span>ADD TO STRIP {fillSlotContext.stripIndex + 1}</span>
                            </div>
                          )}

                          {/* Round Pinterest check mark */}
                          <div className="pinterest-pin-check" aria-hidden="true">
                            {isSelected ? (
                              <svg width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="var(--color-bg)" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
                                <path d="M2.5 6.2l2.5 2.5L9.5 3.5" />
                              </svg>
                            ) : (
                              <svg width="10" height="10" viewBox="0 0 10 10" fill="none" stroke="white" strokeWidth="1.5" strokeLinecap="round" opacity="0.6">
                                <circle cx="5" cy="5" r="3.5" />
                              </svg>
                            )}
                          </div>
                        </div>

                        {/* Card footer — Shot metadata on left, Pinterest star on right */}
                        <div className="pinterest-pin-footer">
                          <div>
                            <div className="pinterest-pin-title">
                              SHOT {String(originalIndex + 1).padStart(2, '0')}
                            </div>
                            <div className="pinterest-pin-sub">
                              {photo.metadata?.format ? `${photo.metadata.format.toUpperCase()} · ` : ''}ROLL #1
                            </div>
                          </div>

                          {/* Star icon button (matches Pinterest reference image) */}
                          <button
                            className={`pinterest-pin-star-btn${photo.isFavorite ? ' active' : ''}`}
                            onClick={e => {
                              e.stopPropagation()
                              toggleFavorite(photo.id)
                            }}
                            title={photo.isFavorite ? 'Remove from favorites' : 'Add to favorites'}
                            aria-label={photo.isFavorite ? 'Remove from favorites' : 'Add to favorites'}
                          >
                            <svg
                              width="15"
                              height="15"
                              viewBox="0 0 24 24"
                              fill={photo.isFavorite ? 'var(--color-brand)' : 'none'}
                              stroke={photo.isFavorite ? 'var(--color-brand)' : 'currentColor'}
                              strokeWidth="2"
                              strokeLinecap="round"
                              strokeLinejoin="round"
                            >
                              <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" />
                            </svg>
                          </button>
                        </div>
                      </motion.div>
                    )
                  })}
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* ─── Floating bottom selection tray ──────────────────────────────── */}
      <div
        className="selection-tray"
        style={{ bottom: 'var(--space-5)' }}
      >
        {/* Count */}
        <span className="selection-tray-count">{selectedCount}</span>
        <span
          style={{
            fontFamily: 'var(--font-mono)',
            fontSize: 'var(--text-xs)',
            color: 'var(--color-text-tertiary)',
            letterSpacing: '0.04em',
          }}
        >
          selected
        </span>

        <div className="selection-tray-sep" />

        {/* Actions */}
        <button
          onClick={selectAllPhotos}
          style={{
            background: 'none',
            border: 'none',
            fontFamily: 'var(--font-mono)',
            fontSize: 'var(--text-xs)',
            color: 'var(--color-text-secondary)',
            cursor: 'pointer',
            letterSpacing: '0.08em',
            textTransform: 'uppercase',
            padding: '4px',
            transition: 'color var(--transition-snap)',
          }}
          onMouseEnter={e => (e.currentTarget.style.color = 'var(--color-text-primary)')}
          onMouseLeave={e => (e.currentTarget.style.color = 'var(--color-text-secondary)')}
        >
          Select all
        </button>

        <span style={{ color: 'var(--color-border-default)', fontSize: 'var(--text-xs)' }}>·</span>

        <button
          onClick={clearPhotoSelection}
          disabled={selectedCount === 0}
          style={{
            background: 'none',
            border: 'none',
            fontFamily: 'var(--font-mono)',
            fontSize: 'var(--text-xs)',
            color: selectedCount === 0 ? 'var(--color-text-disabled)' : 'var(--color-text-secondary)',
            cursor: selectedCount === 0 ? 'not-allowed' : 'pointer',
            letterSpacing: '0.08em',
            textTransform: 'uppercase',
            padding: '4px',
            transition: 'color var(--transition-snap)',
          }}
        >
          Clear
        </button>

        <div className="selection-tray-sep" />

        {/* Primary CTA */}
        <button
          className="btn btn-primary btn-sm"
          onClick={() => {
            if (fillSlotContext) setFillSlotContext(null)
            if (session && selectedCount > 0) {
              const pps = selectedCount === 3 ? 3 : selectedCount === 2 ? 2 : selectedCount === 6 ? 3 : Math.min(4, Math.max(2, selectedCount))
              const arr = layoutEngine.calculateMinimumStripLayouts(selectedCount, pps)[0] || [pps]
              setLayout({
                photosPerStrip: pps,
                stripCount: arr.length,
                arrangement: arr,
                orientation: 'vertical',
              })
            }
            onNext()
          }}
          disabled={selectedCount === 0}
          style={{
            letterSpacing: '0.06em',
            ...(fillSlotContext ? { background: 'var(--color-brand)', color: '#F7F1EA' } : {}),
          }}
        >
          {fillSlotContext ? (
            <span style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
              <span style={{ fontSize: 14, fontWeight: 900, lineHeight: 1 }}>+</span>
              <span>DONE · RETURN TO STRIPS</span>
            </span>
          ) : (
            'USE THESE →'
          )}
        </button>
      </div>

      {/* ─── Fullscreen photo preview ─────────────────────────────────────── */}
      <AnimatePresence>
        {previewPhoto && previewPhotoObj && (
          <motion.div
            className="modal-overlay"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={closePreview}
          >
            <motion.div
              initial={{ scale: 0.92, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.92, opacity: 0 }}
              transition={{ type: 'spring', stiffness: 380, damping: 28 }}
              onClick={e => e.stopPropagation()}
              style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 'var(--space-4)', maxHeight: '90vh', maxWidth: '80vw' }}
            >
              {/* Photo */}
              <img
                src={getPhotoUrl(previewPhotoObj.originalUrl || previewPhotoObj.previewUrl || previewPhotoObj.originalPath || previewPhotoObj.thumbnailUrl)}
                alt="Preview"
                style={{
                  maxHeight: '78vh',
                  maxWidth: '100%',
                  objectFit: 'contain',
                  borderRadius: 'var(--radius-sm)',
                  border: '1px solid var(--color-border-subtle)',
                  display: 'block',
                  imageRendering: 'auto',
                }}
              />

              {/* Controls */}
              <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-3)' }}>
                <button
                  className="btn btn-secondary btn-sm"
                  onClick={prevPreview}
                  disabled={previewIndex === 0}
                >
                  ← prev
                </button>

                <span style={{ fontFamily: 'var(--font-mono)', fontSize: 'var(--text-xs)', color: 'var(--color-text-tertiary)' }}>
                  {previewIndex + 1} / {displayedPhotos.length}
                </span>

                <button
                  className={`btn btn-sm ${selectedIds.includes(previewPhotoObj.id) ? 'btn-primary' : 'btn-secondary'}`}
                  onClick={() => togglePhotoSelection(previewPhotoObj.id)}
                >
                  {selectedIds.includes(previewPhotoObj.id) ? (
                    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                      <Check size={12} strokeWidth={3} />
                      <span>Selected</span>
                    </span>
                  ) : (
                    'Select'
                  )}
                </button>

                {settings.kiosk.retakeAllowance > 0 && onRetakePhoto && (
                  <button
                    className="btn btn-secondary btn-sm"
                    onClick={() => {
                      closePreview()
                      onRetakePhoto(previewPhotoObj.id)
                    }}
                    style={{ display: 'flex', alignItems: 'center', gap: 6 }}
                  >
                    <RefreshCw size={12} />
                    <span>Retake</span>
                  </button>
                )}

                <button
                  className="btn btn-ghost btn-sm"
                  onClick={() => toggleFavorite(previewPhotoObj.id)}
                  aria-label="Toggle favorite"
                >
                  <svg
                    width="14"
                    height="14"
                    viewBox="0 0 12 12"
                    fill={previewPhotoObj.isFavorite ? '#e8512a' : 'none'}
                    stroke={previewPhotoObj.isFavorite ? '#e8512a' : 'currentColor'}
                    strokeWidth="1.5"
                  >
                    <path d="M6 10.5S1 7.5 1 3.5A2.5 2.5 0 0 1 6 2.12 2.5 2.5 0 0 1 11 3.5c0 4-5 7-5 7Z" />
                  </svg>
                </button>

                <button className="btn btn-ghost btn-sm" onClick={closePreview} aria-label="Close preview">
                  <X size={14} />
                </button>

                <button
                  className="btn btn-secondary btn-sm"
                  onClick={previewNext}
                  disabled={previewIndex === displayedPhotos.length - 1}
                >
                  next →
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}

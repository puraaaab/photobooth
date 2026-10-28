import React, { useState, useCallback, useEffect, useRef, useMemo } from 'react'
import { motion } from 'framer-motion'
import { layoutEngine } from '@/engines/LayoutEngine'
import { useSessionStore } from '@/store/sessionStore'
import { getPhotoUrl } from '@/utils/photoUrl'
import { useToast } from '@/components/ui/Toast'
import { getDefaultTemplateForPhotoCount } from '@/data/templates'
import { ArrowLeft, Plus, X, Images, AlertTriangle } from 'lucide-react'
import type { RankedLayout } from '@/types'

interface LayoutScreenProps {
  onBack: () => void
  onNext: () => void
}

const PHOTOS_PER_STRIP_OPTIONS = [2, 3, 4]

export function LayoutScreen({ onBack, onNext }: LayoutScreenProps) {
  const { session, setLayout, setStrips, setAssignments, fillSlotContext, setFillSlotContext } = useSessionStore()

  const selectedCount  = session?.selectedPhotoIds.length ?? 0
  const currentLayout  = session?.layout ?? { photosPerStrip: 4, stripCount: 1, arrangement: [], orientation: 'vertical' }

  // Smart initial photos-per-strip: match selected count when 2, 3, or multiple of 3
  const initialPhotosPerStrip = useMemo(() => {
    if (selectedCount === 3) return 3
    if (selectedCount === 2) return 2
    if (selectedCount === 6) return 3
    if (currentLayout.photosPerStrip && [2, 3, 4].includes(currentLayout.photosPerStrip)) {
      if (selectedCount > 0 && selectedCount < currentLayout.photosPerStrip) {
        return Math.max(2, selectedCount)
      }
      return currentLayout.photosPerStrip
    }
    return selectedCount <= 3 && selectedCount >= 2 ? selectedCount : 4
  }, [selectedCount, currentLayout.photosPerStrip])

  const [photosPerStrip, setPhotosPerStrip]       = useState(initialPhotosPerStrip)
  const [customStripCount, setCustomStripCount]   = useState<number | null>(null)
  const [selectedArrangement, setSelectedArrangement] = useState<number[]>([])
  const [suggestions, setSuggestions]             = useState<RankedLayout[]>([])
  const isFirstMount = useRef(true)
  const { toast } = useToast()

  // If user just arrived back from choosing an extra shot for a slot
  useEffect(() => {
    if (fillSlotContext) {
      toast(`Awesome! Your extra shot has completed Strip ${fillSlotContext.stripIndex + 1}.`, 'success')
      setFillSlotContext(null)
    }
  }, [fillSlotContext, setFillSlotContext, toast])

  const selectRecommendedLayout = useCallback((ranked: RankedLayout[]) => {
    if (ranked.length === 0) return
    const recommended = ranked.find(r => r.rank === 1) ?? ranked[0]
    setSelectedArrangement(recommended.arrangement)
  }, [])

  const handlePhotosPerStripChange = useCallback((n: number) => {
    setPhotosPerStrip(n)
    setCustomStripCount(null)
    if (selectedCount > 0) {
      const ranked = layoutEngine.rankLayoutSuggestions(selectedCount, n)
      setSuggestions(ranked)
      selectRecommendedLayout(ranked)
    }
  }, [selectedCount, selectRecommendedLayout])

  useEffect(() => {
    if (selectedCount <= 0) return
    const ranked = layoutEngine.rankLayoutSuggestions(selectedCount, photosPerStrip)
    setSuggestions(ranked)

    if (isFirstMount.current) {
      isFirstMount.current = false
      if (selectedArrangement.length === 0 && ranked.length > 0) {
        selectRecommendedLayout(ranked)
      }
    } else if (customStripCount === null) {
      // Whenever photosPerStrip changes, auto-select the recommended layout by itself
      selectRecommendedLayout(ranked)
    }
  }, [selectedCount, photosPerStrip, customStripCount, selectRecommendedLayout])

  useEffect(() => {
    if (customStripCount === null || selectedCount <= 0) return
    const customLayouts = layoutEngine.calculateUserRequestedStripCount(selectedCount, customStripCount, photosPerStrip)
    if (customLayouts.length > 0) {
      setSelectedArrangement(customLayouts[0])
    }
  }, [customStripCount, selectedCount, photosPerStrip])

  // Continuously synchronize layout, strips, and assignments to sessionStore
  useEffect(() => {
    if (selectedArrangement.length === 0 || !session) return

    const defaultSlotDef = {
      x: 80, y: 80, width: 1040, height: 800, shape: 'rectangle' as const,
    }

    const strips = layoutEngine.buildStrips(
      selectedArrangement, defaultSlotDef, 1200, selectedArrangement.length * 1100
    )

    const isSameArrangement = JSON.stringify(session.layout?.arrangement) === JSON.stringify(selectedArrangement)
    const totalSlots = strips.reduce((acc, s) => acc + s.slots.length, 0)
    const canKeepExistingAssignments = isSameArrangement && session.assignments?.length === totalSlots

    let assignments: import('@/types').PhotoAssignment[]
    if (canKeepExistingAssignments) {
      const orderedPhotoIds = session.assignments.map(a => a.photoId).filter(Boolean)
      assignments = layoutEngine.autoAssignPhotos(orderedPhotoIds, strips)
    } else {
      assignments = layoutEngine.autoAssignPhotos(session.selectedPhotoIds, strips)
    }

    // Attach matching template to each strip based on its exact slot count
    const existingStrips = session.strips ?? []
    const stripsWithTemplates = strips.map((strip, idx) => {
      const count = strip.slots.length
      const existing = existingStrips[idx]
      if (existing?.template && !existing.template.id.startsWith('classic-black') && existing.template.supportedPhotoCounts.includes(count)) {
        return { ...strip, template: existing.template }
      }
      return { ...strip, template: getDefaultTemplateForPhotoCount(count) }
    })

    const initialTemplate = stripsWithTemplates[0]?.template ?? getDefaultTemplateForPhotoCount(photosPerStrip)
    if (!session.template || session.template.id.startsWith('classic-black') || !session.template.supportedPhotoCounts.includes(stripsWithTemplates[0]?.slots.length ?? photosPerStrip)) {
      useSessionStore.getState().setTemplate(initialTemplate, false)
    }

    setLayout({
      photosPerStrip,
      stripCount: selectedArrangement.length,
      arrangement: selectedArrangement,
      orientation: 'vertical',
    })
    setStrips(stripsWithTemplates)
    setAssignments(assignments)
  }, [selectedArrangement, photosPerStrip, session?.selectedPhotoIds, setLayout, setStrips, setAssignments])

  const handleContinue = useCallback(() => {
    onNext()
  }, [onNext])

  const selectedPhotos = session?.photos.filter(p => session.selectedPhotoIds.includes(p.id)) ?? []
  const unselectedRollPhotos = session?.photos.filter(p => !session.selectedPhotoIds.includes(p.id)) ?? []
  const totalSlots = selectedArrangement.reduce((sum, n) => sum + n, 0)
  const unassignedPhotos = selectedPhotos.slice(totalSlots)

  const handleAddExtraStrip = useCallback(() => {
    const leftOut = selectedPhotos.length - totalSlots
    if (leftOut <= 0) return
    const newCount = Math.min(photosPerStrip, leftOut)
    const nextArr = [...selectedArrangement, newCount]
    setSelectedArrangement(nextArr)
    setCustomStripCount(nextArr.length)
  }, [selectedPhotos.length, totalSlots, photosPerStrip, selectedArrangement])

  const handleFitIntoPartialStrip = useCallback((stripIdx: number) => {
    if (stripIdx >= 0 && stripIdx < selectedArrangement.length && selectedArrangement[stripIdx] < photosPerStrip) {
      const nextArr = [...selectedArrangement]
      nextArr[stripIdx] += 1
      setSelectedArrangement(nextArr)
    }
  }, [selectedArrangement, photosPerStrip])

  const handleAddRollPhoto = useCallback((photoId: string, stripIdx?: number) => {
    if (!session) return
    const nextSelected = [...session.selectedPhotoIds, photoId]
    useSessionStore.getState().setSelectedPhotos(nextSelected)
    if (stripIdx !== undefined && stripIdx < selectedArrangement.length && selectedArrangement[stripIdx] < photosPerStrip) {
      const nextArr = [...selectedArrangement]
      nextArr[stripIdx] += 1
      setSelectedArrangement(nextArr)
    }
  }, [session, selectedArrangement, photosPerStrip])

  const handleChoosePhotoForSlot = useCallback((stripIdx: number) => {
    const currentInStrip = selectedArrangement[stripIdx] ?? 0
    const needed = Math.max(1, photosPerStrip - currentInStrip)
    setFillSlotContext({
      stripIndex: stripIdx,
      targetCount: photosPerStrip,
      needed,
    })
    toast(`Choose 1 more shot from your roll to complete Strip ${stripIdx + 1}!`, 'info')
    onBack()
  }, [selectedArrangement, photosPerStrip, setFillSlotContext, toast, onBack])

  const handleRemovePhoto = useCallback((photoId: string) => {
    if (!session) return
    const nextSelected = session.selectedPhotoIds.filter(id => id !== photoId)
    useSessionStore.getState().setSelectedPhotos(nextSelected)
    toast('Photo removed from selection', 'info')
  }, [session, toast])

  return (
    <div className="flex h-full overflow-hidden">
      {/* Main area */}
      <div className="flex flex-col flex-1 overflow-hidden">
        <div className="screen-toolbar" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div>
            <div className="screen-toolbar-title">Strip layout</div>
            <div className="screen-toolbar-meta">{selectedCount} photo{selectedCount !== 1 ? 's' : ''} to arrange</div>
          </div>

          <button
            type="button"
            onClick={onBack}
            className="btn btn-secondary btn-sm"
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 6,
              fontFamily: 'var(--font-mono)',
              fontSize: 12,
              padding: '6px 14px',
              borderRadius: 'var(--radius-full)',
              border: '1px solid var(--color-border-subtle)',
              touchAction: 'manipulation',
            }}
          >
            <ArrowLeft size={14} />
            <span>Choose More / Remove Photos</span>
          </button>
        </div>

        <div
          className="overflow-y-auto flex-1"
          style={{ padding: 'var(--space-6)', display: 'flex', flexDirection: 'column', gap: 'var(--space-8)' }}
        >
          {/* Selected Photos Tray — quick review, remove single photos, or choose more */}
          <section>
            <div className="panel-section-label" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span>Photos in this layout ({selectedCount})</span>
              <button
                type="button"
                onClick={onBack}
                style={{
                  background: 'none',
                  border: 'none',
                  color: 'var(--color-brand)',
                  fontFamily: 'var(--font-mono)',
                  fontSize: 11,
                  fontWeight: 700,
                  display: 'flex',
                  alignItems: 'center',
                  gap: 4,
                  cursor: 'pointer',
                  padding: 0,
                  textDecoration: 'underline',
                  textUnderlineOffset: 3,
                }}
              >
                <ArrowLeft size={12} />
                <span>Go back to choose more / deselect</span>
              </button>
            </div>

            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 8,
                overflowX: 'auto',
                padding: '10px 12px',
                background: 'var(--color-bg-elevated)',
                borderRadius: 'var(--radius-lg)',
                border: '1px solid var(--color-border-subtle)',
              }}
            >
              {selectedPhotos.map((photo, idx) => (
                <div
                  key={photo.id}
                  style={{
                    position: 'relative',
                    width: 58,
                    height: 72,
                    borderRadius: 'var(--radius-sm)',
                    overflow: 'hidden',
                    flexShrink: 0,
                    border: '1px solid rgba(255, 255, 255, 0.15)',
                    background: '#1a1a1a',
                  }}
                >
                  <img
                    src={getPhotoUrl(photo.thumbnailUrl)}
                    alt=""
                    style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                  />
                  <span
                    style={{
                      position: 'absolute',
                      bottom: 0,
                      left: 0,
                      background: 'rgba(0, 0, 0, 0.75)',
                      color: '#F7F1EA',
                      fontFamily: 'var(--font-mono)',
                      fontSize: 9,
                      fontWeight: 700,
                      padding: '2px 5px',
                      borderRadius: '0 4px 0 0',
                    }}
                  >
                    #{idx + 1}
                  </span>
                  <button
                    type="button"
                    onClick={() => handleRemovePhoto(photo.id)}
                    title="Remove this photo from selection"
                    style={{
                      position: 'absolute',
                      top: 3,
                      right: 3,
                      width: 18,
                      height: 18,
                      borderRadius: '50%',
                      background: 'rgba(201, 91, 82, 0.95)',
                      border: '1px solid rgba(255, 255, 255, 0.4)',
                      color: '#ffffff',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      cursor: 'pointer',
                      padding: 0,
                      boxShadow: '0 2px 6px rgba(0,0,0,0.4)',
                    }}
                  >
                    <X size={11} />
                  </button>
                </div>
              ))}

              {/* Add More Photos button at the end of the tray */}
              <button
                type="button"
                onClick={onBack}
                style={{
                  width: 80,
                  height: 72,
                  borderRadius: 'var(--radius-sm)',
                  border: '1.5px dashed var(--color-brand)',
                  background: 'rgba(109, 6, 38, 0.08)',
                  color: 'var(--color-brand)',
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: 4,
                  cursor: 'pointer',
                  flexShrink: 0,
                  fontFamily: 'var(--font-mono)',
                  fontSize: 10,
                  fontWeight: 700,
                  touchAction: 'manipulation',
                }}
              >
                <Plus size={16} />
                <span>+ CHOOSE MORE</span>
              </button>
            </div>
          </section>

          {/* Photos per strip — compact number row */}
          <section>
            <div className="panel-section-label">Photos per strip</div>
            <div className="pps-row">
              {PHOTOS_PER_STRIP_OPTIONS.map(n => (
                <motion.button
                  key={n}
                  className={`pps-option ${photosPerStrip === n ? 'selected' : ''}`}
                  onClick={() => handlePhotosPerStripChange(n)}
                  whileTap={{ scale: 0.94 }}
                  aria-pressed={photosPerStrip === n}
                >
                  {n}
                </motion.button>
              ))}
            </div>
          </section>

          {/* Arrangement suggestions */}
          {suggestions.length > 0 && (
            <section>
              <div className="panel-section-label">Arrangements</div>
              <div
                style={{
                  display: 'grid',
                  gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))',
                  gap: 'var(--space-3)',
                }}
              >
                {suggestions.map((layout, i) => (
                  <LayoutOptionCard
                    key={i}
                    layout={layout}
                    isSelected={JSON.stringify(layout.arrangement) === JSON.stringify(selectedArrangement)}
                    onSelect={() => { setSelectedArrangement(layout.arrangement); setCustomStripCount(null) }}
                  />
                ))}

                <CustomStripCountCard
                  selectedCount={selectedCount}
                  photosPerStrip={photosPerStrip}
                  customCount={customStripCount}
                  onCountChange={setCustomStripCount}
                  isSelected={customStripCount !== null}
                />
              </div>
            </section>
          )}

          {/* Arrangement visualizer with unassigned photos warning */}
          {selectedArrangement.length > 0 && (
            <section>
              <div className="panel-section-label" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span>
                  Preview — {selectedArrangement.join(' + ')} · {selectedArrangement.length} strip{selectedArrangement.length !== 1 ? 's' : ''}
                </span>
                {unassignedPhotos.length > 0 && (
                  <span style={{ color: 'var(--color-coral)', fontFamily: 'var(--font-mono)', fontSize: 11, fontWeight: 700, display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                    <AlertTriangle size={12} />
                    <span>{unassignedPhotos.length} PHOTO{unassignedPhotos.length > 1 ? 'S' : ''} LEFT OUT</span>
                  </span>
                )}
              </div>
              <ArrangementVisualizer
                arrangement={selectedArrangement}
                photosPerStrip={photosPerStrip}
                photos={selectedPhotos}
                unselectedRollPhotos={unselectedRollPhotos}
                onAddExtraStrip={handleAddExtraStrip}
                onFitIntoPartialStrip={handleFitIntoPartialStrip}
                onAddRollPhoto={handleAddRollPhoto}
                onChoosePhotoForSlot={handleChoosePhotoForSlot}
                onRemovePhoto={handleRemovePhoto}
                onBackToSelection={onBack}
              />
            </section>
          )}
        </div>
      </div>

      {/* Right panel — Live Strip Preview */}
      <div className="panel panel-right" style={{ display: 'flex', flexDirection: 'column', height: '100%', overflow: 'hidden' }}>
        <div className="panel-header" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <h3>Strip Preview</h3>
          <span style={{ fontSize: 10, fontFamily: 'var(--font-mono)', color: 'var(--color-brand)', fontWeight: 700 }}>
            {selectedArrangement.length} STRIP{selectedArrangement.length !== 1 ? 'S' : ''}
          </span>
        </div>
        <div className="panel-body flex flex-col gap-3 overflow-y-auto flex-1" style={{ padding: '12px' }}>
          {/* Visual Mini Strips with Actual Photos */}
          <div
            style={{
              display: 'flex',
              gap: 12,
              justifyContent: selectedArrangement.length <= 2 ? 'center' : 'flex-start',
              alignItems: 'flex-start',
              padding: '12px 8px',
              background: 'rgba(43, 5, 16, 0.04)',
              borderRadius: 'var(--radius-md)',
              border: '1px solid var(--color-border-subtle)',
              minHeight: 180,
              overflowX: 'auto',
            }}
          >
            {selectedArrangement.map((slotCount, stripIdx) => {
              let startIdx = 0
              for (let k = 0; k < stripIdx; k++) startIdx += selectedArrangement[k]
              const stripPhotos = selectedPhotos.slice(startIdx, startIdx + slotCount)

              return (
                <div
                  key={stripIdx}
                  style={{
                    width: 96,
                    background: '#2B0510',
                    borderRadius: 4,
                    padding: '8px 6px 14px 6px',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: 5,
                    boxShadow: '0 4px 14px rgba(0, 0, 0, 0.28)',
                    flexShrink: 0,
                  }}
                >
                  <div
                    style={{
                      fontSize: 8,
                      fontFamily: 'var(--font-mono)',
                      color: '#F7F1EA',
                      textAlign: 'center',
                      fontWeight: 700,
                      letterSpacing: '0.06em',
                      opacity: 0.85,
                      marginBottom: 2,
                    }}
                  >
                    STRIP {stripIdx + 1}
                  </div>

                  {Array.from({ length: slotCount }).map((_, slotI) => {
                    const photo = stripPhotos[slotI]
                    return (
                      <div
                        key={slotI}
                        style={{
                          width: '100%',
                          aspectRatio: '3/2',
                          background: '#150208',
                          borderRadius: 2,
                          overflow: 'hidden',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                        }}
                      >
                        {photo ? (
                          <img
                            src={getPhotoUrl(photo.originalUrl || photo.previewUrl || photo.thumbnailUrl)}
                            alt=""
                            style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                          />
                        ) : (
                          <span style={{ fontSize: 10, color: 'rgba(255,255,255,0.4)', fontFamily: 'var(--font-mono)' }}>+</span>
                        )}
                      </div>
                    )
                  })}

                  <div
                    style={{
                      marginTop: 4,
                      textAlign: 'center',
                      fontSize: 7.5,
                      fontFamily: 'var(--font-mono)',
                      color: 'rgba(247, 241, 234, 0.6)',
                      letterSpacing: '0.08em',
                    }}
                  >
                    PHOTOBOOTH
                  </div>
                </div>
              )
            })}
          </div>

          {/* Compact Layout Badge */}
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              padding: '6px 10px',
              background: 'rgba(109, 6, 38, 0.06)',
              borderRadius: 'var(--radius-sm)',
              border: '1px solid var(--color-border-subtle)',
              fontSize: 11,
              fontFamily: 'var(--font-mono)',
            }}
          >
            <span style={{ color: 'var(--color-text-secondary)' }}>Arrangement</span>
            <span style={{ color: 'var(--color-brand)', fontWeight: 800 }}>
              {selectedArrangement.join(' + ')} ({selectedArrangement.reduce((a, b) => a + b, 0)} slots)
            </span>
          </div>

          {/* Change Selection Quick Action Card */}
          <div
            style={{
              background: 'rgba(109, 6, 38, 0.08)',
              border: '1px solid var(--color-border-subtle)',
              borderRadius: 'var(--radius-md)',
              padding: '10px 12px',
              display: 'flex',
              flexDirection: 'column',
              gap: 8,
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <Images size={14} color="var(--color-brand)" />
              <span style={{ fontSize: 11, fontFamily: 'var(--font-mono)', fontWeight: 700, color: 'var(--color-text-primary)', letterSpacing: '0.04em' }}>
                CHANGE PHOTOS
              </span>
            </div>
            <p style={{ fontSize: 11, color: 'var(--color-text-secondary)', lineHeight: 1.4, margin: 0 }}>
              Want to pick more shots from your roll or remove unwanted ones?
            </p>
            <button
              type="button"
              className="btn btn-secondary btn-sm w-full"
              onClick={onBack}
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: 6,
                fontSize: 11,
                fontFamily: 'var(--font-mono)',
                fontWeight: 600,
                touchAction: 'manipulation',
                padding: '6px 8px',
              }}
            >
              <ArrowLeft size={13} />
              <span>← Go Back & Edit Photos</span>
            </button>
          </div>

          {unassignedPhotos.length > 0 ? (
            <div
              style={{
                background: 'rgba(201, 91, 82, 0.12)',
                border: '1px solid var(--color-coral)',
                borderRadius: 'var(--radius-md)',
                padding: 'var(--space-3)',
              }}
            >
              <div style={{ fontFamily: 'var(--font-display)', fontSize: 'var(--text-sm)', color: 'var(--color-coral)', letterSpacing: 'var(--letter-spacing-display, 0.08em)', marginBottom: 4 }}>
                DON'T LEAVE SHOTS BEHIND!
              </div>
              <p style={{ fontSize: 11, color: 'var(--color-text-secondary)', lineHeight: 1.4, marginBottom: 8 }}>
                {unassignedPhotos.length} of your chosen shots won't be printed. Add an extra strip to keep every memory!
              </p>
              <button
                className="btn btn-sm btn-primary w-full"
                onClick={handleAddExtraStrip}
                style={{ fontSize: 11, fontWeight: 700 }}
              >
                + PRINT AS EXTRA STRIP
              </button>
            </div>
          ) : (
            <div className="context-hint" style={{ marginTop: 'var(--space-2)' }}>
              All chosen photos are assigned to black vintage strips. You can swap and fine-tune individual photos in the editor next!
            </div>
          )}

          <button
            className="btn btn-primary btn-lg w-full"
            onClick={handleContinue}
            disabled={selectedArrangement.length === 0}
            style={{ marginTop: 'auto', letterSpacing: '0.04em' }}
          >
            Choose design →
          </button>
        </div>
      </div>
    </div>
  )
}

// ─── Sub-components ──────────────────────────────────────────────────────────

function LayoutOptionCard({
  layout,
  isSelected,
  onSelect,
}: {
  layout: RankedLayout
  isSelected: boolean
  onSelect: () => void
}) {
  return (
    <motion.div
      className={`layout-option-card ${isSelected ? 'selected' : ''}`}
      onClick={onSelect}
      whileHover={{ y: -3, scale: 1.02 }}
      whileTap={{ y: 2, scale: 0.96 }}
      transition={{ type: 'spring', stiffness: 450, damping: 18, mass: 0.8 }}
      role="radio"
      aria-checked={isSelected}
      tabIndex={0}
      onKeyDown={e => e.key === 'Enter' && onSelect()}
      style={{ touchAction: 'manipulation' }}
    >
      {layout.rank === 1 && (
        <div style={{ marginBottom: 'var(--space-2)' }}>
          <span className="badge badge-accent">recommended</span>
        </div>
      )}

      {/* Strip diagram — thin horizontal bars */}
      <div style={{ display: 'flex', gap: 3, justifyContent: 'center', marginBottom: 'var(--space-3)' }}>
        {layout.arrangement.map((count, i) => (
          <div
            key={i}
            className="layout-strip-diagram"
          >
            {Array.from({ length: count }, (_, j) => (
              <div key={j} className="layout-strip-bar" />
            ))}
          </div>
        ))}
      </div>

      <div style={{ textAlign: 'center' }}>
        <div
          style={{
            fontFamily: 'var(--font-display)',
            fontSize: 'var(--text-lg)',
            fontWeight: 'var(--font-bold)',
            color: 'var(--color-text-primary)',
            letterSpacing: 'var(--letter-spacing-display, 0.08em)',
            marginBottom: 2,
          }}
        >
          {layout.arrangement.join(' + ')}
        </div>
        <div style={{ fontFamily: 'var(--font-mono)', fontSize: 'var(--text-xs)', color: 'var(--color-text-tertiary)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>
          {layout.stripCount} strip{layout.stripCount !== 1 ? 's' : ''} · {layout.label}
        </div>
        {layout.unusedPhotos > 0 && (
          <div style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--color-text-tertiary)', marginTop: 2 }}>
            {layout.unusedPhotos} unassigned
          </div>
        )}
      </div>
    </motion.div>
  )
}

function CustomStripCountCard({
  selectedCount,
  photosPerStrip,
  customCount,
  onCountChange,
  isSelected,
}: {
  selectedCount: number
  photosPerStrip: number
  customCount: number | null
  onCountChange: (n: number) => void
  isSelected: boolean
}) {
  const minStrips    = Math.ceil(selectedCount / photosPerStrip)
  const currentCount = customCount ?? minStrips

  return (
    <div className={`layout-option-card ${isSelected ? 'selected' : ''}`} style={{ cursor: 'default' }}>
      <div style={{ fontFamily: 'var(--font-mono)', fontSize: 'var(--text-xs)', color: 'var(--color-text-tertiary)', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 'var(--space-3)' }}>
        Custom
      </div>

      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 'var(--space-3)' }}>
        <button
          className="btn btn-secondary btn-icon"
          onClick={() => onCountChange(Math.max(minStrips, currentCount - 1))}
          disabled={currentCount <= minStrips}
          style={{ width: 48, height: 48, fontSize: 22, borderRadius: 'var(--radius-md)', touchAction: 'manipulation' }}
          aria-label="Decrease strip count"
        >
          −
        </button>
        <span style={{ fontFamily: 'var(--font-display)', fontSize: 'var(--text-2xl)', fontWeight: 'var(--font-bold)', letterSpacing: 'var(--letter-spacing-display, 0.08em)', minWidth: 44, textAlign: 'center' }}>
          {currentCount}
        </span>
        <button
          className="btn btn-secondary btn-icon"
          onClick={() => onCountChange(currentCount + 1)}
          style={{ width: 48, height: 48, fontSize: 22, borderRadius: 'var(--radius-md)', touchAction: 'manipulation' }}
          aria-label="Increase strip count"
        >
          +
        </button>
      </div>

      <div style={{ fontFamily: 'var(--font-mono)', fontSize: 12, fontWeight: 600, color: 'var(--color-text-tertiary)', textAlign: 'center', marginTop: 'var(--space-2)' }}>
        min {minStrips} for {photosPerStrip}/strip
      </div>
    </div>
  )
}

function ArrangementVisualizer({
  arrangement,
  photosPerStrip,
  photos,
  unselectedRollPhotos = [],
  onAddExtraStrip,
  onFitIntoPartialStrip,
  onAddRollPhoto,
  onChoosePhotoForSlot,
  onRemovePhoto,
  onBackToSelection,
}: {
  arrangement: number[]
  photosPerStrip: number
  photos: Array<{ id: string; thumbnailUrl: string; previewUrl?: string; originalUrl?: string }>
  unselectedRollPhotos?: Array<{ id: string; thumbnailUrl: string; previewUrl?: string; originalUrl?: string }>
  onAddExtraStrip: () => void
  onFitIntoPartialStrip: (stripIdx: number) => void
  onAddRollPhoto?: (photoId: string, stripIdx?: number) => void
  onChoosePhotoForSlot?: (stripIdx: number) => void
  onRemovePhoto?: (photoId: string) => void
  onBackToSelection?: () => void
}) {
  let photoIdx = 0
  const totalAssigned = arrangement.reduce((sum, count) => sum + count, 0)
  const unassignedPhotos = photos.slice(totalAssigned)
  const firstPartialIdx = arrangement.findIndex(count => count < photosPerStrip)

  return (
    <div className="flex items-start gap-4" style={{ overflowX: 'auto', paddingBottom: 'var(--space-3)' }}>
      {/* Black Photo Strips */}
      {arrangement.map((count, stripIdx) => {
        const stripW       = 84
        const gap          = 2
        const padding      = 4
        const innerW       = stripW - padding * 2
        const baseSlotHeight =
          count <= 1 ? Math.round(innerW * 1.2) :
          count === 2 ? Math.round(innerW * 0.95) :
          count === 3 ? Math.round(innerW * 0.82) :
          count === 4 ? Math.round(innerW * 0.72) :
          Math.round(innerW * 0.65)
        const slotHeight = Math.round(baseSlotHeight * 1.4)
        const totalHeight  = padding * 2 + count * slotHeight + (count - 1) * gap + 14 // 14px for bottom studio stamp

        return (
          <div key={stripIdx} style={{ flexShrink: 0, width: stripW }}>
            <div
              style={{
                fontFamily: 'var(--font-mono)',
                fontSize: 10,
                color: 'var(--color-text-tertiary)',
                textAlign: 'center',
                marginBottom: 'var(--space-2)',
                textTransform: 'uppercase',
                letterSpacing: '0.08em',
              }}
            >
              Strip {stripIdx + 1} ({count}p)
            </div>
            <div
              style={{
                background: '#6D0626',
                borderRadius: 0, // Natural physical photobooth paper print (square)
                overflow: 'hidden',
                border: '1px solid rgba(255, 255, 255, 0.18)',
                boxShadow: '0 4px 14px rgba(47, 1, 14, 0.45)',
                display: 'flex',
                flexDirection: 'column',
                gap: `${gap}px`,
                padding: `${padding}px`,
                height: `${totalHeight}px`,
                position: 'relative',
              }}
            >
              {/* Assigned photos */}
              {Array.from({ length: count }, (_, slotIdx) => {
                const photo = photoIdx < photos.length ? photos[photoIdx++] : null
                return (
                  <div
                    key={slotIdx}
                    style={{
                      width: '100%',
                      height: `${slotHeight}px`,
                      borderRadius: 0,
                      overflow: 'hidden',
                      background: 'rgba(47, 1, 14, 0.35)',
                      flexShrink: 0,
                      position: 'relative',
                    }}
                  >
                    {photo ? (
                      <div style={{ position: 'relative', width: '100%', height: '100%' }}>
                        <img
                          src={getPhotoUrl(photo.originalUrl || photo.previewUrl || photo.thumbnailUrl)}
                          alt=""
                          style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }}
                        />
                        {onRemovePhoto && (
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation()
                              onRemovePhoto(photo.id)
                            }}
                            title="Remove photo from strip"
                            style={{
                              position: 'absolute',
                              top: 2,
                              right: 2,
                              width: 16,
                              height: 16,
                              borderRadius: '50%',
                              background: 'rgba(0, 0, 0, 0.75)',
                              border: '1px solid rgba(255, 255, 255, 0.4)',
                              color: '#ffffff',
                              display: 'flex',
                              alignItems: 'center',
                              justifyContent: 'center',
                              padding: 0,
                              cursor: 'pointer',
                              zIndex: 10,
                            }}
                          >
                            <X size={10} />
                          </button>
                        )}
                      </div>
                    ) : (
                      <div
                        onClick={() => onChoosePhotoForSlot && onChoosePhotoForSlot(stripIdx)}
                        style={{
                          width: '100%',
                          height: '100%',
                          display: 'flex',
                          flexDirection: 'column',
                          alignItems: 'center',
                          justifyContent: 'center',
                          color: '#FFFFFF',
                          fontSize: 12,
                          fontFamily: 'var(--font-mono)',
                          cursor: 'pointer',
                          background: 'rgba(255, 255, 255, 0.08)',
                          border: '1px dashed rgba(255, 255, 255, 0.35)',
                        }}
                      >
                        <span style={{ fontSize: 16, fontWeight: 700 }}>+</span>
                        <span>ADD SHOT</span>
                      </div>
                    )}
                  </div>
                )
              })}

              {/* Physical Photobooth Bottom Space (Plain for custom text or stickers) */}
              <div
                style={{
                  marginTop: 'auto',
                  minHeight: 22,
                  width: '100%',
                }}
              />
            </div>
          </div>
        )
      })}

      {/* ─── The "Don't Leave Me Behind!" Unassigned Photos Card ─────────────── */}
      {unassignedPhotos.length > 0 ? (
        <div
          style={{
            flexShrink: 0,
            width: 230,
            minHeight: 250,
            borderRadius: 'var(--radius-md)',
            border: '2px dashed var(--color-coral)',
            background: 'rgba(201, 91, 82, 0.10)',
            padding: '12px 14px',
            display: 'flex',
            flexDirection: 'column',
            justifyContent: 'space-between',
            position: 'relative',
          }}
        >
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 8 }}>
              <span
                style={{
                  background: 'var(--color-coral)',
                  color: '#fff',
                  fontFamily: 'var(--font-mono)',
                  fontSize: 9,
                  fontWeight: 700,
                  padding: '2px 6px',
                  borderRadius: 2,
                  letterSpacing: '0.06em',
                  textTransform: 'uppercase',
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: 4,
                }}
              >
                <AlertTriangle size={11} />
                <span>LEFT OUT</span>
              </span>
              <span
                style={{
                  fontFamily: 'var(--font-display)',
                  fontSize: 14,
                  fontWeight: 700,
                  color: 'var(--color-brand)',
                  letterSpacing: 'var(--letter-spacing-display, 0.08em)',
                }}
              >
                WAIT! DON'T LEAVE ME!
              </span>
            </div>

            {/* Thumbnails of the left-out photos */}
            <div style={{ display: 'flex', gap: 6, marginBottom: 8, overflowX: 'auto', paddingBottom: 2 }}>
              {unassignedPhotos.map((photo, i) => (
                <div
                  key={photo.id}
                  style={{
                    width: 52,
                    height: 64,
                    borderRadius: 3,
                    overflow: 'hidden',
                    border: '1px solid var(--color-coral)',
                    flexShrink: 0,
                    position: 'relative',
                    background: '#000',
                  }}
                  title={`Shot ${totalAssigned + i + 1} is left out!`}
                >
                  <img
                    src={getPhotoUrl(photo.originalUrl || photo.previewUrl || photo.thumbnailUrl)}
                    alt="Left out shot"
                    style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                  />
                  {onRemovePhoto && (
                    <button
                      type="button"
                      onClick={() => onRemovePhoto(photo.id)}
                      title="Remove from selection"
                      style={{
                        position: 'absolute',
                        top: 2,
                        right: 2,
                        width: 16,
                        height: 16,
                        borderRadius: '50%',
                        background: 'rgba(201, 91, 82, 0.95)',
                        border: 'none',
                        color: '#fff',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        cursor: 'pointer',
                        padding: 0,
                        zIndex: 2,
                      }}
                    >
                      <X size={10} />
                    </button>
                  )}
                  <div
                    style={{
                      position: 'absolute',
                      bottom: 0,
                      left: 0,
                      right: 0,
                      background: 'rgba(201, 91, 82, 0.9)',
                      color: '#fff',
                      fontSize: 8,
                      fontFamily: 'var(--font-mono)',
                      textAlign: 'center',
                      fontWeight: 700,
                      lineHeight: 1.2,
                      padding: 1,
                    }}
                  >
                    UNUSED
                  </div>
                </div>
              ))}
            </div>

            <p style={{ fontSize: 11, color: 'var(--color-text-secondary)', lineHeight: 1.45, marginBottom: 10 }}>
              {unassignedPhotos.length === 1
                ? 'This shot was selected, but the strips are full. Don’t discard it in the darkroom!'
                : `${unassignedPhotos.length} shots were selected but don’t fit into the current strips!`}
            </p>
          </div>

          {/* High-conversion upsell actions */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            {firstPartialIdx !== -1 && (
              <button
                className="btn btn-sm"
                onClick={() => onFitIntoPartialStrip(firstPartialIdx)}
                style={{
                  background: 'var(--color-coral)',
                  color: '#fff',
                  border: 'none',
                  fontSize: 10,
                  fontWeight: 700,
                  letterSpacing: '0.04em',
                  width: '100%',
                  padding: '6px 8px',
                }}
              >
                + FIT INTO STRIP {firstPartialIdx + 1} (MAKE IT {arrangement[firstPartialIdx] + 1})
              </button>
            )}

            <button
              className="btn btn-sm btn-primary"
              onClick={onAddExtraStrip}
              style={{
                fontSize: 10,
                fontWeight: 700,
                letterSpacing: '0.04em',
                width: '100%',
                padding: '6px 8px',
              }}
            >
              + PRINT EXTRA STRIP ({unassignedPhotos.length} SHOT{unassignedPhotos.length > 1 ? 'S' : ''})
            </button>

            {firstPartialIdx !== -1 && onChoosePhotoForSlot && (
              <button
                className="btn btn-sm btn-secondary"
                onClick={() => onChoosePhotoForSlot(firstPartialIdx)}
                style={{
                  fontSize: 10,
                  fontFamily: 'var(--font-mono)',
                  letterSpacing: '0.04em',
                  width: '100%',
                  padding: '6px 8px',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: 5,
                }}
              >
                <span style={{ fontSize: 16, fontWeight: 700, color: 'var(--color-brand)' }}>+</span>
                <span>ADD ANOTHER FROM ROLL</span>
              </button>
            )}

            {onBackToSelection && (
              <button
                type="button"
                className="btn btn-sm btn-ghost"
                onClick={onBackToSelection}
                style={{
                  fontSize: 10,
                  fontFamily: 'var(--font-mono)',
                  color: 'var(--color-coral)',
                  width: '100%',
                  padding: '5px 8px',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: 4,
                  textDecoration: 'underline',
                  textUnderlineOffset: 2,
                }}
              >
                <ArrowLeft size={11} />
                <span>OR GO BACK TO DESELECT</span>
              </button>
            )}
          </div>
        </div>
      ) : unassignedPhotos.length === 0 ? (
        /* ─── Perfect Fit Confirmation Card ───────────────────────────────── */
        <div
          style={{
            flexShrink: 0,
            width: 230,
            minHeight: 220,
            borderRadius: 'var(--radius-md)',
            border: '1px solid rgba(52, 211, 153, 0.35)',
            background: 'linear-gradient(180deg, rgba(52, 211, 153, 0.12) 0%, rgba(0, 48, 51, 0.4) 100%)',
            padding: '14px',
            display: 'flex',
            flexDirection: 'column',
            justifyContent: 'space-between',
            boxShadow: '0 4px 16px rgba(0, 0, 0, 0.3)',
          }}
        >
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 8 }}>
              <span
                style={{
                  background: 'rgba(52, 211, 153, 0.25)',
                  color: '#34d399',
                  border: '1px solid rgba(52, 211, 153, 0.4)',
                  fontFamily: 'var(--font-mono)',
                  fontSize: 9,
                  fontWeight: 700,
                  padding: '2px 7px',
                  borderRadius: 2,
                  letterSpacing: '0.06em',
                  display: 'flex',
                  alignItems: 'center',
                  gap: 4,
                }}
              >
                <span>✦</span>
                <span>PERFECT FIT</span>
              </span>
            </div>

            <div style={{ fontFamily: 'var(--font-display)', fontSize: 15, color: 'var(--color-offwhite)', letterSpacing: 'var(--letter-spacing-display, 0.08em)', marginBottom: 6 }}>
              {arrangement.join(' + ')} LAYOUT
            </div>

            <p style={{ fontSize: 11, color: 'var(--color-text-secondary)', lineHeight: 1.45, marginBottom: 10 }}>
              All {totalAssigned} photos assigned across {arrangement.length} strip{arrangement.length !== 1 ? 's' : ''}:
            </p>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 4, fontSize: 11, fontFamily: 'var(--font-mono)', color: 'var(--color-text-primary)' }}>
              {arrangement.map((cnt, i) => (
                <div key={i} style={{ display: 'flex', justifyContent: 'space-between', padding: '3px 6px', background: 'rgba(109, 6, 38, 0.06)', borderRadius: 3 }}>
                  <span>Strip {i + 1}</span>
                  <span style={{ color: 'var(--color-brand)', fontWeight: 700 }}>{cnt} photo{cnt !== 1 ? 's' : ''}</span>
                </div>
              ))}
            </div>
          </div>

          <div style={{ fontSize: 10, color: 'var(--color-text-tertiary)', fontFamily: 'var(--font-mono)', textAlign: 'center', marginTop: 8 }}>
            Each strip gets matching templates next →
          </div>
        </div>
      ) : null}
    </div>
  )
}

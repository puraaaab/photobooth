import React, { useState, useCallback } from 'react'
import { motion } from 'framer-motion'
import { Edit3, Palette, Image, Printer, Eye, Layout, ChevronLeft, ChevronRight, FileText, Scissors, Sparkles } from 'lucide-react'
import { useSessionStore } from '@/store/sessionStore'
import { getPhotoUrl } from '@/utils/photoUrl'
import { filterEngine } from '@/engines/FilterEngine'
import { boothCopy } from '@/constants/boothCopy'
import { PrintCopiesModal } from '@/components/modals/PrintCopiesModal'
import { useQueueStore } from '@/store/queueStore'
import { stripLimitForPlan } from '@/constants/pricing'
import type { AppStep } from '@/constants/steps'

interface PreviewScreenProps {
  onBack: () => void
  onNext: () => void
  onGoToStep: (step: AppStep) => void
}

export function PreviewScreen({ onBack, onNext, onGoToStep }: PreviewScreenProps) {
  const { session, setPrintSettings } = useSessionStore()
  // Plan of this guest's ticket → strips already paid for (copies beyond it show their price)
  const ticketForPlan = useQueueStore(st => (session?.ticketId ? st.tickets.find(t => t.id === session.ticketId) : undefined) || st.activeTicket)
  const includedStrips = stripLimitForPlan(ticketForPlan?.planType ?? ticketForPlan?.paymentAmount)
  const [viewMode, setViewMode] = useState<'single' | 'all' | 'a4'>('all')
  const [a4LayoutMode, setA4LayoutMode] = useState<'a4-5' | 'a4-6' | 'a4-8' | 'a4-4'>('a4-5')
  const [activeStripIndex, setActiveStripIndex] = useState(0)
  const [showCopiesModal, setShowCopiesModal] = useState(false)

  const canvasAreaRef = React.useRef<HTMLDivElement>(null)
  const [containerHeight, setContainerHeight] = useState<number>(() =>
    typeof window !== 'undefined' ? Math.max(300, window.innerHeight - 150) : 550
  )

  React.useEffect(() => {
    const el = canvasAreaRef.current
    if (!el) return

    const updateHeight = () => {
      if (el.clientHeight > 50) {
        setContainerHeight(el.clientHeight)
      }
    }

    updateHeight()
    const ro = new ResizeObserver(updateHeight)
    ro.observe(el)
    window.addEventListener('resize', updateHeight)

    return () => {
      ro.disconnect()
      window.removeEventListener('resize', updateHeight)
    }
  }, [])

  const strips = session?.strips ?? []
  const photos = session?.photos ?? []
  const assignments = session?.assignments ?? []
  const template = session?.template

  const getPhotoForSlot = useCallback((slotId: string) => {
    const assignment = assignments.find(a => a.slotId === slotId)
    if (!assignment) return undefined
    return photos.find(p => p.id === assignment.photoId)
  }, [assignments, photos])

  const activeStrip = strips[activeStripIndex]

  const bg = template?.background
  let bgStyle: React.CSSProperties = {}
  if (bg?.type === 'solid') bgStyle.background = bg.color
  else if (bg?.type === 'gradient' && bg.gradient) {
    const { angle, stops } = bg.gradient
    bgStyle.background = `linear-gradient(${angle ?? 135}deg, ${stops.map(s => `${s.color} ${s.offset * 100}%`).join(', ')})`
  } else {
    bgStyle.background = '#6D0626'
  }

  const border = template?.border
  if (border && border.type !== 'none') {
    bgStyle.border = `${border.width ?? 2}px solid ${border.color ?? '#cccccc'}`
  }

  function StripPreview({
    strip,
    width: passedWidth,
    maxContainerHeight,
    fixedHeight,
    isInteractive = false,
    onClick,
    hideFooter = false,
  }: {
    strip: typeof strips[0]
    width?: number
    maxContainerHeight?: number
    fixedHeight?: number
    isInteractive?: boolean
    onClick?: () => void
    hideFooter?: boolean
  }) {
    const slotCount = strip.slots.length
    const slotRatio =
      slotCount <= 1 ? 1.2 :
      slotCount === 2 ? 0.9 :
      slotCount === 3 ? 0.82 :
      slotCount === 4 ? 0.75 :
      0.65

    // Proportional height multiplier (with user-requested +40% slot height)
    const multiplier = slotCount * (slotRatio * 1.4)

    // Calculate dynamically fitted width so the strip NEVER overflows container height
    let width = passedWidth ?? 220
    if (maxContainerHeight && maxContainerHeight > 100) {
      const isCompact = maxContainerHeight < 450
      const estMargin = isCompact ? 5 : 8
      const estGap = isCompact ? 3 : 5
      const estFooter = hideFooter ? 0 : (isCompact ? 22 : 32)
      const fixedOverhead = (slotCount - 1) * estGap + 2 * estMargin + estFooter + 10
      const availForSlots = Math.max(60, maxContainerHeight - fixedOverhead)
      const maxFittedInner = availForSlots / multiplier
      const fittedWidth = Math.floor(maxFittedInner + 2 * estMargin)
      width = Math.max(85, Math.min(passedWidth ?? 280, fittedWidth))
    }

    const isMini = width < 160
    const margin = isMini ? 5 : 8
    const innerWidth = width - margin * 2
    const gap = isMini ? 3 : 5
    const baseSlotHeight = Math.round(innerWidth * slotRatio)
    // Height increased by 40% (or distributed across fixedHeight if explicitly provided)
    const slotHeight = fixedHeight
      ? Math.max(30, Math.round((fixedHeight - (slotCount - 1) * gap - 2 * margin - (hideFooter ? 0 : 26)) / slotCount))
      : Math.round(baseSlotHeight * 1.4)

    const stripTemplate = strip.template ?? template
    const stripBg = stripTemplate?.background
    let stripBgStyle: React.CSSProperties = {}
    if (stripBg?.type === 'solid') stripBgStyle.background = stripBg.color
    else if (stripBg?.type === 'gradient' && stripBg.gradient) {
      const { angle, stops } = stripBg.gradient
      stripBgStyle.background = `linear-gradient(${angle ?? 135}deg, ${stops.map(s => `${s.color} ${s.offset * 100}%`).join(', ')})`
    } else {
      stripBgStyle.background = '#6D0626'
    }

    const stripBorder = stripTemplate?.border
    if (stripBorder && stripBorder.type !== 'none') {
      stripBgStyle.border = `${stripBorder.width ?? 2}px solid ${stripBorder.color ?? '#cccccc'}`
    }

    const is35mm = stripTemplate?.id.includes('vintage-35mm')
    const isPixel = stripTemplate?.id.includes('pixel-romance')
    const isCinema = stripTemplate?.id.includes('cinema-ticket')
    const isCatchYours = stripTemplate?.id.includes('catch-yours')
    const isPapit = stripTemplate?.id.includes('papit')

    if (stripTemplate?.overlayImageUrl && stripTemplate.photoSlots?.length) {
      const aspect = stripTemplate.canvas.height / stripTemplate.canvas.width
      let finalW = width
      let finalH = fixedHeight ? fixedHeight : Math.round(finalW * aspect)
      if (maxContainerHeight && finalH > maxContainerHeight) {
        finalH = maxContainerHeight
        finalW = Math.floor(finalH / aspect)
      }

      return (
        <div
          onClick={onClick}
          style={{
            ...(stripTemplate?.overlayImageUrl ? { background: 'transparent', border: 'none', boxShadow: 'none' } : {
              ...stripBgStyle,
              border: '1px solid var(--color-border-default)',
              boxShadow: isMini ? '0 2px 8px rgba(0,0,0,0.35)' : 'none',
            }),
            borderRadius: 0,
            overflow: 'hidden',
            width: finalW,
            height: finalH,
            flexShrink: 0,
            cursor: isInteractive ? 'pointer' : 'default',
            transition: 'border-color var(--transition-fast)',
            userSelect: 'none',
            position: 'relative',
          }}
        >
          {stripTemplate.photoSlots.map((slot, i) => {
            const photo = (slot.id ? getPhotoForSlot(slot.id) : undefined) || (strip.slots[i] ? getPhotoForSlot(strip.slots[i].id) : undefined)
            const leftPct = (slot.x / stripTemplate.canvas.width) * 100
            const topPct = (slot.y / stripTemplate.canvas.height) * 100
            const widthPct = (slot.width / stripTemplate.canvas.width) * 100
            const heightPct = (slot.height / stripTemplate.canvas.height) * 100
            const cssFilter = photo?.edits ? filterEngine.getCSSFilter(photo.edits) : 'none'
            const scaleRatio = finalW / 240
            const photoScale = photo?.edits?.scale ?? 1
            // When scale <= 1.05, clamp pan to 0 so unzoomed photos are perfectly framed and never cut out
            const maxPanX = photoScale > 1.05 ? Math.max(0, (photoScale - 1) * 70) : 0
            const maxPanY = photoScale > 1.05 ? Math.max(0, (photoScale - 1) * 70) : 0
            const rawPanX = photo?.edits?.panX ?? 0
            const rawPanY = photo?.edits?.panY ?? 0
            const clampedPanX = Math.max(-maxPanX, Math.min(maxPanX, rawPanX)) * scaleRatio
            const clampedPanY = Math.max(-maxPanY, Math.min(maxPanY, rawPanY)) * scaleRatio

            const transform = photo?.edits
              ? `rotate(${photo.edits.rotation || 0}deg) scaleX(${photo.edits.flipH ? -1 : 1}) scaleY(${photo.edits.flipV ? -1 : 1}) scale(${photoScale}) translate(${clampedPanX}px, ${clampedPanY}px)`
              : undefined

            return (
              <div
                key={slot.id || i}
                style={{
                  position: 'absolute',
                  left: `${leftPct}%`,
                  top: `${topPct}%`,
                  width: `${widthPct}%`,
                  height: `${heightPct}%`,
                  overflow: 'hidden',
                  background: '#1a1a1a',
                  transform: slot.rotation ? `rotate(${slot.rotation}deg)` : undefined,
                  transformOrigin: 'center center',
                }}
              >
                {photo ? (
                  <img
                    src={getPhotoUrl(photo.originalUrl || photo.previewUrl || photo.thumbnailUrl)}
                    alt=""
                    style={{
                      width: '100%',
                      height: '100%',
                      objectFit: 'cover',
                      filter: cssFilter,
                      transform,
                    }}
                  />
                ) : (
                  <div style={{ width: '100%', height: '100%', background: '#2a2a2a' }} />
                )}
              </div>
            )
          })}
          <img
            src={stripTemplate.overlayImageUrl}
            alt=""
            style={{
              position: 'absolute',
              top: 0,
              left: 0,
              width: '100%',
              height: '100%',
              objectFit: 'fill',
              pointerEvents: 'none',
              zIndex: 10,
            }}
          />

          {/* Movable Canvas Elements */}
          {session?.canvasElements?.filter(el => !el.stripId || el.stripId === strip.id).map(el => {
            if (el.type === 'sticker' && el.props && 'url' in el.props) {
              const canvasW = stripTemplate.canvas.width
              const canvasH = stripTemplate.canvas.height
              const leftPct = (el.x / canvasW) * 100
              const topPct = (el.y / canvasH) * 100
              const widthPct = (el.width / canvasW) * 100
              const heightPct = (el.height / canvasH) * 100

              return (
                <div
                  key={el.id}
                  style={{
                    position: 'absolute',
                    left: `${leftPct}%`,
                    top: `${topPct}%`,
                    width: `${widthPct}%`,
                    height: `${heightPct}%`,
                    transform: el.rotation ? `rotate(${el.rotation}deg)` : undefined,
                    zIndex: el.zIndex ?? 25,
                    pointerEvents: 'none',
                    opacity: el.opacity ?? 1,
                  }}
                >
                  <img
                    src={(el.props as any).url}
                    alt=""
                    style={{ width: '100%', height: '100%', objectFit: 'contain', display: 'block' }}
                  />
                </div>
              )
            }

            if (el.type !== 'text' || !el.textProps) return null
            const canvasW = stripTemplate.canvas.width
            const canvasH = stripTemplate.canvas.height
            const leftPct = (el.x / canvasW) * 100
            const topPct = (el.y / canvasH) * 100
            const widthPct = (el.width / canvasW) * 100
            const scale = finalW / canvasW
            const fontSize = Math.max(7, Math.round(el.textProps.fontSize * scale))

            return (
              <div
                key={el.id}
                style={{
                  position: 'absolute',
                  left: `${leftPct}%`,
                  top: `${topPct}%`,
                  width: `${widthPct}%`,
                  transform: el.rotation ? `rotate(${el.rotation}deg)` : undefined,
                  zIndex: 25,
                  pointerEvents: 'none',
                  color: el.textProps.color,
                  fontSize,
                  fontFamily: el.textProps.fontFamily,
                  fontWeight: el.textProps.fontWeight,
                  fontStyle: el.textProps.fontStyle,
                  textAlign: el.textProps.align,
                  lineHeight: el.textProps.lineHeight ?? 1.2,
                  letterSpacing: el.textProps.letterSpacing ? `${el.textProps.letterSpacing * scale}px` : undefined,
                  wordBreak: 'break-word',
                }}
              >
                {el.textProps.text}
              </div>
            )
          })}
        </div>
      )
    }

    return (
      <div
        onClick={onClick}
        style={{
          ...stripBgStyle,
          borderRadius: 0, // Natural physical photobooth paper print (square)
          overflow: 'hidden',
          width,
          height: fixedHeight ? fixedHeight : undefined,
          maxHeight: maxContainerHeight ? maxContainerHeight : undefined,
          display: 'flex',
          flexDirection: 'column',
          gap,
          padding: is35mm || isPapit
            ? `${margin}px ${margin + (isMini ? 4 : 8)}px ${margin + (isMini ? 1 : 2)}px ${margin + (isMini ? 4 : 8)}px`
            : `${margin}px ${margin}px ${margin + (isMini ? 1 : 2)}px ${margin}px`,
          border: '1px solid var(--color-border-default)',
          flexShrink: 0,
          cursor: isInteractive ? 'pointer' : 'default',
          transition: 'border-color var(--transition-fast)',
          userSelect: 'none',
          boxShadow: isMini ? '0 2px 8px rgba(0,0,0,0.35)' : 'none',
          position: 'relative',
        }}
      >
        {/* 35mm Sprocket Perforations */}
        {is35mm && (
          <>
            <div style={{ position: 'absolute', left: 2, top: 4, bottom: 4, width: isMini ? 3 : 5, background: 'repeating-linear-gradient(to bottom, #f0ede6 0px, #f0ede6 4px, transparent 4px, transparent 10px)', borderRadius: 1, pointerEvents: 'none', zIndex: 2 }} />
            <div style={{ position: 'absolute', right: 2, top: 4, bottom: 4, width: isMini ? 3 : 5, background: 'repeating-linear-gradient(to bottom, #f0ede6 0px, #f0ede6 4px, transparent 4px, transparent 10px)', borderRadius: 1, pointerEvents: 'none', zIndex: 2 }} />
          </>
        )}

        {/* PapIt Film Strip Rails & Sprockets */}
        {isPapit && (
          <>
            <div style={{ position: 'absolute', left: 0, top: 0, bottom: 0, width: isMini ? 6 : 10, background: '#141210', zIndex: 2 }} />
            <div style={{ position: 'absolute', left: isMini ? 1 : 2, top: 4, bottom: 4, width: isMini ? 4 : 6, background: 'repeating-linear-gradient(to bottom, #FBF7EE 0px, #FBF7EE 4px, transparent 4px, transparent 10px)', borderRadius: 1, pointerEvents: 'none', zIndex: 3 }} />
            <div style={{ position: 'absolute', right: 0, top: 0, bottom: 0, width: isMini ? 6 : 10, background: '#141210', zIndex: 2 }} />
            <div style={{ position: 'absolute', right: isMini ? 1 : 2, top: 4, bottom: 4, width: isMini ? 4 : 6, background: 'repeating-linear-gradient(to bottom, #FBF7EE 0px, #FBF7EE 4px, transparent 4px, transparent 10px)', borderRadius: 1, pointerEvents: 'none', zIndex: 3 }} />
          </>
        )}


        {strip.slots.map((slot) => {
          const photo = getPhotoForSlot(slot.id)
          return (
            <div
              key={slot.id}
              style={{
                height: slotHeight,
                maxHeight: '100%',
                borderRadius: 0,
                overflow: 'hidden',
                background: isCatchYours ? '#ffffff' : '#e2ded5',
                flexShrink: 1,
                minHeight: 0,
                zIndex: 1,
                position: 'relative',
                ...(isPixel ? {
                  border: `${isMini ? 1 : 2}px solid #c9182b`,
                  boxShadow: '0 0 0 1px rgba(201, 24, 43, 0.3)',
                } : isCinema ? {
                  border: `${isMini ? 1 : 2}px solid #8A1C24`,
                  background: '#FAF5EC',
                } : isCatchYours ? {
                  border: '1px solid rgba(0,0,0,0.1)',
                  padding: isMini ? '1px 1px 3px 1px' : '3px 3px 6px 3px',
                  boxShadow: '0 2px 4px rgba(0,0,0,0.12)',
                } : {}),
              }}
            >
              {photo && (() => {
                const scaleRatio = (width ?? 220) / 240
                const photoScale = photo.edits.scale ?? 1
                const maxPanX = photoScale > 1.05 ? Math.max(0, (photoScale - 1) * 70) : 0
                const maxPanY = photoScale > 1.05 ? Math.max(0, (photoScale - 1) * 70) : 0
                const rawPanX = photo.edits.panX ?? 0
                const rawPanY = photo.edits.panY ?? 0
                const clampedPanX = Math.max(-maxPanX, Math.min(maxPanX, rawPanX)) * scaleRatio
                const clampedPanY = Math.max(-maxPanY, Math.min(maxPanY, rawPanY)) * scaleRatio

                return (
                  <img
                    src={getPhotoUrl(photo.originalUrl || photo.previewUrl || photo.thumbnailUrl)}
                    alt=""
                    style={{
                      width: '100%',
                      height: '100%',
                      objectFit: 'cover',
                      filter: filterEngine.getCSSFilter(photo.edits),
                      transform: `rotate(${photo.edits.rotation}deg) scaleX(${photo.edits.flipH ? -1 : 1}) scaleY(${photo.edits.flipV ? -1 : 1}) scale(${photoScale}) translate(${clampedPanX}px, ${clampedPanY}px)`,
                    }}
                  />
                )
              })()}
            </div>
          )
        })}


        {/* Photobooth Strip Footer */}
        {!hideFooter && (
          <div
            style={{
              marginTop: 'auto',
              paddingTop: isMini ? 3 : 8,
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              gap: isMini ? 1 : 2,
              borderTop: '1px dashed rgba(0, 0, 0, 0.15)',
            }}
          >
            <span style={{ fontFamily: 'var(--font-mono)', fontSize: isMini ? 6 : 9, fontWeight: 700, letterSpacing: '0.12em', color: '#5c5954' }}>
              PHOTOBOOTH
            </span>
            {!isMini && (
              <span style={{ fontSize: 8, fontFamily: 'var(--font-mono)', color: '#9e9b95', letterSpacing: '0.06em' }}>
                {new Date().toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }).toUpperCase()}
              </span>
            )}
          </div>
        )}

        {/* Movable Canvas Elements */}
        {session?.canvasElements?.filter(el => !el.stripId || el.stripId === strip.id).map(el => {
          if (el.type === 'sticker' && el.props && 'url' in el.props) {
            const canvasW = stripTemplate?.canvas?.width ?? 1200
            const canvasH = stripTemplate?.canvas?.height ?? 3600
            const leftPct = (el.x / canvasW) * 100
            const topPct = (el.y / canvasH) * 100
            const widthPct = (el.width / canvasW) * 100
            const heightPct = (el.height / canvasH) * 100

            return (
              <div
                key={el.id}
                style={{
                  position: 'absolute',
                  left: `${leftPct}%`,
                  top: `${topPct}%`,
                  width: `${widthPct}%`,
                  height: `${heightPct}%`,
                  transform: el.rotation ? `rotate(${el.rotation}deg)` : undefined,
                  zIndex: el.zIndex ?? 25,
                  pointerEvents: 'none',
                  opacity: el.opacity ?? 1,
                }}
              >
                <img
                  src={(el.props as any).url}
                  alt=""
                  style={{ width: '100%', height: '100%', objectFit: 'contain', display: 'block' }}
                />
              </div>
            )
          }

          if (el.type !== 'text' || !el.textProps) return null
          const canvasW = stripTemplate?.canvas?.width ?? 1200
          const canvasH = stripTemplate?.canvas?.height ?? 3600
          const leftPct = (el.x / canvasW) * 100
          const topPct = (el.y / canvasH) * 100
          const widthPct = (el.width / canvasW) * 100
          const scale = width / canvasW
          const fontSize = Math.max(7, Math.round(el.textProps.fontSize * scale))

          return (
            <div
              key={el.id}
              style={{
                position: 'absolute',
                left: `${leftPct}%`,
                top: `${topPct}%`,
                width: `${widthPct}%`,
                transform: el.rotation ? `rotate(${el.rotation}deg)` : undefined,
                zIndex: 25,
                pointerEvents: 'none',
                color: el.textProps.color,
                fontSize,
                fontFamily: el.textProps.fontFamily,
                fontWeight: el.textProps.fontWeight,
                fontStyle: el.textProps.fontStyle,
                textAlign: el.textProps.align,
                lineHeight: el.textProps.lineHeight ?? 1.2,
                letterSpacing: el.textProps.letterSpacing ? `${el.textProps.letterSpacing * scale}px` : undefined,
                wordBreak: 'break-word',
              }}
            >
              {el.textProps.text}
            </div>
          )
        })}
      </div>
    )
  }

  return (
    <div className="flex h-full overflow-hidden preview-layout" style={{ background: 'var(--color-bg-base)' }}>
      {/* Main preview area */}
      <div className="canvas-area flex-1 flex flex-col">
        {/* Top header bar */}
        <div
          style={{
            padding: '10px 20px',
            borderBottom: '1px solid var(--color-border-subtle)',
            background: 'var(--color-bg-surface)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            flexShrink: 0,
            width: '100%',
          }}
        >
          <div>
            <h2 style={{ fontFamily: 'var(--font-display)', fontSize: 'var(--text-lg)', fontWeight: 700, letterSpacing: 'var(--letter-spacing-display, 0.08em)', color: 'var(--color-text-primary)' }}>
              Final Preview
            </h2>
            <p style={{ fontSize: 11, fontFamily: 'var(--font-mono)', color: 'var(--color-text-secondary)', marginTop: 2 }}>
              {strips.length} STRIP{strips.length !== 1 ? 'S' : ''} READY · {viewMode === 'a4' ? `A4 SHEET (${a4LayoutMode === 'a4-6' ? '6 STRIPS · HORIZONTAL' : a4LayoutMode === 'a4-4' ? '4 STRIPS' : '8 STRIPS'})` : viewMode.toUpperCase()}
            </p>
          </div>

          <div style={{ display: 'flex', gap: 4, background: 'var(--color-bg-base)', padding: 3, borderRadius: 'var(--radius-full)', border: '1px solid var(--color-border-subtle)' }}>
            <button
              onClick={() => setViewMode('all')}
              style={{
                padding: '5px 12px',
                fontSize: 11,
                fontFamily: 'var(--font-mono)',
                border: 'none',
                background: viewMode === 'all' ? 'var(--color-bg-elevated)' : 'transparent',
                color: viewMode === 'all' ? 'var(--color-text-primary)' : 'var(--color-text-tertiary)',
                cursor: 'pointer',
                borderRadius: 'var(--radius-full)',
                display: 'flex',
                alignItems: 'center',
                gap: 5,
                transition: 'all var(--transition-fast)',
              }}
            >
              <Layout size={12} />
              <span>ALL STRIPS</span>
            </button>
            <button
              onClick={() => setViewMode('single')}
              style={{
                padding: '5px 12px',
                fontSize: 11,
                fontFamily: 'var(--font-mono)',
                border: 'none',
                background: viewMode === 'single' ? 'var(--color-bg-elevated)' : 'transparent',
                color: viewMode === 'single' ? 'var(--color-text-primary)' : 'var(--color-text-tertiary)',
                cursor: 'pointer',
                borderRadius: 'var(--radius-full)',
                display: 'flex',
                alignItems: 'center',
                gap: 5,
                transition: 'all var(--transition-fast)',
              }}
            >
              <Eye size={12} />
              <span>SINGLE STRIP</span>
            </button>
            <button
              onClick={() => setViewMode('a4')}
              style={{
                padding: '5px 12px',
                fontSize: 11,
                fontFamily: 'var(--font-mono)',
                border: 'none',
                background: viewMode === 'a4' ? 'var(--color-brand)' : 'transparent',
                color: viewMode === 'a4' ? '#ffffff' : 'var(--color-text-secondary)',
                cursor: 'pointer',
                borderRadius: 'var(--radius-full)',
                display: 'flex',
                alignItems: 'center',
                gap: 5,
                fontWeight: 700,
                boxShadow: viewMode === 'a4' ? '0 2px 8px rgba(109, 6, 38, 0.4)' : 'none',
                transition: 'all var(--transition-fast)',
              }}
            >
              <FileText size={12} />
              <span>A4 SHEET PREVIEW</span>
            </button>
          </div>
        </div>

        {/* Canvas area */}
        <div
          ref={canvasAreaRef}
          className="flex items-center justify-center flex-1"
          style={{
            padding: '12px 16px',
            position: 'relative',
            overflowY: 'hidden',
            overflowX: viewMode === 'all' ? 'auto' : 'hidden',
            height: '100%',
            width: '100%',
          }}
        >
          {viewMode === 'single' && activeStrip ? (
            <motion.div
              key={activeStripIndex}
              initial={{ opacity: 0, scale: 0.98 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ duration: 0.15 }}
              style={{
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                justifyContent: 'center',
                gap: 10,
                height: '100%',
                maxHeight: '100%',
                overflow: 'hidden',
              }}
            >
              <StripPreview
                strip={activeStrip}
                width={280}
                maxContainerHeight={Math.max(200, containerHeight - (strips.length > 1 ? 70 : 25))}
              />

              {strips.length > 1 && (
                <div className="flex items-center gap-2" style={{ marginTop: 2, flexShrink: 0 }}>
                  <button
                    className="btn btn-secondary btn-icon btn-sm"
                    onClick={() => setActiveStripIndex(i => Math.max(0, i - 1))}
                    disabled={activeStripIndex === 0}
                    title="Previous"
                  >
                    <ChevronLeft size={16} />
                  </button>

                  <div className="flex items-center gap-1">
                    {strips.map((s, i) => (
                      <button
                        key={i}
                        onClick={() => setActiveStripIndex(i)}
                        style={{
                          padding: '4px 10px',
                          fontSize: 11,
                          fontFamily: 'var(--font-mono)',
                          borderRadius: 'var(--radius-sm)',
                          border: i === activeStripIndex ? '1px solid var(--color-primary)' : '1px solid var(--color-border-subtle)',
                          background: i === activeStripIndex ? 'var(--color-primary)' : 'transparent',
                          color: i === activeStripIndex ? '#ffffff' : 'var(--color-text-secondary)',
                          cursor: 'pointer',
                        }}
                      >
                        STRIP {String(i + 1).padStart(2, '0')}
                      </button>
                    ))}
                  </div>

                  <button
                    className="btn btn-secondary btn-icon btn-sm"
                    onClick={() => setActiveStripIndex(i => Math.min(strips.length - 1, i + 1))}
                    disabled={activeStripIndex === strips.length - 1}
                    title="Next"
                  >
                    <ChevronRight size={16} />
                  </button>
                </div>
              )}
            </motion.div>
          ) : viewMode === 'a4' ? (
            /* ─── A4 SHEET PREVIEW (Requested by User) ─────────────────────── */
            (() => {
              const a4TargetHeight = a4LayoutMode === 'a4-6' ? 510 : 660
              const a4AvailHeight = Math.max(220, containerHeight - 80)
              const a4Scale = Math.min(1, Math.max(0.4, a4AvailHeight / a4TargetHeight))

              return (
                <motion.div
                  initial={{ opacity: 0, scale: 0.96 }}
                  animate={{ opacity: 1, scale: 1 }}
                  transition={{ duration: 0.2 }}
                  style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 10, width: '100%', height: '100%', overflow: 'hidden', padding: '6px 0' }}
                >
                  {/* A4 Option Selector Pills */}
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, background: 'var(--color-bg-surface)', padding: '6px 10px', borderRadius: 'var(--radius-full)', border: '1px solid var(--color-border-subtle)', flexShrink: 0, flexWrap: 'wrap', justifyContent: 'center' }}>
                    <span style={{ fontSize: 11, fontFamily: 'var(--font-mono)', color: 'var(--color-text-tertiary)', paddingLeft: 6 }}>
                      A4 LAYOUT:
                    </span>
                    <button
                      type="button"
                      onClick={() => setA4LayoutMode('a4-5')}
                      style={{
                        padding: '6px 14px',
                        fontSize: 11,
                        fontFamily: 'var(--font-mono)',
                        fontWeight: a4LayoutMode === 'a4-5' ? 700 : 500,
                        borderRadius: 'var(--radius-full)',
                        border: 'none',
                        background: a4LayoutMode === 'a4-5' ? 'var(--color-brand-bright)' : 'transparent',
                        color: a4LayoutMode === 'a4-5' ? '#ffffff' : 'var(--color-text-secondary)',
                        cursor: 'pointer',
                        display: 'flex',
                        alignItems: 'center',
                        gap: 6,
                        transition: 'all var(--transition-fast)',
                      }}
                    >
                      <Sparkles size={12} color={a4LayoutMode === 'a4-5' ? '#ffffff' : 'var(--color-brand)'} />
                      <span>5 / A4 (6.0 × 21 CM · 1:3.5 FIT)</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => setA4LayoutMode('a4-6')}
                      style={{
                        padding: '6px 14px',
                        fontSize: 11,
                        fontFamily: 'var(--font-mono)',
                        fontWeight: a4LayoutMode === 'a4-6' ? 700 : 500,
                        borderRadius: 'var(--radius-full)',
                        border: 'none',
                        background: a4LayoutMode === 'a4-6' ? 'var(--color-brand-bright)' : 'transparent',
                        color: a4LayoutMode === 'a4-6' ? '#ffffff' : 'var(--color-text-secondary)',
                        cursor: 'pointer',
                        display: 'flex',
                        alignItems: 'center',
                        gap: 6,
                        transition: 'all var(--transition-fast)',
                      }}
                    >
                      <span>6 / A4 (5.0 × 21 CM)</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => setA4LayoutMode('a4-4')}
                      style={{
                        padding: '6px 14px',
                        fontSize: 11,
                        fontFamily: 'var(--font-mono)',
                        fontWeight: a4LayoutMode === 'a4-4' ? 700 : 500,
                        borderRadius: 'var(--radius-full)',
                        border: 'none',
                        background: a4LayoutMode === 'a4-4' ? 'var(--color-brand-bright)' : 'transparent',
                        color: a4LayoutMode === 'a4-4' ? '#ffffff' : 'var(--color-text-secondary)',
                        cursor: 'pointer',
                        display: 'flex',
                        alignItems: 'center',
                        gap: 6,
                        transition: 'all var(--transition-fast)',
                      }}
                    >
                      <span>4 / A4 (6.0 × 21 CM)</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => setA4LayoutMode('a4-8')}
                      style={{
                        padding: '6px 14px',
                        fontSize: 11,
                        fontFamily: 'var(--font-mono)',
                        fontWeight: a4LayoutMode === 'a4-8' ? 700 : 500,
                        borderRadius: 'var(--radius-full)',
                        border: 'none',
                        background: a4LayoutMode === 'a4-8' ? 'var(--color-brand-bright)' : 'transparent',
                        color: a4LayoutMode === 'a4-8' ? '#ffffff' : 'var(--color-text-secondary)',
                        cursor: 'pointer',
                        display: 'flex',
                        alignItems: 'center',
                        gap: 6,
                        transition: 'all var(--transition-fast)',
                      }}
                    >
                      <span>8 / A4 (2 ROWS × 4)</span>
                    </button>
                  </div>

                  {/* Physical A4 Sheet Container Scaled to Fit */}
                  <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'flex-start', width: '100%', flex: 1, overflow: 'hidden' }}>
                    <div style={{ transform: `scale(${a4Scale})`, transformOrigin: 'top center', display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
                      <div
                        style={{
                          width: a4LayoutMode === 'a4-8' ? 440 : 594,
                          minHeight: a4LayoutMode === 'a4-8' ? 622 : 440,
                          background: '#ffffff',
                          boxShadow: '0 20px 50px rgba(0,0,0,0.65), 0 0 0 1px rgba(0,0,0,0.08)',
                          padding: '12px 14px',
                          display: 'flex',
                          flexDirection: 'column',
                          position: 'relative',
                          userSelect: 'none',
                          borderRadius: 2,
                          margin: 'auto',
                        }}
                      >
                        {/* A4 Sheet Top Label & Measurements */}
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid #e2e2e2', paddingBottom: 6, marginBottom: 10 }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                            <span style={{ fontFamily: 'var(--font-mono)', fontSize: 9, fontWeight: 700, color: 'var(--color-brand)', letterSpacing: '0.08em' }}>
                              {a4LayoutMode === 'a4-8' ? 'A4 PHOTO PAPER (21.0 × 29.7 CM)' : 'A4 HORIZONTAL / LANDSCAPE (29.7 × 21.0 CM)'}
                            </span>
                            <span style={{ fontSize: 9, color: '#888888', fontFamily: 'var(--font-mono)' }}>
                              {a4LayoutMode === 'a4-5' ? '6.0 CM WIDTH PER STRIP' : a4LayoutMode === 'a4-6' ? '5.0 CM WIDTH PER STRIP' : a4LayoutMode === 'a4-4' ? '6.0 CM WIDTH PER STRIP' : 'STANDARD INKJET / LASER'}
                            </span>
                          </div>
                          <span style={{ fontFamily: 'var(--font-mono)', fontSize: 8, fontWeight: 600, color: 'var(--color-brand)', background: 'rgba(109, 6, 38, 0.1)', padding: '2px 8px', borderRadius: 4 }}>
                            {a4LayoutMode === 'a4-5' ? '5 STRIPS · FULL A4 HEIGHT (21.0 CM)' : a4LayoutMode === 'a4-6' ? '6 STRIPS · FULL A4 HEIGHT (21.0 CM)' : a4LayoutMode === 'a4-4' ? '4 STRIPS · FULL A4 HEIGHT (21.0 CM)' : '8 STRIPS · 2 ROWS OF 4'}
                          </span>
                        </div>

                        {a4LayoutMode === 'a4-5' ? (
                          /* ─── OPTION 1: A4 HORIZONTAL (5 STRIPS · 6 CM · 1:3.5 FIT) ─ */
                          <div style={{ display: 'flex', flexDirection: 'column', flex: 1 }}>
                            {/* Row of 5 Strips */}
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', position: 'relative', padding: '0 2px' }}>
                              {Array.from({ length: 5 }, (_, c) => {
                                const strip = strips[c % strips.length]
                                return (
                                  <div key={c} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', position: 'relative' }}>
                                    <div style={{ fontSize: 7, fontFamily: 'var(--font-mono)', color: '#888', marginBottom: 2 }}>
                                      STRIP {c + 1} (6.0×21 CM)
                                    </div>
                                    {strip ? (
                                      <StripPreview strip={strip} width={102} fixedHeight={360} hideFooter={false} />
                                    ) : (
                                      <div style={{ width: 102, height: 360, border: '1px dashed #ccc', background: '#f8f8f8', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 8, color: '#999', fontFamily: 'var(--font-mono)' }}>
                                        EMPTY
                                      </div>
                                    )}
                                  </div>
                                )
                              })}

                              {/* 4 Vertical Dashed Scissor Cut Guides */}
                              {[1, 2, 3, 4].map(cut => (
                                <div
                                  key={cut}
                                  style={{
                                    position: 'absolute',
                                    left: `${(cut / 5) * 100}%`,
                                    top: 14,
                                    bottom: 0,
                                    width: 1,
                                    borderLeft: '1px dashed #bbb',
                                    pointerEvents: 'none',
                                  }}
                                >
                                  <span style={{ position: 'absolute', top: -13, left: -6, fontSize: 9, color: '#888' }}>
                                    ✂
                                  </span>
                                </div>
                              ))}
                            </div>

                            {/* Bottom Cutting Guide Note */}
                            <div style={{ marginTop: 10, borderTop: '1.5px dashed #999', paddingTop: 6, display: 'flex', justifyContent: 'space-between', alignItems: 'center', position: 'relative' }}>
                              <span style={{ fontSize: 9, color: '#555', fontFamily: 'var(--font-mono)' }}>
                                ✂ 4 STRAIGHT VERTICAL CUTS · FULL A4 HEIGHT (21.0 CM) · EACH STRIP 6.0 CM × 21.0 CM
                              </span>
                              <span style={{ fontSize: 8, color: 'var(--color-brand)', fontFamily: 'var(--font-mono)', fontWeight: 700 }}>
                                100% FULL 21 CM HEIGHT · ZERO GAP UPSIDE & DOWN
                              </span>
                            </div>
                          </div>
                        ) : a4LayoutMode === 'a4-6' ? (
                          /* ─── OPTION 2: A4 HORIZONTAL (6 STRIPS · 5 CM) ────────── */
                          <div style={{ display: 'flex', flexDirection: 'column', flex: 1 }}>
                            {/* Row of 6 Strips */}
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', position: 'relative', padding: '0 2px' }}>
                              {Array.from({ length: 6 }, (_, c) => {
                                const strip = strips[c % strips.length]
                                return (
                                  <div key={c} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', position: 'relative' }}>
                                    <div style={{ fontSize: 7, fontFamily: 'var(--font-mono)', color: '#888', marginBottom: 2 }}>
                                      STRIP {c + 1}
                                    </div>
                                    {strip ? (
                                      <StripPreview strip={strip} width={86} fixedHeight={360} hideFooter={false} />
                                    ) : (
                                      <div style={{ width: 86, height: 360, border: '1px dashed #ccc', background: '#f8f8f8', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 8, color: '#999', fontFamily: 'var(--font-mono)' }}>
                                        EMPTY
                                      </div>
                                    )}
                                  </div>
                                )
                              })}

                              {/* 5 Vertical Dashed Scissor Cut Guides */}
                              {[1, 2, 3, 4, 5].map(cut => (
                                <div
                                  key={cut}
                                  style={{
                                    position: 'absolute',
                                    left: `${(cut / 6) * 100}%`,
                                    top: 14,
                                    bottom: 0,
                                    width: 1,
                                    borderLeft: '1px dashed #bbb',
                                    pointerEvents: 'none',
                                  }}
                                >
                                  <span style={{ position: 'absolute', top: -13, left: -6, fontSize: 9, color: '#888' }}>
                                    ✂
                                  </span>
                                </div>
                              ))}
                            </div>

                            {/* Bottom Cutting Guide Note */}
                            <div style={{ marginTop: 10, borderTop: '1.5px dashed #999', paddingTop: 6, display: 'flex', justifyContent: 'space-between', alignItems: 'center', position: 'relative' }}>
                              <span style={{ fontSize: 9, color: '#555', fontFamily: 'var(--font-mono)' }}>
                                ✂ 5 STRAIGHT VERTICAL CUTS · FULL A4 HEIGHT (21.0 CM) · EACH STRIP 5.0 CM × 21.0 CM
                              </span>
                              <span style={{ fontSize: 8, color: 'var(--color-brand)', fontFamily: 'var(--font-mono)', fontWeight: 700 }}>
                                100% FULL 21 CM HEIGHT · ZERO GAP UPSIDE & DOWN
                              </span>
                            </div>
                          </div>
                        ) : a4LayoutMode === 'a4-4' ? (
                          /* ─── OPTION 3: A4 HORIZONTAL (4 STRIPS · 6 CM · FULL 21 CM HEIGHT) ─ */
                          <div style={{ display: 'flex', flexDirection: 'column', flex: 1 }}>
                            {/* Row of 4 Strips */}
                            <div style={{ display: 'flex', justifyContent: 'space-around', alignItems: 'flex-start', position: 'relative', padding: '0 16px' }}>
                              {Array.from({ length: 4 }, (_, c) => {
                                const strip = strips[c % strips.length]
                                return (
                                  <div key={c} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', position: 'relative' }}>
                                    <div style={{ fontSize: 8, fontFamily: 'var(--font-mono)', color: '#888', marginBottom: 2 }}>
                                      STRIP {c + 1} (6.0×21 CM)
                                    </div>
                                    {strip ? (
                                      <StripPreview strip={strip} width={108} fixedHeight={360} hideFooter={false} />
                                    ) : (
                                      <div style={{ width: 108, height: 360, border: '1px dashed #ccc', background: '#f8f8f8', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 9, color: '#999', fontFamily: 'var(--font-mono)' }}>
                                        EMPTY
                                      </div>
                                    )}
                                  </div>
                                )
                              })}

                              {/* Vertical Dashed Scissor Cut Guides */}
                              {[1, 2, 3].map(cut => (
                                <div
                                  key={cut}
                                  style={{
                                    position: 'absolute',
                                    left: `${cut * 25}%`,
                                    top: 14,
                                    bottom: 0,
                                    width: 1,
                                    borderLeft: '1px dashed #bbb',
                                    pointerEvents: 'none',
                                  }}
                                >
                                  <span style={{ position: 'absolute', top: -14, left: -6, fontSize: 10, color: '#888' }}>
                                    ✂
                                  </span>
                                </div>
                              ))}
                            </div>

                            {/* Bottom Cutting Guide Note */}
                            <div style={{ marginTop: 10, borderTop: '1.5px dashed #999', paddingTop: 6, display: 'flex', justifyContent: 'space-between', alignItems: 'center', position: 'relative' }}>
                              <span style={{ fontSize: 9, color: '#555', fontFamily: 'var(--font-mono)' }}>
                                ✂ 3 STRAIGHT VERTICAL CUTS · FULL A4 HEIGHT (21.0 CM) · EACH STRIP 6.0 CM × 21.0 CM
                              </span>
                              <span style={{ fontSize: 8, color: 'var(--color-brand)', fontFamily: 'var(--font-mono)', fontWeight: 700 }}>
                                100% FULL 21 CM HEIGHT · ZERO GAP UPSIDE & DOWN
                              </span>
                            </div>
                          </div>
                        ) : (
                          /* ─── OPTION 2: 8 Strips (2 Rows of 4 / 5.0 × 14.5 cm) ───────── */
                          <div style={{ display: 'flex', flexDirection: 'column', flex: 1, position: 'relative', gap: 8 }}>
                            {/* Top Row (Strips 1 to 4) */}
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', position: 'relative', padding: '0 4px' }}>
                              {Array.from({ length: 4 }, (_, c) => {
                                const strip = strips[c % strips.length]
                                return (
                                  <div key={c} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', position: 'relative' }}>
                                    <div style={{ fontSize: 7, fontFamily: 'var(--font-mono)', color: '#888', marginBottom: 2 }}>
                                      TOP #{c + 1}
                                    </div>
                                    {strip ? (
                                      <StripPreview strip={strip} width={96} hideFooter={false} />
                                    ) : (
                                      <div style={{ width: 96, height: 260, border: '1px dashed #ccc', background: '#f8f8f8' }} />
                                    )}
                                  </div>
                                )
                              })}

                              {/* Top Row Vertical Cut Lines */}
                              {[1, 2, 3].map(cut => (
                                <div
                                  key={cut}
                                  style={{
                                    position: 'absolute',
                                    left: `${cut * 25}%`,
                                    top: 14,
                                    bottom: 0,
                                    width: 1,
                                    borderLeft: '1px dashed #bbb',
                                    pointerEvents: 'none',
                                  }}
                                >
                                  <span style={{ position: 'absolute', top: -11, left: -5, fontSize: 8, color: '#888' }}>
                                    ✂
                                  </span>
                                </div>
                              ))}
                            </div>

                            {/* Center Cut Line */}
                            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', position: 'relative', margin: '4px 0' }}>
                              <div style={{ width: '100%', borderTop: '1.5px dashed #666' }} />
                              <span style={{ position: 'absolute', background: '#ffffff', padding: '0 8px', fontSize: 9, fontFamily: 'var(--font-mono)', fontWeight: 700, color: 'var(--color-brand)', display: 'flex', alignItems: 'center', gap: 4 }}>
                                <Scissors size={10} />
                                <span>HORIZONTAL CENTER CUT (14.5 CM)</span>
                                <Scissors size={10} />
                              </span>
                            </div>

                            {/* Bottom Row (Strips 5 to 8) */}
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', position: 'relative', padding: '0 4px' }}>
                              {Array.from({ length: 4 }, (_, c) => {
                                const strip = strips[(c + 4) % strips.length]
                                return (
                                  <div key={c} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', position: 'relative' }}>
                                    <div style={{ fontSize: 7, fontFamily: 'var(--font-mono)', color: '#888', marginBottom: 2 }}>
                                      BTM #{c + 5}
                                    </div>
                                    {strip ? (
                                      <StripPreview strip={strip} width={96} hideFooter={false} />
                                    ) : (
                                      <div style={{ width: 96, height: 260, border: '1px dashed #ccc', background: '#f8f8f8' }} />
                                    )}
                                  </div>
                                )
                              })}

                              {/* Bottom Row Vertical Cut Lines */}
                              {[1, 2, 3].map(cut => (
                                <div
                                  key={cut}
                                  style={{
                                    position: 'absolute',
                                    left: `${cut * 25}%`,
                                    top: 14,
                                    bottom: 0,
                                    width: 1,
                                    borderLeft: '1px dashed #bbb',
                                    pointerEvents: 'none',
                                  }}
                                />
                              ))}
                            </div>
                          </div>
                        )}

                        {/* Footer Sheet Badge */}
                        <div style={{ borderTop: '1px solid #eee', paddingTop: 6, marginTop: 8, display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: 8, fontFamily: 'var(--font-mono)', color: '#888' }}>
                          <span>5 MM SLIM PRINT MARGINS</span>
                          <span>READY FOR A4 INKJET / LASER PRINTING</span>
                        </div>
                      </div>
                    </div>
                  </div>
                </motion.div>
              )
            })()
          ) : (
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: strips.length <= 2 ? 'center' : 'flex-start',
                gap: 24,
                padding: '12px 24px',
                overflowX: 'auto',
                overflowY: 'hidden',
                width: '100%',
                height: '100%',
                WebkitOverflowScrolling: 'touch',
              }}
            >
              {strips.map((strip, i) => (
                <motion.div
                  key={strip.id}
                  initial={{ opacity: 0, y: 12 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: i * 0.05 }}
                  style={{
                    display: 'flex',
                    flexDirection: 'column',
                    alignItems: 'center',
                    justifyContent: 'center',
                    flexShrink: 0,
                    height: '100%',
                    maxHeight: '100%',
                  }}
                >
                  <div style={{
                    marginBottom: 6,
                    display: 'flex',
                    alignItems: 'center',
                    gap: 6,
                    background: 'var(--color-bg-surface)',
                    border: '1px solid var(--color-border-subtle)',
                    padding: '2px 8px',
                    borderRadius: 'var(--radius-sm)',
                    fontSize: 10,
                    fontFamily: 'var(--font-mono)',
                    color: 'var(--color-text-secondary)',
                    flexShrink: 0,
                  }}>
                    <span>STRIP {String(i + 1).padStart(2, '0')}</span>
                    <span style={{ opacity: 0.5 }}>·</span>
                    <span>{strip.slots.length} SHOTS</span>
                  </div>
                  <StripPreview
                    strip={strip}
                    width={220}
                    maxContainerHeight={Math.max(200, containerHeight - 85)}
                    isInteractive
                    onClick={() => {
                      setActiveStripIndex(i)
                      setViewMode('single')
                    }}
                  />
                  <span style={{ marginTop: 5, fontSize: 9, fontFamily: 'var(--font-mono)', color: 'var(--color-text-tertiary)', flexShrink: 0 }}>
                    TAP TO INSPECT
                  </span>
                </motion.div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Right sidebar */}
      <div
        className="panel panel-right preview-sidebar"
        style={{
          background: 'var(--color-bg-surface)',
          borderLeft: 'var(--border-w-lg) solid rgba(0, 22, 24, 0.7)',
          display: 'flex',
          flexDirection: 'column',
          flexShrink: 0,
        }}
      >
        <div style={{ padding: '14px 16px', borderBottom: 'var(--border-w-md) solid var(--color-border-subtle)' }}>
          <span style={{ fontFamily: 'var(--font-mono)', fontSize: 13, fontWeight: 700, letterSpacing: '0.08em', color: 'var(--color-text-secondary)', textTransform: 'uppercase' }}>
            SUMMARY
          </span>
        </div>

        <div className="panel-body flex flex-col gap-4" style={{ padding: '16px', flex: 1, overflowY: 'auto' }}>
          {/* Summary table */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8, background: 'var(--color-bg-base)', padding: '12px 14px', borderRadius: 'var(--radius-md)', border: '2px solid var(--color-border-subtle)' }}>
            {[
              { label: 'Strips', value: strips.length },
              { label: 'Photos Used', value: assignments.length },
              { label: 'Template', value: template?.name ?? '—' },
              { label: 'A4 Yield (Opt 1)', value: '4 / sheet' },
              { label: 'A4 Yield (Opt 2)', value: '8 / sheet' },
            ].map(({ label, value }) => (
              <div key={label} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '3px 0' }}>
                <span style={{ fontSize: 13, color: 'var(--color-text-secondary)' }}>{label}</span>
                <span style={{ fontSize: 13, fontFamily: 'var(--font-mono)', fontWeight: 700, color: 'var(--color-text-primary)' }}>{value}</span>
              </div>
            ))}
          </div>

          {/* Quick Edit */}
          <div>
            <div style={{ fontSize: 12, fontFamily: 'var(--font-mono)', fontWeight: 700, color: 'var(--color-text-tertiary)', textTransform: 'uppercase', marginBottom: 8, letterSpacing: '0.04em' }}>
              Quick Edit
            </div>
            <div className="flex flex-col gap-2">
              <button
                className="btn btn-secondary"
                onClick={() => onGoToStep('select')}
                style={{ justifyContent: 'flex-start', gap: 10, fontSize: 13, minHeight: 46, borderRadius: 'var(--radius-md)', fontFamily: 'var(--font-mono)', fontWeight: 700, touchAction: 'manipulation' }}
              >
                <Image size={18} />
                <span>CHANGE PHOTOS</span>
              </button>
              <button
                className="btn btn-secondary"
                onClick={() => onGoToStep('template')}
                style={{ justifyContent: 'flex-start', gap: 10, fontSize: 13, minHeight: 46, borderRadius: 'var(--radius-md)', fontFamily: 'var(--font-mono)', fontWeight: 700, touchAction: 'manipulation' }}
              >
                <Palette size={18} />
                <span>CHANGE TEMPLATE</span>
              </button>
              <button
                className="btn btn-secondary"
                onClick={() => onGoToStep('editor')}
                style={{ justifyContent: 'flex-start', gap: 10, fontSize: 13, minHeight: 46, borderRadius: 'var(--radius-md)', fontFamily: 'var(--font-mono)', fontWeight: 700, touchAction: 'manipulation' }}
              >
                <Edit3 size={18} />
                <span>EDIT IN CANVAS</span>
              </button>
            </div>
          </div>

          {/* Print/Save CTA */}
          <div style={{ marginTop: 'auto', paddingTop: 16 }}>
            <button
              className="btn btn-primary btn-xl btn-expressive w-full"
              onClick={() => {
                if (strips.length > 0) {
                  setShowCopiesModal(true)
                } else {
                  onNext()
                }
              }}
              style={{
                minHeight: 56,
                fontSize: 16,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: 10,
                touchAction: 'manipulation',
              }}
            >
              <Printer size={22} />
              <span>{boothCopy.actions.print}</span>
            </button>
          </div>
        </div>
      </div>

      {/* Copies Selection Modal */}
      <PrintCopiesModal
        isOpen={showCopiesModal}
        stripCount={strips.length}
        initialCopies={session?.printSettings?.copies || 1}
        includedStrips={includedStrips}
        onConfirm={(chosenCopies) => {
          setPrintSettings({ copies: chosenCopies })
          setShowCopiesModal(false)
          onNext()
        }}
        onClose={() => setShowCopiesModal(false)}
      />
    </div>
  )
}

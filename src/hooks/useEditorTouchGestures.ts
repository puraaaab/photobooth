import { useState, useRef, useEffect, useCallback } from 'react'
import type { Session, Photo, PhotoEdits, CanvasElement } from '@/types'
import type { CanvasZoomState } from '@/hooks/useCanvasZoom'

export interface GestureHudState {
  visible: boolean
  icon: string
  title: string
  detail?: string
}

interface UseEditorTouchGesturesProps {
  containerRef: React.RefObject<HTMLDivElement>
  session: Session | null
  activeStripIndex: number
  stripsCount: number
  setActiveStripIndex: React.Dispatch<React.SetStateAction<number>>
  updatePhotoEdits: (photoId: string, edits: Partial<PhotoEdits>) => void
  updateCanvasElement: (id: string, updates: Partial<CanvasElement>) => void
  getPhotoForSlot: (slotId: string) => Photo | undefined
  canvasZoom: CanvasZoomState
  onUndo: () => void
  onRedo: () => void
  setSelectedSlotId?: (id: string | null) => void
  setSelectedElementId?: (id: string | null) => void
  setActivePanel?: (panel: 'filters' | 'adjust' | 'stickers' | 'text' | 'background' | 'border') => void
}

type GestureTarget =
  | { type: 'photo'; slotId: string; photoId: string }
  | { type: 'element'; elementId: string }
  | { type: 'canvas' }

export function useEditorTouchGestures({
  containerRef,
  session,
  activeStripIndex,
  stripsCount,
  setActiveStripIndex,
  updatePhotoEdits,
  updateCanvasElement,
  getPhotoForSlot,
  canvasZoom,
  onUndo,
  onRedo,
  setSelectedSlotId,
  setSelectedElementId,
  setActivePanel,
}: UseEditorTouchGesturesProps) {
  const [hud, setHud] = useState<GestureHudState>({
    visible: false,
    icon: 'sparkles',
    title: '',
  })
  const hudTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const showHud = useCallback((icon: string, title: string, detail?: string, durationMs = 1200) => {
    if (hudTimerRef.current) clearTimeout(hudTimerRef.current)
    setHud({ visible: true, icon, title, detail })
    hudTimerRef.current = setTimeout(() => {
      setHud(prev => ({ ...prev, visible: false }))
      hudTimerRef.current = null
    }, durationMs)
  }, [])

  // Tracking state for active multi-touch gestures
  const gestureRef = useRef<{
    startTime: number
    touchCount: number
    maxTouchCount: number
    target: GestureTarget
    initialDist: number
    initialAngle: number
    initialCenter: { x: number; y: number }
    totalMoveDist: number
    lastTouchPositions: Array<{ x: number; y: number }>
    
    // Initial snapshot of adjusted item
    initialPhotoEdits?: {
      scale: number
      rotation: number
      panX: number
      panY: number
    }
    initialElementState?: {
      width: number
      height: number
      rotation: number
      x: number
      y: number
    }
    initialCanvasZoom?: {
      zoom: number
      panX: number
      panY: number
    }
  } | null>(null)

  // Last tap time for double-tap detection
  const lastTapRef = useRef<{ time: number; x: number; y: number; targetKey: string } | null>(null)

  useEffect(() => {
    const el = containerRef.current
    if (!el) return

    // Helper to calculate distance between two touches
    const getTouchDist = (t1: Touch, t2: Touch) => Math.hypot(t1.clientX - t2.clientX, t1.clientY - t2.clientY)
    // Helper to calculate angle in degrees
    const getTouchAngle = (t1: Touch, t2: Touch) => (Math.atan2(t2.clientY - t1.clientY, t2.clientX - t1.clientX) * 180) / Math.PI
    // Helper to calculate center point
    const getTouchCenter = (t1: Touch, t2: Touch) => ({
      x: (t1.clientX + t2.clientX) / 2,
      y: (t1.clientY + t2.clientY) / 2,
    })

    const onTouchStart = (e: TouchEvent) => {
      const touchCount = e.touches.length
      const now = Date.now()

      // ─── 3-Finger Gesture: REDO ──────────────────────────────────────────
      if (touchCount === 3) {
        e.preventDefault()
        gestureRef.current = {
          startTime: now,
          touchCount: 3,
          maxTouchCount: 3,
          target: { type: 'canvas' },
          initialDist: 0,
          initialAngle: 0,
          initialCenter: { x: 0, y: 0 },
          totalMoveDist: 0,
          lastTouchPositions: Array.from(e.touches).map(t => ({ x: t.clientX, y: t.clientY })),
        }
        return
      }

      // Identify gesture target from first touch
      const firstTouch = e.touches[0]
      const hitElement = document.elementFromPoint(firstTouch.clientX, firstTouch.clientY)

      let target: GestureTarget = { type: 'canvas' }
      const elementNode = hitElement?.closest('[data-element-id]')
      const slotNode = hitElement?.closest('[data-slot-id]')

      if (elementNode) {
        const elementId = elementNode.getAttribute('data-element-id') || ''
        target = { type: 'element', elementId }
        setSelectedElementId?.(elementId)
        const elem = session?.canvasElements.find(item => item.id === elementId)
        if (elem?.stripId && session?.strips) {
          const sIdx = session.strips.findIndex(s => s.id === elem.stripId)
          if (sIdx >= 0) setActiveStripIndex(sIdx)
        }
      } else if (slotNode) {
        const slotId = slotNode.getAttribute('data-slot-id') || ''
        const photo = getPhotoForSlot(slotId)
        if (photo) {
          target = { type: 'photo', slotId, photoId: photo.id }
          setSelectedSlotId?.(slotId)
        }
        const assignment = session?.assignments?.find(a => a.slotId === slotId)
        if (assignment && session?.strips) {
          const sIdx = session.strips.findIndex(s => s.id === assignment.stripId)
          if (sIdx >= 0) setActiveStripIndex(sIdx)
        }
      }

      // Sync activeStripIndex if touched anywhere within a strip wrapper
      const stripNode = hitElement?.closest('[data-strip-id]') || hitElement?.closest('.strip-canvas-wrapper')
      if (stripNode) {
        const stripId = stripNode.getAttribute('data-strip-id')
        if (stripId && session?.strips) {
          const sIdx = session.strips.findIndex(s => s.id === stripId)
          if (sIdx >= 0) setActiveStripIndex(sIdx)
        }
      }

      // Record baseline values for smooth continuous gestures
      let initialPhotoEdits: any
      let initialElementState: any
      let initialCanvasZoom: any

      if (target.type === 'photo') {
        const photo = session?.photos.find(p => p.id === target.photoId)
        if (photo) {
          initialPhotoEdits = {
            scale: photo.edits.scale ?? 1.0,
            rotation: photo.edits.rotation ?? 0,
            panX: photo.edits.panX ?? 0,
            panY: photo.edits.panY ?? 0,
          }
        }
      } else if (target.type === 'element') {
        const elem = session?.canvasElements.find(item => item.id === target.elementId)
        if (elem) {
          initialElementState = {
            width: elem.width,
            height: elem.height,
            rotation: elem.rotation ?? 0,
            x: elem.x,
            y: elem.y,
          }
        }
      } else {
        initialCanvasZoom = {
          zoom: canvasZoom.zoom,
          panX: canvasZoom.pan.x,
          panY: canvasZoom.pan.y,
        }
      }

      let initialDist = 0
      let initialAngle = 0
      let initialCenter = { x: firstTouch.clientX, y: firstTouch.clientY }

      if (touchCount >= 2) {
        e.preventDefault()
        const t1 = e.touches[0]
        const t2 = e.touches[1]
        initialDist = getTouchDist(t1, t2)
        initialAngle = getTouchAngle(t1, t2)
        initialCenter = getTouchCenter(t1, t2)
      }

      gestureRef.current = {
        startTime: now,
        touchCount,
        maxTouchCount: touchCount,
        target,
        initialDist,
        initialAngle,
        initialCenter,
        totalMoveDist: 0,
        lastTouchPositions: Array.from(e.touches).map(t => ({ x: t.clientX, y: t.clientY })),
        initialPhotoEdits,
        initialElementState,
        initialCanvasZoom,
      }
    }

    const onTouchMove = (e: TouchEvent) => {
      const g = gestureRef.current
      if (!g) return

      g.maxTouchCount = Math.max(g.maxTouchCount, e.touches.length)

      // Calculate movement accumulator
      if (e.touches.length > 0 && g.lastTouchPositions.length > 0) {
        const dx = e.touches[0].clientX - g.lastTouchPositions[0].x
        const dy = e.touches[0].clientY - g.lastTouchPositions[0].y
        g.totalMoveDist += Math.hypot(dx, dy)
        g.lastTouchPositions = Array.from(e.touches).map(t => ({ x: t.clientX, y: t.clientY }))
      }

      // ─── 2-FINGER PINCH / TWIST / PAN GESTURES ──────────────────────────
      if (e.touches.length === 2 && g.initialDist > 0) {
        e.preventDefault()
        const t1 = e.touches[0]
        const t2 = e.touches[1]

        const currentDist = getTouchDist(t1, t2)
        const currentAngle = getTouchAngle(t1, t2)
        const currentCenter = getTouchCenter(t1, t2)

        const distRatio = currentDist / g.initialDist
        const deltaAngle = currentAngle - g.initialAngle
        const centerDx = currentCenter.x - g.initialCenter.x
        const centerDy = currentCenter.y - g.initialCenter.y

        // 1. PINCH ON PHOTO SLOT -> Smooth Zoom & subtle angle without wild pan jump
        if (g.target.type === 'photo' && g.initialPhotoEdits) {
          const base = g.initialPhotoEdits
          const newScale = Math.min(3.0, Math.max(1.0, base.scale * distRatio))

          // Only rotate if deliberate twist gesture (> 12 degrees)
          let newRot = base.rotation
          if (Math.abs(deltaAngle) > 12) {
            newRot = (base.rotation + deltaAngle) % 360
            if (newRot < 0) newRot += 360
            const rightAngleSnaps = [0, 90, 180, 270, 360]
            for (const snap of rightAngleSnaps) {
              if (Math.abs(newRot - snap) < 8) {
                newRot = snap === 360 ? 0 : snap
                break
              }
            }
          }

          // Clean, centered zoom in place so photo does not drift or fly out of the aperture frame
          updatePhotoEdits(g.target.photoId, {
            scale: Number(newScale.toFixed(2)),
            rotation: Math.round(newRot),
            panX: base.panX,
            panY: base.panY,
          })

          showHud('zoom', `Photo Zoom ${newScale.toFixed(1)}x`, undefined, 600)
          return
        }

        // 2. PINCH ON CANVAS ELEMENT (STICKER / TEXT) -> Smooth proportional scale & clamp within frame
        if (g.target.type === 'element' && g.initialElementState) {
          const base = g.initialElementState
          const newW = Math.min(600, Math.max(40, Math.round(base.width * distRatio)))
          const newH = Math.min(600, Math.max(40, Math.round(base.height * distRatio)))
          let newRot = Math.round((base.rotation + deltaAngle) % 360)
          if (newRot < 0) newRot += 360

          // Keep sticker center stationary as it scales, and clamp firmly within strip bounds
          const canvasW = session?.template?.canvas?.width ?? 1200
          const canvasH = session?.template?.canvas?.height ?? 3600
          const dw = newW - base.width
          const dh = newH - base.height
          const newX = Math.max(10, Math.min(canvasW - newW - 10, Math.round(base.x - dw / 2 + centerDx * 0.5)))
          const newY = Math.max(10, Math.min(canvasH - newH - 10, Math.round(base.y - dh / 2 + centerDy * 0.5)))

          updateCanvasElement(g.target.elementId, {
            width: newW,
            height: newH,
            x: newX,
            y: newY,
            rotation: newRot,
          })

          showHud('sparkles', `Size ${newW}px`, `Rotation: ${newRot}°`, 600)
          return
        }

        // 3. PINCH ON CANVAS VIEWPORT -> Zoom & Pan Whole Strip Workspace
        if (g.target.type === 'canvas' && g.initialCanvasZoom) {
          const newZoom = Math.min(3.0, Math.max(0.5, g.initialCanvasZoom.zoom * distRatio))
          canvasZoom.setZoom(newZoom)
          showHud('zoom', `Canvas Zoom ${Math.round(newZoom * 100)}%`, undefined, 600)
          return
        }
      }
    }

    const onTouchEnd = (e: TouchEvent) => {
      const g = gestureRef.current
      if (!g) return

      const elapsed = Date.now() - g.startTime
      const isQuickTap = elapsed < 320 && g.totalMoveDist < 20

      // ─── 3-FINGER TAP SHORTCUT: REDO ────────────────────────────────────
      if (g.maxTouchCount === 3 && isQuickTap) {
        e.preventDefault()
        onRedo()
        showHud('redo', 'Redo', 'Re-applied last action')
        gestureRef.current = null
        return
      }

      // ─── 2-FINGER TAP SHORTCUT: UNDO ────────────────────────────────────
      if (g.maxTouchCount === 2 && isQuickTap) {
        e.preventDefault()
        onUndo()
        showHud('undo', 'Undo', 'Reverted last change')
        gestureRef.current = null
        return
      }

      // ─── 1-FINGER DOUBLE TAP SHORTCUTS ──────────────────────────────────
      if (g.maxTouchCount === 1 && isQuickTap && e.changedTouches.length > 0) {
        const touch = e.changedTouches[0]
        const key = g.target.type === 'photo'
          ? `photo:${g.target.photoId}`
          : g.target.type === 'element'
          ? `element:${g.target.elementId}`
          : 'canvas'
        const last = lastTapRef.current
        const now = Date.now()

        if (last && now - last.time < 350 && Math.hypot(touch.clientX - last.x, touch.clientY - last.y) < 30 && last.targetKey === key) {
          // Double Tap Detected!
          e.preventDefault()

          const target = g.target
          if (target.type === 'photo') {
            const photo = session?.photos.find(p => p.id === target.photoId)
            if (photo) {
              const currentScale = photo.edits.scale ?? 1.0
              const currentPanX = photo.edits.panX ?? 0
              const currentPanY = photo.edits.panY ?? 0

              if (currentScale > 1.08 || currentPanX !== 0 || currentPanY !== 0) {
                // Reset to default 1.0 framing
                updatePhotoEdits(photo.id, { scale: 1.0, panX: 0, panY: 0 })
                showHud('reset', 'Framing Reset', 'Zoom set to 1.0x (centered)')
              } else {
                // Zoom in to 1.5x center crop
                updatePhotoEdits(photo.id, { scale: 1.5, panX: 0, panY: 0 })
                showHud('zoom', 'Quick Zoom 1.5x', 'Double tap again to reset')
              }
            }
          } else if (target.type === 'element') {
            const elem = session?.canvasElements.find(item => item.id === target.elementId)
            if (elem) {
              if (elem.type === 'text') {
                setActivePanel?.('text')
                showHud('edit', 'Editing Text', 'Customize wording & typography')
              } else {
                // Duplicate sticker
                const newElem: CanvasElement = {
                  ...elem,
                  id: `sticker-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
                  x: elem.x + 20,
                  y: elem.y + 20,
                }
                showHud('sparkles', 'Sticker Duplicated', 'Added copy to strip')
              }
            }
          } else {
            // Double tap on canvas background -> Reset canvas zoom
            canvasZoom.resetZoom()
            showHud('canvas', 'Canvas Centered', 'Zoom reset to 100%')
          }

          lastTapRef.current = null
          gestureRef.current = null
          return
        }

        lastTapRef.current = {
          time: now,
          x: touch.clientX,
          y: touch.clientY,
          targetKey: key,
        }
      }

      // ─── 2-FINGER HORIZONTAL SWIPE: SWITCH STRIPS ────────────────────────
      if (g.maxTouchCount === 2 && !isQuickTap && g.lastTouchPositions.length > 0) {
        const dx = g.lastTouchPositions[0].x - g.initialCenter.x
        if (Math.abs(dx) > 100 && stripsCount > 1) {
          if (dx < 0 && activeStripIndex < stripsCount - 1) {
            setActiveStripIndex(prev => prev + 1)
            showHud('arrow-right', `Strip ${activeStripIndex + 2}`, 'Switched to next strip')
          } else if (dx > 0 && activeStripIndex > 0) {
            setActiveStripIndex(prev => prev - 1)
            showHud('arrow-left', `Strip ${activeStripIndex}`, 'Switched to previous strip')
          }
        }
      }

      if (e.touches.length === 0) {
        gestureRef.current = null
      }
    }

    el.addEventListener('touchstart', onTouchStart, { passive: false })
    el.addEventListener('touchmove', onTouchMove, { passive: false })
    el.addEventListener('touchend', onTouchEnd, { passive: false })
    el.addEventListener('touchcancel', onTouchEnd, { passive: false })

    return () => {
      el.removeEventListener('touchstart', onTouchStart)
      el.removeEventListener('touchmove', onTouchMove)
      el.removeEventListener('touchend', onTouchEnd)
      el.removeEventListener('touchcancel', onTouchEnd)
    }
  }, [
    containerRef,
    session,
    activeStripIndex,
    stripsCount,
    setActiveStripIndex,
    updatePhotoEdits,
    updateCanvasElement,
    getPhotoForSlot,
    canvasZoom,
    onUndo,
    onRedo,
    setSelectedSlotId,
    setSelectedElementId,
    setActivePanel,
    showHud,
  ])

  return { hud }
}

import { useState, useRef, useCallback, useEffect } from 'react'

export interface CanvasZoomState {
  zoom: number
  pan: { x: number; y: number }
  isPanning: boolean
  zoomIn: () => void
  zoomOut: () => void
  resetZoom: () => void
  setZoom: (value: number) => void
  containerRef: React.RefObject<HTMLDivElement>
  transformStyle: React.CSSProperties
}

const MIN_ZOOM = 0.5
const MAX_ZOOM = 3.0

export function useCanvasZoom(): CanvasZoomState {
  const [zoom, setZoomState] = useState<number>(() => {
    if (typeof window !== 'undefined') {
      const h = window.innerHeight
      if (h < 750) return 0.65
      if (h < 900) return 0.75
      if (h < 1100) return 0.82
    }
    return 0.85
  })
  const [pan, setPan] = useState<{ x: number; y: number }>({ x: 0, y: 0 })
  const [isPanning, setIsPanning] = useState<boolean>(false)

  const containerRef = useRef<HTMLDivElement | null>(null)
  const lastTouchDistRef = useRef<number | null>(null)
  const lastPanPosRef = useRef<{ x: number; y: number } | null>(null)
  const isDraggingRef = useRef<boolean>(false)

  const clampZoom = (val: number) => Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, val))

  const setZoom = useCallback((val: number) => {
    setZoomState(clampZoom(val))
  }, [])

  const zoomIn = useCallback(() => {
    setZoomState(prev => clampZoom(prev * 1.25))
  }, [])

  const zoomOut = useCallback(() => {
    setZoomState(prev => clampZoom(prev / 1.25))
  }, [])

  const resetZoom = useCallback(() => {
    const h = typeof window !== 'undefined' ? window.innerHeight : 900
    const defaultScale = h < 750 ? 0.65 : h < 900 ? 0.75 : h < 1100 ? 0.82 : 0.85
    setZoomState(defaultScale)
    setPan({ x: 0, y: 0 })
  }, [])

  // Touch handlers for 2-finger pinch-to-zoom & pan
  useEffect(() => {
    const el = containerRef.current
    if (!el) return

    const handleTouchStart = (e: TouchEvent) => {
      // Yield touch to photo slots and canvas elements so they can be independently pinched/scaled
      const targetEl = e.touches[0] ? document.elementFromPoint(e.touches[0].clientX, e.touches[0].clientY) : null
      if (targetEl?.closest('[data-slot-id]') || targetEl?.closest('[data-element-id]')) {
        return
      }

      if (e.touches.length === 2) {
        e.preventDefault()
        const t1 = e.touches[0]
        const t2 = e.touches[1]
        lastTouchDistRef.current = Math.hypot(t1.clientX - t2.clientX, t1.clientY - t2.clientY)
      } else if (e.touches.length === 1) {
        lastPanPosRef.current = { x: e.touches[0].clientX, y: e.touches[0].clientY }
        isDraggingRef.current = true
        setIsPanning(true)
      }
    }

    const handleTouchMove = (e: TouchEvent) => {
      if (e.touches.length === 2 && lastTouchDistRef.current !== null) {
        e.preventDefault()
        const t1 = e.touches[0]
        const t2 = e.touches[1]
        const newDist = Math.hypot(t1.clientX - t2.clientX, t1.clientY - t2.clientY)
        const factor = newDist / lastTouchDistRef.current

        if (Math.abs(factor - 1) > 0.01) {
          setZoomState(prev => clampZoom(prev * factor))
          lastTouchDistRef.current = newDist
        }
      } else if (e.touches.length === 1 && isDraggingRef.current && lastPanPosRef.current) {
        e.preventDefault()
        const dx = e.touches[0].clientX - lastPanPosRef.current.x
        const dy = e.touches[0].clientY - lastPanPosRef.current.y
        lastPanPosRef.current = { x: e.touches[0].clientX, y: e.touches[0].clientY }
        setPan(prev => ({ x: prev.x + dx, y: prev.y + dy }))
      }
    }

    const handleTouchEnd = (e: TouchEvent) => {
      if (e.touches.length < 2) {
        lastTouchDistRef.current = null
      }
      if (e.touches.length === 0) {
        lastPanPosRef.current = null
        isDraggingRef.current = false
        setIsPanning(false)
      }
    }

    // Wheel zoom
    const handleWheel = (e: WheelEvent) => {
      // Zoom with wheel or Ctrl+wheel
      e.preventDefault()
      const factor = e.deltaY < 0 ? 1.1 : 0.9
      setZoomState(prev => clampZoom(prev * factor))
    }

    el.addEventListener('touchstart', handleTouchStart, { passive: false })
    el.addEventListener('touchmove', handleTouchMove, { passive: false })
    el.addEventListener('touchend', handleTouchEnd)
    el.addEventListener('touchcancel', handleTouchEnd)
    el.addEventListener('wheel', handleWheel, { passive: false })

    return () => {
      el.removeEventListener('touchstart', handleTouchStart)
      el.removeEventListener('touchmove', handleTouchMove)
      el.removeEventListener('touchend', handleTouchEnd)
      el.removeEventListener('touchcancel', handleTouchEnd)
      el.removeEventListener('wheel', handleWheel)
    }
  }, [zoom])

  const transformStyle: React.CSSProperties = {
    transform: `scale(${zoom}) translate(${pan.x / zoom}px, ${pan.y / zoom}px)`,
    transformOrigin: 'center center',
    transition: isPanning ? 'none' : 'transform 150ms cubic-bezier(0.2, 0, 0, 1)',
  }

  return {
    zoom,
    pan,
    isPanning,
    zoomIn,
    zoomOut,
    resetZoom,
    setZoom,
    containerRef,
    transformStyle,
  }
}

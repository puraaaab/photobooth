import React, { useState, useRef, useCallback, useEffect, useMemo } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import {
  ChevronLeft, ChevronRight, Palette, Paintbrush,
  Type, Layers, RotateCw, FlipHorizontal,
  FlipVertical, Sun, Contrast, Droplets, Thermometer,
  ZoomIn, ZoomOut, Replace, Plus, GripVertical,
  Copy, Check, Sliders, SlidersHorizontal, ArrowLeftRight, Move, Maximize2,
  Layout, Eye, Trash2, AlignLeft, AlignCenter, AlignRight,
  Bold, Italic, Sparkles, Film, Heading, Calendar, Heart, Ticket, RefreshCw, Crosshair,
  Undo2, Redo2, Hand, HelpCircle,
  LayoutGrid, Camera, Crown, Clapperboard, Clock, Wand2
} from 'lucide-react'
import { useSessionStore } from '@/store/sessionStore'
import { useHistoryStore, registerUndoHandler, registerRedoHandler } from '@/store/historyStore'
import { filterEngine, FILTER_PRESETS } from '@/engines/FilterEngine'
import { TEMPLATES } from '@/data/templates'
import { useCanvasZoom } from '@/hooks/useCanvasZoom'
import { useEditorTouchGestures } from '@/hooks/useEditorTouchGestures'
import { boothCopy } from '@/constants/boothCopy'
import { useToast } from '@/components/ui/Toast'
import { StickerPanel, type StickerItem } from '@/components/editor/StickerPanel'
import { getPhotoUrl } from '@/utils/photoUrl'
import type { Photo, PhotoEdits, FilterApplyScope, Strip, Template, CanvasElement, PhotoAssignment, FilterPreset } from '@/types'
import { registerEditorNextInterceptor, clearEditorNextInterceptor } from '@/store/editorBridge'

interface EditorScreenProps {
  onBack: () => void
  onNext: () => void
}

type EditorPanel = 'filters' | 'adjust' | 'stickers' | 'text' | 'background' | 'border'

export function EditorScreen({ onBack, onNext }: EditorScreenProps) {
  const {
    session,
    updatePhotoEdits,
    updateStrip,
    setAssignments,
    setTemplate,
    addCanvasElement,
    updateCanvasElement,
    removeCanvasElement,
    setCanvasElements,
  } = useSessionStore()
  const { push: pushHistory, undo: historyUndo, redo: historyRedo, canUndo, canRedo } = useHistoryStore()
  const { toast } = useToast()

  const [activeStripIndex, setActiveStripIndex] = useState(0)
  const [editorViewMode, setEditorViewMode] = useState<'all' | 'single'>('all')
  const [activePanel, setActivePanel] = useState<EditorPanel>('filters')
  const [selectedSlotId, setSelectedSlotId] = useState<string | null>(null)
  const [selectedElementId, setSelectedElementId] = useState<string | null>(null)
  const [editingPhotoId, setEditingPhotoId] = useState<string | null>(null)
  const [filterScope, setFilterScope] = useState<FilterApplyScope>('photos_in_strip')
  const [copiedEdits, setCopiedEdits] = useState<PhotoEdits | null>(null)
  const [showReplaceDrawer, setShowReplaceDrawer] = useState(false)
  const [draggingPhotoId, setDraggingPhotoId] = useState<string | null>(null)
  const [dragOverSlotId, setDragOverSlotId] = useState<string | null>(null)
  const [showGestureGuide, setShowGestureGuide] = useState(false)

  const elementDragRef = useRef<{
    id: string
    startPointerX: number
    startPointerY: number
    startElemX: number
    startElemY: number
    scaleX: number
    scaleY: number
  } | null>(null)

  // Canvas zoom & pan
  const canvasZoom = useCanvasZoom()
  const {
    zoom,
    pan,
    zoomIn,
    zoomOut,
    resetZoom,
    containerRef: zoomContainerRef,
    transformStyle,
  } = canvasZoom

  // Undo / Redo Execution Handlers
  const handleUndo = useCallback(() => {
    const cmd = historyUndo()
    if (!cmd) {
      toast('Nothing to undo', 'info')
      return
    }
    const { type, before } = cmd
    const typeStr = type as string
    if (typeStr === 'PHOTO_ADJUSTMENT_CHANGED') {
      const { targetPhotoId, ...edits } = (before as any) || {}
      if (targetPhotoId) updatePhotoEdits(targetPhotoId, edits)
    } else if (typeStr === 'PHOTO_FILTER_CHANGED') {
      const { filter, targetId, stripId } = (before as any) || {}
      if (stripId) {
        const stripAssignments = session?.assignments.filter(a => a.stripId === stripId) || []
        stripAssignments.forEach(a => updatePhotoEdits(a.photoId, { filter: filter || 'original' }))
      } else if (targetId) {
        updatePhotoEdits(targetId, { filter: filter || 'original' })
      }
    } else if (typeStr === 'CANVAS_ELEMENT_MOVED' || typeStr === 'CANVAS_ELEMENT_RESIZED') {
      const { id, ...updates } = (before as any) || {}
      if (id) updateCanvasElement(id, updates)
    } else if (typeStr === 'CANVAS_ELEMENT_ADDED') {
      const { id } = (cmd.after as any) || {}
      if (id) removeCanvasElement(id)
    } else if (typeStr === 'CANVAS_ELEMENT_DELETED') {
      const elem = (before as any)?.element
      if (elem) addCanvasElement(elem)
    } else if (typeStr.includes('PHOTO_ASSIGNED') || typeStr.includes('PHOTO_MOVED') || typeStr.includes('PHOTO_REPLACED')) {
      const prevAssignments = (before as any)?.assignments
      if (prevAssignments) setAssignments(prevAssignments)
    }
    toast(`Undone: ${cmd.description}`, 'info')
  }, [historyUndo, updatePhotoEdits, session?.assignments, updateCanvasElement, removeCanvasElement, addCanvasElement, setAssignments, toast])

  const handleRedo = useCallback(() => {
    const cmd = historyRedo()
    if (!cmd) {
      toast('Nothing to redo', 'info')
      return
    }
    const { type, after } = cmd
    const typeStr = type as string
    if (typeStr === 'PHOTO_ADJUSTMENT_CHANGED') {
      const { targetPhotoId, ...edits } = (after as any) || {}
      if (targetPhotoId) updatePhotoEdits(targetPhotoId, edits)
    } else if (typeStr === 'PHOTO_FILTER_CHANGED') {
      const { filter, targetId, stripId } = (after as any) || {}
      if (stripId) {
        const stripAssignments = session?.assignments.filter(a => a.stripId === stripId) || []
        stripAssignments.forEach(a => updatePhotoEdits(a.photoId, { filter: filter || 'original' }))
      } else if (targetId) {
        updatePhotoEdits(targetId, { filter: filter || 'original' })
      }
    } else if (typeStr === 'CANVAS_ELEMENT_MOVED' || typeStr === 'CANVAS_ELEMENT_RESIZED') {
      const { id, ...updates } = (after as any) || {}
      if (id) updateCanvasElement(id, updates)
    } else if (typeStr === 'CANVAS_ELEMENT_ADDED') {
      const elem = (after as any)?.element
      if (elem) addCanvasElement(elem)
    } else if (typeStr === 'CANVAS_ELEMENT_DELETED') {
      const { id } = (cmd.before as any) || {}
      if (id) removeCanvasElement(id)
    } else if (typeStr.includes('PHOTO_ASSIGNED') || typeStr.includes('PHOTO_MOVED') || typeStr.includes('PHOTO_REPLACED')) {
      const nextAssignments = (after as any)?.assignments
      if (nextAssignments) setAssignments(nextAssignments)
    }
    toast(`Redone: ${cmd.description}`, 'info')
  }, [historyRedo, updatePhotoEdits, session?.assignments, updateCanvasElement, addCanvasElement, removeCanvasElement, setAssignments, toast])

  const strips = session?.strips ?? []
  const activeStrip = strips[activeStripIndex]
  const photos = session?.photos ?? []
  const assignments = session?.assignments ?? []

  // Check if active strip template supports custom background color changes
  const activeStripTemplate = activeStrip?.template ?? session?.template
  const isColorCustomizable = Boolean(
    activeStripTemplate &&
    !activeStripTemplate.overlayImageUrl &&
    activeStripTemplate.category !== 'custom'
  )

  // If user is on FRAME panel but strip doesn't support color changing, fallback to FILTERS
  useEffect(() => {
    if (!isColorCustomizable && activePanel === 'background') {
      setActivePanel('filters')
    }
  }, [isColorCustomizable, activePanel])

  // Tool tabs available in upper taskbar
  const toolTabs = [
    { id: 'filters',    label: 'FILTERS',  icon: Palette },
    { id: 'adjust',     label: 'TUNE',     icon: SlidersHorizontal },
    { id: 'stickers',   label: 'STICKERS', icon: Sparkles },
    { id: 'text',       label: 'TEXT',     icon: Type },
    ...(isColorCustomizable ? [{ id: 'background', label: 'FRAME', icon: Layout }] : []),
  ]

  // Multi-touch tracking to strictly prevent drag/swap conflict during pinch gestures
  const touchCountRef = useRef(0)
  useEffect(() => {
    const onTouchStart = (e: TouchEvent) => {
      touchCountRef.current = e.touches.length
      if (e.touches.length > 1) {
        dragStartPos.current = null
        setPointerDrag(null)
        setDraggingPhotoId(null)
        setDragOverSlotId(null)
      }
    }
    const onTouchEnd = (e: TouchEvent) => {
      touchCountRef.current = e.touches.length
      if (e.touches.length === 0) {
        dragStartPos.current = null
      }
    }
    window.addEventListener('touchstart', onTouchStart, { passive: true })
    window.addEventListener('touchend', onTouchEnd, { passive: true })
    window.addEventListener('touchcancel', onTouchEnd, { passive: true })
    return () => {
      window.removeEventListener('touchstart', onTouchStart)
      window.removeEventListener('touchend', onTouchEnd)
      window.removeEventListener('touchcancel', onTouchEnd)
    }
  }, [])

  const getPhotoForSlot = useCallback((slotId: string): Photo | undefined => {
    const assignment = assignments.find(a => a.slotId === slotId)
    if (!assignment) return undefined
    return photos.find(p => p.id === assignment.photoId)
  }, [assignments, photos])

  // Full Multi-Touch & Multi-Finger Gesture Hook
  const { hud } = useEditorTouchGestures({
    containerRef: zoomContainerRef,
    session,
    activeStripIndex,
    stripsCount: strips.length,
    setActiveStripIndex,
    updatePhotoEdits,
    updateCanvasElement,
    getPhotoForSlot,
    canvasZoom,
    onUndo: handleUndo,
    onRedo: handleRedo,
    setSelectedSlotId,
    setSelectedElementId,
    setActivePanel,
  })

  // Pointer/Touch Drag-and-Drop state
  const [pointerDrag, setPointerDrag] = useState<{
    sourceSlotId: string
    sourcePhotoId: string
    photo: Photo
    x: number
    y: number
  } | null>(null)
  const dragStartPos = useRef<{ x: number; y: number; slotId: string; photoId: string } | null>(null)

  const editingPhoto = editingPhotoId
    ? photos.find(p => p.id === editingPhotoId)
    : null

  useEffect(() => {
    if (selectedSlotId) {
      const photo = getPhotoForSlot(selectedSlotId)
      setEditingPhotoId(photo?.id ?? null)
      // Automatically keep activeStripIndex in sync with the selected slot's strip
      const assignment = assignments.find(a => a.slotId === selectedSlotId)
      if (assignment) {
        const sIdx = strips.findIndex(s => s.id === assignment.stripId)
        if (sIdx >= 0 && sIdx !== activeStripIndex) {
          setActiveStripIndex(sIdx)
        }
      }
    }
  }, [selectedSlotId, getPhotoForSlot, assignments, strips, activeStripIndex])

  // Register undo/redo handlers so AppFooter can trigger real state reversal
  useEffect(() => {
    registerUndoHandler(handleUndo)
    registerRedoHandler(handleRedo)
    return () => {
      registerUndoHandler(() => {})
      registerRedoHandler(() => {})
    }
  }, [handleUndo, handleRedo])

  // Register next interceptor: in LOOKS panel with multiple strips, advance to next strip first
  useEffect(() => {
    registerEditorNextInterceptor(() => {
      if (activePanel === 'filters' && strips.length > 1) {
        const nextIdx = activeStripIndex + 1
        if (nextIdx < strips.length) {
          setActiveStripIndex(nextIdx)
          setFilterScope('photos_in_strip')
          toast(`Now styling Strip ${nextIdx + 1} of ${strips.length}`, 'info')
          return true // consumed — don't advance app step
        }
      }
      return false // let App advance the step
    })
    return () => clearEditorNextInterceptor()
  }, [activePanel, strips.length, activeStripIndex, toast])

  // Keyboard shortcuts Ctrl+Z / Ctrl+Y / Ctrl+Shift+Z
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === 'z' && !e.shiftKey) {
        e.preventDefault()
        handleUndo()
      } else if ((e.ctrlKey || e.metaKey) && (e.key === 'y' || (e.key === 'z' && e.shiftKey))) {
        e.preventDefault()
        handleRedo()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [handleUndo, handleRedo])

  // Active strip assignments and photos
  const activeStripAssignments = useMemo(() => {
    const currentStrip = activeStrip || strips[0]
    if (!currentStrip) return []
    return assignments.filter(a => a.stripId === currentStrip.id).sort((a, b) => a.position - b.position)
  }, [assignments, activeStrip, strips])

  const activeStripPhotos = useMemo(() => {
    return activeStripAssignments.map(a => {
      const p = photos.find(ph => ph.id === a.photoId)
      return { assignment: a, photo: p }
    }).filter((item): item is { assignment: PhotoAssignment; photo: Photo } => Boolean(item.photo))
  }, [activeStripAssignments, photos])

  const activeStripPhoto = useMemo(() => {
    if (!activeStrip) return editingPhoto || photos[0]
    if (editingPhoto && assignments.some(a => a.photoId === editingPhoto.id && a.stripId === activeStrip.id)) {
      return editingPhoto
    }
    const stripAssignment = assignments.find(a => a.stripId === activeStrip.id)
    if (stripAssignment) {
      const p = photos.find(ph => ph.id === stripAssignment.photoId)
      if (p) return p
    }
    return editingPhoto || photos[0]
  }, [activeStrip, editingPhoto, assignments, photos])

  // Exact photo being tuned/adjusted in the Tune panel
  const currentAdjustPhoto = useMemo(() => {
    if (selectedSlotId) {
      const p = getPhotoForSlot(selectedSlotId)
      if (p) return p
    }
    if (editingPhoto && activeStripAssignments.some(a => a.photoId === editingPhoto.id)) {
      return editingPhoto
    }
    return activeStripPhotos[0]?.photo ?? activeStripPhoto ?? photos[0]
  }, [selectedSlotId, getPhotoForSlot, editingPhoto, activeStripAssignments, activeStripPhotos, activeStripPhoto, photos])

  // Photo edit update with history
  const applyEdit = useCallback((
    photoId: string,
    field: keyof PhotoEdits,
    value: number | string | boolean | { x: number; y: number; width: number; height: number },
    scope?: FilterApplyScope
  ) => {
    if (photos.length === 0) return
    const currentStrip = activeStrip || strips[0]
    const targetPhotoId = photoId || currentAdjustPhoto?.id || activeStripPhoto?.id || photos[0]?.id

    // Spatial framing properties (pan, zoom/scale, rotation, flip, crop) MUST ALWAYS be isolated to the target frame/photo
    const SPATIAL_FIELDS: (keyof PhotoEdits)[] = ['panX', 'panY', 'scale', 'rotation', 'flipH', 'flipV', 'crop']
    const isSpatialEdit = SPATIAL_FIELDS.includes(field)

    // Effective scope: spatial edits or tune panel edits default to single_photo
    const effectiveScope: FilterApplyScope = isSpatialEdit 
      ? 'single_photo' 
      : (scope ?? (activePanel === 'adjust' ? 'single_photo' : filterScope))

    if (effectiveScope === 'photos_in_strip' && currentStrip) {
      const stripAssignments = assignments.filter(a => a.stripId === currentStrip.id)
      stripAssignments.forEach(a => updatePhotoEdits(a.photoId, { [field]: value } as Partial<PhotoEdits>))
      pushHistory('PHOTO_ADJUSTMENT_CHANGED', `Changed ${String(field)} on Strip ${activeStripIndex + 1}`, { targetPhotoId }, { targetPhotoId, [field]: value })
    } else if (effectiveScope === 'all_photos') {
      photos.forEach(p => updatePhotoEdits(p.id, { [field]: value } as Partial<PhotoEdits>))
      pushHistory('PHOTO_ADJUSTMENT_CHANGED', `Changed ${String(field)} on all strips`, { targetPhotoId }, { targetPhotoId, [field]: value })
    } else if (targetPhotoId) {
      updatePhotoEdits(targetPhotoId, { [field]: value } as Partial<PhotoEdits>)
      pushHistory('PHOTO_ADJUSTMENT_CHANGED', `Changed ${String(field)} on frame`, { targetPhotoId }, { targetPhotoId, [field]: value })
    }
  }, [photos, assignments, activeStrip, activeStripIndex, strips, filterScope, activePanel, currentAdjustPhoto, activeStripPhoto, updatePhotoEdits, pushHistory])

  // Apply filter preset
  const applyFilter = useCallback((filterId: string, photoId?: string) => {
    const currentStrip = activeStrip || strips[0]
    const targetId = photoId || activeStripPhoto?.id || photos[0]?.id

    if (filterScope === 'photos_in_strip' || (!photoId && filterScope !== 'all_photos')) {
      if (currentStrip) {
        const stripAssignments = assignments.filter(a => a.stripId === currentStrip.id)
        stripAssignments.forEach(a => updatePhotoEdits(a.photoId, { filter: filterId }))
        pushHistory('PHOTO_FILTER_CHANGED', `Applied filter: ${filterId} to Strip ${activeStripIndex + 1}`, {}, { filter: filterId, stripId: currentStrip.id })
      }
    } else if (filterScope === 'all_photos') {
      photos.forEach(p => updatePhotoEdits(p.id, { filter: filterId }))
      pushHistory('PHOTO_FILTER_CHANGED', `Applied filter: ${filterId} to all strips`, {}, { filter: filterId })
    } else if (targetId) {
      updatePhotoEdits(targetId, { filter: filterId })
      pushHistory('PHOTO_FILTER_CHANGED', `Applied filter: ${filterId}`, { targetId }, { targetId, filter: filterId })
    }
  }, [filterScope, photos, assignments, activeStrip, activeStripIndex, strips, activeStripPhoto, updatePhotoEdits, pushHistory])

  // Update strip background color
  const handleUpdateBackground = useCallback((color: string) => {
    const defaultTemplate = TEMPLATES.find(t => t.supportedPhotoCounts.includes(session?.layout?.photosPerStrip ?? 4)) ?? TEMPLATES[0]
    const currentTemplate: Template = session?.template ?? defaultTemplate
    if (!currentTemplate) return

    const updatedTemplate: Template = {
      ...currentTemplate,
      background: {
        ...currentTemplate.background,
        type: 'solid',
        color,
      },
    }
    setTemplate(updatedTemplate)
    pushHistory('STRIP_TEMPLATE_CHANGED', `Changed strip background to ${color}`, {}, {})
    toast('Strip background updated!', 'success')
  }, [session?.template, session?.layout?.photosPerStrip, setTemplate, pushHistory, toast])

  // Move photo up/down between adjacent slots for 1-click sorting
  const moveSlotPhoto = useCallback((slotId: string, direction: 'up' | 'down') => {
    for (const strip of strips) {
      const slotIdx = strip.slots.findIndex(sl => sl.id === slotId)
      if (slotIdx === -1) continue

      const targetIdx = direction === 'up' ? slotIdx - 1 : slotIdx + 1
      if (targetIdx < 0 || targetIdx >= strip.slots.length) return

      const currentSlot = strip.slots[slotIdx]
      const neighborSlot = strip.slots[targetIdx]

      const currentAssign = assignments.find(a => a.slotId === currentSlot.id)
      const neighborAssign = assignments.find(a => a.slotId === neighborSlot.id)

      if (currentAssign && neighborAssign) {
        const newAssignments = assignments.map(a => {
          if (a.slotId === currentSlot.id) return { ...a, photoId: neighborAssign.photoId }
          if (a.slotId === neighborSlot.id) return { ...a, photoId: currentAssign.photoId }
          return a
        })
        setAssignments(newAssignments)
        setSelectedSlotId(neighborSlot.id)
        toast('Photos reordered!', 'success')
        pushHistory('PHOTO_MOVED_BETWEEN_STRIPS', `Moved photo ${direction}`, {}, {})
      }
      break
    }
  }, [strips, assignments, setAssignments, pushHistory, toast])

  // Slot drop: handles both slot-to-slot swapping (sorting) and tray-to-slot replacement
  const handleSlotDrop = useCallback((targetSlotId: string, draggedPhotoId: string) => {
    if (!targetSlotId || !draggedPhotoId) return

    const sourceAssignment = assignments.find(a => a.photoId === draggedPhotoId)
    const targetAssignment = assignments.find(a => a.slotId === targetSlotId)

    if (sourceAssignment) {
      if (sourceAssignment.slotId === targetSlotId) {
        setDraggingPhotoId(null)
        setDragOverSlotId(null)
        return
      }

      let newAssignments: typeof assignments
      if (targetAssignment) {
        // Swap photo IDs between source slot and target slot
        newAssignments = assignments.map(a => {
          if (a.slotId === sourceAssignment.slotId) return { ...a, photoId: targetAssignment.photoId }
          if (a.slotId === targetSlotId) return { ...a, photoId: draggedPhotoId }
          return a
        })
      } else {
        // Move photo to empty target slot
        newAssignments = assignments.map(a => {
          if (a.slotId === sourceAssignment.slotId) return { ...a, slotId: targetSlotId }
          return a
        })
      }
      // Reset any pan drift on moved photos if scale is unzoomed (<= 1.05) so photos stay centered
      const movedPhoto = photos.find(p => p.id === draggedPhotoId)
      if (movedPhoto && (movedPhoto.edits?.scale ?? 1) <= 1.05) {
        updatePhotoEdits(draggedPhotoId, { panX: 0, panY: 0 })
      }
      if (targetAssignment) {
        const swappedPhoto = photos.find(p => p.id === targetAssignment.photoId)
        if (swappedPhoto && (swappedPhoto.edits?.scale ?? 1) <= 1.05) {
          updatePhotoEdits(swappedPhoto.id, { panX: 0, panY: 0 })
        }
      }
      setAssignments(newAssignments)
      toast('Photos rearranged!', 'success')
      pushHistory('PHOTO_MOVED_BETWEEN_STRIPS', 'Swapped photo slots', {}, {})
    } else {
      // Photo dragged from roll tray: replace or place photo in target slot
      let newAssignments: typeof assignments
      if (targetAssignment) {
        newAssignments = assignments.map(a =>
          a.slotId === targetSlotId ? { ...a, photoId: draggedPhotoId } : a
        )
      } else {
        let targetStripId = ''
        let targetPos = 0
        for (const s of strips) {
          const idx = s.slots.findIndex(sl => sl.id === targetSlotId)
          if (idx !== -1) {
            targetStripId = s.id
            targetPos = idx
            break
          }
        }
        newAssignments = [
          ...assignments,
          {
            photoId: draggedPhotoId,
            stripId: targetStripId || strips[0]?.id || '',
            slotId: targetSlotId,
            position: targetPos,
          }
        ]
      }
      setAssignments(newAssignments)
      toast('Photo placed in slot!', 'success')
      pushHistory('PHOTO_ASSIGNED_TO_SLOT', 'Replaced photo in slot', {}, {})
    }

    setDraggingPhotoId(null)
    setDragOverSlotId(null)
  }, [assignments, strips, photos, updatePhotoEdits, setAssignments, pushHistory, toast])

  // Touch/pointer drag events for photo swapping and canvas element movement
  useEffect(() => {
    const handlePointerMove = (e: PointerEvent) => {
      // If multi-touch (pinch-to-zoom) is happening, immediately abort photo dragging/swapping!
      if (touchCountRef.current > 1) {
        if (dragStartPos.current || pointerDrag) {
          dragStartPos.current = null
          setPointerDrag(null)
          setDraggingPhotoId(null)
          setDragOverSlotId(null)
        }
        return
      }

      // Element dragging takes priority if active
      if (elementDragRef.current) {
        const dx = (e.clientX - elementDragRef.current.startPointerX) * elementDragRef.current.scaleX
        const dy = (e.clientY - elementDragRef.current.startPointerY) * elementDragRef.current.scaleY
        updateCanvasElement(elementDragRef.current.id, {
          x: Math.round(elementDragRef.current.startElemX + dx),
          y: Math.round(elementDragRef.current.startElemY + dy),
        })
        return
      }

      if (!dragStartPos.current) return
      // Use higher threshold for touch events (24px) so pinch-in/out gestures don't trigger accidental drag
      const dragThreshold = e.pointerType === 'touch' ? 24 : 8
      const dx = Math.abs(e.clientX - dragStartPos.current.x)
      const dy = Math.abs(e.clientY - dragStartPos.current.y)
      if (dx > dragThreshold || dy > dragThreshold) {
        const photo = photos.find(p => p.id === dragStartPos.current?.photoId)
        if (photo && !pointerDrag) {
          setPointerDrag({
            sourceSlotId: dragStartPos.current.slotId,
            sourcePhotoId: dragStartPos.current.photoId,
            photo,
            x: e.clientX,
            y: e.clientY,
          })
          setDraggingPhotoId(photo.id)
        }
      }

      if (pointerDrag) {
        setPointerDrag(prev => prev ? { ...prev, x: e.clientX, y: e.clientY } : null)
        const el = document.elementFromPoint(e.clientX, e.clientY)
        const targetSlotEl = el?.closest('[data-slot-id]')
        const targetId = targetSlotEl?.getAttribute('data-slot-id')
        if (targetId && targetId !== dragStartPos.current?.slotId) {
          setDragOverSlotId(targetId)
        } else {
          setDragOverSlotId(null)
        }
      }
    }

    const handlePointerUp = (e: PointerEvent) => {
      if (elementDragRef.current) {
        elementDragRef.current = null
        pushHistory('CANVAS_ELEMENT_MOVED', 'Moved text element', {}, {})
      }

      if (pointerDrag) {
        const el = document.elementFromPoint(e.clientX, e.clientY)
        const targetSlotEl = el?.closest('[data-slot-id]')
        const targetId = targetSlotEl?.getAttribute('data-slot-id')
        if (targetId && targetId !== pointerDrag.sourceSlotId) {
          handleSlotDrop(targetId, pointerDrag.sourcePhotoId)
        }
      }
      dragStartPos.current = null
      setPointerDrag(null)
      setDraggingPhotoId(null)
      setDragOverSlotId(null)
    }

    window.addEventListener('pointermove', handlePointerMove)
    window.addEventListener('pointerup', handlePointerUp)
    window.addEventListener('pointercancel', handlePointerUp)

    return () => {
      window.removeEventListener('pointermove', handlePointerMove)
      window.removeEventListener('pointerup', handlePointerUp)
      window.removeEventListener('pointercancel', handlePointerUp)
    }
  }, [photos, pointerDrag, handleSlotDrop, updateCanvasElement, pushHistory])

  // Keyboard shortcuts (Delete element, Ctrl+Z Undo, Ctrl+Y Redo)
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const tag = (document.activeElement?.tagName || '').toLowerCase()
      if (tag === 'input' || tag === 'textarea') return

      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z') {
        e.preventDefault()
        if (e.shiftKey) {
          handleRedo()
        } else {
          handleUndo()
        }
        return
      }

      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'y') {
        e.preventDefault()
        handleRedo()
        return
      }

      if ((e.key === 'Delete' || e.key === 'Backspace') && selectedElementId) {
        removeCanvasElement(selectedElementId)
        setSelectedElementId(null)
        toast('Text element deleted', 'info')
      }
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [selectedElementId, removeCanvasElement, handleUndo, handleRedo, toast])

  const handlePointerDown = useCallback((photoId: string, slotId: string, e: React.PointerEvent) => {
    if (e.pointerType === 'touch' && (!e.isPrimary || touchCountRef.current > 1)) {
      dragStartPos.current = null
      return
    }
    dragStartPos.current = { x: e.clientX, y: e.clientY, slotId, photoId }
  }, [])

  const handlePointerDownElement = useCallback((id: string, e: React.PointerEvent) => {
    e.stopPropagation()
    setSelectedElementId(id)

    const elem = session?.canvasElements?.find(item => item.id === id)
    if (!elem) return

    if (elem.type === 'sticker') {
      setActivePanel('stickers')
    } else {
      setActivePanel('text')
    }

    const container = (e.currentTarget as HTMLElement).closest('.strip-canvas-wrapper')
    const rect = container?.getBoundingClientRect()
    const tmpl = session?.template
    const canvasW = tmpl?.canvas?.width ?? 1200
    const canvasH = tmpl?.canvas?.height ?? (tmpl?.overlayImageUrl ? 3143 : 3600)
    const scaleX = rect && rect.width > 0 ? canvasW / rect.width : 1
    const scaleY = rect && rect.height > 0 ? canvasH / rect.height : 1

    elementDragRef.current = {
      id,
      startPointerX: e.clientX,
      startPointerY: e.clientY,
      startElemX: elem.x,
      startElemY: elem.y,
      scaleX,
      scaleY,
    }
  }, [session?.canvasElements, session?.template])

  const handleAddTextElement = useCallback((presetType: 'heading' | 'subtitle' | 'date' | 'script' | 'badge') => {
    const tmpl = session?.template
    const canvasW = tmpl?.canvas?.width ?? 1200
    const canvasH = tmpl?.canvas?.height ?? (tmpl?.overlayImageUrl ? 3143 : 3600)
    const existingCount = session?.canvasElements?.length ?? 0

    let text = 'CUSTOM TEXT'
    let fontSize = 36
    let fontFamily = 'Outfit'
    let fontWeight = '700'
    const fontStyle: 'normal' | 'italic' = 'normal'
    let color = '#111111'
    let y = Math.round(canvasH * 0.15) + (existingCount % 4) * 70

    if (presetType === 'heading') {
      text = 'VINTAGE PHOTOBOOTH'
      fontSize = 44
      fontFamily = 'Playfair Display'
      fontWeight = '700'
      color = '#8A1C24'
    } else if (presetType === 'subtitle') {
      text = 'SWEETEST MEMORIES'
      fontSize = 32
      fontFamily = 'Outfit'
      fontWeight = '600'
      color = '#5C544E'
    } else if (presetType === 'date') {
      const d = new Date()
      text = `${d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }).toUpperCase()} • ROW A`
      fontSize = 28
      fontFamily = 'DM Mono'
      fontWeight = '500'
      color = '#8A1C24'
      y = Math.round(canvasH * 0.88)
    } else if (presetType === 'script') {
      text = 'always & forever ♡'
      fontSize = 42
      fontFamily = 'Caveat'
      fontWeight = '600'
      color = '#E11D48'
    } else if (presetType === 'badge') {
      text = '★ ADMIT ONE ★'
      fontSize = 34
      fontFamily = 'DM Mono'
      fontWeight = '700'
      color = '#8A1C24'
      y = Math.round(canvasH * 0.08)
    }

    const width = 800
    const x = Math.round((canvasW - width) / 2)
    const newId = `elem-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`
    const currentActiveStrip = strips[activeStripIndex] ?? strips[0]
    const targetStripId = filterScope === 'all_photos' ? undefined : currentActiveStrip?.id

    const newElement: CanvasElement = {
      id: newId,
      type: 'text',
      stripId: targetStripId,
      x,
      y,
      width,
      height: 60,
      rotation: 0,
      opacity: 1,
      locked: false,
      zIndex: 20 + existingCount,
      textProps: {
        text,
        fontSize,
        fontFamily,
        fontWeight,
        fontStyle,
        color,
        align: 'center',
        letterSpacing: 0,
        lineHeight: 1.2,
      },
    }

    addCanvasElement(newElement)
    setSelectedElementId(newId)
    setActivePanel('text')
    const targetName = targetStripId 
      ? `Strip ${(strips.findIndex(s => s.id === targetStripId) + 1) || 1}` 
      : 'all strips'
    toast(`Text added to ${targetName}! Drag directly on the strip to move.`, 'success')
    pushHistory('CANVAS_ELEMENT_ADDED', 'Added text element', {}, {})
  }, [session?.template, session?.canvasElements, filterScope, activeStripIndex, strips, addCanvasElement, pushHistory, toast])

  const handleAddStickerElement = useCallback((sticker: StickerItem) => {
    const tmpl = session?.template
    const canvasW = tmpl?.canvas?.width ?? 1200
    const canvasH = tmpl?.canvas?.height ?? (tmpl?.overlayImageUrl ? 3143 : 3600)
    const existingCount = session?.canvasElements?.length ?? 0

    const stickerW = 200
    const stickerH = Math.round(stickerW / (sticker.aspectRatio || 1))

    // Stagger placements across distinct positions on the strip so stickers never overlap
    const staggerPositions = [
      { rx: 0.22, ry: 0.24, rot: -5 },
      { rx: 0.68, ry: 0.36, rot: 7 },
      { rx: 0.25, ry: 0.56, rot: 4 },
      { rx: 0.65, ry: 0.72, rot: -6 },
      { rx: 0.45, ry: 0.88, rot: 2 },
      { rx: 0.50, ry: 0.14, rot: -3 },
      { rx: 0.30, ry: 0.44, rot: 8 },
      { rx: 0.70, ry: 0.52, rot: -8 },
    ]
    const pos = staggerPositions[existingCount % staggerPositions.length]
    const rawX = Math.round(canvasW * pos.rx - stickerW / 2)
    const rawY = Math.round(canvasH * pos.ry - stickerH / 2)
    const x = Math.max(30, Math.min(canvasW - stickerW - 30, rawX))
    const y = Math.max(40, Math.min(canvasH - stickerH - 40, rawY))

    const newId = `sticker-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`
    const currentActiveStrip = strips[activeStripIndex] ?? strips[0]
    const targetStripId = filterScope === 'all_photos' ? undefined : currentActiveStrip?.id

    const newElement: CanvasElement = {
      id: newId,
      type: 'sticker',
      stripId: targetStripId,
      x,
      y,
      width: stickerW,
      height: stickerH,
      rotation: pos.rot,
      opacity: 1,
      zIndex: 25 + existingCount,
      props: {
        url: sticker.url,
        category: sticker.category,
        name: sticker.name,
      },
    }

    addCanvasElement(newElement)
    setSelectedElementId(newId)
    setActivePanel('stickers')
    const targetName = targetStripId 
      ? `Strip ${(strips.findIndex(s => s.id === targetStripId) + 1) || 1}` 
      : 'all strips'
    toast(`Added "${sticker.name}" to ${targetName}! Drag to position on your strip.`, 'success')
    pushHistory('CANVAS_ELEMENT_ADDED', `Added sticker: ${sticker.name}`, {}, {})
  }, [session?.template, session?.canvasElements, filterScope, activeStripIndex, strips, addCanvasElement, pushHistory, toast])

  const handleDuplicateElement = useCallback((id: string) => {
    const el = session?.canvasElements?.find(item => item.id === id)
    if (!el) return
    const newId = `elem-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`
    const duplicated: CanvasElement = {
      ...el,
      id: newId,
      stripId: el.stripId,
      x: el.x + 20,
      y: el.y + 40,
      zIndex: (el.zIndex ?? 20) + 1,
      textProps: el.textProps ? { ...el.textProps } : undefined,
      props: el.props ? { ...el.props } : undefined,
    }
    addCanvasElement(duplicated)
    setSelectedElementId(newId)
    toast(el.type === 'sticker' ? 'Sticker duplicated!' : 'Text duplicated!', 'success')
  }, [session?.canvasElements, addCanvasElement, toast])

  const handleReassignElementStrip = useCallback((id: string, targetStripId: string | undefined) => {
    updateCanvasElement(id, { stripId: targetStripId })
    const label = targetStripId
      ? (targetStripId === strips[0]?.id ? 'Strip 1' : 'Strip 2')
      : 'both strips'
    toast(`Assigned element to ${label}`, 'success')
  }, [updateCanvasElement, strips, toast])

  const handleCopyElementToOtherStrip = useCallback((id: string) => {
    const el = session?.canvasElements?.find(item => item.id === id)
    if (!el || strips.length < 2) return
    const otherStrip = strips.find(s => s.id !== el.stripId) || strips[1]
    const newId = `elem-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`
    const copied: CanvasElement = {
      ...el,
      id: newId,
      stripId: otherStrip.id,
      zIndex: (el.zIndex ?? 20) + 1,
      textProps: el.textProps ? { ...el.textProps } : undefined,
      props: el.props ? { ...el.props } : undefined,
    }
    addCanvasElement(copied)
    setSelectedElementId(newId)
    const targetLabel = otherStrip.id === strips[0]?.id ? 'Strip 1' : 'Strip 2'
    toast(`Copied ${el.type === 'sticker' ? 'sticker' : 'text'} to ${targetLabel}!`, 'success')
  }, [session?.canvasElements, strips, addCanvasElement, toast])

  const handleResetTemplateText = useCallback(() => {
    const tmpl = session?.template
    if (!tmpl?.textElements || tmpl.textElements.length === 0) {
      setCanvasElements([])
      setSelectedElementId(null)
      toast('Text cleared', 'info')
      return
    }
    const defaultElements: CanvasElement[] = tmpl.textElements.map((te, idx) => ({
      id: te.id || `text-el-${idx}`,
      type: 'text' as const,
      x: te.x,
      y: te.y,
      width: te.width || 400,
      height: 60,
      rotation: 0,
      opacity: 1,
      locked: false,
      zIndex: 20 + idx,
      textProps: {
        text: te.defaultText,
        fontSize: te.fontSize,
        fontFamily: te.fontFamily || 'Outfit',
        fontWeight: te.fontWeight || '600',
        fontStyle: 'normal' as const,
        color: te.color || '#111111',
        align: te.align || 'center',
        letterSpacing: 0,
        lineHeight: 1.2,
      },
    }))
    setCanvasElements(defaultElements)
    setSelectedElementId(defaultElements[0]?.id ?? null)
    toast('Reset to template defaults!', 'success')
  }, [session?.template, setCanvasElements, toast])

  const replacePhoto = useCallback((slotId: string | null, newPhotoId: string) => {
    if (!slotId) return
    const targetAssignment = assignments.find(a => a.slotId === slotId)
    let newAssignments: typeof assignments
    if (targetAssignment) {
      newAssignments = assignments.map(a =>
        a.slotId === slotId ? { ...a, photoId: newPhotoId } : a
      )
    } else {
      let targetStripId = ''
      let targetPos = 0
      for (const s of strips) {
        const idx = s.slots.findIndex(sl => sl.id === slotId)
        if (idx !== -1) {
          targetStripId = s.id
          targetPos = idx
          break
        }
      }
      newAssignments = [
        ...assignments,
        {
          photoId: newPhotoId,
          stripId: targetStripId || strips[0]?.id || '',
          slotId: slotId,
          position: targetPos,
        }
      ]
    }
    setAssignments(newAssignments)
    setShowReplaceDrawer(false)
    toast('Photo replaced in slot!', 'success')
    pushHistory('PHOTO_REPLACED_IN_SLOT', 'Replaced photo', {}, {})
  }, [assignments, strips, setAssignments, pushHistory, toast])

  const copyEdits = useCallback(() => {
    if (editingPhoto) {
      setCopiedEdits({ ...editingPhoto.edits })
    }
  }, [editingPhoto])

  const pasteEdits = useCallback(() => {
    if (copiedEdits && editingPhotoId) {
      updatePhotoEdits(editingPhotoId, copiedEdits)
    }
  }, [copiedEdits, editingPhotoId, updatePhotoEdits])

  const renderHudIcon = (icon: string) => {
    switch (icon) {
      case 'zoom':
      case '🔍':
      case '🔎':
        return <ZoomIn size={20} color="var(--color-brand-bright, #C71B4D)" />
      case 'rotate':
      case '🔄':
        return <RotateCw size={20} color="var(--color-brand-bright, #C71B4D)" />
      case 'pan':
      case '✋':
        return <Move size={20} color="var(--color-brand-bright, #C71B4D)" />
      case 'reset':
      case '🎯':
        return <Crosshair size={20} color="var(--color-brand-bright, #C71B4D)" />
      case 'edit':
      case '✏️':
        return <Type size={20} color="var(--color-brand-bright, #C71B4D)" />
      case 'undo':
      case '↩':
      case '↩️':
        return <Undo2 size={20} color="var(--color-brand-bright, #C71B4D)" />
      case 'redo':
      case '↪':
      case '↪️':
        return <Redo2 size={20} color="var(--color-brand-bright, #C71B4D)" />
      case 'canvas':
      case '🔲':
        return <Maximize2 size={20} color="var(--color-brand-bright, #C71B4D)" />
      case 'arrow-right':
      case '➡️':
        return <ChevronRight size={20} color="var(--color-brand-bright, #C71B4D)" />
      case 'arrow-left':
      case '⬅️':
        return <ChevronLeft size={20} color="var(--color-brand-bright, #C71B4D)" />
      case 'sparkles':
      case '✨':
      default:
        return <Sparkles size={20} color="var(--color-brand-bright, #C71B4D)" />
    }
  }

  if (!activeStrip) {
    return (
      <div className="flex items-center justify-center h-full" style={{ flexDirection: 'column', gap: 'var(--space-4)' }}>
        <p style={{ color: 'var(--color-text-secondary)', fontFamily: 'var(--font-mono)', fontSize: 'var(--text-sm)' }}>
          No strips created yet. Go back and select a layout.
        </p>
        <button className="btn btn-secondary" onClick={onBack}>← Back</button>
      </div>
    )
  }

  return (
    <div className="editor-screen-layout flex h-full overflow-hidden" style={{ background: 'var(--color-bg-base)' }}>
      {/* ─── Left Panel: Photo Tray ────────────────────────────────────────── */}
      <div
        className="panel panel-left editor-left-panel"
        style={{
          display: 'flex',
          flexDirection: 'column',
          flexShrink: 0,
        }}
      >
        <div
          style={{
            padding: '14px 16px',
            borderBottom: 'var(--border-w-md) solid var(--color-border-subtle)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
          }}
        >
          <span style={{ fontFamily: 'var(--font-mono)', fontSize: 13, fontWeight: 700, letterSpacing: '0.08em', color: 'var(--color-text-secondary)', textTransform: 'uppercase' }}>
            ROLL · {photos.filter(p => session?.selectedPhotoIds.includes(p.id)).length}
          </span>
          <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--color-text-tertiary)', fontFamily: 'var(--font-mono)' }}>
            DRAG
          </span>
        </div>

        <div className="panel-body flex flex-col gap-2 overflow-y-auto" style={{ padding: '12px' }}>
          {photos
            .filter(p => session?.selectedPhotoIds.includes(p.id))
            .map((photo, i) => {
              const isAssigned = assignments.some(a => a.photoId === photo.id)
              const isEditing = editingPhotoId === photo.id

              return (
                <div
                  key={photo.id}
                  draggable
                  onDragStart={(e) => {
                    e.dataTransfer.setData('text/plain', photo.id)
                    e.dataTransfer.effectAllowed = 'copyMove'
                    setDraggingPhotoId(photo.id)
                  }}
                  onDragEnd={() => {
                    setDraggingPhotoId(null)
                    setDragOverSlotId(null)
                  }}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 10,
                    padding: '8px 10px',
                    borderRadius: 'var(--radius-md)',
                    background: isEditing ? 'var(--color-bg-card)' : 'var(--color-bg-elevated)',
                    border: isEditing ? '2px solid var(--color-primary)' : '2px solid var(--color-border-subtle)',
                    boxShadow: isEditing ? 'var(--shadow-block-sm)' : 'none',
                    cursor: 'grab',
                    opacity: isAssigned ? 1 : 0.75,
                    transition: 'border-color var(--transition-fast)',
                    touchAction: 'none',
                  }}
                  onClick={() => {
                    setEditingPhotoId(photo.id)
                    const assign = assignments.find(a => a.photoId === photo.id)
                    if (assign) setSelectedSlotId(assign.slotId)
                  }}
                >
                  <GripVertical size={16} style={{ color: 'var(--color-text-tertiary)', flexShrink: 0, pointerEvents: 'none' }} />
                  <div style={{ width: 56, height: 72, borderRadius: 'var(--radius-sm)', overflow: 'hidden', flexShrink: 0, background: '#000', pointerEvents: 'none', boxShadow: 'var(--shadow-block-sm)' }}>
                    <img
                      src={getPhotoUrl(photo.thumbnailUrl)}
                      alt=""
                      draggable={false}
                      style={{ width: '100%', height: '100%', objectFit: 'cover', pointerEvents: 'none' }}
                    />
                  </div>
                  <div style={{ flex: 1, overflow: 'hidden', minWidth: 0 }}>
                    <div style={{ fontSize: 13, fontFamily: 'var(--font-mono)', fontWeight: 700, color: 'var(--color-text-primary)' }}>
                      #{String(i + 1).padStart(2, '0')}
                    </div>
                    {photo.edits.filter !== 'original' && (
                      <div style={{ fontSize: 12, fontFamily: 'var(--font-mono)', fontWeight: 600, color: 'var(--color-primary)', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                        {photo.edits.filter}
                      </div>
                    )}
                  </div>
                </div>
              )
            })}
        </div>
      </div>

      {/* ─── Center: Strip Canvas ─────────────────────────────────────────── */}
      <div className="canvas-area flex flex-col flex-1" style={{ position: 'relative', overflow: 'hidden', background: 'var(--color-bg-base)' }}>
        {/* Strip navigation & View Mode Bar */}
        <div
          className="editor-canvas-toolbar flex items-center justify-between"
          style={{
            padding: '8px 16px',
            borderBottom: '1px solid var(--color-border-subtle)',
            background: 'var(--color-bg-surface)',
            width: '100%',
            flexShrink: 0,
          }}
        >
          {/* Strip Selector Pills (if multiple strips exist) */}
          {strips.length > 1 ? (
            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <span style={{ fontSize: 11, fontFamily: 'var(--font-mono)', fontWeight: 800, color: 'var(--color-text-secondary)', letterSpacing: '0.05em' }}>
                STRIP:
              </span>
              <div style={{ display: 'flex', gap: 3, background: 'var(--color-bg-base)', padding: 3, borderRadius: 'var(--radius-md)', border: '1px solid var(--color-border-subtle)' }}>
                {strips.map((s, idx) => {
                  const isStripActive = activeStripIndex === idx
                  return (
                    <button
                      key={s.id}
                      type="button"
                      onClick={() => setActiveStripIndex(idx)}
                      style={{
                        padding: '4px 11px',
                        fontSize: 11,
                        fontWeight: 800,
                        fontFamily: 'var(--font-mono)',
                        border: 'none',
                        borderRadius: 'var(--radius-sm)',
                        background: isStripActive ? 'var(--color-brand)' : 'transparent',
                        color: isStripActive ? '#ffffff' : 'var(--color-text-secondary)',
                        cursor: 'pointer',
                        transition: 'all 0.15s ease',
                        letterSpacing: '0.04em',
                        boxShadow: isStripActive ? '0 2px 6px rgba(109, 6, 38, 0.25)' : 'none',
                      }}
                    >
                      {String(idx + 1).padStart(2, '0')}
                    </button>
                  )
                })}
              </div>
            </div>
          ) : (
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <div style={{
                width: 8,
                height: 8,
                borderRadius: '50%',
                background: 'var(--color-brand)',
                boxShadow: '0 0 8px var(--color-brand)',
              }} />
              <span style={{ fontFamily: 'var(--font-mono)', fontSize: 12, fontWeight: 800, letterSpacing: '0.08em', color: 'var(--color-text-primary)', textTransform: 'uppercase' }}>
                PHOTOBOOTH STUDIO
              </span>
            </div>
          )}

          {/* Main Upper Tool Navigation Tabs (Moved from sidebar rail) */}
          <div style={{
            display: 'flex',
            alignItems: 'center',
            gap: 5,
            background: 'var(--color-bg-base)',
            padding: '3px 6px',
            borderRadius: 'var(--radius-lg)',
            border: '1px solid var(--color-border-subtle)',
          }}>
            {toolTabs.map(({ id, label, icon: Icon }) => {
              const isActive = activePanel === id
              return (
                <button
                  key={id}
                  type="button"
                  onClick={() => setActivePanel(id as EditorPanel)}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 6,
                    padding: '6px 13px',
                    borderRadius: 'var(--radius-md)',
                    border: isActive ? '1.5px solid var(--color-brand)' : '1px solid transparent',
                    background: isActive ? 'rgba(109, 6, 38, 0.12)' : 'transparent',
                    color: isActive ? 'var(--color-brand)' : 'var(--color-text-secondary)',
                    fontWeight: 800,
                    fontFamily: 'var(--font-mono)',
                    fontSize: 11.5,
                    letterSpacing: '0.05em',
                    cursor: 'pointer',
                    transition: 'all 0.18s cubic-bezier(0.16, 1, 0.3, 1)',
                    boxShadow: isActive ? '0 2px 8px rgba(109, 6, 38, 0.15)' : 'none',
                  }}
                >
                  <Icon size={14} strokeWidth={isActive ? 2.5 : 2} />
                  <span>{label}</span>
                </button>
              )
            })}
          </div>

          {/* Quick Undo / Redo & Gesture Shortcuts */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <button
              onClick={handleUndo}
              disabled={!canUndo()}
              title="Undo (or 2-Finger Tap / Ctrl+Z)"
              style={{
                padding: '6px 12px',
                fontSize: 12,
                fontWeight: 700,
                fontFamily: 'var(--font-mono)',
                border: '1px solid var(--color-border-subtle)',
                background: 'var(--color-bg-surface)',
                color: canUndo() ? 'var(--color-text-primary)' : 'var(--color-text-tertiary)',
                opacity: canUndo() ? 1 : 0.45,
                cursor: canUndo() ? 'pointer' : 'default',
                borderRadius: 'var(--radius-sm)',
                display: 'flex',
                alignItems: 'center',
                gap: 5,
                minHeight: 38,
              }}
            >
              <Undo2 size={14} />
              <span>UNDO</span>
            </button>
            <button
              onClick={handleRedo}
              disabled={!canRedo()}
              title="Redo (or 3-Finger Tap / Ctrl+Y)"
              style={{
                padding: '6px 12px',
                fontSize: 12,
                fontWeight: 700,
                fontFamily: 'var(--font-mono)',
                border: '1px solid var(--color-border-subtle)',
                background: 'var(--color-bg-surface)',
                color: canRedo() ? 'var(--color-text-primary)' : 'var(--color-text-tertiary)',
                opacity: canRedo() ? 1 : 0.45,
                cursor: canRedo() ? 'pointer' : 'default',
                borderRadius: 'var(--radius-sm)',
                display: 'flex',
                alignItems: 'center',
                gap: 5,
                minHeight: 38,
              }}
            >
              <Redo2 size={14} />
              <span>REDO</span>
            </button>
            <button
              onClick={() => setShowGestureGuide(true)}
              title="Touch Gestures & Shortcuts Guide"
              style={{
                padding: '6px 12px',
                fontSize: 12,
                fontWeight: 700,
                fontFamily: 'var(--font-mono)',
                border: '1px solid rgba(109, 6, 38, 0.3)',
                background: 'rgba(109, 6, 38, 0.08)',
                color: 'var(--color-brand)',
                cursor: 'pointer',
                borderRadius: 'var(--radius-sm)',
                display: 'flex',
                alignItems: 'center',
                gap: 6,
                minHeight: 38,
              }}
            >
              <Hand size={14} />
              <span>TOUCH GESTURES</span>
            </button>
          </div>
        </div>

        {/* Strip Preview Canvas with Pan/Zoom & Multi-Touch Gestures */}
        <div
          ref={zoomContainerRef}
          className="strip-preview-container"
          onClick={(e) => {
            const target = e.target as HTMLElement
            if (!target.closest('[data-element-id]') && !target.closest('[data-slot-id]')) {
              setSelectedElementId(null)
              setSelectedSlotId(null)
            }
          }}
          style={{
            flex: 1,
            overflow: 'auto',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            position: 'relative',
            touchAction: 'none',
            userSelect: 'none',
            WebkitOverflowScrolling: 'touch',
            background: 'var(--color-bg-base)',
          }}
        >
          {/* Floating Multi-Touch Gesture HUD Pill */}
          <AnimatePresence>
            {hud.visible && (
              <motion.div
                initial={{ opacity: 0, y: -16, scale: 0.9 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                exit={{ opacity: 0, y: -12, scale: 0.95 }}
                transition={{ duration: 0.15 }}
                style={{
                  position: 'absolute',
                  top: 16,
                  left: '50%',
                  transform: 'translateX(-50%)',
                  zIndex: 60,
                  background: 'rgba(10, 2, 5, 0.92)',
                  backdropFilter: 'blur(12px)',
                  border: '1.5px solid rgba(247, 241, 234, 0.3)',
                  boxShadow: '0 8px 32px rgba(0, 0, 0, 0.5)',
                  borderRadius: 9999,
                  padding: '8px 22px',
                  display: 'flex',
                  alignItems: 'center',
                  gap: 12,
                  pointerEvents: 'none',
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  {renderHudIcon(hud.icon)}
                </div>
                <div style={{ display: 'flex', flexDirection: 'column' }}>
                  <span style={{ color: '#fff', fontSize: 13, fontWeight: 800, fontFamily: 'var(--font-display)', letterSpacing: '0.02em' }}>
                    {hud.title}
                  </span>
                  {hud.detail && (
                    <span style={{ color: 'rgba(255, 255, 255, 0.65)', fontSize: 11, fontFamily: 'var(--font-mono)' }}>
                      {hud.detail}
                    </span>
                  )}
                </div>
              </motion.div>
            )}
          </AnimatePresence>

          <div style={transformStyle}>
            {editorViewMode === 'all' ? (
              <div
                style={{
                  display: 'flex',
                  alignItems: 'flex-start',
                  gap: 28,
                  padding: '28px 36px',
                  justifyContent: strips.length <= 2 ? 'center' : 'flex-start',
                }}
              >
                {strips.map((s, idx) => (
                  <div
                    key={s.id}
                    onClick={() => setActiveStripIndex(idx)}
                    style={{
                      display: 'flex',
                      flexDirection: 'column',
                      alignItems: 'center',
                      flexShrink: 0,
                      cursor: 'pointer',
                    }}
                  >
                    <div
                      style={{
                        marginBottom: 10,
                        display: 'flex',
                        alignItems: 'center',
                        gap: 6,
                        background: activeStripIndex === idx ? 'var(--color-primary)' : 'var(--color-bg-surface)',
                        color: activeStripIndex === idx ? '#ffffff' : 'var(--color-text-secondary)',
                        border: activeStripIndex === idx ? '1px solid var(--color-primary)' : '1px solid var(--color-border-subtle)',
                        padding: '3px 10px',
                        borderRadius: 'var(--radius-sm)',
                        fontSize: 10,
                        fontFamily: 'var(--font-mono)',
                        letterSpacing: '0.04em',
                        transition: 'all var(--transition-fast)',
                      }}
                    >
                      <span>STRIP {String(idx + 1).padStart(2, '0')}</span>
                      <span style={{ opacity: 0.6 }}>·</span>
                      <span>{s.slots.length} SHOTS</span>
                    </div>

                    <StripCanvas
                      strip={s}
                      stripIndex={idx}
                      template={s.template ?? session?.template ?? null}
                      getPhotoForSlot={getPhotoForSlot}
                      selectedSlotId={selectedSlotId}
                      isActive={activeStripIndex === idx}
                      onSelectStrip={() => setActiveStripIndex(idx)}
                      onSlotClick={(slotId) => {
                        setSelectedSlotId(slotId)
                        setActiveStripIndex(idx)
                      }}
                      onSlotDoubleClick={(slotId) => {
                        setSelectedSlotId(slotId)
                        setActiveStripIndex(idx)
                        setShowReplaceDrawer(true)
                      }}
                      draggingPhotoId={draggingPhotoId}
                      dragOverSlotId={dragOverSlotId}
                      onDragStartSlot={(photoId) => setDraggingPhotoId(photoId)}
                      onDragEndSlot={() => {
                        setDraggingPhotoId(null)
                        setDragOverSlotId(null)
                      }}
                      onDragOver={(slotId) => setDragOverSlotId(slotId)}
                      onDrop={(slotId, droppedPhotoId) => handleSlotDrop(slotId, droppedPhotoId)}
                      onPointerDownSlot={handlePointerDown}
                      onMoveSlot={moveSlotPhoto}
                      canvasElements={(session?.canvasElements ?? []).filter(el => !el.stripId || el.stripId === s.id)}
                      selectedElementId={selectedElementId}
                      onSelectElement={(id) => {
                        setSelectedElementId(id)
                        setActiveStripIndex(idx)
                      }}
                      onPointerDownElement={handlePointerDownElement}
                      onRemoveElement={(id) => {
                        removeCanvasElement(id)
                        if (selectedElementId === id) setSelectedElementId(null)
                        toast('Element removed', 'info')
                      }}
                      onUpdateElement={updateCanvasElement}
                      onEditPhoto={(photoId, field, val) => applyEdit(photoId, field, val, 'single_photo')}
                    />
                  </div>
                ))}
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', padding: '28px' }}>
                <StripCanvas
                  strip={activeStrip}
                  stripIndex={activeStripIndex}
                  template={activeStrip?.template ?? session?.template ?? null}
                  getPhotoForSlot={getPhotoForSlot}
                  selectedSlotId={selectedSlotId}
                  isActive={true}
                  onSelectStrip={() => setActiveStripIndex(activeStripIndex)}
                  onSlotClick={(slotId) => setSelectedSlotId(slotId)}
                  onSlotDoubleClick={(slotId) => {
                    setSelectedSlotId(slotId)
                    setShowReplaceDrawer(true)
                  }}
                  draggingPhotoId={draggingPhotoId}
                  dragOverSlotId={dragOverSlotId}
                  onDragStartSlot={(photoId) => setDraggingPhotoId(photoId)}
                  onDragEndSlot={() => {
                    setDraggingPhotoId(null)
                    setDragOverSlotId(null)
                  }}
                  onDragOver={(slotId) => setDragOverSlotId(slotId)}
                  onDrop={(slotId, droppedPhotoId) => handleSlotDrop(slotId, droppedPhotoId)}
                  onPointerDownSlot={handlePointerDown}
                  onMoveSlot={moveSlotPhoto}
                  canvasElements={(session?.canvasElements ?? []).filter(el => !el.stripId || el.stripId === activeStrip?.id)}
                  selectedElementId={selectedElementId}
                  onSelectElement={setSelectedElementId}
                  onPointerDownElement={handlePointerDownElement}
                  onRemoveElement={(id) => {
                    removeCanvasElement(id)
                    if (selectedElementId === id) setSelectedElementId(null)
                    toast('Element removed', 'info')
                  }}
                  onUpdateElement={updateCanvasElement}
                  onEditPhoto={(photoId, field, val) => applyEdit(photoId, field, val, 'single_photo')}
                />
              </div>
            )}
          </div>

          {/* Minimal Floating Zoom Controls */}
          <div
            style={{
              position: 'absolute',
              bottom: 14,
              left: '50%',
              transform: 'translateX(-50%)',
              display: 'flex',
              alignItems: 'center',
              gap: 4,
              background: 'var(--color-bg-elevated)',
              border: '1px solid var(--color-border-default)',
              borderRadius: 'var(--radius-sm)',
              padding: '3px 8px',
              zIndex: 30,
            }}
          >
            <button
              className="btn btn-ghost btn-icon btn-sm"
              onClick={zoomOut}
              title="Zoom Out"
              style={{ width: 24, height: 24 }}
            >
              <ZoomOut size={13} />
            </button>
            <span
              style={{
                padding: '2px 6px',
                fontSize: 11,
                fontFamily: 'var(--font-mono)',
                color: 'var(--color-text-secondary)',
                minWidth: 44,
                textAlign: 'center',
              }}
            >
              {Math.round(zoom * 100)}%
            </span>
            <button
              className="btn btn-ghost btn-icon btn-sm"
              onClick={zoomIn}
              title="Zoom In"
              style={{ width: 24, height: 24 }}
            >
              <ZoomIn size={13} />
            </button>
            <div style={{ width: 1, height: 14, background: 'var(--color-border-subtle)', margin: '0 2px' }} />
            <button
              className="btn btn-ghost btn-sm"
              onClick={resetZoom}
              style={{ fontSize: 10, fontFamily: 'var(--font-mono)', padding: '2px 6px', display: 'flex', alignItems: 'center', gap: 3 }}
            >
              <Maximize2 size={11} />
              <span>FIT</span>
            </button>
          </div>

          {/* Touch / Pointer drag floating avatar */}
          {pointerDrag && (
            <div
              style={{
                position: 'fixed',
                left: pointerDrag.x,
                top: pointerDrag.y,
                transform: 'translate(-50%, -50%) scale(1.04)',
                width: 90,
                height: 68,
                borderRadius: 'var(--radius-sm)',
                overflow: 'hidden',
                border: '2px solid var(--color-primary)',
                pointerEvents: 'none',
                zIndex: 9999,
                background: '#000',
              }}
            >
              <img
                src={getPhotoUrl(pointerDrag.photo.previewUrl || pointerDrag.photo.thumbnailUrl)}
                alt=""
                style={{ width: '100%', height: '100%', objectFit: 'cover' }}
              />
              <div
                style={{
                  position: 'absolute',
                  bottom: 2,
                  right: 3,
                  background: 'var(--color-primary)',
                  color: '#ffffff',
                  fontSize: 9,
                  fontFamily: 'var(--font-mono)',
                  padding: '1px 4px',
                  borderRadius: 2,
                  display: 'flex',
                  alignItems: 'center',
                  gap: 2,
                }}
              >
                <ArrowLeftRight size={8} />
                <span>SWAP</span>
              </div>
            </div>
          )}
        </div>

        {/* Horizontal film strip — visible on portrait tablet kiosk */}
        <div className="editor-film-strip">
          {photos
            .filter(p => session?.selectedPhotoIds.includes(p.id))
            .map((photo, i) => {
              const isAssigned = assignments.some(a => a.photoId === photo.id)
              const isEditing = editingPhotoId === photo.id

              return (
                <div
                  key={photo.id}
                  className="editor-film-strip-thumb"
                  draggable
                  onDragStart={(e) => {
                    e.dataTransfer.setData('text/plain', photo.id)
                    e.dataTransfer.effectAllowed = 'copyMove'
                    setDraggingPhotoId(photo.id)
                  }}
                  onDragEnd={() => {
                    setDraggingPhotoId(null)
                    setDragOverSlotId(null)
                  }}
                  style={{
                    borderColor: isEditing ? 'var(--color-primary)' : undefined,
                    opacity: isAssigned ? 1 : 0.75,
                  }}
                  onClick={() => {
                    setEditingPhotoId(photo.id)
                    const assign = assignments.find(a => a.photoId === photo.id)
                    if (assign) setSelectedSlotId(assign.slotId)
                  }}
                >
                  <img
                    src={getPhotoUrl(photo.originalUrl || photo.previewUrl || photo.thumbnailUrl)}
                    alt=""
                    draggable={false}
                    style={{ pointerEvents: 'none' }}
                  />
                  <div
                    style={{
                      position: 'absolute',
                      bottom: 2,
                      left: 2,
                      right: 2,
                      background: 'rgba(0, 0, 0, 0.75)',
                      borderRadius: 3,
                      fontSize: 10,
                      fontFamily: 'var(--font-mono)',
                      fontWeight: 700,
                      color: '#ffffff',
                      textAlign: 'center',
                      pointerEvents: 'none',
                    }}
                  >
                    #{String(i + 1).padStart(2, '0')}
                  </div>
                </div>
              )
            })}
        </div>
      </div>

      {/* ─── Right Panel: Vertical Studio Navigation Rail + Drawer ─────── */}
      <div
        className="panel editor-right-panel"
        style={{
          background: 'var(--color-bg-surface)',
          boxShadow: 'var(--shadow-panel-right)',
          zIndex: 10,
        }}
      >
        {/* ─── Tool Drawer Panel ───────────────────────── */}
        <div
          className="editor-tool-drawer"
          style={{
            background: 'var(--color-bg-surface)',
          }}
        >
          {/* Top Panel Title Bar */}
          <div
            style={{
              padding: '12px 14px',
              background: 'var(--color-card, #FFFFFF)',
              borderBottom: '1px solid var(--color-border-subtle)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              {activePanel === 'filters' && <Palette size={16} color="var(--color-brand)" />}
              {activePanel === 'adjust' && <SlidersHorizontal size={16} color="var(--color-brand)" />}
              {activePanel === 'stickers' && <Sparkles size={16} color="var(--color-brand)" />}
              {activePanel === 'text' && <Type size={16} color="var(--color-brand)" />}
              {activePanel === 'background' && <Layout size={16} color="var(--color-brand)" />}
              <span
                style={{
                  fontSize: 12,
                  fontFamily: 'var(--font-mono)',
                  fontWeight: 800,
                  letterSpacing: '0.08em',
                  color: 'var(--color-text-primary, #2B0510)',
                  textTransform: 'uppercase',
                }}
              >
                {activePanel === 'filters' && 'Filters & Moods'}
                {activePanel === 'adjust' && 'Tune & Adjustments'}
                {activePanel === 'stickers' && 'Stickers & Graphics'}
                {activePanel === 'text' && 'Typography & Stamps'}
                {activePanel === 'background' && 'Frame & Background'}
              </span>
            </div>
            <span
              style={{
                fontSize: 9.5,
                fontFamily: 'var(--font-mono)',
                color: 'var(--color-text-tertiary)',
                letterSpacing: '0.04em',
                fontWeight: 600,
              }}
            >
              STUDIO
            </span>
          </div>

          <div className="panel-body overflow-y-auto flex-1" style={{ padding: '14px' }}>

            {/* Filter Panel */}
            {activePanel === 'filters' && activeStripPhoto && (
              <FilterPanel
                photo={activeStripPhoto}
                onApplyFilter={(filterId) => applyFilter(filterId, activeStripPhoto.id)}
                onIntensityChange={(v) => applyEdit(activeStripPhoto.id, 'filterIntensity', v)}
              />
            )}

            {/* Adjust Panel */}
            {activePanel === 'adjust' && currentAdjustPhoto && (
              <AdjustPanel
                photo={currentAdjustPhoto}
                stripSlots={activeStripPhotos}
                onSelectSlot={(slotId) => {
                  setSelectedSlotId(slotId)
                  const p = getPhotoForSlot(slotId)
                  if (p) setEditingPhotoId(p.id)
                }}
                onEdit={(field, value) => applyEdit(currentAdjustPhoto.id, field, value, 'single_photo')}
              />
            )}

            {/* Sticker Panel */}
            {activePanel === 'stickers' && (
              <StickerPanel
                canvasElements={session?.canvasElements ?? []}
                selectedElementId={selectedElementId}
                onSelectElement={setSelectedElementId}
                onAddSticker={handleAddStickerElement}
                onUpdateElement={updateCanvasElement}
                onRemoveElement={(id) => {
                  removeCanvasElement(id)
                  if (selectedElementId === id) setSelectedElementId(null)
                  toast('Sticker removed', 'info')
                }}
                onDuplicateElement={handleDuplicateElement}
                strips={strips}
                activeStripIndex={activeStripIndex}
                filterScope={filterScope}
                onSelectStripIndex={setActiveStripIndex}
                onSelectFilterScope={setFilterScope}
                onReassignStrip={handleReassignElementStrip}
                onCopyToOtherStrip={handleCopyElementToOtherStrip}
              />
            )}

            {/* Text Panel */}
            {activePanel === 'text' && (
              <TextPanel
                strip={activeStrip}
                canvasElements={session?.canvasElements ?? []}
                selectedElementId={selectedElementId}
                onSelectElement={setSelectedElementId}
                onAddElement={handleAddTextElement}
                onUpdateElement={updateCanvasElement}
                onRemoveElement={(id) => {
                  removeCanvasElement(id)
                  if (selectedElementId === id) setSelectedElementId(null)
                  toast('Text removed', 'info')
                }}
                onDuplicateElement={handleDuplicateElement}
                onResetTemplateText={handleResetTemplateText}
                strips={strips}
                activeStripIndex={activeStripIndex}
                filterScope={filterScope}
                onSelectStripIndex={setActiveStripIndex}
                onSelectFilterScope={setFilterScope}
                onReassignStrip={handleReassignElementStrip}
                onCopyToOtherStrip={handleCopyElementToOtherStrip}
              />
            )}

            {/* Background Panel */}
            {activePanel === 'background' && (
              <BackgroundPanel
                template={session?.template ?? null}
                onSelectColor={handleUpdateBackground}
              />
            )}
          </div>

          {/* Replace photo drawer trigger if slot selected */}
          {selectedSlotId && (
            <div style={{ padding: '10px 14px', borderTop: '1px solid var(--color-border-subtle)', background: 'var(--color-bg-base)' }}>
              <button
                className="btn btn-secondary w-full btn-sm"
                onClick={() => setShowReplaceDrawer(true)}
                style={{ fontSize: 11, fontFamily: 'var(--font-mono)', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6 }}
              >
                <Replace size={13} />
                <span>REPLACE PHOTO IN SLOT</span>
              </button>
            </div>
          )}
        </div>
      </div>

      {/* ─── Replace Photo Drawer ─────────────────────────────────────────── */}
      <AnimatePresence>
        {showReplaceDrawer && selectedSlotId && (
          <>
            <motion.div
              className="modal-overlay"
              initial={{ opacity: 0 }}
              animate={{ opacity: 0.6 }}
              exit={{ opacity: 0 }}
              onClick={() => setShowReplaceDrawer(false)}
            />
            <motion.div
              initial={{ x: '100%' }}
              animate={{ x: 0 }}
              exit={{ x: '100%' }}
              transition={{ type: 'spring', damping: 30, stiffness: 300 }}
              style={{
                position: 'fixed',
                right: 0,
                top: 0,
                bottom: 0,
                width: 320,
                background: 'var(--color-bg-surface)',
                borderLeft: '1px solid var(--color-border-default)',
                zIndex: 'var(--z-modal)',
                display: 'flex',
                flexDirection: 'column',
              }}
            >
              <div style={{ padding: '14px 16px', borderBottom: '1px solid var(--color-border-subtle)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <h3 style={{ fontFamily: 'var(--font-mono)', fontSize: 12, letterSpacing: '0.06em', color: 'var(--color-text-primary)', textTransform: 'uppercase' }}>
                  Choose Photo for Slot
                </h3>
                <button className="btn btn-ghost btn-icon btn-sm" onClick={() => setShowReplaceDrawer(false)}>
                  ×
                </button>
              </div>
              <div style={{ flex: 1, overflowY: 'auto', padding: '14px' }}>
                <p style={{ fontSize: 11, color: 'var(--color-text-secondary)', marginBottom: 12 }}>
                  Pick a photo from the roll to put in this slot:
                </p>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 8 }}>
                  {photos
                    .filter(p => session?.selectedPhotoIds.includes(p.id))
                    .map((photo, i) => (
                      <div
                        key={photo.id}
                        onClick={() => replacePhoto(selectedSlotId, photo.id)}
                        style={{
                          aspectRatio: '3/4',
                          borderRadius: 'var(--radius-sm)',
                          overflow: 'hidden',
                          cursor: 'pointer',
                          border: '1px solid var(--color-border-subtle)',
                          transition: 'border-color var(--transition-fast)',
                          background: '#000',
                        }}
                        onMouseEnter={e => (e.currentTarget.style.borderColor = 'var(--color-primary)')}
                        onMouseLeave={e => (e.currentTarget.style.borderColor = 'var(--color-border-subtle)')}
                      >
                        <img
                          src={getPhotoUrl(photo.originalUrl || photo.previewUrl || photo.thumbnailUrl)}
                          alt={`Shot ${i + 1}`}
                          style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                        />
                      </div>
                    ))}
                </div>
              </div>
            </motion.div>
          </>
        )}

        {/* ─── Touch Gestures & Shortcuts Guide Modal ──────────────────────── */}
        {showGestureGuide && (
          <>
            <motion.div
              className="modal-overlay"
              initial={{ opacity: 0 }}
              animate={{ opacity: 0.7 }}
              exit={{ opacity: 0 }}
              onClick={() => setShowGestureGuide(false)}
              style={{ zIndex: 110 }}
            />
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 15 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 15 }}
              transition={{ duration: 0.2 }}
              style={{
                position: 'fixed',
                top: '50%',
                left: '50%',
                transform: 'translate(-50%, -50%)',
                width: 'min(92vw, 540px)',
                maxHeight: '85vh',
                background: 'var(--color-bg-surface)',
                border: '1.5px solid var(--color-border-default)',
                borderRadius: 'var(--radius-xl)',
                boxShadow: '0 24px 64px rgba(0, 0, 0, 0.5)',
                zIndex: 115,
                display: 'flex',
                flexDirection: 'column',
                overflow: 'hidden',
              }}
            >
              <div style={{ padding: '16px 20px', borderBottom: '1px solid var(--color-border-subtle)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <div style={{ width: 34, height: 34, borderRadius: '50%', background: 'rgba(109, 6, 38, 0.12)', color: 'var(--color-brand)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    <Hand size={18} />
                  </div>
                  <div>
                    <h3 style={{ fontFamily: 'var(--font-display)', fontSize: 16, fontWeight: 800, margin: 0 }}>
                      Touch Gestures & Shortcuts
                    </h3>
                    <span style={{ fontSize: 11, color: 'var(--color-text-secondary)', fontFamily: 'var(--font-mono)' }}>
                      EVERY SINGLE & TWO-FINGER SCENARIO
                    </span>
                  </div>
                </div>
                <button
                  className="btn btn-ghost btn-icon btn-sm"
                  onClick={() => setShowGestureGuide(false)}
                  style={{ width: 32, height: 32, fontSize: 18 }}
                >
                  ×
                </button>
              </div>

              <div style={{ padding: '16px 20px', overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 12 }}>
                {[
                  {
                    icon: <Hand size={18} color="var(--color-brand)" />,
                    badge: '2 FINGERS',
                    title: 'Pinch to Zoom & Scale',
                    desc: 'Pinch in/out on any photo to zoom framing (1.0x to 3.0x). On stickers/text, pinch to resize proportionally.',
                  },
                  {
                    icon: <RotateCw size={18} color="var(--color-brand)" />,
                    badge: '2 FINGERS',
                    title: 'Twist to Rotate',
                    desc: 'Rotate two fingers on any photo, sticker, or text to spin angle. Snaps automatically to 90° intervals.',
                  },
                  {
                    icon: <Move size={18} color="var(--color-brand)" />,
                    badge: '2 FINGERS',
                    title: 'Drag to Pan Framing',
                    desc: 'Slide two fingers inside a photo frame to shift the cropped composition left, right, up, or down.',
                  },
                  {
                    icon: <Crosshair size={18} color="var(--color-brand)" />,
                    badge: '1 FINGER',
                    title: 'Double Tap',
                    desc: 'On a photo: resets framing to 1.0x center (or zooms to 1.5x). On canvas: resets workspace zoom to 100%.',
                  },
                  {
                    icon: <Undo2 size={18} color="var(--color-brand)" />,
                    badge: '2 FINGERS',
                    title: 'Quick Two-Finger Tap (Undo)',
                    desc: 'Tap with two fingers anywhere on the editor to instantly undo your last action (Procreate style).',
                  },
                  {
                    icon: <Redo2 size={18} color="var(--color-brand)" />,
                    badge: '3 FINGERS',
                    title: 'Quick Three-Finger Tap (Redo)',
                    desc: 'Tap with three fingers to re-apply any undone change.',
                  },
                  {
                    icon: <ArrowLeftRight size={18} color="var(--color-brand)" />,
                    badge: '2 FINGERS',
                    title: 'Two-Finger Horizontal Swipe',
                    desc: 'Swipe left or right with two fingers to quickly navigate between multiple photobooth strips.',
                  },
                ].map((item, idx) => (
                  <div
                    key={idx}
                    style={{
                      display: 'flex',
                      alignItems: 'flex-start',
                      gap: 14,
                      padding: '10px 14px',
                      background: 'var(--color-bg-base)',
                      borderRadius: 'var(--radius-md)',
                      border: '1px solid var(--color-border-subtle)',
                    }}
                  >
                    <div style={{ width: 34, height: 34, borderRadius: '50%', background: 'rgba(109, 6, 38, 0.08)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                      {item.icon}
                    </div>
                    <div style={{ flex: 1 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 2 }}>
                        <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--color-text-primary)' }}>
                          {item.title}
                        </span>
                        <span style={{ fontSize: 9, fontFamily: 'var(--font-mono)', fontWeight: 800, padding: '1px 6px', borderRadius: 4, background: 'rgba(109, 6, 38, 0.1)', color: 'var(--color-brand)' }}>
                          {item.badge}
                        </span>
                      </div>
                      <p style={{ margin: 0, fontSize: 11, color: 'var(--color-text-secondary)', lineHeight: 1.4 }}>
                        {item.desc}
                      </p>
                    </div>
                  </div>
                ))}
              </div>

              <div style={{ padding: '12px 20px', borderTop: '1px solid var(--color-border-subtle)', display: 'flex', justifyContent: 'flex-end', background: 'var(--color-bg-base)' }}>
                <button
                  className="btn btn-primary btn-sm"
                  onClick={() => setShowGestureGuide(false)}
                  style={{ minWidth: 100 }}
                >
                  GOT IT
                </button>
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </div>
  )
}

// ─── Strip Canvas ─────────────────────────────────────────────────────────────

function StripCanvas({
  strip,
  stripIndex = 0,
  template,
  getPhotoForSlot,
  selectedSlotId,
  onSlotClick,
  onSlotDoubleClick,
  draggingPhotoId,
  dragOverSlotId,
  onDragStartSlot,
  onDragEndSlot,
  onDragOver,
  onDrop,
  onPointerDownSlot,
  onMoveSlot,
  canvasElements = [],
  selectedElementId = null,
  onSelectElement,
  onPointerDownElement,
  onRemoveElement,
  onUpdateElement,
  onEditPhoto,
  onSelectStrip,
  isActive = false,
}: {
  strip: Strip
  stripIndex?: number
  template: import('@/types').Template | null
  getPhotoForSlot: (slotId: string) => Photo | undefined
  selectedSlotId: string | null
  onSlotClick: (slotId: string) => void
  onSlotDoubleClick: (slotId: string) => void
  draggingPhotoId: string | null
  dragOverSlotId: string | null
  onDragStartSlot?: (photoId: string, slotId: string) => void
  onDragEndSlot?: () => void
  onDragOver: (slotId: string) => void
  onDrop: (slotId: string, droppedPhotoId: string) => void
  onPointerDownSlot?: (photoId: string, slotId: string, e: React.PointerEvent) => void
  onMoveSlot?: (slotId: string, direction: 'up' | 'down') => void
  canvasElements?: CanvasElement[]
  selectedElementId?: string | null
  onSelectElement?: (id: string | null) => void
  onPointerDownElement?: (id: string, e: React.PointerEvent) => void
  onRemoveElement?: (id: string) => void
  onUpdateElement?: (id: string, updates: Partial<CanvasElement>) => void
  onEditPhoto?: (photoId: string, field: keyof PhotoEdits, value: any) => void
  onSelectStrip?: (index: number) => void
  isActive?: boolean
}) {
  const stripTemplate = strip.template ?? template
  const bg = stripTemplate?.background
  let bgStyle: React.CSSProperties = {}

  if (bg?.type === 'solid') bgStyle.background = bg.color
  else if (bg?.type === 'gradient' && bg.gradient) {
    const { angle, stops } = bg.gradient
    const stopsStr = stops.map(s => `${s.color} ${s.offset * 100}%`).join(', ')
    bgStyle.background = `linear-gradient(${angle ?? 135}deg, ${stopsStr})`
  } else {
    bgStyle.background = '#6D0626'
  }

  const border = stripTemplate?.border
  if (border && border.type !== 'none') {
    bgStyle.border = `${border.width ?? 2}px solid ${border.color ?? '#cccccc'}`
    bgStyle.boxSizing = 'border-box'
  }

  const hasOverlay = Boolean(stripTemplate?.overlayImageUrl && stripTemplate.photoSlots?.length)
  const stripWidth = 240

  const renderCanvasElement = (
    el: CanvasElement,
    canvasW: number,
    canvasH: number,
    renderW: number
  ) => {
    // Isolate element to its assigned strip
    if (el.stripId && el.stripId !== strip.id) return null

    if (el.type === 'sticker' && el.props && 'url' in el.props) {
      const isSelected = selectedElementId === el.id
      const leftPct = (el.x / canvasW) * 100
      const topPct = (el.y / canvasH) * 100
      const widthPct = (el.width / canvasW) * 100
      const heightPct = (el.height / canvasH) * 100

      return (
        <div
          key={el.id}
          data-element-id={el.id}
          onClick={(e) => {
            e.stopPropagation()
            onSelectStrip?.(stripIndex)
            onSelectElement?.(el.id)
          }}
          onPointerDown={(e) => onPointerDownElement?.(el.id, e)}
          style={{
            position: 'absolute',
            left: `${leftPct}%`,
            top: `${topPct}%`,
            width: `${widthPct}%`,
            height: `${heightPct}%`,
            zIndex: isSelected ? 35 : (el.zIndex ?? 25),
            cursor: 'move',
            transform: el.rotation ? `rotate(${el.rotation}deg)` : undefined,
            touchAction: 'none',
            opacity: el.opacity ?? 1,
          }}
        >
          <img
            src={(el.props as any).url}
            alt={(el.props as any).name || 'Sticker'}
            draggable={false}
            style={{
              width: '100%',
              height: '100%',
              objectFit: 'contain',
              pointerEvents: 'none',
              userSelect: 'none',
              filter: isSelected
                ? 'drop-shadow(0 0 6px var(--color-brand))'
                : 'drop-shadow(0 2px 4px rgba(0,0,0,0.25))',
            }}
          />

          {isSelected && (
            <>
              <div
                style={{
                  position: 'absolute',
                  inset: -3,
                  border: '2px dashed var(--color-brand)',
                  borderRadius: 4,
                  pointerEvents: 'none',
                }}
              />

              {/* Quick Floating Size & Rotation Bar */}
              <div
                onClick={(e) => e.stopPropagation()}
                style={{
                  position: 'absolute',
                  bottom: '100%',
                  left: '50%',
                  transform: 'translateX(-50%)',
                  marginBottom: 6,
                  display: 'flex',
                  alignItems: 'center',
                  gap: 3,
                  background: 'rgba(47, 1, 14, 0.96)',
                  border: '1.5px solid var(--color-brand)',
                  borderRadius: 6,
                  padding: '2px 4px',
                  boxShadow: '0 4px 14px rgba(0,0,0,0.5)',
                  zIndex: 50,
                  whiteSpace: 'nowrap',
                }}
              >
                <button
                  type="button"
                  title="Smaller"
                  onClick={() => {
                    const newW = Math.max(40, Math.round(el.width * 0.85))
                    const newH = Math.max(40, Math.round(el.height * 0.85))
                    onUpdateElement?.(el.id, { width: newW, height: newH })
                  }}
                  style={{
                    padding: '2px 5px',
                    borderRadius: 3,
                    background: 'rgba(255, 255, 255, 0.1)',
                    border: '1px solid rgba(255, 255, 255, 0.15)',
                    color: '#ffffff',
                    fontSize: 10,
                    fontWeight: 700,
                    cursor: 'pointer',
                  }}
                >
                  -
                </button>
                <span style={{ fontSize: 9, fontFamily: 'var(--font-mono)', color: 'var(--color-offwhite)', padding: '0 2px', fontWeight: 700 }}>
                  {Math.round(el.width)}px
                </span>
                <button
                  type="button"
                  title="Larger"
                  onClick={() => {
                    const newW = Math.min(800, Math.round(el.width * 1.15))
                    const newH = Math.min(800, Math.round(el.height * 1.15))
                    onUpdateElement?.(el.id, { width: newW, height: newH })
                  }}
                  style={{
                    padding: '2px 5px',
                    borderRadius: 3,
                    background: 'rgba(255, 255, 255, 0.1)',
                    border: '1px solid rgba(255, 255, 255, 0.15)',
                    color: '#ffffff',
                    fontSize: 10,
                    fontWeight: 700,
                    cursor: 'pointer',
                  }}
                >
                  +
                </button>
                <button
                  type="button"
                  title="Rotate 45°"
                  onClick={() => onUpdateElement?.(el.id, { rotation: ((el.rotation ?? 0) + 45) % 360 })}
                  style={{
                    padding: '2px 5px',
                    borderRadius: 3,
                    background: 'rgba(255, 255, 255, 0.1)',
                    border: '1px solid rgba(255, 255, 255, 0.15)',
                    color: '#ffffff',
                    fontSize: 10,
                    cursor: 'pointer',
                  }}
                >
                  <RotateCw size={10} />
                </button>
                <button
                  type="button"
                  title="Delete"
                  onClick={() => onRemoveElement?.(el.id)}
                  style={{
                    padding: '2px 5px',
                    borderRadius: 3,
                    background: 'rgba(225, 29, 72, 0.4)',
                    border: '1px solid rgba(225, 29, 72, 0.6)',
                    color: '#ffffff',
                    fontSize: 10,
                    cursor: 'pointer',
                  }}
                >
                  <Trash2 size={10} />
                </button>
              </div>

              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation()
                  onRemoveElement?.(el.id)
                }}
                title="Delete sticker"
                style={{
                  position: 'absolute',
                  top: -8,
                  right: -8,
                  width: 20,
                  height: 20,
                  borderRadius: '50%',
                  background: '#e11d48',
                  color: '#ffffff',
                  border: '1.5px solid #ffffff',
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  fontSize: 12,
                  fontWeight: 800,
                  lineHeight: 1,
                  zIndex: 40,
                  boxShadow: '0 2px 6px rgba(0,0,0,0.3)',
                }}
              >
                ×
              </button>
            </>
          )}
        </div>
      )
    }

    if (el.type !== 'text' || !el.textProps) return null
    const isSelected = selectedElementId === el.id
    const leftPct = (el.x / canvasW) * 100
    const topPct = (el.y / canvasH) * 100
    const widthPct = (el.width / canvasW) * 100
    const scale = renderW / canvasW
    const fontSize = Math.max(9, Math.round((el.textProps.fontSize ?? 36) * scale))

    return (
      <div
        key={el.id}
        data-element-id={el.id}
        onClick={(e) => {
          e.stopPropagation()
          onSelectStrip?.(stripIndex)
          onSelectElement?.(el.id)
        }}
        onPointerDown={(e) => onPointerDownElement?.(el.id, e)}
        style={{
          position: 'absolute',
          left: `${leftPct}%`,
          top: `${topPct}%`,
          width: `${widthPct}%`,
          minHeight: 18,
          zIndex: isSelected ? 35 : 25,
          cursor: 'move',
          transform: el.rotation ? `rotate(${el.rotation}deg)` : undefined,
          touchAction: 'none',
        }}
      >
        <div
          style={{
            color: el.textProps.color ?? '#111111',
            fontSize,
            fontFamily: el.textProps.fontFamily ?? 'Outfit',
            fontWeight: el.textProps.fontWeight ?? '600',
            fontStyle: el.textProps.fontStyle ?? 'normal',
            textAlign: el.textProps.align ?? 'center',
            letterSpacing: el.textProps.letterSpacing ? `${el.textProps.letterSpacing * scale}px` : undefined,
            lineHeight: el.textProps.lineHeight ?? 1.2,
            outline: isSelected ? '2px dashed var(--color-brand)' : '1px dashed transparent',
            outlineOffset: 3,
            borderRadius: 3,
            padding: '2px 4px',
            background: isSelected ? 'rgba(109, 6, 38, 0.15)' : 'transparent',
            transition: 'background 0.1s ease',
            wordBreak: 'break-word',
            userSelect: 'none',
          }}
        >
          {el.textProps.text}
        </div>

        {isSelected && (
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation()
              onRemoveElement?.(el.id)
            }}
            title="Delete text"
            style={{
              position: 'absolute',
              top: -8,
              right: -8,
              width: 18,
              height: 18,
              borderRadius: '50%',
              background: '#e11d48',
              color: '#ffffff',
              border: '1.5px solid #ffffff',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontSize: 11,
              fontWeight: 700,
              lineHeight: 1,
              zIndex: 40,
              boxShadow: '0 2px 6px rgba(0,0,0,0.3)',
            }}
          >
            ×
          </button>
        )}
      </div>
    )
  }

  if (hasOverlay && stripTemplate) {
    const aspect = stripTemplate.canvas.height / stripTemplate.canvas.width
    const stripHeight = Math.round(stripWidth * aspect)

    return (
      <div
        className="strip-canvas-wrapper"
        data-strip-id={strip.id}
        data-strip-index={stripIndex}
        onClick={() => {
          onSelectStrip?.(stripIndex)
          onSelectElement?.(null)
        }}
        style={{
          background: 'transparent',
          borderRadius: 0,
          overflow: 'hidden',
          width: stripWidth,
          height: stripHeight,
          border: isActive ? '2px solid var(--color-primary)' : 'none',
          userSelect: 'none',
          position: 'relative',
          transition: 'border-color var(--transition-fast)',
        }}
      >
        {stripTemplate.photoSlots.map((slotDef, i) => {
          const slot = strip.slots[i] || { id: slotDef.id, slotDefinition: slotDef }
          const photo = getPhotoForSlot(slot.id)
          const isSelected = selectedSlotId === slot.id
          const isDragOver = dragOverSlotId === slot.id
          const isBeingDragged = draggingPhotoId === photo?.id

          const leftPct = (slotDef.x / stripTemplate.canvas.width) * 100
          const topPct = (slotDef.y / stripTemplate.canvas.height) * 100
          const widthPct = (slotDef.width / stripTemplate.canvas.width) * 100
          const heightPct = (slotDef.height / stripTemplate.canvas.height) * 100

          return (
            <div
              key={slot.id}
              data-slot-id={slot.id}
              onClick={() => {
                onSelectStrip?.(stripIndex)
                onSlotClick(slot.id)
              }}
              onDoubleClick={() => onSlotDoubleClick(slot.id)}
              draggable={!!photo}
              onDragStart={(e) => {
                if (photo) {
                  e.dataTransfer.setData('text/plain', photo.id)
                  e.dataTransfer.setData('source-slot-id', slot.id)
                  e.dataTransfer.effectAllowed = 'move'
                  onDragStartSlot?.(photo.id, slot.id)
                }
              }}
              onDragEnd={() => {
                onDragEndSlot?.()
              }}
              onDragOver={(e) => {
                e.preventDefault()
                e.stopPropagation()
                e.dataTransfer.dropEffect = 'move'
                onDragOver(slot.id)
              }}
              onDragEnter={(e) => {
                e.preventDefault()
                e.stopPropagation()
                onDragOver(slot.id)
              }}
              onDrop={(e) => {
                e.preventDefault()
                e.stopPropagation()
                const droppedPhotoId = e.dataTransfer.getData('text/plain') || draggingPhotoId
                if (droppedPhotoId) {
                  onDrop(slot.id, droppedPhotoId)
                }
              }}
              onPointerDown={(e) => {
                if (photo) {
                  onPointerDownSlot?.(photo.id, slot.id, e)
                }
              }}
              className={`strip-slot ${!photo ? 'empty' : ''} ${isDragOver ? 'drag-over' : ''}`}
              style={{
                position: 'absolute',
                left: `${leftPct}%`,
                top: `${topPct}%`,
                width: `${widthPct}%`,
                height: `${heightPct}%`,
                overflow: 'hidden',
                outline: isDragOver
                  ? '3px solid var(--color-brand)'
                  : isSelected
                  ? '2px solid var(--color-brand)'
                  : 'none',
                outlineOffset: isDragOver ? 2 : 1,
                cursor: photo ? 'grab' : 'pointer',
                transition: 'outline 120ms ease, opacity 120ms ease, transform 120ms ease',
                transform: `${slotDef?.rotation ? `rotate(${slotDef.rotation}deg) ` : ''}${isDragOver ? 'scale(1.02)' : ''}`.trim() || undefined,
                transformOrigin: 'center center',
                opacity: isBeingDragged ? 0.35 : 1,
                background: '#1a1a1a',
                zIndex: isSelected || isDragOver ? 15 : 2,
              }}
            >
              {photo ? (
                <>
                  <img
                    src={getPhotoUrl(photo.originalUrl || photo.previewUrl || photo.thumbnailUrl)}
                    alt={`Slot ${i + 1}`}
                    draggable={false}
                    style={{
                      width: '100%',
                      height: '100%',
                      objectFit: 'cover',
                      filter: filterEngine.getCSSFilter(photo.edits),
                      transform: (() => {
                        const photoScale = photo.edits.scale ?? 1
                        const maxPanX = photoScale > 1.05 ? Math.max(0, (photoScale - 1) * 70) : 0
                        const maxPanY = photoScale > 1.05 ? Math.max(0, (photoScale - 1) * 70) : 0
                        const clampedPanX = Math.max(-maxPanX, Math.min(maxPanX, photo.edits.panX ?? 0))
                        const clampedPanY = Math.max(-maxPanY, Math.min(maxPanY, photo.edits.panY ?? 0))
                        return `
                          rotate(${photo.edits.rotation}deg)
                          scaleX(${photo.edits.flipH ? -1 : 1})
                          scaleY(${photo.edits.flipV ? -1 : 1})
                          scale(${photoScale})
                          translate(${clampedPanX}px, ${clampedPanY}px)
                        `
                      })(),
                      pointerEvents: 'none',
                    }}
                  />
                  <div
                    style={{
                      position: 'absolute',
                      top: 4,
                      right: 4,
                      background: 'rgba(10, 10, 8, 0.75)',
                      color: '#f0ede8',
                      borderRadius: 3,
                      padding: '2px 4px',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      pointerEvents: 'none',
                      opacity: 0.75,
                    }}
                    title="Drag to swap or sort"
                  >
                    <Move size={10} />
                  </div>
                </>
              ) : (
                <div
                  className="flex flex-col items-center justify-center h-full"
                  style={{ gap: 4, color: 'var(--color-text-tertiary)', pointerEvents: 'none' }}
                >
                  <Plus size={16} />
                  <span style={{ fontSize: 10, fontFamily: 'var(--font-mono)' }}>SLOT {i + 1}</span>
                </div>
              )}

              {isDragOver && (
                <div
                  style={{
                    position: 'absolute',
                    inset: 0,
                    background: 'rgba(109, 6, 38, 0.92)',
                    display: 'flex',
                    flexDirection: 'column',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: 6,
                    color: '#F7F1EA',
                    zIndex: 30,
                    pointerEvents: 'none',
                  }}
                >
                  <ArrowLeftRight size={22} color="#F7F1EA" />
                  <span style={{ fontSize: 11, fontFamily: 'var(--font-mono)', fontWeight: 700, letterSpacing: '0.08em' }}>
                    DROP TO REARRANGE
                  </span>
                </div>
              )}

              {isSelected && !isDragOver && (
                <div
                  style={{
                    position: 'absolute',
                    top: 4,
                    left: 4,
                    right: 4,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    zIndex: 25,
                    pointerEvents: 'auto',
                  }}
                  onClick={e => e.stopPropagation()}
                >
                  <span
                    style={{
                      fontSize: 9,
                      fontFamily: 'var(--font-mono)',
                      color: '#ffffff',
                      background: 'var(--color-primary)',
                      padding: '2px 6px',
                      borderRadius: 3,
                      fontWeight: 700,
                      letterSpacing: '0.04em',
                    }}
                  >
                    SLOT {i + 1}
                  </span>

                  <div
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: 3,
                      background: 'rgba(47, 1, 14, 0.92)',
                      padding: '2px 4px',
                      borderRadius: 4,
                      backdropFilter: 'blur(4px)',
                      border: '1px solid rgba(109, 6, 38, 0.4)',
                    }}
                  >
                    {photo && onEditPhoto && (
                      <>
                        <button
                          type="button"
                          onClick={() => {
                            const cur = photo.edits.scale ?? 1
                            onEditPhoto(photo.id, 'scale', Math.max(1, Math.round((cur - 0.15) * 10) / 10))
                          }}
                          title="Zoom Out"
                          style={{
                            background: 'transparent',
                            border: 'none',
                            color: 'var(--color-offwhite)',
                            cursor: 'pointer',
                            padding: '1px 3px',
                            display: 'flex',
                            alignItems: 'center',
                          }}
                        >
                          <ZoomOut size={10} />
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            const cur = photo.edits.scale ?? 1
                            onEditPhoto(photo.id, 'scale', Math.min(3, Math.round((cur + 0.15) * 10) / 10))
                          }}
                          title="Zoom In"
                          style={{
                            background: 'transparent',
                            border: 'none',
                            color: 'var(--color-offwhite)',
                            cursor: 'pointer',
                            padding: '1px 3px',
                            display: 'flex',
                            alignItems: 'center',
                          }}
                        >
                          <ZoomIn size={10} />
                        </button>
                        <div style={{ width: 1, height: 10, background: 'rgba(255,255,255,0.2)', margin: '0 1px' }} />
                      </>
                    )}
                    {i > 0 && (
                      <button
                        type="button"
                        onClick={() => onMoveSlot?.(slot.id, 'up')}
                        title="Move Up"
                        style={{
                          background: 'transparent',
                          border: 'none',
                          color: 'var(--color-offwhite)',
                          cursor: 'pointer',
                          padding: '1px 4px',
                          fontSize: 10,
                          fontWeight: 700,
                          lineHeight: 1,
                          borderRadius: 2,
                        }}
                      >
                        ▲
                      </button>
                    )}
                    {i < stripTemplate.photoSlots.length - 1 && (
                      <button
                        type="button"
                        onClick={() => onMoveSlot?.(slot.id, 'down')}
                        title="Move Down"
                        style={{
                          background: 'transparent',
                          border: 'none',
                          color: 'var(--color-offwhite)',
                          cursor: 'pointer',
                          padding: '1px 4px',
                          fontSize: 10,
                          fontWeight: 700,
                          lineHeight: 1,
                          borderRadius: 2,
                        }}
                      >
                        ▼
                      </button>
                    )}
                  </div>
                </div>
              )}
            </div>
          )
        })}

        {/* Foreground Frame Overlay Image */}
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

        {/* Movable Canvas Elements (Text / Badges) */}
        {canvasElements.map(el => renderCanvasElement(el, stripTemplate.canvas.width, stripTemplate.canvas.height, stripWidth))}
      </div>
    )
  }

  const slotCount = strip.slots.length
  const margin = 10
  const gap = 6
  const innerWidth = stripWidth - margin * 2
  // Classic vintage photobooth proportions with 40% height increase
  const baseSlotHeight =
    slotCount <= 1 ? Math.round(innerWidth * 1.2) :
    slotCount === 2 ? Math.round(innerWidth * 0.9) :
    slotCount === 3 ? Math.round(innerWidth * 0.82) :
    slotCount === 4 ? Math.round(innerWidth * 0.75) :
    Math.round(innerWidth * 0.65)
  const slotHeight = Math.round(baseSlotHeight * 1.4)

  return (
    <div
      className="strip-canvas-wrapper"
      data-strip-id={strip.id}
      data-strip-index={stripIndex}
      onClick={() => {
        onSelectStrip?.(stripIndex)
        onSelectElement?.(null)
      }}
      style={{
        ...bgStyle,
        borderRadius: 0, // Natural physical photobooth paper print (square)
        overflow: 'hidden',
        width: stripWidth,
        display: 'flex',
        flexDirection: 'column',
        gap,
        padding: `${margin}px ${margin}px ${margin + 2}px ${margin}px`,
        border: isActive ? '2px solid var(--color-primary)' : '1px solid var(--color-border-default)',
        userSelect: 'none',
        position: 'relative',
        transition: 'border-color var(--transition-fast)',
      }}
    >

      {/* Photo Slots */}
      {strip.slots.map((slot, i) => {
        const photo = getPhotoForSlot(slot.id)
        const isSelected = selectedSlotId === slot.id
        const isDragOver = dragOverSlotId === slot.id
        const isBeingDragged = draggingPhotoId === photo?.id

        return (
          <div
            key={slot.id}
            data-slot-id={slot.id}
            onClick={() => {
              onSelectStrip?.(stripIndex)
              onSlotClick(slot.id)
            }}
            onDoubleClick={() => onSlotDoubleClick(slot.id)}
            draggable={!!photo}
            onDragStart={(e) => {
              if (photo) {
                e.dataTransfer.setData('text/plain', photo.id)
                e.dataTransfer.setData('source-slot-id', slot.id)
                e.dataTransfer.effectAllowed = 'move'
                onDragStartSlot?.(photo.id, slot.id)
              }
            }}
            onDragEnd={() => {
              onDragEndSlot?.()
            }}
            onDragOver={(e) => {
              e.preventDefault()
              e.stopPropagation()
              e.dataTransfer.dropEffect = 'move'
              onDragOver(slot.id)
            }}
            onDragEnter={(e) => {
              e.preventDefault()
              e.stopPropagation()
              onDragOver(slot.id)
            }}
            onDrop={(e) => {
              e.preventDefault()
              e.stopPropagation()
              const droppedPhotoId = e.dataTransfer.getData('text/plain') || draggingPhotoId
              if (droppedPhotoId) {
                onDrop(slot.id, droppedPhotoId)
              }
            }}
            onPointerDown={(e) => {
              if (photo) {
                onPointerDownSlot?.(photo.id, slot.id, e)
              }
            }}
            className={`strip-slot ${!photo ? 'empty' : ''} ${isDragOver ? 'drag-over' : ''}`}
            style={{
              height: slotHeight,
              borderRadius: slot.slotDefinition.shape === 'rounded' ? 4
                : slot.slotDefinition.shape === 'circle' ? '50%'
                : 0,
              overflow: 'hidden',
              position: 'relative',
              outline: isDragOver
                ? '3px solid var(--color-brand)'
                : isSelected
                ? '2px solid var(--color-brand)'
                : '1px solid rgba(0, 0, 0, 0.12)',
              outlineOffset: isDragOver ? 2 : 1,
              cursor: photo ? 'grab' : 'pointer',
              transition: 'outline 120ms ease, opacity 120ms ease, transform 120ms ease',
              transform: `${slot.slotDefinition?.rotation ? `rotate(${slot.slotDefinition.rotation}deg) ` : ''}${isDragOver ? 'scale(1.02)' : ''}`.trim() || undefined,
              transformOrigin: 'center center',
              flexShrink: 0,
              opacity: isBeingDragged ? 0.35 : 1,
              background: '#edeae4',
            }}
          >
            {photo ? (
              <>
                <img
                  src={getPhotoUrl(photo.originalUrl || photo.previewUrl || photo.thumbnailUrl)}
                  alt={`Slot ${i + 1}`}
                  draggable={false}
                  style={{
                    width: '100%',
                    height: '100%',
                    objectFit: 'cover',
                    filter: filterEngine.getCSSFilter(photo.edits),
                    transform: (() => {
                      const photoScale = photo.edits.scale ?? 1
                      const maxPanX = photoScale > 1.05 ? Math.max(0, (photoScale - 1) * 70) : 0
                      const maxPanY = photoScale > 1.05 ? Math.max(0, (photoScale - 1) * 70) : 0
                      const clampedPanX = Math.max(-maxPanX, Math.min(maxPanX, photo.edits.panX ?? 0))
                      const clampedPanY = Math.max(-maxPanY, Math.min(maxPanY, photo.edits.panY ?? 0))
                      return `
                        rotate(${photo.edits.rotation}deg)
                        scaleX(${photo.edits.flipH ? -1 : 1})
                        scaleY(${photo.edits.flipV ? -1 : 1})
                        scale(${photoScale})
                        translate(${clampedPanX}px, ${clampedPanY}px)
                      `
                    })(),
                    pointerEvents: 'none',
                  }}
                />

                {/* Subtle drag cue */}
                <div
                  style={{
                    position: 'absolute',
                    top: 4,
                    right: 4,
                    background: 'rgba(10, 10, 8, 0.75)',
                    color: '#f0ede8',
                    borderRadius: 3,
                    padding: '2px 4px',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    pointerEvents: 'none',
                    opacity: 0.75,
                  }}
                  title="Drag to swap or sort"
                >
                  <Move size={10} />
                </div>
              </>
            ) : (
              <div
                className="flex flex-col items-center justify-center h-full"
                style={{ gap: 4, color: 'var(--color-text-tertiary)', pointerEvents: 'none' }}
              >
                <Plus size={16} />
                <span style={{ fontSize: 10, fontFamily: 'var(--font-mono)' }}>SLOT {i + 1}</span>
              </div>
            )}

            {/* Drag-over Swap / Replace Overlay */}
            {isDragOver && (
              <div
                style={{
                  position: 'absolute',
                  inset: 0,
                  background: 'rgba(109, 6, 38, 0.92)',
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: 6,
                  color: '#F7F1EA',
                  zIndex: 30,
                  pointerEvents: 'none',
                }}
              >
                <ArrowLeftRight size={22} color="#F7F1EA" />
                <span style={{ fontSize: 11, fontFamily: 'var(--font-mono)', fontWeight: 700, letterSpacing: '0.08em' }}>
                  DROP TO REARRANGE
                </span>
              </div>
            )}

            {/* Slot overlay & 1-click reorder controls on select */}
            {isSelected && !isDragOver && (
              <div
                style={{
                  position: 'absolute',
                  top: 4,
                  left: 4,
                  right: 4,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  zIndex: 25,
                  pointerEvents: 'auto',
                }}
                onClick={e => e.stopPropagation()}
              >
                <span
                  style={{
                    fontSize: 9,
                    fontFamily: 'var(--font-mono)',
                    color: '#ffffff',
                    background: 'var(--color-primary)',
                    padding: '2px 6px',
                    borderRadius: 3,
                    fontWeight: 700,
                    letterSpacing: '0.04em',
                  }}
                >
                  SLOT {i + 1}
                </span>

                <div
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 3,
                    background: 'rgba(47, 1, 14, 0.92)',
                    padding: '2px 4px',
                    borderRadius: 4,
                    backdropFilter: 'blur(4px)',
                    border: '1px solid rgba(109, 6, 38, 0.4)',
                  }}
                >
                  {photo && onEditPhoto && (
                    <>
                      <button
                        type="button"
                        onClick={() => {
                          const cur = photo.edits.scale ?? 1
                          onEditPhoto(photo.id, 'scale', Math.max(1, Math.round((cur - 0.15) * 10) / 10))
                        }}
                        title="Zoom Out"
                        style={{
                          background: 'transparent',
                          border: 'none',
                          color: 'var(--color-offwhite)',
                          cursor: 'pointer',
                          padding: '1px 3px',
                          display: 'flex',
                          alignItems: 'center',
                        }}
                      >
                        <ZoomOut size={10} />
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          const cur = photo.edits.scale ?? 1
                          onEditPhoto(photo.id, 'scale', Math.min(3, Math.round((cur + 0.15) * 10) / 10))
                        }}
                        title="Zoom In"
                        style={{
                          background: 'transparent',
                          border: 'none',
                          color: 'var(--color-offwhite)',
                          cursor: 'pointer',
                          padding: '1px 3px',
                          display: 'flex',
                          alignItems: 'center',
                        }}
                      >
                        <ZoomIn size={10} />
                      </button>
                      <div style={{ width: 1, height: 10, background: 'rgba(255,255,255,0.2)', margin: '0 1px' }} />
                    </>
                  )}
                  {i > 0 && (
                    <button
                      type="button"
                      onClick={() => onMoveSlot?.(slot.id, 'up')}
                      title="Move Up (Swap with slot above)"
                      style={{
                        background: 'transparent',
                        border: 'none',
                        color: 'var(--color-offwhite)',
                        cursor: 'pointer',
                        padding: '1px 4px',
                        fontSize: 10,
                        fontWeight: 700,
                        lineHeight: 1,
                        borderRadius: 2,
                      }}
                    >
                      ▲
                    </button>
                  )}
                  {i < strip.slots.length - 1 && (
                    <button
                      type="button"
                      onClick={() => onMoveSlot?.(slot.id, 'down')}
                      title="Move Down (Swap with slot below)"
                      style={{
                        background: 'transparent',
                        border: 'none',
                        color: 'var(--color-offwhite)',
                        cursor: 'pointer',
                        padding: '1px 4px',
                        fontSize: 10,
                        fontWeight: 700,
                        lineHeight: 1,
                        borderRadius: 2,
                      }}
                    >
                      ▼
                    </button>
                  )}
                </div>
              </div>
            )}
          </div>
        )
      })}


      {/* Strip Footer Branding */}
      <div
        style={{
          marginTop: 'auto',
          paddingTop: 8,
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          gap: 1,
          borderTop: '1px dashed rgba(0, 0, 0, 0.15)',
        }}
      >
        <span style={{ fontFamily: 'var(--font-mono)', fontSize: 9, fontWeight: 700, letterSpacing: '0.14em', color: '#5c5954' }}>
          PHOTOBOOTH
        </span>
        <span style={{ fontSize: 8, fontFamily: 'var(--font-mono)', color: '#9e9b95', letterSpacing: '0.06em' }}>
          {new Date().toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }).toUpperCase()}
        </span>
      </div>

      {/* Movable Canvas Elements */}
      {canvasElements.map(el => renderCanvasElement(el, stripTemplate?.canvas?.width ?? 1200, 3600, stripWidth))}
    </div>
  )
}

// ─── Filter Panel ─────────────────────────────────────────────────────────────

function FilterPanel({
  photo,
  onApplyFilter,
  onIntensityChange,
}: {
  photo: Photo
  onApplyFilter: (filterId: string) => void
  onIntensityChange: (value: number) => void
}) {
  const categories = [
    { id: 'all', label: 'ALL', icon: LayoutGrid },
    { id: 'korean', label: 'K-BOOTH', icon: Camera },
    { id: 'glam', label: 'GLAM', icon: Crown },
    { id: 'film', label: 'FILM', icon: Film },
    { id: 'vintage', label: 'RETRO', icon: Clock },
    { id: 'blackwhite', label: 'B&W', icon: Contrast },
    { id: 'cinematic', label: 'CINEMA', icon: Clapperboard },
    { id: 'natural', label: 'NATURAL', icon: Sun },
    { id: 'fun', label: 'CREATIVE', icon: Wand2 },
  ]

  const [selectedCat, setSelectedCat] = useState('all')

  const visiblePresets = useMemo(() => {
    // Rule: Tile #1 is ALWAYS "Original" (Raw capture)
    const originalPreset: FilterPreset = FILTER_PRESETS.find(f => f.id === 'original') || {
      id: 'original',
      name: 'Original',
      category: 'natural',
      description: 'Raw unadjusted camera capture',
      config: {},
    }

    const aliasIds = new Set(['bw', 'bnw', 'raw', 'none', 'original'])
    const filtered = FILTER_PRESETS.filter(f => {
      if (aliasIds.has(f.id)) return false
      return selectedCat === 'all' || f.category === selectedCat
    })

    return [originalPreset, ...filtered]
  }, [selectedCat])

  const getFilterSubtag = (filterId: string, category: string) => {
    if (filterId === 'original') return 'RAW / NO FILTER'
    switch (category) {
      case 'korean': return 'K-STUDIO'
      case 'glam': return 'GLAMOUR'
      case 'film': return '35MM FILM'
      case 'vintage': return 'RETRO'
      case 'blackwhite': return 'MONO'
      case 'cinematic': return 'CINEMA'
      case 'natural': return 'NATURAL'
      case 'fun': return 'CREATIVE'
      default: return 'STYLE'
    }
  }

  const currentPreset = FILTER_PRESETS.find(
    p => p.id === photo.edits.filter ||
    ((photo.edits.filter === 'bw' || photo.edits.filter === 'bnw') && p.id === 'bw_classic')
  )
  const isOriginal = !photo.edits.filter || photo.edits.filter === 'original' || photo.edits.filter === 'raw' || photo.edits.filter === 'none'

  return (
    <div className="flex flex-col gap-3">
      {/* Category Pad - Big Chunky 3x3 Grid Buttons (No Scrolling, 100% iPad Responsive) */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(3, 1fr)',
          gap: 8,
          width: '100%',
        }}
      >
        {categories.map(cat => {
          const IconComp = cat.icon
          const isCatSelected = selectedCat === cat.id
          return (
            <button
              key={cat.id}
              type="button"
              onClick={() => setSelectedCat(cat.id)}
              style={{
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                justifyContent: 'center',
                gap: 6,
                padding: '12px 6px',
                borderRadius: 14,
                border: isCatSelected ? '2.5px solid #3A0212' : '2px solid rgba(47, 1, 14, 0.16)',
                background: isCatSelected
                  ? 'linear-gradient(135deg, #6D0626, #C71B4D)'
                  : '#FFFFFF',
                color: isCatSelected ? '#FFFFFF' : '#2F010E',
                cursor: 'pointer',
                boxShadow: isCatSelected
                  ? '0 4px 0 #2A010D, 0 6px 14px rgba(109, 6, 38, 0.35)'
                  : '0 3px 0 rgba(47, 1, 14, 0.12), 0 2px 4px rgba(0, 0, 0, 0.04)',
                transform: isCatSelected ? 'translateY(1px)' : 'none',
                transition: 'all 0.14s cubic-bezier(0.16, 1, 0.3, 1)',
                userSelect: 'none',
              }}
            >
              <IconComp size={20} strokeWidth={isCatSelected ? 2.6 : 2} color={isCatSelected ? '#FFFFFF' : '#6D0626'} />
              <span
                style={{
                  fontSize: 11,
                  fontFamily: "'Outfit', sans-serif",
                  fontWeight: 900,
                  letterSpacing: '0.04em',
                  textTransform: 'uppercase',
                  lineHeight: 1,
                }}
              >
                {cat.label}
              </span>
            </button>
          )
        })}
      </div>

      {/* Active style bar with tactile Reset button */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '10px 14px',
          background: '#FFFFFF',
          borderRadius: 14,
          border: '2px solid rgba(47, 1, 14, 0.14)',
          boxShadow: '0 3px 0 rgba(47, 1, 14, 0.08)',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, minWidth: 0 }}>
          <span
            style={{
              width: 10,
              height: 10,
              borderRadius: '50%',
              background: isOriginal ? '#9E9B95' : '#C71B4D',
              boxShadow: isOriginal ? 'none' : '0 0 8px rgba(199,27,77,0.7)',
              flexShrink: 0,
            }}
          />
          <span
            style={{
              fontSize: 11.5,
              fontFamily: "'Outfit', sans-serif",
              fontWeight: 900,
              color: '#2F010E',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              whiteSpace: 'nowrap',
              letterSpacing: '0.03em',
            }}
          >
            {isOriginal ? 'ACTIVE: ORIGINAL (RAW)' : `ACTIVE: ${currentPreset?.name.toUpperCase() || photo.edits.filter.toUpperCase()}`}
          </span>
        </div>

        {!isOriginal && (
          <button
            type="button"
            onClick={() => onApplyFilter('original')}
            style={{
              padding: '6px 12px',
              fontSize: 10.5,
              fontFamily: "'Outfit', sans-serif",
              fontWeight: 900,
              letterSpacing: '0.04em',
              borderRadius: 9,
              border: '2px solid #6D0626',
              background: '#FFF0F4',
              color: '#6D0626',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: 5,
              boxShadow: '0 2px 0 #6D0626',
              transition: 'all 0.12s ease',
            }}
          >
            <RefreshCw size={11} strokeWidth={2.5} />
            RAW
          </button>
        )}
      </div>

      {/* Filter grid - Big Bulky 2-column tactile studio cards */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(2, 1fr)',
          gap: 12,
          marginTop: 2,
          maxHeight: '430px',
          overflowY: 'auto',
          padding: '4px',
        }}
      >
        {visiblePresets.map(filter => {
          const isFilterActive = filter.id === 'original'
            ? isOriginal
            : (photo.edits.filter === filter.id ||
               ((filter.id === 'bw_classic') && (photo.edits.filter === 'bw' || photo.edits.filter === 'bnw')))

          return (
            <div
              key={filter.id}
              onClick={() => onApplyFilter(filter.id)}
              title={filter.description || filter.name}
              style={{
                display: 'flex',
                flexDirection: 'column',
                gap: 8,
                padding: '8px 8px 12px 8px',
                borderRadius: 18,
                background: isFilterActive ? '#FFF5F8' : '#FFFFFF',
                border: isFilterActive ? '3px solid #C71B4D' : '2.5px solid rgba(47, 1, 14, 0.14)',
                boxShadow: isFilterActive
                  ? '0 6px 0 #8A0E31, 0 8px 20px rgba(199, 27, 77, 0.25)'
                  : '0 4px 0 rgba(47, 1, 14, 0.12), 0 3px 8px rgba(0, 0, 0, 0.04)',
                cursor: 'pointer',
                transform: isFilterActive ? 'translateY(1px)' : 'none',
                transition: 'all 0.16s cubic-bezier(0.16, 1, 0.3, 1)',
                position: 'relative',
              }}
            >
              <div
                style={{
                  position: 'relative',
                  width: '100%',
                  aspectRatio: '1',
                  borderRadius: 13,
                  overflow: 'hidden',
                  background: '#151515',
                  boxShadow: 'inset 0 0 0 1px rgba(0,0,0,0.2)',
                }}
              >
                <img
                  src={getPhotoUrl(photo.previewUrl || photo.thumbnailUrl)}
                  alt={filter.name}
                  style={{
                    width: '100%',
                    height: '100%',
                    objectFit: 'cover',
                    filter: filter.id === 'original'
                      ? 'none'
                      : filterEngine.getCSSFilter({
                          ...photo.edits,
                          filter: filter.id,
                        }),
                    transition: 'transform 0.2s ease',
                  }}
                />

                {filter.id === 'original' ? (
                  <span
                    style={{
                      position: 'absolute',
                      top: 6,
                      left: 6,
                      fontSize: 9,
                      fontWeight: 900,
                      fontFamily: "'Outfit', sans-serif",
                      letterSpacing: '0.04em',
                      background: 'rgba(47, 1, 14, 0.92)',
                      color: '#FFFFFF',
                      padding: '2px 7px',
                      borderRadius: 6,
                      boxShadow: '0 2px 6px rgba(0,0,0,0.35)',
                    }}
                  >
                    RAW
                  </span>
                ) : filter.badge ? (
                  <span
                    style={{
                      position: 'absolute',
                      top: 6,
                      left: 6,
                      fontSize: 8.5,
                      fontWeight: 900,
                      fontFamily: "'Outfit', sans-serif",
                      letterSpacing: '0.04em',
                      background: 'rgba(109, 6, 38, 0.94)',
                      color: '#FFFFFF',
                      padding: '2px 7px',
                      borderRadius: 6,
                      boxShadow: '0 2px 6px rgba(0,0,0,0.3)',
                    }}
                  >
                    {filter.badge}
                  </span>
                ) : null}

                {isFilterActive && (
                  <div
                    style={{
                      position: 'absolute',
                      top: 6,
                      right: 6,
                      width: 24,
                      height: 24,
                      borderRadius: '50%',
                      background: 'linear-gradient(135deg, #C71B4D, #6D0626)',
                      border: '2px solid #FFFFFF',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      boxShadow: '0 3px 8px rgba(109,6,38,0.45)',
                    }}
                  >
                    <Check size={14} color="#ffffff" strokeWidth={3} />
                  </div>
                )}
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2, padding: '0 4px' }}>
                <span
                  style={{
                    fontSize: 12,
                    fontWeight: 900,
                    fontFamily: "'Outfit', sans-serif",
                    color: isFilterActive ? '#C71B4D' : '#2F010E',
                    textAlign: 'center',
                    whiteSpace: 'nowrap',
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    width: '100%',
                    letterSpacing: '0.02em',
                  }}
                >
                  {filter.name}
                </span>
                <span
                  style={{
                    fontSize: 9,
                    fontFamily: 'var(--font-mono)',
                    letterSpacing: '0.06em',
                    color: isFilterActive ? '#C71B4D' : '#8A6D75',
                    fontWeight: 800,
                    textTransform: 'uppercase',
                  }}
                >
                  {getFilterSubtag(filter.id, filter.category)}
                </span>
              </div>
            </div>
          )
        })}
      </div>

      {/* Bulky Studio Intensity Deck with Big Buttons */}
      <div
        style={{
          marginTop: 6,
          background: '#FFFFFF',
          padding: '16px',
          borderRadius: 18,
          border: '2.5px solid rgba(47, 1, 14, 0.14)',
          boxShadow: '0 5px 0 rgba(47, 1, 14, 0.1), 0 8px 18px rgba(109, 6, 38, 0.06)',
          display: 'flex',
          flexDirection: 'column',
          gap: 12,
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <Sparkles size={16} color="#C71B4D" />
            <span
              style={{
                fontSize: 12,
                fontFamily: "'Outfit', sans-serif",
                fontWeight: 900,
                letterSpacing: '0.06em',
                color: '#2F010E',
                textTransform: 'uppercase',
              }}
            >
              Filter Intensity
            </span>
          </div>
          <span
            style={{
              fontSize: 12,
              fontFamily: 'var(--font-mono)',
              fontWeight: 900,
              color: '#FFFFFF',
              background: 'linear-gradient(135deg, #6D0626, #C71B4D)',
              padding: '4px 12px',
              borderRadius: 10,
              boxShadow: '0 2px 6px rgba(109,6,38,0.25)',
            }}
          >
            {photo.edits.filterIntensity}%
          </span>
        </div>

        {/* Chunky styled range slider */}
        <div style={{ position: 'relative', width: '100%', display: 'flex', alignItems: 'center' }}>
          <input
            type="range"
            min={0}
            max={100}
            value={photo.edits.filterIntensity}
            onChange={(e) => onIntensityChange(Number(e.target.value))}
            style={{
              width: '100%',
              height: 12,
              accentColor: '#C71B4D',
              cursor: 'pointer',
              borderRadius: 999,
            }}
          />
        </div>

        {/* Big Chunky Step Buttons for Touch Kiosk / iPad */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 8, marginTop: 2 }}>
          {[25, 50, 75, 100].map(val => {
            const isActive = photo.edits.filterIntensity === val
            return (
              <button
                key={val}
                type="button"
                onClick={() => onIntensityChange(val)}
                style={{
                  padding: '10px 0',
                  borderRadius: 12,
                  border: isActive ? '2.5px solid #4A0217' : '2px solid rgba(47, 1, 14, 0.14)',
                  background: isActive ? 'linear-gradient(135deg, #6D0626, #C71B4D)' : '#FAF7F2',
                  color: isActive ? '#FFFFFF' : '#3B121D',
                  fontFamily: "'Outfit', sans-serif",
                  fontSize: 12,
                  fontWeight: 900,
                  cursor: 'pointer',
                  boxShadow: isActive
                    ? '0 3px 0 #3A0212, 0 4px 8px rgba(109,6,38,0.25)'
                    : '0 3px 0 rgba(47, 1, 14, 0.1)',
                  transform: isActive ? 'translateY(1px)' : 'none',
                  transition: 'all 0.14s ease',
                }}
              >
                {val}%
              </button>
            )
          })}
        </div>
      </div>
    </div>
  )
}

// ─── Adjust Panel ─────────────────────────────────────────────────────────────

function AdjustPanel({
  photo,
  stripSlots = [],
  onSelectSlot,
  onEdit,
}: {
  photo: Photo
  stripSlots?: { assignment: PhotoAssignment; photo: Photo }[]
  onSelectSlot?: (slotId: string) => void
  onEdit: (field: keyof PhotoEdits, value: any) => void
}) {
  const currentScale = photo.edits.scale ?? 1
  const currentPanX = photo.edits.panX ?? 0
  const currentPanY = photo.edits.panY ?? 0

  const adjustments: { key: keyof PhotoEdits; label: string; min: number; max: number; icon: React.ReactNode }[] = [
    { key: 'brightness', label: 'Brightness', min: -100, max: 100, icon: <Sun size={11} /> },
    { key: 'contrast', label: 'Contrast', min: -100, max: 100, icon: <Contrast size={11} /> },
    { key: 'saturation', label: 'Saturation', min: -100, max: 100, icon: <Droplets size={11} /> },
    { key: 'exposure', label: 'Exposure', min: -100, max: 100, icon: <Sun size={11} /> },
    { key: 'temperature', label: 'Temperature', min: -100, max: 100, icon: <Thermometer size={11} /> },
    { key: 'tint', label: 'Tint', min: -100, max: 100, icon: <Palette size={11} /> },
    { key: 'highlights', label: 'Highlights', min: -100, max: 100, icon: <Sun size={11} /> },
    { key: 'shadows', label: 'Shadows', min: -100, max: 100, icon: <Contrast size={11} /> },
    { key: 'sharpness', label: 'Sharpness', min: 0, max: 100, icon: <ZoomIn size={11} /> },
    { key: 'grain', label: 'Grain', min: 0, max: 100, icon: <Layers size={11} /> },
    { key: 'vignette', label: 'Vignette', min: 0, max: 100, icon: <Layers size={11} /> },
  ]

  return (
    <div className="flex flex-col gap-3">
      {/* ─── Frame Selector: Pick which frame of this strip to tune ─── */}
      {stripSlots && stripSlots.length > 1 && onSelectSlot && (
        <div
          style={{
            background: 'var(--color-bg, #F7F1EA)',
            border: '1.5px solid var(--color-border-strong)',
            borderRadius: 12,
            padding: '10px 12px',
            boxShadow: 'var(--shadow-sm)',
          }}
        >
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
            <span style={{ fontSize: 10, fontFamily: 'var(--font-mono)', fontWeight: 800, color: 'var(--color-brand)', letterSpacing: '0.05em' }}>
              FRAME TO TUNE:
            </span>
            <span
              style={{
                fontSize: 9.5,
                fontFamily: 'var(--font-mono)',
                fontWeight: 800,
                padding: '2px 6px',
                borderRadius: 4,
                background: 'rgba(109, 6, 38, 0.10)',
                color: 'var(--color-brand)',
                border: '1px solid rgba(109, 6, 38, 0.25)',
              }}
            >
              Frame {(stripSlots.findIndex(s => s.photo.id === photo.id) + 1) || 1} of {stripSlots.length}
            </span>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: `repeat(${Math.min(stripSlots.length, 5)}, 1fr)`, gap: 6 }}>
            {stripSlots.map((item, idx) => {
              const isSelected = item.photo.id === photo.id
              return (
                <button
                  key={item.assignment.slotId}
                  type="button"
                  onClick={() => onSelectSlot(item.assignment.slotId)}
                  style={{
                    display: 'flex',
                    flexDirection: 'column',
                    alignItems: 'center',
                    padding: 3,
                    borderRadius: 8,
                    background: isSelected ? 'linear-gradient(135deg, rgba(109, 6, 38, 0.18) 0%, rgba(69, 2, 22, 0.12) 100%)' : 'rgba(0, 0, 0, 0.04)',
                    border: isSelected ? '2px solid var(--color-brand)' : '1px solid var(--color-border-subtle)',
                    cursor: 'pointer',
                    transition: 'all 0.15s ease',
                    boxShadow: isSelected ? '0 2px 8px rgba(109, 6, 38, 0.25)' : 'none',
                  }}
                >
                  <div style={{ width: '100%', height: 38, borderRadius: 5, overflow: 'hidden', marginBottom: 4, background: '#111' }}>
                    <img
                      src={getPhotoUrl(item.photo.previewPath || item.photo.thumbnailPath)}
                      alt={`Frame ${idx + 1}`}
                      style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                    />
                  </div>
                  <span
                    style={{
                      fontSize: 9.5,
                      fontFamily: 'var(--font-mono)',
                      fontWeight: isSelected ? 800 : 600,
                      color: isSelected ? 'var(--color-brand)' : 'var(--color-text-secondary)',
                    }}
                  >
                    Frame {idx + 1}
                  </span>
                </button>
              )
            })}
          </div>
        </div>
      )}
      {/* ─── Hero Card: PHOTO ZOOM & FRAMING ─── */}
      <div
        style={{
          background: 'var(--color-bg, #F7F1EA)',
          border: '1.5px solid var(--color-border-strong)',
          borderRadius: 12,
          padding: '12px 14px',
          boxShadow: 'var(--shadow-sm)',
        }}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <ZoomIn size={15} color="var(--color-brand)" />
            <span style={{ fontSize: 11, fontFamily: 'var(--font-mono)', fontWeight: 800, color: 'var(--color-brand)', letterSpacing: '0.06em' }}>
              PHOTO ZOOM & FRAMING
            </span>
          </div>
          <span
            style={{
              fontSize: 10,
              fontFamily: 'var(--font-mono)',
              fontWeight: 800,
              padding: '2px 7px',
              borderRadius: 4,
              background: 'rgba(109, 6, 38, 0.10)',
              color: 'var(--color-brand)',
              border: '1px solid rgba(109, 6, 38, 0.25)',
            }}
          >
            {Math.round(currentScale * 100)}%
          </span>
        </div>

        {/* Zoom Slider + Step Buttons */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
          <button
            type="button"
            className="btn btn-secondary btn-sm"
            onClick={() => onEdit('scale', Math.max(1, Math.round((currentScale - 0.1) * 10) / 10))}
            title="Zoom Out"
            style={{ width: 32, height: 32, padding: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' }}
          >
            <ZoomOut size={14} />
          </button>
          <input
            type="range"
            min={1}
            max={3}
            step={0.05}
            value={currentScale}
            onChange={(e) => onEdit('scale', parseFloat(e.target.value))}
            style={{ flex: 1, accentColor: 'var(--color-brand)' }}
          />
          <button
            type="button"
            className="btn btn-secondary btn-sm"
            onClick={() => onEdit('scale', Math.min(3, Math.round((currentScale + 0.1) * 10) / 10))}
            title="Zoom In"
            style={{ width: 32, height: 32, padding: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' }}
          >
            <ZoomIn size={14} />
          </button>
        </div>

        {/* Quick Zoom Presets */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 5, marginBottom: 12 }}>
          {[
            { label: 'Fit 1.0x', val: 1.0 },
            { label: '1.25x', val: 1.25 },
            { label: '1.5x', val: 1.5 },
            { label: '2.0x', val: 2.0 },
          ].map(p => {
            const isCurrent = Math.abs(currentScale - p.val) < 0.05
            return (
              <button
                key={p.val}
                type="button"
                onClick={() => onEdit('scale', p.val)}
                style={{
                  padding: '5px 2px',
                  fontSize: 10,
                  fontFamily: 'var(--font-mono)',
                  fontWeight: isCurrent ? 800 : 500,
                  borderRadius: 6,
                  background: isCurrent ? 'linear-gradient(135deg, #6D0626 0%, #450216 100%)' : 'rgba(255, 255, 255, 0.05)',
                  color: isCurrent ? 'var(--color-offwhite)' : 'var(--color-text-secondary)',
                  border: isCurrent ? '1.5px solid var(--color-brand-mid)' : '1px solid rgba(255, 255, 255, 0.1)',
                  cursor: 'pointer',
                  boxShadow: isCurrent ? '0 2px 8px rgba(109, 6, 38, 0.4)' : 'none',
                }}
              >
                {p.label}
              </button>
            )
          })}
        </div>

        {/* Pan Directional Controls (Move within slot) */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
          <span style={{ fontSize: 9.5, fontFamily: 'var(--font-mono)', color: 'var(--color-text-tertiary)', textTransform: 'uppercase' }}>
            Reposition In Frame
          </span>
          <button
            type="button"
            className="btn btn-ghost btn-sm"
            onClick={() => {
              onEdit('panX', 0)
              onEdit('panY', 0)
            }}
            style={{ fontSize: 9, fontFamily: 'var(--font-mono)', padding: '2px 6px' }}
          >
            Recenter
          </button>
        </div>

        <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', gap: 6, marginBottom: 12 }}>
          <button
            type="button"
            className="btn btn-secondary btn-sm"
            onClick={() => onEdit('panX', currentPanX - 15)}
            title="Pan Left"
            style={{ padding: '5px 12px', fontSize: 11 }}
          >
            ◀
          </button>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            <button
              type="button"
              className="btn btn-secondary btn-sm"
              onClick={() => onEdit('panY', currentPanY - 15)}
              title="Pan Up"
              style={{ padding: '3px 12px', fontSize: 11 }}
            >
              ▲
            </button>
            <button
              type="button"
              className="btn btn-secondary btn-sm"
              onClick={() => onEdit('panY', currentPanY + 15)}
              title="Pan Down"
              style={{ padding: '3px 12px', fontSize: 11 }}
            >
              ▼
            </button>
          </div>
          <button
            type="button"
            className="btn btn-secondary btn-sm"
            onClick={() => onEdit('panX', currentPanX + 15)}
            title="Pan Right"
            style={{ padding: '5px 12px', fontSize: 11 }}
          >
            ▶
          </button>
        </div>

        {/* Rotation & Flip Controls */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, paddingTop: 8, borderTop: '1px solid rgba(255,255,255,0.08)' }}>
          <button
            type="button"
            className="btn btn-secondary btn-sm"
            onClick={() => onEdit('rotation', ((photo.edits.rotation + 90) % 360))}
            title="Rotate 90°"
            style={{ padding: '4px 8px', fontSize: 11, display: 'flex', alignItems: 'center', gap: 4 }}
          >
            <RotateCw size={12} /> <span style={{ fontFamily: 'var(--font-mono)' }}>90°</span>
          </button>
          <button
            type="button"
            className="btn btn-secondary btn-sm"
            onClick={() => onEdit('flipH', !photo.edits.flipH)}
            title="Flip Horizontal"
            style={{ padding: '4px 8px', fontSize: 11 }}
          >
            <FlipHorizontal size={12} />
          </button>
          <button
            type="button"
            className="btn btn-secondary btn-sm"
            onClick={() => onEdit('flipV', !photo.edits.flipV)}
            title="Flip Vertical"
            style={{ padding: '4px 8px', fontSize: 11 }}
          >
            <FlipVertical size={12} />
          </button>
          <button
            type="button"
            className="btn btn-ghost btn-sm"
            onClick={() => {
              onEdit('scale', 1)
              onEdit('panX', 0)
              onEdit('panY', 0)
              onEdit('rotation', 0)
              onEdit('flipH', false)
              onEdit('flipV', false)
            }}
            style={{ marginLeft: 'auto', fontSize: 9.5, fontFamily: 'var(--font-mono)' }}
          >
            RESET ALL
          </button>
        </div>
      </div>

      <div style={{ height: 1, background: 'var(--color-border-subtle)', margin: '4px 0' }} />

      {/* Sliders */}
      <div className="flex flex-col gap-2">
        {adjustments.map(({ key, label, min, max, icon }) => (
          <div key={key} style={{ background: 'var(--color-bg-base)', padding: '6px 8px', borderRadius: 'var(--radius-sm)', border: '1px solid var(--color-border-subtle)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 3 }}>
              <span style={{ fontSize: 10, color: 'var(--color-text-secondary)', display: 'flex', alignItems: 'center', gap: 4 }}>
                {icon} {label}
              </span>
              <span style={{ fontSize: 10, fontFamily: 'var(--font-mono)', color: 'var(--color-text-primary)' }}>
                {(photo.edits[key] as number) ?? 0}
              </span>
            </div>
            <input
              type="range"
              min={min}
              max={max}
              value={(photo.edits[key] as number) ?? 0}
              onChange={(e) => onEdit(key, Number(e.target.value))}
              style={{ width: '100%', accentColor: 'var(--color-primary)' }}
            />
          </div>
        ))}
      </div>

      <button
        type="button"
        className="btn btn-ghost btn-sm"
        onClick={() => {
          const keys: (keyof PhotoEdits)[] = ['brightness','contrast','saturation','exposure','temperature','tint','highlights','shadows','sharpness','blur','grain','vignette','fade']
          keys.forEach(k => onEdit(k, 0))
        }}
        style={{ fontSize: 10, fontFamily: 'var(--font-mono)', marginTop: 4 }}
      >
        RESET ALL ADJUSTMENTS
      </button>
    </div>
  )
}

// ─── Text Panel ───────────────────────────────────────────────────────────────

function TextPanel({
  strip,
  canvasElements,
  selectedElementId,
  onSelectElement,
  onAddElement,
  onUpdateElement,
  onRemoveElement,
  onDuplicateElement,
  onResetTemplateText,
  strips,
  activeStripIndex = 0,
  filterScope = 'photos_in_strip',
  onSelectStripIndex,
  onSelectFilterScope,
  onReassignStrip,
  onCopyToOtherStrip,
}: {
  strip: Strip
  canvasElements: CanvasElement[]
  selectedElementId: string | null
  onSelectElement: (id: string | null) => void
  onAddElement: (type: 'heading' | 'subtitle' | 'date' | 'script' | 'badge') => void
  onUpdateElement: (id: string, updates: Partial<CanvasElement>) => void
  onRemoveElement: (id: string) => void
  onDuplicateElement: (id: string) => void
  onResetTemplateText: () => void
  strips?: Strip[]
  activeStripIndex?: number
  filterScope?: FilterApplyScope
  onSelectStripIndex?: (idx: number) => void
  onSelectFilterScope?: (scope: FilterApplyScope) => void
  onReassignStrip?: (elementId: string, stripId: string | undefined) => void
  onCopyToOtherStrip?: (elementId: string) => void
}) {
  const selectedElement = canvasElements.find(el => el.id === selectedElementId && el.type === 'text')
  const tp = selectedElement?.textProps

  const fontOptions = [
    { label: 'Outfit (Modern)', value: 'Outfit' },
    { label: 'Playfair (Vintage Serif)', value: 'Playfair Display' },
    { label: 'DM Mono (Ticket)', value: 'DM Mono' },
    { label: 'Caveat (Handwritten)', value: 'Caveat' },
    { label: 'Inter (Clean)', value: 'Inter' },
  ]

  const colorPresets = [
    '#ffffff', '#111110', '#8A1C24', '#FAF5EC',
    '#E11D48', '#BE123C', '#2563EB', '#10B981',
    '#D97706', '#7C3AED', '#5C544E', '#F43F5E',
  ]

  const updateTextProp = <K extends keyof import('@/types').TextElementProps>(
    key: K,
    value: import('@/types').TextElementProps[K]
  ) => {
    if (!selectedElement || !tp) return
    onUpdateElement(selectedElement.id, {
      textProps: {
        ...tp,
        [key]: value,
      },
    })
  }

  const nudge = (dx: number, dy: number) => {
    if (!selectedElement) return
    onUpdateElement(selectedElement.id, {
      x: Math.max(0, Math.min(1200, selectedElement.x + dx)),
      y: Math.max(0, Math.min(4000, selectedElement.y + dy)),
    })
  }

  const centerHorizontally = () => {
    if (!selectedElement) return
    onUpdateElement(selectedElement.id, {
      x: Math.round((1200 - selectedElement.width) / 2),
    })
  }

  return (
    <div className="flex flex-col gap-3">
      {/* Dynamic Header */}
      {selectedElement && tp ? (
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', paddingBottom: 6, borderBottom: '1px solid var(--color-border-subtle)' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <span style={{ fontSize: 10, fontFamily: 'var(--font-mono)', fontWeight: 700, color: 'var(--color-primary)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>
              EDITING TEXT
            </span>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
            <button
              className="btn btn-ghost btn-icon btn-sm"
              onClick={() => onDuplicateElement(selectedElement.id)}
              title="Duplicate text"
              style={{ width: 24, height: 24 }}
            >
              <Copy size={12} />
            </button>
            <button
              className="btn btn-ghost btn-icon btn-sm"
              onClick={() => onRemoveElement(selectedElement.id)}
              title="Delete text"
              style={{ width: 24, height: 24, color: '#ef4444' }}
            >
              <Trash2 size={12} />
            </button>
            <button
              className="btn btn-ghost btn-icon btn-sm"
              onClick={() => onSelectElement(null)}
              title="Deselect"
              style={{ width: 24, height: 24 }}
            >
              ×
            </button>
          </div>
        </div>
      ) : (
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', paddingBottom: 6, borderBottom: '1px solid var(--color-border-subtle)' }}>
          <span style={{ fontSize: 10, fontFamily: 'var(--font-mono)', color: 'var(--color-text-tertiary)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>
            TEXT & TYPOGRAPHY
          </span>
          <span style={{ fontSize: 10, fontFamily: 'var(--font-mono)', color: 'var(--color-text-secondary)' }}>
            {canvasElements.length} element{canvasElements.length === 1 ? '' : 's'}
          </span>
        </div>
      )}

      {/* Selected Element Controls */}
      {selectedElement && tp ? (
        <div className="flex flex-col gap-3">



          {/* Text Content Input */}
          <div style={{ background: 'var(--color-bg-base)', padding: '8px 10px', borderRadius: 'var(--radius-sm)', border: '1px solid var(--color-border-subtle)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
              <span style={{ fontSize: 10, fontFamily: 'var(--font-mono)', color: 'var(--color-text-tertiary)', textTransform: 'uppercase' }}>
                Text Content
              </span>
              <span style={{ fontSize: 10, fontFamily: 'var(--font-mono)', color: (tp.text?.length || 0) >= 55 ? 'var(--color-brand)' : 'var(--color-text-tertiary)' }}>
                {tp.text?.length || 0} / 60
              </span>
            </div>
            <textarea
              rows={2}
              maxLength={60}
              value={tp.text}
              onChange={(e) => updateTextProp('text', e.target.value.slice(0, 60))}
              placeholder="Enter text (max 60 chars)..."
              style={{
                width: '100%',
                background: 'var(--color-bg-surface)',
                border: '1px solid var(--color-border-default)',
                borderRadius: 'var(--radius-sm)',
                padding: '6px 8px',
                fontSize: 12,
                color: 'var(--color-text-primary)',
                fontFamily: tp.fontFamily,
                resize: 'none',
              }}
            />
          </div>

          {/* Font Family Pills */}
          <div style={{ background: 'var(--color-bg-base)', padding: '8px 10px', borderRadius: 'var(--radius-sm)', border: '1px solid var(--color-border-subtle)' }}>
            <div style={{ fontSize: 10, fontFamily: 'var(--font-mono)', color: 'var(--color-text-tertiary)', textTransform: 'uppercase', marginBottom: 6 }}>
              Font Family
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
              {fontOptions.map(font => {
                const isSelected = tp.fontFamily === font.value
                return (
                  <button
                    key={font.value}
                    type="button"
                    onClick={() => updateTextProp('fontFamily', font.value)}
                    style={{
                      padding: '5px 8px',
                      fontSize: 11,
                      fontFamily: font.value,
                      textAlign: 'left',
                      borderRadius: 'var(--radius-sm)',
                      border: isSelected ? '1px solid var(--color-primary)' : '1px solid var(--color-border-subtle)',
                      background: isSelected ? 'rgba(109, 6, 38, 0.12)' : 'transparent',
                      color: isSelected ? 'var(--color-text-primary)' : 'var(--color-text-secondary)',
                      cursor: 'pointer',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                    }}
                  >
                    <span>{font.label}</span>
                    {isSelected && <Check size={11} color="var(--color-primary)" />}
                  </button>
                )
              })}
            </div>
          </div>

          {/* Font Size & Weight / Style */}
          <div style={{ background: 'var(--color-bg-base)', padding: '8px 10px', borderRadius: 'var(--radius-sm)', border: '1px solid var(--color-border-subtle)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
              <span style={{ fontSize: 10, fontFamily: 'var(--font-mono)', color: 'var(--color-text-tertiary)', textTransform: 'uppercase' }}>
                Size & Style
              </span>
              <span style={{ fontSize: 10, fontFamily: 'var(--font-mono)', color: 'var(--color-text-primary)' }}>
                {tp.fontSize}px
              </span>
            </div>

            <input
              type="range"
              min={14}
              max={120}
              value={tp.fontSize}
              onChange={(e) => updateTextProp('fontSize', Number(e.target.value))}
              style={{ width: '100%', accentColor: 'var(--color-primary)', marginBottom: 8 }}
            />

            {/* Formatting & Alignment Toolbar */}
            <div style={{ display: 'flex', gap: 4, alignItems: 'center' }}>
              <button
                type="button"
                className="btn btn-sm"
                onClick={() => updateTextProp('fontWeight', tp.fontWeight === '700' ? '400' : '700')}
                style={{
                  padding: '3px 8px',
                  fontSize: 11,
                  fontWeight: 'bold',
                  background: tp.fontWeight === '700' ? 'var(--color-primary)' : 'var(--color-bg-surface)',
                  color: tp.fontWeight === '700' ? '#ffffff' : 'var(--color-text-primary)',
                  border: '1px solid var(--color-border-subtle)',
                  borderRadius: 'var(--radius-sm)',
                  cursor: 'pointer',
                }}
                title="Toggle Bold"
              >
                <Bold size={11} />
              </button>

              <button
                type="button"
                className="btn btn-sm"
                onClick={() => updateTextProp('fontStyle', tp.fontStyle === 'italic' ? 'normal' : 'italic')}
                style={{
                  padding: '3px 8px',
                  fontSize: 11,
                  fontStyle: 'italic',
                  background: tp.fontStyle === 'italic' ? 'var(--color-primary)' : 'var(--color-bg-surface)',
                  color: tp.fontStyle === 'italic' ? '#ffffff' : 'var(--color-text-primary)',
                  border: '1px solid var(--color-border-subtle)',
                  borderRadius: 'var(--radius-sm)',
                  cursor: 'pointer',
                }}
                title="Toggle Italic"
              >
                <Italic size={11} />
              </button>

              <div style={{ width: 1, height: 16, background: 'var(--color-border-subtle)', margin: '0 2px' }} />

              <button
                type="button"
                className="btn btn-sm"
                onClick={() => updateTextProp('align', 'left')}
                style={{
                  padding: '3px 8px',
                  background: tp.align === 'left' ? 'var(--color-primary)' : 'var(--color-bg-surface)',
                  color: tp.align === 'left' ? '#ffffff' : 'var(--color-text-primary)',
                  border: '1px solid var(--color-border-subtle)',
                  borderRadius: 'var(--radius-sm)',
                  cursor: 'pointer',
                }}
                title="Align Left"
              >
                <AlignLeft size={11} />
              </button>

              <button
                type="button"
                className="btn btn-sm"
                onClick={() => updateTextProp('align', 'center')}
                style={{
                  padding: '3px 8px',
                  background: tp.align === 'center' ? 'var(--color-primary)' : 'var(--color-bg-surface)',
                  color: tp.align === 'center' ? '#ffffff' : 'var(--color-text-primary)',
                  border: '1px solid var(--color-border-subtle)',
                  borderRadius: 'var(--radius-sm)',
                  cursor: 'pointer',
                }}
                title="Align Center"
              >
                <AlignCenter size={11} />
              </button>

              <button
                type="button"
                className="btn btn-sm"
                onClick={() => updateTextProp('align', 'right')}
                style={{
                  padding: '3px 8px',
                  background: tp.align === 'right' ? 'var(--color-primary)' : 'var(--color-bg-surface)',
                  color: tp.align === 'right' ? '#ffffff' : 'var(--color-text-primary)',
                  border: '1px solid var(--color-border-subtle)',
                  borderRadius: 'var(--radius-sm)',
                  cursor: 'pointer',
                }}
                title="Align Right"
              >
                <AlignRight size={11} />
              </button>

              <button
                type="button"
                className="btn btn-ghost btn-sm"
                onClick={centerHorizontally}
                style={{ marginLeft: 'auto', fontSize: 10, fontFamily: 'var(--font-mono)', padding: '2px 6px' }}
                title="Center horizontally on canvas"
              >
                CENTER X
              </button>
            </div>
          </div>

          {/* Text Color Swatches */}
          <div style={{ background: 'var(--color-bg-base)', padding: '8px 10px', borderRadius: 'var(--radius-sm)', border: '1px solid var(--color-border-subtle)' }}>
            <div style={{ fontSize: 10, fontFamily: 'var(--font-mono)', color: 'var(--color-text-tertiary)', textTransform: 'uppercase', marginBottom: 6 }}>
              Color
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(6, 1fr)', gap: 6, marginBottom: 8 }}>
              {colorPresets.map(color => {
                const isSelected = tp.color.toLowerCase() === color.toLowerCase()
                return (
                  <button
                    key={color}
                    type="button"
                    onClick={() => updateTextProp('color', color)}
                    style={{
                      height: 22,
                      borderRadius: 3,
                      background: color,
                      border: isSelected ? '2px solid var(--color-primary)' : '1px solid rgba(255,255,255,0.2)',
                      cursor: 'pointer',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      boxShadow: isSelected ? '0 0 6px rgba(109, 6, 38, 0.6)' : 'none',
                    }}
                  >
                    {isSelected && (
                      <Check size={10} color={['#ffffff', '#faf5ec'].includes(color.toLowerCase()) ? '#000000' : '#ffffff'} strokeWidth={3} />
                    )}
                  </button>
                )
              })}
            </div>

            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <input
                type="color"
                value={tp.color.startsWith('#') && tp.color.length === 7 ? tp.color : '#ffffff'}
                onChange={(e) => updateTextProp('color', e.target.value)}
                style={{
                  width: 32,
                  height: 26,
                  padding: 0,
                  border: '1px solid var(--color-border-default)',
                  borderRadius: 'var(--radius-sm)',
                  cursor: 'pointer',
                  background: 'transparent',
                }}
              />
              <input
                type="text"
                value={tp.color}
                onChange={(e) => {
                  const val = e.target.value
                  if (val.startsWith('#') && (val.length === 4 || val.length === 7)) {
                    updateTextProp('color', val)
                  }
                }}
                style={{
                  flex: 1,
                  background: 'var(--color-bg-surface)',
                  border: '1px solid var(--color-border-default)',
                  borderRadius: 'var(--radius-sm)',
                  padding: '3px 8px',
                  fontSize: 10,
                  fontFamily: 'var(--font-mono)',
                  color: 'var(--color-text-primary)',
                }}
              />
            </div>
          </div>

          {/* Position Nudge Controls */}
          <div style={{ background: 'var(--color-bg-base)', padding: '8px 10px', borderRadius: 'var(--radius-sm)', border: '1px solid var(--color-border-subtle)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
              <span style={{ fontSize: 10, fontFamily: 'var(--font-mono)', color: 'var(--color-text-tertiary)', textTransform: 'uppercase' }}>
                Position Nudge
              </span>
              <span style={{ fontSize: 9, fontFamily: 'var(--font-mono)', color: 'var(--color-text-tertiary)' }}>
                X: {selectedElement.x} · Y: {selectedElement.y}
              </span>
            </div>
            <div style={{ display: 'flex', justifyContent: 'center', gap: 6 }}>
              <button className="btn btn-secondary btn-sm" onClick={() => nudge(-30, 0)} title="Nudge Left" style={{ padding: '3px 10px', fontSize: 11 }}>
                ◀
              </button>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
                <button className="btn btn-secondary btn-sm" onClick={() => nudge(0, -30)} title="Nudge Up" style={{ padding: '2px 10px', fontSize: 10 }}>
                  ▲
                </button>
                <button className="btn btn-secondary btn-sm" onClick={() => nudge(0, 30)} title="Nudge Down" style={{ padding: '2px 10px', fontSize: 10 }}>
                  ▼
                </button>
              </div>
              <button className="btn btn-secondary btn-sm" onClick={() => nudge(30, 0)} title="Nudge Right" style={{ padding: '3px 10px', fontSize: 11 }}>
                ▶
              </button>
            </div>
          </div>
        </div>
      ) : (
        /* Empty / No Element Selected View */
        <div className="flex flex-col gap-3">
          {/* Add Text Quick Presets */}
          <div>
            <div style={{ fontSize: 10, fontFamily: 'var(--font-mono)', color: 'var(--color-text-secondary)', textTransform: 'uppercase', marginBottom: 8, letterSpacing: '0.05em', fontWeight: 700 }}>
              Add New Typography
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 8 }}>
              {[
                { type: 'heading' as const, label: 'Bold Title', desc: 'VINTAGE PHOTOBOOTH', icon: Heading },
                { type: 'subtitle' as const, label: 'Chic Subtitle', desc: 'Sweetest Memories', icon: Type },
                { type: 'date' as const, label: 'Date Stamp', desc: 'Current Date Stamp', icon: Calendar },
                { type: 'script' as const, label: 'Love Script', desc: 'Always & Forever', icon: Heart },
                { type: 'badge' as const, label: 'Ticket Badge', desc: 'ADMIT ONE PASS', icon: Ticket },
              ].map(p => {
                const IconComponent = p.icon
                return (
                  <button
                    key={p.type}
                    type="button"
                    onClick={() => onAddElement(p.type)}
                    style={{
                      padding: '11px 12px',
                      borderRadius: 'var(--radius-md)',
                      border: '1.5px solid var(--color-border-subtle)',
                      background: 'var(--color-card)',
                      color: 'var(--color-text-primary)',
                      textAlign: 'left',
                      cursor: 'pointer',
                      display: 'flex',
                      flexDirection: 'column',
                      gap: 4,
                      transition: 'all 0.18s cubic-bezier(0.16, 1, 0.3, 1)',
                      boxShadow: 'var(--shadow-block-sm)',
                    }}
                    onMouseEnter={e => {
                      e.currentTarget.style.transform = 'translateY(-2px)'
                      e.currentTarget.style.borderColor = 'var(--color-brand)'
                      e.currentTarget.style.background = 'var(--color-brand-tint)'
                      e.currentTarget.style.boxShadow = 'var(--shadow-bubble-sm)'
                    }}
                    onMouseLeave={e => {
                      e.currentTarget.style.transform = 'none'
                      e.currentTarget.style.borderColor = 'var(--color-border-subtle)'
                      e.currentTarget.style.background = 'var(--color-card)'
                      e.currentTarget.style.boxShadow = 'var(--shadow-block-sm)'
                    }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                      <IconComponent size={14} color="var(--color-brand)" />
                      <span style={{ fontSize: 12, fontFamily: 'var(--font-display)', fontWeight: 700, color: 'var(--color-brand)' }}>
                        {p.label}
                      </span>
                    </div>
                    <span style={{ fontSize: 9.5, fontFamily: 'var(--font-mono)', color: 'var(--color-text-secondary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {p.desc}
                    </span>
                  </button>
                )
              })}
            </div>
          </div>

          {/* List of text elements on this strip */}
          {canvasElements.length > 0 && (
            <div style={{ marginTop: 6 }}>
              <div style={{ fontSize: 10, fontFamily: 'var(--font-mono)', color: 'var(--color-text-tertiary)', textTransform: 'uppercase', marginBottom: 6, letterSpacing: '0.05em' }}>
                Text Layers On Strip (Drag to move)
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                {canvasElements.map((el, i) => (
                  <div
                    key={el.id}
                    onClick={() => onSelectElement(el.id)}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      padding: '6px 10px',
                      borderRadius: 'var(--radius-sm)',
                      background: 'var(--color-bg-base)',
                      border: '1px solid var(--color-border-subtle)',
                      cursor: 'pointer',
                      transition: 'border-color 0.12s ease',
                    }}
                    onMouseEnter={e => (e.currentTarget.style.borderColor = 'var(--color-primary)')}
                    onMouseLeave={e => (e.currentTarget.style.borderColor = 'var(--color-border-subtle)')}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6, minWidth: 0, flex: 1 }}>
                      <Move size={10} color="var(--color-text-tertiary)" style={{ flexShrink: 0 }} />
                      <div style={{ minWidth: 0, flex: 1 }}>
                        <div style={{ fontSize: 11, fontWeight: 500, color: 'var(--color-text-primary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                          {el.textProps?.text || 'Text Element'}
                        </div>
                        <div style={{ fontSize: 9, fontFamily: 'var(--font-mono)', color: 'var(--color-text-tertiary)' }}>
                          {el.textProps?.fontFamily} · {el.textProps?.fontSize}px
                        </div>
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation()
                        onRemoveElement(el.id)
                      }}
                      style={{
                        background: 'transparent',
                        border: 'none',
                        color: 'var(--color-text-tertiary)',
                        cursor: 'pointer',
                        padding: 4,
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                      }}
                      title="Delete"
                    >
                      <Trash2 size={12} />
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Reset button */}
          <div style={{ marginTop: 8, paddingTop: 8, borderTop: '1px solid var(--color-border-subtle)' }}>
            <button
              className="btn btn-ghost btn-sm w-full"
              onClick={onResetTemplateText}
              style={{ fontSize: 10, fontFamily: 'var(--font-mono)', color: 'var(--color-text-secondary)', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 4 }}
            >
              RESET TO TEMPLATE TEXT
            </button>
          </div>
        </div>
      )}
    </div>
  )
}

// ─── Background Panel ─────────────────────────────────────────────────────────

function BackgroundPanel({
  template,
  onSelectColor,
}: {
  template: import('@/types').Template | null
  onSelectColor: (color: string) => void
}) {
  const bg = template?.background
  const currentColor = (bg?.color ?? '#ffffff').toLowerCase()

  const presets = [
    { label: 'Classic White', color: '#ffffff', textColor: '#111110' },
    { label: 'Pure Black', color: '#111110', textColor: '#ffffff' },
    { label: 'Warm Cream', color: '#f5f0e8', textColor: '#222222' },
    { label: 'Film Grey', color: '#2a2a27', textColor: '#ffffff' },
    { label: 'Cherry Wine', color: '#6D0626', textColor: '#F7F1EA' },
    { label: 'Midnight Navy', color: '#0f172a', textColor: '#ffffff' },
    { label: 'Retro Coral', color: '#e47a61', textColor: '#ffffff' },
    { label: 'Pastel Pink', color: '#fce7f3', textColor: '#831843' },
    { label: 'Soft Lavender', color: '#e0e7ff', textColor: '#3730a3' },
    { label: 'Mint Sage', color: '#dcfce7', textColor: '#14532d' },
    { label: 'Warm Amber', color: '#fef3c7', textColor: '#78350f' },
    { label: 'Terracotta', color: '#8b4513', textColor: '#ffffff' },
  ]

  return (
    <div className="flex flex-col gap-4">
      {/* Preset Swatches */}
      <div>
        <div style={{ fontSize: 10, fontFamily: 'var(--font-mono)', color: 'var(--color-text-tertiary)', textTransform: 'uppercase', marginBottom: 8, letterSpacing: '0.05em' }}>
          Strip Color Presets
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 6 }}>
          {presets.map(p => {
            const isSelected = currentColor === p.color.toLowerCase()
            return (
              <button
                key={p.color}
                type="button"
                onClick={() => onSelectColor(p.color)}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 8,
                  padding: '7px 9px',
                  borderRadius: 'var(--radius-sm)',
                  border: isSelected ? '2px solid var(--color-primary)' : '1px solid var(--color-border-subtle)',
                  background: isSelected ? 'rgba(109, 6, 38, 0.12)' : 'var(--color-bg-base)',
                  cursor: 'pointer',
                  textAlign: 'left',
                  transition: 'all 0.15s ease',
                  boxShadow: isSelected ? '0 0 10px rgba(109, 6, 38, 0.4)' : 'none',
                }}
              >
                <div
                  style={{
                    width: 18,
                    height: 18,
                    borderRadius: 3,
                    background: p.color,
                    border: '1px solid rgba(255,255,255,0.25)',
                    flexShrink: 0,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                  }}
                >
                  {isSelected && (
                    <Check size={11} color={p.textColor} strokeWidth={3} />
                  )}
                </div>
                <span
                  style={{
                    fontSize: 10,
                    fontFamily: 'var(--font-mono)',
                    color: isSelected ? 'var(--color-text-primary)' : 'var(--color-text-secondary)',
                    fontWeight: isSelected ? 700 : 400,
                    whiteSpace: 'nowrap',
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                  }}
                >
                  {p.label}
                </span>
              </button>
            )
          })}
        </div>
      </div>

      {/* Custom Color Picker */}
      <div
        style={{
          background: 'var(--color-bg-base)',
          padding: '10px 12px',
          borderRadius: 'var(--radius-sm)',
          border: '1px solid var(--color-border-subtle)',
        }}
      >
        <div style={{ fontSize: 10, fontFamily: 'var(--font-mono)', color: 'var(--color-text-tertiary)', textTransform: 'uppercase', marginBottom: 8, letterSpacing: '0.05em' }}>
          Custom Color Picker
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <input
            type="color"
            value={currentColor.startsWith('#') && currentColor.length === 7 ? currentColor : '#ffffff'}
            onChange={(e) => onSelectColor(e.target.value)}
            style={{
              width: 36,
              height: 32,
              padding: 0,
              border: '1px solid var(--color-border-default)',
              borderRadius: 'var(--radius-sm)',
              cursor: 'pointer',
              background: 'transparent',
            }}
          />
          <div style={{ display: 'flex', flexDirection: 'column', gap: 2, flex: 1 }}>
            <span style={{ fontSize: 9, color: 'var(--color-text-tertiary)', fontFamily: 'var(--font-mono)' }}>
              HEX CODE
            </span>
            <input
              type="text"
              value={currentColor}
              onChange={(e) => {
                const val = e.target.value
                if (val.startsWith('#') && (val.length === 4 || val.length === 7)) {
                  onSelectColor(val)
                }
              }}
              placeholder="#ffffff"
              style={{
                background: 'var(--color-bg-surface)',
                border: '1px solid var(--color-border-default)',
                borderRadius: 'var(--radius-sm)',
                padding: '4px 8px',
                fontSize: 11,
                fontFamily: 'var(--font-mono)',
                color: 'var(--color-text-primary)',
                width: '100%',
              }}
            />
          </div>
        </div>
      </div>
    </div>
  )
}

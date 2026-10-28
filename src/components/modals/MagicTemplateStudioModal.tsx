import React, { useState, useRef, useEffect, useCallback } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import {
  Upload, Wand2, Eye, Plus, Trash2, Check,
  Sliders, Layers, Sparkles, X, Image as ImageIcon,
  Move, RotateCcw, Palette
} from 'lucide-react'
import { useCustomTemplateStore } from '@/store/customTemplateStore'
import { useSessionStore } from '@/store/sessionStore'
import { useToast } from '@/components/ui/Toast'
import type { Template, SlotDefinition, TemplateCategory } from '@/types'

interface MagicTemplateStudioModalProps {
  isOpen: boolean
  onClose: () => void
  onTemplateCreated?: (template: Template) => void
}

export function MagicTemplateStudioModal({
  isOpen,
  onClose,
  onTemplateCreated,
}: MagicTemplateStudioModalProps) {
  const { addUserTemplate } = useCustomTemplateStore()
  const { setTemplate } = useSessionStore()
  const { toast } = useToast()

  // State
  const [templateName, setTemplateName] = useState('My Custom Template')
  const [category, setCategory] = useState<TemplateCategory>('custom')
  const [bgColor, setBgColor] = useState('#FAF5EC')
  const [imageSrc, setImageSrc] = useState<string | null>(null)
  const [imageMeta, setImageMeta] = useState<{ width: number; height: number } | null>(null)
  const [keyedOverlayUrl, setKeyedOverlayUrl] = useState<string | null>(null)
  const [slots, setSlots] = useState<SlotDefinition[]>([])
  const [selectedSlotIndex, setSelectedSlotIndex] = useState<number | null>(null)
  const [isProcessing, setIsProcessing] = useState(false)
  const [keyTolerance, setKeyTolerance] = useState(30)
  const [activeTool, setActiveTool] = useState<'slots' | 'keying' | 'settings'>('keying')

  const fileInputRef = useRef<HTMLInputElement>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const previewContainerRef = useRef<HTMLDivElement>(null)

  // Reset when opened
  useEffect(() => {
    if (isOpen && !imageSrc) {
      setTemplateName(`Custom Template ${new Date().toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}`)
    }
  }, [isOpen, imageSrc])

  // Handle image upload
  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return

    const reader = new FileReader()
    reader.onload = (event) => {
      const dataUrl = event.target?.result as string
      const img = new Image()
      img.onload = () => {
        setImageSrc(dataUrl)
        setImageMeta({ width: img.naturalWidth, height: img.naturalHeight })
        // Default 1 photo slot in center
        const defaultW = Math.round(img.naturalWidth * 0.7)
        const defaultH = Math.round(defaultW * 0.75)
        const defaultX = Math.round((img.naturalWidth - defaultW) / 2)
        const defaultY = Math.round((img.naturalHeight - defaultH) / 2)

        setSlots([
          {
            id: 'slot-0',
            x: defaultX,
            y: defaultY,
            width: defaultW,
            height: defaultH,
            shape: 'rectangle',
            cornerRadius: 0,
          },
        ])
        setSelectedSlotIndex(0)
        // Automatically run chroma-key test
        runChromaKey(dataUrl, img.naturalWidth, img.naturalHeight)
      }
      img.src = dataUrl
    }
    reader.readAsDataURL(file)
  }

  // Auto Chroma-Green Keying using HTML5 Canvas
  const runChromaKey = useCallback((src: string, w: number, h: number) => {
    setIsProcessing(true)
    const img = new Image()
    img.crossOrigin = 'anonymous'
    img.onload = () => {
      const canvas = document.createElement('canvas')
      canvas.width = w
      canvas.height = h
      const ctx = canvas.getContext('2d')
      if (!ctx) {
        setIsProcessing(false)
        return
      }

      ctx.drawImage(img, 0, 0)
      const imgData = ctx.getImageData(0, 0, w, h)
      const data = imgData.data

      let greenCount = 0
      const mask = new Uint8Array(w * h)

      for (let i = 0; i < data.length; i += 4) {
        const r = data[i]
        const g = data[i + 1]
        const b = data[i + 2]
        const pIdx = i / 4

        // Chroma Green check
        if (g > 70 && g > r * 1.25 && g > b * 1.25) {
          data[i + 3] = 0 // Transparent cutout
          mask[pIdx] = 1
          greenCount++
        }
      }

      // If significant green was detected, auto-calculate slot bounding boxes!
      if (greenCount > (w * h) * 0.05) {
        // Detect slots from green mask
        const rowCounts = new Int32Array(h)
        for (let y = 0; y < h; y++) {
          let cnt = 0
          for (let x = 0; x < w; x++) {
            if (mask[y * w + x]) cnt++
          }
          rowCounts[y] = cnt
        }

        const detectedSlots: SlotDefinition[] = []
        let inSlot = false
        let startY = 0

        for (let y = 0; y < h; y++) {
          const isRow = rowCounts[y] > w * 0.15
          if (isRow && !inSlot) {
            inSlot = true
            startY = y
          } else if (!isRow && inSlot) {
            inSlot = false
            const slotH = y - startY
            if (slotH > 15) {
              let minX = w, maxX = 0
              for (let sy = startY; sy < y; sy++) {
                for (let sx = 0; sx < w; sx++) {
                  if (mask[sy * w + sx]) {
                    if (sx < minX) minX = sx
                    if (sx > maxX) maxX = sx
                  }
                }
              }
              const slotW = maxX - minX + 1
              detectedSlots.push({
                id: `slot-${detectedSlots.length}`,
                x: minX,
                y: startY,
                width: slotW,
                height: slotH,
                shape: 'rectangle',
                cornerRadius: 0,
              })
            }
          }
        }

        if (detectedSlots.length > 0) {
          setSlots(detectedSlots)
          toast(`Magic auto-detected ${detectedSlots.length} photo slot(s)!`, 'success')
        }
      }

      ctx.putImageData(imgData, 0, 0)
      const keyedUrl = canvas.toDataURL('image/png')
      setKeyedOverlayUrl(keyedUrl)
      setIsProcessing(false)
    }
    img.src = src
  }, [toast])

  // Key out custom color clicked on preview canvas
  const handleKeyColorAtPoint = (clickX: number, clickY: number) => {
    if (!imageSrc || !imageMeta) return
    setIsProcessing(true)

    const img = new Image()
    img.onload = () => {
      const canvas = document.createElement('canvas')
      canvas.width = imageMeta.width
      canvas.height = imageMeta.height
      const ctx = canvas.getContext('2d')
      if (!ctx) return

      ctx.drawImage(img, 0, 0)
      const imgData = ctx.getImageData(0, 0, imageMeta.width, imageMeta.height)
      const data = imgData.data

      const targetIdx = (clickY * imageMeta.width + clickX) * 4
      const targetR = data[targetIdx]
      const targetG = data[targetIdx + 1]
      const targetB = data[targetIdx + 2]

      const tol = keyTolerance * 2.5

      for (let i = 0; i < data.length; i += 4) {
        const r = data[i]
        const g = data[i + 1]
        const b = data[i + 2]
        const dist = Math.sqrt((r - targetR) ** 2 + (g - targetG) ** 2 + (b - targetB) ** 2)
        if (dist <= tol) {
          data[i + 3] = 0 // Transparent
        }
      }

      ctx.putImageData(imgData, 0, 0)
      setKeyedOverlayUrl(canvas.toDataURL('image/png'))
      setIsProcessing(false)
      toast('Color keyed out into transparent cutouts!', 'success')
    }
    img.src = imageSrc
  }

  // Add new photo slot
  const handleAddSlot = () => {
    if (!imageMeta) return
    const w = Math.round(imageMeta.width * 0.7)
    const h = Math.round(w * 0.7)
    const x = Math.round((imageMeta.width - w) / 2)
    const y = Math.round((imageMeta.height - h) / 2)

    const newSlot: SlotDefinition = {
      id: `slot-${slots.length}`,
      x,
      y,
      width: w,
      height: h,
      shape: 'rectangle',
      cornerRadius: 0,
    }
    setSlots(prev => [...prev, newSlot])
    setSelectedSlotIndex(slots.length)
  }

  // Remove slot
  const handleRemoveSlot = (idx: number) => {
    setSlots(prev => prev.filter((_, i) => i !== idx))
    setSelectedSlotIndex(null)
  }

  // Update selected slot position
  const handleUpdateSlot = (idx: number, updates: Partial<SlotDefinition>) => {
    setSlots(prev => prev.map((s, i) => i === idx ? { ...s, ...updates } : s))
  }

  // Save custom template
  const handleSave = () => {
    if (!imageMeta || !keyedOverlayUrl) {
      toast('Please upload and key a template image first', 'error')
      return
    }

    if (slots.length === 0) {
      toast('Please add at least 1 photo slot', 'error')
      return
    }

    const templateId = `user-template-${Date.now()}`
    const createdTemplate: Template = {
      id: templateId,
      name: templateName.trim() || 'Custom Template',
      category,
      supportedPhotoCounts: [1, 2, 3, 4],
      supportedOrientations: ['vertical'],
      canvas: {
        width: imageMeta.width,
        height: imageMeta.height,
      },
      overlayImageUrl: keyedOverlayUrl,
      background: {
        type: 'solid',
        color: bgColor,
      },
      border: {
        type: 'none',
      },
      spacing: {
        outerMargin: 0,
        photoSpacing: 20,
        padding: 0,
      },
      photoSlots: slots,
      textElements: [],
      decorationElements: [],
      defaultFilter: 'vintage',
      metadata: {
        author: 'User Created',
        version: '1.0',
        tags: ['custom', 'magic-studio', `${slots.length}-photo`],
        description: `Custom ${slots.length}-shot photobooth template created in Magic Studio.`,
      },
    }

    addUserTemplate(createdTemplate)
    setTemplate(createdTemplate, true)
    onTemplateCreated?.(createdTemplate)
    toast(`Template "${createdTemplate.name}" created and applied!`, 'success')
    onClose()
  }

  if (!isOpen) return null

  const selectedSlot = selectedSlotIndex !== null ? slots[selectedSlotIndex] : null

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        background: 'rgba(0, 0, 0, 0.85)',
        backdropFilter: 'blur(8px)',
        zIndex: 100,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '24px',
      }}
      onClick={e => e.target === e.currentTarget && onClose()}
    >
      <motion.div
        initial={{ opacity: 0, scale: 0.96, y: 10 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.96, y: 10 }}
        style={{
          background: 'var(--color-bg-surface, #1e1e1e)',
          border: '1px solid var(--color-border-default, rgba(255,255,255,0.15))',
          borderRadius: '12px',
          width: '100%',
          maxWidth: '1050px',
          height: '88vh',
          display: 'flex',
          flexDirection: 'column',
          overflow: 'hidden',
          boxShadow: '0 24px 60px rgba(0,0,0,0.6)',
        }}
      >
        {/* Header */}
        <div
          style={{
            padding: '16px 20px',
            borderBottom: '1px solid var(--color-border-subtle, rgba(255,255,255,0.1))',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            background: 'var(--color-bg-base, #141414)',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <div
              style={{
                width: 32,
                height: 32,
                borderRadius: 8,
                background: 'linear-gradient(135deg, #008080, #D4AF37)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                color: '#ffffff',
              }}
            >
              <Wand2 size={18} />
            </div>
            <div>
              <div style={{ fontSize: 16, fontWeight: 700, color: '#ffffff', letterSpacing: '0.02em' }}>
                Magic Template Studio
              </div>
              <div style={{ fontSize: 11, color: 'var(--color-text-tertiary, #888)' }}>
                Turn flat images into multi-layered photobooth templates with transparent cutouts
              </div>
            </div>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <button
              className="btn btn-primary btn-sm"
              onClick={handleSave}
              disabled={!keyedOverlayUrl || slots.length === 0}
              style={{ display: 'flex', alignItems: 'center', gap: 6, fontWeight: 600 }}
            >
              <Check size={14} />
              <span>SAVE & APPLY TEMPLATE</span>
            </button>
            <button
              className="btn btn-ghost btn-icon btn-sm"
              onClick={onClose}
              style={{ color: '#aaa' }}
            >
              <X size={18} />
            </button>
          </div>
        </div>

        {/* Studio Body: Split View */}
        <div style={{ display: 'flex', flex: 1, overflow: 'hidden' }}>
          {/* Left Toolbar */}
          <div
            style={{
              width: 340,
              borderRight: '1px solid var(--color-border-subtle, rgba(255,255,255,0.1))',
              background: 'var(--color-bg-elevated, #181818)',
              display: 'flex',
              flexDirection: 'column',
              overflowY: 'auto',
              padding: '16px',
              gap: 16,
            }}
          >
            {/* Step 1: Upload */}
            <div>
              <label style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em', color: '#aaa', display: 'block', marginBottom: 8 }}>
                1. Upload Flat Template
              </label>

              <input
                ref={fileInputRef}
                type="file"
                accept="image/png, image/jpeg, image/webp"
                style={{ display: 'none' }}
                onChange={handleFileUpload}
              />

              <button
                className="btn btn-secondary w-full"
                onClick={() => fileInputRef.current?.click()}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: 8,
                  padding: '10px',
                  border: '1px dashed var(--color-border-default, #444)',
                }}
              >
                <Upload size={16} />
                <span>{imageSrc ? 'Replace Image' : 'Choose PNG / JPG Image'}</span>
              </button>

              {imageMeta && (
                <div style={{ marginTop: 6, fontSize: 10, fontFamily: 'var(--font-mono)', color: '#888' }}>
                  Dimensions: {imageMeta.width} × {imageMeta.height} px
                </div>
              )}
            </div>

            {/* Step 2: Keying Tools */}
            {imageSrc && (
              <div>
                <label style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em', color: '#aaa', display: 'block', marginBottom: 8 }}>
                  2. Aperture Keying
                </label>

                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  <button
                    className="btn btn-secondary btn-sm"
                    onClick={() => imageMeta && runChromaKey(imageSrc, imageMeta.width, imageMeta.height)}
                    disabled={isProcessing}
                    style={{ display: 'flex', alignItems: 'center', gap: 6, justifyContent: 'center' }}
                  >
                    <Sparkles size={14} color="#D4AF37" />
                    <span>Auto Key Green Screen</span>
                  </button>

                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 4 }}>
                    <span style={{ fontSize: 10, color: '#888' }}>Tolerance:</span>
                    <input
                      type="range"
                      min={10}
                      max={80}
                      value={keyTolerance}
                      onChange={e => setKeyTolerance(Number(e.target.value))}
                      style={{ flex: 1, accentColor: 'var(--color-primary)' }}
                    />
                    <span style={{ fontSize: 10, fontFamily: 'var(--font-mono)', color: '#aaa' }}>{keyTolerance}</span>
                  </div>
                </div>
              </div>
            )}

            {/* Step 3: Slots Manager */}
            {imageSrc && (
              <div>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
                  <label style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em', color: '#aaa' }}>
                    3. Photo Slots ({slots.length})
                  </label>
                  <button
                    className="btn btn-ghost btn-sm"
                    onClick={handleAddSlot}
                    style={{ fontSize: 10, padding: '2px 8px', display: 'flex', alignItems: 'center', gap: 4 }}
                  >
                    <Plus size={12} />
                    <span>Add Slot</span>
                  </button>
                </div>

                <div style={{ display: 'flex', flexDirection: 'column', gap: 6, maxHeight: 180, overflowY: 'auto' }}>
                  {slots.map((s, idx) => (
                    <div
                      key={s.id || idx}
                      onClick={() => setSelectedSlotIndex(idx)}
                      style={{
                        padding: '6px 10px',
                        borderRadius: 6,
                        background: selectedSlotIndex === idx ? 'rgba(0, 128, 128, 0.25)' : 'rgba(255, 255, 255, 0.04)',
                        border: selectedSlotIndex === idx ? '1px solid var(--color-primary, #008080)' : '1px solid transparent',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        cursor: 'pointer',
                      }}
                    >
                      <span style={{ fontSize: 11, fontFamily: 'var(--font-mono)', color: '#eee' }}>
                        Slot {idx + 1} ({s.width}×{s.height})
                      </span>
                      <button
                        className="btn btn-ghost btn-icon btn-sm"
                        onClick={(e) => {
                          e.stopPropagation()
                          handleRemoveSlot(idx)
                        }}
                        style={{ width: 22, height: 22, color: '#ff6b6b' }}
                      >
                        <Trash2 size={12} />
                      </button>
                    </div>
                  ))}
                </div>

                {/* Selected Slot Position Adjuster */}
                {selectedSlot && selectedSlotIndex !== null && imageMeta && (
                  <div style={{ marginTop: 10, padding: 10, background: 'rgba(0,0,0,0.3)', borderRadius: 6, display: 'flex', flexDirection: 'column', gap: 6 }}>
                    <div style={{ fontSize: 10, fontWeight: 700, color: '#aaa', textTransform: 'uppercase' }}>
                      Position Slot {selectedSlotIndex + 1}
                    </div>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6 }}>
                      <div>
                        <span style={{ fontSize: 9, color: '#888' }}>X (px):</span>
                        <input
                          type="number"
                          value={selectedSlot.x}
                          onChange={e => handleUpdateSlot(selectedSlotIndex, { x: Number(e.target.value) })}
                          style={{ width: '100%', background: '#111', border: '1px solid #333', color: '#fff', fontSize: 10, padding: '3px 6px', borderRadius: 4 }}
                        />
                      </div>
                      <div>
                        <span style={{ fontSize: 9, color: '#888' }}>Y (px):</span>
                        <input
                          type="number"
                          value={selectedSlot.y}
                          onChange={e => handleUpdateSlot(selectedSlotIndex, { y: Number(e.target.value) })}
                          style={{ width: '100%', background: '#111', border: '1px solid #333', color: '#fff', fontSize: 10, padding: '3px 6px', borderRadius: 4 }}
                        />
                      </div>
                      <div>
                        <span style={{ fontSize: 9, color: '#888' }}>Width:</span>
                        <input
                          type="number"
                          value={selectedSlot.width}
                          onChange={e => handleUpdateSlot(selectedSlotIndex, { width: Number(e.target.value) })}
                          style={{ width: '100%', background: '#111', border: '1px solid #333', color: '#fff', fontSize: 10, padding: '3px 6px', borderRadius: 4 }}
                        />
                      </div>
                      <div>
                        <span style={{ fontSize: 9, color: '#888' }}>Height:</span>
                        <input
                          type="number"
                          value={selectedSlot.height}
                          onChange={e => handleUpdateSlot(selectedSlotIndex, { height: Number(e.target.value) })}
                          style={{ width: '100%', background: '#111', border: '1px solid #333', color: '#fff', fontSize: 10, padding: '3px 6px', borderRadius: 4 }}
                        />
                      </div>
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* Step 4: Metadata */}
            <div>
              <label style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em', color: '#aaa', display: 'block', marginBottom: 8 }}>
                4. Template Name & Backdrop
              </label>

              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                <input
                  type="text"
                  value={templateName}
                  onChange={e => setTemplateName(e.target.value)}
                  placeholder="Template Name"
                  style={{
                    width: '100%',
                    background: '#111',
                    border: '1px solid #333',
                    color: '#fff',
                    padding: '8px 10px',
                    borderRadius: 6,
                    fontSize: 12,
                  }}
                />

                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <span style={{ fontSize: 11, color: '#aaa' }}>Backdrop:</span>
                  <input
                    type="color"
                    value={bgColor}
                    onChange={e => setBgColor(e.target.value)}
                    style={{ width: 28, height: 28, borderRadius: 4, border: 'none', cursor: 'pointer', background: 'transparent' }}
                  />
                  <span style={{ fontSize: 10, fontFamily: 'var(--font-mono)', color: '#888' }}>{bgColor}</span>
                </div>
              </div>
            </div>
          </div>

          {/* Right Live Preview Area */}
          <div
            ref={previewContainerRef}
            style={{
              flex: 1,
              background: '#0d0d0d',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              padding: 24,
              overflow: 'auto',
              position: 'relative',
            }}
          >
            {imageSrc && imageMeta ? (
              <div
                style={{
                  position: 'relative',
                  width: Math.min(260, Math.floor(450 * (imageMeta.width / imageMeta.height))),
                  aspectRatio: `${imageMeta.width} / ${imageMeta.height}`,
                  background: bgColor,
                  borderRadius: 0,
                  overflow: 'hidden',
                  boxShadow: '0 12px 40px rgba(0,0,0,0.5)',
                  border: '1px solid #333',
                }}
              >
                {/* Photo Slots with Demo Photos */}
                {slots.map((s, idx) => {
                  const leftPct = (s.x / imageMeta.width) * 100
                  const topPct = (s.y / imageMeta.height) * 100
                  const widthPct = (s.width / imageMeta.width) * 100
                  const heightPct = (s.height / imageMeta.height) * 100
                  const isSelected = selectedSlotIndex === idx

                  return (
                    <div
                      key={s.id || idx}
                      onClick={() => setSelectedSlotIndex(idx)}
                      style={{
                        position: 'absolute',
                        left: `${leftPct}%`,
                        top: `${topPct}%`,
                        width: `${widthPct}%`,
                        height: `${heightPct}%`,
                        overflow: 'hidden',
                        background: '#222',
                        outline: isSelected ? '2px solid #00E5FF' : '1px dashed rgba(255,255,255,0.3)',
                        cursor: 'pointer',
                        zIndex: isSelected ? 15 : 2,
                      }}
                    >
                      <img
                        src={`https://images.unsplash.com/photo-${1534528741775 + idx * 100}?auto=format&fit=crop&w=400&q=80`}
                        alt=""
                        style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                      />
                      {isSelected && (
                        <div
                          style={{
                            position: 'absolute',
                            top: 2,
                            left: 2,
                            background: '#00E5FF',
                            color: '#000',
                            fontSize: 9,
                            fontWeight: 800,
                            padding: '1px 4px',
                            borderRadius: 2,
                            pointerEvents: 'none',
                          }}
                        >
                          SLOT {idx + 1}
                        </div>
                      )}
                    </div>
                  )
                })}

                {/* Keyed Transparent Overlay on top */}
                {keyedOverlayUrl && (
                  <img
                    src={keyedOverlayUrl}
                    alt=""
                    style={{
                      position: 'absolute',
                      inset: 0,
                      width: '100%',
                      height: '100%',
                      objectFit: 'fill',
                      pointerEvents: 'none',
                      zIndex: 10,
                    }}
                  />
                )}
              </div>
            ) : (
              <div
                style={{
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: 'center',
                  gap: 12,
                  color: '#666',
                }}
              >
                <ImageIcon size={48} strokeWidth={1.2} />
                <div style={{ fontSize: 13, fontFamily: 'var(--font-mono)' }}>
                  Upload a template image on the left to begin
                </div>
              </div>
            )}
          </div>
        </div>
      </motion.div>
    </div>
  )
}

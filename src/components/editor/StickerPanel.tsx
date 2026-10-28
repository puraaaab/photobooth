import React, { useState, useEffect, useMemo, useRef } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { 
  Sparkles, Search, Trash2, Copy, RotateCw, Layers, 
  UploadCloud, Check, X, Sliders, ChevronDown, Move,
  Zap, Radio, Flame, Compass, Music, Tag, ZoomIn, ZoomOut, Film, Scissors
} from 'lucide-react'
import type { CanvasElement } from '@/types'
import { useToast } from '@/components/ui/Toast'

export interface StickerItem {
  id: string
  name: string
  category: string
  tags: string[]
  url: string
  width: number
  height: number
  aspectRatio: number
}

const CATEGORY_TABS = [
  { id: 'all', label: 'ALL', icon: Sparkles },
  { id: 'streetwear', label: 'STREET', icon: Zap },
  { id: 'retro', label: 'RETRO', icon: Radio },
  { id: 'pop_culture', label: 'ANIME', icon: Flame },
  { id: 'motorsport', label: 'CARS', icon: Compass },
  { id: 'music_misc', label: 'VIBES', icon: Music },
]

interface StickerPanelProps {
  canvasElements: CanvasElement[]
  selectedElementId: string | null
  onSelectElement: (id: string | null) => void
  onAddSticker: (sticker: StickerItem) => void
  onUpdateElement: (id: string, updates: Partial<CanvasElement>) => void
  onRemoveElement: (id: string) => void
  onDuplicateElement: (id: string) => void
  strips?: import('@/types').Strip[]
  activeStripIndex?: number
  filterScope?: import('@/types').FilterApplyScope
  onSelectStripIndex?: (idx: number) => void
  onSelectFilterScope?: (scope: import('@/types').FilterApplyScope) => void
  onReassignStrip?: (elementId: string, stripId: string | undefined) => void
  onCopyToOtherStrip?: (elementId: string) => void
}

export function StickerPanel({
  canvasElements,
  selectedElementId,
  onSelectElement,
  onAddSticker,
  onUpdateElement,
  onRemoveElement,
  onDuplicateElement,
  strips,
  activeStripIndex = 0,
  filterScope = 'photos_in_strip',
  onSelectStripIndex,
  onSelectFilterScope,
  onReassignStrip,
  onCopyToOtherStrip,
}: StickerPanelProps) {
  const { toast } = useToast()
  const [stickers, setStickers] = useState<StickerItem[]>([])
  const [activeCategory, setActiveCategory] = useState('all')
  const [searchQuery, setSearchQuery] = useState('')
  const [isLoading, setIsLoading] = useState(true)
  const [showImporter, setShowImporter] = useState(false)

  // Load manifest
  useEffect(() => {
    fetch('/stickers/stickers_manifest.json')
      .then(res => {
        if (!res.ok) throw new Error('Failed to load stickers manifest')
        return res.json()
      })
      .then(data => {
        setStickers(data)
        setIsLoading(false)
      })
      .catch(err => {
        console.warn('Could not load /stickers/stickers_manifest.json:', err)
        setIsLoading(false)
      })
  }, [])

  const selectedElement = useMemo(() => {
    return canvasElements.find(el => el.id === selectedElementId && el.type === 'sticker')
  }, [canvasElements, selectedElementId])

  const filteredStickers = useMemo(() => {
    return stickers.filter(item => {
      const matchCat = activeCategory === 'all' || item.category === activeCategory
      const matchSearch = !searchQuery || 
        item.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
        item.tags.some(t => t.toLowerCase().includes(searchQuery.toLowerCase()))
      return matchCat && matchSearch
    })
  }, [stickers, activeCategory, searchQuery])

  // Sticker placed counts
  const placedStickers = useMemo(() => {
    return canvasElements.filter(el => el.type === 'sticker')
  }, [canvasElements])

  return (
    <div className="flex flex-col gap-3" style={{ color: 'var(--color-text-primary)' }}>
      {/* ─── Selected Sticker Controls (Inspector) ─────────────────────────── */}
      <AnimatePresence>
        {selectedElement && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            style={{
              background: 'var(--color-bg-card)',
              border: '1px solid var(--color-primary)',
              borderRadius: 'var(--radius-sm)',
              padding: '12px',
              boxShadow: '0 4px 16px rgba(109, 6, 38, 0.25)',
              overflow: 'hidden',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <Tag size={13} color="var(--color-brand)" />
                <span style={{ fontFamily: 'var(--font-mono)', fontSize: 11, fontWeight: 700, letterSpacing: '0.06em', color: 'var(--color-brand)' }}>
                  EDIT SELECTED STICKER
                </span>
              </div>
              <button
                className="btn btn-ghost btn-sm"
                onClick={() => onSelectElement(null)}
                style={{ padding: '2px 6px', fontSize: 10, color: 'var(--color-text-tertiary)' }}
              >
                Deselect
              </button>
            </div>

            {/* Sticker Size / Zoom Controls */}
            <div style={{ marginBottom: 12, background: 'rgba(0,0,0,0.25)', padding: '8px', borderRadius: 8, border: '1px solid rgba(255,255,255,0.06)' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 10, fontFamily: 'var(--font-mono)', color: 'var(--color-text-secondary)', marginBottom: 6 }}>
                <span style={{ fontWeight: 700, display: 'flex', alignItems: 'center', gap: 4 }}>
                  <ZoomIn size={12} color="var(--color-brand)" /> STICKER SIZE & ZOOM
                </span>
                <span style={{ fontWeight: 800, color: 'var(--color-brand)' }}>{Math.round(selectedElement.width)} px</span>
              </div>

              {/* - and + buttons with Slider */}
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
                <button
                  type="button"
                  className="btn btn-secondary btn-sm"
                  onClick={() => {
                    const aspect = selectedElement.height > 0 ? selectedElement.width / selectedElement.height : 1
                    const newW = Math.max(60, selectedElement.width - 20)
                    onUpdateElement(selectedElement.id, { width: newW, height: Math.round(newW / aspect) })
                  }}
                  style={{ width: 28, height: 26, padding: 0, fontSize: 14, fontWeight: 700 }}
                  title="Make Sticker Smaller"
                >
                  -
                </button>
                <input
                  type="range"
                  min="60"
                  max="500"
                  step="5"
                  value={selectedElement.width}
                  onChange={(e) => {
                    const newW = Number(e.target.value)
                    const aspect = selectedElement.height > 0 ? selectedElement.width / selectedElement.height : 1
                    onUpdateElement(selectedElement.id, {
                      width: newW,
                      height: Math.round(newW / aspect),
                    })
                  }}
                  style={{ flex: 1, accentColor: 'var(--color-primary)' }}
                />
                <button
                  type="button"
                  className="btn btn-secondary btn-sm"
                  onClick={() => {
                    const aspect = selectedElement.height > 0 ? selectedElement.width / selectedElement.height : 1
                    const newW = Math.min(500, selectedElement.width + 20)
                    onUpdateElement(selectedElement.id, { width: newW, height: Math.round(newW / aspect) })
                  }}
                  style={{ width: 28, height: 26, padding: 0, fontSize: 14, fontWeight: 700 }}
                  title="Make Sticker Larger"
                >
                  +
                </button>
              </div>

              {/* Quick Size Preset Pills */}
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 4 }}>
                {[
                  { label: 'Small', w: 90 },
                  { label: 'Medium', w: 180 },
                  { label: 'Large', w: 280 },
                  { label: 'Giant', w: 400 },
                ].map(({ label, w }) => {
                  const isCurrent = Math.abs(selectedElement.width - w) < 25
                  return (
                    <button
                      key={label}
                      type="button"
                      onClick={() => {
                        const aspect = selectedElement.height > 0 ? selectedElement.width / selectedElement.height : 1
                        onUpdateElement(selectedElement.id, { width: w, height: Math.round(w / aspect) })
                      }}
                      style={{
                        padding: '3px 2px',
                        fontSize: 9,
                        fontFamily: 'var(--font-mono)',
                        borderRadius: 4,
                        background: isCurrent ? 'var(--color-primary)' : 'rgba(255,255,255,0.06)',
                        color: isCurrent ? '#ffffff' : 'var(--color-text-secondary)',
                        border: isCurrent ? '1px solid var(--color-brand-light)' : '1px solid rgba(255,255,255,0.08)',
                        cursor: 'pointer',
                        fontWeight: isCurrent ? 700 : 500,
                      }}
                    >
                      {label}
                    </button>
                  )
                })}
              </div>
            </div>

            {/* Rotation Slider */}
            <div style={{ marginBottom: 10 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 10, fontFamily: 'var(--font-mono)', color: 'var(--color-text-secondary)', marginBottom: 4 }}>
                <span>ROTATION</span>
                <span>{selectedElement.rotation ?? 0}°</span>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <input
                  type="range"
                  min="-180"
                  max="180"
                  step="2"
                  value={selectedElement.rotation ?? 0}
                  onChange={(e) => {
                    onUpdateElement(selectedElement.id, { rotation: Number(e.target.value) })
                  }}
                  style={{ flex: 1, accentColor: 'var(--color-primary)' }}
                />
                <button
                  type="button"
                  onClick={() => onUpdateElement(selectedElement.id, { rotation: 0 })}
                  className="btn btn-ghost btn-sm"
                  style={{ padding: '2px 6px', fontSize: 9, fontFamily: 'var(--font-mono)' }}
                  title="Reset rotation to 0°"
                >
                  0°
                </button>
              </div>
            </div>

            {/* Opacity Slider */}
            <div style={{ marginBottom: 12 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 10, fontFamily: 'var(--font-mono)', color: 'var(--color-text-secondary)', marginBottom: 4 }}>
                <span>OPACITY</span>
                <span>{Math.round((selectedElement.opacity ?? 1) * 100)}%</span>
              </div>
              <input
                type="range"
                min="0.2"
                max="1"
                step="0.05"
                value={selectedElement.opacity ?? 1}
                onChange={(e) => {
                  onUpdateElement(selectedElement.id, { opacity: Number(e.target.value) })
                }}
                style={{ width: '100%', accentColor: 'var(--color-primary)' }}
              />
            </div>

            {/* Action buttons: Duplicate, Layering, Delete */}
            <div style={{ display: 'flex', gap: 6 }}>
              <button
                type="button"
                className="btn btn-secondary btn-sm"
                onClick={() => onDuplicateElement(selectedElement.id)}
                style={{ flex: 1, fontSize: 10, padding: '5px 4px', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 4 }}
              >
                <Copy size={11} />
                <span>Duplicate</span>
              </button>

              <button
                type="button"
                className="btn btn-secondary btn-sm"
                onClick={() => {
                  const z = (selectedElement.zIndex ?? 25) + 1
                  onUpdateElement(selectedElement.id, { zIndex: z })
                  toast('Brought forward', 'info')
                }}
                style={{ fontSize: 10, padding: '5px 8px' }}
                title="Bring forward"
              >
                ▲ Front
              </button>

              <button
                type="button"
                className="btn btn-secondary btn-sm"
                onClick={() => {
                  const z = Math.max(1, (selectedElement.zIndex ?? 25) - 1)
                  onUpdateElement(selectedElement.id, { zIndex: z })
                  toast('Sent backward', 'info')
                }}
                style={{ fontSize: 10, padding: '5px 8px' }}
                title="Send backward"
              >
                ▼ Back
              </button>

              <button
                type="button"
                className="btn btn-sm"
                onClick={() => onRemoveElement(selectedElement.id)}
                style={{
                  background: 'rgba(225, 29, 72, 0.2)',
                  color: '#FF6B8B',
                  border: '1px solid rgba(225, 29, 72, 0.4)',
                  fontSize: 10,
                  padding: '5px 8px',
                }}
                title="Delete sticker"
              >
                <Trash2 size={12} />
              </button>
            </div>

            {/* Strip Assignment Row */}
            {strips && strips.length > 1 && (
              <div style={{ marginTop: 10, paddingTop: 8, borderTop: '1px solid rgba(255,255,255,0.08)' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
                  <span style={{ fontSize: 9, fontFamily: 'var(--font-mono)', color: 'var(--color-text-secondary)', textTransform: 'uppercase' }}>
                    Assigned Strip:
                  </span>
                  <span style={{ fontSize: 9, fontFamily: 'var(--font-mono)', fontWeight: 700, color: 'var(--color-brand)' }}>
                    {!selectedElement.stripId
                      ? 'Shared (All Strips)'
                      : `Strip ${(strips.findIndex(s => s.id === selectedElement.stripId) + 1) || 1} Only`}
                  </span>
                </div>

                <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
                  {strips.map((s, idx) => {
                    const isAssigned = selectedElement.stripId === s.id
                    return (
                      <button
                        key={s.id}
                        type="button"
                        onClick={() => onReassignStrip?.(selectedElement.id, s.id)}
                        style={{
                          flex: 1,
                          minWidth: 58,
                          padding: '4px 6px',
                          fontSize: 9.5,
                          fontFamily: 'var(--font-mono)',
                          fontWeight: isAssigned ? 800 : 500,
                          borderRadius: 4,
                          background: isAssigned ? 'var(--color-primary)' : 'rgba(255,255,255,0.05)',
                          color: isAssigned ? '#ffffff' : 'var(--color-text-secondary)',
                          border: isAssigned ? '1px solid var(--color-brand-light)' : '1px solid rgba(255,255,255,0.1)',
                          cursor: 'pointer',
                        }}
                      >
                        To Strip {idx + 1}
                      </button>
                    )
                  })}

                  <button
                    type="button"
                    onClick={() => onReassignStrip?.(selectedElement.id, undefined)}
                    style={{
                      flex: 1,
                      minWidth: 64,
                      padding: '4px 6px',
                      fontSize: 9.5,
                      fontFamily: 'var(--font-mono)',
                      fontWeight: !selectedElement.stripId ? 800 : 500,
                      borderRadius: 4,
                      background: !selectedElement.stripId ? '#D97706' : 'rgba(255,255,255,0.05)',
                      color: !selectedElement.stripId ? '#ffffff' : 'var(--color-text-secondary)',
                      border: !selectedElement.stripId ? '1px solid #FCD34D' : '1px solid rgba(255,255,255,0.1)',
                      cursor: 'pointer',
                    }}
                  >
                    All Strips
                  </button>
                </div>

                {onCopyToOtherStrip && (
                  <button
                    type="button"
                    onClick={() => onCopyToOtherStrip(selectedElement.id)}
                    style={{
                      marginTop: 6,
                      width: '100%',
                      padding: '5px 8px',
                      fontSize: 10,
                      fontFamily: 'var(--font-mono)',
                      fontWeight: 600,
                      borderRadius: 5,
                      background: 'linear-gradient(135deg, rgba(255, 8, 68, 0.2) 0%, rgba(255, 177, 153, 0.15) 100%)',
                      color: '#FFA0B4',
                      border: '1px solid rgba(255, 8, 68, 0.35)',
                      cursor: 'pointer',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      gap: 5,
                    }}
                  >
                    <Copy size={12} />
                    <span>Copy Sticker to Other Strip</span>
                  </button>
                )}
              </div>
            )}
          </motion.div>
        )}
      </AnimatePresence>



      {/* ─── Search & Header ───────────────────────────────────────────────── */}
      <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
        <div style={{ position: 'relative', flex: 1 }}>
          <Search size={12} style={{ position: 'absolute', left: 8, top: '50%', transform: 'translateY(-50%)', color: 'var(--color-text-tertiary)' }} />
          <input
            type="text"
            placeholder="Search stickers..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            style={{
              width: '100%',
              padding: '6px 8px 6px 26px',
              fontSize: 11,
              fontFamily: 'var(--font-mono)',
              background: 'var(--color-bg-base)',
              border: '1px solid var(--color-border-subtle)',
              borderRadius: 'var(--radius-sm)',
              color: 'var(--color-text-primary)',
            }}
          />
          {searchQuery && (
            <button
              onClick={() => setSearchQuery('')}
              style={{ position: 'absolute', right: 6, top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', color: 'var(--color-text-tertiary)', cursor: 'pointer' }}
            >
              <X size={11} />
            </button>
          )}
        </div>

        {/* Auto-Crop / Importer Button */}
        <button
          type="button"
          className="btn btn-secondary btn-sm"
          onClick={() => setShowImporter(true)}
          style={{
            padding: '6px 8px',
            fontSize: 10,
            fontFamily: 'var(--font-mono)',
            display: 'flex',
            alignItems: 'center',
            gap: 4,
            whiteSpace: 'nowrap',
            background: 'rgba(109, 6, 38, 0.12)',
            border: '1px solid var(--color-brand)',
            color: 'var(--color-brand)',
          }}
          title="Crop and import more sticker sheets"
        >
          <UploadCloud size={12} />
          <span>+ Auto-Crop</span>
        </button>
      </div>

      {/* ─── Category Tabs ─────────────────────────────────────────────────── */}
      <div
        style={{
          display: 'flex',
          gap: 4,
          overflowX: 'auto',
          paddingBottom: 4,
          scrollbarWidth: 'none',
        }}
      >
        {CATEGORY_TABS.map(tab => {
          const isActive = activeCategory === tab.id
          const count = tab.id === 'all' 
            ? stickers.length 
            : stickers.filter(s => s.category === tab.id).length
          const Icon = tab.icon

          return (
            <button
              key={tab.id}
              onClick={() => setActiveCategory(tab.id)}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 5,
                padding: '5px 9px',
                fontSize: 10,
                fontFamily: 'var(--font-mono)',
                borderRadius: 14,
                border: isActive ? '1px solid var(--color-primary)' : '1px solid var(--color-border-subtle)',
                background: isActive ? 'var(--color-primary)' : 'var(--color-bg-base)',
                color: isActive ? '#ffffff' : 'var(--color-text-secondary)',
                cursor: 'pointer',
                whiteSpace: 'nowrap',
                transition: 'all 0.15s ease',
              }}
            >
              <Icon size={11} />
              <span>{tab.label}</span>
              <span style={{ opacity: 0.65, fontSize: 9 }}>({count})</span>
            </button>
          )
        })}
      </div>

      {/* ─── Target Strip Selector (when multiple strips exist) ────────────── */}
      {strips && strips.length > 1 && (
        <div
          style={{
            display: 'flex',
            flexDirection: 'column',
            gap: 6,
            background: 'var(--color-bg, #F7F1EA)',
            border: '1.5px solid var(--color-border-strong)',
            borderRadius: 10,
            padding: '8px 10px',
            boxShadow: 'var(--shadow-sm)',
          }}
        >
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ fontSize: 10, fontFamily: 'var(--font-mono)', fontWeight: 800, color: 'var(--color-brand)', letterSpacing: '0.05em' }}>
              STAMP STICKERS ONTO:
            </span>
            <span
              style={{
                fontSize: 9.5,
                fontFamily: 'var(--font-mono)',
                fontWeight: 800,
                color: filterScope === 'all_photos' ? '#B45309' : 'var(--color-brand)',
                background: filterScope === 'all_photos' ? 'rgba(180, 83, 9, 0.12)' : 'rgba(109, 6, 38, 0.10)',
                padding: '2px 6px',
                borderRadius: 4,
                border: filterScope === 'all_photos' ? '1px solid rgba(180, 83, 9, 0.25)' : '1px solid rgba(109, 6, 38, 0.25)',
              }}
            >
              {filterScope === 'all_photos' ? 'All Strips' : `Strip ${activeStripIndex + 1}`}
            </span>
          </div>

          <div style={{ display: 'flex', gap: 5, flexWrap: 'wrap' }}>
            {strips.map((s, idx) => {
              const isSelected = activeStripIndex === idx && filterScope !== 'all_photos'
              return (
                <button
                  key={s.id}
                  type="button"
                  onClick={() => {
                    onSelectStripIndex?.(idx)
                    onSelectFilterScope?.('photos_in_strip')
                  }}
                  style={{
                    flex: 1,
                    minWidth: 64,
                    padding: '5px 8px',
                    fontSize: 10,
                    fontFamily: 'var(--font-mono)',
                    fontWeight: isSelected ? 800 : 600,
                    borderRadius: 6,
                    background: isSelected ? 'linear-gradient(135deg, #6D0626 0%, #450216 100%)' : 'rgba(255, 255, 255, 0.05)',
                    color: isSelected ? '#ffffff' : 'var(--color-text-secondary)',
                    border: isSelected ? '1.5px solid var(--color-brand-mid)' : '1px solid var(--color-border-subtle)',
                    cursor: 'pointer',
                    boxShadow: isSelected ? '0 2px 6px rgba(109, 6, 38, 0.35)' : 'none',
                    transition: 'all 0.15s ease',
                  }}
                >
                  Strip {idx + 1}
                </button>
              )
            })}
            <button
              type="button"
              onClick={() => onSelectFilterScope?.('all_photos')}
              style={{
                flex: 1,
                minWidth: 74,
                padding: '5px 8px',
                fontSize: 10,
                fontFamily: 'var(--font-mono)',
                fontWeight: filterScope === 'all_photos' ? 800 : 600,
                borderRadius: 6,
                background: filterScope === 'all_photos' ? 'linear-gradient(135deg, #B45309 0%, #78350F 100%)' : 'rgba(255, 255, 255, 0.05)',
                color: filterScope === 'all_photos' ? '#ffffff' : 'var(--color-text-secondary)',
                border: filterScope === 'all_photos' ? '1.5px solid #F59E0B' : '1px solid var(--color-border-subtle)',
                cursor: 'pointer',
                boxShadow: filterScope === 'all_photos' ? '0 2px 6px rgba(180, 83, 9, 0.35)' : 'none',
                transition: 'all 0.15s ease',
              }}
            >
              All Strips
            </button>
          </div>
        </div>
      )}

      {/* ─── Placed Stickers Count ─────────────────────────────────────────── */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: 10, fontFamily: 'var(--font-mono)', color: 'var(--color-text-tertiary)' }}>
        <span>TAP ANY STICKER TO STAMP ON STRIP</span>
        <span>{placedStickers.length} on canvas</span>
      </div>

      {/* ─── Stickers Grid ─────────────────────────────────────────────────── */}
      {isLoading ? (
        <div style={{ padding: '30px', textAlign: 'center', fontSize: 11, fontFamily: 'var(--font-mono)', color: 'var(--color-text-tertiary)' }}>
          Loading stickers...
        </div>
      ) : filteredStickers.length === 0 ? (
        <div style={{ padding: '30px', textAlign: 'center', fontSize: 11, fontFamily: 'var(--font-mono)', color: 'var(--color-text-tertiary)' }}>
          No stickers found matching "{searchQuery}"
        </div>
      ) : (
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(3, 1fr)',
            gridAutoRows: '86px',
            gap: 10,
            maxHeight: 400,
            overflowY: 'auto',
            padding: 4,
          }}
        >
          {filteredStickers.map(item => (
            <motion.button
              key={item.id}
              type="button"
              whileHover={{ scale: 1.04 }}
              whileTap={{ scale: 0.96 }}
              onClick={() => {
                onAddSticker(item)
                toast(`Added "${item.name}" sticker!`, 'success')
              }}
              style={{
                position: 'relative',
                width: '100%',
                height: 84,
                minHeight: 84,
                background: 'rgba(0, 24, 26, 0.75)',
                border: '1px solid rgba(255, 255, 255, 0.15)',
                borderRadius: 'var(--radius-sm)',
                padding: '6px 4px',
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                justifyContent: 'center',
                cursor: 'pointer',
                overflow: 'hidden',
                outline: 'none',
                boxSizing: 'border-box',
                flexShrink: 0,
              }}
              title={`Tap to add ${item.name}`}
            >
              {/* Checkerboard subtle background to showcase transparency */}
              <div
                style={{
                  position: 'absolute',
                  inset: 0,
                  opacity: 0.12,
                  backgroundImage: 'radial-gradient(circle, #ffffff 10%, transparent 11%)',
                  backgroundSize: '10px 10px',
                  pointerEvents: 'none',
                }}
              />

              <img
                src={item.url}
                alt={item.name}
                loading="lazy"
                style={{
                  width: 50,
                  height: 50,
                  maxWidth: '85%',
                  maxHeight: '62%',
                  objectFit: 'contain',
                  filter: 'drop-shadow(0 2px 4px rgba(0,0,0,0.5))',
                  pointerEvents: 'none',
                  flexShrink: 0,
                }}
              />

              <div
                style={{
                  marginTop: 3,
                  fontSize: 9,
                  fontFamily: 'var(--font-mono)',
                  color: 'var(--color-text-secondary)',
                  textAlign: 'center',
                  width: '100%',
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                  whiteSpace: 'nowrap',
                  lineHeight: 1.1,
                }}
              >
                {item.name}
              </div>
            </motion.button>
          ))}
        </div>
      )}

      {/* ─── In-App Sticker Sheet Auto-Cropper Modal ───────────────────────── */}
      <AnimatePresence>
        {showImporter && (
          <StickerSheetImporterModal
            onClose={() => setShowImporter(false)}
            onStickersImported={(newItems) => {
              setStickers(prev => [...prev, ...newItems])
              setShowImporter(false)
              toast(`Successfully imported ${newItems.length} stickers!`, 'success')
            }}
          />
        )}
      </AnimatePresence>
    </div>
  )
}

// ─── Interactive In-App Sheet Cropper & Sorter Modal ──────────────────────────

interface StickerSheetImporterModalProps {
  onClose: () => void
  onStickersImported: (items: StickerItem[]) => void
}

function StickerSheetImporterModal({ onClose, onStickersImported }: StickerSheetImporterModalProps) {
  const [selectedFile, setSelectedFile] = useState<File | null>(null)
  const [sheetPreviewUrl, setSheetPreviewUrl] = useState<string | null>(null)
  const [targetCategory, setTargetCategory] = useState('custom')
  const [isProcessing, setIsProcessing] = useState(false)
  const [detectedCount, setDetectedCount] = useState<number | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (file) {
      setSelectedFile(file)
      const url = URL.createObjectURL(file)
      setSheetPreviewUrl(url)
      setDetectedCount(null)
    }
  }

  const handleAutoCropAndImport = async () => {
    if (!selectedFile || !sheetPreviewUrl) return
    setIsProcessing(true)

    try {
      // In-browser segmentation using HTML5 Canvas & Connected Components
      const img = new Image()
      img.src = sheetPreviewUrl
      await new Promise((res) => { img.onload = res })

      const canvas = document.createElement('canvas')
      canvas.width = img.width
      canvas.height = img.height
      const ctx = canvas.getContext('2d', { willReadFrequently: true })!
      ctx.drawImage(img, 0, 0)

      const imgData = ctx.getImageData(0, 0, img.width, img.height)
      const { data, width, height } = imgData

      // Sample perimeter
      let sumR = 0, sumG = 0, sumB = 0, count = 0
      for (let x = 0; x < width; x += 4) {
        const i1 = (0 * width + x) * 4
        const i2 = ((height - 1) * width + x) * 4
        sumR += data[i1] + data[i2]
        sumG += data[i1 + 1] + data[i2 + 1]
        sumB += data[i1 + 2] + data[i2 + 2]
        count += 2
      }
      const avgR = sumR / count, avgG = sumG / count, avgB = sumB / count

      const isBg = (x: number, y: number) => {
        const idx = (y * width + x) * 4
        const r = data[idx], g = data[idx + 1], b = data[idx + 2], a = data[idx + 3]
        if (a < 20) return true
        if (avgR > 240) {
          return (r >= 244 && g >= 244 && b >= 244) || (r >= 220 && r <= 245 && Math.abs(r - g) <= 6)
        }
        return Math.sqrt((r - avgR)**2 + (g - avgG)**2 + (b - avgB)**2) < 22
      }

      // Flood fill perimeter
      const bgMask = new Uint8Array(width * height)
      const queue = new Int32Array(width * height)
      let qHead = 0, qTail = 0

      for (let x = 0; x < width; x++) {
        queue[qTail++] = (0 * width + x)
        queue[qTail++] = ((height - 1) * width + x)
      }
      for (let y = 0; y < height; y++) {
        queue[qTail++] = (y * width + 0)
        queue[qTail++] = (y * width + (width - 1))
      }

      while (qHead < qTail) {
        const curr = queue[qHead++]
        if (bgMask[curr] !== 0) continue
        const cy = Math.floor(curr / width)
        const cx = curr % width

        if (isBg(cx, cy)) {
          bgMask[curr] = 1
          if (cx > 0 && bgMask[curr - 1] === 0) queue[qTail++] = curr - 1
          if (cx < width - 1 && bgMask[curr + 1] === 0) queue[qTail++] = curr + 1
          if (cy > 0 && bgMask[curr - width] === 0) queue[qTail++] = curr - width
          if (cy < height - 1 && bgMask[curr + width] === 0) queue[qTail++] = curr + width
        }
      }

      // Find foreground components
      const labels = new Int32Array(width * height).fill(0)
      let curLabel = 0
      const detectedBoxes: Array<{ minX: number; maxX: number; minY: number; maxY: number }> = []

      for (let y = 0; y < height; y++) {
        for (let x = 0; x < width; x++) {
          const idx = y * width + x
          if (bgMask[idx] === 0 && labels[idx] === 0) {
            curLabel++
            labels[idx] = curLabel
            const cQ = [idx]
            let h = 0
            let minX = x, maxX = x, minY = y, maxY = y
            let pxCount = 0

            while (h < cQ.length) {
              const c = cQ[h++]
              pxCount++
              const py = Math.floor(c / width)
              const px = c % width
              if (px < minX) minX = px
              if (px > maxX) maxX = px
              if (py < minY) minY = py
              if (py > maxY) maxY = py

              for (let dy = -1; dy <= 1; dy++) {
                const ny = py + dy
                if (ny < 0 || ny >= height) continue
                for (let dx = -1; dx <= 1; dx++) {
                  if (dx === 0 && dy === 0) continue
                  const nx = px + dx
                  if (nx < 0 || nx >= width) continue
                  const nIdx = ny * width + nx
                  if (bgMask[nIdx] === 0 && labels[nIdx] === 0) {
                    labels[nIdx] = curLabel
                    cQ.push(nIdx)
                  }
                }
              }
            }

            if (pxCount > 350 && (maxX - minX > 24) && (maxY - minY > 24)) {
              detectedBoxes.push({ minX, maxX, minY, maxY })
            }
          }
        }
      }

      setDetectedCount(detectedBoxes.length)

      // Crop each detected sticker into transparent PNG data URL
      const newItems: StickerItem[] = []
      const baseName = selectedFile.name.replace(/\.[^/.]+$/, '').toLowerCase().replace(/[^a-z0-9]/g, '_')

      for (let i = 0; i < detectedBoxes.length; i++) {
        const box = detectedBoxes[i]
        const pad = 4
        const cropX = Math.max(0, box.minX - pad)
        const cropY = Math.max(0, box.minY - pad)
        const cropW = Math.min(width - cropX, (box.maxX - box.minX + 1) + pad * 2)
        const cropH = Math.min(height - cropY, (box.maxY - box.minY + 1) + pad * 2)

        const stickerCanvas = document.createElement('canvas')
        stickerCanvas.width = cropW
        stickerCanvas.height = cropH
        const sCtx = stickerCanvas.getContext('2d')!
        const sData = sCtx.createImageData(cropW, cropH)

        for (let y = 0; y < cropH; y++) {
          for (let x = 0; x < cropW; x++) {
            const srcX = cropX + x
            const srcY = cropY + y
            const srcIdx = (srcY * width + srcX) * 4
            const destIdx = (y * cropW + x) * 4

            if (bgMask[srcY * width + srcX] === 1) {
              sData.data[destIdx + 3] = 0 // transparent
            } else {
              sData.data[destIdx] = data[srcIdx]
              sData.data[destIdx + 1] = data[srcIdx + 1]
              sData.data[destIdx + 2] = data[srcIdx + 2]
              sData.data[destIdx + 3] = data[srcIdx + 3]
            }
          }
        }

        sCtx.putImageData(sData, 0, 0)
        const dataUrl = stickerCanvas.toDataURL('image/png')

        newItems.push({
          id: `${baseName}_${i + 1}_${Date.now().toString(36)}`,
          name: `${baseName.replace(/_/g, ' ')} #${i + 1}`,
          category: targetCategory,
          tags: [targetCategory, baseName],
          url: dataUrl,
          width: cropW,
          height: cropH,
          aspectRatio: Number((cropW / cropH).toFixed(3)),
        })
      }

      setIsProcessing(false)
      onStickersImported(newItems)
    } catch (err) {
      console.error('Error auto-cropping sheet:', err)
      setIsProcessing(false)
      alert('Failed to process sticker sheet.')
    }
  }

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      style={{
        position: 'fixed',
        inset: 0,
        background: 'rgba(0, 16, 18, 0.85)',
        backdropFilter: 'blur(8px)',
        zIndex: 9999,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: 20,
      }}
      onClick={onClose}
    >
      <motion.div
        initial={{ scale: 0.95, y: 10 }}
        animate={{ scale: 1, y: 0 }}
        exit={{ scale: 0.95, y: 10 }}
        onClick={e => e.stopPropagation()}
        style={{
          width: 520,
          maxWidth: '100%',
          background: 'var(--color-bg-surface)',
          border: '1px solid var(--color-border-subtle)',
          borderRadius: 'var(--radius-md)',
          padding: 24,
          boxShadow: '0 20px 50px rgba(0, 0, 0, 0.6)',
          display: 'flex',
          flexDirection: 'column',
          gap: 16,
        }}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <Scissors size={20} color="var(--color-brand)" />
            <div>
              <h3 style={{ margin: 0, fontSize: 16, fontFamily: 'var(--font-display)', letterSpacing: '0.04em' }}>
                AUTO-CROP STICKER SHEET
              </h3>
              <p style={{ margin: '2px 0 0', fontSize: 11, fontFamily: 'var(--font-mono)', color: 'var(--color-text-secondary)' }}>
                Upload any sticker sheet to automatically isolate and sort every sticker
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="btn btn-ghost btn-sm"
            style={{ borderRadius: '50%', width: 28, height: 28, padding: 0 }}
          >
            <X size={16} />
          </button>
        </div>

        {/* Upload Drop Zone */}
        <div
          onClick={() => fileInputRef.current?.click()}
          style={{
            border: '2px dashed var(--color-border-subtle)',
            borderRadius: 'var(--radius-sm)',
            padding: 24,
            textAlign: 'center',
            cursor: 'pointer',
            background: 'var(--color-bg-base)',
            transition: 'border-color 0.2s ease',
          }}
        >
          <input
            ref={fileInputRef}
            type="file"
            accept="image/png,image/jpeg,image/webp"
            onChange={handleFileChange}
            style={{ display: 'none' }}
          />

          {sheetPreviewUrl ? (
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8 }}>
              <img
                src={sheetPreviewUrl}
                alt="Sticker Sheet Preview"
                style={{ maxHeight: 180, maxWidth: '100%', borderRadius: 4, objectFit: 'contain' }}
              />
              <span style={{ fontSize: 11, fontFamily: 'var(--font-mono)', color: 'var(--color-primary-light)' }}>
                {selectedFile?.name} (Click to change)
              </span>
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8 }}>
              <UploadCloud size={32} color="var(--color-primary)" />
              <div style={{ fontSize: 13, fontWeight: 600 }}>Click or Drop Sticker Sheet Image</div>
              <div style={{ fontSize: 11, fontFamily: 'var(--font-mono)', color: 'var(--color-text-tertiary)' }}>
                Supports PNG, JPG, WebP with die-cut borders
              </div>
            </div>
          )}
        </div>

        {/* Category Assignment */}
        <div>
          <label style={{ display: 'block', fontSize: 11, fontFamily: 'var(--font-mono)', color: 'var(--color-text-secondary)', marginBottom: 6 }}>
            ASSIGN TO CATEGORY
          </label>
          <select
            value={targetCategory}
            onChange={e => setTargetCategory(e.target.value)}
            style={{
              width: '100%',
              padding: '8px 10px',
              background: 'var(--color-bg-base)',
              border: '1px solid var(--color-border-subtle)',
              borderRadius: 'var(--radius-sm)',
              color: 'var(--color-text-primary)',
              fontFamily: 'var(--font-mono)',
              fontSize: 12,
            }}
          >
            <option value="streetwear">Streetwear & Skate</option>
            <option value="retro">Retro & Vintage</option>
            <option value="pop_culture">Pop Culture & Anime</option>
            <option value="motorsport">Cars & Garage</option>
            <option value="music_misc">Music & Vibes</option>
            <option value="custom">Custom Collection</option>
          </select>
        </div>

        {/* Action Buttons */}
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 8 }}>
          <button className="btn btn-secondary btn-sm" onClick={onClose}>
            Cancel
          </button>
          <button
            className="btn btn-primary btn-sm"
            disabled={!selectedFile || isProcessing}
            onClick={handleAutoCropAndImport}
            style={{ minWidth: 140, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6 }}
          >
            {isProcessing ? (
              <span>Cropping Stickers...</span>
            ) : (
              <>
                <Sparkles size={13} />
                <span>Crop & Import</span>
              </>
            )}
          </button>
        </div>
      </motion.div>
    </motion.div>
  )
}

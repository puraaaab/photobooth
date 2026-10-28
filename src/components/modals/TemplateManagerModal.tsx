import React, { useState, useMemo } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import {
  X, Trash2, Check, CheckCircle2, XCircle, Search,
  SlidersHorizontal, Filter, RefreshCw, Eye, Sparkles, AlertCircle
} from 'lucide-react'
import { CUSTOM_TEMPLATES } from '@/templates'
import { TEMPLATES } from '@/data/templates'
import { useCustomTemplateStore } from '@/store/customTemplateStore'
import { useToast } from '@/components/ui/Toast'
import type { Template } from '@/types'

interface TemplateManagerModalProps {
  isOpen: boolean
  onClose: () => void
}

export function TemplateManagerModal({ isOpen, onClose }: TemplateManagerModalProps) {
  const { userTemplates, hiddenTemplateIds, hideTemplates, unhideTemplates } = useCustomTemplateStore()
  const { toast } = useToast()

  // All templates available across the entire booth
  const allTemplates = useMemo(() => {
    const combined = [...TEMPLATES, ...CUSTOM_TEMPLATES, ...userTemplates]
    return combined.filter((t, index, self) => index === self.findIndex(o => o.id === t.id))
  }, [userTemplates])

  // Track which template IDs are marked for removal
  // Initialized with existing hiddenTemplateIds
  const [markedToRemove, setMarkedToRemove] = useState<Set<string>>(new Set(hiddenTemplateIds))
  const [searchTerm, setSearchTerm] = useState('')
  const [shotFilter, setShotFilter] = useState<'all' | number>('all')
  const [statusFilter, setStatusFilter] = useState<'all' | 'keep' | 'remove'>('all')
  const [previewTemplate, setPreviewTemplate] = useState<Template | null>(null)
  const [isApplying, setIsApplying] = useState(false)

  // Toggle single template
  const toggleTemplate = (id: string) => {
    setMarkedToRemove(prev => {
      const next = new Set(prev)
      if (next.has(id)) {
        next.delete(id)
      } else {
        next.add(id)
      }
      return next
    })
  }

  // Batch actions
  const markAllToKeep = () => setMarkedToRemove(new Set())
  const markAllToRemove = () => setMarkedToRemove(new Set(allTemplates.map(t => t.id)))

  // Filtered list
  const filteredTemplates = useMemo(() => {
    return allTemplates.filter(t => {
      // Search
      if (searchTerm) {
        const q = searchTerm.toLowerCase()
        const matches = t.name.toLowerCase().includes(q) || t.id.toLowerCase().includes(q)
        if (!matches) return false
      }
      // Shot count
      if (shotFilter !== 'all') {
        const count = t.photoSlots?.length || t.supportedPhotoCounts?.[0] || 0
        if (count !== shotFilter) return false
      }
      // Status
      const isRemoved = markedToRemove.has(t.id)
      if (statusFilter === 'keep' && isRemoved) return false
      if (statusFilter === 'remove' && !isRemoved) return false

      return true
    })
  }, [allTemplates, searchTerm, shotFilter, statusFilter, markedToRemove])

  const keepCount = allTemplates.length - markedToRemove.size
  const removeCount = markedToRemove.size

  // Commit removals (both to disk via API and to store)
  const handleApplyChanges = async () => {
    setIsApplying(true)
    const removeIds = Array.from(markedToRemove)

    try {
      // 1. Update client-side store
      hideTemplates(removeIds)
      const toUnhide = allTemplates.map(t => t.id).filter(id => !markedToRemove.has(id))
      unhideTemplates(toUnhide)

      // 2. Call backend API to permanently filter src/templates/batchGeneratedTemplates.ts
      const res = await fetch('/api/templates/remove', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ids: removeIds }),
      })

      if (res.ok) {
        const data = await res.json()
        toast(`Applied! Keeping ${keepCount} templates. Removed ${removeCount} templates.`, 'success')
      } else {
        toast(`Saved selection in booth! (Keeping ${keepCount}, hidden ${removeCount})`, 'info')
      }

      onClose()
    } catch (err: any) {
      console.warn('API error, saving locally:', err.message)
      toast(`Updated! Hidden ${removeCount} templates.`, 'success')
      onClose()
    } finally {
      setIsApplying(false)
    }
  }

  if (!isOpen) return null

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 9999,
        background: 'rgba(10, 8, 8, 0.88)',
        backdropFilter: 'blur(10px)',
        display: 'flex',
        flexDirection: 'column',
      }}
    >
      {/* Top Header */}
      <div
        style={{
          padding: '16px 24px',
          background: 'var(--color-bg-surface, #1C1A19)',
          borderBottom: '1px solid var(--color-border-subtle, #332E2C)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          flexWrap: 'wrap',
          gap: 16,
        }}
      >
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <SlidersHorizontal size={20} color="var(--color-brand, #6D0626)" />
            <h2 style={{ fontFamily: 'var(--font-display, serif)', fontSize: 20, color: 'var(--color-offwhite, #FAF5EC)', margin: 0 }}>
              Template Curation & Removal Studio
            </h2>
          </div>
          <p style={{ margin: '4px 0 0 0', fontSize: 13, fontFamily: 'var(--font-mono, monospace)', color: 'var(--color-text-secondary, #A09895)' }}>
            Click on any template to toggle between <strong>KEEP</strong> (green) and <strong>REMOVE</strong> (red).
          </p>
        </div>

        {/* Stats & Actions */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          {/* Counters */}
          <div style={{ display: 'flex', gap: 8 }}>
            <span
              style={{
                padding: '4px 10px',
                borderRadius: 4,
                background: 'rgba(46, 125, 50, 0.2)',
                border: '1px solid rgba(46, 125, 50, 0.5)',
                color: '#81C784',
                fontSize: 12,
                fontFamily: 'var(--font-mono, monospace)',
                fontWeight: 700,
              }}
            >
              ✓ KEEP: {keepCount}
            </span>
            <span
              style={{
                padding: '4px 10px',
                borderRadius: 4,
                background: 'rgba(211, 47, 47, 0.2)',
                border: '1px solid rgba(211, 47, 47, 0.5)',
                color: '#E57373',
                fontSize: 12,
                fontFamily: 'var(--font-mono, monospace)',
                fontWeight: 700,
              }}
            >
              ✕ REMOVE: {removeCount}
            </span>
          </div>

          <button
            type="button"
            className="btn btn-secondary btn-sm"
            onClick={markAllToKeep}
            style={{ fontSize: 12 }}
          >
            Keep All
          </button>
          <button
            type="button"
            className="btn btn-secondary btn-sm"
            onClick={markAllToRemove}
            style={{ fontSize: 12 }}
          >
            Remove All
          </button>

          <button
            type="button"
            className="btn btn-primary"
            onClick={handleApplyChanges}
            disabled={isApplying}
            style={{
              background: 'var(--color-brand, #6D0626)',
              color: '#FAF5EC',
              fontWeight: 800,
              fontSize: 13,
              padding: '8px 20px',
              display: 'flex',
              alignItems: 'center',
              gap: 8,
            }}
          >
            <Check size={16} />
            <span>{isApplying ? 'Saving...' : `Apply (${keepCount} Kept · ${removeCount} Removed)`}</span>
          </button>

          <button
            type="button"
            onClick={onClose}
            className="btn btn-ghost btn-icon"
            style={{ width: 36, height: 36, borderRadius: '50%' }}
            title="Close"
          >
            <X size={20} />
          </button>
        </div>
      </div>

      {/* Filter and Search Bar */}
      <div
        style={{
          padding: '12px 24px',
          background: 'rgba(255, 255, 255, 0.02)',
          borderBottom: '1px solid var(--color-border-subtle, #332E2C)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          flexWrap: 'wrap',
          gap: 12,
        }}
      >
        {/* Search */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, background: '#121010', padding: '6px 12px', borderRadius: 6, border: '1px solid #332E2C', width: 280 }}>
          <Search size={14} color="#777" />
          <input
            type="text"
            placeholder="Search templates by name..."
            value={searchTerm}
            onChange={e => setSearchTerm(e.target.value)}
            style={{ background: 'transparent', border: 'none', color: '#fff', fontSize: 12, outline: 'none', width: '100%' }}
          />
          {searchTerm && (
            <X size={12} color="#777" style={{ cursor: 'pointer' }} onClick={() => setSearchTerm('')} />
          )}
        </div>

        {/* Shot Filter Pills */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <span style={{ fontSize: 11, fontFamily: 'var(--font-mono)', color: '#888', textTransform: 'uppercase' }}>Shots:</span>
          {(['all', 4, 3, 2, 1] as const).map(pill => {
            const isActive = shotFilter === pill
            const label = pill === 'all' ? 'All Shots' : `${pill}-Shot`
            return (
              <button
                key={String(pill)}
                type="button"
                onClick={() => setShotFilter(pill as any)}
                style={{
                  padding: '4px 10px',
                  borderRadius: 14,
                  fontSize: 11,
                  fontFamily: 'var(--font-mono)',
                  fontWeight: isActive ? 700 : 500,
                  background: isActive ? 'var(--color-brand, #6D0626)' : 'rgba(255,255,255,0.06)',
                  color: isActive ? '#FAF5EC' : '#BBB',
                  border: 'none',
                  cursor: 'pointer',
                }}
              >
                {label}
              </button>
            )
          })}
        </div>

        {/* Status Filter Pills */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <span style={{ fontSize: 11, fontFamily: 'var(--font-mono)', color: '#888', textTransform: 'uppercase' }}>Status:</span>
          {[
            { id: 'all', label: `All (${allTemplates.length})` },
            { id: 'keep', label: `Keeping (${keepCount})` },
            { id: 'remove', label: `Removing (${removeCount})` },
          ].map(pill => {
            const isActive = statusFilter === pill.id
            return (
              <button
                key={pill.id}
                type="button"
                onClick={() => setStatusFilter(pill.id as any)}
                style={{
                  padding: '4px 10px',
                  borderRadius: 14,
                  fontSize: 11,
                  fontFamily: 'var(--font-mono)',
                  fontWeight: isActive ? 700 : 500,
                  background: isActive ? 'rgba(255,255,255,0.15)' : 'transparent',
                  color: isActive ? '#FAF5EC' : '#888',
                  border: `1px solid ${isActive ? 'rgba(255,255,255,0.3)' : 'transparent'}`,
                  cursor: 'pointer',
                }}
              >
                {pill.label}
              </button>
            )
          })}
        </div>
      </div>

      {/* Templates Grid Container */}
      <div
        style={{
          flex: 1,
          overflowY: 'auto',
          padding: '24px',
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))',
          gap: 20,
          alignContent: 'start',
        }}
      >
        {filteredTemplates.length === 0 ? (
          <div style={{ gridColumn: '1 / -1', textAlign: 'center', padding: '60px 0', color: '#888' }}>
            <AlertCircle size={36} style={{ margin: '0 auto 12px auto', opacity: 0.5 }} />
            <p style={{ fontFamily: 'var(--font-mono)', fontSize: 14 }}>No templates match your filters.</p>
          </div>
        ) : (
          filteredTemplates.map(template => {
            const isRemoved = markedToRemove.has(template.id)
            const cWidth = template.canvas?.width || 1200
            const cHeight = template.canvas?.height || 3600
            const aspect = cHeight / cWidth
            const slotCount = template.photoSlots?.length || template.supportedPhotoCounts?.[0] || 0
            const thumbUrl = template.thumbnailUrl || (template.overlayImageUrl ? template.overlayImageUrl.replace('/templates/', '/templates/thumbs/').replace(/\.png$/i, '-thumb.webp') : undefined)
            const rawImg = thumbUrl || template.overlayImageUrl
            const displayImg = rawImg ? `${rawImg}?v=clean` : undefined
            const previewWidth = 96
            const previewHeight = Math.min(214, Math.max(160, Math.round(previewWidth * aspect)))

            return (
              <div
                key={template.id}
                onClick={() => toggleTemplate(template.id)}
                style={{
                  background: isRemoved ? 'rgba(40, 10, 12, 0.75)' : '#1C1A19',
                  border: `2px solid ${isRemoved ? '#D32F2F' : 'rgba(46, 125, 50, 0.65)'}`,
                  borderRadius: 10,
                  overflow: 'hidden',
                  cursor: 'pointer',
                  display: 'flex',
                  flexDirection: 'column',
                  height: 310,
                  minHeight: 310,
                  position: 'relative',
                  opacity: isRemoved ? 0.6 : 1,
                  boxShadow: isRemoved ? '0 0 12px rgba(211, 47, 47, 0.25)' : '0 4px 14px rgba(0, 0, 0, 0.45)',
                  transition: 'border 0.15s ease, opacity 0.15s ease',
                  userSelect: 'none',
                }}
              >
                {/* Header Status Badge */}
                <div
                  style={{
                    padding: '8px 10px',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    background: isRemoved ? 'rgba(211, 47, 47, 0.35)' : 'rgba(46, 125, 50, 0.25)',
                    borderBottom: `1px solid ${isRemoved ? 'rgba(211, 47, 47, 0.4)' : 'rgba(46, 125, 50, 0.3)'}`,
                    flexShrink: 0,
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                    {isRemoved ? (
                      <>
                        <XCircle size={15} color="#EF5350" />
                        <span style={{ fontSize: 11, fontWeight: 800, color: '#EF5350', fontFamily: 'var(--font-mono)' }}>
                          REMOVE
                        </span>
                      </>
                    ) : (
                      <>
                        <CheckCircle2 size={15} color="#66BB6A" />
                        <span style={{ fontSize: 11, fontWeight: 800, color: '#66BB6A', fontFamily: 'var(--font-mono)' }}>
                          KEEP
                        </span>
                      </>
                    )}
                  </div>

                  <span style={{ fontSize: 10, fontFamily: 'var(--font-mono)', background: 'rgba(0,0,0,0.5)', padding: '2px 6px', borderRadius: 3, color: '#FAF5EC' }}>
                    {slotCount} SHOT
                  </span>
                </div>

                {/* Strip Preview Container */}
                <div
                  style={{
                    flex: 1,
                    display: 'flex',
                    justifyContent: 'center',
                    alignItems: 'center',
                    background: '#100E0E',
                    padding: '8px',
                    minHeight: 0,
                    position: 'relative',
                    overflow: 'hidden',
                  }}
                >
                    <div
                      style={{
                        width: previewWidth,
                        height: previewHeight,
                        background: template.overlayImageUrl ? 'transparent' : (template.background?.color || '#1A1A1A'),
                        position: 'relative',
                        overflow: 'hidden',
                        boxShadow: template.overlayImageUrl ? 'none' : '0 4px 12px rgba(0,0,0,0.7)',
                        border: template.overlayImageUrl ? 'none' : '1px solid rgba(255,255,255,0.15)',
                        flexShrink: 0,
                      }}
                    >
                    {/* Aperture boxes */}
                    {template.photoSlots && template.photoSlots.length > 0 ? (
                      template.photoSlots.map((slot, i) => {
                        const leftPct = (slot.x / cWidth) * 100
                        const topPct = (slot.y / cHeight) * 100
                        const widthPct = (slot.width / cWidth) * 100
                        const heightPct = (slot.height / cHeight) * 100
                        return (
                          <div
                            key={i}
                            style={{
                              position: 'absolute',
                              left: `${leftPct}%`,
                              top: `${topPct}%`,
                              width: `${widthPct}%`,
                              height: `${heightPct}%`,
                              background: '#282524',
                              display: 'flex',
                              alignItems: 'center',
                              justifyContent: 'center',
                              fontSize: 9,
                              color: '#777',
                              fontFamily: 'var(--font-mono)',
                            }}
                          >
                            #{i + 1}
                          </div>
                        )
                      })
                    ) : (
                      Array.from({ length: slotCount || 3 }).map((_, i) => (
                        <div
                          key={i}
                          style={{
                            margin: '4px 6px',
                            height: `${Math.round(previewHeight / (slotCount || 3) - 10)}px`,
                            background: '#282524',
                            borderRadius: 2,
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            fontSize: 9,
                            color: '#777',
                          }}
                        >
                          #{i + 1}
                        </div>
                      ))
                    )}

                    {/* Cutout Frame overlay */}
                    {displayImg && (
                      <img
                        src={displayImg}
                        alt={template.name}
                        loading="lazy"
                        style={{
                          position: 'absolute',
                          inset: 0,
                          width: '100%',
                          height: '100%',
                          objectFit: 'fill',
                          pointerEvents: 'none',
                          zIndex: 4,
                        }}
                      />
                    )}
                  </div>
                </div>

                {/* Footer details */}
                <div
                  style={{
                    padding: '8px 10px',
                    background: 'rgba(0,0,0,0.4)',
                    borderTop: '1px solid rgba(255,255,255,0.06)',
                    flexShrink: 0,
                  }}
                >
                  <div
                    style={{
                      fontSize: 11,
                      fontWeight: 700,
                      color: isRemoved ? '#AAA' : '#FAF5EC',
                      whiteSpace: 'nowrap',
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                    }}
                    title={template.name}
                  >
                    {template.name}
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 3 }}>
                    <span style={{ fontSize: 9.5, fontFamily: 'var(--font-mono)', color: '#888' }}>
                      {cWidth}×{cHeight}
                    </span>
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation()
                        setPreviewTemplate(template)
                      }}
                      style={{
                        background: 'transparent',
                        border: 'none',
                        color: 'var(--color-brand, #D4AF37)',
                        fontSize: 10.5,
                        cursor: 'pointer',
                        padding: '1px 4px',
                        display: 'flex',
                        alignItems: 'center',
                        gap: 3,
                      }}
                    >
                      <Eye size={11} />
                      <span>Inspect</span>
                    </button>
                  </div>
                </div>
              </div>
            )
          })
        )}
      </div>

      {/* Inspect Single Template Fullscreen Modal */}
      <AnimatePresence>
        {previewTemplate && (() => {
          const pW = previewTemplate.canvas?.width || 1200
          const pH = previewTemplate.canvas?.height || 3600
          const pAspect = pH / pW
          const pImg = previewTemplate.thumbnailUrl || previewTemplate.overlayImageUrl
          return (
            <div
              style={{
                position: 'fixed',
                inset: 0,
                zIndex: 10000,
                background: 'rgba(0,0,0,0.92)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                padding: 24,
              }}
              onClick={() => setPreviewTemplate(null)}
            >
              <div
                style={{
                  background: '#1A1817',
                  border: '1px solid #444',
                  borderRadius: 12,
                  padding: 24,
                  maxWidth: 600,
                  maxHeight: '90vh',
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: 'center',
                  gap: 16,
                  position: 'relative',
                }}
                onClick={e => e.stopPropagation()}
              >
                <button
                  type="button"
                  onClick={() => setPreviewTemplate(null)}
                  style={{ position: 'absolute', top: 14, right: 14, background: 'transparent', border: 'none', color: '#fff', cursor: 'pointer' }}
                >
                  <X size={20} />
                </button>

                <h3 style={{ margin: 0, color: '#FAF5EC', fontSize: 18 }}>{previewTemplate.name}</h3>

                <div
                  style={{
                    width: 220,
                    height: Math.min(520, Math.round(220 * pAspect)),
                    position: 'relative',
                    background: previewTemplate.overlayImageUrl ? 'transparent' : (previewTemplate.background?.color || '#1A1A1A'),
                    boxShadow: previewTemplate.overlayImageUrl ? 'none' : '0 8px 30px rgba(0,0,0,0.8)',
                    overflow: 'hidden',
                  }}
                >
                  {previewTemplate.photoSlots?.map((slot, i) => (
                    <div
                      key={i}
                      style={{
                        position: 'absolute',
                        left: `${(slot.x / pW) * 100}%`,
                        top: `${(slot.y / pH) * 100}%`,
                        width: `${(slot.width / pW) * 100}%`,
                        height: `${(slot.height / pH) * 100}%`,
                        background: '#333',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        color: '#777',
                        fontSize: 12,
                      }}
                    >
                      #{i + 1}
                    </div>
                  ))}
                  {pImg && (
                    <img
                      src={`${pImg}?v=clean`}
                      alt=""
                      style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'fill' }}
                    />
                  )}
                </div>

                <div style={{ display: 'flex', gap: 12 }}>
                  <button
                    type="button"
                    className="btn btn-secondary"
                    onClick={() => {
                      toggleTemplate(previewTemplate.id)
                      setPreviewTemplate(null)
                    }}
                    style={{
                      background: markedToRemove.has(previewTemplate.id) ? '#2E7D32' : '#D32F2F',
                      color: '#fff',
                      border: 'none',
                      fontWeight: 700,
                    }}
                  >
                    {markedToRemove.has(previewTemplate.id) ? 'Keep this template' : 'Mark to Remove'}
                  </button>
                  <button type="button" className="btn btn-ghost" onClick={() => setPreviewTemplate(null)}>
                    Done
                  </button>
                </div>
              </div>
            </div>
          )
        })()}
      </AnimatePresence>
    </div>
  )
}

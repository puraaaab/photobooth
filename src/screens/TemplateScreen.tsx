import React, { useState, useMemo } from 'react'
import { motion } from 'framer-motion'
import { Sparkles, Layers, ChevronLeft, ChevronRight, Check, Search, X, SlidersHorizontal } from 'lucide-react'
import { TEMPLATES, getTemplatesForPhotoCount } from '@/data/templates'
import { CUSTOM_TEMPLATES } from '@/templates'
import { useCustomTemplateStore } from '@/store/customTemplateStore'
import { MagicTemplateStudioModal } from '@/components/modals/MagicTemplateStudioModal'
import { TemplateManagerModal } from '@/components/modals/TemplateManagerModal'
import { useSessionStore } from '@/store/sessionStore'
import {
  registerTemplateNextInterceptor,
  clearTemplateNextInterceptor,
  registerTemplateBackInterceptor,
  clearTemplateBackInterceptor,
} from '@/store/editorBridge'
import { filterEngine } from '@/engines/FilterEngine'
import { getPhotoUrl } from '@/utils/photoUrl'
import type { Template, TemplateCategory, Photo } from '@/types'

interface TemplateScreenProps {
  onBack: () => void
  onNext: () => void
}

// Category tabs including user-requested Customized tab
const CATEGORIES: { id: TemplateCategory | 'all'; label: string }[] = [
  { id: 'all',        label: 'All' },
  { id: 'custom',     label: 'Customized' },
  { id: 'classic',    label: 'Classic' },
  { id: 'modern',     label: 'Modern' },
  { id: 'fun',        label: 'Fun' },
  { id: 'vintage',    label: 'Vintage' },
  { id: 'seasonal',   label: 'Seasonal' },
]

export function TemplateScreen({ onBack, onNext }: TemplateScreenProps) {
  const { session, setTemplate, setStripTemplate } = useSessionStore()
  const { userTemplates, hiddenTemplateIds } = useCustomTemplateStore()
  const [selectedCategory, setSelectedCategory] = useState<TemplateCategory | 'all'>('all')
  const [showMagicStudio, setShowMagicStudio] = useState(false)
  const [showTemplateManager, setShowTemplateManager] = useState(false)

  const strips = session?.strips ?? []
  const [activeStripIndex, setActiveStripIndex] = useState(0)

  // Detect if strips have differing slot counts (heterogeneous like 3 + 1, 2 + 1, 4 + 2)
  const stripCounts = useMemo(() => strips.map(s => s.slots.length), [strips])
  const isHeterogeneous = useMemo(() => {
    return stripCounts.length > 1 && stripCounts.some(c => c !== stripCounts[0])
  }, [stripCounts])



  // Sequential multi-strip look selection:
  // When Next is clicked, check if any strip is left to choose its look!
  React.useEffect(() => {
    if (strips.length <= 1) {
      clearTemplateNextInterceptor()
      clearTemplateBackInterceptor()
      return
    }

    registerTemplateNextInterceptor(() => {
      // If we are not on the last strip, advance to next strip look selection
      if (activeStripIndex < strips.length - 1) {
        setActiveStripIndex(prev => prev + 1)
        return true // intercepted: stay on TemplateScreen
      }
      return false // allow advancing to EditorScreen
    })

    registerTemplateBackInterceptor(() => {
      // If we are past strip 1, go back to previous strip look
      if (activeStripIndex > 0) {
        setActiveStripIndex(prev => prev - 1)
        return true // intercepted: stay on TemplateScreen
      }
      return false // allow going back to LayoutScreen
    })

    return () => {
      clearTemplateNextInterceptor()
      clearTemplateBackInterceptor()
    }
  }, [strips.length, activeStripIndex])

  // Current strip focused
  const currentStrip = strips[activeStripIndex] ?? strips[0]
  const activeStripPhotoCount = currentStrip?.slots?.length ?? session?.layout?.arrangement?.[activeStripIndex] ?? (session?.layout?.photosPerStrip ?? 4)

  const compatibleTemplates = useMemo(() => {
    const allTemplates = [...CUSTOM_TEMPLATES, ...userTemplates, ...TEMPLATES]
    // Filter hidden
    const unhidden = allTemplates.filter(t => !hiddenTemplateIds.includes(t.id))
    // Deduplicate by ID
    const unique = unhidden.filter((t, index, self) =>
      index === self.findIndex(o => o.id === t.id)
    )
    return unique.filter(t =>
      t.supportedPhotoCounts.includes(activeStripPhotoCount)
    )
  }, [activeStripPhotoCount, userTemplates, hiddenTemplateIds])

  // Currently assigned template for the active view
  const currentTemplate = currentStrip?.template ?? session?.template ?? compatibleTemplates[0]

  const selectedTemplateId = currentTemplate?.id ?? null

  // Automatically select compatible templates for each strip if not set or incompatible
  React.useEffect(() => {
    if (!session) return
    const allTemplates = [...CUSTOM_TEMPLATES, ...userTemplates, ...TEMPLATES]
    const unique = allTemplates.filter((t, index, self) =>
      index === self.findIndex(o => o.id === t.id)
    )

    strips.forEach((strip, sIdx) => {
      const count = strip.slots.length
      const isCompat = strip.template && !strip.template.id.startsWith('classic-black') && strip.template.supportedPhotoCounts.includes(count)
      if (!isCompat) {
        const matching = unique.filter(t => t.supportedPhotoCounts.includes(count) && !t.id.startsWith('classic-black'))
        // Nudge: if multiple strips, assign distinct default styles so they immediately see the variety!
        const picked = (matching.length > sIdx && sIdx > 0) ? matching[sIdx] : matching[0]
        if (picked) {
          setStripTemplate(strip.id, picked)
          if (sIdx === 0 && (!session.template || session.template.id.startsWith('classic-black') || !session.template.supportedPhotoCounts.includes(count))) {
            setTemplate(picked, false)
          }
        }
      }
    })
  }, [strips, session, setStripTemplate, setTemplate, userTemplates])

  const selectedPhotos = useMemo(() => {
    if (!session) return []
    return session.selectedPhotoIds
      .map(id => session.photos.find(p => p.id === id))
      .filter((p): p is Photo => Boolean(p))
  }, [session])

  // Photos specifically assigned to the active strip for realistic preview
  const activeStripPhotos = useMemo(() => {
    if (!session || !currentStrip) return selectedPhotos
    const assigned = currentStrip.slots.map((slot, sIdx) => {
      const a = session.assignments.find(as => as.slotId === slot.id)
      if (a) {
        const p = session.photos.find(ph => ph.id === a.photoId)
        if (p) return p
      }
      const stripAss = session.assignments.find(as => as.stripId === currentStrip.id && as.position === sIdx)
      if (stripAss) {
        const p = session.photos.find(ph => ph.id === stripAss.photoId)
        if (p) return p
      }
      return undefined
    }).filter((p): p is Photo => Boolean(p))

    if (assigned.length > 0) return assigned

    // Fallback: slice selectedPhotos according to strip index
    const start = activeStripIndex * activeStripPhotoCount
    const slice = selectedPhotos.slice(start, start + activeStripPhotoCount)
    return slice.length > 0 ? slice : selectedPhotos
  }, [session, currentStrip, selectedPhotos, activeStripIndex, activeStripPhotoCount])

  const allCustomTemplates = useMemo(() => {
    const combined = [...CUSTOM_TEMPLATES, ...userTemplates.filter(t => t.category === 'custom')]
    return combined
      .filter(t => !hiddenTemplateIds.includes(t.id))
      .filter((t, index, self) => index === self.findIndex(o => o.id === t.id))
  }, [userTemplates, hiddenTemplateIds])

  const [customPhotoFilter, setCustomPhotoFilter] = useState<'all' | number>('all')
  const [selectedTagFilter, setSelectedTagFilter] = useState<string>('all')
  const [searchQuery, setSearchQuery] = useState<string>('')

  const displayedTemplates = useMemo(() => {
    let base: Template[] = []
    if (selectedCategory === 'custom') {
      base = customPhotoFilter === 'all'
        ? allCustomTemplates
        : allCustomTemplates.filter(t => t.supportedPhotoCounts.includes(Number(customPhotoFilter)))
    } else if (selectedCategory === 'all') {
      const combined = [...compatibleTemplates, ...allCustomTemplates]
      base = combined.filter((t, index, self) => index === self.findIndex(o => o.id === t.id))
    } else {
      base = compatibleTemplates.filter(t => t.category === selectedCategory)
    }

    // Apply tag filter
    if (selectedTagFilter !== 'all') {
      if (selectedTagFilter === 'slanted') {
        base = base.filter(t => t.tags?.includes('slanted') || t.photoSlots?.some(s => s.rotation && Math.abs(s.rotation) >= 1.5))
      } else {
        base = base.filter(t => t.tags?.includes(selectedTagFilter))
      }
    }

    // Apply search query
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase().trim()
      base = base.filter(t =>
        t.name.toLowerCase().includes(q) ||
        t.tags?.some(tag => tag.toLowerCase().includes(q)) ||
        t.category.toLowerCase().includes(q)
      )
    }

    return base
  }, [compatibleTemplates, selectedCategory, allCustomTemplates, customPhotoFilter, selectedTagFilter, searchQuery])

  const handleSelect = (template: Template) => {
    if (currentStrip) {
      setStripTemplate(currentStrip.id, template)
      if (activeStripIndex === 0) {
        setTemplate(template, false)
      }
    } else {
      setTemplate(template, true)
    }
  }

  const handleContinue = () => {
    onNext()
  }

  return (
    <div className="flex h-full overflow-hidden">
      {/* Main area */}
      <div className="flex flex-col flex-1 overflow-hidden">
        <div className="screen-toolbar" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div>
            <div className="screen-toolbar-title" style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <span>Choose a look</span>
              {strips.length > 1 && (
                <span
                  style={{
                    fontSize: 11,
                    fontFamily: 'var(--font-mono)',
                    fontWeight: 800,
                    background: 'var(--color-brand)',
                    color: 'var(--color-offwhite)',
                    padding: '3px 10px',
                    borderRadius: 'var(--radius-full)',
                    letterSpacing: '0.04em',
                  }}
                >
                  STRIP {activeStripIndex + 1} OF {strips.length}
                </span>
              )}
            </div>
            <div className="screen-toolbar-meta">
              {strips.length > 1 ? (
                <>Pick the look for Strip {activeStripIndex + 1} ({activeStripPhotoCount} photo{activeStripPhotoCount !== 1 ? 's' : ''}) · Click Next to pick the next strip's look</>
              ) : (
                <>{compatibleTemplates.length} designs for {activeStripPhotoCount}-photo strips</>
              )}
            </div>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <button
              type="button"
              className="btn btn-secondary btn-sm"
              onClick={() => setShowTemplateManager(true)}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 6,
                background: 'rgba(255, 255, 255, 0.06)',
                border: '1px solid var(--color-border-subtle)',
                color: 'var(--color-text-primary)',
                fontWeight: 600,
                fontSize: 12,
                padding: '6px 13px',
                borderRadius: 'var(--radius-full)',
                cursor: 'pointer',
              }}
              title="Open Template Curation Studio to manage and hide/unhide templates"
            >
              <SlidersHorizontal size={13} color="var(--color-brand)" />
              <span>Curate Templates</span>
            </button>

            <button
              type="button"
              className="btn btn-secondary btn-sm"
              onClick={() => setShowMagicStudio(true)}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 6,
                background: 'linear-gradient(135deg, rgba(109, 6, 38, 0.12), rgba(212, 175, 55, 0.22))',
                border: '1px solid rgba(212, 175, 55, 0.45)',
                color: 'var(--color-text-primary)',
                fontWeight: 700,
                fontSize: 12,
                padding: '6px 14px',
                borderRadius: 'var(--radius-full)',
                cursor: 'pointer',
              }}
            >
              <Sparkles size={14} color="#D4AF37" />
              <span>Magic Template Studio</span>
            </button>
          </div>
        </div>

        {/* Category tabs — plain text, accent underline */}
        <div className="tabs">
          {CATEGORIES.map(cat => {
            const count = cat.id === 'custom'
              ? allCustomTemplates.length
              : compatibleTemplates.filter(t => t.category === cat.id).length

            return (
              <button
                key={cat.id}
                className={`tab ${selectedCategory === cat.id ? 'active' : ''}`}
                onClick={() => setSelectedCategory(cat.id)}
              >
                {cat.label}
                {cat.id !== 'all' && (
                  <span style={{ marginLeft: 4, fontFamily: 'var(--font-mono)', fontSize: 10, color: 'var(--color-text-disabled)' }}>
                    ({count})
                  </span>
                )}
              </button>
            )
          })}
        </div>

        {/* Sub-filter chips & Search bar */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: 12,
            padding: '8px 16px',
            background: 'rgba(255, 255, 255, 0.03)',
            borderBottom: '1px solid var(--color-border-subtle)',
            flexWrap: 'wrap',
          }}
        >
          {/* Tag & Style Chips */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap', flex: 1 }}>
            {[
              { id: 'all', label: 'All Looks' },
              { id: 'slanted', label: '✨ Slanted / Tilted' },
              { id: 'pink', label: '💖 Cute & Pastel' },
              { id: 'romantic', label: '❤️ Romantic' },
              { id: 'vintage', label: '🎞️ Vintage & Retro' },
              { id: 'dark', label: '🖤 Dark & Noir' },
              { id: 'blue', label: '🌊 Aesthetic Blue' },
              { id: 'golden', label: '🌟 Golden & Warm' },
            ].map(tagPill => {
              const isActive = selectedTagFilter === tagPill.id
              return (
                <button
                  key={tagPill.id}
                  type="button"
                  onClick={() => setSelectedTagFilter(tagPill.id)}
                  style={{
                    padding: '3px 10px',
                    borderRadius: 'var(--radius-full)',
                    fontSize: 11,
                    fontFamily: 'var(--font-mono)',
                    fontWeight: isActive ? 800 : 500,
                    background: isActive ? (tagPill.id === 'slanted' ? 'linear-gradient(135deg, #D4AF37, #B8860B)' : 'var(--color-brand)') : 'var(--color-card)',
                    color: isActive ? '#FFFFFF' : 'var(--color-text-secondary)',
                    border: `1.5px solid ${isActive ? (tagPill.id === 'slanted' ? '#D4AF37' : 'var(--color-brand)') : 'var(--color-border-subtle)'}`,
                    cursor: 'pointer',
                    transition: 'all 0.15s ease',
                  }}
                >
                  {tagPill.label}
                </button>
              )
            })}

            {/* Photo count selector if Customized category */}
            {selectedCategory === 'custom' && (
              <div style={{ display: 'flex', alignItems: 'center', gap: 4, marginLeft: 8, borderLeft: '1px solid rgba(255,255,255,0.15)', paddingLeft: 8 }}>
                <span style={{ fontSize: 10, fontFamily: 'var(--font-mono)', color: 'var(--color-text-tertiary)', textTransform: 'uppercase' }}>
                  Shots:
                </span>
                {[
                  { id: 'all', label: 'Any' },
                  { id: 4, label: '4' },
                  { id: 3, label: '3' },
                  { id: 2, label: '2' },
                  { id: 1, label: '1' },
                ].map(pill => {
                  const isActive = customPhotoFilter === pill.id
                  return (
                    <button
                      key={String(pill.id)}
                      type="button"
                      onClick={() => setCustomPhotoFilter(pill.id as any)}
                      style={{
                        padding: '2px 7px',
                        borderRadius: 4,
                        fontSize: 10,
                        fontFamily: 'var(--font-mono)',
                        fontWeight: isActive ? 800 : 500,
                        background: isActive ? 'var(--color-brand)' : 'transparent',
                        color: isActive ? 'var(--color-offwhite)' : 'var(--color-text-secondary)',
                        border: `1px solid ${isActive ? 'var(--color-brand)' : 'var(--color-border-subtle)'}`,
                        cursor: 'pointer',
                      }}
                    >
                      {pill.label}
                    </button>
                  )
                })}
              </div>
            )}
          </div>

          {/* Quick Search */}
          <div style={{ position: 'relative', display: 'flex', alignItems: 'center' }}>
            <Search size={13} color="var(--color-text-tertiary)" style={{ position: 'absolute', left: 8, pointerEvents: 'none' }} />
            <input
              type="text"
              placeholder="Search templates & tags..."
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              style={{
                padding: '4px 26px 4px 26px',
                borderRadius: 'var(--radius-full)',
                fontSize: 11,
                fontFamily: 'var(--font-mono)',
                background: 'rgba(0, 0, 0, 0.35)',
                border: '1px solid var(--color-border-subtle)',
                color: 'var(--color-text-primary)',
                outline: 'none',
                width: 170,
              }}
            />
            {searchQuery && (
              <button
                type="button"
                onClick={() => setSearchQuery('')}
                style={{
                  position: 'absolute',
                  right: 6,
                  background: 'none',
                  border: 'none',
                  cursor: 'pointer',
                  color: 'var(--color-text-tertiary)',
                  padding: 2,
                  display: 'flex',
                }}
              >
                <X size={12} />
              </button>
            )}
          </div>
        </div>

        {/* Template Grid */}
        <div className="overflow-y-auto flex-1" style={{ padding: 'var(--space-4)' }}>
          {displayedTemplates.length === 0 ? (
            <div
              className="flex flex-col items-center justify-center h-full"
              style={{ gap: 'var(--space-3)', color: 'var(--color-text-tertiary)' }}
            >
              <div
                style={{
                  width: 32,
                  height: 48,
                  border: '1px solid var(--color-border-subtle)',
                  borderRadius: 'var(--radius-sm)',
                }}
              />
              <p style={{ fontFamily: 'var(--font-mono)', fontSize: 'var(--text-xs)', textTransform: 'uppercase', letterSpacing: '0.08em' }}>
                No designs in this category
              </p>
            </div>
          ) : (
            <div className="template-grid-4col">
              {displayedTemplates.map((template, i) => (
                <motion.div
                  key={template.id}
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: i * 0.025 }}
                >
                  <TemplateCard
                    template={template}
                    isSelected={selectedTemplateId === template.id}
                    onSelect={() => handleSelect(template)}
                    photosPerStrip={activeStripPhotoCount}
                    photos={activeStripPhotos}
                  />
                </motion.div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Right panel — live preview */}
      <div className="panel panel-right template-preview-panel">
        <div className="panel-header" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <h3>
            Preview {strips.length > 1 ? `· Strip ${activeStripIndex + 1}` : ''}
          </h3>

          {/* Quick cycle through strips in the right preview */}
          {strips.length > 1 && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <button
                className="btn btn-ghost btn-icon btn-sm"
                onClick={() => setActiveStripIndex(i => Math.max(0, i - 1))}
                disabled={activeStripIndex === 0}
                style={{ width: 36, height: 36, borderRadius: 'var(--radius-sm)' }}
                title="Previous Strip"
              >
                <ChevronLeft size={18} />
              </button>
              <span style={{ fontSize: 12, fontFamily: 'var(--font-mono)', fontWeight: 700, color: 'var(--color-text-secondary)' }}>
                {activeStripIndex + 1}/{strips.length}
              </span>
              <button
                className="btn btn-ghost btn-icon btn-sm"
                onClick={() => setActiveStripIndex(i => Math.min(strips.length - 1, i + 1))}
                disabled={activeStripIndex === strips.length - 1}
                style={{ width: 36, height: 36, borderRadius: 'var(--radius-sm)' }}
                title="Next Strip"
              >
                <ChevronRight size={18} />
              </button>
            </div>
          )}
        </div>

        <div className="panel-body flex flex-col gap-3" style={{ overflowY: 'hidden', height: '100%', padding: '12px 14px' }}>
          {currentTemplate ? (
            <>
              {/* Live preview */}
              <div style={{ display: 'flex', justifyContent: 'center', width: '100%', padding: '2px 0', flexShrink: 0 }}>
                <TemplateLivePreview
                  template={currentTemplate}
                  photos={activeStripPhotos}
                  photosPerStrip={activeStripPhotoCount}
                />
              </div>

              {/* Template info */}
              <div>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                  <div style={{ fontFamily: 'var(--font-display)', fontSize: 'var(--text-md)', fontWeight: 'var(--font-semibold)', color: 'var(--color-text-primary)', letterSpacing: 'var(--letter-spacing-display, 0.08em)' }}>
                    {currentTemplate.name}
                  </div>
                  {strips.length > 1 && (
                    <span style={{ fontSize: 9, fontFamily: 'var(--font-mono)', color: 'var(--color-brand)', background: 'rgba(109, 6, 38, 0.12)', padding: '1px 6px', borderRadius: 4, fontWeight: 700 }}>
                      STRIP {activeStripIndex + 1}
                    </span>
                  )}
                </div>
                <div style={{ fontFamily: 'var(--font-mono)', fontSize: 10, color: 'var(--color-text-tertiary)', marginTop: 2, textTransform: 'uppercase', letterSpacing: '0.08em' }}>
                  {currentTemplate.category} · {currentTemplate.supportedPhotoCounts.join(', ')} photos
                </div>
              </div>

              {/* Specs */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-2)' }}>
                {[
                  { label: 'Canvas', value: `${currentTemplate.canvas.width}×${currentTemplate.canvas.height}` },
                  { label: 'BG',     value: currentTemplate.background.type },
                  { label: 'Filter', value: currentTemplate.defaultFilter ?? 'none' },
                ].map(({ label, value }) => (
                  <div key={label} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <span style={{ fontFamily: 'var(--font-mono)', fontSize: 10, color: 'var(--color-text-tertiary)', textTransform: 'uppercase', letterSpacing: '0.08em' }}>{label}</span>
                    <span style={{ fontFamily: 'var(--font-mono)', fontSize: 'var(--text-xs)', color: 'var(--color-text-secondary)' }}>{value}</span>
                  </div>
                ))}
              </div>

              <div className="divider" />

              {/* Guide user through sequential styling */}
              {strips.length > 1 && activeStripIndex < strips.length - 1 ? (
                <div style={{ marginTop: 'auto', display: 'flex', flexDirection: 'column', gap: 8 }}>
                  <button
                    className="btn btn-primary btn-lg w-full"
                    onClick={() => setActiveStripIndex(i => i + 1)}
                    style={{
                      letterSpacing: '0.04em',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      gap: 8,
                      boxShadow: 'var(--shadow-bubble-sm)',
                    }}
                  >
                    <span>Next: Choose Look for Strip {activeStripIndex + 2} →</span>
                  </button>
                  <button
                    className="btn btn-ghost w-full"
                    onClick={handleContinue}
                    style={{ fontSize: 12, fontFamily: 'var(--font-mono)', color: 'var(--color-text-tertiary)' }}
                  >
                    Skip to Edit Screen →
                  </button>
                </div>
              ) : strips.length > 1 && activeStripIndex > 0 ? (
                <div style={{ marginTop: 'auto', display: 'flex', flexDirection: 'column', gap: 8 }}>
                  <button
                    className="btn btn-primary btn-lg w-full"
                    onClick={handleContinue}
                    style={{ letterSpacing: '0.04em' }}
                  >
                    All Looks Ready · Continue →
                  </button>
                  <button
                    className="btn btn-ghost w-full"
                    onClick={() => setActiveStripIndex(0)}
                    style={{ fontSize: 12, fontFamily: 'var(--font-mono)', color: 'var(--color-brand)', fontWeight: 600 }}
                  >
                    ← Review Strip 1 Look
                  </button>
                </div>
              ) : (
                <button
                  className="btn btn-primary btn-lg w-full"
                  onClick={handleContinue}
                  style={{ marginTop: 'auto', letterSpacing: '0.04em' }}
                >
                  Use this Look →
                </button>
              )}
            </>
          ) : (
            <div
              className="flex flex-col items-center justify-center h-full"
              style={{ gap: 'var(--space-3)', color: 'var(--color-text-tertiary)', textAlign: 'center' }}
            >
              <div
                style={{
                  width: 28,
                  height: 40,
                  border: '1px solid var(--color-border-subtle)',
                  borderRadius: 'var(--radius-sm)',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: 3,
                  padding: 3,
                }}
              >
                {[1,2,3].map(i => (
                  <div key={i} style={{ flex: 1, background: 'var(--color-border-subtle)', borderRadius: 1 }} />
                ))}
              </div>
              <p style={{ fontFamily: 'var(--font-mono)', fontSize: 10, textTransform: 'uppercase', letterSpacing: '0.08em' }}>
                Pick a look
              </p>
            </div>
          )}
        </div>
      </div>

      <MagicTemplateStudioModal
        isOpen={showMagicStudio}
        onClose={() => setShowMagicStudio(false)}
      />

      <TemplateManagerModal
        isOpen={showTemplateManager}
        onClose={() => setShowTemplateManager(false)}
      />
    </div>
  )
}

// ─── Template Card ────────────────────────────────────────────────────────────

function TemplateCard({
  template,
  isSelected,
  onSelect,
  photosPerStrip,
  photos,
}: {
  template: Template
  isSelected: boolean
  onSelect: () => void
  photosPerStrip: number
  photos: Photo[]
}) {
  const bg = template.background
  let bgStyle: React.CSSProperties = {}

  if (bg.type === 'solid') {
    bgStyle.background = bg.color
  } else if (bg.type === 'gradient' && bg.gradient) {
    const { angle, stops } = bg.gradient
    const stopsStr = stops.map(s => `${s.color} ${s.offset * 100}%`).join(', ')
    bgStyle.background = `linear-gradient(${angle ?? 135}deg, ${stopsStr})`
  } else {
    bgStyle.background = '#6D0626'
  }

  // Template border rendering
  if (template.border && template.border.type !== 'none') {
    bgStyle.border = `${Math.max(1.5, Math.round((template.border.width ?? 3) / 2))}px solid ${template.border.color ?? '#ffffff'}`
  } else {
    bgStyle.border = '1px solid rgba(255, 255, 255, 0.14)'
  }

  const isGrid = template.id.includes('grid')
  const isPolaroid = template.id.includes('polaroid')
  const isParty = template.id.includes('party') || template.category === 'fun'
  const isBirthday = template.id.includes('birthday')

  const headerTexts = template.textElements?.filter(el => el.y < 200) ?? []
  const footerTexts = template.textElements?.filter(el => el.y >= 200) ?? []

  // Standardized photobooth strip proportions based on canvas aspect ratio
  const hasOverlay = Boolean(template.overlayImageUrl && template.photoSlots?.length)
  const canvasAspect = (template.canvas?.height && template.canvas?.width)
    ? (template.canvas.height / template.canvas.width)
    : 3.5 // default 6x21 cm ratio (4200 / 1200)
  const stripW = isGrid ? 212 : 196
  const stripH = Math.round(stripW * canvasAspect)

  const padding = hasOverlay ? 0 : 6
  const gap = 4
  const slotCount = template.photoSlots?.length || template.supportedPhotoCounts?.[0] || photosPerStrip
  const headerH = headerTexts.length > 0 ? 16 : 0
  const footerH = footerTexts.length > 0 ? 24 : 10

  const availableSlotH = isGrid
    ? Math.floor((stripH - padding * 2 - headerH - footerH - gap) / 2)
    : Math.floor((stripH - padding * 2 - headerH - footerH - gap * (slotCount - 1)) / Math.max(1, slotCount))
  const slotH = Math.max(30, availableSlotH)

  const thumbUrl = template.thumbnailUrl || (template.overlayImageUrl ? template.overlayImageUrl.replace('/templates/', '/templates/thumbs/').replace(/\.png$/i, '-thumb.webp') : undefined)

  return (
    <motion.div
      className={`template-card ${isSelected ? 'selected' : ''}`}
      onClick={onSelect}
      whileTap={{ scale: 0.97 }}
      role="radio"
      aria-checked={isSelected}
      tabIndex={0}
      onKeyDown={e => e.key === 'Enter' && onSelect()}
      style={{ position: 'relative' }}
    >
      {/* Slanted badge */}
      {(template.tags?.includes('slanted') || template.photoSlots?.some(s => s.rotation && Math.abs(s.rotation) >= 1.5)) && (
        <div
          style={{
            position: 'absolute',
            top: 6,
            left: 6,
            zIndex: 10,
            fontSize: 8,
            fontFamily: 'var(--font-mono)',
            fontWeight: 800,
            padding: '2px 6px',
            borderRadius: 4,
            background: 'linear-gradient(135deg, #D4AF37, #B8860B)',
            color: '#1a1005',
            letterSpacing: '0.04em',
            pointerEvents: 'none',
            boxShadow: '0 2px 6px rgba(0, 0, 0, 0.4)',
          }}
        >
          ✦ SLANTED
        </div>
      )}

      {/* Shot count badge */}
      <div
        style={{
          position: 'absolute',
          top: 6,
          right: 6,
          zIndex: 10,
          fontSize: 9,
          fontFamily: 'var(--font-mono)',
          fontWeight: 800,
          padding: '2px 6px',
          borderRadius: 4,
          background: 'rgba(0, 0, 0, 0.72)',
          color: '#FAF5EC',
          border: '1px solid rgba(255, 255, 255, 0.18)',
          letterSpacing: '0.04em',
          pointerEvents: 'none',
          backdropFilter: 'blur(2px)',
        }}
      >
        {slotCount} SHOT
      </div>

      {/* Physical Strip Preview with complete template aesthetics */}
      <div
        className="template-card-preview"
        style={{
          ...(hasOverlay ? { background: 'transparent', border: 'none' } : bgStyle),
          width: stripW,
          height: stripH,
          borderRadius: 0, // Natural square photobooth paper print
          display: hasOverlay ? 'block' : 'flex',
          flexDirection: hasOverlay ? undefined : 'column',
          gap: hasOverlay ? undefined : `${gap}px`,
          padding: hasOverlay ? 0 : `${padding}px`,
          position: 'relative',
          overflow: 'hidden',
        }}
      >
        {hasOverlay ? (
          <div style={{ position: 'relative', width: '100%', height: '100%', overflow: 'hidden' }}>
            {template.photoSlots.map((slot, i) => {
              const photo = photos[i]
              const leftPct = (slot.x / template.canvas.width) * 100
              const topPct = (slot.y / template.canvas.height) * 100
              const widthPct = (slot.width / template.canvas.width) * 100
              const heightPct = (slot.height / template.canvas.height) * 100

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
                      loading="lazy"
                      decoding="async"
                      style={{
                        width: '100%',
                        height: '100%',
                        objectFit: 'cover',
                        filter: filterEngine.getCSSFilter(photo.edits),
                      }}
                    />
                  ) : (
                    <div style={{ width: '100%', height: '100%', background: '#2a2a2a' }} />
                  )}
                </div>
              )
            })}
            <img
              src={thumbUrl || template.overlayImageUrl}
              alt=""
              loading="lazy"
              decoding="async"
              style={{
                position: 'absolute',
                top: 0,
                left: 0,
                width: '100%',
                height: '100%',
                objectFit: 'fill',
                pointerEvents: 'none',
                zIndex: 5,
              }}
            />
          </div>
        ) : (
          <>
        {/* Festive Confetti particles for Party / Birthday */}
        {isParty && (
          <div style={{ position: 'absolute', top: 4, right: 6, opacity: 0.9, pointerEvents: 'none' }}>
            <Sparkles size={13} color="#D4AF37" />
          </div>
        )}
        {isParty && (
          <div style={{ position: 'absolute', bottom: 30, left: 6, opacity: 0.9, pointerEvents: 'none' }}>
            <Sparkles size={11} color="#C71B4D" />
          </div>
        )}

        {/* 35mm Film Sprocket Perforations */}
        {template.id.includes('vintage-35mm') && (
          <>
            <div style={{ position: 'absolute', left: 2, top: 4, bottom: 4, width: 4, background: 'repeating-linear-gradient(to bottom, #ffffff 0px, #ffffff 4px, transparent 4px, transparent 10px)', borderRadius: 1, pointerEvents: 'none' }} />
            <div style={{ position: 'absolute', right: 2, top: 4, bottom: 4, width: 4, background: 'repeating-linear-gradient(to bottom, #ffffff 0px, #ffffff 4px, transparent 4px, transparent 10px)', borderRadius: 1, pointerEvents: 'none' }} />
          </>
        )}

        {/* PapIt Film Strip Rails & Sprockets */}
        {template.id.includes('papit') && (
          <>
            <div style={{ position: 'absolute', left: 0, top: 0, bottom: 0, width: 8, background: '#141210', zIndex: 2 }} />
            <div style={{ position: 'absolute', left: 1.5, top: 4, bottom: 4, width: 5, background: 'repeating-linear-gradient(to bottom, #FBF7EE 0px, #FBF7EE 4px, transparent 4px, transparent 10px)', borderRadius: 1, pointerEvents: 'none', zIndex: 3 }} />
            <div style={{ position: 'absolute', right: 0, top: 0, bottom: 0, width: 8, background: '#141210', zIndex: 2 }} />
            <div style={{ position: 'absolute', right: 1.5, top: 4, bottom: 4, width: 5, background: 'repeating-linear-gradient(to bottom, #FBF7EE 0px, #FBF7EE 4px, transparent 4px, transparent 10px)', borderRadius: 1, pointerEvents: 'none', zIndex: 3 }} />
          </>
        )}

        {/* Header text if any */}
        {headerTexts.map(el => (
          <div
            key={el.id}
            style={{
              color: el.color,
              fontSize: template.id.includes('pixel') ? 11 : 9,
              fontFamily: el.fontFamily || 'var(--font-mono)',
              fontWeight: 700,
              textAlign: el.align,
              letterSpacing: '0.06em',
              textTransform: 'uppercase',
              lineHeight: 1.2,
              whiteSpace: 'nowrap',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              padding: '1px 0',
            }}
          >
            {el.defaultText}
          </div>
        ))}

        {/* Photo Slots (2x2 Grid vs Vertical Strip) */}
        {isGrid ? (
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: `${gap}px`, flex: 1 }}>
            {Array.from({ length: 4 }, (_, i) => {
              const photo = photos[i]
              return (
                <div
                  key={i}
                  style={{
                    height: `${slotH}px`,
                    borderRadius: 0,
                    overflow: 'hidden',
                    background: 'rgba(255, 255, 255, 0.08)',
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
                        filter: filterEngine.getCSSFilter(photo.edits),
                      }}
                    />
                  ) : (
                    <div style={{ width: '100%', height: '100%', background: '#222' }} />
                  )}
                </div>
              )
            })}
          </div>
        ) : (
          Array.from({ length: slotCount }, (_, i) => {
            const photo = photos[i]
            const shape = template.photoSlots?.[i]?.shape || 'rectangle'
            const cornerRadius = shape === 'rounded' ? 4 : shape === 'circle' ? '50%' : 0
            const isPixel = template.id.includes('pixel-romance')
            const isCatch = template.id.includes('catch-yours')
            const isCinema = template.id.includes('cinema-ticket')

            return (
              <div
                key={i}
                style={{
                  width: '100%',
                  height: `${slotH}px`,
                  borderRadius: cornerRadius,
                  overflow: 'hidden',
                  background: isCatch ? '#ffffff' : 'rgba(255, 255, 255, 0.08)',
                  flexShrink: 0,
                  position: 'relative',
                  ...(isPixel ? {
                    border: '1.5px solid #c9182b',
                    boxShadow: '0 0 0 1px rgba(201, 24, 43, 0.3)',
                  } : isCinema ? {
                    border: '1.5px solid #8A1C24',
                    background: '#FAF5EC',
                  } : isCatch ? {
                    border: '1px solid rgba(0,0,0,0.1)',
                    padding: '2px 2px 4px 2px',
                    boxShadow: '0 2px 4px rgba(0,0,0,0.12)',
                  } : isPolaroid ? {
                    border: '1px solid rgba(0,0,0,0.08)',
                    boxShadow: '0 2px 4px rgba(0,0,0,0.12)',
                  } : {}),
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
                      filter: filterEngine.getCSSFilter(photo.edits),
                    }}
                  />
                ) : (
                  <div style={{ width: '100%', height: '100%', background: '#222' }} />
                )}
              </div>
            )
          })
        )}

        {/* Footer text / iconic template branding */}
        <div
          style={{
            marginTop: 'auto',
            paddingTop: 4,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            borderTop: '1px solid rgba(255, 255, 255, 0.08)',
            minHeight: 22,
          }}
        >
          {footerTexts.length > 0 ? (
            footerTexts.map(el => (
              <span
                key={el.id}
                style={{
                  color: el.color,
                  fontSize: Math.max(10, Math.min(14, Math.round(el.fontSize / 3.4))),
                  fontFamily: el.fontFamily || 'var(--font-mono)',
                  fontWeight: 800,
                  textAlign: el.align,
                  letterSpacing: '0.06em',
                  whiteSpace: 'nowrap',
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                  maxWidth: '100%',
                  display: 'block',
                  lineHeight: 1.2,
                }}
              >
                {el.defaultText}
              </span>
            ))
          ) : (
            <span
              style={{
                fontFamily: 'var(--font-mono)',
                fontSize: 9,
                color: template.background.type === 'solid' && template.background.color === '#ffffff'
                  ? 'rgba(0, 0, 0, 0.45)'
                  : 'rgba(255, 255, 255, 0.45)',
                letterSpacing: '0.14em',
                textTransform: 'uppercase',
              }}
            >
              ✦ PHOTOBOOTH ✦
            </span>
          )}
        </div>
        </>
        )}
      </div>

      {/* Card Labels */}
      <div style={{ marginTop: 6, textAlign: 'center', width: '100%', padding: '0 2px' }}>
        <div className="template-card-name" title={template.name}>
          {template.name}
        </div>
        <div className="template-card-meta">
          {template.category}
        </div>
        {template.tags && template.tags.length > 0 && (
          <div style={{ display: 'flex', gap: 4, justifyContent: 'center', flexWrap: 'wrap', marginTop: 4 }}>
            {template.tags.slice(0, 2).map(tag => (
              <span
                key={tag}
                style={{
                  fontSize: 9,
                  fontFamily: 'var(--font-mono)',
                  color: 'var(--color-text-tertiary)',
                  background: 'rgba(255, 255, 255, 0.05)',
                  padding: '1px 5px',
                  borderRadius: 3,
                }}
              >
                #{tag}
              </span>
            ))}
          </div>
        )}
      </div>
    </motion.div>
  )
}

// ─── Template Live Preview ────────────────────────────────────────────────────

function TemplateLivePreview({
  template,
  photos,
  photosPerStrip = 3,
}: {
  template: Template
  photos: Photo[]
  photosPerStrip?: number
}) {
  const bg = template.background
  let bgStyle: React.CSSProperties = {}

  if (bg.type === 'solid') bgStyle.background = bg.color
  else if (bg.type === 'gradient' && bg.gradient) {
    const { angle, stops } = bg.gradient
    const stopsStr = stops.map(s => `${s.color} ${s.offset * 100}%`).join(', ')
    bgStyle.background = `linear-gradient(${angle ?? 135}deg, ${stopsStr})`
  } else {
    bgStyle.background = '#6D0626'
  }

  const border = template.border
  if (border && border.type !== 'none') {
    bgStyle.border = `${border.width ?? 2}px solid ${border.color ?? '#ffffff'}`
  }

  if (template.overlayImageUrl && template.photoSlots?.length) {
    const aspect = template.canvas.height / template.canvas.width
    const maxAvailH = typeof window !== 'undefined' ? Math.max(240, window.innerHeight - 380) : 340
    const stripWidth = Math.min(135, Math.max(80, Math.floor(maxAvailH / aspect)))
    const stripHeight = Math.round(stripWidth * aspect)

    return (
      <div
        style={{
          ...(template.overlayImageUrl ? { background: 'transparent' } : bgStyle),
          borderRadius: 0,
          overflow: 'hidden',
          width: stripWidth,
          height: stripHeight,
          flexShrink: 0,
          userSelect: 'none',
          position: 'relative',
          outline: template.overlayImageUrl ? 'none' : '3px solid rgba(8, 8, 6, 0.5)',
          outlineOffset: '1px',
        }}
      >
        {template.photoSlots.map((slot, i) => {
          const photo = photos[i]
          const leftPct = (slot.x / template.canvas.width) * 100
          const topPct = (slot.y / template.canvas.height) * 100
          const widthPct = (slot.width / template.canvas.width) * 100
          const heightPct = (slot.height / template.canvas.height) * 100
          const cssFilter = photo?.edits ? filterEngine.getCSSFilter(photo.edits) : 'none'
          const transform = photo?.edits
            ? `rotate(${photo.edits.rotation || 0}deg) scaleX(${photo.edits.flipH ? -1 : 1}) scaleY(${photo.edits.flipV ? -1 : 1})`
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
          src={template.overlayImageUrl}
          alt=""
          style={{
            position: 'absolute',
            top: 0,
            left: 0,
            width: '100%',
            height: '100%',
            objectFit: 'fill',
            pointerEvents: 'none',
            zIndex: 5,
          }}
        />
      </div>
    )
  }

  const slotCount = template.photoSlots?.length || template.supportedPhotoCounts[0] || photosPerStrip
  const slotRatio =
    slotCount <= 1 ? 1.2 :
    slotCount === 2 ? 0.9 :
    slotCount === 3 ? 0.82 :
    slotCount === 4 ? 0.75 :
    0.65
  const multiplier = slotCount * (slotRatio * 1.4)
  // Responsive strip width calculation to fit inside the Look preview panel with zero scroll
  const maxAvailH = typeof window !== 'undefined' ? Math.max(240, window.innerHeight - 380) : 340
  const fittedInner = Math.max(45, Math.floor((maxAvailH - 50) / multiplier))
  const stripWidth = Math.min(135, Math.max(80, fittedInner + 16))
  const margin = stripWidth < 110 ? 5 : 7
  const gap = stripWidth < 110 ? 3 : 5
  const innerWidth = stripWidth - margin * 2

  const baseSlotHeight = Math.round(innerWidth * slotRatio)
  // Height increased by 40%
  const slotHeight = Math.round(baseSlotHeight * 1.4)

  const headerTexts = template.textElements?.filter(el => el.y < 200) ?? []
  const footerTexts = template.textElements?.filter(el => el.y >= 200) ?? []

  const is35mm = template.id.includes('vintage-35mm')
  const isPixel = template.id.includes('pixel-romance')
  const isCinema = template.id.includes('cinema-ticket')
  const isCatchYours = template.id.includes('catch-yours')
  const isPapit = template.id.includes('papit')

  return (
    <div
      style={{
        ...bgStyle,
        borderRadius: 0, // Natural square photobooth paper print
        overflow: 'hidden',
        width: stripWidth,
        maxHeight: maxAvailH,
        display: 'flex',
        flexDirection: 'column',
        gap,
        padding: is35mm || isPapit ? `${margin}px ${margin + 6}px` : margin,
        flexShrink: 0,
        userSelect: 'none',
        position: 'relative',
        /* Border instead of shadow for depth */
        outline: '3px solid rgba(8, 8, 6, 0.5)',
        outlineOffset: '1px',
      }}
    >
      {/* 35mm Sprocket Perforations */}
      {is35mm && (
        <>
          <div style={{ position: 'absolute', left: 2, top: 4, bottom: 4, width: 4, background: 'repeating-linear-gradient(to bottom, #f0ede6 0px, #f0ede6 4px, transparent 4px, transparent 10px)', borderRadius: 1, pointerEvents: 'none', zIndex: 2 }} />
          <div style={{ position: 'absolute', right: 2, top: 4, bottom: 4, width: 4, background: 'repeating-linear-gradient(to bottom, #f0ede6 0px, #f0ede6 4px, transparent 4px, transparent 10px)', borderRadius: 1, pointerEvents: 'none', zIndex: 2 }} />
        </>
      )}

      {/* PapIt Film Strip Rails & Sprockets */}
      {isPapit && (
        <>
          <div style={{ position: 'absolute', left: 0, top: 0, bottom: 0, width: 8, background: '#141210', zIndex: 2 }} />
          <div style={{ position: 'absolute', left: 1.5, top: 4, bottom: 4, width: 5, background: 'repeating-linear-gradient(to bottom, #FBF7EE 0px, #FBF7EE 4px, transparent 4px, transparent 10px)', borderRadius: 1, pointerEvents: 'none', zIndex: 3 }} />
          <div style={{ position: 'absolute', right: 0, top: 0, bottom: 0, width: 8, background: '#141210', zIndex: 2 }} />
          <div style={{ position: 'absolute', right: 1.5, top: 4, bottom: 4, width: 5, background: 'repeating-linear-gradient(to bottom, #FBF7EE 0px, #FBF7EE 4px, transparent 4px, transparent 10px)', borderRadius: 1, pointerEvents: 'none', zIndex: 3 }} />
        </>
      )}

      {headerTexts.map(el => (
        <div
          key={el.id}
          style={{
            color: el.color,
            fontSize: Math.max(9, Math.round(el.fontSize / 15)),
            fontFamily: el.fontFamily,
            fontWeight: el.fontWeight,
            textAlign: el.align,
            padding: '2px 4px',
            lineHeight: 1.15,
            zIndex: 1,
          }}
        >
          {el.defaultText}
        </div>
      ))}

      {Array.from({ length: slotCount }, (_, i) => {
        const photo       = photos[i]
        const shape       = template.photoSlots?.[i]?.shape || template.photoSlots?.[0]?.shape || 'rectangle'
        const cornerRadius = shape === 'rounded' ? 4 : shape === 'circle' ? '50%' : 0
        const cssFilter   = photo?.edits ? filterEngine.getCSSFilter(photo.edits) : 'none'
        const transform   = photo?.edits
          ? `rotate(${photo.edits.rotation || 0}deg) scaleX(${photo.edits.flipH ? -1 : 1}) scaleY(${photo.edits.flipV ? -1 : 1})`
          : undefined

        return (
          <div
            key={i}
            style={{
              width: '100%',
              height: slotHeight,
              maxHeight: '100%',
              borderRadius: cornerRadius,
              overflow: 'hidden',
              background: isCatchYours ? '#ffffff' : 'rgba(255,255,255,0.08)',
              flexShrink: 1,
              minHeight: 0,
              zIndex: 1,
              ...(isPixel ? {
                border: '1.5px solid #c9182b',
                boxShadow: '0 0 0 1px rgba(201, 24, 43, 0.3)',
              } : isCinema ? {
                border: '1.5px solid #8A1C24',
                background: '#FAF5EC',
              } : isCatchYours ? {
                border: '1px solid rgba(0,0,0,0.1)',
                padding: '2px 2px 4px 2px',
                boxShadow: '0 2px 4px rgba(0,0,0,0.12)',
              } : {}),
            }}
          >
            {photo ? (
              <img
                src={getPhotoUrl(photo.originalUrl || photo.previewUrl || photo.thumbnailUrl)}
                alt=""
                style={{ width: '100%', height: '100%', objectFit: 'cover', filter: cssFilter, transform }}
              />
            ) : (
              <div style={{ width: '100%', height: '100%', background: 'rgba(255,255,255,0.04)' }} />
            )}
          </div>
        )
      })}

      {footerTexts.map(el => (
        <div
          key={el.id}
          style={{
            color: el.color,
            fontSize: Math.max(9, Math.round(el.fontSize / 15)),
            fontFamily: el.fontFamily,
            fontWeight: el.fontWeight,
            textAlign: el.align,
            padding: '2px 4px',
            marginTop: el.id === 'custom-message' ? 'auto' : undefined,
            lineHeight: 1.15,
            zIndex: 1,
          }}
        >
          {el.defaultText}
        </div>
      ))}

      {isPapit && (
        <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', width: '100%', margin: '4px 0 2px 0', zIndex: 2 }}>
          <img src="/papit.png" alt="PapIt" style={{ height: 20, width: 'auto', objectFit: 'contain' }} />
        </div>
      )}

      {footerTexts.length === 0 && (
        <div
          style={{
            marginTop: 'auto',
            paddingTop: 5,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            borderTop: '1px dashed rgba(255, 255, 255, 0.12)',
            zIndex: 1,
          }}
        >
          <span style={{ fontFamily: 'DM Mono, monospace', fontSize: 8, fontWeight: 500, letterSpacing: '0.16em', color: 'rgba(255,255,255,0.5)', textTransform: 'uppercase' }}>
            BOOTH
          </span>
        </div>
      )}
    </div>
  )
}

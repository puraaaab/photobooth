import React, { useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { Ticket, Camera, Sparkles, Check, ArrowRight, SlidersHorizontal } from 'lucide-react'
import { TemplateManagerModal } from '@/components/modals/TemplateManagerModal'

export type DeviceMode = 'ticket' | 'booth' | 'editor'

interface DeviceSelectorScreenProps {
  onSelect: (mode: DeviceMode) => void
}

const MODULES = [
  {
    id: 'ticket' as DeviceMode,
    station: 'Station A',
    IconComponent: Ticket,
    title: 'Ticket Centre',
    subtitle: 'Staff Operator Desk',
    tag: 'QUEUE & PASSES',
    description: 'Issue guest passes, manage digital queue, and monitor booth activity.',
    features: ['Print & issue tickets', 'Live queue dashboard', 'Customer management'],
  },
  {
    id: 'booth' as DeviceMode,
    station: 'Station B',
    IconComponent: Camera,
    title: 'Photo Booth',
    subtitle: 'Raspberry Pi · 5" Screen',
    tag: 'LIVE CAMERA',
    description: 'Guest touch screen: ticket entry, 4-shot countdown, live stream & auto-sync.',
    features: ['Ticket verification', 'Live camera stream', '4 auto-captured shots'],
  },
  {
    id: 'editor' as DeviceMode,
    station: 'Station C',
    IconComponent: Sparkles,
    title: 'Editing Station',
    subtitle: 'Customer Workstation',
    tag: 'CREATIVE SUITE',
    description: 'Guests receive booth shots, pick layouts, customize with stickers & print.',
    features: ['Receive booth photos', 'Filters & cute stickers', 'Layouts & instant print'],
  },
]

export function DeviceSelectorScreen({ onSelect }: DeviceSelectorScreenProps) {
  const [hovered, setHovered] = useState<DeviceMode | null>(null)
  const [selected, setSelected] = useState<DeviceMode | null>(null)
  const [showTemplateManager, setShowTemplateManager] = useState(false)

  const handleSelect = (mode: DeviceMode) => {
    setSelected(mode)
    setTimeout(() => onSelect(mode), 550)
  }

  return (
    <div style={styles.root}>
      {/* Subtle ambient lighting */}
      <div style={styles.ambientGlow} />

      <AnimatePresence>
        {!selected && (
          <motion.div
            style={styles.content}
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.96 }}
            transition={{ duration: 0.25 }}
          >
            {/* Ultra-compact top bar (fits in 800×480 budget) */}
            <header style={styles.header}>
              <div style={styles.wordmarkBadge}>
                <span style={styles.wordmarkDot} />
                <span style={styles.wordmarkBrand}>PAPIT STUDIO</span>
                <span style={styles.wordmarkSep}>•</span>
                <span style={styles.wordmarkSub}>Select Station Role</span>
              </div>

              <div style={styles.headerActions}>
                <motion.button
                  type="button"
                  onClick={() => setShowTemplateManager(true)}
                  style={styles.curateBtn}
                  whileHover={{ scale: 1.04, backgroundColor: 'var(--color-brand-tint, rgba(109, 6, 38, 0.08))' }}
                  whileTap={{ scale: 0.96 }}
                  title="Template Curation & Removal Studio (One-time setup)"
                >
                  <SlidersHorizontal size={11} color="var(--color-brand, #6D0626)" />
                  <span>Curate Templates</span>
                </motion.button>

                <div style={styles.kbdPill}>
                  <span>Switch station later:</span>
                  <kbd style={styles.kbd}>Ctrl+Shift+M</kbd>
                </div>
              </div>
            </header>

            {/* 3 Station Cards */}
            <div style={styles.cards}>
              {MODULES.map((mod, i) => {
                const isHovered = hovered === mod.id
                const Icon = mod.IconComponent

                return (
                  <motion.div
                    key={mod.id}
                    style={{
                      ...styles.card,
                      background: 'var(--color-card, #FFFFFF)',
                      borderColor: isHovered ? 'var(--color-brand)' : 'var(--color-border-default)',
                      boxShadow: isHovered
                        ? 'var(--shadow-bubble, 4px 4px 0px rgba(47, 1, 14, 0.85))'
                        : 'var(--shadow-block-sm, 2px 2px 0px rgba(47, 1, 14, 0.85))',
                    }}
                    initial={{ opacity: 0, y: 16 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: 0.05 + i * 0.05, duration: 0.25 }}
                    onMouseEnter={() => setHovered(mod.id)}
                    onMouseLeave={() => setHovered(null)}
                    onClick={() => handleSelect(mod.id)}
                    whileTap={{ scale: 0.98 }}
                  >
                    {/* Top Row: Station Badge & Tag */}
                    <div style={styles.cardTopRow}>
                      <span style={styles.stationBadge}>
                        {mod.station}
                      </span>
                      <span style={styles.tagBadge}>
                        {mod.tag}
                      </span>
                    </div>

                    {/* Icon & Title */}
                    <div style={styles.iconTitleRow}>
                      <div
                        style={{
                          ...styles.iconWrap,
                          background: isHovered ? 'var(--color-brand)' : 'var(--color-brand-tint)',
                          color: isHovered ? 'var(--color-offwhite)' : 'var(--color-brand)',
                        }}
                      >
                        <Icon size={20} />
                      </div>
                      <div style={{ minWidth: 0 }}>
                        <h2 style={styles.cardTitle}>{mod.title}</h2>
                        <span style={styles.cardSubtitle}>{mod.subtitle}</span>
                      </div>
                    </div>

                    <div style={styles.divider} />

                    {/* Description */}
                    <p style={styles.cardDesc}>{mod.description}</p>

                    {/* Feature List */}
                    <div style={styles.features}>
                      {mod.features.map(f => (
                        <div key={f} style={styles.feature}>
                          <span style={styles.featureIcon}>
                            <Check size={11} />
                          </span>
                          <span>{f}</span>
                        </div>
                      ))}
                    </div>

                    {/* Touch Action Button (always 100% visible) */}
                    <div
                      style={{
                        ...styles.selectBtn,
                        background: isHovered ? 'var(--color-brand)' : 'var(--color-surface)',
                        color: isHovered ? 'var(--color-offwhite)' : 'var(--color-brand)',
                        borderColor: isHovered ? 'rgba(47, 1, 14, 0.5)' : 'var(--color-border-subtle)',
                      }}
                    >
                      <span>{isHovered ? `Launch ${mod.station}` : `Select ${mod.title}`}</span>
                      <ArrowRight size={14} />
                    </div>
                  </motion.div>
                )
              })}
            </div>
          </motion.div>
        )}

        {/* Launching transition */}
        {selected && (
          <motion.div
            key="launching"
            style={styles.launchOverlay}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
          >
            {MODULES.find(m => m.id === selected) && (() => {
              const mod = MODULES.find(m => m.id === selected)!
              const Icon = mod.IconComponent
              return (
                <motion.div
                  style={styles.launchContent}
                  initial={{ scale: 0.9, opacity: 0 }}
                  animate={{ scale: 1, opacity: 1 }}
                  transition={{ type: 'spring', stiffness: 240, damping: 22 }}
                >
                  <div style={styles.launchIconCircle}>
                    <Icon size={36} color="#F7F1EA" />
                  </div>
                  <h2 style={styles.launchTitle}>Starting {mod.title}</h2>
                  <p style={styles.launchSubtitle}>{mod.station} • Loading workstation...</p>
                  <div style={styles.launchBarTrack}>
                    <motion.div
                      style={styles.launchBarFill}
                      initial={{ width: '0%' }}
                      animate={{ width: '100%' }}
                      transition={{ duration: 0.5, ease: 'easeInOut' }}
                    />
                  </div>
                </motion.div>
              )
            })()}
          </motion.div>
        )}
      </AnimatePresence>

      <TemplateManagerModal
        isOpen={showTemplateManager}
        onClose={() => setShowTemplateManager(false)}
      />
    </div>
  )
}

const styles: Record<string, React.CSSProperties> = {
  root: {
    width: '100vw',
    height: '100vh',
    maxHeight: '100vh',
    background: 'var(--color-bg, #F7F1EA)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    fontFamily: 'var(--font-primary)',
    position: 'relative',
    overflow: 'hidden',
    userSelect: 'none',
    padding: '8px 12px',
    boxSizing: 'border-box',
  },
  ambientGlow: {
    position: 'absolute',
    top: '-30%',
    left: '50%',
    transform: 'translateX(-50%)',
    width: '700px',
    height: '350px',
    background: 'radial-gradient(ellipse at center, rgba(109, 6, 38, 0.08) 0%, transparent 70%)',
    pointerEvents: 'none',
  },
  content: {
    display: 'flex',
    flexDirection: 'column',
    width: '100%',
    maxWidth: 784,
    height: '100%',
    maxHeight: 464,
    gap: 8,
    zIndex: 1,
    boxSizing: 'border-box',
  },
  header: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: '4px 6px',
    flexShrink: 0,
    height: 34,
  },
  wordmarkBadge: {
    display: 'inline-flex',
    alignItems: 'center',
    gap: 6,
    padding: '4px 12px',
    borderRadius: 'var(--radius-full)',
    background: 'var(--color-brand-tint)',
    border: '1px solid var(--color-border-subtle)',
    boxShadow: 'var(--shadow-block-sm)',
  },
  wordmarkDot: {
    width: 6,
    height: 6,
    borderRadius: '50%',
    background: 'var(--color-brand)',
  },
  wordmarkBrand: {
    fontFamily: 'var(--font-display)',
    fontSize: 13,
    fontWeight: 800,
    color: 'var(--color-brand)',
    letterSpacing: '0.06em',
  },
  wordmarkSep: {
    color: 'var(--color-border-strong)',
    fontSize: 10,
  },
  wordmarkSub: {
    fontFamily: 'var(--font-mono)',
    fontSize: 11,
    fontWeight: 700,
    color: 'var(--color-brand-mid)',
    letterSpacing: '0.04em',
  },
  headerActions: {
    display: 'flex',
    alignItems: 'center',
    gap: 10,
  },
  curateBtn: {
    display: 'inline-flex',
    alignItems: 'center',
    gap: 5,
    padding: '3px 10px',
    borderRadius: 'var(--radius-full, 9999px)',
    background: 'var(--color-card, #FFFFFF)',
    border: '1px solid var(--color-border-default, rgba(47, 1, 14, 0.2))',
    color: 'var(--color-brand, #6D0626)',
    fontFamily: 'var(--font-mono, monospace)',
    fontSize: 10.5,
    fontWeight: 700,
    letterSpacing: '0.04em',
    textTransform: 'uppercase',
    cursor: 'pointer',
    boxShadow: '1px 1px 0px rgba(47, 1, 14, 0.3)',
  },
  kbdPill: {
    display: 'inline-flex',
    alignItems: 'center',
    gap: 6,
    fontSize: 11,
    color: 'var(--color-text-tertiary)',
    fontFamily: 'var(--font-primary)',
  },
  kbd: {
    background: 'var(--color-card)',
    border: '1px solid var(--color-border-default)',
    borderRadius: 4,
    padding: '2px 6px',
    fontSize: 10,
    fontWeight: 700,
    color: 'var(--color-brand)',
    fontFamily: 'var(--font-mono)',
    boxShadow: '1px 1px 0px rgba(47, 1, 14, 0.4)',
  },
  cards: {
    display: 'grid',
    gridTemplateColumns: 'repeat(3, 1fr)',
    gap: 10,
    width: '100%',
    flex: 1,
    alignItems: 'stretch',
    minHeight: 0,
  },
  card: {
    display: 'flex',
    flexDirection: 'column',
    padding: '12px 14px',
    borderRadius: 'var(--radius-lg, 20px)',
    border: 'var(--border-w-md, 2px) solid',
    cursor: 'pointer',
    transition: 'all 0.15s ease',
    position: 'relative',
    touchAction: 'manipulation',
    boxSizing: 'border-box',
    justifyContent: 'space-between',
  },
  cardTopRow: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 8,
  },
  stationBadge: {
    fontFamily: 'var(--font-mono)',
    fontSize: 10,
    fontWeight: 800,
    color: 'var(--color-brand)',
    background: 'var(--color-brand-tint)',
    padding: '2px 8px',
    borderRadius: 'var(--radius-full)',
    border: '1px solid var(--color-border-subtle)',
    letterSpacing: '0.04em',
  },
  tagBadge: {
    fontFamily: 'var(--font-mono)',
    fontSize: 9,
    fontWeight: 700,
    color: 'var(--color-text-tertiary)',
    letterSpacing: '0.06em',
    textTransform: 'uppercase',
  },
  iconTitleRow: {
    display: 'flex',
    alignItems: 'center',
    gap: 10,
    marginBottom: 8,
  },
  iconWrap: {
    width: 36,
    height: 36,
    borderRadius: 'var(--radius-sm)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
    border: '1px solid var(--color-border-subtle)',
    transition: 'all 0.15s ease',
  },
  cardTitle: {
    fontFamily: 'var(--font-display)',
    fontSize: 17,
    fontWeight: 800,
    color: 'var(--color-text)',
    letterSpacing: '-0.01em',
    margin: 0,
    lineHeight: 1.15,
  },
  cardSubtitle: {
    fontFamily: 'var(--font-mono)',
    fontSize: 10,
    fontWeight: 600,
    color: 'var(--color-text-tertiary)',
    letterSpacing: '0.02em',
    display: 'block',
    marginTop: 1,
  },
  divider: {
    height: 1,
    background: 'var(--color-border-subtle)',
    marginBottom: 8,
  },
  cardDesc: {
    fontFamily: 'var(--font-primary)',
    fontSize: 11.5,
    color: 'var(--color-text-secondary)',
    lineHeight: 1.35,
    margin: '0 0 10px 0',
  },
  features: {
    display: 'flex',
    flexDirection: 'column',
    gap: 5,
    flex: 1,
    marginBottom: 10,
  },
  feature: {
    display: 'flex',
    alignItems: 'center',
    gap: 6,
    fontSize: 11,
    color: 'var(--color-text-primary)',
    fontWeight: 500,
    lineHeight: 1.2,
  },
  featureIcon: {
    width: 15,
    height: 15,
    borderRadius: '50%',
    background: 'rgba(46, 125, 50, 0.12)',
    color: 'var(--color-success)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  selectBtn: {
    height: 38,
    borderRadius: 'var(--radius-full)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    fontSize: 12.5,
    fontWeight: 700,
    fontFamily: 'var(--font-display)',
    letterSpacing: '0.04em',
    border: 'var(--border-w-sm) solid',
    boxShadow: 'var(--shadow-block-sm)',
    transition: 'all 0.15s ease',
    marginTop: 'auto',
  },
  launchOverlay: {
    position: 'fixed',
    inset: 0,
    background: 'rgba(43, 5, 16, 0.94)',
    backdropFilter: 'blur(10px)',
    WebkitBackdropFilter: 'blur(10px)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 100,
  },
  launchContent: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    gap: 10,
    textAlign: 'center',
  },
  launchIconCircle: {
    width: 68,
    height: 68,
    borderRadius: '50%',
    background: 'var(--color-brand)',
    border: '2px solid rgba(247, 241, 234, 0.4)',
    boxShadow: '0 8px 24px rgba(0, 0, 0, 0.4)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 4,
  },
  launchTitle: {
    fontFamily: 'var(--font-display)',
    fontSize: 22,
    fontWeight: 800,
    color: 'var(--color-offwhite)',
    margin: 0,
  },
  launchSubtitle: {
    fontFamily: 'var(--font-mono)',
    fontSize: 12,
    color: 'rgba(247, 241, 234, 0.75)',
    margin: 0,
  },
  launchBarTrack: {
    width: 180,
    height: 5,
    borderRadius: 3,
    background: 'rgba(247, 241, 234, 0.2)',
    overflow: 'hidden',
    marginTop: 8,
  },
  launchBarFill: {
    height: '100%',
    background: 'var(--color-offwhite)',
    borderRadius: 3,
  },
}

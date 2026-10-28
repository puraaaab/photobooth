import React, { useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { Printer, Copy, Check, Minus, Plus, ArrowRight, X, Sparkles } from 'lucide-react'

interface PrintCopiesModalProps {
  isOpen: boolean
  stripCount: number
  initialCopies?: number
  onConfirm: (copies: number) => void
  onClose: () => void
}

export function PrintCopiesModal({
  isOpen,
  stripCount,
  initialCopies = 1,
  onConfirm,
  onClose,
}: PrintCopiesModalProps) {
  const [copies, setCopies] = useState<number>(initialCopies)

  if (!isOpen) return null

  const totalPrints = stripCount * copies

  const presetOptions = [
    {
      count: 1,
      label: 'Single Print',
      sublabel: `${stripCount} strip${stripCount !== 1 ? 's' : ''} total`,
      desc: '1 copy of each strip',
      badge: 'Standard',
    },
    {
      count: 2,
      label: 'Double Print',
      sublabel: `${stripCount * 2} strips total`,
      desc: '2 copies of each strip',
      badge: 'Popular',
      hint: 'One for you, one for a friend!',
    },
    {
      count: 3,
      label: '3 Copies',
      sublabel: `${stripCount * 3} strips total`,
      desc: '3 copies of each strip',
      badge: null,
    },
    {
      count: 4,
      label: '4 Copies',
      sublabel: `${stripCount * 4} strips total`,
      desc: '4 copies of each strip',
      badge: 'Party Pack',
    },
  ]

  const handleSelectPreset = (count: number) => {
    setCopies(count)
  }

  const handleIncrement = () => {
    setCopies(c => Math.min(10, c + 1))
  }

  const handleDecrement = () => {
    setCopies(c => Math.max(1, c - 1))
  }

  return (
    <AnimatePresence>
      <div
        className="modal-overlay"
        style={{
          position: 'fixed',
          inset: 0,
          background: 'rgba(0, 36, 38, 0.85)',
          backdropFilter: 'blur(8px)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: 1100,
          padding: 16,
        }}
        onClick={(e) => {
          if (e.target === e.currentTarget) onClose()
        }}
      >
        <motion.div
          className="modal"
          initial={{ scale: 0.9, opacity: 0, y: 16 }}
          animate={{ scale: 1, opacity: 1, y: 0 }}
          exit={{ scale: 0.9, opacity: 0, y: 16 }}
          transition={{ type: 'spring', stiffness: 380, damping: 28 }}
          style={{
            maxWidth: 520,
            width: '100%',
            background: 'var(--color-surface, #EFE8DE)',
            border: '1px solid var(--color-border-subtle)',
            borderRadius: 'var(--radius-md, 8px)',
            boxShadow: '0 24px 60px rgba(0, 0, 0, 0.6)',
            overflow: 'hidden',
          }}
        >
          {/* Header */}
          <div
            style={{
              padding: '20px 24px 16px',
              borderBottom: '1px solid var(--color-border-subtle)',
              display: 'flex',
              alignItems: 'flex-start',
              justifyContent: 'space-between',
              position: 'relative',
            }}
          >
            <div>
              <div
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: 6,
                  fontSize: 10,
                  fontFamily: 'var(--font-mono, monospace)',
                  letterSpacing: '0.12em',
                  color: 'var(--color-brand)',
                  textTransform: 'uppercase',
                  fontWeight: 700,
                  marginBottom: 6,
                }}
              >
                <Printer size={13} />
                <span>Print Quantity</span>
              </div>
              <h2
                style={{
                  fontFamily: 'var(--font-display, "Bangers", sans-serif)',
                  fontSize: 'clamp(1.5rem, 2.5vw, 1.85rem)',
                  letterSpacing: 'var(--letter-spacing-display, 0.08em)',
                  color: 'var(--color-text)',
                  margin: 0,
                  lineHeight: 1.1,
                }}
              >
                How Many Copies?
              </h2>
              <p
                style={{
                  fontSize: 12,
                  color: 'var(--color-text-secondary)',
                  margin: '6px 0 0',
                  lineHeight: 1.4,
                }}
              >
                You have <strong style={{ color: 'var(--color-brand)' }}>{stripCount} strip{stripCount !== 1 ? 's' : ''}</strong> ready.
                Choose single print or multiple copies of those strips.
              </p>
            </div>

            <button
              onClick={onClose}
              style={{
                background: 'rgba(109, 6, 38, 0.08)',
                border: 'none',
                borderRadius: '50%',
                width: 32,
                height: 32,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                cursor: 'pointer',
                color: 'var(--color-text-secondary)',
                transition: 'background 0.15s ease',
              }}
              title="Close"
            >
              <X size={16} />
            </button>
          </div>

          {/* Content */}
          <div style={{ padding: '20px 24px', display: 'flex', flexDirection: 'column', gap: 14 }}>
            {/* Presets Grid */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 10 }}>
              {presetOptions.map((opt) => {
                const isSelected = copies === opt.count
                return (
                  <motion.div
                    key={opt.count}
                    whileHover={{ scale: 1.02 }}
                    whileTap={{ scale: 0.98 }}
                    onClick={() => handleSelectPreset(opt.count)}
                    style={{
                      background: isSelected
                        ? 'var(--color-brand)'
                        : 'var(--color-card, #FFFFFF)',
                      border: isSelected
                        ? '2px solid var(--color-brand)'
                        : '1px solid var(--color-border-subtle)',
                      borderRadius: 6,
                      padding: '12px 14px',
                      cursor: 'pointer',
                      position: 'relative',
                      display: 'flex',
                      flexDirection: 'column',
                      gap: 4,
                      transition: 'all 0.15s ease',
                      boxShadow: isSelected ? '0 4px 16px rgba(109, 6, 38, 0.3)' : 'none',
                    }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                      <span
                        style={{
                          fontSize: 13,
                          fontWeight: 700,
                          fontFamily: 'var(--font-mono, monospace)',
                          color: isSelected ? 'var(--color-offwhite)' : 'var(--color-text)',
                        }}
                      >
                        {opt.label}
                      </span>
                      {opt.badge && (
                        <span
                          style={{
                            fontSize: 9,
                            fontFamily: 'var(--font-mono, monospace)',
                            fontWeight: 700,
                            letterSpacing: '0.06em',
                            textTransform: 'uppercase',
                            padding: '2px 6px',
                            borderRadius: 4,
                            background: isSelected ? 'var(--color-offwhite)' : 'rgba(109, 6, 38, 0.12)',
                            color: 'var(--color-brand)',
                          }}
                        >
                          {opt.badge}
                        </span>
                      )}
                    </div>

                    <div
                      style={{
                        fontSize: 11,
                        color: isSelected ? 'rgba(247, 241, 234, 0.9)' : 'var(--color-text-secondary)',
                        lineHeight: 1.3,
                      }}
                    >
                      {opt.desc}
                    </div>

                    <div
                      style={{
                        marginTop: 4,
                        fontSize: 10,
                        fontFamily: 'var(--font-mono, monospace)',
                        fontWeight: 600,
                        color: isSelected ? 'var(--color-offwhite)' : 'var(--color-brand)',
                      }}
                    >
                      → {opt.sublabel}
                    </div>

                    {opt.hint && (
                      <div
                        style={{
                          fontSize: 9,
                          fontStyle: 'italic',
                          color: isSelected ? 'rgba(247, 241, 234, 0.75)' : 'var(--color-text-muted)',
                          marginTop: 2,
                        }}
                      >
                        {opt.hint}
                      </div>
                    )}
                  </motion.div>
                )
              })}
            </div>

            {/* Custom counter stepper */}
            <div
              style={{
                background: 'var(--color-card, #FFFFFF)',
                border: '1px solid var(--color-border-subtle)',
                borderRadius: 6,
                padding: '10px 14px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
              }}
            >
              <div>
                <span
                  style={{
                    fontSize: 11,
                    fontFamily: 'var(--font-mono, monospace)',
                    fontWeight: 600,
                    color: 'var(--color-text)',
                    textTransform: 'uppercase',
                    display: 'block',
                  }}
                >
                  Custom Copies
                </span>
                <span style={{ fontSize: 10, color: 'var(--color-text-secondary)' }}>
                  Need more than 4 sets? (up to 10)
                </span>
              </div>

              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <button
                  type="button"
                  onClick={handleDecrement}
                  disabled={copies <= 1}
                  style={{
                    width: 32,
                    height: 32,
                    borderRadius: 4,
                    border: '1px solid var(--color-border-default)',
                    background: 'var(--color-surface, #EFE8DE)',
                    color: copies <= 1 ? 'var(--color-text-disabled)' : 'var(--color-text)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    cursor: copies <= 1 ? 'not-allowed' : 'pointer',
                  }}
                >
                  <Minus size={14} />
                </button>

                <div
                  style={{
                    minWidth: 32,
                    textAlign: 'center',
                    fontFamily: 'var(--font-mono, monospace)',
                    fontSize: 16,
                    fontWeight: 800,
                    color: 'var(--color-brand)',
                  }}
                >
                  {copies}
                </div>

                <button
                  type="button"
                  onClick={handleIncrement}
                  disabled={copies >= 10}
                  style={{
                    width: 32,
                    height: 32,
                    borderRadius: 4,
                    border: '1px solid var(--color-border-default)',
                    background: 'var(--color-surface, #EFE8DE)',
                    color: copies >= 10 ? 'var(--color-text-disabled)' : 'var(--color-text)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    cursor: copies >= 10 ? 'not-allowed' : 'pointer',
                  }}
                >
                  <Plus size={14} />
                </button>
              </div>
            </div>

            {/* Dynamic summary indicator */}
            <div
              style={{
                background: 'rgba(109, 6, 38, 0.08)',
                border: '1px dashed var(--color-brand)',
                borderRadius: 6,
                padding: '10px 14px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <Sparkles size={16} color="var(--color-brand)" />
                <span style={{ fontSize: 11, color: 'var(--color-text)' }}>
                  Total output:{' '}
                  <strong style={{ color: 'var(--color-brand)', fontWeight: 700 }}>
                    {copies} {copies === 1 ? 'copy' : 'copies'}
                  </strong>{' '}
                  of {stripCount} strip{stripCount !== 1 ? 's' : ''}
                </span>
              </div>
              <span
                style={{
                  fontFamily: 'var(--font-mono, monospace)',
                  fontSize: 12,
                  fontWeight: 700,
                  color: 'var(--color-offwhite)',
                  background: 'var(--color-brand)',
                  padding: '2px 8px',
                  borderRadius: 4,
                }}
              >
                {totalPrints} STRIP{totalPrints !== 1 ? 'S' : ''} TOTAL
              </span>
            </div>
          </div>

          {/* Footer */}
          <div
            style={{
              padding: '16px 24px',
              borderTop: '1px solid var(--color-border-subtle)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'flex-end',
              gap: 12,
              background: 'var(--color-bg, #F7F1EA)',
            }}
          >
            <button
              type="button"
              className="btn btn-secondary"
              onClick={onClose}
              style={{
                fontSize: 12,
                fontFamily: 'var(--font-mono, monospace)',
                padding: '8px 16px',
              }}
            >
              Back to Preview
            </button>

            <button
              type="button"
              className="btn btn-primary"
              onClick={() => onConfirm(copies)}
              style={{
                fontSize: 12,
                fontFamily: 'var(--font-mono, monospace)',
                fontWeight: 700,
                letterSpacing: '0.04em',
                padding: '10px 20px',
                display: 'inline-flex',
                alignItems: 'center',
                gap: 8,
              }}
            >
              <span>CONTINUE WITH {totalPrints} STRIP{totalPrints !== 1 ? 'S' : ''} ({copies} {copies === 1 ? 'COPY' : 'COPIES'})</span>
              <ArrowRight size={14} />
            </button>
          </div>
        </motion.div>
      </div>
    </AnimatePresence>
  )
}

import React from 'react'
import { useHistoryStore } from '@/store/historyStore'
import { callUndoHandler, callRedoHandler } from '@/store/historyStore'
import type { AppStep } from '@/constants/steps'
import { STEPS } from '@/constants/steps'

interface AppFooterProps {
  step: AppStep
  stepIndex: number
  totalSteps: number
  onBack: () => void
  onNext: () => void
  canGoBack: boolean
  canGoNext: boolean
}

export function AppFooter({
  step,
  stepIndex,
  totalSteps,
  onBack,
  onNext,
  canGoBack,
  canGoNext,
}: AppFooterProps) {
  const { canUndo, canRedo, undo, redo, getLastDescription, getNextDescription } = useHistoryStore()

  const isExport = step === 'export'

  return (
    <footer className="app-footer">
      {/* Left: Undo/Redo + step counter */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-3)' }}>
        <button
          className="btn btn-ghost btn-icon"
          onClick={callUndoHandler}
          disabled={!canUndo()}
          title={`Undo: ${getLastDescription() ?? ''}`}
          aria-label={`Undo: ${getLastDescription() ?? 'nothing to undo'}`}
          style={{ width: 44, height: 44, borderRadius: 'var(--radius-sm)' }}
        >
          {/* Custom minimal undo icon */}
          <svg width="18" height="18" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M2 5h6a4 4 0 0 1 0 8H5" />
            <path d="M2 5L4.5 2.5M2 5L4.5 7.5" />
          </svg>
        </button>
        <button
          className="btn btn-ghost btn-icon"
          onClick={callRedoHandler}
          disabled={!canRedo()}
          title={`Redo: ${getNextDescription() ?? ''}`}
          aria-label={`Redo: ${getNextDescription() ?? 'nothing to redo'}`}
          style={{ width: 44, height: 44, borderRadius: 'var(--radius-sm)' }}
        >
          {/* Custom minimal redo icon */}
          <svg width="18" height="18" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M12 5H6a4 4 0 0 0 0 8h3" />
            <path d="M12 5L9.5 2.5M12 5L9.5 7.5" />
          </svg>
        </button>

        {/* Step counter — mono, legible, high-contrast on wine footer */}
        <span
          style={{
            fontFamily: 'var(--font-mono)',
            fontSize: '13px',
            fontWeight: 700,
            color: 'rgba(247, 241, 234, 0.85)',
            letterSpacing: '0.08em',
            paddingLeft: 'var(--space-2)',
            display: 'flex',
            alignItems: 'center',
            gap: 4,
          }}
        >
          <span style={{ color: 'var(--color-offwhite)', fontWeight: 800 }}>{stepIndex}</span>
          <span style={{ opacity: 0.5 }}>/</span>
          <span style={{ opacity: 0.7 }}>{totalSteps}</span>
        </span>
      </div>

      {/* Center: strip progress */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }} aria-hidden="true">
        {Array.from({ length: totalSteps }, (_, i) => {
          const isActive = i + 1 === stepIndex
          const isPast   = i + 1 < stepIndex
          return (
            <div
              key={i}
              style={{
                width: isActive ? 28 : 8,
                height: 6,
                borderRadius: 3,
                background: isActive
                  ? 'var(--color-offwhite)'
                  : isPast
                  ? 'rgba(247, 241, 234, 0.55)'
                  : 'rgba(247, 241, 234, 0.18)',
                boxShadow: isActive ? '0 0 10px rgba(255, 255, 255, 0.4)' : 'none',
                transition: 'all var(--transition-fast)',
              }}
            />
          )
        })}
      </div>

      {/* Right: navigation */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-3)' }}>
        {canGoBack && (
          <button
            className="btn btn-secondary"
            onClick={onBack}
            style={{
              letterSpacing: '0.04em',
              minHeight: 46,
              padding: '10px 22px',
              fontSize: 13,
              fontWeight: 700,
              fontFamily: 'var(--font-primary)',
              touchAction: 'manipulation',
            }}
          >
            ← BACK
          </button>
        )}

        {!isExport && canGoNext && (
          <button
            className="btn btn-primary btn-expressive"
            onClick={onNext}
            style={{
              letterSpacing: '0.05em',
              minHeight: 46,
              padding: '10px 26px',
              fontSize: 14,
              fontWeight: 800,
              fontFamily: 'var(--font-display)',
              touchAction: 'manipulation',
            }}
          >
            NEXT →
          </button>
        )}
      </div>
    </footer>
  )
}

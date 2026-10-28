import React, { useRef } from 'react'
import { RotateCcw, Ticket as TicketIcon, Check } from 'lucide-react'
import { useConnectionStore } from '@/store/connectionStore'
import { useSessionStore } from '@/store/sessionStore'
import { STEPS, type AppStep } from '@/constants/steps'

interface AppHeaderProps {
  step: AppStep
  stepIndex: number
  onStepClick: (step: AppStep) => void
  onOpenAdmin?: () => void
  onStartOver?: () => void
}

const STEP_LABELS: Record<AppStep, string> = {
  waiting:  'Start',
  capture:  'Capture',
  select:   'Shots',
  layout:   'Layout',
  template: 'Look',
  editor:   'Edit',
  preview:  'Preview',
  export:   'Print',
}

export function AppHeader({ step, stepIndex, onStepClick, onOpenAdmin, onStartOver }: AppHeaderProps) {
  const { pi, socket } = useConnectionStore()
  const { autosaveStatus, session } = useSessionStore()

  // Discrete Kiosk Admin Gestures: 5 taps in 3s OR hold 4s on the wordmark
  const tapCountRef = useRef(0)
  const tapTimerRef = useRef<NodeJS.Timeout | null>(null)
  const holdTimerRef = useRef<NodeJS.Timeout | null>(null)

  const handleWordmarkTouchStart = () => {
    holdTimerRef.current = setTimeout(() => {
      onOpenAdmin?.()
    }, 4000)
  }

  const handleWordmarkTouchEnd = () => {
    if (holdTimerRef.current) {
      clearTimeout(holdTimerRef.current)
      holdTimerRef.current = null
    }

    tapCountRef.current++
    if (tapCountRef.current === 1) {
      tapTimerRef.current = setTimeout(() => {
        tapCountRef.current = 0
      }, 3000)
    } else if (tapCountRef.current >= 5) {
      tapCountRef.current = 0
      if (tapTimerRef.current) clearTimeout(tapTimerRef.current)
      onOpenAdmin?.()
    }
  }

  const handleStartOverClick = () => {
    if (window.confirm('Are you sure you want to cancel and start over for a new guest?')) {
      onStartOver?.()
    }
  }

  return (
    <header className="app-header">
      {/* Secret Gesture Wordmark */}
      <div
        className="app-wordmark"
        onClick={handleWordmarkTouchEnd}
        onTouchStart={handleWordmarkTouchStart}
        onTouchEnd={handleWordmarkTouchEnd}
        title="PAPIT Studio Photobooth Kiosk"
        style={{ cursor: 'default', userSelect: 'none', gap: '8px' }}
      >
        <span className="app-wordmark-dot" />
        <span>PAPIT</span>
        <span style={{ opacity: 0.6, fontSize: '0.85em', fontWeight: 600 }}>STUDIO</span>
      </div>

      {/* Workflow Navigation */}
      <nav className="workflow-nav" role="navigation" aria-label="Workflow steps">
        {STEPS.slice(1).map((s, i) => {
          const absIdx = i + 1
          const isActive    = s.id === step
          const isCompleted = absIdx < stepIndex
          const isClickable = absIdx <= stepIndex
          const state = isCompleted ? 'completed' : isActive ? 'active' : 'inactive'

          return (
            <React.Fragment key={s.id}>
              {i > 0 && <span className="workflow-nav-sep" aria-hidden="true" />}
              <button
                className={`workflow-nav-item ${state}`}
                onClick={() => isClickable && onStepClick(s.id)}
                disabled={!isClickable}
                aria-current={isActive ? 'step' : undefined}
                aria-label={`${STEP_LABELS[s.id] || s.label}${isCompleted ? ' (completed)' : isActive ? ' (current)' : ''}`}
              >
                <span className="wf-label">{STEP_LABELS[s.id] || s.label}</span>
              </button>
            </React.Fragment>
          )
        })}
      </nav>

      {/* Right: status + reset */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-4, 16px)' }}>
        {/* Active Ticket Badge */}
        {session?.ticketCode && (
          <div
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: 6,
              background: 'rgba(247, 241, 234, 0.18)',
              border: '1px solid rgba(247, 241, 234, 0.35)',
              padding: '4px 12px',
              borderRadius: 'var(--radius-full)',
              fontSize: 13,
              fontFamily: 'var(--font-mono)',
              color: 'var(--color-offwhite)',
              letterSpacing: '0.06em',
              fontWeight: 700,
            }}
          >
            <TicketIcon size={12} color="var(--color-offwhite)" />
            <span>TICKET #{session.ticketCode}</span>
            {session.customerName && (
              <span style={{ color: 'rgba(247, 241, 234, 0.85)', fontWeight: 500 }}>
                • {session.customerName}
              </span>
            )}
          </div>
        )}

        {/* Autosave indicator */}
        <div className="autosave-indicator" aria-live="polite">
          {autosaveStatus === 'saving' && (
            <>
              <div
                className="animate-spin"
                style={{
                  width: 10,
                  height: 10,
                  border: '1.5px solid var(--color-text-disabled, #444)',
                  borderTopColor: 'transparent',
                  borderRadius: '50%',
                }}
              />
              saving
            </>
          )}
          {autosaveStatus === 'saved' && (
            <>
              <Check size={12} color="var(--color-success, #34d399)" />
              saved
            </>
          )}
        </div>

        {/* Status indicators */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <div className="pi-status" title={pi.connected ? `Camera connected: ${pi.ipAddress || 'LAN'}` : 'Camera standby'}>
            <div
              className={`pi-status-dot ${pi.connected ? (pi.lastPhotoAt ? 'receiving' : 'connected') : 'disconnected'}`}
            />
          </div>

          <div
            style={{
              width: 6,
              height: 6,
              borderRadius: '50%',
              background: socket.connected ? '#34d399' : '#eab308',
            }}
            title={socket.connected ? 'Server live' : 'Server offline'}
          />
        </div>

        {/* Start Over Button */}
        {step !== 'waiting' && onStartOver && (
          <button
            onClick={handleStartOverClick}
            className="btn btn-ghost btn-sm"
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 5,
              fontSize: 11,
              fontFamily: 'var(--font-mono)',
              color: 'var(--color-text-secondary)',
              padding: '4px 10px',
              borderRadius: 'var(--radius-full)',
              border: '1px solid var(--color-border-subtle)',
            }}
            title="Start Over"
            aria-label="Start over for next guest"
          >
            <RotateCcw size={12} />
            <span>Start Over</span>
          </button>
        )}
      </div>
    </header>
  )
}

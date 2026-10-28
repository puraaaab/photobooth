import React, { useEffect, useState, useRef, useCallback } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { AlertCircle, RotateCcw } from 'lucide-react'
import { useSettingsStore } from '@/store/settingsStore'

interface IdleTimeoutManagerProps {
  currentStep: string
  onReset: () => void
}

export const IdleTimeoutManager: React.FC<IdleTimeoutManagerProps> = ({
  currentStep,
  onReset,
}) => {
  const { settings } = useSettingsStore()
  const { enabled, idleTimeoutSeconds, autoResetAfterExport, autoResetDelaySeconds } = settings.kiosk

  const [showWarning, setShowWarning] = useState(false)
  const [warningCountdown, setWarningCountdown] = useState(15)
  const [exportCountdown, setExportCountdown] = useState<number | null>(null)

  const lastActivityRef = useRef<number>(Date.now())
  const timerRef = useRef<NodeJS.Timeout | null>(null)
  const countdownTimerRef = useRef<NodeJS.Timeout | null>(null)

  // Reset activity timestamp
  const recordActivity = useCallback(() => {
    lastActivityRef.current = Date.now()
    if (showWarning) {
      setShowWarning(false)
      setWarningCountdown(15)
    }
  }, [showWarning])

  // Attach global interaction listeners
  useEffect(() => {
    if (!enabled || currentStep === 'waiting') return

    const handleEvent = () => recordActivity()

    window.addEventListener('pointerdown', handleEvent, { passive: true })
    window.addEventListener('mousemove', handleEvent, { passive: true })
    window.addEventListener('keydown', handleEvent, { passive: true })
    window.addEventListener('touchstart', handleEvent, { passive: true })

    return () => {
      window.removeEventListener('pointerdown', handleEvent)
      window.removeEventListener('mousemove', handleEvent)
      window.removeEventListener('keydown', handleEvent)
      window.removeEventListener('touchstart', handleEvent)
    }
  }, [enabled, currentStep, recordActivity])

  // General idle timeout monitor
  useEffect(() => {
    if (!enabled || currentStep === 'waiting' || currentStep === 'export') {
      setShowWarning(false)
      if (timerRef.current) clearInterval(timerRef.current)
      return
    }

    lastActivityRef.current = Date.now()

    timerRef.current = setInterval(() => {
      const elapsed = Math.floor((Date.now() - lastActivityRef.current) / 1000)
      const warningThreshold = Math.max(10, idleTimeoutSeconds - 15)

      if (elapsed >= idleTimeoutSeconds) {
        // Timed out completely
        setShowWarning(false)
        onReset()
      } else if (elapsed >= warningThreshold) {
        setShowWarning(true)
        setWarningCountdown(idleTimeoutSeconds - elapsed)
      } else {
        setShowWarning(false)
      }
    }, 1000)

    return () => {
      if (timerRef.current) clearInterval(timerRef.current)
    }
  }, [enabled, currentStep, idleTimeoutSeconds, onReset])

  // Auto-reset when on export screen (Disabled per user request to allow unlimited time on print/export tab)
  useEffect(() => {
    setExportCountdown(null)
    if (countdownTimerRef.current) {
      clearInterval(countdownTimerRef.current)
      countdownTimerRef.current = null
    }
  }, [currentStep])

  return (
    <>
      {/* Export Auto-Reset Banner */}
      {currentStep === 'export' && exportCountdown !== null && (
        <div
          style={{
            position: 'fixed',
            bottom: '24px',
            right: '24px',
            zIndex: 900,
            background: 'rgba(26, 26, 36, 0.95)',
            border: '1px solid var(--color-border)',
            borderRadius: 'var(--radius-lg)',
            padding: '12px 20px',
            display: 'flex',
            alignItems: 'center',
            gap: '12px',
            boxShadow: 'var(--shadow-lg)',
            backdropFilter: 'blur(12px)',
          }}
        >
          <div
            style={{
              width: '28px',
              height: '28px',
              borderRadius: '50%',
              background: 'var(--color-primary-glow)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontWeight: 700,
              fontSize: '13px',
              color: 'var(--color-primary-light)',
            }}
          >
            {exportCountdown}
          </div>
          <span style={{ fontSize: '13px', color: 'var(--color-text-secondary)' }}>
            Auto-resetting for next guest in {exportCountdown}s
          </span>
          <button
            className="btn btn-ghost btn-sm"
            onClick={() => setExportCountdown(null)}
            style={{ fontSize: '12px' }}
          >
            Cancel
          </button>
        </div>
      )}

      {/* Inactivity Warning Modal */}
      <AnimatePresence>
        {showWarning && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            style={{
              position: 'fixed',
              inset: 0,
              zIndex: 10000,
              background: 'rgba(10, 10, 15, 0.85)',
              backdropFilter: 'blur(8px)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              padding: '24px',
            }}
          >
            <motion.div
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.9, opacity: 0 }}
              style={{
                background: 'var(--color-surface)',
                border: '1px solid var(--color-warning)',
                borderRadius: 'var(--radius-xl)',
                padding: '36px',
                maxWidth: '480px',
                width: '100%',
                textAlign: 'center',
                boxShadow: '0 0 50px rgba(245, 158, 11, 0.3)',
              }}
            >
              <div
                style={{
                  width: '64px',
                  height: '64px',
                  borderRadius: '50%',
                  background: 'rgba(245, 158, 11, 0.15)',
                  color: 'var(--color-warning)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  margin: '0 auto 20px',
                }}
              >
                <AlertCircle size={36} />
              </div>

              <h2 style={{ fontSize: '22px', fontWeight: 700, marginBottom: '8px' }}>
                Are you still there?
              </h2>

              <p style={{ color: 'var(--color-text-secondary)', marginBottom: '24px', fontSize: '15px' }}>
                Your session will automatically reset to protect your privacy in
              </p>

              <div
                style={{
                  fontSize: '48px',
                  fontWeight: 800,
                  color: 'var(--color-warning)',
                  marginBottom: '28px',
                  fontVariantNumeric: 'tabular-nums',
                }}
              >
                {warningCountdown}s
              </div>

              <div style={{ display: 'flex', gap: '12px' }}>
                <button
                  className="btn btn-secondary flex-1"
                  onClick={onReset}
                  style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px' }}
                >
                  <RotateCcw size={16} />
                  Reset Now
                </button>

                <button
                  className="btn btn-primary flex-1"
                  onClick={recordActivity}
                  style={{
                    boxShadow: '0 0 20px var(--color-primary-glow)',
                    fontWeight: 700,
                  }}
                >
                  I'm Still Here!
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  )
}

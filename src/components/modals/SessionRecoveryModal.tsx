import React from 'react'
import { motion } from 'framer-motion'
import { RefreshCw, Plus, FolderOpen } from 'lucide-react'

interface SessionRecoveryModalProps {
  sessionId: string
  photoCount: number
  onResume: () => void
  onStartNew: () => void
}

export function SessionRecoveryModal({
  sessionId,
  photoCount,
  onResume,
  onStartNew,
}: SessionRecoveryModalProps) {
  return (
    <div className="modal-overlay" style={{ zIndex: 1000 }}>
      <motion.div
        className="modal"
        initial={{ scale: 0.85, opacity: 0, y: 20 }}
        animate={{ scale: 1, opacity: 1, y: 0 }}
        exit={{ scale: 0.85, opacity: 0, y: 20 }}
        transition={{ type: 'spring', stiffness: 350, damping: 30 }}
        style={{ maxWidth: 480 }}
      >
        <div className="modal-header">
          <h2 className="modal-title">Previous Session Found</h2>
        </div>
        
        <div className="modal-body">
          <div
            style={{
              background: 'var(--color-bg-elevated)',
              borderRadius: 'var(--radius-lg)',
              padding: 'var(--space-5)',
              marginBottom: 'var(--space-6)',
              display: 'flex',
              flexDirection: 'column',
              gap: 'var(--space-2)',
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span style={{ fontSize: 'var(--text-sm)', color: 'var(--color-text-secondary)' }}>
                Session ID
              </span>
              <code style={{ fontSize: 'var(--text-xs)', color: 'var(--color-primary-light)' }}>
                {sessionId.slice(0, 30)}...
              </code>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span style={{ fontSize: 'var(--text-sm)', color: 'var(--color-text-secondary)' }}>
                Photos
              </span>
              <span style={{ fontSize: 'var(--text-base)', fontWeight: 'var(--font-bold)', color: 'var(--color-text-primary)' }}>
                {photoCount}
              </span>
            </div>
          </div>

          <p style={{ fontSize: 'var(--text-sm)', color: 'var(--color-text-secondary)', lineHeight: 1.6 }}>
            A previous editing session was found. Would you like to resume where you left off, or start a fresh new session?
          </p>
        </div>

        <div className="modal-footer" style={{ gap: 'var(--space-3)' }}>
          <button className="btn btn-secondary" onClick={onStartNew}>
            <Plus size={16} />
            Start New
          </button>
          <button className="btn btn-primary" onClick={onResume}>
            <RefreshCw size={16} />
            Resume Session
          </button>
        </div>
      </motion.div>
    </div>
  )
}

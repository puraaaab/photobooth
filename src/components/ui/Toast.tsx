import React, { createContext, useContext, useState, useCallback } from 'react'
import { motion, AnimatePresence } from 'framer-motion'

type ToastType = 'success' | 'warning' | 'error' | 'info'

interface Toast {
  id: string
  type: ToastType
  message: string
  duration?: number
}

interface ToastContextValue {
  toast: (message: string, type?: ToastType, duration?: number) => void
}

const ToastContext = createContext<ToastContextValue>({
  toast: () => {},
})

export function useToast() {
  return useContext(ToastContext)
}

// Minimal inline dot indicator instead of lucide icons
const TOAST_DOTS: Record<ToastType, string> = {
  success: 'var(--color-success)',
  warning: 'var(--color-warning)',
  error:   'var(--color-danger)',
  info:    'var(--color-accent)',
}

function ToastItem({ t, onRemove }: { t: Toast; onRemove: () => void }) {
  return (
    <motion.div
      className={`toast toast-${t.type}`}
      initial={{ opacity: 0, y: -8, scale: 0.96 }}
      animate={{ opacity: 1, y: 0,  scale: 1 }}
      exit={{ opacity: 0, y: -4, scale: 0.96 }}
      transition={{ duration: 0.16, ease: 'easeOut' }}
      onClick={onRemove}
      style={{ cursor: 'pointer' }}
      role="status"
      aria-live="polite"
    >
      <div
        style={{
          width: 5,
          height: 5,
          borderRadius: '50%',
          background: TOAST_DOTS[t.type],
          flexShrink: 0,
        }}
      />
      <span style={{ fontSize: 'var(--text-sm)', color: 'var(--color-text-primary)' }}>
        {t.message}
      </span>
    </motion.div>
  )
}

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([])

  const toast = useCallback((message: string, type: ToastType = 'info', duration = 2500) => {
    const id = Math.random().toString(36).slice(2)
    setToasts(prev => [...prev, { id, type, message, duration }])
    if (duration > 0) {
      setTimeout(() => setToasts(prev => prev.filter(t => t.id !== id)), duration)
    }
  }, [])

  const remove = useCallback((id: string) => {
    setToasts(prev => prev.filter(t => t.id !== id))
  }, [])

  return (
    <ToastContext.Provider value={{ toast }}>
      {children}
      <div className="toast-container">
        <AnimatePresence>
          {toasts.map(t => (
            <ToastItem key={t.id} t={t} onRemove={() => remove(t.id)} />
          ))}
        </AnimatePresence>
      </div>
    </ToastContext.Provider>
  )
}

// Standalone container (for use without provider wrapping)
let globalToast: ((message: string, type?: ToastType, duration?: number) => void) | null = null

export function ToastContainer() {
  const [toasts, setToasts] = useState<Toast[]>([])

  globalToast = useCallback((message: string, type: ToastType = 'info', duration = 2500) => {
    const id = Math.random().toString(36).slice(2)
    setToasts(prev => [...prev, { id, type, message, duration }])
    if (duration > 0) {
      setTimeout(() => setToasts(prev => prev.filter(t => t.id !== id)), duration)
    }
  }, [])

  const remove = useCallback((id: string) => {
    setToasts(prev => prev.filter(t => t.id !== id))
  }, [])

  return (
    <div className="toast-container">
      <AnimatePresence>
        {toasts.map(t => (
          <ToastItem key={t.id} t={t} onRemove={() => remove(t.id)} />
        ))}
      </AnimatePresence>
    </div>
  )
}

export function showToast(message: string, type: ToastType = 'info', duration = 2500) {
  globalToast?.(message, type, duration)
}

import React, { useState } from 'react'
import { motion } from 'framer-motion'
import { Phone, Delete, Send, X, CheckCircle, AlertCircle } from 'lucide-react'

interface PhonePadModalProps {
  isOpen: boolean
  onClose: () => void
  onSend: (phoneNumber: string) => Promise<boolean>
}

export function PhonePadModal({ isOpen, onClose, onSend }: PhonePadModalProps) {
  const [phoneNumber, setPhoneNumber] = useState('+1')
  const [sending, setSending] = useState(false)
  const [status, setStatus] = useState<'idle' | 'success' | 'error'>('idle')
  const [errorMessage, setErrorMessage] = useState('')

  if (!isOpen) return null

  const handleDigit = (digit: string) => {
    if (status !== 'idle') setStatus('idle')
    if (phoneNumber.length < 18) {
      setPhoneNumber(prev => prev + digit)
    }
  }

  const handleBackspace = () => {
    if (status !== 'idle') setStatus('idle')
    setPhoneNumber(prev => {
      if (prev.length <= 1) return ''
      return prev.slice(0, -1)
    })
  }

  const handleClear = () => {
    if (status !== 'idle') setStatus('idle')
    setPhoneNumber('+1')
  }

  const handleSend = async () => {
    const cleaned = phoneNumber.replace(/[^0-9+]/g, '')
    if (cleaned.length < 10) {
      setStatus('error')
      setErrorMessage('Please enter a valid phone number (at least 10 digits)')
      return
    }

    setSending(true)
    setStatus('idle')
    try {
      const ok = await onSend(cleaned)
      if (ok) {
        setStatus('success')
        setTimeout(() => {
          onClose()
          setStatus('idle')
          setPhoneNumber('+1')
        }, 1800)
      } else {
        setStatus('error')
        setErrorMessage('Failed to send SMS. Spooled for offline delivery.')
      }
    } catch (err: unknown) {
      const error = err as Error
      setStatus('error')
      setErrorMessage(error.message || 'Error sending SMS')
    } finally {
      setSending(false)
    }
  }

  const padKeys = ['1', '2', '3', '4', '5', '6', '7', '8', '9', '+', '0']

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        backgroundColor: 'rgba(0, 0, 0, 0.75)',
        backdropFilter: 'blur(10px)',
        WebkitBackdropFilter: 'blur(10px)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 9999,
        padding: 24,
      }}
      onClick={onClose}
    >
      <motion.div
        initial={{ scale: 0.92, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        exit={{ scale: 0.92, opacity: 0 }}
        onClick={e => e.stopPropagation()}
        style={{
          width: '100%',
          maxWidth: 420,
          background: 'var(--color-bg, #F7F1EA)',
          border: '2px solid var(--color-brand)',
          borderRadius: 'var(--radius-2xl)',
          padding: 28,
          boxShadow: '0 24px 64px rgba(43, 5, 16, 0.4)',
          display: 'flex',
          flexDirection: 'column',
          gap: 20,
        }}
      >
        {/* Header */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <div
              style={{
                width: 36,
                height: 36,
                borderRadius: '50%',
                background: 'rgba(109, 6, 38, 0.1)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              <Phone size={18} color="var(--color-brand)" />
            </div>
            <h3
              style={{
                fontFamily: 'var(--font-display)',
                fontSize: 18,
                fontWeight: 700,
                color: 'var(--color-brand)',
              }}
            >
              Text My Photos
            </h3>
          </div>
          <button
            onClick={onClose}
            className="btn btn-ghost"
            style={{ borderRadius: '50%', width: 44, height: 44, padding: 0 }}
            aria-label="Close phone keypad"
          >
            <X size={18} />
          </button>
        </div>

        {/* Display Field */}
        <div
          style={{
            background: '#ffffff',
            border: '2px solid var(--color-border-default)',
            borderRadius: 'var(--radius-lg)',
            padding: '16px 20px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            minHeight: 64,
          }}
        >
          <span
            style={{
              fontFamily: 'var(--font-mono)',
              fontSize: 26,
              fontWeight: 700,
              letterSpacing: '0.08em',
              color: phoneNumber ? 'var(--color-brand)' : 'var(--color-text-tertiary)',
            }}
          >
            {phoneNumber || 'Enter number'}
          </span>
          {phoneNumber && (
            <button
              onClick={handleBackspace}
              style={{
                background: 'transparent',
                border: 'none',
                color: 'var(--color-text-secondary)',
                cursor: 'pointer',
                padding: 6,
                minWidth: 44,
                minHeight: 44,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
              }}
              aria-label="Backspace"
            >
              <Delete size={20} />
            </button>
          )}
        </div>

        {/* Status / Error Alert */}
        {status === 'error' && (
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 8,
              background: 'rgba(180, 40, 40, 0.2)',
              border: '1px solid rgba(255, 100, 100, 0.4)',
              borderRadius: 'var(--radius-md)',
              padding: '10px 14px',
              color: '#ffbbbb',
              fontSize: 12,
              fontFamily: 'var(--font-body)',
            }}
          >
            <AlertCircle size={16} />
            <span>{errorMessage}</span>
          </div>
        )}

        {status === 'success' && (
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 8,
              background: 'rgba(40, 160, 60, 0.2)',
              border: '1px solid rgba(100, 255, 120, 0.4)',
              borderRadius: 'var(--radius-md)',
              padding: '10px 14px',
              color: '#aaffbb',
              fontSize: 13,
              fontFamily: 'var(--font-body)',
            }}
          >
            <CheckCircle size={16} />
            <span>SMS sent successfully! Check your phone.</span>
          </div>
        )}

        {/* Touch Numeric Keypad (48px+ touch targets) */}
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(3, 1fr)',
            gap: 10,
          }}
        >
          {padKeys.map(key => (
            <button
              key={key}
              onClick={() => handleDigit(key)}
              style={{
                height: 56,
                borderRadius: 'var(--radius-lg)',
                background: 'var(--color-surface, #EFE8DE)',
                border: '1.5px solid var(--color-border-default)',
                color: 'var(--color-text-primary)',
                fontFamily: 'var(--font-mono)',
                fontSize: 22,
                fontWeight: 600,
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                transition: 'all 0.15s ease',
              }}
              onMouseDown={e => (e.currentTarget.style.transform = 'scale(0.96)')}
              onMouseUp={e => (e.currentTarget.style.transform = 'scale(1)')}
            >
              {key}
            </button>
          ))}
          {/* Backspace Key */}
          <button
            onClick={handleBackspace}
            style={{
              height: 56,
              borderRadius: 'var(--radius-lg)',
              background: 'var(--color-surface, #EFE8DE)',
              border: '1.5px solid var(--color-border-default)',
              color: 'var(--color-brand)',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}
            aria-label="Backspace"
          >
            <Delete size={20} />
          </button>
        </div>

        {/* Bottom Actions */}
        <div style={{ display: 'flex', gap: 10 }}>
          <button
            onClick={handleClear}
            className="btn btn-secondary"
            style={{
              borderRadius: 'var(--radius-full)',
              height: 50,
              flex: 1,
              fontFamily: 'var(--font-mono)',
              fontSize: 12,
              letterSpacing: '0.06em',
            }}
          >
            CLEAR
          </button>
          <button
            onClick={handleSend}
            disabled={sending || status === 'success'}
            className="btn btn-primary"
            style={{
              borderRadius: 'var(--radius-full)',
              height: 50,
              flex: 2,
              fontFamily: 'var(--font-mono)',
              fontSize: 13,
              letterSpacing: '0.08em',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: 8,
            }}
          >
            <Send size={16} />
            <span>{sending ? 'SENDING...' : 'SEND SMS'}</span>
          </button>
        </div>
      </motion.div>
    </div>
  )
}

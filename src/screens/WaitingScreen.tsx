import React, { useState, useEffect, useCallback } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import {
  Sparkles,
  Copy,
  Check,
  ArrowRight,
  Cpu,
  Ticket as TicketIcon,
  CheckCircle2,
  AlertCircle,
  Delete,
  ShieldCheck,
  Camera,
} from 'lucide-react'
import { useSessionStore } from '@/store/sessionStore'
import { useConnectionStore } from '@/store/connectionStore'
import { useSettingsStore } from '@/store/settingsStore'
import { useQueueStore } from '@/store/queueStore'
import { unlockAudioContext } from '@/utils/audio'
import type { Ticket } from '@/types'

const SERVER_BASE = typeof window !== 'undefined' && window.location.hostname
  ? `http://${window.location.hostname}:3847`
  : 'http://localhost:3847'

export interface WaitingScreenProps {
  appMode?: string
  onStartCapture: () => void
  onPhotosReady: () => void
  onDemoMode: () => void
  onOpenAdmin?: () => void
  onOpenQueueManager?: () => void
}

export function WaitingScreen({
  appMode,
  onStartCapture,
  onPhotosReady,
  onDemoMode,
  onOpenAdmin,
  onOpenQueueManager,
}: WaitingScreenProps) {
  const { session, createSession, addPhoto, loadSession } = useSessionStore()
  const { pi, server } = useConnectionStore()
  const { settings } = useSettingsStore()

  const [sessionInfo, setSessionInfo] = useState<{ id: string; token: string; address: string } | null>(null)
  const [copied, setCopied] = useState(false)
  const [demoRunning, setDemoRunning] = useState(false)
  const [demoProgress, setDemoProgress] = useState(0)
  const [consentAccepted, setConsentAccepted] = useState(false)
  const [consentError, setConsentError] = useState(false)

  // ─── Ticket & Digital Queue State ──────────────────────────────────────────
  const [ticketCode, setTicketCode] = useState('')
  const [claimedTicket, setClaimedTicket] = useState<Ticket | null>(null)
  const [ticketError, setTicketError] = useState<string | null>(null)
  const [isVerifying, setIsVerifying] = useState(false)
  const [isShaking, setIsShaking] = useState(false)

  const isQueueMode = settings.kiosk.queueModeEnabled !== false
  const photoCount = session?.photos.length ?? 0
  const isConsentRequired = !!settings.kiosk.privacyConsentEnabled

  // Initialize session
  const initSession = useCallback(async () => {
    if (session) {
      setSessionInfo({ id: session.id, token: '', address: server.address || 'localhost' })
      return
    }
    try {
      const { sessionId, sessionToken } = await createSession()
      const address = (window.electronAPI?.server
        ? await window.electronAPI.server.getAddress()
        : server.address) || window.location.hostname || 'localhost'
      setSessionInfo({ id: sessionId, token: sessionToken, address })
    } catch (err) {
      console.error('[Waiting] Failed to create session:', err)
    }
  }, [session, createSession, server.address])

  useEffect(() => {
    initSession()
  }, [])

  const isEditorMode = appMode === 'editor' || (typeof window !== 'undefined' && (
    localStorage.getItem('photobooth_device_mode') === 'editor' ||
    new URLSearchParams(window.location.search).get('view') === 'editor'
  ))

  // ─── Ticket Verification & Claim ───────────────────────────────────────────
  const verifyTicketCode = useCallback(async (codeToVerify?: string) => {
    const raw = (codeToVerify || ticketCode).replace(/^#/, '').trim()
    if (!raw || raw.length < 4 || !/^\d{4}$/.test(raw)) {
      setTicketError('Please enter a valid 4-digit numeric ticket code.')
      setIsShaking(true)
      setTimeout(() => setIsShaking(false), 500)
      return
    }

    setIsVerifying(true)
    setTicketError(null)

    // Query/claim ticket on server WITHOUT sending a blank session ID
    const res = await useQueueStore.getState().claimTicket(raw)
    setIsVerifying(false)

    if (res.success && res.ticket) {
      setClaimedTicket(res.ticket)

      // If the ticket has an existing photoshoot session, load it directly!
      let photosFound = false
      if (res.ticket.sessionId) {
        await loadSession(res.ticket.sessionId)
        const loaded = useSessionStore.getState().session
        if (loaded && loaded.photos && loaded.photos.length > 0) {
          photosFound = true
          useSessionStore.setState({
            session: {
              ...loaded,
              ticketId: res.ticket.id,
              ticketCode: res.ticket.code,
              customerName: res.ticket.customerName,
              customerPhone: res.ticket.customerPhone,
            },
          })
          // Auto-advance to editing station immediately!
          onPhotosReady()
          return
        }
      }

      // Check if ticket photos exist in the vault
      try {
        const vaultRes = await fetch(`${SERVER_BASE}/api/tickets/${raw}`)
        if (vaultRes.ok) {
          const vData = await vaultRes.json()
          if (vData.ticket?.sessionId && vData.ticket.sessionId !== res.ticket.sessionId) {
            await loadSession(vData.ticket.sessionId)
            const loaded = useSessionStore.getState().session
            if (loaded && loaded.photos && loaded.photos.length > 0) {
              photosFound = true
              onPhotosReady()
              return
            }
          }
        }
      } catch {}

      // If we are in Editing Station mode and no photos are found:
      if (!photosFound && isEditorMode) {
        setTicketError(`⚠️ Ticket #${raw} does not have photos yet. Please visit the Photobooth to take photos first!`)
        setIsShaking(true)
        setTimeout(() => setIsShaking(false), 600)
        return
      }
    } else {
      setTicketError(res.error || 'Ticket not found or already completed.')
      setIsShaking(true)
      setTimeout(() => setIsShaking(false), 500)
    }
  }, [ticketCode, loadSession, onPhotosReady, isEditorMode])

  const handleKeypadPress = useCallback((digit: string) => {
    setTicketCode(prev => {
      if (prev.length < 4) {
        const next = prev + digit
        setTicketError(null)
        if (next.length === 4) {
          verifyTicketCode(next)
        }
        return next
      }
      return prev
    })
  }, [verifyTicketCode])

  const handleKeypadBackspace = useCallback(() => {
    setTicketCode(prev => prev.slice(0, -1))
    setTicketError(null)
  }, [])

  const handleKeypadClear = useCallback(() => {
    setTicketCode('')
    setTicketError(null)
    setClaimedTicket(null)
  }, [])

  const handleWalkInPass = useCallback(async () => {
    setIsVerifying(true)
    try {
      const newTicket = await useQueueStore.getState().issueTicket({ customerName: 'Walk-in Guest' })
      setTicketCode(newTicket.code)
      await verifyTicketCode(newTicket.code)
    } catch {
      setTicketError('Walk-in passes are sold at the ticket desk. Please ask staff.')
    } finally {
      setIsVerifying(false)
    }
  }, [verifyTicketCode])

  // Edge Case 4: AudioContext unlock on first touch gesture
  const handleStartInteraction = useCallback(async () => {
    if (isConsentRequired && !consentAccepted) {
      setConsentError(true)
      return
    }

    // In queue mode, require verified ticket before proceeding
    if (isQueueMode && !claimedTicket) {
      setTicketError('Please enter your 4-digit ticket code to begin!')
      return
    }

    try {
      await unlockAudioContext()
    } catch (e) {
      console.warn('[Audio] First gesture unlock failed:', e)
    }

    // If ticket or session already has photos (from Booth Pi), go straight to editing workflow!
    const currentSession = useSessionStore.getState().session
    if (currentSession && currentSession.photos && currentSession.photos.length > 0) {
      onPhotosReady()
      return
    }

    // In Editing Station mode, NEVER open the photobooth capture screen
    if (isEditorMode) {
      setTicketError('⚠️ Please complete your photoshoot in the Photobooth first before editing!')
      setIsShaking(true)
      setTimeout(() => setIsShaking(false), 500)
      return
    }

    // Camera source switch logic (Edge Case 1) - Only for standalone kiosk
    if (settings.kiosk.cameraSource === 'demo') {
      runDemo()
    } else {
      // Both 'webcam' and 'pi_network' trigger the CaptureScreen workflow
      onStartCapture()
    }
  }, [isConsentRequired, consentAccepted, isQueueMode, claimedTicket, isEditorMode, settings.kiosk.cameraSource, onStartCapture, onPhotosReady])

  // Global hardware triggers & keyboard entry
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // In queue mode and not yet claimed: capture numeric keys
      if (isQueueMode && !claimedTicket) {
        if (/^[0-9]$/.test(e.key)) {
          e.preventDefault()
          handleKeypadPress(e.key)
          return
        }
        if (e.key === 'Backspace') {
          e.preventDefault()
          handleKeypadBackspace()
          return
        }
        if (e.key === 'Enter') {
          e.preventDefault()
          verifyTicketCode()
          return
        }
      }

      if (e.code === 'Space' || e.key === 'Enter') {
        if (!demoRunning) {
          if (isQueueMode && !claimedTicket) return
          handleStartInteraction()
        }
      }
    }

    const unsub = window.electronAPI?.hardware?.onTrigger?.(() => {
      if (!demoRunning) {
        if (isQueueMode && !claimedTicket) return
        handleStartInteraction()
      }
    })

    window.addEventListener('keydown', handleKeyDown)
    return () => {
      window.removeEventListener('keydown', handleKeyDown)
      if (typeof unsub === 'function') unsub()
    }
  }, [demoRunning, isQueueMode, claimedTicket, handleKeypadPress, handleKeypadBackspace, verifyTicketCode, handleStartInteraction])

  const copyConnectionInfo = useCallback(() => {
    if (!sessionInfo) return
    const text = `http://${sessionInfo.address}:3847`
    navigator.clipboard.writeText(text).then(() => {
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    })
  }, [sessionInfo])

  // Demo mode: synthesize incoming Pi photos for offline testing
  const runDemo = useCallback(async () => {
    if (demoRunning) return
    setDemoRunning(true)
    setDemoProgress(0)

    let curSession = session
    if (!curSession) {
      try {
        const { sessionId } = await createSession()
        curSession = useSessionStore.getState().session
      } catch (err) {
        console.error('[Demo] Failed to create session:', err)
      }
    }

    const demoFiles = [
      { url: '/demo-photos/1.jpg', format: 'jpeg', name: 'demo-1.jpg' },
      { url: '/demo-photos/2.jpg', format: 'jpeg', name: 'demo-2.jpg' },
      { url: '/demo-photos/3.jpg', format: 'jpeg', name: 'demo-3.jpg' },
      { url: '/demo-photos/4.avif', format: 'avif', name: 'demo-4.avif' },
      { url: '/demo-photos/5.webp', format: 'webp', name: 'demo-5.webp' },
      { url: '/demo-photos/6.jpeg', format: 'jpeg', name: 'demo-6.jpeg' },
      { url: '/demo-photos/7.jpeg', format: 'jpeg', name: 'demo-7.jpeg' },
      { url: '/demo-photos/8.webp', format: 'webp', name: 'demo-8.webp' },
      { url: '/demo-photos/9.jpeg', format: 'jpeg', name: 'demo-9.jpeg' },
      { url: '/demo-photos/10.webp', format: 'webp', name: 'demo-10.webp' },
      { url: '/demo-photos/11.jpg', format: 'jpeg', name: 'demo-11.jpg' },
      { url: '/demo-photos/12.jpg', format: 'jpeg', name: 'demo-12.jpg' },
      { url: '/demo-photos/13.jpg', format: 'jpeg', name: 'demo-13.jpg' },
      { url: '/demo-photos/14.jpg', format: 'jpeg', name: 'demo-14.jpg' },
    ]

    const targetSessionId = curSession?.id || useSessionStore.getState().session?.id || 'demo'

    for (let i = 0; i < demoFiles.length; i++) {
      const demo = demoFiles[i]
      addPhoto({
        id: `demo-${i + 1}-${Date.now()}`,
        sessionId: targetSessionId,
        originalPath: demo.url,
        originalUrl: demo.url,
        thumbnailPath: demo.url,
        previewPath: demo.url,
        thumbnailUrl: demo.url,
        previewUrl: demo.url,
        metadata: {
          width: 800,
          height: 1067,
          format: demo.format,
          size: 102400,
          originalName: demo.name,
        },
        edits: {
          filter: 'original',
          filterIntensity: 100,
          crop: { x: 0, y: 0, width: 1, height: 1 },
          rotation: 0,
          flipH: false,
          flipV: false,
          brightness: 0,
          contrast: 0,
          saturation: 0,
          exposure: 0,
          temperature: 0,
          tint: 0,
          highlights: 0,
          shadows: 0,
          sharpness: 0,
          blur: 0,
          grain: 0,
          vignette: 0,
          fade: 0,
        },
        isFavorite: false,
        uploadedAt: new Date().toISOString(),
      })
      setDemoProgress(Math.round(((i + 1) / demoFiles.length) * 100))
      await new Promise(r => setTimeout(r, 45))
    }

    useSessionStore.getState().save()
    setDemoRunning(false)
    onPhotosReady()
  }, [session, createSession, onPhotosReady, addPhoto, settings])

  return (
    <div
      className="waiting-screen-shell"
      style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        minHeight: '100%',
        gap: 'var(--space-6)',
        padding: 'var(--space-8)',
        background: 'var(--color-bg, #F7F1EA)',
        position: 'relative',
        overflow: 'hidden',
      }}
    >
      {/* Decorative ambient studio lighting */}
      <div
        style={{
          position: 'absolute',
          top: '-15%',
          left: '50%',
          transform: 'translateX(-50%)',
          width: '800px',
          height: '420px',
          background: 'radial-gradient(ellipse at center, rgba(109, 6, 38, 0.08) 0%, transparent 70%)',
          pointerEvents: 'none',
        }}
      />

      {/* Main Title & Subtitle */}
      <motion.div
        className="waiting-screen-hero"
        initial={{ opacity: 0, y: -16 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4 }}
        style={{ textAlign: 'center', zIndex: 1, maxWidth: 640 }}
      >
        <div
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: 8,
            padding: '4px 14px',
            borderRadius: 'var(--radius-full)',
            background: 'var(--color-brand-tint)',
            border: '1px solid var(--color-border-subtle)',
            boxShadow: 'var(--shadow-block-sm)',
            marginBottom: 8,
            width: 'fit-content',
          }}
        >
          <span style={{ width: 7, height: 7, borderRadius: '50%', background: 'var(--color-brand)' }} />
          <span style={{ fontSize: 12, fontFamily: 'var(--font-mono)', fontWeight: 700, color: 'var(--color-brand)', letterSpacing: '0.08em' }}>
            {settings.kiosk.eventName || 'PAPIT PHOTOBOOTH • STUDIO'}
          </span>
        </div>

        <h1
          style={{
            fontFamily: 'var(--font-display)',
            fontSize: 'clamp(2.0rem, 4.2vw, 3.0rem)',
            fontWeight: 800,
            color: 'var(--color-text)',
            letterSpacing: '-0.02em',
            margin: '0 0 6px',
            lineHeight: 1.15,
          }}
        >
          {settings.kiosk.eventName ? 'Ready to Create Your Print' : 'Welcome to the Studio'}
        </h1>

        <p
          style={{
            fontFamily: 'var(--font-primary)',
            fontSize: '0.95rem',
            color: 'var(--color-text-secondary)',
            margin: 0,
            lineHeight: 1.45,
          }}
        >
          Enter your 4-digit ticket code from the attendant or photo booth to customize your photos
        </p>

        {/* Walk in pass in hero for compact mode */}
        {settings.kiosk.allowWalkIn !== false && !claimedTicket && (
          <button
            type="button"
            onClick={handleWalkInPass}
            disabled={isVerifying}
            style={{
              background: 'none',
              border: 'none',
              color: 'var(--color-brand)',
              fontFamily: 'var(--font-primary)',
              fontSize: 12.5,
              fontWeight: 700,
              cursor: 'pointer',
              marginTop: 6,
              textDecoration: 'underline',
              textUnderlineOffset: 3,
              textAlign: 'inherit',
              padding: 0,
            }}
          >
            No ticket yet? Tap for instant walk-in pass →
          </button>
        )}

        {/* Footer controls & shortcuts */}
        <div
          className="waiting-screen-footer-actions"
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 10,
            flexWrap: 'wrap',
            justifyContent: 'center',
            marginTop: 14,
            zIndex: 1,
          }}
        >
          {/* Station A button */}
          {onOpenQueueManager && (
            <button
              onClick={onOpenQueueManager}
              className="btn btn-secondary btn-sm"
              style={{
                fontFamily: 'var(--font-primary)',
                fontSize: 12,
                fontWeight: 700,
                display: 'flex',
                alignItems: 'center',
                gap: 6,
                borderRadius: 'var(--radius-full)',
                padding: '6px 14px',
              }}
            >
              <TicketIcon size={13} color="var(--color-brand)" />
              <span>Station A: Ticket Desk</span>
            </button>
          )}

          {/* Demo roll button */}
          <button
            onClick={runDemo}
            disabled={demoRunning}
            className="btn btn-secondary btn-sm"
            style={{
              fontFamily: 'var(--font-primary)',
              fontSize: 12,
              fontWeight: 700,
              display: 'flex',
              alignItems: 'center',
              gap: 6,
              borderRadius: 'var(--radius-full)',
              padding: '6px 14px',
            }}
          >
            <Sparkles size={13} color="var(--color-brand)" />
            <span>{demoRunning ? `Loading (${demoProgress}%)` : 'Quick Demo Roll'}</span>
          </button>

          {/* Session config copy button */}
          {sessionInfo?.token && (
            <button
              onClick={copyConnectionInfo}
              className="btn btn-secondary btn-sm"
              style={{
                fontFamily: 'var(--font-mono)',
                fontSize: 11,
                fontWeight: 600,
                display: 'flex',
                alignItems: 'center',
                gap: 5,
                borderRadius: 'var(--radius-full)',
                padding: '6px 12px',
              }}
            >
              {copied ? <Check size={12} color="var(--color-success)" /> : <Copy size={12} />}
              <span>{copied ? 'Copied' : `Session ${sessionInfo.id.slice(0, 8)}…`}</span>
            </button>
          )}
        </div>
      </motion.div>

      {/* ─── Ticket Keypad Card (Queue Mode) ─── */}
      {isQueueMode ? (
        <motion.div
          className="waiting-screen-card"
          initial={{ opacity: 0, scale: 0.96 }}
          animate={isShaking ? { x: [-12, 12, -8, 8, -4, 4, 0] } : { opacity: 1, scale: 1 }}
          transition={{ duration: isShaking ? 0.4 : 0.35 }}
          style={{
            zIndex: 2,
            width: '100%',
            maxWidth: 440,
            background: 'var(--color-card, #FFFFFF)',
            border: claimedTicket
              ? '2px solid var(--color-success)'
              : ticketError
                ? '2px solid var(--color-danger)'
                : 'var(--border-w-md) solid var(--color-border-default)',
            borderRadius: 'var(--radius-xl)',
            padding: '20px 24px',
            boxShadow: claimedTicket
              ? '0 8px 28px rgba(46, 125, 50, 0.18), var(--shadow-block)'
              : 'var(--shadow-bubble)',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            gap: 14,
            transition: 'all 0.25s ease',
          }}
        >
          {/* Header */}
          {!claimedTicket ? (
            <div style={{ textAlign: 'center' }}>
              <div
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: 6,
                  color: 'var(--color-brand)',
                  fontFamily: 'var(--font-mono)',
                  fontSize: 12,
                  letterSpacing: '0.08em',
                  fontWeight: 800,
                  textTransform: 'uppercase',
                  marginBottom: 6,
                }}
              >
                <TicketIcon size={14} />
                <span>Enter 4-Digit Ticket Code</span>
              </div>
              <p style={{ fontSize: 13, color: 'var(--color-text-tertiary)', margin: 0, fontFamily: 'var(--font-primary)' }}>
                Enter the code from your printed receipt or booth session
              </p>
            </div>
          ) : (
            <div style={{ textAlign: 'center' }}>
              <div
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: 6,
                  color: 'var(--color-success)',
                  fontFamily: 'var(--font-mono)',
                  fontSize: 13,
                  letterSpacing: '0.08em',
                  textTransform: 'uppercase',
                  fontWeight: 800,
                  marginBottom: 4,
                }}
              >
                <CheckCircle2 size={16} />
                <span>Ticket #{claimedTicket.code} Verified</span>
              </div>
              <h3 style={{ fontFamily: 'var(--font-display)', fontSize: 26, fontWeight: 800, color: 'var(--color-text)', margin: '4px 0 2px' }}>
                Welcome, {claimedTicket.customerName || 'Guest'}!
              </h3>
              <p style={{ fontFamily: 'var(--font-primary)', fontSize: 14, color: 'var(--color-text-secondary)', margin: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6 }}>
                {(session?.photos?.length ?? 0) > 0 ? (
                  <>
                    <Camera size={15} color="var(--color-brand)" />
                    <span>{session?.photos.length} photos ready from the booth • Let's style them!</span>
                  </>
                ) : (
                  <span>Ticket confirmed • Ready for photoshoot</span>
                )}
              </p>
              {claimedTicket.paymentMethod && (
                <div
                  style={{
                    marginTop: 6,
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: 6,
                    fontSize: 11,
                    fontFamily: 'var(--font-mono)',
                    fontWeight: 700,
                    background: claimedTicket.paymentStatus === 'PAID' ? 'rgba(22, 163, 74, 0.1)' : 'rgba(180, 83, 9, 0.1)',
                    color: claimedTicket.paymentStatus === 'PAID' ? '#16a34a' : '#b45309',
                    padding: '3px 12px',
                    borderRadius: 'var(--radius-full)',
                  }}
                >
                  <span>₹{claimedTicket.paymentAmount ?? claimedTicket.planType ?? 99}/- {claimedTicket.paymentMethod} • {claimedTicket.paymentStatus === 'PAID' ? 'PAID & VERIFIED' : 'CASH DUE'}</span>
                </div>
              )}
              {claimedTicket.paymentMethod === 'CASH' && claimedTicket.paymentStatus !== 'PAID' && (
                <div
                  style={{
                    marginTop: 8,
                    padding: '8px 12px',
                    borderRadius: 'var(--radius-md)',
                    background: 'rgba(217, 119, 6, 0.12)',
                    border: '1.5px solid #d97706',
                    color: '#b45309',
                    fontSize: 11.5,
                    fontFamily: 'var(--font-mono)',
                    fontWeight: 700,
                    display: 'flex',
                    alignItems: 'center',
                    gap: 6,
                    textAlign: 'left',
                  }}
                >
                  <AlertCircle size={15} style={{ flexShrink: 0 }} />
                  <span>⚠️ Cash Payment of ₹{claimedTicket.paymentAmount ?? claimedTicket.planType ?? 99} is pending at counter. Please collect payment before handover!</span>
                </div>
              )}
            </div>
          )}

          {/* 4-Digit Display Slots */}
          {!claimedTicket && (
            <>
              <div style={{ display: 'flex', gap: 10, justifyContent: 'center' }}>
                {[0, 1, 2, 3].map(idx => {
                  const char = ticketCode[idx] || ''
                  const isCurrent = ticketCode.length === idx
                  return (
                    <div
                      key={idx}
                      className="slot-box"
                      style={{
                        width: 54,
                        height: 60,
                        borderRadius: 'var(--radius-md)',
                        background: char ? 'var(--color-brand)' : 'var(--color-surface)',
                        border: isCurrent
                          ? '2px solid var(--color-brand)'
                          : char
                            ? '2px solid var(--color-brand)'
                            : '1.5px solid var(--color-border-default)',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        fontFamily: 'var(--font-mono)',
                        fontSize: 30,
                        fontWeight: 800,
                        color: char ? '#F7F1EA' : 'transparent',
                        boxShadow: isCurrent ? '0 0 12px rgba(109, 6, 38, 0.25)' : 'none',
                        transition: 'all 0.15s ease',
                      }}
                    >
                      {char || (isCurrent ? <span style={{ color: 'var(--color-brand)', opacity: 0.6 }}>_</span> : '')}
                    </div>
                  )
                })}
              </div>

              {/* Error readout */}
              {ticketError && (
                <div style={{ display: 'flex', alignItems: 'center', gap: 6, color: 'var(--color-danger)', fontSize: 12, fontFamily: 'var(--font-primary)', fontWeight: 600, textAlign: 'center' }}>
                  <AlertCircle size={14} style={{ flexShrink: 0 }} />
                  <span>{ticketError}</span>
                </div>
              )}

              {/* Touch Keypad */}
              <div
                className="keypad-grid"
                style={{
                  display: 'grid',
                  gridTemplateColumns: 'repeat(3, 1fr)',
                  gap: 8,
                  width: '100%',
                  maxWidth: 320,
                  marginTop: 2,
                }}
              >
                {['1', '2', '3', '4', '5', '6', '7', '8', '9'].map(num => (
                  <button
                    key={num}
                    type="button"
                    className="keypad-btn"
                    onClick={() => handleKeypadPress(num)}
                    disabled={isVerifying}
                    style={{
                      height: 48,
                      borderRadius: 'var(--radius-md)',
                      background: 'var(--color-elevated)',
                      border: 'var(--border-w-sm) solid var(--color-border-subtle)',
                      boxShadow: 'var(--shadow-block-sm)',
                      color: 'var(--color-text)',
                      fontFamily: 'var(--font-mono)',
                      fontSize: 20,
                      fontWeight: 700,
                      cursor: 'pointer',
                      transition: 'all 0.1s ease',
                      touchAction: 'manipulation',
                    }}
                  >
                    {num}
                  </button>
                ))}

                <button
                  type="button"
                  className="keypad-btn"
                  onClick={handleKeypadBackspace}
                  disabled={ticketCode.length === 0 || isVerifying}
                  style={{
                    height: 48,
                    borderRadius: 'var(--radius-md)',
                    background: 'var(--color-surface)',
                    border: 'var(--border-w-sm) solid var(--color-border-subtle)',
                    boxShadow: 'var(--shadow-block-sm)',
                    color: 'var(--color-text-tertiary)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    cursor: ticketCode.length > 0 ? 'pointer' : 'default',
                    touchAction: 'manipulation',
                  }}
                  title="Backspace"
                >
                  <Delete size={18} />
                </button>

                <button
                  type="button"
                  className="keypad-btn"
                  onClick={() => handleKeypadPress('0')}
                  disabled={isVerifying}
                  style={{
                    height: 48,
                    borderRadius: 'var(--radius-md)',
                    background: 'var(--color-elevated)',
                    border: 'var(--border-w-sm) solid var(--color-border-subtle)',
                    boxShadow: 'var(--shadow-block-sm)',
                    color: 'var(--color-text)',
                    fontFamily: 'var(--font-mono)',
                    fontSize: 20,
                    fontWeight: 700,
                    cursor: 'pointer',
                    touchAction: 'manipulation',
                  }}
                >
                  0
                </button>

                <button
                  type="button"
                  className="keypad-btn"
                  onClick={() => verifyTicketCode()}
                  disabled={ticketCode.length < 4 || isVerifying}
                  style={{
                    height: 48,
                    borderRadius: 'var(--radius-md)',
                    background: ticketCode.length === 4 ? 'var(--color-brand)' : 'var(--color-surface)',
                    border: 'var(--border-w-sm) solid',
                    borderColor: ticketCode.length === 4 ? 'rgba(47, 1, 14, 0.4)' : 'var(--color-border-subtle)',
                    color: ticketCode.length === 4 ? '#F7F1EA' : 'var(--color-text-disabled)',
                    fontFamily: 'var(--font-display)',
                    fontSize: 12,
                    fontWeight: 800,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    cursor: ticketCode.length === 4 ? 'pointer' : 'default',
                    letterSpacing: '0.06em',
                    boxShadow: ticketCode.length === 4 ? 'var(--shadow-block-sm)' : 'none',
                    touchAction: 'manipulation',
                  }}
                >
                  {isVerifying ? '...' : 'VERIFY'}
                </button>
              </div>

              {/* Instant walk-in pass */}
              {settings.kiosk.allowWalkIn !== false && (
                <button
                  type="button"
                  onClick={handleWalkInPass}
                  disabled={isVerifying}
                  style={{
                    background: 'none',
                    border: 'none',
                    color: 'var(--color-brand)',
                    fontFamily: 'var(--font-primary)',
                    fontSize: 13,
                    fontWeight: 600,
                    cursor: 'pointer',
                    marginTop: 4,
                    textDecoration: 'underline',
                    textUnderlineOffset: 3,
                  }}
                >
                  No ticket yet? Tap for instant walk-in pass →
                </button>
              )}
            </>
          )}

          {/* Verified Action Button */}
          {claimedTicket && (
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 12, width: '100%', marginTop: 8 }}>
              <button
                onClick={handleStartInteraction}
                className="btn btn-primary"
                style={{
                  borderRadius: 'var(--radius-full)',
                  padding: '16px 32px',
                  fontSize: 16,
                  fontFamily: 'var(--font-display)',
                  fontWeight: 800,
                  letterSpacing: '0.05em',
                  width: '100%',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: 10,
                  cursor: 'pointer',
                }}
              >
                <span>{(session?.photos?.length ?? 0) > 0 ? `CUSTOMIZE PHOTOS (${session?.photos.length})` : 'START PHOTOSHOOT'}</span>
                <ArrowRight size={18} />
              </button>

              <button
                type="button"
                onClick={handleKeypadClear}
                style={{
                  background: 'none',
                  border: 'none',
                  color: 'var(--color-text-secondary)',
                  fontFamily: 'var(--font-primary)',
                  fontSize: 13,
                  cursor: 'pointer',
                  textDecoration: 'underline',
                }}
              >
                Not your code? Enter different ticket
              </button>
            </div>
          )}
        </motion.div>
      ) : (
        /* Standalone Direct Touch to Begin */
        <motion.div
          initial={{ scale: 0.95, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          style={{ zIndex: 1 }}
        >
          <button
            onClick={handleStartInteraction}
            className="btn btn-primary btn-xl"
            style={{
              borderRadius: 'var(--radius-full)',
              padding: '20px 48px',
              fontSize: 18,
              fontFamily: 'var(--font-display)',
              fontWeight: 800,
              letterSpacing: '0.06em',
              display: 'flex',
              alignItems: 'center',
              gap: 12,
              cursor: 'pointer',
            }}
          >
            <span>{(session?.photos?.length ?? 0) > 0 ? `CUSTOMIZE PHOTOS (${session?.photos.length})` : 'TOUCH TO BEGIN'}</span>
            <ArrowRight size={22} />
          </button>
        </motion.div>
      )}
    </div>
  )
}

import React, { useState, useEffect, useRef, useCallback } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { Camera, RefreshCw, AlertTriangle, ArrowRight, X, Video, Clock, Check } from 'lucide-react'
import { CameraViewfinder, type CameraViewfinderRef } from '@/components/kiosk/CameraViewfinder'
import { useSessionStore } from '@/store/sessionStore'
import { useSettingsStore } from '@/store/settingsStore'
import { playCountdownTick, playShutterSound } from '@/utils/audio'
import type { Photo } from '@/types'

const SERVER_BASE = typeof window !== 'undefined' && window.location.hostname
  ? `http://${window.location.hostname}:3847`
  : 'http://localhost:3847'

interface CaptureScreenProps {
  retakePhotoId?: string | null
  onComplete: () => void
  onCancel: () => void
}

type CaptureState = 'ready' | 'countdown' | 'flash' | 'processing' | 'pause' | 'done'

const DEFAULT_PHOTO_EDITS = {
  filter: 'original',
  filterIntensity: 100,
  crop: { x: 0, y: 0, width: 1, height: 1 },
  rotation: 0,
  flipH: false,
  flipV: false,
  scale: 1,
  panX: 0,
  panY: 0,
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
}

function createLocalPhoto(id: string, sessionId: string, dataUrl: string, width: number, height: number, size: number): Photo {
  return {
    id,
    sessionId,
    originalPath: dataUrl,
    originalUrl: dataUrl,
    thumbnailPath: dataUrl,
    previewPath: dataUrl,
    thumbnailUrl: dataUrl,
    previewUrl: dataUrl,
    metadata: { width, height, format: 'jpeg', size },
    edits: { ...DEFAULT_PHOTO_EDITS },
    isFavorite: false,
    uploadedAt: new Date().toISOString(),
  }
}

export function CaptureScreen({ retakePhotoId, onComplete, onCancel }: CaptureScreenProps) {
  const viewfinderRef = useRef<CameraViewfinderRef | null>(null)
  const { session, addPhoto, replacePhoto } = useSessionStore()
  const { settings, updateKiosk } = useSettingsStore()

  // 60-Second Timed Marathon Session: 1 photo every 2 seconds = 30 photos in 60s
  const isTimedMode = !retakePhotoId && (settings.kiosk.captureMode !== 'standard')
  const totalSessionSeconds = settings.kiosk.sessionDurationSeconds || 60
  const intervalBetweenShots = settings.kiosk.intervalBetweenShotsSeconds || 2
  const targetShots = retakePhotoId
    ? 1
    : isTimedMode
    ? (settings.kiosk.photoCountPerSession || Math.floor(totalSessionSeconds / intervalBetweenShots))
    : 4
  const countdownDuration = isTimedMode ? intervalBetweenShots : (settings.kiosk.cameraCountdownSeconds || 3)

  const [currentShotIndex, setCurrentShotIndex] = useState(0)
  const [captureState, setCaptureState] = useState<CaptureState>('ready')
  const [countdownNum, setCountdownNum] = useState<number>(countdownDuration)
  const [isFlashing, setIsFlashing] = useState(false)
  const [capturedThumbs, setCapturedThumbs] = useState<string[]>([])
  const [showStallModal, setShowStallModal] = useState(false)
  const [showCancelConfirm, setShowCancelConfirm] = useState(false)
  const [errorMessage, setErrorMessage] = useState<string | null>(null)
  const [sessionTimeRemaining, setSessionTimeRemaining] = useState<number>(totalSessionSeconds)

  const stallWatchdogRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const countdownTimerRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const sessionTimerRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const isServerOnlineRef = useRef<boolean | null>(null)
  const thumbContainerRef = useRef<HTMLDivElement | null>(null)
  const isSessionCompleteRef = useRef<boolean>(false)

  // Finish session cleanly
  const finishSession = useCallback(() => {
    if (isSessionCompleteRef.current) return
    isSessionCompleteRef.current = true
    if (sessionTimerRef.current) {
      clearInterval(sessionTimerRef.current)
      sessionTimerRef.current = null
    }
    if (countdownTimerRef.current) {
      clearInterval(countdownTimerRef.current)
      countdownTimerRef.current = null
    }
    setCaptureState('done')
    setTimeout(() => {
      onComplete()
    }, 900)
  }, [onComplete])

  // Master 60s countdown timer
  const startSessionTimer = useCallback(() => {
    if (sessionTimerRef.current) clearInterval(sessionTimerRef.current)
    sessionTimerRef.current = setInterval(() => {
      setSessionTimeRemaining(prev => {
        if (prev <= 1) {
          if (sessionTimerRef.current) {
            clearInterval(sessionTimerRef.current)
            sessionTimerRef.current = null
          }
          finishSession()
          return 0
        }
        return prev - 1
      })
    }, 1000)
  }, [finishSession])

  // Start 10-second stall watchdog for Pi or external capture
  const startStallWatchdog = useCallback(() => {
    if (stallWatchdogRef.current) clearTimeout(stallWatchdogRef.current)
    stallWatchdogRef.current = setTimeout(() => {
      setShowStallModal(true)
    }, 10000)
  }, [])

  const clearStallWatchdog = useCallback(() => {
    if (stallWatchdogRef.current) {
      clearTimeout(stallWatchdogRef.current)
      stallWatchdogRef.current = null
    }
  }, [])

  // Clean up all timers on unmount
  useEffect(() => {
    return () => {
      clearStallWatchdog()
      if (countdownTimerRef.current) clearInterval(countdownTimerRef.current)
      if (sessionTimerRef.current) clearInterval(sessionTimerRef.current)
    }
  }, [clearStallWatchdog])

  // Execute frame capture from WebRTC viewfinder
  const captureCurrentFrame = useCallback(async () => {
    setIsFlashing(true)
    playShutterSound()
    setCaptureState('flash')

    setTimeout(() => {
      setIsFlashing(false)
    }, 300)

    const canvas = viewfinderRef.current?.captureFrame()
    if (!canvas) {
      setErrorMessage('Could not grab frame from camera. Please verify camera permissions.')
      setCaptureState('ready')
      return
    }

    setCaptureState('processing')

    // Convert canvas to blob for server upload
    canvas.toBlob(async (blob) => {
      if (!blob) {
        setErrorMessage('Failed to encode photo from camera.')
        setCaptureState('ready')
        return
      }

      let activeSession = session
      if (!activeSession) {
        await useSessionStore.getState().createSession()
        activeSession = useSessionStore.getState().session
      }

      if (!activeSession) {
        setErrorMessage('No active session.')
        setCaptureState('ready')
        return
      }

      const formData = new FormData()
      formData.append('photo', blob, `shot-${Date.now()}.jpg`)

      let newPhoto: Photo

      if (isServerOnlineRef.current === false) {
        const localDataUrl = canvas.toDataURL('image/jpeg', 0.95)
        const localId = `photo-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`
        newPhoto = createLocalPhoto(localId, activeSession.id, localDataUrl, canvas.width, canvas.height, blob.size)
      } else {
        try {
          const uploadRes = await fetch(`${SERVER_BASE}/api/photos/upload`, {
            method: 'POST',
            headers: {
              'X-Session-Id': activeSession.id,
            },
            body: formData,
          })

          if (!uploadRes.ok) {
            const errData = await uploadRes.json().catch(() => ({}))
            throw new Error(errData.error || `Upload failed with status ${uploadRes.status}`)
          }

          const data = await uploadRes.json()
          isServerOnlineRef.current = true
          newPhoto = {
            id: data.photoId,
            sessionId: activeSession.id,
            originalPath: data.originalPath || '',
            originalUrl: data.originalUrl || data.previewUrl || data.thumbnailUrl,
            thumbnailPath: data.thumbnailPath || '',
            previewPath: data.previewPath || '',
            thumbnailUrl: data.thumbnailUrl,
            previewUrl: data.previewUrl,
            metadata: data.metadata || { width: canvas.width, height: canvas.height, format: 'jpeg', size: blob.size },
            edits: { ...DEFAULT_PHOTO_EDITS },
            isFavorite: false,
            uploadedAt: new Date().toISOString(),
          }
        } catch (uploadErr) {
          isServerOnlineRef.current = false
          const localDataUrl = canvas.toDataURL('image/jpeg', 0.95)
          const localId = `photo-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`
          newPhoto = createLocalPhoto(localId, activeSession.id, localDataUrl, canvas.width, canvas.height, blob.size)
        }
      }

      if (retakePhotoId) {
        replacePhoto(retakePhotoId, newPhoto)
        setCaptureState('done')
        setTimeout(() => {
          onComplete()
        }, 800)
        return
      }

      addPhoto(newPhoto)
      setCapturedThumbs(prev => [...prev, newPhoto.thumbnailUrl])

      // Auto scroll thumbnail strip to the newest shot
      setTimeout(() => {
        if (thumbContainerRef.current) {
          thumbContainerRef.current.scrollTo({
            left: thumbContainerRef.current.scrollWidth,
            behavior: 'smooth',
          })
        }
      }, 50)

      const nextIndex = currentShotIndex + 1
      if (nextIndex >= targetShots) {
        finishSession()
      } else {
        setCurrentShotIndex(nextIndex)
        if (isTimedMode) {
          // Instant next 2s countdown without long pauses to maintain 30 photos in 60s
          setCaptureState('pause')
          setTimeout(() => {
            startCountdown(intervalBetweenShots)
          }, 150)
        } else {
          setCaptureState('pause')
          setTimeout(() => {
            startCountdown()
          }, 2000)
        }
      }
    }, 'image/jpeg', 0.95)
  }, [session, retakePhotoId, currentShotIndex, targetShots, isTimedMode, intervalBetweenShots, replacePhoto, addPhoto, finishSession, onComplete])

  // Trigger countdown sequence
  const startCountdown = useCallback((customDuration?: number) => {
    if (isSessionCompleteRef.current) return
    setErrorMessage(null)

    // Start master 60-second session timer on first countdown
    if (isTimedMode && !sessionTimerRef.current) {
      startSessionTimer()
    }

    const duration = customDuration ?? countdownDuration
    setCountdownNum(duration)
    setCaptureState('countdown')
    playCountdownTick(880)

    let current = duration
    if (countdownTimerRef.current) clearInterval(countdownTimerRef.current)

    countdownTimerRef.current = setInterval(() => {
      current -= 1
      if (current > 0) {
        setCountdownNum(current)
        playCountdownTick(current === 1 ? 1100 : 880)
      } else {
        if (countdownTimerRef.current) clearInterval(countdownTimerRef.current)
        captureCurrentFrame()
      }
    }, 1000)
  }, [countdownDuration, isTimedMode, startSessionTimer, captureCurrentFrame])

  // External Pi trigger pipeline
  const triggerPiCapture = useCallback(async () => {
    setCaptureState('countdown')
    startStallWatchdog()
    try {
      await fetch(`${SERVER_BASE}/api/trigger/start`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sessionId: session?.id }),
      })
    } catch (e) {
      console.warn('[Capture] Failed to trigger external camera:', e)
    }
  }, [session, startStallWatchdog])

  // Hardware triggers (Spacebar, Enter, or Electron trigger event)
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (showCancelConfirm || showStallModal) return
      if (e.code === 'Space' || e.key === 'Enter') {
        e.preventDefault()
        if (captureState === 'ready' || captureState === 'pause') {
          if (settings.kiosk.cameraSource === 'pi_network') {
            triggerPiCapture()
          } else {
            startCountdown()
          }
        }
      }
    }

    const unsubHardware = window.electronAPI?.hardware?.onTrigger?.(() => {
      if (captureState === 'ready' || captureState === 'pause') {
        if (settings.kiosk.cameraSource === 'pi_network') {
          triggerPiCapture()
        } else {
          startCountdown()
        }
      }
    })

    window.addEventListener('keydown', handleKeyDown)
    return () => {
      window.removeEventListener('keydown', handleKeyDown)
      if (typeof unsubHardware === 'function') unsubHardware()
    }
  }, [captureState, showCancelConfirm, showStallModal, settings.kiosk.cameraSource, triggerPiCapture, startCountdown])

  // Auto-start first countdown upon entering screen
  useEffect(() => {
    const timer = setTimeout(() => {
      if (settings.kiosk.cameraSource === 'pi_network') {
        triggerPiCapture()
      } else {
        startCountdown()
      }
    }, 1200)

    return () => clearTimeout(timer)
  }, [])

  return (
    <div
      style={{
        position: 'relative',
        width: '100%',
        height: '100%',
        backgroundColor: '#000',
        overflow: 'hidden',
        display: 'flex',
        flexDirection: 'column',
      }}
    >
      {/* Viewfinder Area */}
      <div style={{ position: 'relative', flex: 1, width: '100%', height: '100%' }}>
        <CameraViewfinder
          ref={viewfinderRef}
          isFlashing={isFlashing}
          showGuides={true}
          onError={(err) => setErrorMessage(`Camera error: ${err.message}`)}
        />

        {/* Top 60s Session Progress Bar */}
        {isTimedMode && (
          <div
            style={{
              position: 'absolute',
              top: 0,
              left: 0,
              right: 0,
              height: 4,
              background: 'rgba(255, 255, 255, 0.1)',
              zIndex: 20,
            }}
          >
            <div
              style={{
                height: '100%',
                width: `${Math.max(0, Math.min(100, (sessionTimeRemaining / totalSessionSeconds) * 100))}%`,
                background: sessionTimeRemaining <= 10
                  ? '#ef4444'
                  : 'linear-gradient(90deg, var(--color-brand-deep), var(--color-brand))',
                transition: 'width 1s linear',
              }}
            />
          </div>
        )}

        {/* Top Header Overlay: Shot Counter, Session Timer & Controls */}
        <div
          style={{
            position: 'absolute',
            top: 24,
            left: 24,
            right: 24,
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            zIndex: 10,
          }}
        >
          {/* Shot badge */}
          <div
            style={{
              background: 'rgba(47, 1, 14, 0.75)',
              backdropFilter: 'blur(12px)',
              WebkitBackdropFilter: 'blur(12px)',
              border: '1px solid rgba(247, 241, 234, 0.25)',
              borderRadius: 'var(--radius-full)',
              padding: '8px 20px',
              color: 'var(--color-offwhite)',
              fontFamily: 'var(--font-mono)',
              fontSize: 'var(--text-sm)',
              letterSpacing: '0.08em',
              fontWeight: 600,
              display: 'flex',
              alignItems: 'center',
              gap: 8,
              boxShadow: '0 4px 16px rgba(0, 0, 0, 0.4)',
            }}
          >
            <Camera size={16} />
            <span>
              {retakePhotoId
                ? 'RETAKING PHOTO'
                : `PHOTO ${Math.min(currentShotIndex + 1, targetShots)} OF ${targetShots}`}
            </span>
          </div>

          {/* Timed Marathon 60s Session Timer Badge */}
          {isTimedMode && (
            <motion.div
              animate={{
                scale: sessionTimeRemaining <= 10 && sessionTimeRemaining > 0 ? [1, 1.05, 1] : 1,
              }}
              transition={{ repeat: sessionTimeRemaining <= 10 ? Infinity : 0, duration: 1 }}
              style={{
                background: sessionTimeRemaining <= 10
                  ? 'rgba(120, 20, 20, 0.9)'
                  : 'rgba(47, 1, 14, 0.85)',
                backdropFilter: 'blur(12px)',
                border: sessionTimeRemaining <= 10
                  ? '1px solid #f87171'
                  : '1px solid var(--color-brand)',
                borderRadius: 'var(--radius-full)',
                padding: '8px 22px',
                color: sessionTimeRemaining <= 10 ? '#fca5a5' : '#F7F1EA',
                fontFamily: 'var(--font-mono)',
                fontSize: 16,
                letterSpacing: '0.08em',
                fontWeight: 700,
                display: 'flex',
                alignItems: 'center',
                gap: 8,
                boxShadow: '0 4px 20px rgba(0, 0, 0, 0.5)',
              }}
            >
              <Clock size={16} />
              <span>{sessionTimeRemaining}s REMAINING</span>
              <span
                style={{
                  fontSize: 11,
                  opacity: 0.7,
                  color: 'var(--color-text-primary)',
                  marginLeft: 4,
                }}
              >
                (1 photo / 2s)
              </span>
            </motion.div>
          )}

          {/* Action buttons */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            {capturedThumbs.length >= 4 && captureState !== 'done' && (
              <button
                onClick={finishSession}
                className="btn btn-sm btn-secondary"
                style={{
                  borderRadius: 'var(--radius-full)',
                  padding: '8px 18px',
                  fontFamily: 'var(--font-mono)',
                  fontSize: 12,
                  display: 'flex',
                  alignItems: 'center',
                  gap: 6,
                  background: 'rgba(109, 6, 38, 0.25)',
                  border: '1px solid var(--color-brand)',
                  color: 'var(--color-offwhite)',
                  cursor: 'pointer',
                }}
              >
                <Check size={14} />
                <span>Finish Early ({capturedThumbs.length})</span>
              </button>
            )}

            <button
              onClick={() => setShowCancelConfirm(true)}
              className="btn btn-ghost"
              style={{
                background: 'rgba(0, 0, 0, 0.5)',
                backdropFilter: 'blur(8px)',
                color: 'var(--color-text-secondary)',
                borderRadius: 'var(--radius-full)',
                padding: '8px 16px',
                fontFamily: 'var(--font-mono)',
                fontSize: 12,
                minHeight: 48,
                minWidth: 48,
                display: 'flex',
                alignItems: 'center',
                gap: 6,
              }}
              aria-label="Cancel photoshoot and start over"
            >
              <X size={16} />
              <span>Cancel</span>
            </button>
          </div>
        </div>

        {/* Large Animated Countdown Overlay */}
        <AnimatePresence>
          {captureState === 'countdown' && (
            <motion.div
              key={countdownNum}
              initial={{ scale: 0.3, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 1.5, opacity: 0 }}
              transition={{ duration: 0.4, ease: 'easeOut' }}
              style={{
                position: 'absolute',
                inset: 0,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                zIndex: 20,
                pointerEvents: 'none',
              }}
            >
              <div
                style={{
                  width: 200,
                  height: 200,
                  borderRadius: '50%',
                  background: 'rgba(47, 1, 14, 0.92)',
                  backdropFilter: 'blur(20px)',
                  border: '6px solid var(--color-brand)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  boxShadow: '0 12px 40px rgba(0, 0, 0, 0.6), 0 0 50px rgba(109, 6, 38, 0.5), inset 0 4px 12px rgba(255, 255, 255, 0.25)',
                }}
              >
                <span
                  style={{
                    fontFamily: 'var(--font-display)',
                    fontSize: 135,
                    fontWeight: 900,
                    color: '#ffffff',
                    lineHeight: 1,
                    textShadow: '0 8px 0 rgba(0, 0, 0, 0.7), 0 0 30px rgba(109, 6, 38, 0.6)',
                  }}
                >
                  {countdownNum}
                </span>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Fullscreen Shutter Flash */}
        <AnimatePresence>
          {isFlashing && (
            <motion.div
              initial={{ opacity: 1 }}
              animate={{ opacity: 0 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.3 }}
              style={{
                position: 'absolute',
                inset: 0,
                backgroundColor: '#ffffff',
                zIndex: 40,
                pointerEvents: 'none',
              }}
            />
          )}
        </AnimatePresence>

        {/* Processing / Uploading Spinner Overlay */}
        {captureState === 'processing' && (
          <div
            style={{
              position: 'absolute',
              inset: 0,
              background: 'rgba(0, 20, 22, 0.7)',
              backdropFilter: 'blur(8px)',
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              justifyContent: 'center',
              zIndex: 25,
              gap: 16,
            }}
          >
            <div
              style={{
                width: 48,
                height: 48,
                border: '4px solid rgba(247, 241, 234, 0.2)',
                borderTopColor: 'var(--color-offwhite)',
                borderRadius: '50%',
                animation: 'orbit-spin 0.8s linear infinite',
              }}
            />
            <p
              style={{
                fontFamily: 'var(--font-mono)',
                fontSize: 16,
                color: 'var(--color-offwhite)',
                letterSpacing: '0.08em',
              }}
            >
              DEVELOPING SHOT...
            </p>
          </div>
        )}

        {/* Pose Transition / Next Shot Notice */}
        {captureState === 'pause' && (
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            style={{
              position: 'absolute',
              bottom: 120,
              left: 0,
              right: 0,
              display: 'flex',
              justifyContent: 'center',
              zIndex: 20,
              pointerEvents: 'none',
            }}
          >
            <div
              style={{
                background: 'rgba(47, 1, 14, 0.92)',
                backdropFilter: 'blur(12px)',
                border: '1px solid var(--color-brand)',
                borderRadius: 'var(--radius-xl)',
                padding: '14px 28px',
                textAlign: 'center',
                boxShadow: '0 8px 32px rgba(0, 0, 0, 0.5)',
              }}
            >
              <h2
                style={{
                  fontFamily: 'var(--font-display)',
                  fontSize: 30,
                  color: '#F7F1EA',
                  marginBottom: 4,
                }}
              >
                Great Shot!
              </h2>
              <p
                style={{
                  fontFamily: 'var(--font-mono)',
                  fontSize: 16,
                  color: 'var(--color-text-primary)',
                  letterSpacing: '0.05em',
                }}
              >
                Get ready for shot {currentShotIndex + 1} of {targetShots}...
              </p>
            </div>
          </motion.div>
        )}

        {/* Error Notification Banner */}
        {errorMessage && (
          <div
            style={{
              position: 'absolute',
              bottom: 120,
              left: 24,
              right: 24,
              background: 'rgba(180, 40, 40, 0.9)',
              backdropFilter: 'blur(8px)',
              border: '1px solid rgba(255, 100, 100, 0.4)',
              borderRadius: 'var(--radius-lg)',
              padding: '16px 20px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              zIndex: 30,
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
              <AlertTriangle size={20} color="#fff" />
              <span style={{ fontFamily: 'var(--font-body)', fontSize: 14, color: '#fff' }}>
                {errorMessage}
              </span>
            </div>
            <button
              onClick={() => startCountdown()}
              className="btn btn-primary"
              style={{ minHeight: 46, padding: '8px 20px', fontSize: 14, fontWeight: 700, borderRadius: 'var(--radius-full)' }}
            >
              Retry
            </button>
          </div>
        )}
      </div>

      {/* Bottom Thumbnail Strip & Controls Bar */}
      <div
        style={{
          height: 104,
          background: 'var(--color-bg-deep)',
          borderTop: 'var(--border-w-lg) solid var(--color-brand-dark)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '0 20px',
          zIndex: 10,
        }}
      >
        {/* Horizontally scrollable thumbnails for up to 30 shots */}
        <div
          ref={thumbContainerRef}
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 10,
            overflowX: 'auto',
            maxWidth: 'calc(100vw - 260px)',
            padding: '8px 0',
            scrollbarWidth: 'none',
          }}
        >
          {Array.from({ length: targetShots }).map((_, idx) => {
            const thumb = capturedThumbs[idx]
            const isCurrent = idx === currentShotIndex && captureState !== 'done'
            return (
              <div
                key={idx}
                style={{
                  width: 56,
                  height: 74,
                  flexShrink: 0,
                  borderRadius: 'var(--radius-sm)',
                  border: isCurrent
                    ? '3px solid var(--color-brand)'
                    : thumb
                    ? '2px solid rgba(247, 241, 234, 0.6)'
                    : '1.5px solid rgba(247, 241, 234, 0.25)',
                  boxShadow: isCurrent ? 'var(--shadow-block-sm)' : 'none',
                  background: 'rgba(0, 0, 0, 0.5)',
                  overflow: 'hidden',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  position: 'relative',
                }}
              >
                {thumb ? (
                  <img
                    src={thumb}
                    alt={`Shot ${idx + 1}`}
                    style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                  />
                ) : (
                  <span
                    style={{
                      fontFamily: 'var(--font-mono)',
                      fontSize: 15,
                      fontWeight: 700,
                      color: isCurrent ? '#F7F1EA' : 'var(--color-text-tertiary)',
                    }}
                  >
                    {idx + 1}
                  </span>
                )}
              </div>
            )
          })}
        </div>

        {/* Action Trigger Button */}
        <div>
          {captureState === 'ready' && (
            <button
              onClick={() => startCountdown()}
              className="btn btn-primary btn-xl btn-expressive"
              style={{
                borderRadius: 'var(--radius-full)',
                padding: '14px 28px',
                fontSize: 18,
                minHeight: 56,
                display: 'flex',
                alignItems: 'center',
                gap: 10,
                whiteSpace: 'nowrap',
                touchAction: 'manipulation',
              }}
            >
              <Camera size={22} />
              <span>START {isTimedMode ? '60s SHOOT' : 'SHOOT'}</span>
            </button>
          )}

          {captureState !== 'ready' && captureState !== 'done' && (
            <div
              style={{
                fontFamily: 'var(--font-mono)',
                fontSize: 15,
                color: 'var(--color-brand-light)',
                letterSpacing: '0.05em',
                display: 'flex',
                alignItems: 'center',
                gap: 8,
                padding: '8px 16px',
                background: 'rgba(47, 1, 14, 0.6)',
                borderRadius: 'var(--radius-full)',
                border: '1px solid rgba(247, 241, 234, 0.15)',
              }}
            >
              <span>{capturedThumbs.length} / {targetShots}</span>
            </div>
          )}

          {captureState === 'done' && (
            <button
              onClick={onComplete}
              className="btn btn-primary"
              style={{
                borderRadius: 'var(--radius-full)',
                padding: '12px 24px',
                fontFamily: 'var(--font-mono)',
                fontSize: 15,
                letterSpacing: '0.08em',
                minHeight: 48,
                display: 'flex',
                alignItems: 'center',
                gap: 8,
                whiteSpace: 'nowrap',
              }}
            >
              <span>SELECT PHOTOS</span>
              <ArrowRight size={16} />
            </button>
          )}
        </div>
      </div>

      {/* 10-Second Capture Watchdog Modal */}
      <AnimatePresence>
        {showStallModal && (
          <div
            style={{
              position: 'fixed',
              inset: 0,
              backgroundColor: 'rgba(0, 0, 0, 0.8)',
              backdropFilter: 'blur(8px)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              zIndex: 50,
              padding: 24,
            }}
          >
            <motion.div
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.9, opacity: 0 }}
              style={{
                maxWidth: 440,
                width: '100%',
                background: 'var(--color-bg-surface)',
                border: '1px solid var(--color-border-subtle)',
                borderRadius: 'var(--radius-xl)',
                padding: 28,
                textAlign: 'center',
                boxShadow: '0 20px 60px rgba(0, 0, 0, 0.6)',
              }}
            >
              <div
                style={{
                  width: 56,
                  height: 56,
                  borderRadius: '50%',
                  background: 'rgba(109, 6, 38, 0.15)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  margin: '0 auto 16px',
                }}
              >
                <AlertTriangle size={28} color="var(--color-brand)" />
              </div>
              <h3
                style={{
                  fontFamily: 'var(--font-display)',
                  fontSize: 20,
                  color: 'var(--color-text-primary)',
                  marginBottom: 8,
                }}
              >
                Camera Not Responding
              </h3>
              <p
                style={{
                  fontFamily: 'var(--font-body)',
                  fontSize: 14,
                  color: 'var(--color-text-secondary)',
                  lineHeight: 1.5,
                  marginBottom: 24,
                }}
              >
                The camera took longer than 10 seconds to respond. Would you like to retry or switch to the built-in webcam?
              </p>

              <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                <button
                  onClick={() => {
                    setShowStallModal(false)
                    triggerPiCapture()
                  }}
                  className="btn btn-primary"
                  style={{
                    borderRadius: 'var(--radius-full)',
                    minHeight: 48,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: 8,
                  }}
                >
                  <RefreshCw size={16} />
                  <span>Retry Capture</span>
                </button>

                <button
                  onClick={() => {
                    setShowStallModal(false)
                    clearStallWatchdog()
                    updateKiosk({ cameraSource: 'webcam' })
                    startCountdown()
                  }}
                  className="btn btn-secondary"
                  style={{
                    borderRadius: 'var(--radius-full)',
                    minHeight: 48,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: 8,
                  }}
                >
                  <Video size={16} />
                  <span>Switch to Built-in Webcam</span>
                </button>

                <button
                  onClick={() => {
                    setShowStallModal(false)
                    clearStallWatchdog()
                    onCancel()
                  }}
                  className="btn btn-ghost"
                  style={{
                    borderRadius: 'var(--radius-full)',
                    minHeight: 48,
                    color: 'var(--color-text-tertiary)',
                  }}
                >
                  Cancel Session
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Confirmation Start Over Modal */}
      <AnimatePresence>
        {showCancelConfirm && (
          <div
            style={{
              position: 'fixed',
              inset: 0,
              backgroundColor: 'rgba(0, 0, 0, 0.8)',
              backdropFilter: 'blur(8px)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              zIndex: 50,
              padding: 24,
            }}
          >
            <motion.div
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.9, opacity: 0 }}
              style={{
                maxWidth: 400,
                width: '100%',
                background: 'var(--color-bg-surface)',
                border: '1px solid var(--color-border-subtle)',
                borderRadius: 'var(--radius-xl)',
                padding: 24,
                textAlign: 'center',
                boxShadow: '0 20px 60px rgba(0, 0, 0, 0.6)',
              }}
            >
              <h3
                style={{
                  fontFamily: 'var(--font-display)',
                  fontSize: 20,
                  color: 'var(--color-text-primary)',
                  marginBottom: 8,
                }}
              >
                Cancel Photoshoot?
              </h3>
              <p
                style={{
                  fontFamily: 'var(--font-body)',
                  fontSize: 14,
                  color: 'var(--color-text-secondary)',
                  marginBottom: 20,
                }}
              >
                Any photos captured in this round will be cancelled.
              </p>
              <div style={{ display: 'flex', gap: 12 }}>
                <button
                  onClick={() => setShowCancelConfirm(false)}
                  className="btn btn-secondary flex-1"
                  style={{ borderRadius: 'var(--radius-full)', minHeight: 48 }}
                >
                  Stay
                </button>
                <button
                  onClick={() => {
                    setShowCancelConfirm(false)
                    onCancel()
                  }}
                  className="btn btn-danger flex-1"
                  style={{ borderRadius: 'var(--radius-full)', minHeight: 48 }}
                >
                  Yes, Cancel
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  )
}

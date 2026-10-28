import React, { useEffect, useState, useCallback, lazy, Suspense } from 'react'
import { io, Socket } from 'socket.io-client'
import { AnimatePresence, motion } from 'framer-motion'
import { Camera } from 'lucide-react'
import { useSessionStore } from '@/store/sessionStore'
import { useConnectionStore } from '@/store/connectionStore'
import { AppHeader } from '@/components/layout/AppHeader'
import { AppFooter } from '@/components/layout/AppFooter'
import { SessionRecoveryModal } from '@/components/modals/SessionRecoveryModal'
import { IdleTimeoutManager } from '@/components/kiosk/IdleTimeoutManager'
import { ToastContainer } from '@/components/ui/Toast'
import { DeviceSelectorScreen, type DeviceMode } from '@/screens/DeviceSelectorScreen'
import { useQueueStore } from '@/store/queueStore'
import type { Photo, Ticket } from '@/types'
import { getPhotoUrl } from '@/utils/photoUrl'

import { STEPS, type AppStep } from '@/constants/steps'
import {
  tryEditorNextInterceptor,
  tryTemplateNextInterceptor,
  tryTemplateBackInterceptor
} from '@/store/editorBridge'

// Each station only downloads the code it needs: the Pi booth (2 GB RAM) no longer parses the
// whole editor + template library just to show a keypad and the camera.
const WaitingScreen = lazy(() => import('@/screens/WaitingScreen').then(m => ({ default: m.WaitingScreen })))
const CaptureScreen = lazy(() => import('@/screens/CaptureScreen').then(m => ({ default: m.CaptureScreen })))
const PhotoSelectionScreen = lazy(() => import('@/screens/PhotoSelectionScreen').then(m => ({ default: m.PhotoSelectionScreen })))
const LayoutScreen = lazy(() => import('@/screens/LayoutScreen').then(m => ({ default: m.LayoutScreen })))
const TemplateScreen = lazy(() => import('@/screens/TemplateScreen').then(m => ({ default: m.TemplateScreen })))
const EditorScreen = lazy(() => import('@/screens/EditorScreen').then(m => ({ default: m.EditorScreen })))
const PreviewScreen = lazy(() => import('@/screens/PreviewScreen').then(m => ({ default: m.PreviewScreen })))
const ExportScreen = lazy(() => import('@/screens/ExportScreen').then(m => ({ default: m.ExportScreen })))
const QueueManagerScreen = lazy(() => import('@/screens/QueueManagerScreen').then(m => ({ default: m.QueueManagerScreen })))
const BoothPiScreen = lazy(() => import('@/screens/BoothPiScreen').then(m => ({ default: m.BoothPiScreen })))
const AdminPanelModal = lazy(() => import('@/components/modals/AdminPanelModal').then(m => ({ default: m.AdminPanelModal })))

const ScreenFallback = () => (
  <div style={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'var(--color-bg)' }}>
    <div style={{ animation: 'spin 2s linear infinite', color: 'var(--color-brand)' }}><Camera size={36} strokeWidth={1.8} /></div>
  </div>
)

const SERVER_BASE = typeof window !== 'undefined' && window.location.hostname
  ? `http://${window.location.hostname}:3847`
  : 'http://localhost:3847'

export default function App() {
  const [step, setStep] = useState<AppStep>('waiting')
  const stepRef = React.useRef<AppStep>('waiting')
  stepRef.current = step
  const [retakePhotoId, setRetakePhotoId] = useState<string | null>(null)
  const [socket, setSocket] = useState<Socket | null>(null)
  const [showRecovery, setShowRecovery] = useState(false)
  const [showAdmin, setShowAdmin] = useState(false)
  const [previousSession, setPreviousSession] = useState<{ id: string; photoCount: number } | null>(null)
  // 'selector' = show device picker, 'ticket'|'booth'|'editor' = mode active
  type AppMode = 'loading' | 'selector' | DeviceMode
  const [appMode, setAppMode] = useState<AppMode>('loading')

  // Load saved device mode from Electron IPC (or URL param for dev/browser)
  useEffect(() => {
    const loadMode = async () => {
      // URL param override (dev/browser preview)
      const p = new URLSearchParams(window.location.search)
      const urlMode = p.get('view') as DeviceMode | null
      if (urlMode && ['ticket', 'booth', 'editor'].includes(urlMode)) {
        setAppMode(urlMode)
        return
      }
      // Legacy URL compat
      if (p.get('view') === 'queue') { setAppMode('ticket'); return }
      // Electron: load from file
      if (window.electronAPI?.deviceMode) {
        const saved = await window.electronAPI.deviceMode.get()
        if (saved && ['ticket', 'booth', 'editor'].includes(saved)) {
          setAppMode(saved as DeviceMode)
          return
        }
      }
      // Browser: load from localStorage
      const localSaved = localStorage.getItem('photobooth_device_mode') as DeviceMode | null
      if (localSaved && ['ticket', 'booth', 'editor'].includes(localSaved)) {
        setAppMode(localSaved)
        return
      }
      // No saved mode → show selector
      setAppMode('selector')
    }
    loadMode()
  }, [])

  // Persist and switch mode
  const selectMode = useCallback(async (mode: DeviceMode) => {
    if (window.electronAPI?.deviceMode) {
      await window.electronAPI.deviceMode.set(mode)
    }
    localStorage.setItem('photobooth_device_mode', mode)
    // Auto-start camera server when entering booth mode
    if (mode === 'booth') {
      window.electronAPI?.camera?.start()
    } else {
      window.electronAPI?.camera?.stop()
    }
    setAppMode(mode)
  }, [])

  // Ctrl+Shift+M → re-open device selector
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.shiftKey && e.key.toLowerCase() === 'm') {
        e.preventDefault()
        window.electronAPI?.camera?.stop()
        window.electronAPI?.deviceMode?.clear()
        localStorage.removeItem('photobooth_device_mode')
        setAppMode('selector')
      }
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [])

  // Legacy viewMode for URL compat (maps appMode → old viewMode)
  const viewMode = appMode === 'ticket' ? 'queue' : appMode === 'booth' ? 'booth' : 'kiosk'
  
  const { session, addPhoto, createSession, loadSession } = useSessionStore()
  const { setSocketConnected, setPiStatus, setServerStatus, recordPhotoReceived } = useConnectionStore()

  // ─── Kiosk lockdown: prevent context menu, F11, Ctrl+W ───────────────────
  useEffect(() => {
    const handleContextMenu = (e: MouseEvent) => {
      e.preventDefault()
    }
    const handleBlockKeys = (e: KeyboardEvent) => {
      if (
        e.key === 'F11' ||
        (e.ctrlKey && (e.key.toLowerCase() === 'w' || e.key.toLowerCase() === 'r'))
      ) {
        e.preventDefault()
      }
    }
    window.addEventListener('contextmenu', handleContextMenu)
    window.addEventListener('keydown', handleBlockKeys)
    return () => {
      window.removeEventListener('contextmenu', handleContextMenu)
      window.removeEventListener('keydown', handleBlockKeys)
    }
  }, [])

  // ─── Global shortcut for Admin Panel (Ctrl+Shift+A) ──────────────────────
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.shiftKey && e.key.toLowerCase() === 'a') {
        e.preventDefault()
        setShowAdmin(prev => !prev)
      }
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [])

  // ─── Init: check for incomplete sessions ────────────────────────────────
  useEffect(() => {
    checkForIncompleteSession()
    initializeServer()
  }, [])

  const initializeServer = async () => {
    try {
      const res = await fetch(`${SERVER_BASE}/api/health`)
      if (res.ok) {
        const data = await res.json().catch(() => ({}))
        const port = data.port || 3847
        const address = (window.electronAPI?.server
          ? await window.electronAPI.server.getAddress()
          : data.address) || window.location.hostname || 'localhost'
        setServerStatus({ running: true, port, address })
      }
    } catch {
      console.warn('[App] Server not yet ready')
    }
  }

  const checkForIncompleteSession = async () => {
    try {
      const res = await fetch(`${SERVER_BASE}/api/session`)
      if (!res.ok) return
      const { sessions } = await res.json()
      
      // Find the most recent non-completed session
      const incomplete = sessions.find((s: { status: string; id: string; photos: unknown[] }) =>
        ['receiving', 'selecting', 'designing', 'editing', 'preview'].includes(s.status) &&
        s.photos?.length > 0
      )
      
      if (incomplete) {
        setPreviousSession({ id: incomplete.id, photoCount: incomplete.photos.length })
        setShowRecovery(true)
      }
    } catch {
      // Server not ready yet
    }
  }

  // ─── Socket.IO connection ────────────────────────────────────────────────
  useEffect(() => {
    const sock = io(SERVER_BASE, {
      transports: ['websocket', 'polling'],
      reconnection: true,
      // Never give up: a Wi-Fi blip longer than ~30s used to leave a station disconnected until reload
      reconnectionAttempts: Infinity,
      reconnectionDelay: 3000,
      reconnectionDelayMax: 10000,
      timeout: 5000,
    })

    sock.on('connect', () => {
      setSocketConnected(true)
      console.log('[Socket] Connected')
    })

    sock.on('disconnect', () => {
      setSocketConnected(false)
    })

    sock.on('connect_error', (err) => {
      setSocketConnected(false, err.message)
    })

    // ─── Photo received from Pi ──────────────────────────────────────────
    sock.on('photo:received', (data: {
      photoId: string
      sessionId: string
      originalUrl?: string
      thumbnailUrl: string
      previewUrl: string
      metadata: Photo['metadata']
      photoIndex: number
      totalPhotos: number
    }) => {
      recordPhotoReceived()
      
      // If a session is active, add the photo
      const currentSession = useSessionStore.getState().session
      if (currentSession && currentSession.id === data.sessionId) {
        const newPhoto: Photo = {
          id: data.photoId,
          sessionId: data.sessionId,
          originalPath: '',
          thumbnailPath: '',
          previewPath: '',
          originalUrl: data.originalUrl ? getPhotoUrl(data.originalUrl) : undefined,
          thumbnailUrl: getPhotoUrl(data.thumbnailUrl),
          previewUrl: getPhotoUrl(data.previewUrl),
          metadata: data.metadata,
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
        }
        addPhoto(newPhoto)
      }
    })

    // ─── Session created by Pi ───────────────────────────────────────────
    // session:created is broadcast to EVERY station. Only adopt it when this station is idle;
    // otherwise the editing iPad threw away the current guest's work whenever the booth started
    // a session for the next guest.
    sock.on('session:created', async (data: { sessionId: string; piName: string }) => {
      const current = useSessionStore.getState().session
      const isIdle = stepRef.current === 'waiting' && (!current || (current.photos?.length ?? 0) === 0)
      if (!isIdle) return
      await loadSession(data.sessionId)
      setStep('waiting')
    })

    // ─── Session complete ────────────────────────────────────────────────
    sock.on('session:complete', (data: { sessionId: string; count: number }) => {
      const { session: currentSession } = useSessionStore.getState()
      if (currentSession && currentSession.id === data.sessionId && stepRef.current === 'waiting') {
        setStep('select')
      }
    })

    // ─── Pi heartbeat ────────────────────────────────────────────────────
    sock.on('pi:status', (data: { connected: boolean; ipAddress?: string; sessionId?: string }) => {
      setPiStatus({
        connected: data.connected,
        ipAddress: data.ipAddress,
        sessionId: data.sessionId,
      })
    })

    // ─── Digital Queue synchronization ──────────────────────────────────
    sock.emit('queue:sync')

    sock.on('ticket:issued', (ticket: Ticket) => {
      useQueueStore.getState().handleSocketTicketIssued(ticket)
    })

    sock.on('ticket:claimed', (ticket: Ticket) => {
      useQueueStore.getState().handleSocketTicketClaimed(ticket)
    })

    sock.on('ticket:updated', (ticket: Ticket) => {
      useQueueStore.getState().handleSocketTicketUpdated(ticket)
    })

    sock.on('queue:updated', (data: { tickets: Ticket[]; nextCode: string }) => {
      useQueueStore.getState().handleSocketQueueUpdated(data)
    })

    sock.on('ticket:reset', () => {
      useQueueStore.getState().handleSocketQueueReset()
    })

    setSocket(sock)

    return () => {
      sock.disconnect()
    }
  }, [])

  // ─── Navigation ───────────────────────────────────────────────────────────
  const goToStep = useCallback((target: AppStep) => {
    setStep(target)
  }, [])

  const goNext = useCallback(() => {
    // Allow TemplateScreen to advance to next strip look before moving to editor
    if (step === 'template' && tryTemplateNextInterceptor()) return
    // Allow EditorScreen to intercept (e.g. advance to next strip in LOOKS panel)
    if (step === 'editor' && tryEditorNextInterceptor()) return
    const idx = STEPS.findIndex(s => s.id === step)
    if (idx < STEPS.length - 1) {
      setStep(STEPS[idx + 1].id)
    }
  }, [step])

  const goBack = useCallback(() => {
    // Allow TemplateScreen to go back to previous strip look
    if (step === 'template' && tryTemplateBackInterceptor()) return
    const idx = STEPS.findIndex(s => s.id === step)
    if (idx > 0) {
      setStep(STEPS[idx - 1].id)
    }
  }, [step])

  // ─── Session recovery ─────────────────────────────────────────────────────
  const handleResume = async () => {
    if (!previousSession) return
    await loadSession(previousSession.id)
    setShowRecovery(false)
    setStep('select')
  }

  const handleStartNew = async () => {
    setShowRecovery(false)
    await createSession()
    setStep('waiting')
  }

  // ─── Demo mode: simulate Pi upload ───────────────────────────────────────
  const startDemoMode = useCallback(async () => {
    const { sessionId } = await createSession()
    await simulatePiUpload(sessionId)
    setStep('select')
  }, [createSession])

  const stepIndex = STEPS.findIndex(s => s.id === step)

  // ── Loading (reading saved mode) ─────────────────────────────────────────
  if (appMode === 'loading') {
    return (
      <div style={{ width: '100vw', height: '100vh', background: 'var(--color-bg)',
        display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 16 }}>
        <div style={{ animation: 'spin 2s linear infinite', color: 'var(--color-brand)' }}>
          <Camera size={44} strokeWidth={1.8} />
        </div>
        <span style={{ fontFamily: 'var(--font-mono)', fontSize: 13, fontWeight: 700, color: 'var(--color-text-secondary)', letterSpacing: '0.08em' }}>INITIALIZING STUDIO...</span>
      </div>
    )
  }

  // ── Device Selector (first launch or Ctrl+Shift+M) ────────────────────────
  if (appMode === 'selector') {
    return <DeviceSelectorScreen onSelect={selectMode} />
  }

  // ── MODULE 1: Ticket Centre ───────────────────────────────────────────────
  if (appMode === 'ticket') {
    return (
      <div className="app" style={{ overflow: 'hidden' }}>
        <Suspense fallback={<ScreenFallback />}>
          <QueueManagerScreen onSwitchToKiosk={() => setAppMode('selector')} />
        </Suspense>
        <ToastContainer />
      </div>
    )
  }

  // ── MODULE 2: Pi Booth (5" 800×480 touch screen) ─────────────────────────
  if (appMode === 'booth') {
    return (
      <div className="app" style={{ width: '100vw', height: '100vh', overflow: 'hidden', background: 'var(--color-bg, #F7F1EA)',
        display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <Suspense fallback={<ScreenFallback />}>
          <BoothPiScreen />
        </Suspense>
      </div>
    )
  }

  // ── MODULE 3: Editing Station (appMode === 'editor') ──────────────────────
  // falls through to main kiosk render below

  return (
    <div className="app" style={{ background: 'var(--color-bg, #F7F1EA)' }}>
      {/* Session Recovery Modal */}
      <AnimatePresence>
        {showRecovery && previousSession && (
          <SessionRecoveryModal
            sessionId={previousSession.id}
            photoCount={previousSession.photoCount}
            onResume={handleResume}
            onStartNew={handleStartNew}
          />
        )}
      </AnimatePresence>

      {/* Header */}
      {step !== 'waiting' && step !== 'capture' && (
        <AppHeader
          step={step}
          stepIndex={stepIndex}
          onStepClick={goToStep}
          onOpenAdmin={() => setShowAdmin(true)}
        />
      )}

      {/* Main Content */}
      <div className="app-body" style={{ background: 'var(--color-bg, #F7F1EA)' }}>
        <Suspense fallback={<ScreenFallback />}>
        <AnimatePresence mode="wait">
          <motion.div
            key={step}
            className="w-full h-full"
            style={{ background: 'var(--color-bg, #F7F1EA)' }}
            initial={{ opacity: 0, x: 20 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -20 }}
            transition={{ duration: 0.2, ease: 'easeInOut' }}
          >
            {step === 'waiting' && (
              <WaitingScreen
                appMode={appMode}
                onStartCapture={() => {
                  setRetakePhotoId(null)
                  setStep('capture')
                }}
                onPhotosReady={() => setStep('select')}
                onDemoMode={startDemoMode}
                onOpenAdmin={() => setShowAdmin(true)}
                onOpenQueueManager={() => setAppMode('ticket')}
              />
            )}
            {step === 'capture' && (
              <CaptureScreen
                retakePhotoId={retakePhotoId}
                onComplete={() => {
                  setRetakePhotoId(null)
                  setStep('select')
                }}
                onCancel={() => {
                  setRetakePhotoId(null)
                  setStep(retakePhotoId ? 'select' : 'waiting')
                }}
              />
            )}
            {step === 'select' && (
              <PhotoSelectionScreen
                onBack={() => setStep('waiting')}
                onNext={goNext}
                onRetakePhoto={(photoId) => {
                  setRetakePhotoId(photoId)
                  setStep('capture')
                }}
              />
            )}
            {step === 'layout' && (
              <LayoutScreen
                onBack={() => setStep('select')}
                onNext={goNext}
              />
            )}
            {step === 'template' && (
              <TemplateScreen
                onBack={() => setStep('layout')}
                onNext={goNext}
              />
            )}
            {step === 'editor' && (
              <EditorScreen
                onBack={() => setStep('template')}
                onNext={goNext}
              />
            )}
            {step === 'preview' && (
              <PreviewScreen
                onBack={() => setStep('editor')}
                onNext={goNext}
                onGoToStep={goToStep}
              />
            )}
            {step === 'export' && (
              <ExportScreen
                onBack={() => setStep('preview')}
                onNewSession={handleStartNew}
              />
            )}
          </motion.div>
        </AnimatePresence>
        </Suspense>
      </div>

      {/* Footer */}
      {step !== 'waiting' && step !== 'capture' && (
        <AppFooter
          step={step}
          stepIndex={stepIndex}
          totalSteps={STEPS.length - 1}
          onBack={goBack}
          onNext={goNext}
          canGoBack={stepIndex > 1}
          canGoNext={stepIndex < STEPS.length - 1}
        />
      )}

      {/* Kiosk Idle Timeout Manager */}
      <IdleTimeoutManager
        currentStep={step}
        onReset={handleStartNew}
      />

      {/* Admin Panel Modal */}
      {showAdmin && (
        <Suspense fallback={null}>
          <AdminPanelModal
            isOpen={showAdmin}
            onClose={() => setShowAdmin(false)}
          />
        </Suspense>
      )}

      {/* Toast notifications */}
      <ToastContainer />
    </div>
  )
}

// ─── Demo Mode: Simulate Pi upload ────────────────────────────────────────────
async function simulatePiUpload(sessionId: string) {
  const addPhoto = useSessionStore.getState().addPhoto
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
  for (let i = 0; i < demoFiles.length; i++) {
    const demo = demoFiles[i]
    addPhoto({
      id: `demo-${i + 1}-${Date.now()}`,
      sessionId,
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
  }
  useSessionStore.getState().save()
}

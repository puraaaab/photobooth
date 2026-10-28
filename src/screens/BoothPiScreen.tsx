import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import {
  Camera, Sparkles, Check, Delete, Ticket, AlertTriangle,
  AlertCircle, Maximize2, Minimize2, CheckCircle2, Clock, CameraOff,
  ArrowLeft, RefreshCw, X
} from 'lucide-react'

// ─── Config ───────────────────────────────────────────────────────────────────
export function getSavedPiIp(): string {
  if (typeof window !== 'undefined') {
    const saved = localStorage.getItem('papit_pi_ip')
    if (saved && saved.trim()) return saved.trim()
    if (window.location.hostname === 'raspberrypi.local' || window.location.hostname === '192.168.29.69') {
      return 'localhost'
    }
  }
  return '192.168.29.69'
}

export function setSavedPiIp(ip: string): void {
  if (typeof window !== 'undefined') {
    localStorage.setItem('papit_pi_ip', ip.trim())
  }
}

export const getBoothServerUrl = (): string => {
  if (typeof window === 'undefined') return 'http://localhost:3847'
  if ((window as any).__BOOTH_SERVER_URL__) return (window as any).__BOOTH_SERVER_URL__
  if (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1') {
    return 'http://localhost:3847'
  }
  if (window.location.hostname) {
    return `http://${window.location.hostname}:3847`
  }
  return 'http://192.168.29.33:3847'
}

export const MAIN_SERVER_URL = getBoothServerUrl()

export const getCameraStreamUrl = (piIp = getSavedPiIp()): string => {
  if (typeof window !== 'undefined' && (window as any).__CAMERA_STREAM_URL__) {
    return (window as any).__CAMERA_STREAM_URL__
  }
  if (typeof window !== 'undefined' && (window.location.hostname === '192.168.29.69' || window.location.hostname === 'raspberrypi.local')) {
    return 'http://localhost:8080/stream'
  }
  return `http://${piIp}:8080/stream`
}

export const getCameraCaptureUrl = (piIp = getSavedPiIp()): string => {
  if (typeof window !== 'undefined' && (window as any).__CAMERA_CAPTURE_URL__) {
    return (window as any).__CAMERA_CAPTURE_URL__
  }
  if (typeof window !== 'undefined' && (window.location.hostname === '192.168.29.69' || window.location.hostname === 'raspberrypi.local')) {
    return 'http://localhost:8081/capture'
  }
  return `http://${piIp}:8081/capture`
}

const CAMERA_STREAM_URL = getCameraStreamUrl()
const CAMERA_CAPTURE_URL = getCameraCaptureUrl()

const SESSION_DURATION_S = 90      // Total booth time (seconds)
const COUNTDOWN_SECONDS = 2      // 2s countdown before each shot
const PREVIEW_SECONDS = 0      // No pause after capture — next shot starts immediately
// Hardware ROI & Digital Scale mapping for Raspberry Pi & Webcams
export const ZOOM_LEVEL_ROIS: Record<string, { roi: string; scale: number }> = {
  '1': { roi: '0,0,1,1', scale: 1.0 },
  '2': { roi: '0.25,0.25,0.5,0.5', scale: 2.0 },
  '3.5': { roi: '0.357,0.357,0.286,0.286', scale: 3.5 },
  '4': { roi: '0.375,0.375,0.25,0.25', scale: 4.0 },
}
const ZOOM_ROI = ZOOM_LEVEL_ROIS['1'].roi
// At 2s per shot in 90s = ~45 shots max; cap at 50 for safety
const MAX_SHOTS_SAFETY = 50

// ─── Camera Filter Presets (Apple True Tone & Styles) ────────────────────────
interface CameraFilterPreset {
  id: string
  label: string
  shortLabel: string
  description: string
  filterCss: string
}

const CAMERA_FILTER_PRESETS: CameraFilterPreset[] = [
  {
    id: 'apple_natural',
    label: 'Apple Natural (True Tone)',
    shortLabel: 'True Tone',
    description: 'iPhone warm skin tones, crisp details, natural contrast',
    filterCss: 'contrast(1.06) saturate(1.16) brightness(1.02) sepia(0.06) hue-rotate(-2deg)',
  },
  {
    id: 'haru_soft',
    label: 'Haru Soft (Korean Booth)',
    shortLabel: 'Haru',
    description: 'Korean photobooth high-key bright lighting, soft shadows, clear porcelain skin',
    filterCss: 'brightness(1.10) contrast(0.96) saturate(1.08) sepia(0.04)',
  },
  {
    id: 'life4cuts_pink',
    label: 'Life4Cuts Pink (인생네컷)',
    shortLabel: 'Life4Cuts',
    description: 'Youthful peachy blush & rosy skin glow for vibrant Korean 4-cut memories',
    filterCss: 'brightness(1.08) contrast(1.04) saturate(1.22) sepia(0.06) hue-rotate(-6deg)',
  },
  {
    id: 'kardashian_glam',
    label: 'Kardashian Glam (B&W)',
    shortLabel: 'Glam B&W',
    description: 'Signature celebrity high-contrast B&W with glowing skin and deep inky blacks',
    filterCss: 'grayscale(1) contrast(1.45) brightness(1.06)',
  },
  {
    id: 'kodak_portra',
    label: 'Kodak Portra 400',
    shortLabel: 'Portra',
    description: 'Legendary analog portrait film with warm creamy skin tones and gentle highlights',
    filterCss: 'contrast(1.08) saturate(1.12) brightness(1.03) sepia(0.10) hue-rotate(-2deg)',
  },
  {
    id: 'y2k_flash',
    label: 'Y2K Digicam Flash',
    shortLabel: 'Y2K',
    description: '2000s direct flash snapshot look with cool cyber tones and crisp contrast',
    filterCss: 'contrast(1.25) saturate(1.16) brightness(1.06) hue-rotate(4deg)',
  },
  {
    id: 'disposable_90s',
    label: '90s Disposable Cam',
    shortLabel: '90s Cam',
    description: 'Authentic 90s party disposable flash camera with punchy saturation and warmth',
    filterCss: 'contrast(1.18) saturate(1.25) brightness(1.04) sepia(0.12) hue-rotate(-4deg)',
  },
  {
    id: 'golden_hour',
    label: 'Golden Hour (Warm)',
    shortLabel: 'Golden',
    description: 'Sunlit warmth removing sensor blue tint for portrait skin tones',
    filterCss: 'contrast(1.05) saturate(1.18) brightness(1.03) sepia(0.12) hue-rotate(-3deg)',
  },
  {
    id: 'studio_crisp',
    label: 'Studio Crisp',
    shortLabel: 'Studio',
    description: 'High dynamic range, deep contrast, pure clarity',
    filterCss: 'contrast(1.12) saturate(1.08) brightness(1.02)',
  },
  {
    id: 'apple_vibrant',
    label: 'Apple Vibrant',
    shortLabel: 'Vibrant',
    description: 'Punchy Apple photographic style with vivid colors',
    filterCss: 'contrast(1.10) saturate(1.28) brightness(1.03) sepia(0.04)',
  },
  {
    id: 'teal_orange',
    label: 'Teal & Orange (Cinema)',
    shortLabel: 'Teal & Orange',
    description: 'Blockbuster movie color grade with warm skin and cool shadows',
    filterCss: 'contrast(1.18) saturate(1.14) sepia(0.08) hue-rotate(-8deg)',
  },
  {
    id: 'none',
    label: 'Raw (No Filter)',
    shortLabel: 'Raw',
    description: 'Direct unadjusted camera sensor output',
    filterCss: 'none',
  },
]

async function applyFilterToBlob(blob: Blob, filterCss: string): Promise<Blob> {
  return new Promise((resolve) => {
    const img = new Image()
    const url = URL.createObjectURL(blob)
    img.onload = () => {
      try {
        const canvas = document.createElement('canvas')
        canvas.width = img.naturalWidth || img.width
        canvas.height = img.naturalHeight || img.height
        const ctx = canvas.getContext('2d')
        if (!ctx) {
          URL.revokeObjectURL(url)
          return resolve(blob)
        }
        // Mirror the image horizontally so it matches the mirrored photobooth mirror view
        ctx.translate(canvas.width, 0)
        ctx.scale(-1, 1)
        if (filterCss && filterCss !== 'none') {
          ctx.filter = filterCss
        }
        ctx.drawImage(img, 0, 0, canvas.width, canvas.height)
        canvas.toBlob(
          (filteredBlob) => {
            URL.revokeObjectURL(url)
            resolve(filteredBlob || blob)
          },
          'image/jpeg',
          0.98
        )
      } catch {
        URL.revokeObjectURL(url)
        resolve(blob)
      }
    }
    img.onerror = () => {
      URL.revokeObjectURL(url)
      resolve(blob)
    }
    img.src = url
  })
}

// ─── Types ────────────────────────────────────────────────────────────────────
type BoothState =
  | 'idle'
  | 'ticket_entry'
  | 'verifying'
  | 'session_start'
  | 'countdown'
  | 'flash'
  | 'preview'
  | 'uploading'
  | 'session_done'
  | 'error'

type UploadStatus = 'pending' | 'uploading' | 'success' | 'failed' | 'retrying'

interface CapturedShot {
  index: number
  localUrl: string        // objectURL in memory (from camera server)
  uploadStatus: UploadStatus
  uploadedUrl?: string    // URL on main PC server after upload
  retryCount: number
}

// ─── Main Component ───────────────────────────────────────────────────────────
export function BoothPiScreen() {
  const [state, setState] = useState<BoothState>('idle')
  const [ticketCode, setTicketCode] = useState('')
  const [ticketId, setTicketId] = useState<string | null>(null)
  const [sessionId, setSessionId] = useState<string | null>(null)
  const [sessionToken, setSessionToken] = useState<string | null>(null)
  const [errorMsg, setErrorMsg] = useState('')
  const [shotIndex, setShotIndex] = useState(0)
  const [shots, setShots] = useState<CapturedShot[]>([])
  const [countdown, setCountdown] = useState(COUNTDOWN_SECONDS)
  const [previewCountdown, setPreviewCountdown] = useState(PREVIEW_SECONDS)
  const [sessionTime, setSessionTime] = useState(SESSION_DURATION_S)
  const [previewUrl, setPreviewUrl] = useState<string | null>(null)
  const [flash, setFlash] = useState(false)
  const [streamOk, setStreamOk] = useState(true)
  const [serverConfirmedCount, setServerConfirmedCount] = useState(0)
  const [allConfirmed, setAllConfirmed] = useState(false)

  // Camera Quality Profile State
  const [activeFilterId, setActiveFilterId] = useState<string>(() => {
    if (typeof window !== 'undefined') {
      return localStorage.getItem('pb_camera_filter') || 'apple_natural'
    }
    return 'apple_natural'
  })
  const [showFilterPicker, setShowFilterPicker] = useState(false)

  const currentFilter = useMemo(() => {
    return CAMERA_FILTER_PRESETS.find(p => p.id === activeFilterId) || CAMERA_FILTER_PRESETS[0]
  }, [activeFilterId])

  const handleSelectFilter = (id: string) => {
    setActiveFilterId(id)
    if (typeof window !== 'undefined') {
      localStorage.setItem('pb_camera_filter', id)
    }
  }

  const videoRef = useRef<HTMLVideoElement | null>(null)
  const imageRef = useRef<HTMLImageElement | null>(null)

  // Camera Hardware & Digital Zoom Level (1X, 2X, 3.5X, 4X)
  const [selectedZoom, setSelectedZoom] = useState<string>(() => {
    if (typeof window !== 'undefined') {
      return localStorage.getItem('pb_camera_zoom') || '1'
    }
    return '1'
  })
  const selectedZoomRef = useRef<string>(selectedZoom)
  useEffect(() => {
    selectedZoomRef.current = selectedZoom
    if (typeof window !== 'undefined') {
      localStorage.setItem('pb_camera_zoom', selectedZoom)
    }
  }, [selectedZoom])

  // Camera Active IP & Mode Tracking
  const [activePiIp, setActivePiIp] = useState<string>(getSavedPiIp())
  const activePiIpRef = useRef<string>(activePiIp)
  useEffect(() => {
    activePiIpRef.current = activePiIp
  }, [activePiIp])

  const [isPiStreamActive, setIsPiStreamActive] = useState<boolean>(false)
  const isPiStreamActiveRef = useRef<boolean>(false)
  useEffect(() => {
    isPiStreamActiveRef.current = isPiStreamActive
  }, [isPiStreamActive])

  // Discover active camera IP on mount
  useEffect(() => {
    const discover = async () => {
      try {
        const res = await fetch(`${MAIN_SERVER_URL}/api/camera/discover`, { signal: AbortSignal.timeout(3000) })
        if (res.ok) {
          const data = await res.json()
          if (data?.piIp) {
            setActivePiIp(data.piIp)
            setSavedPiIp(data.piIp)
          }
        }
      } catch {}
    }
    discover()
  }, [])

  const sessionTimerRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const countdownTimerRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const previewTimerRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const isCompleteRef = useRef(false)

  // Stable refs so timer callbacks always see current values without stale closures
  const sessionIdRef = useRef<string | null>(null)
  const ticketIdRef = useRef<string | null>(null)
  const sessionTokenRef = useRef<string | null>(null)
  const shotsCountRef = useRef(0)   // tracks how many shots were taken
  const shotsRef = useRef<CapturedShot[]>([])

  useEffect(() => { sessionIdRef.current = sessionId }, [sessionId])
  useEffect(() => { ticketIdRef.current = ticketId }, [ticketId])
  useEffect(() => { sessionTokenRef.current = sessionToken }, [sessionToken])
  useEffect(() => { shotsRef.current = shots }, [shots])

  // ─── Cleanup ──────────────────────────────────────────────────────────────
  const clearAllTimers = useCallback(() => {
    if (sessionTimerRef.current) clearInterval(sessionTimerRef.current)
    if (countdownTimerRef.current) clearInterval(countdownTimerRef.current)
    if (previewTimerRef.current) clearInterval(previewTimerRef.current)
    sessionTimerRef.current = null
    countdownTimerRef.current = null
    previewTimerRef.current = null
  }, [])

  useEffect(() => () => clearAllTimers(), [clearAllTimers])

  // ─── Session Master Timer (90s) ──────────────────────────────────────────
  // When time runs out it finalizes everything — ticket status + integrity poll
  const startSessionTimer = useCallback((onExpire: () => void) => {
    isCompleteRef.current = false
    setSessionTime(SESSION_DURATION_S)
    sessionTimerRef.current = setInterval(() => {
      setSessionTime(prev => {
        if (prev <= 1) {
          clearAllTimers()
          if (!isCompleteRef.current) {
            isCompleteRef.current = true
            onExpire()
          }
          return 0
        }
        return prev - 1
      })
    }, 1000)
  }, [clearAllTimers])

  // ─── Ticket Verification ─────────────────────────────────────────────────
  const verifyTicket = useCallback(async (code: string) => {
    if (code.length < 4) return
    setState('verifying')
    setErrorMsg('')
    try {
      // 5-second AbortController so it never hangs indefinitely
      const controller = new AbortController()
      const timeoutId = setTimeout(() => controller.abort(), 5000)

      const candidateEndpoints = [
        `${MAIN_SERVER_URL}/api/tickets/${code}`,
        typeof window !== 'undefined' ? `${window.location.origin}/api/tickets/${code}` : '',
        `http://192.168.29.33:3847/api/tickets/${code}`,
        `http://localhost:3847/api/tickets/${code}`,
      ].filter(Boolean)

      let res: Response | null = null
      let successfulBase = MAIN_SERVER_URL

      for (const endpoint of candidateEndpoints) {
        try {
          const r = await fetch(endpoint, { signal: controller.signal })
          if (r.ok || r.status === 404 || r.status === 400) {
            res = r
            successfulBase = endpoint.replace(/\/api\/tickets\/.*$/, '')
            break
          }
        } catch {}
      }
      clearTimeout(timeoutId)

      if (!res || !res.ok) {
        setErrorMsg('Ticket not found. Please check your ticket code.')
        setState('ticket_entry')
        return
      }
      const data = await res.json()
      const ticket = data.ticket
      if (!ticket) {
        setErrorMsg('Invalid ticket code.')
        setState('ticket_entry')
        return
      }
      if (ticket.status === 'COMPLETED' || ticket.status === 'CANCELLED') {
        setErrorMsg(`Ticket #${code} has already been used.`)
        setState('ticket_entry')
        return
      }
      if (ticket.status === 'IN_BOOTH') {
        setErrorMsg(`Ticket #${code} is already in a booth session.`)
        setState('ticket_entry')
        return
      }
      if (ticket.paymentMethod === 'CASH' && ticket.paymentStatus !== 'PAID') {
        setErrorMsg(`⚠️ Payment Due: Please pay ₹${ticket.paymentAmount ?? ticket.planType ?? 99} at the counter before starting.`)
        setState('ticket_entry')
        return
      }
      // Create session on main server
      const sessRes = await fetch(`${successfulBase}/api/session/create`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ticketCode: code }),
        signal: AbortSignal.timeout(5000),
      })
      const sessData = sessRes.ok ? await sessRes.json() : {}
      const newSessionId = sessData.sessionId || `local-${Date.now()}`
      setSessionId(newSessionId)
      setSessionToken(sessData.sessionToken || null)
      setTicketId(ticket.id)

      // Mark ticket as IN_BOOTH
      await fetch(`${successfulBase}/api/tickets/${ticket.id}/status`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: 'IN_BOOTH', sessionId: newSessionId }),
        signal: AbortSignal.timeout(4000),
      }).catch(() => { })

      setState('session_start')
    } catch (err: any) {
      console.warn('[BoothPi] Ticket verify error:', err)
      const isTimeout = err?.name === 'AbortError' || err?.name === 'TimeoutError'
      setErrorMsg(isTimeout ? 'Server response timed out. Please check server connection.' : 'Cannot connect to server. Please ask staff for help.')
      setState('ticket_entry')
    }
  }, [])

  // ─── Capture Photo with Multi-Tier Fallback ──────────────────────────────
  const capturePhoto = useCallback(async (index: number): Promise<string | null> => {
    const filter = currentFilter.filterCss
    const curZoomLvl = selectedZoomRef.current || '1'
    const zoomCfg = ZOOM_LEVEL_ROIS[curZoomLvl] || ZOOM_LEVEL_ROIS['1']
    const activeRoi = zoomCfg.roi
    const activeScale = zoomCfg.scale
    const currentIp = activePiIpRef.current || getSavedPiIp() || '192.168.29.69'

    // 1. Try port 8081 capture endpoints (:8081/capture) - RAW NATIVE HARDWARE SENSOR CAPTURE
    const candidateCaptureEndpoints = [
      `http://${currentIp}:8081/capture`,
      'http://192.168.29.69:8081/capture',
      `${MAIN_SERVER_URL}/api/camera/capture`,
      getCameraCaptureUrl(currentIp),
      '/api/camera/capture',
    ].filter(Boolean)

    for (const endpoint of candidateCaptureEndpoints) {
      try {
        const controller = new AbortController()
        const timer = setTimeout(() => controller.abort(), 2400)
        const res = await fetch(endpoint, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            roi: activeRoi,
            quality: 98,
            sessionId: sessionId || `session-${Date.now()}`,
            shotIndex: index + 1,
          }),
          signal: controller.signal,
        })
        clearTimeout(timer)
        if (res.ok) {
          const blob = await res.blob()
          if (blob.size > 2000) {
            const processedBlob = await applyFilterToBlob(blob, filter)
            return URL.createObjectURL(processedBlob)
          }
        }
      } catch { }
    }

    // 2. High-reliability fallback: capture from live MJPEG stream <img> element
    // NOTE: The Raspberry Pi camera is ALREADY hardware-zoomed by the sensor via ROI!
    // We MUST draw the full uncropped frame so 100% of optical sensor pixels are preserved!
    if (imageRef.current && imageRef.current.naturalWidth > 0) {
      try {
        const img = imageRef.current
        const canvas = document.createElement('canvas')
        canvas.width = img.naturalWidth
        canvas.height = img.naturalHeight
        const ctx = canvas.getContext('2d')
        if (ctx) {
          ctx.imageSmoothingEnabled = true
          ctx.imageSmoothingQuality = 'high'
          ctx.translate(canvas.width, 0)
          ctx.scale(-1, 1) // Mirrored selfie view matching preview
          if (filter && filter !== 'none') {
            ctx.filter = filter
          }
          ctx.drawImage(img, 0, 0, canvas.width, canvas.height)
          return canvas.toDataURL('image/jpeg', 0.98)
        }
      } catch (err) {
        console.warn('[BoothPi] MJPEG element frame capture error:', err)
      }
    }

    // 3. Fallback: capture from live <video> element (Local Webcam only)
    if (videoRef.current && videoRef.current.videoWidth > 0) {
      try {
        const vid = videoRef.current
        const canvas = document.createElement('canvas')
        canvas.width = vid.videoWidth
        canvas.height = vid.videoHeight
        const ctx = canvas.getContext('2d')
        if (ctx) {
          ctx.imageSmoothingEnabled = true
          ctx.imageSmoothingQuality = 'high'
          ctx.translate(canvas.width, 0)
          ctx.scale(-1, 1) // Mirrored selfie view
          if (filter && filter !== 'none') {
            ctx.filter = filter
          }
          // Only local webcam needs digital canvas crop since it lacks Pi hardware ROI
          if (activeScale > 1.01 && !isPiStreamActiveRef.current) {
            const sw = canvas.width / activeScale
            const sh = canvas.height / activeScale
            const sx = (canvas.width - sw) / 2
            const sy = (canvas.height - sh) / 2
            ctx.drawImage(vid, sx, sy, sw, sh, 0, 0, canvas.width, canvas.height)
          } else {
            ctx.drawImage(vid, 0, 0, canvas.width, canvas.height)
          }
          return canvas.toDataURL('image/jpeg', 0.98)
        }
      } catch (err) {
        console.warn('[BoothPi] Video element frame capture error:', err)
      }
    }

    return null
  }, [sessionId, currentFilter])

  // ─── Upload One Photo (handles blob URLs & data URLs) ─────────────────────
  const uploadOneShot = useCallback(async (
    shot: CapturedShot,
    sid: string,
    isRetry = false,
  ): Promise<boolean> => {
    const status: UploadStatus = isRetry ? 'retrying' : 'uploading'
    setShots(prev => prev.map(s =>
      s.index === shot.index ? { ...s, uploadStatus: status } : s
    ))
    try {
      let blob: Blob
      if (shot.localUrl.startsWith('data:')) {
        const parts = shot.localUrl.split(',')
        const byteCharacters = atob(parts[1])
        const byteNumbers = new Array(byteCharacters.length)
        for (let i = 0; i < byteCharacters.length; i++) {
          byteNumbers[i] = byteCharacters.charCodeAt(i)
        }
        const byteArray = new Uint8Array(byteNumbers)
        blob = new Blob([byteArray], { type: 'image/jpeg' })
      } else {
        const res = await fetch(shot.localUrl)
        blob = await res.blob()
      }

      const form = new FormData()
      form.append('photo', blob, `shot-${shot.index + 1}-${Date.now()}.jpg`)
      const uploadHeaders: Record<string, string> = {
        'X-Session-Id': sid,
        'X-Booth-Internal': 'true',
      }
      if (sessionToken) {
        uploadHeaders['Authorization'] = `Bearer ${sessionToken}`
      }
      const uploadRes = await fetch(`${MAIN_SERVER_URL}/api/photos/upload`, {
        method: 'POST',
        headers: uploadHeaders,
        body: form,
      })
      if (uploadRes.ok) {
        const d = await uploadRes.json()
        setShots(prev => prev.map(s =>
          s.index === shot.index
            ? { ...s, uploadStatus: 'success', uploadedUrl: d.previewUrl }
            : s
        ))
        return true
      }
    } catch (err) {
      console.warn('[BoothPi] Upload shot error:', err)
    }
    setShots(prev => prev.map(s =>
      s.index === shot.index
        ? { ...s, uploadStatus: 'failed', retryCount: (s.retryCount || 0) + 1 }
        : s
    ))
    return false
  }, [sessionToken])

  // ─── Batch Upload All Photos at Session End ───────────────────────────────
  const uploadAllShotsBatch = useCallback(async (allShots: CapturedShot[], sid: string) => {
    console.log(`[BoothPi] Starting batch upload of ${allShots.length} photos...`)
    const queue = [...allShots]
    const worker = async () => {
      while (queue.length > 0) {
        const item = queue.shift()
        if (item) {
          await uploadOneShot(item, sid)
        }
      }
    }
    // Upload 2 in parallel for fast, smooth transfer
    await Promise.all([worker(), worker()])
  }, [uploadOneShot])

  // ─── Retry all failed shots ───────────────────────────────────────────────
  const retryFailed = useCallback(async (sid: string) => {
    setShots(prev => {
      const failed = prev.filter(s => s.uploadStatus === 'failed' && s.retryCount < 5)
      failed.forEach(s => uploadOneShot(s, sid, true))
      return prev
    })
  }, [uploadOneShot])

  // ─── Poll server to verify photo count integrity ──────────────────────────
  const startIntegrityPolling = useCallback((sid: string, targetCount: number) => {
    let attempts = 0
    const MAX = 30
    const poll = async () => {
      attempts++
      try {
        const res = await fetch(`${MAIN_SERVER_URL}/api/session/${sid}`)
        if (res.ok) {
          const data = await res.json()
          const count = data.session?.photos?.length ?? data.photos?.length ?? 0
          setServerConfirmedCount(count)
          if (count >= targetCount) {
            setAllConfirmed(true)
            return // Done!
          }
        }
      } catch { }
      if (attempts < MAX) setTimeout(poll, 3000)
    }
    setTimeout(poll, 2000)
  }, [])

  // ─── Start Per-Shot Countdown — loops continuously until session ends ─────
  const startShot = useCallback((index: number) => {
    if (isCompleteRef.current) return
    if (index >= MAX_SHOTS_SAFETY) {
      // Safety cap reached — finalize
      isCompleteRef.current = true
      clearAllTimers()
      setState('session_done')
      const sid = sessionIdRef.current
      const tid = ticketIdRef.current
      const taken = shotsCountRef.current
      const currentShots = shotsRef.current

      if (sid && currentShots.length > 0) {
        uploadAllShotsBatch(currentShots, sid).then(() => {
          if (sid) startIntegrityPolling(sid, taken)
          if (tid && sid) {
            fetch(`${MAIN_SERVER_URL}/api/tickets/${tid}/status`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ status: 'EDITING', sessionId: sid, photoCount: taken }),
            }).catch(() => { })
          }
        })
      }
      return
    }

    setShotIndex(index)
    setCountdown(COUNTDOWN_SECONDS)
    setState('countdown')

    let current = COUNTDOWN_SECONDS
    countdownTimerRef.current = setInterval(async () => {
      current -= 1
      if (current > 0) {
        setCountdown(current)
      } else {
        clearInterval(countdownTimerRef.current!)
        countdownTimerRef.current = null

        // If session ended while we were counting down, stop here
        if (isCompleteRef.current) return

        // Flash
        setFlash(true)
        setState('flash')
        setTimeout(() => setFlash(false), 250)

        // Capture fresh frame from camera server
        let localUrl: string | null = null
        try {
          localUrl = await capturePhoto(index)
        } catch (err) {
          console.warn('[BoothPi] capturePhoto exception:', err)
        }
        const displayUrl = localUrl || `data:image/svg+xml,<svg xmlns='http://www.w3.org/2000/svg'/>`
        setPreviewUrl(displayUrl)

        // Add shot locally — ZERO upload traffic during shooting session!
        const newShot: CapturedShot = {
          index,
          localUrl: displayUrl,
          uploadStatus: 'pending',
          retryCount: 0,
        }
        setShots(prev => {
          const next = [...prev, newShot]
          shotsRef.current = next
          return next
        })
        shotsCountRef.current = index + 1

        // Show captured photo + countdown before next shot
        // If PREVIEW_SECONDS is 0, skip the preview state entirely
        if (PREVIEW_SECONDS === 0) {
          if (!isCompleteRef.current) {
            setTimeout(() => {
              if (!isCompleteRef.current) startShot(index + 1)
            }, 60)
          }
          return
        }

        const previewDuration: number = PREVIEW_SECONDS
        setPreviewCountdown(previewDuration)
        setState('preview')

        let pCount = previewDuration
        if (previewTimerRef.current) clearInterval(previewTimerRef.current)
        previewTimerRef.current = setInterval(() => {
          pCount -= 1
          if (pCount > 0) {
            setPreviewCountdown(pCount)
          } else {
            if (previewTimerRef.current) clearInterval(previewTimerRef.current)
            previewTimerRef.current = null

            // Session ended while showing preview — already handled by session timer
            if (isCompleteRef.current) return

            // Continue to next shot — no limit, keeps going until timer fires
            startShot(index + 1)
          }
        }, 1000)
      }
    }, 1000)
  }, [capturePhoto, clearAllTimers, uploadAllShotsBatch, startIntegrityPolling])

  // ─── Start Full Session ───────────────────────────────────────────────────
  const startSession = useCallback(() => {
    setShots([])
    shotsRef.current = []
    setShotIndex(0)
    setServerConfirmedCount(0)
    setAllConfirmed(false)
    isCompleteRef.current = false
    shotsCountRef.current = 0

    // Session timer fires when 90s expire — finalizes everything & uploads all shots!
    startSessionTimer(async () => {
      setState('session_done')
      const sid = sessionIdRef.current
      const tid = ticketIdRef.current
      const taken = shotsCountRef.current
      const currentShots = shotsRef.current

      // Batch upload all locally captured photos now that shooting is complete!
      if (sid && currentShots.length > 0) {
        await uploadAllShotsBatch(currentShots, sid)
      }

      if (sid) startIntegrityPolling(sid, taken)
      if (tid && sid) {
        fetch(`${MAIN_SERVER_URL}/api/tickets/${tid}/status`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ status: 'EDITING', sessionId: sid, photoCount: taken }),
        }).catch(() => { })
      }
    })

    startShot(0)
  }, [startSessionTimer, startShot, startIntegrityPolling, uploadAllShotsBatch])

  // ─── Reset to Idle ────────────────────────────────────────────────────────
  const resetToIdle = useCallback(() => {
    clearAllTimers()
    isCompleteRef.current = false
    setTicketCode('')
    setTicketId(null)
    setSessionId(null)
    setSessionToken(null)
    setShots([])
    setShotIndex(0)
    setPreviewUrl(null)
    setErrorMsg('')
    setCountdown(COUNTDOWN_SECONDS)
    setSessionTime(SESSION_DURATION_S)
    setState('idle')
  }, [clearAllTimers])

  // ─── Numpad Handler ───────────────────────────────────────────────────────
  const handleNumpad = useCallback((key: string) => {
    if (key === 'backspace') {
      setTicketCode(prev => prev.slice(0, -1))
      setErrorMsg('')
    } else if (key === 'confirm') {
      verifyTicket(ticketCode)
    } else if (ticketCode.length < 4 && /^\d$/.test(key)) {
      const next = ticketCode + key
      setTicketCode(next)
      if (next.length === 4) setTimeout(() => verifyTicket(next), 150)
    }
  }, [ticketCode, verifyTicket])

  // ─── Format time mm:ss ───────────────────────────────────────────────────
  const formatTime = (s: number) =>
    `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`

  const [isFullscreen, setIsFullscreen] = useState(false)

  useEffect(() => {
    const updateFs = () => {
      const doc = document as any
      setIsFullscreen(Boolean(doc.fullscreenElement || doc.webkitFullscreenElement || doc.mozFullScreenElement || doc.msFullscreenElement))
    }
    document.addEventListener('fullscreenchange', updateFs)
    document.addEventListener('webkitfullscreenchange', updateFs)
    document.addEventListener('mozfullscreenchange', updateFs)
    document.addEventListener('MSFullscreenChange', updateFs)
    updateFs()

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'F11' || (e.key.toLowerCase() === 'f' && !['input', 'textarea'].includes((e.target as HTMLElement)?.tagName?.toLowerCase() || ''))) {
        e.preventDefault()
        toggleFullscreen()
      }
    }
    window.addEventListener('keydown', handleKeyDown)

    return () => {
      document.removeEventListener('fullscreenchange', updateFs)
      document.removeEventListener('webkitfullscreenchange', updateFs)
      document.removeEventListener('mozfullscreenchange', updateFs)
      document.removeEventListener('MSFullscreenChange', updateFs)
      window.removeEventListener('keydown', handleKeyDown)
    }
  }, [])

  const toggleFullscreen = (e?: React.MouseEvent) => {
    e?.stopPropagation()
    const doc = document as any
    const docEl = document.documentElement as any
    const isFs = Boolean(doc.fullscreenElement || doc.webkitFullscreenElement || doc.mozFullScreenElement || doc.msFullscreenElement)

    if (!isFs) {
      if (docEl.requestFullscreen) {
        docEl.requestFullscreen().catch(() => { })
      } else if (docEl.webkitRequestFullscreen) {
        docEl.webkitRequestFullscreen()
      } else if (docEl.mozRequestFullScreen) {
        docEl.mozRequestFullScreen()
      } else if (docEl.msRequestFullscreen) {
        docEl.msRequestFullscreen()
      }
    } else {
      if (doc.exitFullscreen) {
        doc.exitFullscreen().catch(() => { })
      } else if (doc.webkitExitFullscreen) {
        doc.webkitExitFullscreen()
      } else if (doc.mozCancelFullScreen) {
        doc.mozCancelFullScreen()
      } else if (doc.msExitFullscreen) {
        doc.msExitFullscreen()
      }
    }
  }

  const handleIdleTouch = () => {
    const doc = document as any
    const docEl = document.documentElement as any
    if (!doc.fullscreenElement && !doc.webkitFullscreenElement) {
      if (docEl.requestFullscreen) docEl.requestFullscreen().catch(() => { })
      else if (docEl.webkitRequestFullscreen) docEl.webkitRequestFullscreen()
    }
    setState('ticket_entry')
  }

  // ─── Render ───────────────────────────────────────────────────────────────
  return (
    <div style={styles.root}>
      {/* Floating Action Bar: visible on idle, ticket_entry, and session_start */}
      {(state === 'idle' || state === 'ticket_entry' || state === 'session_start') && (
        <div
          style={{
            position: 'absolute',
            top: 10,
            right: 12,
            display: 'flex',
            alignItems: 'center',
            gap: 8,
            zIndex: 110,
          }}
        >
          {/* Apple Camera Filter Profile Selector */}
          <button
            onClick={(e) => {
              e.stopPropagation()
              setShowFilterPicker(prev => !prev)
            }}
            style={{
              background: showFilterPicker ? 'rgba(109, 6, 38, 0.18)' : 'rgba(109, 6, 38, 0.08)',
              border: '1.5px solid rgba(109, 6, 38, 0.22)',
              borderRadius: 9999,
              color: '#6D0626',
              padding: '5px 12px',
              fontSize: 11,
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: 6,
              fontFamily: "'DM Mono', monospace",
              fontWeight: 700,
              boxShadow: '0 2px 8px rgba(109,6,38,0.06)',
              transition: 'all 0.15s ease',
            }}
            title="Apple Camera Quality & Color Profile"
          >
            <Sparkles size={13} color="#C71B4D" />
            <span>{currentFilter.shortLabel}</span>
          </button>

          {/* Fullscreen Button */}
          <button
            onClick={toggleFullscreen}
            style={{
              background: isFullscreen ? 'rgba(109, 6, 38, 0.05)' : 'rgba(109, 6, 38, 0.08)',
              border: '1.5px solid rgba(109, 6, 38, 0.22)',
              borderRadius: 9999,
              color: '#6D0626',
              padding: '5px 13px',
              fontSize: 11,
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: 5,
              fontFamily: "'DM Mono', monospace",
              fontWeight: 700,
              boxShadow: '0 2px 8px rgba(109,6,38,0.06)',
              transition: 'all 0.15s ease',
            }}
            title={isFullscreen ? 'Exit Fullscreen (F11)' : 'Enter Fullscreen (F11)'}
          >
            {isFullscreen ? <Minimize2 size={13} /> : <Maximize2 size={13} />}
            <span>{isFullscreen ? 'Exit Full' : 'Fullscreen'}</span>
          </button>
        </div>
      )}

      {/* Apple Camera Filter Profile Selector Popover */}
      <AnimatePresence>
        {showFilterPicker && (
          <motion.div
            initial={{ opacity: 0, y: -8, scale: 0.96 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -8, scale: 0.96 }}
            transition={{ duration: 0.16 }}
            onClick={(e) => e.stopPropagation()}
            style={{
              position: 'absolute',
              top: 48,
              right: 12,
              width: 330,
              maxHeight: 'calc(100vh - 64px)',
              overflowY: 'auto',
              background: '#FFFFFF',
              borderRadius: 16,
              border: '1px solid rgba(109, 6, 38, 0.15)',
              boxShadow: '0 20px 48px rgba(109, 6, 38, 0.18), 0 4px 12px rgba(0,0,0,0.08)',
              padding: '16px',
              zIndex: 120,
              color: '#2F010E',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
                <Sparkles size={16} color="#C71B4D" />
                <span style={{ fontSize: 13, fontWeight: 800, fontFamily: "'Outfit', sans-serif" }}>
                  Photobooth Camera Styles
                </span>
              </div>
              <button
                onClick={() => setShowFilterPicker(false)}
                style={{
                  background: 'none',
                  border: 'none',
                  cursor: 'pointer',
                  padding: 4,
                  borderRadius: 6,
                  color: '#6D0626',
                  display: 'flex',
                  alignItems: 'center',
                }}
              >
                <X size={16} />
              </button>
            </div>

            <p style={{ fontSize: 11, color: '#7A5560', margin: '0 0 12px', lineHeight: 1.4 }}>
              Live real-time styles: Korean K-booth, Kardashian Glam, Portra film, and True Tone.
            </p>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              {CAMERA_FILTER_PRESETS.map((preset) => {
                const isSelected = preset.id === activeFilterId
                return (
                  <button
                    key={preset.id}
                    onClick={() => {
                      handleSelectFilter(preset.id)
                      setShowFilterPicker(false)
                    }}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      padding: '10px 12px',
                      borderRadius: 12,
                      border: isSelected ? '1.5px solid #C71B4D' : '1px solid rgba(109, 6, 38, 0.08)',
                      background: isSelected ? 'rgba(199, 27, 77, 0.08)' : '#FAFAFA',
                      cursor: 'pointer',
                      textAlign: 'left',
                      transition: 'all 0.15s ease',
                    }}
                  >
                    <div>
                      <div
                        style={{
                          fontSize: 12,
                          fontWeight: 700,
                          color: isSelected ? '#C71B4D' : '#2F010E',
                          fontFamily: "'Outfit', sans-serif",
                          display: 'flex',
                          alignItems: 'center',
                          gap: 6,
                        }}
                      >
                        {preset.label}
                        {preset.id === 'apple_natural' && (
                          <span
                            style={{
                              fontSize: 9,
                              padding: '1px 5px',
                              background: '#C71B4D',
                              color: '#FFF',
                              borderRadius: 4,
                              fontFamily: "'DM Mono', monospace",
                              fontWeight: 800,
                            }}
                          >
                            DEFAULT
                          </span>
                        )}
                      </div>
                      <div style={{ fontSize: 10, color: '#888', marginTop: 2 }}>
                        {preset.description}
                      </div>
                    </div>
                    {isSelected && <Check size={16} color="#C71B4D" strokeWidth={2.5} />}
                  </button>
                )
              })}
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      <AnimatePresence mode="wait">

        {/* ── IDLE ─────────────────────────────────────────────────────────── */}
        {state === 'idle' && (
          <motion.div
            key="idle"
            style={styles.fullScreen}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={handleIdleTouch}
          >

            {/* Animated background blobs */}
            <div style={styles.blob1} />
            <div style={styles.blob2} />

            <div style={styles.idleContent}>
              <div style={styles.cameraIcon}>
                <Camera size={76} strokeWidth={1.5} color="#C71B4D" />
              </div>
              <div style={styles.idleTitle}>PHOTOBOOTH</div>
              <div style={styles.idleSubtitle}>Touch anywhere to begin</div>
            </div>

            {/* Server status dot */}
            <ServerStatusDot serverUrl={MAIN_SERVER_URL} />
          </motion.div>
        )}

        {/* ── TICKET ENTRY ─────────────────────────────────────────────────── */}
        {(state === 'ticket_entry' || state === 'verifying') && (
          <motion.div
            key="ticket"
            style={styles.fullScreen}
            initial={{ opacity: 0, y: 30 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -30 }}
          >
            <div style={styles.ticketHeader}>
              <Ticket size={24} color="#C71B4D" />
              <span style={styles.ticketTitle}>Enter Your Ticket Code</span>
            </div>

            {/* Code display */}
            <div style={styles.codeDisplay}>
              {[0, 1, 2, 3].map(i => (
                <div key={i} style={{
                  ...styles.codeBox,
                  borderColor: ticketCode.length === i ? '#C71B4D' : ticketCode.length > i ? '#16a34a' : 'rgba(109,6,38,0.22)',
                  background: ticketCode.length > i ? '#C71B4D' : ticketCode.length === i ? '#FFFFFF' : '#F0E8DF',
                  boxShadow: ticketCode.length === i ? '0 0 0 3px rgba(199,27,77,0.18)' : 'none',
                }}>
                  <span style={{ ...styles.codeDigit, color: ticketCode.length > i ? '#F7F1EA' : '#2B0510' }}>
                    {ticketCode[i] || ''}
                  </span>
                </div>
              ))}
            </div>

            {/* Error */}
            <AnimatePresence>
              {errorMsg && (
                <motion.div
                  initial={{ opacity: 0, y: -10 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0 }}
                  style={styles.errorBanner}
                >
                  <AlertTriangle size={15} color="#ef4444" style={{ flexShrink: 0 }} />
                  <span>{errorMsg}</span>
                </motion.div>
              )}
            </AnimatePresence>

            {/* Numpad */}
            {state === 'verifying' ? (
              <div style={styles.verifyingBox}>
                <motion.div
                  animate={{ rotate: 360 }}
                  transition={{ duration: 1, repeat: Infinity, ease: 'linear' }}
                  style={styles.spinner}
                />
                <span style={styles.verifyingText}>Verifying ticket...</span>
              </div>
            ) : (
              <Numpad onKey={handleNumpad} />
            )}

            {/* Back */}
            <button style={styles.backBtn} onClick={resetToIdle}>
              <ArrowLeft size={13} style={{ display: 'inline', verticalAlign: 'middle', marginRight: 4 }} />
              Back
            </button>
          </motion.div>
        )}

        {/* ── SESSION START (Ready) ─────────────────────────────────────────── */}
        {state === 'session_start' && (
          <motion.div
            key="session_start"
            style={styles.fullScreen}
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0 }}
          >
            <div style={styles.readyHeader}>
              <CheckCircle2 size={28} color="#22c55e" />
              <span style={styles.readyTitle}>Ticket #{ticketCode} Verified!</span>
            </div>

            {/* Camera preview */}
            <div style={styles.cameraPreviewBox}>
              <CameraStream
                url={CAMERA_STREAM_URL}
                videoRef={videoRef}
                imageRef={imageRef}
                filterCss={currentFilter.filterCss}
                selectedZoom={selectedZoom}
                onZoomChange={setSelectedZoom}
                onStreamModeChange={(mode) => setIsPiStreamActive(mode === 'mjpeg')}
                onPiIpChange={setActivePiIp}
                onStreamActive={() => setStreamOk(true)}
                onError={() => setStreamOk(false)}
              />
              <div style={styles.cameraLabel}>Live Preview</div>
            </div>

            {/* Info */}
            <div style={styles.sessionInfo}>
              <div style={styles.infoItem}>
                <Camera size={18} color="#C71B4D" />
                <span style={styles.infoText}>~45 Photos</span>
              </div>
              <div style={styles.infoItem}>
                <Clock size={18} color="#C71B4D" />
                <span style={styles.infoText}>~{SESSION_DURATION_S}s session</span>
              </div>
            </div>

            <motion.button
              style={styles.startBtn}
              whileTap={{ scale: 0.96 }}
              onClick={startSession}
            >
              TAP TO START
            </motion.button>
          </motion.div>
        )}

        {/* ── COUNTDOWN ────────────────────────────────────────────────────── */}
        {(state === 'countdown' || state === 'flash') && (
          <motion.div
            key="countdown"
            style={styles.captureScreen}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
          >
            <CaptureTopBar shotIndex={shotIndex} timeLeft={sessionTime} onReset={resetToIdle} />

            {/* Camera feed with countdown overlay */}
            <div style={styles.viewfinderWrap}>
              <CameraStream
                url={CAMERA_STREAM_URL}
                videoRef={videoRef}
                imageRef={imageRef}
                filterCss={currentFilter.filterCss}
                selectedZoom={selectedZoom}
                onZoomChange={setSelectedZoom}
                onStreamModeChange={(mode) => setIsPiStreamActive(mode === 'mjpeg')}
                onPiIpChange={setActivePiIp}
                onStreamActive={() => setStreamOk(true)}
                onError={() => setStreamOk(false)}
              />

              {/* Flash overlay */}
              <AnimatePresence>
                {flash && (
                  <motion.div
                    key="flash"
                    style={styles.flashOverlay}
                    initial={{ opacity: 0.9 }}
                    animate={{ opacity: 0 }}
                    transition={{ duration: 0.35 }}
                  />
                )}
              </AnimatePresence>

              {/* Countdown circle */}
              {state === 'countdown' && (
                <div style={styles.countdownOverlay}>
                  <motion.div
                    key={countdown}
                    initial={{ scale: 1.5, opacity: 0 }}
                    animate={{ scale: 1, opacity: 1 }}
                    transition={{ duration: 0.3 }}
                    style={styles.countdownCircle}
                  >
                    <span style={styles.countdownNum}>{countdown}</span>
                  </motion.div>
                </div>
              )}
            </div>

            {/* Shot counter bar */}
            <ShotDots completed={shots.length} current={shotIndex} />
          </motion.div>
        )}

        {/* ── PREVIEW (Show captured photo for 3s with active timer countdown) ─── */}
        {state === 'preview' && (
          <motion.div
            key="preview"
            style={styles.captureScreen}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
          >
            <CaptureTopBar shotIndex={shotIndex} timeLeft={sessionTime} />

            <div style={styles.viewfinderWrap}>
              {previewUrl && (
                <img
                  src={previewUrl}
                  style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                  alt="Captured shot"
                />
              )}

              {/* Big Prominent Countdown Badge Over Photo */}
              <div style={styles.countdownOverlay}>
                <motion.div
                  key={previewCountdown}
                  initial={{ scale: 1.3, opacity: 0 }}
                  animate={{ scale: 1, opacity: 1 }}
                  transition={{ duration: 0.2 }}
                  style={{
                    background: 'rgba(10, 2, 5, 0.85)',
                    backdropFilter: 'blur(10px)',
                    border: '2px solid rgba(247, 241, 234, 0.35)',
                    borderRadius: 9999,
                    padding: '10px 24px',
                    display: 'flex',
                    alignItems: 'center',
                    gap: 16,
                    boxShadow: '0 12px 36px rgba(0,0,0,0.6)',
                  }}
                >
                  <div
                    style={{
                      width: 48,
                      height: 48,
                      borderRadius: '50%',
                      background: 'var(--color-brand)',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      color: '#ffffff',
                      fontSize: 26,
                      fontWeight: 800,
                      fontFamily: 'var(--font-mono)',
                      boxShadow: '0 4px 14px rgba(109, 6, 38, 0.4)',
                    }}
                  >
                    {previewCountdown}
                  </div>
                  <div style={{ textAlign: 'left' }}>
                    <div style={{ color: 'rgba(255,255,255,0.7)', fontSize: 11, fontFamily: "'DM Mono',monospace", textTransform: 'uppercase', letterSpacing: '0.08em', fontWeight: 700 }}>
                      NEXT POSE IN
                    </div>
                    <div style={{ color: '#ffffff', fontSize: 16, fontWeight: 800, fontFamily: "'Outfit',sans-serif" }}>
                      Get ready for Shot {shotIndex + 2}!
                    </div>
                  </div>
                </motion.div>
              </div>

              {/* Bottom Preview banner */}
              <motion.div
                initial={{ y: 60, opacity: 0 }}
                animate={{ y: 0, opacity: 1 }}
                style={styles.previewBanner}
              >
                <Sparkles size={22} color="#C71B4D" />
                <span style={{ fontWeight: 800, fontSize: 17, color: '#F7F1EA', letterSpacing: '0.04em' }}>
                  SHOT {shotIndex + 1} SAVED
                </span>
              </motion.div>

              {/* Progress bar emptying */}
              <PreviewProgressBar duration={PREVIEW_SECONDS} />
            </div>

            <ShotDots completed={shots.length} current={shotIndex} />
          </motion.div>
        )}

        {/* ── SESSION DONE ─────────────────────────────────────────────────── */}
        {state === 'session_done' && (
          <motion.div
            key="done"
            style={styles.fullScreen}
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0 }}
          >
            <div style={styles.blob1} />
            <div style={styles.blob2} />

            <motion.div
              style={styles.doneContent}
              initial={{ y: 20, opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              transition={{ delay: 0.15 }}
            >
              {/* Header */}
              <motion.div
                style={styles.checkCircle}
                initial={{ scale: 0 }}
                animate={{ scale: 1 }}
                transition={{ type: 'spring', stiffness: 260, damping: 20, delay: 0.2 }}
              >
                <Check size={30} strokeWidth={3} color="#ffffff" />
              </motion.div>

              <div style={styles.doneTitle}>All done!</div>
              <div style={styles.doneSubtitle}>Captured {shots.length} photo{shots.length !== 1 ? 's' : ''} — uploading to the editing station...</div>

              {/* Masonry upload grid */}
              <div style={styles.uploadGrid}>
                {shots.map((shot, i) => {
                  const status = shot.uploadStatus
                  // Vary card heights for masonry effect: tall / medium / short cycling
                  const heights = ['clamp(110px,22vw,150px)', 'clamp(80px,16vw,110px)', 'clamp(95px,19vw,130px)']
                  const thumbH = heights[i % 3]
                  return (
                    <div key={shot.index} style={{
                      ...styles.uploadCard,
                      borderColor: status === 'success' ? 'rgba(22,163,74,0.45)'
                        : status === 'failed' ? 'rgba(201,42,42,0.45)'
                          : status === 'uploading' || status === 'retrying' ? 'rgba(109,6,38,0.35)'
                            : 'rgba(109,6,38,0.15)',
                      background: status === 'success' ? 'rgba(22,163,74,0.08)'
                        : status === 'failed' ? 'rgba(201,42,42,0.08)'
                          : '#FFFFFF',
                    }}>
                      {/* Thumbnail — variable height for masonry */}
                      {shot.localUrl ? (
                        <img
                          src={shot.localUrl}
                          style={{ ...styles.uploadThumb, height: thumbH }}
                          alt={`Shot ${i + 1}`}
                        />
                      ) : (
                        <div style={{ ...styles.uploadThumb, height: thumbH, background: 'rgba(109,6,38,0.06)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                          <Camera size={22} color="rgba(109,6,38,0.35)" />
                        </div>
                      )}
                      {/* Status row */}
                      <div style={styles.uploadCardBottom}>
                        <span style={{ fontSize: 10, color: '#8E6E75', fontFamily: "'DM Mono', monospace", fontWeight: 600 }}>#{shot.index + 1}</span>
                        <span style={{ display: 'flex', alignItems: 'center' }}>
                          {status === 'success' ? <Check size={13} color="#16a34a" strokeWidth={3} />
                            : status === 'failed' ? <X size={13} color="#C92A2A" strokeWidth={3} />
                              : status === 'uploading' || status === 'retrying' ? <RefreshCw size={11} color="#6D0626" />
                                : <span style={{ color: 'rgba(109,6,38,0.3)', fontSize: 12 }}>○</span>}
                        </span>
                      </div>
                    </div>
                  )
                })}
              </div>

              {/* Server integrity bar */}
              <div style={styles.integrityBar}>
                <div style={styles.integrityLabel}>
                  <span>Server confirmed:</span>
                  <span style={{ fontWeight: 700, color: allConfirmed ? '#16a34a' : '#6D0626' }}>
                    {serverConfirmedCount} of {shots.length} photos received
                  </span>
                </div>
                <div style={styles.integrityDots}>
                  {shots.map((_, i) => (
                    <motion.div
                      key={i}
                      style={{
                        ...styles.integrityDot,
                        background: i < serverConfirmedCount ? '#16a34a' : 'rgba(109,6,38,0.15)',
                      }}
                      animate={{ scale: i === serverConfirmedCount - 1 ? [1, 1.4, 1] : 1 }}
                      transition={{ duration: 0.4 }}
                    />
                  ))}
                </div>
              </div>

              {/* Retry button for failed uploads */}
              {shots.some(s => s.uploadStatus === 'failed') && sessionId && (
                <motion.button
                  style={styles.retryBtn}
                  whileTap={{ scale: 0.95 }}
                  onClick={() => retryFailed(sessionId!)}
                >
                  <RefreshCw size={13} style={{ display: 'inline', verticalAlign: 'middle', marginRight: 6 }} />
                  Retry Failed Uploads ({shots.filter(s => s.uploadStatus === 'failed').length})
                </motion.button>
              )}

              {/* Go to editing instruction */}
              <div style={{
                ...styles.doneInstruction,
                color: allConfirmed ? '#16a34a' : '#6B434C',
                borderColor: allConfirmed ? 'rgba(22,163,74,0.30)' : 'rgba(109,6,38,0.15)',
                background: allConfirmed ? 'rgba(22,163,74,0.08)' : 'rgba(109,6,38,0.04)',
              }}>
                {allConfirmed ? (
                  <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                    <CheckCircle2 size={16} color="#16a34a" />
                    All photos received! Head to the Editing Station now.
                  </span>
                ) : (
                  <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                    <Clock size={16} color="#6D0626" />
                    Please wait while photos upload before heading to Editing Station.
                  </span>
                )}
              </div>

              {/* Auto-reset — only starts after all confirmed or 30s timeout */}
              {allConfirmed && (
                <AutoResetTimer seconds={20} onComplete={resetToIdle} />
              )}
            </motion.div>
          </motion.div>
        )}


        {/* ── ERROR ────────────────────────────────────────────────────────── */}
        {state === 'error' && (
          <motion.div
            key="error"
            style={{ ...styles.fullScreen, justifyContent: 'center', alignItems: 'center', gap: 12 }}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
          >
            <AlertCircle size={52} color="#C92A2A" />
            <div style={{ color: '#2B0510', fontSize: 22, fontWeight: 800, fontFamily: "'Outfit',sans-serif" }}>Something went wrong</div>
            <div style={{ color: '#6B434C', fontSize: 15, textAlign: 'center', maxWidth: 400, fontFamily: "'DM Sans',sans-serif" }}>{errorMsg}</div>
            <button style={{ ...styles.startBtn, marginTop: 8 }} onClick={resetToIdle}>Try Again</button>
          </motion.div>
        )}

      </AnimatePresence>
    </div >
  )
}

// ─── Sub-components ───────────────────────────────────────────────────────────

interface CameraStreamProps {
  url?: string
  videoRef?: any
  imageRef?: any
  filterCss?: string
  selectedZoom?: string
  onZoomChange?: (zoom: string) => void
  onStreamModeChange?: (mode: 'loading' | 'webrtc' | 'mjpeg' | 'error') => void
  onPiIpChange?: (ip: string) => void
  onStreamActive?: () => void
  onError?: () => void
}

function CameraStream({
  url,
  videoRef: externalVideoRef,
  imageRef: externalImageRef,
  filterCss = 'none',
  selectedZoom: externalZoom,
  onZoomChange,
  onStreamModeChange,
  onPiIpChange,
  onStreamActive,
  onError,
}: CameraStreamProps) {
  const internalVideoRef = useRef<HTMLVideoElement | null>(null)
  const internalImageRef = useRef<HTMLImageElement | null>(null)
  const videoRef = externalVideoRef || internalVideoRef
  const imageRef = externalImageRef || internalImageRef

  const [streamMode, setStreamModeState] = useState<'loading' | 'webrtc' | 'mjpeg' | 'error'>('loading')
  const setStreamMode = useCallback((mode: 'loading' | 'webrtc' | 'mjpeg' | 'error') => {
    setStreamModeState(mode)
    onStreamModeChange?.(mode)
  }, [onStreamModeChange])

  const [currentBlobUrl, setCurrentBlobUrl] = useState<string | null>(null)
  const currentBlobRef = useRef<string | null>(null)
  const localStreamRef = useRef<MediaStream | null>(null)

  const [piIp, setPiIpState] = useState<string>(getSavedPiIp())
  const setPiIp = useCallback((ip: string) => {
    setPiIpState(ip)
    onPiIpChange?.(ip)
  }, [onPiIpChange])

  const [customIpInput, setCustomIpInput] = useState<string>(getSavedPiIp())
  const [isDetecting, setIsDetecting] = useState<boolean>(false)
  const [statusNote, setStatusNote] = useState<string>('')
  const [internalZoom, setInternalZoom] = useState<string>('1')
  const [isSwitchingZoom, setIsSwitchingZoom] = useState<boolean>(false)

  const activeZoomLvl = externalZoom || internalZoom
  const zoomConfig = ZOOM_LEVEL_ROIS[activeZoomLvl] || ZOOM_LEVEL_ROIS['1']
  const zoomScale = zoomConfig.scale

  // Activate local webcam (getUserMedia) so stream is NEVER offline
  const startLocalWebcam = useCallback(async () => {
    try {
      if (localStreamRef.current) return
      const stream = await navigator.mediaDevices.getUserMedia({
        video: {
          width: { ideal: 1920, min: 1280 },
          height: { ideal: 1080, min: 720 },
          frameRate: { ideal: 30, min: 15 },
        },
        audio: false,
      })
      localStreamRef.current = stream
      if (videoRef.current) {
        videoRef.current.srcObject = stream
        videoRef.current.play().catch(console.warn)
      }
      setStreamMode('webrtc')
      onStreamActive?.()
    } catch (err) {
      console.warn('[BoothPi] Local webcam fallback unavailable:', err)
    }
  }, [videoRef, onStreamActive])

  const stopLocalWebcam = useCallback(() => {
    if (localStreamRef.current) {
      localStreamRef.current.getTracks().forEach(t => t.stop())
      localStreamRef.current = null
    }
    if (videoRef.current) {
      videoRef.current.srcObject = null
    }
  }, [videoRef])

  // Auto-discover Pi on mount from backend (scans entire subnet)
  useEffect(() => {
    let unmounted = false
    const discover = async () => {
      try {
        const res = await fetch(`${MAIN_SERVER_URL}/api/camera/discover`, { signal: AbortSignal.timeout(3500) })
        if (res.ok) {
          const data = await res.json()
          if (!unmounted && data?.piIp) {
            setPiIp(data.piIp)
            setCustomIpInput(data.piIp)
            setSavedPiIp(data.piIp)
          }
        }
      } catch {}
    }
    discover()
    return () => { unmounted = true }
  }, [])

  // Auto-detect button handler (queries subnet scanner)
  const handleAutoDetect = async () => {
    setIsDetecting(true)
    setStatusNote('Scanning entire subnet for active cameras...')
    try {
      const res = await fetch(`${MAIN_SERVER_URL}/api/camera/discover`, { signal: AbortSignal.timeout(6000) })
      if (res.ok) {
        const data = await res.json()
        if (data?.piIp && data?.reachable) {
          setPiIp(data.piIp)
          setCustomIpInput(data.piIp)
          setSavedPiIp(data.piIp)
          setStatusNote(`Found active Pi camera at ${data.piIp}!`)
          setStreamMode('mjpeg')
          setIsDetecting(false)
          return
        }
      }
    } catch {}

    const candidates = [
      piIp,
      '192.168.29.27',
      typeof window !== 'undefined' ? window.location.hostname : '',
      'raspberrypi.local',
      'localhost',
    ].filter(Boolean)

    for (const cand of candidates) {
      try {
        const testRes = await fetch(`http://${cand}:8080/frame?t=${Date.now()}`, { signal: AbortSignal.timeout(1000) })
        if (testRes.ok) {
          setPiIp(cand)
          setCustomIpInput(cand)
          setSavedPiIp(cand)
          setStatusNote(`Connected to ${cand}!`)
          setStreamMode('mjpeg')
          setIsDetecting(false)
          return
        }
      } catch {}
    }

    setStatusNote('Pi not detected on network. Local HD webcam is active.')
    setIsDetecting(false)
    startLocalWebcam()
  }

  const handleSaveCustomIp = () => {
    const cleaned = customIpInput.trim()
    if (cleaned) {
      setPiIp(cleaned)
      setSavedPiIp(cleaned)
      setStatusNote(`Connecting to ${cleaned}...`)
      setStreamMode('loading')
    }
  }

  const handleSelectZoom = async (lvl: string) => {
    if (isSwitchingZoom) return
    setIsSwitchingZoom(true)
    setInternalZoom(lvl)
    onZoomChange?.(lvl)
    try {
      const qs = `level=${encodeURIComponent(lvl)}`
      const endpoints = [
        `http://${piIp}:8080/zoom?${qs}`,
        `${MAIN_SERVER_URL}/api/camera/zoom?${qs}`,
        `/api/camera/zoom?${qs}`,
        `http://192.168.29.69:8080/zoom?${qs}`,
      ]
      for (const ep of endpoints) {
        fetch(ep, { signal: AbortSignal.timeout(1500) }).catch(() => {})
      }
    } catch {}
    setTimeout(() => {
      setIsSwitchingZoom(false)
    }, 600)
  }

  // Real-Time Frame Engine (Decoupled, zero-latency 30fps stream)
  useEffect(() => {
    let active = true
    let inFlight = false
    let failureCount = 0

    const candidateEndpoints = [
      (typeof window !== 'undefined' && (window.location.hostname === 'raspberrypi.local' || window.location.hostname === piIp))
        ? 'http://localhost:8080/frame'
        : `http://${piIp}:8080/frame`,
      'http://192.168.29.69:8080/frame',
      `${MAIN_SERVER_URL}/api/camera/frame`,
    ]

    let activeEndpointIndex = 0

    const fetchFrame = async () => {
      if (!active || inFlight) return
      inFlight = true

      const currentEndpoint = candidateEndpoints[activeEndpointIndex] || candidateEndpoints[0]

      try {
        const res = await fetch(`${currentEndpoint}?t=${Date.now()}`, {
          signal: AbortSignal.timeout(1200),
          cache: 'no-store',
        })
        if (res.ok && active) {
          const blob = await res.blob()
          if (active && blob.size > 1000) {
            failureCount = 0
            const newUrl = URL.createObjectURL(blob)
            if (currentBlobRef.current) {
              URL.revokeObjectURL(currentBlobRef.current)
            }
            currentBlobRef.current = newUrl
            setCurrentBlobUrl(newUrl)
            setStreamMode('mjpeg')
            stopLocalWebcam()
            onStreamActive?.()
          }
        } else {
          failureCount++
          if (failureCount >= 3) {
            startLocalWebcam()
          }
          if (failureCount % 2 === 0) {
            activeEndpointIndex = (activeEndpointIndex + 1) % candidateEndpoints.length
          }
        }
      } catch {
        failureCount++
        if (failureCount >= 3) {
          startLocalWebcam()
        }
        if (failureCount % 2 === 0) {
          activeEndpointIndex = (activeEndpointIndex + 1) % candidateEndpoints.length
        }
        if (failureCount > 10 && active && !currentBlobRef.current && !localStreamRef.current) {
          setStreamMode('error')
          onError?.()
        }
      } finally {
        inFlight = false
        if (active) {
          // Zero lag: 28ms cycle = 35fps smooth display
          setTimeout(fetchFrame, failureCount > 0 ? 120 : 28)
        }
      }
    }

    fetchFrame()

    return () => {
      active = false
      if (currentBlobRef.current) {
        URL.revokeObjectURL(currentBlobRef.current)
        currentBlobRef.current = null
      }
      stopLocalWebcam()
    }
  }, [piIp, onStreamActive, onError, startLocalWebcam, stopLocalWebcam])

  const handleRetry = () => {
    setStreamMode('loading')
    setStatusNote('')
  }

  return (
    <div style={{ position: 'relative', width: '100%', height: '100%', background: '#1A0108', overflow: 'hidden' }}>
      {/* 1. Native HTML5 Video Stream (Local Webcam Fallback) */}
      <div style={{ position: 'absolute', inset: 0, overflow: 'hidden', display: streamMode === 'webrtc' ? 'flex' : 'none', alignItems: 'center', justifyContent: 'center', background: '#000' }}>
        <video
          ref={videoRef as any}
          autoPlay
          playsInline
          muted
          style={{
            width: '100%',
            height: '100%',
            objectFit: 'contain',
            transform: `scaleX(-1) scale(${zoomScale})`,
            transformOrigin: 'center center',
            transition: 'transform 0.25s cubic-bezier(0.2, 0, 0, 1)',
            filter: filterCss !== 'none' ? filterCss : undefined,
          }}
        />
      </div>

      {/* 2. Fast-Frame Live Camera Display (Pi Hardware / Stream) - ZERO CSS SCALE to prevent double-zoom */}
      {currentBlobUrl && (
        <div style={{ position: 'absolute', inset: 0, overflow: 'hidden', display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#000' }}>
          <img
            ref={imageRef as any}
            src={currentBlobUrl}
            alt="Live camera preview"
            style={{
              width: '100%',
              height: '100%',
              objectFit: 'contain',
              transform: 'scaleX(-1)',
              transformOrigin: 'center center',
              filter: filterCss !== 'none' ? filterCss : undefined,
            }}
          />
        </div>
      )}

      {/* 3. Top Floating Status & Zoom Controls Pill */}
      <div
        style={{
          position: 'absolute',
          top: 12,
          left: '50%',
          transform: 'translateX(-50%)',
          display: 'flex',
          alignItems: 'center',
          gap: 8,
          background: 'rgba(20, 2, 7, 0.78)',
          backdropFilter: 'blur(10px)',
          padding: '5px 12px',
          borderRadius: 'var(--radius-full, 9999px)',
          border: '1px solid rgba(247, 241, 234, 0.18)',
          zIndex: 30,
          pointerEvents: 'auto',
          userSelect: 'none',
          boxShadow: '0 4px 16px rgba(0,0,0,0.5)',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <div
            style={{
              width: 7,
              height: 7,
              borderRadius: '50%',
              background: isSwitchingZoom ? '#f59e0b' : (streamMode === 'mjpeg' ? '#22c55e' : streamMode === 'webrtc' ? '#38bdf8' : '#eab308'),
              boxShadow: streamMode === 'mjpeg' && !isSwitchingZoom ? '0 0 8px #22c55e' : 'none',
            }}
          />
          <span style={{ fontSize: 10, fontFamily: 'var(--font-mono)', fontWeight: 700, color: '#F7F1EA', letterSpacing: '0.04em' }}>
            {isSwitchingZoom
              ? `SWITCHING TO ${activeZoomLvl}X OPTICS...`
              : streamMode === 'mjpeg'
              ? `${activeZoomLvl}X OPTICAL SENSOR · PI CAM (${piIp})`
              : streamMode === 'webrtc'
              ? `${activeZoomLvl}X DIGITAL · WEBCAM`
              : 'CONNECTING...'}
          </span>
        </div>

        {/* Zoom Selector Pills */}
        <div style={{ display: 'flex', gap: 3, borderLeft: '1px solid rgba(255,255,255,0.15)', paddingLeft: 8 }}>
          {['1', '2', '3.5', '4'].map(lvl => (
            <button
              key={lvl}
              type="button"
              disabled={isSwitchingZoom && activeZoomLvl === lvl}
              onClick={() => handleSelectZoom(lvl)}
              style={{
                background: activeZoomLvl === lvl ? '#C71B4D' : 'rgba(255,255,255,0.08)',
                color: activeZoomLvl === lvl ? '#ffffff' : 'rgba(247, 241, 234, 0.7)',
                border: 'none',
                borderRadius: 'var(--radius-full, 9999px)',
                padding: '2px 7px',
                fontSize: 9,
                fontFamily: 'var(--font-mono)',
                fontWeight: activeZoomLvl === lvl ? 800 : 500,
                cursor: isSwitchingZoom ? 'wait' : 'pointer',
                opacity: isSwitchingZoom && activeZoomLvl !== lvl ? 0.6 : 1,
                transition: 'all 0.15s ease',
              }}
            >
              {lvl}X
            </button>
          ))}
        </div>
      </div>

      {/* 4. Loading state */}
      {streamMode === 'loading' && !currentBlobUrl && !localStreamRef.current && (
        <div
          style={{
            position: 'absolute',
            inset: 0,
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            gap: 10,
            background: 'rgba(47, 1, 14, 0.92)',
            color: '#F7F1EA',
            zIndex: 5,
          }}
        >
          <div
            style={{
              width: 34,
              height: 34,
              border: '3px solid rgba(247, 241, 234, 0.2)',
              borderTopColor: '#C71B4D',
              borderRadius: '50%',
              animation: 'spin 0.9s linear infinite',
            }}
          />
          <span style={{ fontSize: 13, fontFamily: 'var(--font-mono)', fontWeight: 700, letterSpacing: '0.06em' }}>
            CONNECTING TO CAMERA ({piIp})...
          </span>
        </div>
      )}

      {/* 5. Stream Error / Recovery state */}
      {streamMode === 'error' && !currentBlobUrl && !localStreamRef.current && (
        <div
          style={{
            position: 'absolute',
            inset: 0,
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            gap: 10,
            padding: 20,
            background: 'rgba(30, 2, 10, 0.96)',
            color: '#F7F1EA',
            textAlign: 'center',
            zIndex: 6,
          }}
        >
          <CameraOff size={36} color="#fca5a5" />
          <span style={{ fontSize: 15, fontFamily: 'var(--font-mono)', fontWeight: 800, color: '#fca5a5', letterSpacing: '0.04em' }}>
            CONNECTING CAMERA STREAM
          </span>
          <span style={{ fontSize: 11, color: 'rgba(247, 241, 234, 0.7)', maxWidth: 320, lineHeight: 1.4 }}>
            Camera not responding at <b>{piIp}:8080</b>. Click below to auto-scan network or switch to local webcam.
          </span>

          {statusNote && (
            <div style={{ fontSize: 11, color: '#fbbf24', fontFamily: 'var(--font-mono)', padding: '2px 8px' }}>
              {statusNote}
            </div>
          )}

          {/* Quick IP config bar */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 4, width: '100%', maxWidth: 320 }}>
            <input
              type="text"
              value={customIpInput}
              onChange={(e) => setCustomIpInput(e.target.value)}
              placeholder="e.g. 192.168.29.27"
              onKeyDown={(e) => { if (e.key === 'Enter') handleSaveCustomIp() }}
              style={{
                flex: 1,
                padding: '8px 12px',
                borderRadius: 8,
                background: 'rgba(255, 255, 255, 0.1)',
                border: '1px solid rgba(247, 241, 234, 0.25)',
                color: '#fff',
                fontSize: 12,
                fontFamily: 'var(--font-mono)',
                outline: 'none',
              }}
            />
            <button
              onClick={handleSaveCustomIp}
              style={{
                padding: '8px 14px',
                borderRadius: 8,
                background: '#C71B4D',
                color: '#fff',
                border: 'none',
                fontFamily: 'var(--font-mono)',
                fontSize: 11,
                fontWeight: 700,
                cursor: 'pointer',
              }}
            >
              SET IP
            </button>
          </div>

          <div style={{ display: 'flex', gap: 8, marginTop: 4 }}>
            <button
              onClick={handleAutoDetect}
              disabled={isDetecting}
              style={{
                padding: '8px 16px',
                borderRadius: 'var(--radius-full, 9999px)',
                background: 'rgba(255, 255, 255, 0.15)',
                color: '#F7F1EA',
                border: '1px solid rgba(247, 241, 234, 0.3)',
                fontFamily: 'var(--font-mono)',
                fontSize: 11,
                fontWeight: 700,
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                gap: 6,
              }}
            >
              <RefreshCw size={12} style={{ animation: isDetecting ? 'spin 1s linear infinite' : 'none' }} />
              <span>{isDetecting ? 'SCANNING NETWORK...' : 'AUTO-SCAN NETWORK'}</span>
            </button>

            <button
              onClick={startLocalWebcam}
              style={{
                padding: '8px 18px',
                borderRadius: 'var(--radius-full, 9999px)',
                background: '#C71B4D',
                color: '#F7F1EA',
                border: '1px solid rgba(247, 241, 234, 0.35)',
                fontFamily: 'var(--font-mono)',
                fontSize: 11,
                fontWeight: 700,
                cursor: 'pointer',
              }}
            >
              USE LOCAL WEBCAM
            </button>
          </div>
        </div>
      )}
    </div>
  )
}

function CaptureTopBar({
  shotIndex,
  timeLeft,
  onReset,
}: {
  shotIndex: number
  timeLeft: number
  onReset?: () => void
}) {
  const urgent = timeLeft <= 30
  return (
    <div style={styles.topBar}>
      <span style={styles.topBarLeft}>Shot {shotIndex + 1}</span>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
        <span style={{ ...styles.topBarRight, color: urgent ? '#ef4444' : '#f59e0b', display: 'flex', alignItems: 'center', gap: 5 }}>
          <Clock size={16} />
          <span>{String(Math.floor(timeLeft / 60)).padStart(2, '0')}:{String(timeLeft % 60).padStart(2, '0')}</span>
        </span>
        {onReset && (
          <button
            type="button"
            onClick={onReset}
            style={{
              background: 'rgba(255, 255, 255, 0.12)',
              border: '1px solid rgba(255, 255, 255, 0.25)',
              borderRadius: 'var(--radius-full, 9999px)',
              color: '#F7F1EA',
              padding: '3px 10px',
              fontSize: 10,
              fontFamily: 'var(--font-mono)',
              fontWeight: 700,
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: 4,
            }}
          >
            <RefreshCw size={10} />
            <span>RESET</span>
          </button>
        )}
      </div>
    </div>
  )
}

// Shows last 6 shots as dots; active dot pulses; older ones show filled green
function ShotDots({ completed, current }: { completed: number; current: number }) {
  // Show a sliding window of the most recent dots
  const VISIBLE = 6
  const total = Math.max(completed + 1, VISIBLE)
  const start = Math.max(0, current - VISIBLE + 1)
  const indices = Array.from({ length: Math.min(VISIBLE, current + 1) }, (_, i) => start + i)
  return (
    <div style={styles.shotDots}>
      {indices.map(i => (
        <motion.div
          key={i}
          style={{
            ...styles.dot,
            background: i < completed
              ? '#16a34a'
              : i === current
                ? '#C71B4D'
                : 'rgba(255,255,255,0.2)',
            boxShadow: i === current ? '0 0 10px rgba(199,27,77,0.8)' : 'none',
          }}
          animate={{ scale: i === current ? [1, 1.3, 1] : 1 }}
          transition={{ duration: 0.6, repeat: i === current ? Infinity : 0 }}
        />
      ))}
      {/* Photo count badge */}
      <span style={{
        fontFamily: "'DM Mono', monospace",
        fontSize: 11,
        fontWeight: 700,
        color: 'rgba(247,241,234,0.7)',
        letterSpacing: '0.06em',
        marginLeft: 6,
      }}>{completed} captured</span>
    </div>
  )
}

function Numpad({ onKey }: { onKey: (k: string) => void }) {
  const keys = ['1', '2', '3', '4', '5', '6', '7', '8', '9', 'backspace', '0', 'confirm']
  return (
    <div style={styles.numpad}>
      {keys.map(k => (
        <motion.button
          key={k}
          style={{
            ...styles.numpadKey,
            ...(k === 'confirm' ? styles.numpadConfirm : {}),
            ...(k === 'backspace' ? styles.numpadBack : {}),
          }}
          whileTap={{ scale: 0.94 }}
          onClick={() => onKey(k)}
        >
          {k === 'backspace' ? (
            <Delete size={26} strokeWidth={2.2} />
          ) : k === 'confirm' ? (
            <Check size={28} strokeWidth={3} />
          ) : (
            k
          )}
        </motion.button>
      ))}
    </div>
  )
}

function PreviewProgressBar({ duration }: { duration: number }) {
  return (
    <div style={styles.progressBarContainer}>
      <motion.div
        style={styles.progressBarFill}
        initial={{ width: '100%' }}
        animate={{ width: '0%' }}
        transition={{ duration, ease: 'linear' }}
      />
    </div>
  )
}

function AutoResetTimer({ seconds, onComplete }: { seconds: number; onComplete: () => void }) {
  const [left, setLeft] = useState(seconds)
  useEffect(() => {
    const t = setInterval(() => setLeft(p => {
      if (p <= 1) { clearInterval(t); onComplete(); return 0 }
      return p - 1
    }), 1000)
    return () => clearInterval(t)
  }, [onComplete])
  return (
    <div style={{ color: 'rgba(109,6,38,0.45)', fontSize: 13, marginTop: 16, fontFamily: "'DM Mono',monospace", letterSpacing: '0.04em' }}>
      Returning to start in {left}s...
    </div>
  )
}

function ServerStatusDot({ serverUrl }: { serverUrl: string }) {
  const [ok, setOk] = useState<boolean | null>(null)
  useEffect(() => {
    const check = async () => {
      try {
        const r = await fetch(`${serverUrl}/api/health`, { signal: AbortSignal.timeout(2500) })
        setOk(r.ok)
      } catch {
        try {
          const r2 = await fetch('/api/health', { signal: AbortSignal.timeout(2500) })
          setOk(r2.ok)
        } catch {
          setOk(false)
        }
      }
    }
    check()
    const t = setInterval(check, 8000)
    return () => clearInterval(t)
  }, [serverUrl])

  return (
    <div style={styles.statusDot}>
      <div style={{
        width: 8, height: 8, borderRadius: '50%',
        background: ok === null ? '#94a3b8' : ok ? '#16a34a' : '#C92A2A',
      }} />
      <span style={{ color: 'rgba(109,6,38,0.50)', fontSize: 12, fontFamily: "'DM Mono',monospace", fontWeight: 600 }}>
        {ok === null ? 'Connecting...' : ok ? 'Server connected' : 'Server offline'}
      </span>
    </div>
  )
}

// ─── Styles ───────────────────────────────────────────────────────────────────
// Dark kiosk skin (Pi 800×480 touchscreen) — tokens aligned with WaitingScreen/Editor
const styles: Record<string, React.CSSProperties> = {
  root: {
    width: '100vw',
    height: '100vh',
    maxWidth: '100vw',
    maxHeight: '100vh',
    // Light off-white — matches var(--color-bg) from WaitingScreen/Editor
    background: 'var(--color-bg, #F7F1EA)',
    overflow: 'hidden',
    position: 'relative',
    margin: '0 auto',
    fontFamily: "'DM Sans', -apple-system, sans-serif",
    userSelect: 'none',
  },
  fullScreen: {
    position: 'absolute', inset: 0,
    display: 'flex', flexDirection: 'column',
    alignItems: 'center', justifyContent: 'center',
    overflow: 'hidden',
  },

  // ── Ambient studio blobs — matches WaitingScreen's faint ellipse glow ──
  blob1: {
    position: 'absolute',
    top: '-15%', left: '50%',
    transform: 'translateX(-50%)',
    width: '80vw', height: '50vh',
    background: 'radial-gradient(ellipse at center, rgba(109,6,38,0.09) 0%, transparent 70%)',
    pointerEvents: 'none',
    borderRadius: '50%',
  },
  blob2: {
    position: 'absolute',
    bottom: '-10%', right: '5%',
    width: '40vw', height: '40vh',
    background: 'radial-gradient(ellipse at center, rgba(109,6,38,0.06) 0%, transparent 70%)',
    pointerEvents: 'none',
    borderRadius: '50%',
  },

  // ── IDLE ────────────────────────────────────────────────────────────────
  idleContent: {
    display: 'flex', flexDirection: 'column',
    alignItems: 'center', justifyContent: 'center',
    flex: 1, gap: 20, zIndex: 1,
  },
  cameraIcon: {
    // Matches WaitingScreen brand-tint pill/circle treatment
    width: 'clamp(80px,14vw,110px)',
    height: 'clamp(80px,14vw,110px)',
    borderRadius: '50%',
    background: '#F7EAEF',
    border: '2px solid rgba(109,6,38,0.20)',
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    boxShadow: '0 4px 24px rgba(109,6,38,0.14)',
  },
  idleTitle: {
    // Matches WaitingScreen h1 — Outfit, tight tracking, DARK text
    fontFamily: "'Outfit', 'DM Sans', sans-serif",
    fontSize: 'clamp(2.6rem, 7vw, 4.8rem)',
    fontWeight: 900,
    letterSpacing: '0.12em',
    color: '#2B0510',
    lineHeight: 1.05,
  },
  idleSubtitle: {
    // WaitingScreen brand-tint pill badge
    fontFamily: "'DM Mono', monospace",
    fontSize: 'clamp(0.72rem, 1.8vw, 0.9rem)',
    fontWeight: 700,
    letterSpacing: '0.10em',
    color: '#6D0626',
    textTransform: 'uppercase',
    background: '#F7EAEF',
    border: '1px solid rgba(109,6,38,0.18)',
    borderRadius: 9999,
    padding: '5px 18px',
  },
  statusDot: {
    position: 'absolute', bottom: 14, right: 18,
    display: 'flex', alignItems: 'center', gap: 6,
  },

  // ── TICKET ENTRY ────────────────────────────────────────────────────────
  ticketHeader: {
    display: 'flex', alignItems: 'center', gap: 10,
    padding: '10px 0 4px',
  },
  ticketTitle: {
    fontFamily: "'Outfit', 'DM Sans', sans-serif",
    fontSize: 'clamp(1.1rem, 3vw, 1.5rem)',
    fontWeight: 800,
    color: '#2B0510',
    letterSpacing: '-0.01em',
  },
  codeDisplay: {
    display: 'flex', gap: 12, margin: '6px 0',
  },
  codeBox: {
    // Matches WaitingScreen slot-box: white card, brand fill when filled
    width: 'clamp(52px, 10vw, 72px)',
    height: 'clamp(58px, 11vw, 76px)',
    border: '2px solid',
    borderRadius: 16,
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    transition: 'all 0.18s ease',
    boxShadow: '0 2px 8px rgba(109,6,38,0.08)',
  },
  codeDigit: {
    fontFamily: "'DM Mono', monospace",
    fontSize: 'clamp(1.5rem, 4vw, 2.1rem)',
    fontWeight: 800,
    color: '#2B0510',
  },
  errorBanner: {
    background: 'rgba(201,42,42,0.08)',
    border: '1px solid rgba(201,42,42,0.28)',
    borderRadius: 10,
    padding: '7px 16px',
    color: '#C92A2A',
    fontSize: 'clamp(0.72rem, 1.8vw, 0.85rem)',
    marginBottom: 4,
    maxWidth: 500,
    textAlign: 'center',
    display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
    fontFamily: "'DM Sans', sans-serif",
  },
  verifyingBox: {
    display: 'flex', flexDirection: 'column', alignItems: 'center',
    gap: 14, padding: 32,
  },
  spinner: {
    width: 38, height: 38,
    border: '3px solid rgba(109,6,38,0.12)',
    borderTop: '3px solid #C71B4D',
    borderRadius: '50%',
  },
  verifyingText: {
    fontFamily: "'DM Mono', monospace",
    color: '#6B434C',
    fontSize: 14,
    letterSpacing: '0.06em',
    textTransform: 'uppercase',
  },
  numpad: {
    display: 'grid',
    gridTemplateColumns: 'repeat(3, 1fr)',
    gap: 'clamp(6px, 1.5vw, 10px)',
    padding: '0 clamp(8px, 2vw, 20px)',
    width: '100%',
    maxWidth: 520,
  },
  numpadKey: {
    // btn-secondary style: white surface, pill, block shadow
    height: 'clamp(52px, 11vw, 68px)',
    borderRadius: 9999,
    border: '2px solid rgba(47,1,14,0.18)',
    background: '#FFFFFF',
    color: '#2B0510',
    fontSize: 'clamp(1.1rem, 3vw, 1.5rem)',
    fontWeight: 800,
    fontFamily: "'DM Sans', -apple-system, sans-serif",
    cursor: 'pointer',
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    // Neubrutalism block shadow — matches --shadow-bubble-sm
    boxShadow: '3px 3px 0px rgba(47,1,14,0.85), 0 4px 10px rgba(109,6,38,0.12), inset 0 1px 0 rgba(255,255,255,0.25)',
    touchAction: 'manipulation',
    transition: 'transform 60ms ease, box-shadow 60ms ease',
  },
  numpadConfirm: {
    // btn-primary: solid brand background, same block shadow
    background: '#6D0626',
    border: '2px solid rgba(47,1,14,0.6)',
    color: '#F7F1EA',
    boxShadow: '3px 3px 0px rgba(47,1,14,0.85), 0 4px 10px rgba(109,6,38,0.18), inset 0 1px 0 rgba(255,255,255,0.15)',
    borderRadius: 9999,
  },
  numpadBack: {
    // btn-secondary tinted: brand-tint bg
    background: '#F7EAEF',
    border: '2px solid rgba(109,6,38,0.22)',
    color: '#6D0626',
    boxShadow: '3px 3px 0px rgba(47,1,14,0.45), 0 4px 10px rgba(109,6,38,0.08), inset 0 1px 0 rgba(255,255,255,0.4)',
    borderRadius: 9999,
  },
  backBtn: {
    marginTop: 8,
    background: 'none',
    border: '1.5px solid rgba(109,6,38,0.18)',
    borderRadius: 9999,
    color: 'rgba(109,6,38,0.55)',
    fontSize: '0.85rem',
    fontFamily: "'DM Sans', -apple-system, sans-serif",
    fontWeight: 700,
    cursor: 'pointer',
    padding: '6px 18px',
    letterSpacing: '0.03em',
  },

  // ── SESSION START ───────────────────────────────────────────────────────
  readyHeader: {
    display: 'flex', alignItems: 'center', gap: 10,
    padding: '10px 0 4px',
  },
  readyTitle: {
    fontFamily: "'Outfit', 'DM Sans', sans-serif",
    fontSize: 'clamp(1rem, 2.6vw, 1.35rem)',
    fontWeight: 800,
    color: '#2B0510',
    letterSpacing: '-0.01em',
  },
  cameraPreviewBox: {
    // Card aesthetic matching WaitingScreen: radius-xl, subtle red border, deep shadow
    width: 'min(540px, 88vw)',
    aspectRatio: '16/9',
    maxHeight: 'clamp(180px, 32vh, 240px)',
    borderRadius: 20,
    overflow: 'hidden',
    position: 'relative',
    background: '#1A0108',
    border: '2px solid rgba(199,27,77,0.28)',
    boxShadow: '0 10px 36px rgba(0,0,0,0.55), 0 0 0 1px rgba(199,27,77,0.10)',
  },
  cameraLabel: {
    position: 'absolute', bottom: 9, left: 12,
    color: 'rgba(247,241,234,0.65)',
    fontSize: 11,
    fontFamily: "'DM Mono', monospace",
    fontWeight: 700,
    letterSpacing: '0.07em',
    textTransform: 'uppercase',
    background: 'rgba(47,1,14,0.82)',
    padding: '2px 10px',
    borderRadius: 6,
  },
  sessionInfo: {
    display: 'flex', gap: 20, margin: '8px 0',
    flexWrap: 'wrap', justifyContent: 'center',
  },
  infoItem: {
    display: 'flex', alignItems: 'center', gap: 7,
    background: 'rgba(199,27,77,0.12)',
    border: '1px solid rgba(199,27,77,0.22)',
    borderRadius: 9999,
    padding: '5px 14px',
  },
  infoIcon: { fontSize: 16 },
  infoText: {
    color: '#6D0626',
    fontSize: 13,
    fontFamily: "'DM Mono', monospace",
    fontWeight: 600,
    letterSpacing: '0.04em',
  },
  startBtn: {
    // Exactly btn-primary from index.css
    background: '#6D0626',
    border: '2px solid rgba(47,1,14,0.6)',
    borderRadius: 9999,
    padding: 'clamp(12px,2.5vw,16px) clamp(36px,8vw,60px)',
    fontSize: '1.125rem',  // --text-base
    fontWeight: 800,       // --font-bold
    fontFamily: "'DM Sans', -apple-system, sans-serif",  // --font-primary
    color: '#F7F1EA',
    cursor: 'pointer',
    letterSpacing: '0.03em',
    // Neubrutalism block shadow — matches --shadow-bubble-sm
    boxShadow: '3px 3px 0px rgba(47,1,14,0.85), 0 4px 10px rgba(109,6,38,0.12), inset 0 1px 0 rgba(255,255,255,0.15)',
    touchAction: 'manipulation',
  },

  // ── CAPTURE SCREEN ──────────────────────────────────────────────────────
  captureScreen: {
    position: 'absolute', inset: 0,
    display: 'flex', flexDirection: 'column',
  },
  topBar: {
    height: 'clamp(40px, 8vh, 50px)',
    flexShrink: 0,
    background: 'rgba(47,1,14,0.94)',
    borderBottom: '1px solid rgba(199,27,77,0.22)',
    display: 'flex', alignItems: 'center',
    justifyContent: 'space-between',
    padding: '0 clamp(14px,3vw,24px)',
  },
  topBarLeft: {
    color: 'rgba(247,241,234,0.88)',
    fontSize: 'clamp(0.8rem, 2vw, 1rem)',
    fontWeight: 700,
    fontFamily: "'DM Mono', monospace",
    letterSpacing: '0.06em',
    textTransform: 'uppercase',
  },
  topBarRight: {
    fontSize: 'clamp(0.9rem, 2.2vw, 1.1rem)',
    fontWeight: 700,
    fontFamily: "'DM Mono', monospace",
  },
  viewfinderWrap: {
    flex: 1, position: 'relative', overflow: 'hidden',
    background: '#100008',
  },
  flashOverlay: {
    position: 'absolute', inset: 0, background: '#fff', zIndex: 20,
  },
  countdownOverlay: {
    position: 'absolute', inset: 0, zIndex: 10,
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    background: 'rgba(47,1,14,0.32)',
    pointerEvents: 'none',
  },
  countdownCircle: {
    width: 'clamp(80px, 18vw, 118px)',
    height: 'clamp(80px, 18vw, 118px)',
    borderRadius: '50%',
    background: 'rgba(47,1,14,0.90)',
    border: '4px solid #C71B4D',
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    boxShadow: '0 0 55px rgba(199,27,77,0.80)',
  },
  countdownNum: {
    fontFamily: "'Outfit', sans-serif",
    fontSize: 'clamp(2.8rem, 10vw, 4.2rem)',
    fontWeight: 900,
    color: '#F7F1EA',
    lineHeight: 1,
    textShadow: '0 0 28px rgba(199,27,77,0.95)',
  },
  previewBanner: {
    position: 'absolute', bottom: 0, left: 0, right: 0,
    background: 'linear-gradient(transparent, rgba(47,1,14,0.95))',
    padding: 'clamp(12px,3vw,18px) clamp(14px,3vw,22px) clamp(8px,2vw,12px)',
    display: 'flex', alignItems: 'center', gap: 10,
  },
  progressBarContainer: {
    position: 'absolute', bottom: 0, left: 0, right: 0,
    height: 4, background: 'rgba(255,255,255,0.08)',
  },
  progressBarFill: {
    height: '100%',
    background: 'linear-gradient(90deg, #C71B4D, #9E103A)',
    transformOrigin: 'left',
  },
  shotDots: {
    height: 'clamp(32px, 6vh, 42px)',
    flexShrink: 0,
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    gap: 12,
    background: 'rgba(47,1,14,0.88)',
    borderTop: '1px solid rgba(199,27,77,0.18)',
  },
  dot: {
    width: 'clamp(10px,2vw,14px)',
    height: 'clamp(10px,2vw,14px)',
    borderRadius: '50%',
  },

  // ── SESSION DONE ────────────────────────────────────────────────────────
  doneContent: {
    display: 'flex', flexDirection: 'column',
    alignItems: 'center', gap: 10, zIndex: 1,
    padding: '20px clamp(16px,4vw,32px)',
  },
  checkCircle: {
    width: 58, height: 58, borderRadius: '50%',
    background: 'linear-gradient(135deg, #16a34a, #22c55e)',
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    boxShadow: '0 0 28px rgba(34,197,94,0.45)',
  },
  doneTitle: {
    fontFamily: "'Outfit', 'DM Sans', sans-serif",
    fontSize: 'clamp(1.4rem, 4vw, 2rem)',
    fontWeight: 800,
    color: '#2B0510',
    letterSpacing: '-0.01em',
  },
  doneSubtitle: {
    fontFamily: "'DM Sans', sans-serif",
    fontSize: 'clamp(0.72rem, 1.8vw, 0.9rem)',
    color: '#6B434C',
    textAlign: 'center',
    maxWidth: 460,
  },
  doneInstruction: {
    fontSize: 'clamp(0.72rem, 1.8vw, 0.85rem)',
    color: '#6B434C',
    fontFamily: "'DM Sans', sans-serif",
    textAlign: 'center', maxWidth: 480, lineHeight: 1.45,
    padding: '8px 18px', borderRadius: 12,
    border: '1px solid',
  },
  uploadGrid: {
    // CSS columns = native masonry layout
    columnCount: 4,                             // fixed 4 cols; auto-fills left-to-right
    columnGap: 'clamp(5px,1.2vw,10px)',
    margin: '8px 0',
    maxHeight: 'clamp(200px, 38vh, 300px)',
    overflowY: 'auto' as const,
    padding: '0 2px 4px',
  },
  uploadCard: {
    // break-inside: avoid keeps each card in one masonry column
    breakInside: 'avoid',
    width: '100%',
    marginBottom: 'clamp(5px,1.2vw,10px)',
    padding: 5,
    borderRadius: 10,
    border: '1.5px solid',
    display: 'flex', flexDirection: 'column', gap: 4,
  },
  uploadThumb: {
    width: '100%',
    height: 'clamp(80px,16vw,110px)',   // base; overridden per-card for masonry vary
    borderRadius: 6,
    objectFit: 'cover' as const,
    display: 'block',
  },
  uploadCardBottom: {
    display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0 2px',
  },
  integrityBar: {
    display: 'flex', alignItems: 'center', gap: 12, marginTop: 4,
    flexWrap: 'wrap', justifyContent: 'center',
  },
  integrityLabel: {
    display: 'flex', gap: 6,
    fontSize: 12,
    color: '#8E6E75',
    fontFamily: "'DM Mono', monospace",
    letterSpacing: '0.04em',
  },
  integrityDots: {
    display: 'flex', gap: 6,
  },
  integrityDot: {
    width: 9, height: 9, borderRadius: '50%',
  },
  retryBtn: {
    marginTop: 8, padding: '10px 22px',
    borderRadius: 9999,
    background: '#6D0626',
    color: '#F7F1EA',
    border: '2px solid rgba(47,1,14,0.6)',
    fontFamily: "'DM Sans', -apple-system, sans-serif",
    fontSize: '0.85rem', fontWeight: 800,
    cursor: 'pointer',
    letterSpacing: '0.03em',
    boxShadow: '3px 3px 0px rgba(47,1,14,0.85), 0 4px 10px rgba(109,6,38,0.12), inset 0 1px 0 rgba(255,255,255,0.15)',
    touchAction: 'manipulation',
  },
}

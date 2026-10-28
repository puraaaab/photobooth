import React, { useState, useCallback, useEffect, useRef } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import {
  Download, Printer, Minus, Plus, RefreshCw, ArrowLeft, Sparkles, Layers,
  Scissors, FileText, ChevronLeft, ChevronRight, CheckCircle2,
  QrCode, Mail, Phone, AlertOctagon, X, Copy, Check, Lock
} from 'lucide-react'
import { QRCodeSVG } from 'qrcode.react'
import { useSessionStore } from '@/store/sessionStore'
import { useSettingsStore } from '@/store/settingsStore'
import { useQueueStore } from '@/store/queueStore'
import { filterEngine } from '@/engines/FilterEngine'
import { boothCopy } from '@/constants/boothCopy'
import { useToast } from '@/components/ui/Toast'
import { PhonePadModal } from '@/components/modals/PhonePadModal'
import { getPhotoUrl } from '@/utils/photoUrl'
import { getDefaultTemplateForPhotoCount } from '@/data/templates'
import { openRazorpayCheckout } from '@/utils/razorpay'
import type { TicketPlan } from '@/types'

interface ExportScreenProps {
  onBack: () => void
  onNewSession: () => void
}

type ExportFormat = 'jpeg' | 'png' | 'webp' | 'pdf'
type PaperLayout = 'a5-2' | '4x6-duplex' | 'a4-5' | 'a4-6' | 'a4-8' | 'a4-4' | '4x5-split' | '4x6-split' | 'single'

// Plan-to-layout mapping
const PLAN_STRIP_LIMITS: Record<number, number> = { 99: 2, 149: 3, 179: 5 }
const PLAN_LAYOUTS: Record<number, PaperLayout> = { 99: 'a5-2', 149: 'a4-5', 179: 'a4-5' }

function normalizePhotoUrl(rawUrl?: string): string {
  if (!rawUrl) return ''
  if (rawUrl.startsWith('/templates/') || rawUrl.startsWith('/stickers/') || rawUrl.startsWith('/assets/')) {
    return rawUrl
  }
  return getPhotoUrl(rawUrl)
}

async function loadPhotoElement(rawUrl: string): Promise<HTMLImageElement | null> {
  if (!rawUrl) return null

  // Helper to load HTMLImageElement from a URL/dataURL
  const loadIntoImage = (src: string, crossOrigin?: string): Promise<HTMLImageElement | null> => {
    return new Promise((resolve) => {
      const img = new Image()
      if (crossOrigin) img.crossOrigin = crossOrigin
      img.onload = () => {
        if (img.naturalWidth > 0 && img.naturalHeight > 0) {
          resolve(img)
        } else {
          resolve(null)
        }
      }
      img.onerror = () => resolve(null)
      img.src = src
      setTimeout(() => {
        if (img.complete && img.naturalWidth > 0) resolve(img)
        else resolve(null)
      }, 6000)
    })
  }

  // 1. Data URLs are already local in-memory base64 — never taint canvas
  if (rawUrl.startsWith('data:')) {
    return await loadIntoImage(rawUrl)
  }

  // 2. Blob URLs
  if (rawUrl.startsWith('blob:')) {
    try {
      const res = await fetch(rawUrl)
      if (res.ok) {
        const blob = await res.blob()
        const dataUrl = await new Promise<string>((resolve, reject) => {
          const reader = new FileReader()
          reader.onloadend = () => resolve(reader.result as string)
          reader.onerror = reject
          reader.readAsDataURL(blob)
        })
        return await loadIntoImage(dataUrl)
      }
    } catch (e) {
      console.warn('[Export] Direct blob read failed, falling back:', e)
    }
    return await loadIntoImage(rawUrl)
  }

  const url = normalizePhotoUrl(rawUrl)
  if (!url) return null

  // 3. Remote or local server URLs: fetch as Blob -> convert to base64 DataURL (prevents canvas tainting & CORS bugs)
  try {
    const fetchUrl = url.includes('?') ? `${url}&cors=1` : `${url}?cors=1`
    const res = await fetch(fetchUrl, { mode: 'cors' })
    if (res.ok) {
      const blob = await res.blob()
      const dataUrl = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader()
        reader.onloadend = () => resolve(reader.result as string)
        reader.onerror = reject
        reader.readAsDataURL(blob)
      })
      const img = await loadIntoImage(dataUrl)
      if (img) return img
    }
  } catch (err) {
    console.warn('[Export] CORS fetch fallback for', url, err)
  }

  // 4. Fallback with crossOrigin anonymous
  try {
    const img = await loadIntoImage(url, 'anonymous')
    if (img) return img
  } catch (err) {
    console.warn('[Export] Anonymous image load failed for', url, err)
  }

  // 5. Final fallback plain image
  return await loadIntoImage(url)
}

function applyPrintCalibration(canvas: HTMLCanvasElement, gamma = 1.0, brightness = 0) {
  // If neutral calibration (gamma 1.0 and brightness offset 0 or legacy 1.0), do nothing
  if ((gamma === 1.0 || !gamma) && (brightness === 0 || brightness === 1.0 || !brightness)) return
  const ctx = canvas.getContext('2d')
  if (!ctx) return
  try {
    const imgData = ctx.getImageData(0, 0, canvas.width, canvas.height)
    const d = imgData.data
    const invGamma = 1 / Math.max(0.1, gamma || 1.0)

    // Admin panel slider is -30 to +30 (exposure offset, where 0 is neutral)
    // Support legacy factor if someone passed e.g. 1.15
    const isMultiplier = brightness > 0 && brightness <= 2.5 && brightness !== 1.0
    const factor = isMultiplier ? brightness : 1.0
    const offset = isMultiplier ? 0 : brightness

    for (let i = 0; i < d.length; i += 4) {
      let r = d[i] * factor + offset
      let g = d[i + 1] * factor + offset
      let b = d[i + 2] * factor + offset
      if (gamma !== 1.0) {
        r = 255 * Math.pow(Math.max(0, r) / 255, invGamma)
        g = 255 * Math.pow(Math.max(0, g) / 255, invGamma)
        b = 255 * Math.pow(Math.max(0, b) / 255, invGamma)
      }
      d[i] = Math.min(255, Math.max(0, Math.round(r)))
      d[i + 1] = Math.min(255, Math.max(0, Math.round(g)))
      d[i + 2] = Math.min(255, Math.max(0, Math.round(b)))
    }
    ctx.putImageData(imgData, 0, 0)
  } catch (e) {
    console.warn('[Print] Calibration failed:', e)
  }
}

export function ExportScreen({ onBack, onNewSession }: ExportScreenProps) {
  const { session, setPrintSettings } = useSessionStore()
  const { settings, decrementRollCount, recordPrintJob } = useSettingsStore()
  const { toast } = useToast()

  const [format, setFormat] = useState<ExportFormat>('jpeg')
  const [quality, setQuality] = useState(95)
  const [dpi, setDpi] = useState(300)
  const [copies, setCopies] = useState<number>(session?.printSettings?.copies || 1)
  const [paperLayout, setPaperLayout] = useState<PaperLayout>(() => {
    // Auto-select based on ticket plan if available (e.g. ₹99 is A5 2-strip layout, ₹149/₹179 is A4 5-strip)
    const ticket = useQueueStore.getState().activeTicket
    const plan = ticket?.planType ?? ticket?.paymentAmount
    if (plan && PLAN_LAYOUTS[plan as number]) return PLAN_LAYOUTS[plan as number]

    // If session has more than 2 strips and no plan specified, show A4 5-slot layout
    const sessionStrips = useSessionStore.getState().session?.strips?.length || 0
    return 'a5-2'
  })
  const [paperSaving, setPaperSaving] = useState(true)
  const [currentSheetIndex, setCurrentSheetIndex] = useState(0)
  const [exporting, setExporting] = useState(false)
  const [printing, setPrinting] = useState(false)
  const [exportSuccess, setExportSuccess] = useState(false)
  const [exportedPaths, setExportedPaths] = useState<string[]>([])

  // Digital sharing & modals state
  const [showQrModal, setShowQrModal] = useState(false)
  const [showEmailModal, setShowEmailModal] = useState(false)
  const [showSmsModal, setShowSmsModal] = useState(false)
  const [showPaperOutModal, setShowPaperOutModal] = useState(false)
  const [emailAddress, setEmailAddress] = useState('')
  const [sendingEmail, setSendingEmail] = useState(false)
  const [emailSuccess, setEmailSuccess] = useState(false)
  const [copiedLink, setCopiedLink] = useState(false)

  // Track canvas memory for unmount cleanup
  const activeCanvasesRef = useRef<HTMLCanvasElement[]>([])

  // Memory zeroing on unmount
  useEffect(() => {
    return () => {
      activeCanvasesRef.current.forEach(c => {
        c.width = 0
        c.height = 0
      })
      activeCanvasesRef.current = []
    }
  }, [])

  // Synchronize ticket status to PRINTING
  useEffect(() => {
    if (session?.ticketId) {
      useQueueStore.getState().updateTicketStatus(session.ticketId, 'PRINTING', {
        sessionId: session.id,
      })
    }
  }, [session?.ticketId, session?.id])

  const strips = session?.strips ?? []
  const photos = session?.photos ?? []
  const assignments = session?.assignments ?? []
  const template = session?.template
  const activeTicket = useQueueStore(state => state.activeTicket)
  const ticketNumber =
    session?.ticketCode ||
    activeTicket?.code ||
    (session?.ticketId ? (useQueueStore.getState().tickets.find(t => t.id === session.ticketId)?.code || session.ticketId.slice(0, 6).toUpperCase()) : '') ||
    '1001'

  // Resolve plan from ticket
  const resolvedTicket = session?.ticketId
    ? (useQueueStore.getState().tickets.find(t => t.id === session.ticketId) || activeTicket)
    : activeTicket
  const ticketPlan = resolvedTicket?.planType ?? (resolvedTicket?.paymentAmount as (99 | 149 | 179) | undefined)
  const [upgradedPlan, setUpgradedPlan] = useState<TicketPlan | null>(null)
  const [selectedUpsellTier, setSelectedUpsellTier] = useState<'tier1' | 'tier2'>('tier2')
  const [showUpsellModal, setShowUpsellModal] = useState(false)
  const [upsellExceededCount, setUpsellExceededCount] = useState(0)

  // Current effective plan & strip limit
  const effectivePlan: TicketPlan =
    upgradedPlan ||
    (ticketPlan === 99 || ticketPlan === 149 || ticketPlan === 179 ? (ticketPlan as TicketPlan) : 99)
  const planStripLimit = PLAN_STRIP_LIMITS[effectivePlan] ?? 2
  const isPlanExceeded = strips.length > planStripLimit

  // User strip selection: lets customer pick which strips they want to keep & print
  const [selectedStripIndices, setSelectedStripIndices] = useState<number[]>(() => {
    const lim = PLAN_STRIP_LIMITS[effectivePlan] ?? 2
    const total = useSessionStore.getState().session?.strips?.length || 0
    return Array.from({ length: Math.min(lim, total) }, (_, i) => i)
  })

  // Synchronize selection when plan is upgraded or strips load
  useEffect(() => {
    if (upgradedPlan) {
      setSelectedStripIndices(Array.from({ length: strips.length }, (_, i) => i))
    } else if (selectedStripIndices.length === 0 && strips.length > 0) {
      setSelectedStripIndices(Array.from({ length: Math.min(planStripLimit, strips.length) }, (_, i) => i))
    }
  }, [upgradedPlan, strips.length, planStripLimit])

  // Toggle or swap strip selection (allows selecting e.g. Strip 1 and Strip 3)
  const toggleStripSelection = useCallback((idx: number) => {
    if (upgradedPlan || strips.length <= planStripLimit) return

    setSelectedStripIndices(prev => {
      if (prev.includes(idx)) {
        if (prev.length > 1) {
          const next = prev.filter(i => i !== idx)
          toast(`Deselected Strip #${idx + 1} (${next.length} chosen)`, 'info')
          return next
        }
        return prev
      } else {
        if (prev.length < planStripLimit) {
          const next = [...prev, idx].sort((a, b) => a - b)
          toast(`Selected Strip #${idx + 1} (${next.length} of ${planStripLimit} chosen)`, 'success')
          return next
        } else {
          // Swap: replace the last chosen item with this one
          const next = [...prev.slice(0, planStripLimit - 1), idx].sort((a, b) => a - b)
          toast(`Swapped to Strip #${idx + 1} (${next.length} of ${planStripLimit} chosen)`, 'info')
          return next
        }
      }
    })
  }, [upgradedPlan, strips.length, planStripLimit, toast])

  // Payment method state for upsell modal (Razorpay, Direct UPI, or Cash)
  const [upsellPaymentMethod, setUpsellPaymentMethod] = useState<'razorpay' | 'upi' | 'cash'>('razorpay')

  // Upsell offers definition
  const upgradeOffers = effectivePlan === 149
    ? {
        tier1: { fee: 30, targetPlan: 179 as TicketPlan, title: '+₹30 · Unlock 4 Strips', desc: 'Add 1 more strip to your A4 print' },
        tier2: { fee: 49, targetPlan: 179 as TicketPlan, title: '+₹49 · Unlock All 5 Strips', desc: 'BEST VALUE ⭐ Unlock 2 more strips (all 5 on full A4!)' },
      }
    : {
        tier1: { fee: 49, targetPlan: 149 as TicketPlan, title: '+₹49 · Unlock 3 Strips', desc: 'Add 1 extra strip (printed on A4 sheet)' },
        tier2: { fee: 79, targetPlan: 179 as TicketPlan, title: '+₹79 · Unlock All 5 Strips', desc: 'BEST VALUE ⭐ Unlock 2 more strips (total 5 on full A4!)' },
      }
  const currentUpgrade = selectedUpsellTier === 'tier1' ? upgradeOffers.tier1 : upgradeOffers.tier2
  const upgradeUpiUrl = `upi://pay?pa=9313780044@superyes&pn=Photobooth&am=${currentUpgrade.fee}&cu=INR&tn=Upgrade Ticket ${ticketNumber}`

  const handleFinishSession = useCallback(async () => {
    if (session?.ticketId) {
      await useQueueStore.getState().updateTicketStatus(session.ticketId, 'COMPLETED', {
        printCount: copies * (session.strips?.length || 1),
        sessionId: session.id,
      })
    }
    onNewSession()
  }, [session?.ticketId, session?.id, session?.strips?.length, copies, onNewSession])

  const handleCopiesChange = (newCopies: number) => {
    const clamped = Math.max(1, Math.min(10, newCopies))
    setCopies(clamped)
    setPrintSettings({ copies: clamped })
  }

  const getPhotoForSlot = useCallback(
    (slotId: string | undefined, slotIdx: number, stripIdx: number) => {
      // 1. Direct assignment match by slotId
      if (slotId) {
        const assignment = assignments.find((a) => a.slotId === slotId)
        if (assignment) {
          const p = photos.find((ph) => ph.id === assignment.photoId)
          if (p) return p
        }
      }

      // 2. Match by stripId and position
      const currentStrip = strips[stripIdx]
      const stripAssignment = assignments.find(
        (a) => a.stripId === currentStrip?.id && a.position === slotIdx
      )
      if (stripAssignment) {
        const p = photos.find((ph) => ph.id === stripAssignment.photoId)
        if (p) return p
      }

      // 3. Slot's own photoId if present
      const slot = currentStrip?.slots[slotIdx]
      if (slot?.photoId) {
        const p = photos.find((ph) => ph.id === slot.photoId)
        if (p) return p
      }

      // 4. Global index across strips into selectedPhotoIds
      let globalIndex = 0
      for (let s = 0; s < stripIdx; s++) {
        globalIndex += strips[s]?.slots.length ?? 0
      }
      globalIndex += slotIdx

      if (session?.selectedPhotoIds && session.selectedPhotoIds[globalIndex]) {
        const p = photos.find((ph) => ph.id === session.selectedPhotoIds[globalIndex])
        if (p) return p
      }

      // 5. Fallback index in photos array
      if (photos[slotIdx]) return photos[slotIdx]

      return undefined
    },
    [assignments, photos, strips, session?.selectedPhotoIds]
  )

  const bg = template?.background
  let bgStyle: React.CSSProperties = {}
  if (bg?.type === 'solid') bgStyle.background = bg.color
  else if (bg?.type === 'gradient' && bg.gradient) {
    const { angle, stops } = bg.gradient
    bgStyle.background = `linear-gradient(${angle ?? 135}deg, ${stops.map(s => `${s.color} ${s.offset * 100}%`).join(', ')})`
  } else {
    bgStyle.background = '#6D0626'
  }

  const border = template?.border
  if (border && border.type !== 'none') {
    bgStyle.border = `${border.width ?? 2}px solid ${border.color ?? '#cccccc'}`
  }

  // ─── Render an Individual Strip to Canvas ─────────────────────────────────
  const renderStripCanvas = useCallback(async (stripIdx: number): Promise<HTMLCanvasElement | null> => {
    const strip = strips[stripIdx]
    if (!strip) return null
    const slotCount = strip.slots.length
    if (slotCount === 0) return null

    let stripTemplate = strip.template ?? template
    if (stripTemplate && stripTemplate.id.startsWith('classic-black')) {
      stripTemplate = getDefaultTemplateForPhotoCount(slotCount)
    }
    const baseW = stripTemplate?.canvas?.width ?? 1200
    // Vintage photobooth strip: slim ~4% outer margin, ~2% photo spacing
    const margin = stripTemplate?.spacing?.outerMargin ? Math.min(54, stripTemplate.spacing.outerMargin) : 48
    const spacing = stripTemplate?.spacing?.photoSpacing ? Math.min(28, stripTemplate.spacing.photoSpacing) : 24

    const isSinglePhoto = slotCount <= 1
    const STANDARD_STRIP_HEIGHT = 4200
    // Use bespoke template canvas height (4200 for 1200x4200 strips) to fill full 21.0 cm print height
    const totalH = stripTemplate?.canvas?.height ?? STANDARD_STRIP_HEIGHT

    const hasFooterText = Boolean(stripTemplate?.textElements?.some(el => el.y > 200))
    const footerH = hasFooterText ? 140 : margin
    const slotW = baseW - margin * 2
    const availH = totalH - margin - footerH - (slotCount - 1) * spacing
    const slotH = Math.round(availH / Math.max(1, slotCount))

    const requestedScale = Math.max(1, dpi / 96)
    const MAX_CANVAS_DIM = 4200
    const finalScale = Math.min(requestedScale, MAX_CANVAS_DIM / Math.max(baseW, totalH))

    const W = Math.round(baseW * finalScale)
    const H = Math.round(totalH * finalScale)
    const scaledMargin = Math.round(margin * finalScale)
    const scaledSpacing = Math.round(spacing * finalScale)
    const scaledSlotW = Math.round(slotW * finalScale)
    const scaledSlotH = Math.round(slotH * finalScale)
    const scaledFooterH = Math.round(footerH * finalScale)

    const canvas = document.createElement('canvas')
    canvas.width = W
    canvas.height = H

    const ctx = canvas.getContext('2d', { willReadFrequently: true })
    if (!ctx) return null
    ctx.imageSmoothingEnabled = true
    ctx.imageSmoothingQuality = 'high'

    const tmplBg = stripTemplate?.background
    // 1. Background
    if (stripTemplate?.overlayImageUrl) {
      ctx.clearRect(0, 0, W, H)
    } else if (tmplBg?.type === 'solid' && tmplBg.color) {
      ctx.fillStyle = tmplBg.color
      ctx.fillRect(0, 0, W, H)
    } else if (tmplBg?.type === 'gradient' && tmplBg.gradient) {
      const { angle = 135, stops } = tmplBg.gradient
      const rad = (angle * Math.PI) / 180
      const x2 = Math.cos(rad) * W
      const y2 = Math.sin(rad) * H
      const grad = ctx.createLinearGradient(0, 0, x2, y2)
      stops.forEach(s => grad.addColorStop(s.offset, s.color))
      ctx.fillStyle = grad
      ctx.fillRect(0, 0, W, H)
    } else {
      ctx.fillStyle = '#6D0626'
      ctx.fillRect(0, 0, W, H)
    }

    // Template flags
    const is35mm = Boolean(stripTemplate?.id.includes('vintage-35mm'))
    const isPixel = Boolean(stripTemplate?.id.includes('pixel-romance'))
    const isCinema = Boolean(stripTemplate?.id === 'cinema-ticket-3' || stripTemplate?.id === 'cinema-ticket-4')
    const isCatchYours = Boolean(stripTemplate?.id.includes('catch-yours'))
    const isPapit = Boolean(stripTemplate?.id.includes('papit'))

    // 1b. PapIt Film Strip Rails & Sprockets
    if (isPapit) {
      ctx.save()
      ctx.fillStyle = '#141210'
      ctx.fillRect(0, 0, scaledMargin, H)
      ctx.fillRect(W - scaledMargin, 0, scaledMargin, H)

      const holeSize = Math.max(8, Math.round(34 * finalScale))
      const holeSpacing = Math.max(16, Math.round(76 * finalScale))
      const leftHoleX = Math.round((scaledMargin - holeSize) / 2)
      const rightHoleX = W - scaledMargin + Math.round((scaledMargin - holeSize) / 2)
      const corner = Math.max(2, Math.round(4 * finalScale))

      ctx.fillStyle = '#FBF7EE'
      for (let y = Math.round(40 * finalScale); y < H - holeSize - Math.round(20 * finalScale); y += holeSpacing) {
        ctx.beginPath()
        if (typeof ctx.roundRect === 'function') {
          ctx.roundRect(leftHoleX, y, holeSize, holeSize, corner)
          ctx.roundRect(rightHoleX, y, holeSize, holeSize, corner)
        } else {
          ctx.rect(leftHoleX, y, holeSize, holeSize)
          ctx.rect(rightHoleX, y, holeSize, holeSize)
        }
        ctx.fill()
      }
      ctx.restore()
    }

    // 1c. Cinema Ticket Inner Card Body
    if (isCinema) {
      const cardInsetX = Math.round(scaledMargin * 0.35)
      const cardInsetY = Math.round(scaledMargin * 0.35)
      const cardW = W - cardInsetX * 2
      const cardH = H - cardInsetY * 2
      ctx.save()
      ctx.fillStyle = '#FAF5EC'
      const cardRadius = Math.round(10 * finalScale)
      ctx.beginPath()
      if (typeof ctx.roundRect === 'function') {
        ctx.roundRect(cardInsetX, cardInsetY, cardW, cardH, cardRadius)
      } else {
        ctx.rect(cardInsetX, cardInsetY, cardW, cardH)
      }
      ctx.fill()
      ctx.strokeStyle = '#8A1C24'
      ctx.lineWidth = Math.max(2, Math.round(3 * finalScale))
      ctx.stroke()
      ctx.restore()
    }

    // 1c. 35mm Film Sprocket Perforations down Left and Right
    if (is35mm) {
      const holeW = Math.max(10, Math.round(18 * finalScale))
      const holeH = Math.max(14, Math.round(26 * finalScale))
      const holeGap = Math.max(8, Math.round(14 * finalScale))
      const step = holeH + holeGap
      const leftX = Math.max(4, Math.round(scaledMargin * 0.22))
      const rightX = W - leftX - holeW
      const corner = Math.max(2, Math.round(3 * finalScale))

      ctx.save()
      ctx.fillStyle = '#f5f5f0'
      for (let y = Math.round(20 * finalScale); y < H - holeH - Math.round(15 * finalScale); y += step) {
        ctx.beginPath()
        if (typeof ctx.roundRect === 'function') {
          ctx.roundRect(leftX, y, holeW, holeH, corner)
        } else {
          ctx.rect(leftX, y, holeW, holeH)
        }
        ctx.fill()

        ctx.beginPath()
        if (typeof ctx.roundRect === 'function') {
          ctx.roundRect(rightX, y, holeW, holeH, corner)
        } else {
          ctx.rect(rightX, y, holeW, holeH)
        }
        ctx.fill()
      }

      // Film edge markings
      ctx.fillStyle = 'rgba(255, 230, 180, 0.45)'
      ctx.font = `bold ${Math.max(10, Math.round(12 * finalScale))}px "DM Mono", monospace`
      ctx.textAlign = 'left'
      ctx.fillText('▶ 24A', leftX, Math.round(H * 0.48))
      ctx.fillText('KODAK 400TX', leftX, Math.round(H * 0.82))
      ctx.restore()
    }

    // 2. Preload Photos in Parallel (Promise.all)
    const slotPhotos = Array.from({ length: slotCount }, (_, i) => {
      const slot = strip.slots[i]
      return slot ? getPhotoForSlot(slot.id, i, stripIdx) : null
    })
    const preloadedImages = await Promise.all(
      slotPhotos.map(p => {
        const rawUrl = p?.originalUrl || p?.previewUrl || p?.thumbnailUrl || p?.originalPath
        return rawUrl ? loadPhotoElement(rawUrl) : Promise.resolve(null)
      })
    )

    const hasOverlay = Boolean(stripTemplate?.overlayImageUrl && stripTemplate?.photoSlots?.length)

    // Render Slots
    for (let slotIdx = 0; slotIdx < slotCount; slotIdx++) {
      const photo = slotPhotos[slotIdx]
      if (!photo) continue

      let slotX = scaledMargin
      let slotY = scaledMargin + slotIdx * (scaledSlotH + scaledSpacing)
      let curSlotW = scaledSlotW
      let curSlotH = scaledSlotH

      if (stripTemplate?.photoSlots?.[slotIdx]) {
        const ds = stripTemplate.photoSlots[slotIdx]
        const origW = stripTemplate.canvas?.width || 1200
        const origH = stripTemplate.canvas?.height || totalH
        slotX = Math.round((ds.x / origW) * W)
        slotY = Math.round((ds.y / origH) * H)
        curSlotW = Math.round((ds.width / origW) * W)
        curSlotH = Math.round((ds.height / origH) * H)
      }

      // Catch Yours: Draw white Polaroid card frame under photo with bottom caption lip
      if (isCatchYours) {
        const polaroidPad = Math.round(8 * finalScale)
        const polaroidLip = Math.round(24 * finalScale)
        ctx.save()
        ctx.fillStyle = '#ffffff'
        ctx.shadowColor = 'rgba(0,0,0,0.18)'
        ctx.shadowBlur = Math.round(10 * finalScale)
        ctx.shadowOffsetY = Math.round(4 * finalScale)
        ctx.fillRect(
          slotX - polaroidPad,
          slotY - polaroidPad,
          curSlotW + polaroidPad * 2,
          curSlotH + polaroidPad + polaroidLip
        )
        ctx.restore()
      }

      const img = preloadedImages[slotIdx]
      if (!img || img.naturalWidth === 0) continue

      const ds = stripTemplate?.photoSlots?.[slotIdx]
      const slotRot = ds?.rotation ?? 0

      ctx.save()

      // Translate to slot center
      const centerX = slotX + curSlotW / 2
      const centerY = slotY + curSlotH / 2
      ctx.translate(centerX, centerY)

      if (slotRot !== 0) {
        ctx.rotate((slotRot * Math.PI) / 180)
      }

      // Square photobooth cut
      ctx.beginPath()
      ctx.rect(-curSlotW / 2, -curSlotH / 2, curSlotW, curSlotH)
      ctx.clip()

      // Placeholder background under photo
      ctx.fillStyle = isCatchYours ? '#ffffff' : '#1e1e1e'
      ctx.fillRect(-curSlotW / 2, -curSlotH / 2, curSlotW, curSlotH)

      // Rotation & Flip
      const rot = photo.edits?.rotation ?? 0
      if (rot !== 0) {
        ctx.rotate((rot * Math.PI) / 180)
      }
      if (photo.edits?.flipH) ctx.scale(-1, 1)
      if (photo.edits?.flipV) ctx.scale(1, -1)

      // Scale (Zoom) & Pan
      const zoom = photo.edits?.scale ?? 1
      if (zoom !== 1) {
        ctx.scale(zoom, zoom)
      }
      const panX = (photo.edits?.panX ?? 0) * finalScale
      const panY = (photo.edits?.panY ?? 0) * finalScale
      if (panX !== 0 || panY !== 0) {
        ctx.translate(panX, panY)
      }

      // Filter
      try {
        const filterStr = filterEngine.getCSSFilter(photo.edits)
        if (filterStr && filterStr !== 'none') {
          ctx.filter = filterStr
        }
      } catch {}

      // Cover crop
      const imgW = img.naturalWidth
      const imgH = img.naturalHeight
      const isPerpendicular = Math.abs(rot % 180) === 90
      const destW = isPerpendicular ? curSlotH : curSlotW
      const destH = isPerpendicular ? curSlotW : curSlotH

      const targetRatio = destW / destH
      const imgRatio = imgW / imgH

      let sX = 0, sY = 0, sW = imgW, sH = imgH
      if (imgRatio > targetRatio) {
        sW = imgH * targetRatio
        sX = (imgW - sW) / 2
      } else {
        sH = imgW / targetRatio
        sY = (imgH - sH) / 2
      }

      ctx.drawImage(img, sX, sY, sW, sH, -destW / 2, -destH / 2, destW, destH)
      ctx.restore()

      // Distinctive Slot Outlines
      if (isPixel) {
        ctx.save()
        ctx.strokeStyle = '#c9182b'
        ctx.lineWidth = Math.max(2, Math.round(5 * finalScale))
        ctx.strokeRect(slotX, slotY, curSlotW, curSlotH)
        ctx.strokeStyle = 'rgba(201, 24, 43, 0.35)'
        ctx.lineWidth = Math.max(1, Math.round(2 * finalScale))
        ctx.strokeRect(slotX - Math.round(3 * finalScale), slotY - Math.round(3 * finalScale), curSlotW + Math.round(6 * finalScale), curSlotH + Math.round(6 * finalScale))
        ctx.restore()
      } else if (isCinema) {
        ctx.save()
        ctx.strokeStyle = '#8A1C24'
        ctx.lineWidth = Math.max(2, Math.round(4 * finalScale))
        ctx.strokeRect(slotX, slotY, curSlotW, curSlotH)
        ctx.restore()
      }
    }

    // 2b. Frame Overlay Image (Keyed transparent cutout layer)
    if (stripTemplate?.overlayImageUrl) {
      try {
        const overlayImg = await loadPhotoElement(stripTemplate.overlayImageUrl)
        if (overlayImg && overlayImg.naturalWidth > 0) {
          ctx.drawImage(overlayImg, 0, 0, W, H)
        } else {
          // Graceful fallback: clean border outline if overlay asset is missing
          ctx.save()
          ctx.strokeStyle = 'rgba(109, 6, 38, 0.4)'
          ctx.lineWidth = Math.max(2, Math.round(3 * finalScale))
          ctx.strokeRect(scaledMargin / 2, scaledMargin / 2, W - scaledMargin, H - scaledMargin)
          ctx.restore()
        }
      } catch (err) {
        console.error('Failed to draw template overlay:', err)
      }
    }

    // Catch Yours: Pink Ticket Stub Card at bottom
    if (isCatchYours) {
      const ticketY = H - scaledFooterH - Math.round(10 * finalScale)
      const ticketH = scaledFooterH + Math.round(4 * finalScale)
      const ticketW = scaledSlotW
      const ticketX = scaledMargin
      ctx.save()
      ctx.fillStyle = '#F7D2DA'
      ctx.fillRect(ticketX, ticketY, ticketW, ticketH)
      ctx.strokeStyle = '#8A252C'
      ctx.lineWidth = Math.max(1.5, Math.round(2 * finalScale))
      ctx.setLineDash([Math.round(8 * finalScale), Math.round(6 * finalScale)])
      ctx.strokeRect(ticketX, ticketY, ticketW, ticketH)
      ctx.restore()
    }

    // 3. Movable Canvas Text Elements or Fallback Template Text Elements
    const canvasElements = (session?.canvasElements ?? []).filter(el => !el.stripId || el.stripId === strip?.id)

    if (canvasElements.length > 0) {
      ctx.save()
      ctx.filter = 'none'
      for (const el of canvasElements) {
        if (el.type === 'sticker' && el.props && 'url' in el.props) {
          const stickerUrl = (el.props as any).url
          try {
            const stickerImg = await new Promise<HTMLImageElement | null>((resolve) => {
              const image = new Image()
              image.crossOrigin = 'anonymous'
              image.onload = () => resolve(image)
              image.onerror = () => resolve(null)
              image.src = stickerUrl
            })

            if (stickerImg) {
              const elX = Math.round(el.x * finalScale)
              const elY = Math.round(el.y * finalScale)
              const elW = Math.round(el.width * finalScale)
              const elH = Math.round(el.height * finalScale)

              ctx.save()
              ctx.globalAlpha = el.opacity ?? 1
              if (el.rotation) {
                ctx.translate(elX + elW / 2, elY + elH / 2)
                ctx.rotate((el.rotation * Math.PI) / 180)
                ctx.drawImage(stickerImg, -elW / 2, -elH / 2, elW, elH)
              } else {
                ctx.drawImage(stickerImg, elX, elY, elW, elH)
              }
              ctx.restore()
            }
          } catch (err) {
            console.warn('Failed to draw sticker on export canvas:', err)
          }
          continue
        }

        if (el.type !== 'text' || !el.textProps || !el.textProps.text) continue
        const tp = el.textProps
        const fontSize = Math.max(12, Math.round(tp.fontSize * finalScale))
        ctx.font = `${tp.fontStyle === 'italic' ? 'italic ' : ''}${tp.fontWeight ?? '600'} ${fontSize}px "${tp.fontFamily ?? 'Outfit'}", Inter, sans-serif`
        ctx.fillStyle = tp.color ?? '#111111'
        ctx.textAlign = tp.align ?? 'center'
        ctx.textBaseline = 'top'

        const elX = Math.round(el.x * finalScale)
        const elY = Math.round(el.y * finalScale)
        const elW = Math.round(el.width * finalScale)

        let targetX = elX
        if (tp.align === 'center') {
          targetX = elX + elW / 2
        } else if (tp.align === 'right') {
          targetX = elX + elW
        }

        ctx.save()
        if (el.rotation) {
          ctx.translate(elX + elW / 2, elY + fontSize / 2)
          ctx.rotate((el.rotation * Math.PI) / 180)
          ctx.translate(-(elX + elW / 2), -(elY + fontSize / 2))
        }
        // Word wrapped text drawing
        const words = (tp.text || '').split(' ')
        let line = ''
        let curY = elY
        const lineHeight = fontSize * 1.2
        const maxTextW = Math.max(100, elW)

        for (let n = 0; n < words.length; n++) {
          const testLine = line ? `${line} ${words[n]}` : words[n]
          const metrics = ctx.measureText(testLine)
          if (metrics.width > maxTextW && n > 0) {
            ctx.fillText(line, targetX, curY)
            line = words[n]
            curY += lineHeight
          } else {
            line = testLine
          }
        }
        ctx.fillText(line, targetX, curY)
        ctx.restore()
      }
      ctx.restore()
    }

    // 3b. PapIt Logo Watermark
    if (isPapit) {
      try {
        const logoImg = await loadPhotoElement('/papit.png')
        if (logoImg && logoImg.naturalWidth > 0) {
          const logoW = Math.round(200 * finalScale)
          const logoH = Math.round((logoW / logoImg.naturalWidth) * logoImg.naturalHeight)
          const logoX = Math.round((W - logoW) / 2)
          const logoY = Math.round((totalH > 4000 ? 3770 : 3080) * finalScale)
          ctx.drawImage(logoImg, logoX, logoY, logoW, logoH)
        }
      } catch {}
    }

    // 4. Border
    if (stripTemplate?.border && stripTemplate.border.type !== 'none') {
      ctx.filter = 'none'
      ctx.strokeStyle = stripTemplate.border.color ?? '#000000'
      const borderW = Math.max(2, (stripTemplate.border.width ?? 4) * finalScale)
      ctx.lineWidth = borderW
      ctx.strokeRect(borderW / 2, borderW / 2, W - borderW, H - borderW)
    }

    return canvas
  }, [strips, template, dpi, getPhotoForSlot, session?.canvasElements])

  // ─── Proportional Contain Helper: Keeps Strip Aspect Ratio 100% Uniform ──────
  function drawContainedStrip(
    ctx: CanvasRenderingContext2D,
    strip: HTMLCanvasElement,
    targetX: number,
    targetY: number,
    targetW: number,
    targetH: number
  ) {
    const stripRatio = strip.width / strip.height
    const targetRatio = targetW / targetH
    let drawW = targetW
    let drawH = targetH
    let drawX = targetX
    let drawY = targetY

    if (stripRatio > targetRatio) {
      // Strip is proportionally wider than target container
      drawH = Math.round(targetW / stripRatio)
      drawY = targetY + Math.round((targetH - drawH) / 2)
    } else {
      // Strip is proportionally taller or equal
      drawW = Math.round(targetH * stripRatio)
      drawX = targetX + Math.round((targetW - drawW) / 2)
    }
    ctx.drawImage(strip, drawX, drawY, drawW, drawH)
  }

  // ─── Compose a Dye-Sub 4x5" Split-Cut Sheet (Dual Strip on Same Paper) ────────
  const renderDyeSub4x5Canvas = useCallback(async (
    leftStripCanvas: HTMLCanvasElement,
    rightStripCanvas?: HTMLCanvasElement | null
  ): Promise<HTMLCanvasElement | null> => {
    if (!leftStripCanvas) return null

    // Standard 4x5" Photo at 300 DPI: 1200 x 1500 px (Portrait)
    // Yields two 2x5" strips side-by-side: 600 x 1500 px each
    const SHEET_W = 1200
    const SHEET_H = 1500

    const canvas = document.createElement('canvas')
    canvas.width = SHEET_W
    canvas.height = SHEET_H
    activeCanvasesRef.current.push(canvas)

    const ctx = canvas.getContext('2d')
    if (!ctx) return null

    ctx.fillStyle = '#ffffff'
    ctx.fillRect(0, 0, SHEET_W, SHEET_H)

    const stripW = SHEET_W / 2 // 600 px

    // Draw Left Strip (0 to 600 px) - strictly contained to avoid vertical squishing
    drawContainedStrip(ctx, leftStripCanvas, 0, 0, stripW, SHEET_H)

    // Draw Right Strip (600 to 1200 px) - auto-duplicate if paper saving is active
    const effectiveRight = rightStripCanvas ?? (paperSaving ? leftStripCanvas : null)
    if (effectiveRight) {
      drawContainedStrip(ctx, effectiveRight, stripW, 0, stripW, SHEET_H)
    }

    // Center vertical dashed cutline guide (where dye-sub split blade cuts)
    ctx.save()
    ctx.setLineDash([14, 10])
    ctx.strokeStyle = 'rgba(0, 0, 0, 0.35)'
    ctx.lineWidth = 2
    ctx.beginPath()
    ctx.moveTo(stripW, 0)
    ctx.lineTo(stripW, SHEET_H)
    ctx.stroke()
    ctx.restore()

    // Apply dye-sub gamma and brightness calibration curve
    applyPrintCalibration(
      canvas,
      settings.printerRoll.dyeSubGamma ?? 1.0,
      settings.printerRoll.dyeSubBrightness ?? 0
    )

    return canvas
  }, [paperSaving, settings.printerRoll.dyeSubGamma, settings.printerRoll.dyeSubBrightness])

  const renderDyeSub4x6Canvas = renderDyeSub4x5Canvas

  // ─── Compose an A5 Duplex Sheet (Two Strips on Half-A4 / 14.8 × 21.0 cm) ───
  // A5 Dimensions at 300 DPI: 1748 × 2480 px (148 × 210 mm)
  // Left half  = 874 × 2480 px (Strip 1)
  // Right half = 874 × 2480 px (Strip 2 or auto-duplicate of Strip 1)
  // Centre cut line divides the sheet into two 7.4 × 21.0 cm physical photo strips
  const renderA5DuplexCanvas = useCallback(async (
    leftStripCanvas: HTMLCanvasElement,
    rightStripCanvas?: HTMLCanvasElement | null
  ): Promise<HTMLCanvasElement | null> => {
    if (!leftStripCanvas) return null

    const SHEET_W = 1748 // 148 mm at 300 DPI
    const SHEET_H = 2480 // 210 mm at 300 DPI
    const STRIP_W = SHEET_W / 2 // 874 px (7.4 cm each)

    const canvas = document.createElement('canvas')
    canvas.width = SHEET_W
    canvas.height = SHEET_H
    activeCanvasesRef.current.push(canvas)

    const ctx = canvas.getContext('2d', { willReadFrequently: true })
    if (!ctx) return null
    ctx.imageSmoothingEnabled = true
    ctx.imageSmoothingQuality = 'high'

    ctx.fillStyle = '#ffffff'
    ctx.fillRect(0, 0, SHEET_W, SHEET_H)

    // Left strip — preserved aspect ratio, centered in left column
    drawContainedStrip(ctx, leftStripCanvas, 0, 0, STRIP_W, SHEET_H)

    // Right strip — auto-duplicate if only 1 strip exists (utilizes 100% of the A5 paper, 0 waste!)
    const effectiveRight = rightStripCanvas ?? (paperSaving ? leftStripCanvas : null)
    if (effectiveRight) {
      drawContainedStrip(ctx, effectiveRight, STRIP_W, 0, STRIP_W, SHEET_H)
    }

    // Centre split-cut dashed guide (x = 874 px)
    ctx.save()
    ctx.setLineDash([14, 10])
    ctx.strokeStyle = 'rgba(0, 0, 0, 0.32)'
    ctx.lineWidth = 2
    ctx.beginPath()
    ctx.moveTo(STRIP_W, 0)
    ctx.lineTo(STRIP_W, SHEET_H)
    ctx.stroke()
    ctx.restore()

    // Scissor icon at midpoint of cut line
    ctx.save()
    ctx.font = '24px sans-serif'
    ctx.fillStyle = 'rgba(0, 0, 0, 0.30)'
    ctx.textAlign = 'center'
    ctx.fillText('✂', STRIP_W, SHEET_H / 2)
    ctx.restore()

    // Ticket number printed discreetly at bottom of cut line (no extra text)
    if (ticketNumber) {
      ctx.save()
      ctx.font = 'bold 20px monospace'
      ctx.fillStyle = 'rgba(0, 0, 0, 0.40)'
      ctx.textAlign = 'center'
      ctx.fillText(`#${ticketNumber}`, STRIP_W, SHEET_H - 18)
      ctx.restore()
    }

    applyPrintCalibration(
      canvas,
      settings.printerRoll.dyeSubGamma ?? 1.0,
      settings.printerRoll.dyeSubBrightness ?? 0
    )

    return canvas
  }, [paperSaving, settings.printerRoll.dyeSubGamma, settings.printerRoll.dyeSubBrightness, ticketNumber])

  // ─── Compose a Standard 4"×6" Duplex Sheet (Two 2"×6" strips side-by-side) ─
  // This is the industry-standard retail photobooth print:
  //   4" × 6" sheet at 300 DPI = 1200 × 1800 px
  //   Left half  = 600 × 1800 px  (strip 1 or odd copy)
  //   Right half = 600 × 1800 px  (strip 2 or paper-saving duplicate)
  //   Customer takes BOTH halves after the centre split-cut.
  const render4x6DuplexCanvas = useCallback(async (
    leftStripCanvas: HTMLCanvasElement,
    rightStripCanvas?: HTMLCanvasElement | null
  ): Promise<HTMLCanvasElement | null> => {
    if (!leftStripCanvas) return null

    // 4"×6" portrait at 300 DPI
    const SHEET_W = 1200  // 4" × 300 dpi
    const SHEET_H = 1800  // 6" × 300 dpi
    const STRIP_W = SHEET_W / 2  // 600 px — 2" each

    const canvas = document.createElement('canvas')
    canvas.width = SHEET_W
    canvas.height = SHEET_H
    activeCanvasesRef.current.push(canvas)

    const ctx = canvas.getContext('2d')
    if (!ctx) return null

    ctx.fillStyle = '#ffffff'
    ctx.fillRect(0, 0, SHEET_W, SHEET_H)

    // Left strip — preserved aspect ratio
    drawContainedStrip(ctx, leftStripCanvas, 0, 0, STRIP_W, SHEET_H)

    // Right strip — auto-duplicate if paper saving is active to eliminate half-sheet paper waste
    const effectiveRight = rightStripCanvas ?? (paperSaving ? leftStripCanvas : null)
    if (effectiveRight) {
      drawContainedStrip(ctx, effectiveRight, STRIP_W, 0, STRIP_W, SHEET_H)
    }

    // Centre split-cut dashed guide
    ctx.save()
    ctx.setLineDash([12, 8])
    ctx.strokeStyle = 'rgba(0,0,0,0.30)'
    ctx.lineWidth = 1.5
    ctx.beginPath()
    ctx.moveTo(STRIP_W, 0)
    ctx.lineTo(STRIP_W, SHEET_H)
    ctx.stroke()
    ctx.restore()

    // Scissor icon at midpoint of cut line
    ctx.save()
    ctx.font = '16px sans-serif'
    ctx.fillStyle = 'rgba(0,0,0,0.25)'
    ctx.textAlign = 'center'
    ctx.fillText('✂', STRIP_W, SHEET_H / 2)
    ctx.restore()

    applyPrintCalibration(
      canvas,
      settings.printerRoll.dyeSubGamma ?? 1.0,
      settings.printerRoll.dyeSubBrightness ?? 0
    )

    return canvas
  }, [paperSaving, settings.printerRoll.dyeSubGamma, settings.printerRoll.dyeSubBrightness])

  // ─── Compose an A4 Sheet Canvas ───────────────────────────────────────────
  const renderA4SheetCanvas = useCallback(async (
    layoutType: 'a4-5' | 'a4-6' | 'a4-4' | 'a4-8',
    sheetStrips: HTMLCanvasElement[]
  ): Promise<HTMLCanvasElement | null> => {
    if (sheetStrips.length === 0) return null

    if (layoutType === 'a4-5' || layoutType === 'a4-6' || layoutType === 'a4-4') {
      // ─── A4 Horizontal / Landscape: 5 Strips (6.0 cm), 6 Strips (5.0 cm), or 4 Strips (6.0 cm) ──
      // A4 Landscape Dimensions at 300 DPI: 3508 × 2480 px (297 × 210 mm)
      const A4_W = 3508
      const A4_H = 2480 // 210 mm = 21.0 cm

      const canvas = document.createElement('canvas')
      canvas.width = A4_W
      canvas.height = A4_H
      const ctx = canvas.getContext('2d', { willReadFrequently: true })
      if (!ctx) return null
      ctx.imageSmoothingEnabled = true
      ctx.imageSmoothingQuality = 'high'

      // Clean white photographic paper
      ctx.fillStyle = '#ffffff'
      ctx.fillRect(0, 0, A4_W, A4_H)

      const cols = layoutType === 'a4-5' ? 5 : layoutType === 'a4-6' ? 6 : 4
      const spacingX = layoutType === 'a4-4' ? 16 : 8
      const totalGap = (cols - 1) * spacingX
      const stripW = Math.floor((A4_W - totalGap) / cols)
      // FULL 21.0 CM HEIGHT: Spans from top (y=0) to bottom (y=2480px) with 0 empty gap
      const stripH = A4_H
      const marginX = Math.round((A4_W - (cols * stripW + totalGap)) / 2)
      const marginY = 0

      for (let c = 0; c < cols; c++) {
        // Do NOT repeat strips to save ink! Only draw strips that actually exist in this sheet
        const stripCanvas = sheetStrips[c]
        if (!stripCanvas) continue

        const x = marginX + c * (stripW + spacingX)
        const y = marginY

        // Draw strip directly at full 21.0 cm height from top edge to bottom edge
        ctx.drawImage(stripCanvas, x, y, stripW, stripH)

        // Vertical dashed cut line between strips (full printable height)
        if (c < cols - 1) {
          const cutX = x + stripW + Math.round(spacingX / 2)
          ctx.save()
          ctx.setLineDash([12, 8])
          ctx.strokeStyle = 'rgba(0, 0, 0, 0.32)'
          ctx.lineWidth = 2
          ctx.beginPath()
          ctx.moveTo(cutX, 0)
          ctx.lineTo(cutX, A4_H)
        }
      }

      // Ticket number printed discreetly at bottom right margin (no extra text)
      if (ticketNumber) {
        ctx.save()
        ctx.font = 'bold 22px monospace'
        ctx.fillStyle = 'rgba(0, 0, 0, 0.40)'
        ctx.textAlign = 'right'
        ctx.fillText(`#${ticketNumber}`, A4_W - 24, A4_H - 18)
        ctx.restore()
      }

      return canvas
    }

    // A4 Dimensions at 300 DPI: 2480 × 3508 px (210 × 297 mm) - Option: 8 Strips (2 Rows of 4)
    const A4_W = 2480
    const A4_H = 3508

    const canvas = document.createElement('canvas')
    canvas.width = A4_W
    canvas.height = A4_H
    const ctx = canvas.getContext('2d', { willReadFrequently: true })
    if (!ctx) return null
    ctx.imageSmoothingEnabled = true
    ctx.imageSmoothingQuality = 'high'

    // Clean white photographic paper
    ctx.fillStyle = '#ffffff'
    ctx.fillRect(0, 0, A4_W, A4_H)

    {
      // ─── OPTION: 8 Strips (2 Rows × 4 Columns / 5.0 × 14.5 cm) ─────────
      const cols = 4
      const rows = 2
      const stripW = 575
      const stripH = 1670 // 5.0 × 14.5 cm proportion
      const spacingX = 20
      const spacingY = 40
      const marginX = Math.round((A4_W - (cols * stripW + (cols - 1) * spacingX)) / 2) // ~60px
      const marginY = Math.round((A4_H - (rows * stripH + (rows - 1) * spacingY)) / 2) // ~64px

      for (let r = 0; r < rows; r++) {
        for (let c = 0; c < cols; c++) {
          const idx = r * cols + c
          // Do NOT repeat strips to save ink!
          const stripCanvas = sheetStrips[idx]
          if (!stripCanvas) continue

          const x = marginX + c * (stripW + spacingX)
          const y = marginY + r * (stripH + spacingY)

          drawContainedStrip(ctx, stripCanvas, x, y, stripW, stripH)

          // Vertical cut guides
          if (c < cols - 1) {
            const cutX = x + stripW + spacingX / 2
            ctx.save()
            ctx.setLineDash([14, 10])
            ctx.strokeStyle = 'rgba(0, 0, 0, 0.28)'
            ctx.lineWidth = 2.5
            ctx.beginPath()
            ctx.moveTo(cutX, 30)
            ctx.lineTo(cutX, A4_H - 30)
            ctx.stroke()
            ctx.restore()
          }
        }
      }

      // Horizontal center cut line (directly divides the 2 rows)
      const centerCutY = marginY + stripH + spacingY / 2
      ctx.save()
      ctx.setLineDash([16, 12])
      ctx.strokeStyle = 'rgba(0, 0, 0, 0.35)'
      ctx.lineWidth = 3
      ctx.beginPath()
      ctx.moveTo(30, centerCutY)
      ctx.lineTo(A4_W - 30, centerCutY)
      ctx.stroke()
      ctx.restore()

      // Cut annotation text (only ticket number, no instructional text)
      if (ticketNumber) {
        ctx.font = '20px "DM Mono", monospace'
        ctx.fillStyle = 'rgba(0, 0, 0, 0.40)'
        ctx.textAlign = 'center'
        ctx.fillText(`#${ticketNumber}`, A4_W / 2, centerCutY - 14)
      }
    }

    return canvas
  }, [ticketNumber])

  // ─── Export Pipeline ──────────────────────────────────────────────────────
  const exportStrips = useCallback(async () => {
    if (!session || strips.length === 0) return
    setExporting(true)
    setExportSuccess(false)

    try {
      const mimeType = format === 'png' ? 'image/png'
        : format === 'webp' ? 'image/webp'
        : 'image/jpeg'
      const qualityVal = format === 'png' ? undefined : quality / 100

      // 1. Render all distinct strip canvases
      const singleStripCanvases: HTMLCanvasElement[] = []
      for (let s = 0; s < strips.length; s++) {
        const c = await renderStripCanvas(s)
        if (c) singleStripCanvases.push(c)
      }

      if (singleStripCanvases.length === 0) {
        throw new Error('Could not render strips')
      }

      // Build repeated strip array according to user copies
      const allDesiredStrips: HTMLCanvasElement[] = []
      for (let c = 0; c < copies; c++) {
        for (const canvas of singleStripCanvases) {
          allDesiredStrips.push(canvas)
        }
      }

      const previewUrls: string[] = []

      if (paperLayout === 'single') {
        // ─── Single Strip Export ────────────────────────────────────────────
        if (format === 'pdf') {
          const { jsPDF } = await import('jspdf')
          let pdf: any = null

          for (let i = 0; i < allDesiredStrips.length; i++) {
            const canvas = allDesiredStrips[i]
            const W = canvas.width
            const H = canvas.height
            const pdfOrientation = W > H ? 'landscape' : 'portrait'
            const finalUrl = canvas.toDataURL('image/jpeg', qualityVal)
            if (i === 0) previewUrls.push(finalUrl)

            if (!pdf) {
              pdf = new jsPDF({ orientation: pdfOrientation, unit: 'px', format: [W, H] })
              pdf.addImage(finalUrl, 'JPEG', 0, 0, W, H)
            } else {
              pdf.addPage([W, H], pdfOrientation)
              pdf.addImage(finalUrl, 'JPEG', 0, 0, W, H)
            }
          }
          if (pdf) pdf.save(`${session.id}-single-strips-${copies}x.pdf`)
        } else {
          for (let i = 0; i < allDesiredStrips.length; i++) {
            const canvas = allDesiredStrips[i]
            const finalUrl = canvas.toDataURL(mimeType, qualityVal)
            if (i === 0) previewUrls.push(finalUrl)

            const a = document.createElement('a')
            a.href = finalUrl
            a.download = `${session.id}-strip-${i + 1}.${format}`
            document.body.appendChild(a)
            a.click()
            document.body.removeChild(a)
            await new Promise(resolve => setTimeout(resolve, 200))
          }
        }
      } else if (paperLayout === 'a5-2') {
        // ─── A5 Duplex Export (two strips on 14.8 × 21.0 cm A5 sheet) ───────
        const duplexCanvases: HTMLCanvasElement[] = []
        const allDesiredStrips: HTMLCanvasElement[] = []
        for (let c = 0; c < copies; c++) {
          for (const canvas of singleStripCanvases) {
            allDesiredStrips.push(canvas)
          }
        }
        for (let s = 0; s < allDesiredStrips.length; s += 2) {
          const left = allDesiredStrips[s]
          const right = allDesiredStrips[s + 1] || (paperSaving ? allDesiredStrips[s] : null)
          const sheetCanvas = await renderA5DuplexCanvas(left, right)
          if (sheetCanvas) {
            duplexCanvases.push(sheetCanvas)
          }
        }

        if (format === 'pdf') {
          const { jsPDF } = await import('jspdf')
          const pdf = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a5' })
          for (let i = 0; i < duplexCanvases.length; i++) {
            const finalUrl = duplexCanvases[i].toDataURL('image/jpeg', qualityVal)
            if (i === 0) previewUrls.push(finalUrl)
            if (i > 0) pdf.addPage('a5', 'portrait')
            pdf.addImage(finalUrl, 'JPEG', 0, 0, 148, 210)
          }
          pdf.save(`${session.id}-A5-Duplex-${duplexCanvases.length}sheets.pdf`)
        } else {
          for (let i = 0; i < duplexCanvases.length; i++) {
            const finalUrl = duplexCanvases[i].toDataURL(mimeType, qualityVal)
            if (i === 0) previewUrls.push(finalUrl)
            const a = document.createElement('a')
            a.href = finalUrl
            a.download = `${session.id}-A5-Duplex-sheet-${i + 1}.${format}`
            document.body.appendChild(a)
            a.click()
            document.body.removeChild(a)
            await new Promise(resolve => setTimeout(resolve, 200))
          }
        }
      } else if (paperLayout === '4x6-duplex') {
        // ─── Standard 4"×6" Duplex Export (two 2"×6" strips on one 4"×6" sheet) ─
        const duplexCanvases: HTMLCanvasElement[] = []
        const allDesiredStrips: HTMLCanvasElement[] = []
        for (let c = 0; c < copies; c++) {
          for (const canvas of singleStripCanvases) {
            allDesiredStrips.push(canvas)
          }
        }
        for (let s = 0; s < allDesiredStrips.length; s += 2) {
          const left = allDesiredStrips[s]
          const right = allDesiredStrips[s + 1] || (paperSaving ? allDesiredStrips[s] : null)
          const sheetCanvas = await render4x6DuplexCanvas(left, right)
          if (sheetCanvas) {
            duplexCanvases.push(sheetCanvas)
          }
        }

        if (format === 'pdf') {
          const { jsPDF } = await import('jspdf')
          // 4"×6" portrait
          const pdf = new jsPDF({ orientation: 'portrait', unit: 'in', format: [4, 6] })
          for (let i = 0; i < duplexCanvases.length; i++) {
            const finalUrl = duplexCanvases[i].toDataURL('image/jpeg', qualityVal)
            if (i === 0) previewUrls.push(finalUrl)
            if (i > 0) pdf.addPage([4, 6], 'portrait')
            pdf.addImage(finalUrl, 'JPEG', 0, 0, 4, 6)
          }
          pdf.save(`${session.id}-4x6-duplex-${duplexCanvases.length}sheets.pdf`)
        } else {
          for (let i = 0; i < duplexCanvases.length; i++) {
            const finalUrl = duplexCanvases[i].toDataURL(mimeType, qualityVal)
            if (i === 0) previewUrls.push(finalUrl)
            const a = document.createElement('a')
            a.href = finalUrl
            a.download = `${session.id}-4x6-duplex-sheet-${i + 1}.${format}`
            document.body.appendChild(a)
            a.click()
            document.body.removeChild(a)
            await new Promise(resolve => setTimeout(resolve, 200))
          }
        }
      } else if (paperLayout === '4x5-split' || paperLayout === '4x6-split') {
        // ─── Dye-Sub 4×5" Split-Cut Sheet Export ─────────────────────────────
        const splitCanvases: HTMLCanvasElement[] = []
        if (singleStripCanvases.length <= 1) {
          const sheetCanvas = await renderDyeSub4x5Canvas(singleStripCanvases[0], singleStripCanvases[0])
          if (sheetCanvas) {
            for (let sh = 0; sh < copies; sh++) splitCanvases.push(sheetCanvas)
          }
        } else {
          for (let s = 0; s < singleStripCanvases.length; s += 2) {
            const left = singleStripCanvases[s]
            const right = singleStripCanvases[s + 1] || singleStripCanvases[s]
            const sheetCanvas = await renderDyeSub4x5Canvas(left, right)
            if (sheetCanvas) {
              for (let sh = 0; sh < copies; sh++) splitCanvases.push(sheetCanvas)
            }
          }
        }

        if (format === 'pdf') {
          const { jsPDF } = await import('jspdf')
          const pdf = new jsPDF({ orientation: 'landscape', unit: 'in', format: [5, 4] })
          for (let i = 0; i < splitCanvases.length; i++) {
            const finalUrl = splitCanvases[i].toDataURL('image/jpeg', qualityVal)
            if (i === 0) previewUrls.push(finalUrl)
            if (i > 0) pdf.addPage([5, 4], 'landscape')
            pdf.addImage(finalUrl, 'JPEG', 0, 0, 5, 4)
          }
          pdf.save(`${session.id}-4x5-split-${splitCanvases.length}sheets.pdf`)
        } else {
          for (let i = 0; i < splitCanvases.length; i++) {
            const finalUrl = splitCanvases[i].toDataURL(mimeType, qualityVal)
            if (i === 0) previewUrls.push(finalUrl)
            const a = document.createElement('a')
            a.href = finalUrl
            a.download = `${session.id}-4x5-split-sheet-${i + 1}.${format}`
            document.body.appendChild(a)
            a.click()
            document.body.removeChild(a)
            await new Promise(resolve => setTimeout(resolve, 200))
          }
        }
      } else {
        // ─── A4 Sheet Export (Option: 5 strips/page horizontal, 6 strips/page, 4 strips/page, or 8 strips/page) ─
        const stripsPerSheet = paperLayout === 'a4-5' ? 5 : paperLayout === 'a4-6' ? 6 : paperLayout === 'a4-4' ? 4 : 8
        const totalSheets = Math.max(1, Math.ceil(allDesiredStrips.length / stripsPerSheet))
        const layoutLabel = paperLayout === 'a4-5' ? '5strips-horizontal' : paperLayout === 'a4-6' ? '6strips-horizontal' : paperLayout === 'a4-4' ? '4strips-horizontal' : '8strips'

        // Render each A4 Sheet canvas
        const a4Canvases: HTMLCanvasElement[] = []
        for (let sheetIdx = 0; sheetIdx < totalSheets; sheetIdx++) {
          const slice = allDesiredStrips.slice(sheetIdx * stripsPerSheet, (sheetIdx + 1) * stripsPerSheet)
          const sheetCanvas = await renderA4SheetCanvas(paperLayout, slice)
          if (sheetCanvas) a4Canvases.push(sheetCanvas)
        }

        if (format === 'pdf') {
          const { jsPDF } = await import('jspdf')
          const isLandscape = paperLayout === 'a4-5' || paperLayout === 'a4-6' || paperLayout === 'a4-4'
          const pdf = new jsPDF({
            orientation: isLandscape ? 'landscape' : 'portrait',
            unit: 'mm',
            format: 'a4',
          })

          for (let i = 0; i < a4Canvases.length; i++) {
            const finalUrl = a4Canvases[i].toDataURL('image/jpeg', qualityVal)
            if (i === 0) previewUrls.push(finalUrl)

            if (i > 0) pdf.addPage('a4', isLandscape ? 'landscape' : 'portrait')
            if (isLandscape) {
              pdf.addImage(finalUrl, 'JPEG', 0, 0, 297, 210)
            } else {
              pdf.addImage(finalUrl, 'JPEG', 0, 0, 210, 297)
            }
          }
          pdf.save(`${session.id}-A4-Sheet-${layoutLabel}-${totalSheets}pages.pdf`)
        } else {
          for (let i = 0; i < a4Canvases.length; i++) {
            const finalUrl = a4Canvases[i].toDataURL(mimeType, qualityVal)
            if (i === 0) previewUrls.push(finalUrl)

            const a = document.createElement('a')
            a.href = finalUrl
            a.download = `${session.id}-A4-Sheet-${layoutLabel}-page-${i + 1}.${format}`
            document.body.appendChild(a)
            a.click()
            document.body.removeChild(a)
            await new Promise(resolve => setTimeout(resolve, 200))
          }
        }
      }

      setExportedPaths(previewUrls)
      setExportSuccess(true)
      toast(`Exported successfully!`, 'success')
    } catch (err) {
      console.error('[Export] Export failed:', err)
      toast('Export encountered an error. Please try again.', 'error')
    } finally {
      setExporting(false)
    }
  }, [session, strips, copies, format, quality, paperLayout, renderStripCanvas, renderA5DuplexCanvas, render4x6DuplexCanvas, renderA4SheetCanvas, toast])

  const totalPrints = strips.length * copies
  // Number of composite SHEETS that need to come out of the printer
  const totalA4Sheets =
    paperLayout === 'a5-2' ? Math.max(1, Math.ceil(totalPrints / 2)) :
    paperLayout === '4x6-duplex' ? Math.max(1, Math.ceil(strips.length / 2)) :
    (paperLayout === '4x5-split' || paperLayout === '4x6-split') ? Math.max(1, Math.ceil(strips.length / 2)) :
    paperLayout === 'a4-5' ? Math.max(1, Math.ceil(totalPrints / 5)) :
    paperLayout === 'a4-6' ? Math.max(1, Math.ceil(totalPrints / 6)) :
    paperLayout === 'a4-8' ? Math.max(1, Math.ceil(totalPrints / 8)) :
    paperLayout === 'a4-4' ? Math.max(1, Math.ceil(totalPrints / 4)) :
    strips.length
  const physicalSheets =
    paperLayout === 'a5-2' ? Math.max(1, Math.ceil(totalPrints / 2)) :
    paperLayout === '4x6-duplex' ? Math.max(1, Math.ceil(strips.length / 2)) * copies :
    (paperLayout === '4x5-split' || paperLayout === '4x6-split') ? Math.max(1, Math.ceil(strips.length / 2)) * copies :
    paperLayout === 'single' ? totalPrints :
    totalA4Sheets

  // ─── Direct Silent Print via Spooler with Roll Tracking ───────────────────
  // ─── Direct Silent Print via Spooler with Roll Tracking ───────────────────
  const handlePrint = useCallback(async (opts?: { overridePlan?: TicketPlan; maxStrips?: number; allowSelected?: boolean }) => {
    if (!session || strips.length === 0) return
    setPrinting(true)

    try {
      const activePlan = opts?.overridePlan || effectivePlan
      const limit = opts?.maxStrips !== undefined ? opts.maxStrips : (PLAN_STRIP_LIMITS[activePlan] ?? null)

      // 0. Plan strip limit check — show upsell if exceeding plan (unless user explicitly prints chosen selection or upgraded)
      if (!opts?.allowSelected && opts?.maxStrips === undefined && opts?.overridePlan === undefined && limit !== null && strips.length > limit && !upgradedPlan) {
        setUpsellExceededCount(strips.length - limit)
        setShowUpsellModal(true)
        setPrinting(false)
        return
      }

      // Determine which strip indices to render
      let printIndices: number[] = []
      if (!opts?.overridePlan && !upgradedPlan && isPlanExceeded) {
        printIndices = selectedStripIndices.length > 0 ? selectedStripIndices : Array.from({ length: Math.min(limit || 2, strips.length) }, (_, i) => i)
      } else if (limit !== null && strips.length > limit) {
        printIndices = selectedStripIndices.slice(0, limit)
      } else {
        printIndices = Array.from({ length: strips.length }, (_, i) => i)
      }

      // 1. Roll tracking & paper-out hard stop
      if (settings.printerRoll.enabled && settings.printerRoll.printsRemaining < physicalSheets) {
        setShowPaperOutModal(true)
        setPrinting(false)
        return
      }

      // 2. Render distinct strip canvases for the chosen strips
      const singleStripCanvases: HTMLCanvasElement[] = []
      for (const idx of printIndices) {
        const c = await renderStripCanvas(idx)
        if (c) singleStripCanvases.push(c)
      }

      if (singleStripCanvases.length === 0) {
        toast('No strips available to print.', 'warning')
        setPrinting(false)
        return
      }

      const activeLayout: PaperLayout = opts?.overridePlan
        ? (PLAN_LAYOUTS[opts.overridePlan] || paperLayout)
        : paperLayout

      let printSheetUrls: string[] = []

      if (activeLayout === 'a5-2') {
        // A5 Duplex: two strips side-by-side on 14.8 × 21.0 cm A5 sheet (Half-A4)
        const allDesiredStrips: HTMLCanvasElement[] = []
        for (let c = 0; c < copies; c++) {
          for (const canvas of singleStripCanvases) {
            allDesiredStrips.push(canvas)
          }
        }
        for (let s = 0; s < allDesiredStrips.length; s += 2) {
          const left = allDesiredStrips[s]
          const right = allDesiredStrips[s + 1] || (paperSaving ? allDesiredStrips[s] : null)
          const sheetCanvas = await renderA5DuplexCanvas(left, right)
          if (sheetCanvas) {
            printSheetUrls.push(sheetCanvas.toDataURL('image/png'))
          }
        }
      } else if (activeLayout === '4x6-duplex') {
        // Standard 4"×6" duplex: two 2"×6" strips per sheet
        const allDesiredStrips: HTMLCanvasElement[] = []
        for (let c = 0; c < copies; c++) {
          for (const canvas of singleStripCanvases) {
            allDesiredStrips.push(canvas)
          }
        }
        for (let s = 0; s < allDesiredStrips.length; s += 2) {
          const left = allDesiredStrips[s]
          const right = allDesiredStrips[s + 1] || (paperSaving ? allDesiredStrips[s] : null)
          const sheetCanvas = await render4x6DuplexCanvas(left, right)
          if (sheetCanvas) {
            printSheetUrls.push(sheetCanvas.toDataURL('image/png'))
          }
        }
      } else if (activeLayout === '4x5-split' || (activeLayout as string) === '4x6-split') {
        // Dye-Sub Dual 2×5" Split-Cut on 4×5" Sheet
        if (singleStripCanvases.length <= 1) {
          const sheetCanvas = await renderDyeSub4x5Canvas(singleStripCanvases[0], singleStripCanvases[0])
          if (sheetCanvas) {
            const sheetUrl = sheetCanvas.toDataURL('image/png')
            for (let sh = 0; sh < copies; sh++) printSheetUrls.push(sheetUrl)
          }
        } else {
          for (let s = 0; s < singleStripCanvases.length; s += 2) {
            const left = singleStripCanvases[s]
            const right = singleStripCanvases[s + 1] || singleStripCanvases[s]
            const sheetCanvas = await renderDyeSub4x5Canvas(left, right)
            if (sheetCanvas) {
              const sheetUrl = sheetCanvas.toDataURL('image/png')
              for (let sh = 0; sh < copies; sh++) printSheetUrls.push(sheetUrl)
            }
          }
        }
      } else if (activeLayout === 'single') {
        // Individual strip printing: each strip is its own page (2 strips = 2 pages)
        for (let c = 0; c < copies; c++) {
          for (let s = 0; s < singleStripCanvases.length; s++) {
            const canvas = singleStripCanvases[s]
            applyPrintCalibration(canvas, settings.printerRoll.dyeSubGamma ?? 1.0, settings.printerRoll.dyeSubBrightness ?? 0)
            printSheetUrls.push(canvas.toDataURL('image/jpeg', 0.95))
          }
        }
      } else {
        // A4 layouts (5, 6, 4, 8)
        const allDesiredStrips: HTMLCanvasElement[] = []
        for (let c = 0; c < copies; c++) {
          for (const canvas of singleStripCanvases) {
            allDesiredStrips.push(canvas)
          }
        }
        const stripsPerSheet = activeLayout === 'a4-5' ? 5 : activeLayout === 'a4-6' ? 6 : activeLayout === 'a4-4' ? 4 : 8
        const totalSheets = Math.max(1, Math.ceil(allDesiredStrips.length / stripsPerSheet))

        for (let sheetIdx = 0; sheetIdx < totalSheets; sheetIdx++) {
          const slice = allDesiredStrips.slice(sheetIdx * stripsPerSheet, (sheetIdx + 1) * stripsPerSheet)
          const sheetCanvas = await renderA4SheetCanvas(activeLayout as any, slice)
          if (sheetCanvas) {
            applyPrintCalibration(sheetCanvas, settings.printerRoll.dyeSubGamma ?? 1.0, settings.printerRoll.dyeSubBrightness ?? 0)
            printSheetUrls.push(sheetCanvas.toDataURL('image/png'))
          }
        }
      }

      // 3. Native silent printing via Electron & Spooler
      if (window.electronAPI?.print?.printSilent) {
        for (const sheetUrl of printSheetUrls) {
          await window.electronAPI.print.printSilent({
            sessionId: session.id,
            imageBuffer: sheetUrl,
            copies: 1,
            paperSize: activeLayout === 'a5-2' ? 'a5' : activeLayout === '4x6-duplex' ? '4x6' : (activeLayout === '4x5-split' || (activeLayout as string) === '4x6-split') ? '4x5' : 'a4',
            printerName: settings.printerName,
          })
        }

        decrementRollCount(physicalSheets)
        recordPrintJob(copies)
        setExportedPaths(printSheetUrls)
        toast(`Sent ${printSheetUrls.length} sheet(s) to silent print spooler!`, 'success')
        setPrinting(false)
        return
      }

      // 4. Browser fallback: hidden iframe printing
      const printIframe = document.createElement('iframe')
      printIframe.style.position = 'fixed'
      printIframe.style.top = '-9999px'
      printIframe.style.left = '-9999px'
      printIframe.style.width = '1200px'
      printIframe.style.height = '1800px'
      printIframe.style.opacity = '0'
      printIframe.style.pointerEvents = 'none'
      printIframe.style.border = '0'
      document.body.appendChild(printIframe)

      const doc = printIframe.contentWindow?.document
      if (!doc) {
        document.body.removeChild(printIframe)
        throw new Error('Unable to create print context')
      }

      doc.open()
      doc.write(`
        <!DOCTYPE html>
        <html>
        <head>
          <meta charset="utf-8">
          <title>Photobooth Print (${activeLayout})</title>
          <style>
            @page {
              size: ${activeLayout === 'a5-2' ? 'A5 portrait' : activeLayout === 'single' ? 'auto' : activeLayout === '4x6-duplex' ? '4in 6in' : (activeLayout === 'a4-5' || activeLayout === 'a4-6' || activeLayout === 'a4-4') ? 'A4 landscape' : (activeLayout === '4x5-split' || (activeLayout as string) === '4x6-split') ? '4in 5in' : 'A4 portrait'};
              margin: 0mm;
            }
            *, *::before, *::after {
              box-sizing: border-box;
              margin: 0;
              padding: 0;
            }
            html, body {
              width: 100%;
              height: 100%;
              background: #ffffff;
              -webkit-print-color-adjust: exact !important;
              print-color-adjust: exact !important;
            }
            .page-sheet {
              page-break-after: always;
              break-after: page;
              page-break-inside: avoid;
              break-inside: avoid;
              width: 100vw;
              height: 100vh;
              display: flex;
              justify-content: center;
              align-items: center;
              background: #ffffff;
              overflow: hidden;
            }
            .page-sheet:last-child {
              page-break-after: auto;
              break-after: auto;
            }
            .page-sheet img {
              width: 100vw;
              height: 100vh;
              object-fit: fill;
              display: block;
              margin: 0;
              image-rendering: -webkit-optimize-contrast !important;
              image-rendering: crisp-edges !important;
              image-rendering: high-quality !important;
            }
          </style>
        </head>
        <body>
          ${printSheetUrls.map((src, i) => `
            <div class="page-sheet">
              <img src="${src}" alt="Print Page ${i + 1}" />
            </div>
          `).join('')}
        </body>
        </html>
      `)
      doc.close()

      await new Promise<void>((resolve) => {
        let loaded = 0
        const imgs = Array.from(doc.querySelectorAll('img'))
        if (imgs.length === 0) return resolve()
        const check = () => {
          loaded++
          if (loaded >= imgs.length) resolve()
        }
        imgs.forEach((img) => {
          if (img.complete && img.naturalWidth > 0) {
            check()
          } else {
            img.onload = check
            img.onerror = check
          }
        })
        setTimeout(resolve, 4000)
      })

      // Give browser time to finish painting the iframe DOM
      await new Promise(r => setTimeout(r, 250))

      printIframe.contentWindow?.focus()
      printIframe.contentWindow?.print()

      setTimeout(() => {
        if (document.body.contains(printIframe)) {
          document.body.removeChild(printIframe)
        }
      }, 30000)

      decrementRollCount(physicalSheets)
      recordPrintJob(copies)
      setExportedPaths(printSheetUrls)
      toast(`Sent ${printSheetUrls.length} page(s) to printer!`, 'success')
      setPrinting(false)
    } catch (err) {
      console.error('[Print] Print failed:', err)
      toast('Print failed. Please check printer connection.', 'error')
      setPrinting(false)
    }
  }, [
    session, strips, copies, paperLayout, paperSaving, settings, physicalSheets,
    renderStripCanvas, renderA5DuplexCanvas, render4x6DuplexCanvas, renderDyeSub4x5Canvas, renderDyeSub4x6Canvas, renderA4SheetCanvas,
    effectivePlan, decrementRollCount, recordPrintJob, toast
  ])

  // ─── Plan Upgrade and Partial Print Handlers ────────────────────────────────
  const handleConfirmUpgrade = useCallback(async (customTargetPlan?: TicketPlan, paymentMethod: 'UPI' | 'CASH' = 'UPI') => {
    const target = customTargetPlan || currentUpgrade.targetPlan
    setUpgradedPlan(target)
    setPaperLayout('a4-5')
    setShowUpsellModal(false)

    if (session?.ticketId) {
      const addedFee = customTargetPlan ? 0 : currentUpgrade.fee
      const newTotal = (resolvedTicket?.paymentAmount || 99) + addedFee
      await useQueueStore.getState().updateTicketPayment(session.ticketId, {
        paymentStatus: 'PAID',
        paymentMethod: paymentMethod,
        paymentAmount: newTotal,
      })
    }
    toast(`Plan upgraded to ₹${target} via ${paymentMethod}! Printing all your strips now...`, 'success')
    setTimeout(() => {
      handlePrint({ overridePlan: target })
    }, 250)
  }, [currentUpgrade, session?.ticketId, resolvedTicket?.paymentAmount, handlePrint, toast])

  const handlePrintOnlyPaidStrips = useCallback(() => {
    setShowUpsellModal(false)
    toast(`Printing your chosen ${selectedStripIndices.length} strips...`, 'info')
    setTimeout(() => {
      handlePrint({ allowSelected: true })
    }, 250)
  }, [selectedStripIndices.length, handlePrint, toast])

  // ─── Interactive Miniature Strip Preview Component ────────────────────────
  // ─── Interactive Miniature Strip Preview Component ────────────────────────
  function MiniStrip({
    strip,
    stripIdx = 0,
    width: passedWidth = 92,
    fixedHeight,
    maxContainerHeight,
    hideFooter = false,
  }: {
    strip: typeof strips[0]
    stripIdx?: number
    width?: number
    fixedHeight?: number
    maxContainerHeight?: number
    hideFooter?: boolean
  }) {
    const slotCount = strip.slots.length
    let stripTemplate = strip.template ?? template
    if (stripTemplate && stripTemplate.id.startsWith('classic-black')) {
      stripTemplate = getDefaultTemplateForPhotoCount(slotCount)
    }
    const isSinglePhoto = slotCount <= 1

    const naturalRatio = (stripTemplate?.canvas?.width && stripTemplate?.canvas?.height)
      ? (stripTemplate.canvas.width / stripTemplate.canvas.height)
      : (isSinglePhoto ? (1 / 1.35) : (1 / 3.0))

    let width = passedWidth
    let standardHeight = fixedHeight ? fixedHeight : Math.round(width / naturalRatio)

    if (maxContainerHeight && standardHeight > maxContainerHeight) {
      standardHeight = maxContainerHeight
      width = Math.round(standardHeight * naturalRatio)
    }
    const isMini = width < 160
    const margin = isMini ? 4 : 8
    const gap = isMini ? 3 : 5

    const stripBg = stripTemplate?.background
    let stripBgStyle: React.CSSProperties = {}
    if (stripBg?.type === 'solid' && stripBg.color) stripBgStyle.background = stripBg.color
    else if (stripBg?.type === 'gradient' && stripBg.gradient) {
      const { angle, stops } = stripBg.gradient
      stripBgStyle.background = `linear-gradient(${angle ?? 135}deg, ${stops.map(s => `${s.color} ${s.offset * 100}%`).join(', ')})`
    } else {
      stripBgStyle.background = '#6D0626'
    }

    const stripBorder = stripTemplate?.border
    if (stripBorder && stripBorder.type !== 'none') {
      stripBgStyle.border = `${stripBorder.width ?? 2}px solid ${stripBorder.color ?? '#cccccc'}`
    }

    // ── Check if template uses transparent overlay PNG (e.g. Cinema Ticket, Heart Frame, Crimson Kiss, etc.)
    if (stripTemplate?.overlayImageUrl && stripTemplate.photoSlots?.length) {
      const canvasW = stripTemplate.canvas.width
      const canvasH = stripTemplate.canvas.height
      return (
        <div
          style={{
            ...stripBgStyle,
            borderRadius: 0,
            overflow: 'hidden',
            width,
            height: standardHeight,
            border: '1px solid var(--color-border-default)',
            flexShrink: 0,
            userSelect: 'none',
            boxShadow: isMini ? '0 2px 8px rgba(0,0,0,0.35)' : 'none',
            position: 'relative',
          }}
        >
          {stripTemplate.photoSlots.map((slot, i) => {
            const photo = getPhotoForSlot(slot.id, i, stripIdx)
            const leftPct = (slot.x / canvasW) * 100
            const topPct = (slot.y / canvasH) * 100
            const widthPct = (slot.width / canvasW) * 100
            const heightPct = (slot.height / canvasH) * 100

            return (
              <div
                key={slot.id || i}
                style={{
                  position: 'absolute',
                  left: `${leftPct}%`,
                  top: `${topPct}%`,
                  width: `${widthPct}%`,
                  height: `${heightPct}%`,
                  overflow: 'hidden',
                  background: '#1a1a1a',
                }}
              >
                {photo && (
                  <img
                    src={getPhotoUrl(photo.originalUrl || photo.previewUrl || photo.thumbnailUrl)}
                    alt=""
                    style={{
                      width: '100%',
                      height: '100%',
                      objectFit: 'cover',
                      filter: filterEngine.getCSSFilter(photo.edits),
                      transform: `rotate(${photo.edits.rotation}deg) scaleX(${photo.edits.flipH ? -1 : 1}) scaleY(${photo.edits.flipV ? -1 : 1})`,
                    }}
                  />
                )}
              </div>
            )
          })}

          {/* Overlay Frame PNG sits directly on top */}
          <img
            src={stripTemplate.overlayImageUrl}
            alt=""
            style={{
              position: 'absolute',
              inset: 0,
              width: '100%',
              height: '100%',
              objectFit: 'fill',
              pointerEvents: 'none',
              zIndex: 10,
            }}
          />
        </div>
      )
    }

    // ── Standard Strip (Classic, Retro, Solid, Gradient, 35mm, PapIt)
    const is35mm = Boolean(stripTemplate?.id.includes('vintage-35mm'))
    const isPapit = Boolean(stripTemplate?.id.includes('papit'))

    return (
      <div
        style={{
          ...stripBgStyle,
          borderRadius: 0,
          overflow: 'hidden',
          width,
          height: standardHeight,
          display: 'flex',
          flexDirection: 'column',
          padding: is35mm || isPapit
            ? `${margin}px ${margin + (isMini ? 3 : 6)}px ${margin}px ${margin + (isMini ? 3 : 6)}px`
            : `${margin}px`,
          border: '1px solid var(--color-border-default)',
          flexShrink: 0,
          userSelect: 'none',
          boxShadow: isMini ? '0 2px 8px rgba(0,0,0,0.35)' : 'none',
          position: 'relative',
        }}
      >
        {/* 35mm Sprocket Perforations */}
        {is35mm && (
          <>
            <div style={{ position: 'absolute', left: 2, top: 4, bottom: 4, width: isMini ? 3 : 5, background: 'repeating-linear-gradient(to bottom, #f0ede6 0px, #f0ede6 4px, transparent 4px, transparent 10px)', borderRadius: 1, pointerEvents: 'none', zIndex: 2 }} />
            <div style={{ position: 'absolute', right: 2, top: 4, bottom: 4, width: isMini ? 3 : 5, background: 'repeating-linear-gradient(to bottom, #f0ede6 0px, #f0ede6 4px, transparent 4px, transparent 10px)', borderRadius: 1, pointerEvents: 'none', zIndex: 2 }} />
          </>
        )}

        {/* PapIt Film Strip Rails & Sprockets */}
        {isPapit && (
          <>
            <div style={{ position: 'absolute', left: 0, top: 0, bottom: 0, width: isMini ? 6 : 9, background: '#141210', zIndex: 2 }} />
            <div style={{ position: 'absolute', left: isMini ? 1 : 2, top: 4, bottom: 4, width: isMini ? 4 : 5, background: 'repeating-linear-gradient(to bottom, #FBF7EE 0px, #FBF7EE 4px, transparent 4px, transparent 10px)', borderRadius: 1, pointerEvents: 'none', zIndex: 3 }} />
            <div style={{ position: 'absolute', right: 0, top: 0, bottom: 0, width: isMini ? 6 : 9, background: '#141210', zIndex: 2 }} />
            <div style={{ position: 'absolute', right: isMini ? 1 : 2, top: 4, bottom: 4, width: isMini ? 4 : 5, background: 'repeating-linear-gradient(to bottom, #FBF7EE 0px, #FBF7EE 4px, transparent 4px, transparent 10px)', borderRadius: 1, pointerEvents: 'none', zIndex: 3 }} />
          </>
        )}



        {/* Flex container dividing space equally among 2, 3, or 4 photos */}
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap, minHeight: 0, zIndex: 1 }}>
          {strip.slots.map((slot, slotIdx) => {
            const photo = getPhotoForSlot(slot.id, slotIdx, stripIdx)
            return (
              <div
                key={slot.id}
                style={{
                  flex: 1,
                  minHeight: 0,
                  borderRadius: 0,
                  overflow: 'hidden',
                  background: '#e2ded5',
                  position: 'relative',
                }}
              >
                {photo && (
                  <img
                    src={getPhotoUrl(photo.originalUrl || photo.previewUrl || photo.thumbnailUrl)}
                    alt=""
                    style={{
                      width: '100%',
                      height: '100%',
                      objectFit: 'cover',
                      filter: filterEngine.getCSSFilter(photo.edits),
                      transform: `rotate(${photo.edits.rotation}deg) scaleX(${photo.edits.flipH ? -1 : 1}) scaleY(${photo.edits.flipV ? -1 : 1})`,
                    }}
                  />
                )}
              </div>
            )
          })}
        </div>



        {/* PapIt Logo */}
        {isPapit && (
          <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', width: '100%', margin: `${isMini ? 1 : 3}px 0`, zIndex: 2 }}>
            <img src="/papit.png" alt="PapIt" style={{ height: isMini ? 12 : 22, width: 'auto', objectFit: 'contain' }} />
          </div>
        )}

        {/* Photobooth Footer */}
        {!hideFooter && (
          <div
            style={{
              marginTop: 'auto',
              paddingTop: isMini ? 2 : 5,
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              gap: 1,
              borderTop: '1px dashed rgba(0, 0, 0, 0.15)',
              zIndex: 1,
            }}
          >
            <span style={{ fontFamily: 'var(--font-mono)', fontSize: isMini ? 6 : 9, fontWeight: 700, letterSpacing: '0.12em', color: '#5c5954' }}>
              PHOTOBOOTH
            </span>
          </div>
        )}
      </div>
    )
  }

  return (
    <div className="flex h-full overflow-hidden" style={{ background: 'var(--color-bg-base)' }}>
      {/* ─── Main Content Canvas Area: LIVE PRINT PREVIEW ──────────────────── */}
      <div className="canvas-area flex-1 flex flex-col items-center justify-between" style={{ padding: '16px 24px', overflowY: 'auto', position: 'relative' }}>
        {exportSuccess ? (
          <motion.div
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            className="flex flex-col items-center gap-4 m-auto"
            style={{ width: '100%', maxWidth: 540 }}
          >
            <div
              style={{
                width: 54,
                height: 54,
                borderRadius: 'var(--radius-full)',
                background: 'rgba(110, 155, 117, 0.15)',
                border: '1px solid var(--color-success)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              <CheckCircle2 size={28} color="var(--color-success)" />
            </div>

            <div style={{ textAlign: 'center' }}>
              <h2 style={{ fontFamily: 'var(--font-display)', fontSize: 'var(--text-2xl)', fontWeight: 700, letterSpacing: 'var(--letter-spacing-display, 0.08em)', color: 'var(--color-text-primary)' }}>
                Export Complete!
              </h2>
              <p style={{ color: 'var(--color-text-secondary)', fontSize: 12, fontFamily: 'var(--font-mono)', marginTop: 4 }}>
                {paperLayout === 'single'
                  ? `${totalPrints} strip(s) exported in ${format.toUpperCase()}`
                  : paperLayout === 'a5-2'
                  ? `${physicalSheets} A5 sheet(s) (2 vertical strips/page) exported in ${format.toUpperCase()}`
                  : paperLayout === '4x6-duplex'
                  ? `${physicalSheets} 4"×6" sheet(s) exported in ${format.toUpperCase()}`
                  : `${totalA4Sheets} A4 sheet(s) (${paperLayout === 'a4-6' ? '6 strips/page · horizontal' : paperLayout === 'a4-4' ? '4 strips/page' : '8 strips/page'}) exported in ${format.toUpperCase()}`}
              </p>
            </div>

            {/* Exported preview images */}
            {exportedPaths.length > 0 && (
              <div
                style={{
                  display: 'flex',
                  gap: 16,
                  overflowX: 'auto',
                  maxWidth: '100%',
                  padding: 14,
                  background: 'var(--color-bg-elevated)',
                  borderRadius: 'var(--radius-lg)',
                  border: '1px solid var(--color-border-subtle)',
                }}
              >
                {exportedPaths.map((path, idx) => (
                  <div key={idx} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6, flexShrink: 0 }}>
                    <img
                      src={path}
                      alt={`Export Preview ${idx + 1}`}
                      style={{
                        maxHeight: paperLayout === 'single' ? 240 : 280,
                        width: 'auto',
                        borderRadius: 0,
                        boxShadow: '0 8px 24px rgba(0,0,0,0.6)',
                        border: '1px solid rgba(255,255,255,0.15)',
                        background: '#fff',
                      }}
                    />
                    <span style={{ fontSize: 10, fontFamily: 'var(--font-mono)', color: 'var(--color-text-tertiary)' }}>
                      {paperLayout === 'single' ? `STRIP ${idx + 1}` : paperLayout === 'a5-2' ? `A5 SHEET ${idx + 1}` : paperLayout === '4x6-duplex' ? `4×6 SHEET ${idx + 1}` : `A4 SHEET ${idx + 1}`}
                    </span>
                  </div>
                ))}
              </div>
            )}

            <div className="flex items-center gap-3" style={{ marginTop: 8 }}>
              <button
                className="btn btn-secondary"
                onClick={() => setExportSuccess(false)}
                style={{ fontSize: 12, fontFamily: 'var(--font-mono)' }}
              >
                <ArrowLeft size={13} />
                <span>BACK TO PRINT SETUP</span>
              </button>
              <button
                className="btn btn-primary"
                onClick={handleFinishSession}
                style={{ fontSize: 12, fontFamily: 'var(--font-mono)' }}
              >
                <span>FINISH SESSION & RESET BOOTH →</span>
              </button>
            </div>
          </motion.div>
        ) : (
          <>
            {/* Top Toolbar over Canvas Area */}
            <div
              style={{
                width: '100%',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                paddingBottom: 10,
                borderBottom: '1px solid var(--color-border-subtle)',
                marginBottom: 10,
                flexShrink: 0,
              }}
            >
              <div>
                <span style={{ fontFamily: 'var(--font-mono)', fontSize: 11, fontWeight: 700, letterSpacing: '0.08em', color: 'var(--color-brand-light)', textTransform: 'uppercase' }}>
                  Live Print Sheet Preview
                </span>
                <p style={{ fontSize: 10, fontFamily: 'var(--font-mono)', color: 'var(--color-text-tertiary)', marginTop: 2 }}>
                  {paperLayout === 'a5-2'
                    ? 'A5 Paper (14.8 × 21.0 cm) · 2 Vertical Strips Side-by-Side · Zero Paper Waste · Center Cut'
                    : (paperLayout === '4x5-split' || paperLayout === '4x6-split')
                    ? strips.length > 1
                      ? 'Dye-Sub 4" × 5" Media · All strips printed together on 1 paper (Side-by-Side Dual 2"×5" Split-Cut)'
                      : 'Dye-Sub 4" × 5" Media · Dual 2" × 5" Strips (Hardware Split-Cut)'
                    : paperLayout === 'a4-5'
                    ? 'A4 Sheet · 5 Strips Horizontal (5.8 cm Width · 4 Straight Cuts · Full 21 cm Height)'
                    : paperLayout === 'a4-6'
                    ? 'A4 Sheet · 6 Strips Horizontal (5.0 cm Width · 5 Straight Cuts)'
                    : paperLayout === 'a4-8'
                    ? 'A4 Sheet · Option 2 (8 Strips / 2 Rows of 4)'
                    : paperLayout === 'a4-4'
                    ? 'A4 Sheet · Option 1 (4 Strips / Exact 2"×6")'
                    : 'Single Strip · 2" × 6" (5.08 × 15.24 cm)'}
                </p>
              </div>

              {/* Sheet pagination if multiple sheets */}
              {totalA4Sheets > 1 && paperLayout !== 'single' && (
                <div style={{ display: 'flex', alignItems: 'center', gap: 6, background: 'var(--color-bg-surface)', padding: '2px 8px', borderRadius: 'var(--radius-full)', border: '1px solid var(--color-border-subtle)' }}>
                  <button
                    className="btn btn-ghost btn-icon btn-sm"
                    onClick={() => setCurrentSheetIndex(i => Math.max(0, i - 1))}
                    disabled={currentSheetIndex === 0}
                    style={{ width: 22, height: 22 }}
                  >
                    <ChevronLeft size={12} />
                  </button>
                  <span style={{ fontSize: 10, fontFamily: 'var(--font-mono)', color: 'var(--color-text-secondary)' }}>
                    SHEET {currentSheetIndex + 1} OF {totalA4Sheets}
                  </span>
                  <button
                    className="btn btn-ghost btn-icon btn-sm"
                    onClick={() => setCurrentSheetIndex(i => Math.min(totalA4Sheets - 1, i + 1))}
                    disabled={currentSheetIndex === totalA4Sheets - 1}
                    style={{ width: 22, height: 22 }}
                  >
                    <ChevronRight size={12} />
                  </button>
                </div>
              )}
            </div>

            {/* Cherry Red & Off-White Interactive Alert Banner */}
            {isPlanExceeded && !upgradedPlan && (
              <motion.div
                initial={{ opacity: 0, scale: 0.98, y: -6 }}
                animate={{ opacity: 1, scale: 1, y: 0 }}
                style={{
                  width: '100%',
                  maxWidth: 760,
                  margin: '0 auto 14px',
                  background: 'linear-gradient(135deg, #6D0626 0%, #850B32 55%, #9E103A 100%)',
                  border: '2px solid rgba(199, 27, 77, 0.45)',
                  borderRadius: 16,
                  padding: '14px 18px',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  gap: 16,
                  boxShadow: '0 8px 24px rgba(109, 6, 38, 0.22)',
                  userSelect: 'none',
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
                  <div
                    style={{
                      width: 44,
                      height: 44,
                      borderRadius: '50%',
                      background: 'rgba(247, 234, 239, 0.15)',
                      border: '1.5px solid rgba(247, 234, 239, 0.35)',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      flexShrink: 0,
                    }}
                  >
                    <AlertOctagon size={24} color="#F7EAEF" />
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <span style={{ fontSize: 13, fontFamily: 'var(--font-mono)', fontWeight: 900, color: '#FFFFFF', letterSpacing: '0.04em' }}>
                        ⚠️ PASS LIMIT: {planStripLimit} STRIPS INCLUDED (₹{effectivePlan})
                      </span>
                      <span style={{ fontSize: 10, fontFamily: 'var(--font-mono)', background: 'rgba(247, 234, 239, 0.22)', color: '#F7EAEF', padding: '1px 8px', borderRadius: 12, fontWeight: 800 }}>
                        {selectedStripIndices.length} OF {planStripLimit} CHOSEN
                      </span>
                    </div>
                    <p style={{ fontSize: 11, fontFamily: 'var(--font-mono)', color: 'rgba(255, 255, 255, 0.92)', margin: 0, lineHeight: 1.4 }}>
                      You created <strong>{strips.length} strips</strong>. Tap any strip below to choose which {planStripLimit} to print, or unlock all!
                    </p>
                  </div>
                </div>

                <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0 }}>
                  {/* Option 1: Print user-selected strips */}
                  <button
                    type="button"
                    onClick={() => {
                      toast(`Printing your chosen ${selectedStripIndices.length} strips...`, 'info')
                      handlePrint({ allowSelected: true })
                    }}
                    style={{
                      background: 'rgba(247, 234, 239, 0.14)',
                      color: '#F7EAEF',
                      border: '1.5px solid rgba(247, 234, 239, 0.35)',
                      borderRadius: 'var(--radius-full)',
                      padding: '9px 14px',
                      fontFamily: 'var(--font-mono)',
                      fontSize: 11,
                      fontWeight: 800,
                      cursor: 'pointer',
                      display: 'flex',
                      alignItems: 'center',
                      gap: 5,
                    }}
                    title="Print only your chosen strips without extra fee"
                  >
                    <Check size={13} />
                    <span>PRINT SELECTED ({selectedStripIndices.length})</span>
                  </button>

                  {/* Option 2: Unlock all strips */}
                  <button
                    type="button"
                    onClick={() => setShowUpsellModal(true)}
                    style={{
                      background: '#F7F1EA',
                      color: '#6D0626',
                      border: 'none',
                      borderRadius: 'var(--radius-full)',
                      padding: '9px 16px',
                      fontFamily: 'var(--font-mono)',
                      fontSize: 11.5,
                      fontWeight: 900,
                      letterSpacing: '0.03em',
                      cursor: 'pointer',
                      display: 'flex',
                      alignItems: 'center',
                      gap: 6,
                      boxShadow: '0 3px 12px rgba(0, 0, 0, 0.25)',
                    }}
                  >
                    <Sparkles size={14} color="#6D0626" />
                    <span>UNLOCK ALL (+₹{currentUpgrade.fee})</span>
                  </button>
                </div>
              </motion.div>
            )}

            {/* Center Stage: The Physical Sheet Preview */}
            <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', width: '100%', maxWidth: '100%', padding: '8px 0', overflowX: 'auto' }}>
              <AnimatePresence mode="wait">
                {(paperLayout === 'a5-2' || paperLayout === '4x6-duplex' || paperLayout === '4x5-split' || (paperLayout as string) === '4x6-split') ? (() => {
                  const isA5 = paperLayout === 'a5-2'
                  const isDuplex4x6 = paperLayout === '4x6-duplex'
                  const leftIdx = currentSheetIndex * 2
                  const rightIdx = currentSheetIndex * 2 + 1
                  const stripLeft = strips[leftIdx] || strips[0]
                  const hasRight = Boolean(strips[rightIdx])
                  const stripRight = hasRight ? strips[rightIdx] : (paperSaving && stripLeft ? stripLeft : null)
                  const isDuplicate = !hasRight && paperSaving && Boolean(stripLeft)
                  const isMulti = strips.length > 1

                  return (
                    /* ─── A5 2-STRIP / DYE-SUB DUAL 2x5" / 4x6 DUPLEX PREVIEW ─── */
                    <motion.div
                      key={paperLayout}
                      initial={{ opacity: 0, scale: 0.96 }}
                      animate={{ opacity: 1, scale: 1 }}
                      exit={{ opacity: 0, scale: 0.96 }}
                      transition={{ duration: 0.18 }}
                      style={{
                        width: isA5 ? 320 : isDuplex4x6 ? 420 : 440,
                        minHeight: isA5 ? 454 : isDuplex4x6 ? 600 : 550,
                        background: '#ffffff',
                        boxShadow: '0 16px 48px rgba(0,0,0,0.65), 0 0 0 1px rgba(0,0,0,0.1)',
                        padding: isA5 ? '10px 14px' : '12px 14px',
                        display: 'flex',
                        flexDirection: 'column',
                        position: 'relative',
                        userSelect: 'none',
                        borderRadius: 2,
                      }}
                    >
                      {/* Top Header: For A5, ONLY the ticket number is shown */}
                      {isA5 ? (
                        <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', padding: '0 0 8px 0' }}>
                          <span style={{ fontFamily: 'var(--font-mono)', fontSize: 13, fontWeight: 800, color: 'var(--color-brand)', letterSpacing: '0.12em' }}>
                            {ticketNumber ? (ticketNumber.startsWith('TICKET') ? ticketNumber : `TICKET #${ticketNumber.replace(/^#/, '')}`) : 'TICKET'}
                          </span>
                        </div>
                      ) : (
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid #e2e2e2', paddingBottom: 4, marginBottom: 8 }}>
                          <span style={{ fontFamily: 'var(--font-mono)', fontSize: 8, fontWeight: 700, color: 'var(--color-brand)' }}>
                            {isDuplex4x6
                              ? '4" × 6" PHOTO PAPER (10.2 × 15.2 CM)'
                              : 'DYE-SUB 4" × 5" MEDIA (10.2 × 12.7 CM)'}
                          </span>
                          <span style={{ fontFamily: 'var(--font-mono)', fontSize: 8, fontWeight: 700, color: isDuplicate ? '#15803d' : 'var(--color-brand)', background: isDuplicate ? 'rgba(22, 163, 74, 0.12)' : 'rgba(109, 6, 38, 0.1)', padding: '2px 8px', borderRadius: 4 }}>
                            {hasRight
                              ? `STRIPS ${leftIdx + 1} & ${rightIdx + 1} (SIDE-BY-SIDE)`
                              : isDuplicate
                              ? '🌱 2-UP PAPER SAVER'
                              : isMulti
                              ? `STRIP ${leftIdx + 1} ONLY (SHEET ${currentSheetIndex + 1})`
                              : 'SINGLE STRIP'}
                          </span>
                        </div>
                      )}

                      <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', gap: isA5 ? 12 : 16, flex: 1, position: 'relative' }}>
                        {/* Left Strip */}
                        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
                          <span style={{ fontSize: 8, fontFamily: 'var(--font-mono)', fontWeight: 700, color: 'var(--color-brand)', marginBottom: 4 }}>
                            {isPlanExceeded && !upgradedPlan
                              ? (selectedStripIndices.includes(leftIdx) ? `✓ STRIP ${leftIdx + 1} (SELECTED)` : `TAP TO PICK STRIP ${leftIdx + 1}`)
                              : `STRIP ${leftIdx + 1} (LEFT)`}
                          </span>
                          {stripLeft && (() => {
                            const isLeftSelected = selectedStripIndices.includes(leftIdx)
                            const isBlur = !isLeftSelected && isPlanExceeded && !upgradedPlan
                            return (
                              <div
                                onClick={() => toggleStripSelection(leftIdx)}
                                style={{
                                  position: 'relative',
                                  borderRadius: 2,
                                  overflow: 'hidden',
                                  cursor: (isPlanExceeded && !upgradedPlan) ? 'pointer' : 'default',
                                }}
                              >
                                <div style={{ filter: isBlur ? 'blur(1.5px)' : 'none', opacity: isBlur ? 0.92 : 1, transition: 'filter 0.2s ease, opacity 0.2s ease' }}>
                                  <MiniStrip strip={stripLeft} stripIdx={leftIdx} width={isA5 ? 135 : 160} fixedHeight={isA5 ? 405 : isDuplex4x6 ? 480 : 420} />
                                </div>
                                {isBlur && (
                                  <div
                                    style={{
                                      position: 'absolute',
                                      inset: 0,
                                      display: 'flex',
                                      alignItems: 'center',
                                      justifyContent: 'center',
                                      pointerEvents: 'none',
                                    }}
                                  >
                                    <div
                                      style={{
                                        width: 26,
                                        height: 26,
                                        borderRadius: '50%',
                                        background: 'rgba(109, 6, 38, 0.75)',
                                        backdropFilter: 'blur(4px)',
                                        boxShadow: '0 2px 8px rgba(0, 0, 0, 0.25)',
                                        display: 'flex',
                                        alignItems: 'center',
                                        justifyContent: 'center',
                                        border: '1.5px solid rgba(255, 255, 255, 0.35)',
                                      }}
                                    >
                                      <Lock size={13} color="#ffffff" />
                                    </div>
                                  </div>
                                )}
                              </div>
                            )
                          })()}
                        </div>

                        {/* Center Cut Line Guide with Scissor icon */}
                        <div
                          style={{
                            display: 'flex',
                            flexDirection: 'column',
                            alignItems: 'center',
                            height: isA5 ? 405 : '92%',
                            position: 'relative',
                          }}
                          title="Center blade cut line"
                        >
                          <span style={{ fontSize: 10, color: 'var(--color-brand)', marginBottom: 2 }}>✂</span>
                          <div
                            style={{
                              width: 0,
                              flex: 1,
                              borderLeft: '2px dashed rgba(109, 6, 38, 0.45)',
                            }}
                          />
                          <span style={{ fontSize: 7, fontFamily: 'var(--font-mono)', color: 'var(--color-brand)', marginTop: 2, letterSpacing: '0.08em', fontWeight: 700 }}>
                            {isA5 ? 'CUT LINE' : 'SPLIT-CUT'}
                          </span>
                        </div>

                        {/* Right Strip */}
                        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
                          <span style={{ fontSize: 8, fontFamily: 'var(--font-mono)', fontWeight: 700, color: isDuplicate ? '#15803d' : 'var(--color-brand)', marginBottom: 4 }}>
                            {hasRight
                              ? (isPlanExceeded && !upgradedPlan
                                  ? (selectedStripIndices.includes(rightIdx) ? `✓ STRIP ${rightIdx + 1} (SELECTED)` : `TAP TO PICK STRIP ${rightIdx + 1}`)
                                  : `STRIP ${rightIdx + 1} (RIGHT)`)
                              : isDuplicate
                              ? `STRIP ${leftIdx + 1} (🌱 2-UP DUPLICATE)`
                              : ''}
                          </span>
                          {stripRight ? (() => {
                            const effectiveRightIdx = hasRight ? rightIdx : leftIdx
                            const isRightSelected = selectedStripIndices.includes(effectiveRightIdx)
                            const isBlur = !isRightSelected && isPlanExceeded && !upgradedPlan
                            return (
                              <div
                                onClick={() => toggleStripSelection(effectiveRightIdx)}
                                style={{
                                  position: 'relative',
                                  borderRadius: 2,
                                  overflow: 'hidden',
                                  cursor: (isPlanExceeded && !upgradedPlan) ? 'pointer' : 'default',
                                }}
                              >
                                <div style={{ filter: isBlur ? 'blur(1.5px)' : 'none', opacity: isBlur ? 0.92 : 1, transition: 'filter 0.2s ease, opacity 0.2s ease' }}>
                                  <MiniStrip strip={stripRight} stripIdx={effectiveRightIdx} width={isA5 ? 135 : 160} fixedHeight={isA5 ? 405 : isDuplex4x6 ? 480 : 420} />
                                </div>
                                {isBlur && (
                                  <div
                                    style={{
                                      position: 'absolute',
                                      inset: 0,
                                      display: 'flex',
                                      alignItems: 'center',
                                      justifyContent: 'center',
                                      pointerEvents: 'none',
                                    }}
                                  >
                                    <div
                                      style={{
                                        width: 26,
                                        height: 26,
                                        borderRadius: '50%',
                                        background: 'rgba(109, 6, 38, 0.75)',
                                        backdropFilter: 'blur(4px)',
                                        boxShadow: '0 2px 8px rgba(0, 0, 0, 0.25)',
                                        display: 'flex',
                                        alignItems: 'center',
                                        justifyContent: 'center',
                                        border: '1.5px solid rgba(255, 255, 255, 0.35)',
                                      }}
                                    >
                                      <Lock size={13} color="#ffffff" />
                                    </div>
                                  </div>
                                )}
                              </div>
                            )
                          })() : (
                            <div style={{ width: isA5 ? 135 : 160, height: isA5 ? 405 : isDuplex4x6 ? 480 : 420, background: 'transparent' }} />
                          )}
                        </div>
                      </div>
                    </motion.div>
                  )
                })() : (paperLayout === 'a4-5' || paperLayout === 'a4-6' || paperLayout === 'a4-4') ? (
                  /* ─── A4 HORIZONTAL (5, 6, OR 4 STRIPS · FULL 21.0 CM HEIGHT) PREVIEW ─── */
                  <motion.div
                    key={paperLayout}
                    initial={{ opacity: 0, scale: 0.96 }}
                    animate={{ opacity: 1, scale: 1 }}
                    exit={{ opacity: 0, scale: 0.96 }}
                    transition={{ duration: 0.18 }}
                    style={{
                      width: 594,
                      minHeight: 440, // 297 × 210 mm landscape ratio
                      background: '#ffffff',
                      boxShadow: '0 16px 48px rgba(0,0,0,0.65), 0 0 0 1px rgba(0,0,0,0.1)',
                      padding: '12px 14px',
                      display: 'flex',
                      flexDirection: 'column',
                      position: 'relative',
                      userSelect: 'none',
                      borderRadius: 2,
                    }}
                  >
                    {/* A4 Sheet Header Label */}
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid #e2e2e2', paddingBottom: 4, marginBottom: 8 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                        <span style={{ fontFamily: 'var(--font-mono)', fontSize: 8, fontWeight: 700, color: 'var(--color-brand)', letterSpacing: '0.08em' }}>
                          A4 HORIZONTAL / LANDSCAPE (29.7 × 21.0 CM)
                        </span>
                        <span style={{ fontSize: 8, color: '#888888', fontFamily: 'var(--font-mono)' }}>
                          {paperLayout === 'a4-5' ? '6.0 CM WIDTH PER STRIP' : paperLayout === 'a4-6' ? '5.0 CM WIDTH PER STRIP' : '6.0 CM WIDTH PER STRIP'}
                        </span>
                      </div>
                      <span style={{ fontFamily: 'var(--font-mono)', fontSize: 8, fontWeight: 600, color: 'var(--color-brand)', background: 'rgba(109, 6, 38, 0.1)', padding: '1px 6px', borderRadius: 4 }}>
                        {paperLayout === 'a4-5' ? '5 STRIPS · FULL A4 HEIGHT (21.0 CM)' : paperLayout === 'a4-6' ? '6 STRIPS · FULL A4 HEIGHT (21.0 CM)' : '4 STRIPS · FULL A4 HEIGHT (21.0 CM)'}
                      </span>
                    </div>

                    {/* Row of 5, 6, or 4 Strips */}
                    {(() => {
                      const numStrips = paperLayout === 'a4-5' ? 5 : paperLayout === 'a4-6' ? 6 : 4
                      const stripPreviewWidth = paperLayout === 'a4-5' ? 104 : paperLayout === 'a4-6' ? 86 : 118
                      const totalDesiredStrips = strips.length * copies

                      return (
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'stretch', position: 'relative', padding: '0 2px', flex: 1, minHeight: 380 }}>
                          {Array.from({ length: numStrips }, (_, c) => {
                            const hasStrip = c < strips.length
                            const strip = hasStrip ? strips[c] : null

                            const isSelected = hasStrip && selectedStripIndices.includes(c)
                            const isBlur = hasStrip && !isSelected && isPlanExceeded && !upgradedPlan

                            return (
                              <div key={c} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
                                {hasStrip ? (
                                  <div style={{ marginBottom: 4, height: 20, display: 'flex', alignItems: 'center' }}>
                                    {isPlanExceeded && !upgradedPlan ? (
                                      isSelected ? (
                                        <button
                                          type="button"
                                          onClick={() => toggleStripSelection(c)}
                                          style={{
                                            fontSize: 8,
                                            fontFamily: 'var(--font-mono)',
                                            color: '#ffffff',
                                            background: 'var(--color-brand)',
                                            fontWeight: 800,
                                            border: 'none',
                                            padding: '2px 8px',
                                            borderRadius: 12,
                                            cursor: 'pointer',
                                            display: 'inline-flex',
                                            alignItems: 'center',
                                            gap: 4,
                                          }}
                                          title="Selected to print (Tap to deselect)"
                                        >
                                          ✓ STRIP #{c + 1}
                                        </button>
                                      ) : (
                                        <button
                                          type="button"
                                          onClick={() => toggleStripSelection(c)}
                                          style={{
                                            fontSize: 8,
                                            fontFamily: 'var(--font-mono)',
                                            color: 'var(--color-brand)',
                                            background: 'rgba(109, 6, 38, 0.08)',
                                            fontWeight: 700,
                                            border: '1px solid rgba(109, 6, 38, 0.25)',
                                            padding: '2px 8px',
                                            borderRadius: 12,
                                            cursor: 'pointer',
                                            display: 'inline-flex',
                                            alignItems: 'center',
                                            gap: 4,
                                          }}
                                          title="Tap to pick this strip instead"
                                        >
                                          TAP TO PICK #{c + 1}
                                        </button>
                                      )
                                    ) : (
                                      <span style={{ fontSize: 8, fontFamily: 'var(--font-mono)', color: 'var(--color-brand)', fontWeight: 800, background: 'rgba(109, 6, 38, 0.08)', padding: '2px 8px', borderRadius: 4 }}>
                                        STRIP #{c + 1}
                                      </span>
                                    )}
                                  </div>
                                ) : (
                                  /* Empty slot has NO text - pure empty alignment */
                                  <div style={{ height: 20, marginBottom: 4 }} />
                                )}

                                {strip ? (
                                  <div
                                    onClick={(isPlanExceeded && !upgradedPlan) ? () => toggleStripSelection(c) : undefined}
                                    style={{
                                      position: 'relative',
                                      borderRadius: 2,
                                      overflow: 'hidden',
                                      cursor: (isPlanExceeded && !upgradedPlan) ? 'pointer' : 'default',
                                    }}
                                  >
                                    <div style={{ filter: isBlur ? 'blur(1.5px)' : 'none', opacity: isBlur ? 0.92 : 1, transition: 'filter 0.2s ease, opacity 0.2s ease' }}>
                                      <MiniStrip strip={strip} stripIdx={c} width={stripPreviewWidth} fixedHeight={375} hideFooter={false} />
                                    </div>
                                    {isBlur && (
                                      <div
                                        style={{
                                          position: 'absolute',
                                          inset: 0,
                                          display: 'flex',
                                          alignItems: 'center',
                                          justifyContent: 'center',
                                          pointerEvents: 'none',
                                        }}
                                      >
                                        <div
                                          style={{
                                            width: 26,
                                            height: 26,
                                            borderRadius: '50%',
                                            background: 'rgba(109, 6, 38, 0.75)',
                                            backdropFilter: 'blur(4px)',
                                            boxShadow: '0 2px 8px rgba(0, 0, 0, 0.25)',
                                            display: 'flex',
                                            alignItems: 'center',
                                            justifyContent: 'center',
                                            border: '1.5px solid rgba(255, 255, 255, 0.35)',
                                          }}
                                        >
                                          <Lock size={13} color="#ffffff" />
                                        </div>
                                      </div>
                                    )}
                                  </div>
                                ) : (
                                  /* Completely clean pure solid white paper — NO borders, NO dashes, NO labels! */
                                  <div style={{
                                    width: stripPreviewWidth,
                                    height: 375,
                                    background: 'transparent',
                                  }} />
                                )}
                              </div>
                            )
                          })}

                          {/* Vertical Cut Guides — ONLY between strips that are actually present on the paper */}
                          {Array.from({ length: numStrips - 1 }, (_, cut) => cut + 1).map(cut => {
                            if (cut >= strips.length) return null

                            return (
                              <div
                                key={cut}
                                style={{
                                  position: 'absolute',
                                  left: `${(cut / numStrips) * 100}%`,
                                  top: 24,
                                  bottom: 0,
                                  width: 1,
                                  borderLeft: '1.5px dashed rgba(109, 6, 38, 0.35)',
                                  pointerEvents: 'none',
                                }}
                              >
                                <span style={{ position: 'absolute', top: -11, left: -5, fontSize: 8, color: 'var(--color-brand)', fontWeight: 700 }}>
                                  ✂
                                </span>
                              </div>
                            )
                          })}
                        </div>
                      )
                    })()}

                    {/* Clean Paper Bottom Margin — Ticket Number Only, No Intrusive Banner */}
                    <div style={{ display: 'flex', justifyContent: 'flex-end', alignItems: 'center', paddingTop: 6, paddingRight: 4 }}>
                      <span style={{ fontSize: 9, fontFamily: 'var(--font-mono)', fontWeight: 700, color: 'rgba(109, 6, 38, 0.45)', letterSpacing: '0.08em' }}>
                        {ticketNumber ? `#${ticketNumber.replace(/^#/, '')}` : ''}
                      </span>
                    </div>
                  </motion.div>
                ) : paperLayout === 'a4-8' ? (
                  /* ─── OPTION 2: A4 SHEET (8 STRIPS) PREVIEW ───────────────────── */
                  <motion.div
                    key="a4-8"
                    initial={{ opacity: 0, scale: 0.96 }}
                    animate={{ opacity: 1, scale: 1 }}
                    exit={{ opacity: 0, scale: 0.96 }}
                    transition={{ duration: 0.18 }}
                    style={{
                      width: 420,
                      minHeight: 594, // 210 × 297 mm proportion
                      background: '#ffffff',
                      boxShadow: '0 16px 48px rgba(0,0,0,0.65), 0 0 0 1px rgba(0,0,0,0.1)',
                      padding: '12px 10px',
                      display: 'flex',
                      flexDirection: 'column',
                      position: 'relative',
                      userSelect: 'none',
                      borderRadius: 2,
                    }}
                  >
                    {/* A4 Sheet Header Label */}
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid #e2e2e2', paddingBottom: 4, marginBottom: 8 }}>
                      <span style={{ fontFamily: 'var(--font-mono)', fontSize: 8, fontWeight: 700, color: 'var(--color-brand)', letterSpacing: '0.08em' }}>
                        A4 PHOTO PAPER (21.0 × 29.7 CM)
                      </span>
                      <span style={{ fontFamily: 'var(--font-mono)', fontSize: 8, fontWeight: 600, color: '#444' }}>
                        OPTION 2: 8 STRIPS (2 ROWS × 4)
                      </span>
                    </div>

                    {/* 2 Rows of 4 Strips */}
                    <div style={{ display: 'flex', flexDirection: 'column', flex: 1, position: 'relative', gap: 6 }}>
                      {/* Top Row */}
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', position: 'relative', padding: '0 2px' }}>
                        {Array.from({ length: 4 }, (_, c) => {
                          const stripIdx = (currentSheetIndex * 8 + c) % strips.length
                          const strip = strips[stripIdx]
                          return (
                            <div key={c} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
                              <span style={{ fontSize: 7, fontFamily: 'var(--font-mono)', color: '#888', marginBottom: 2 }}>
                                #{c + 1}
                              </span>
                              {strip ? (
                                <MiniStrip strip={strip} stripIdx={stripIdx} width={92} fixedHeight={230} hideFooter={false} />
                              ) : (
                                <div style={{ width: 92, height: 230, border: '1px dashed #ccc', background: '#f8f8f8' }} />
                              )}
                            </div>
                          )
                        })}

                        {/* Top Row Vertical Cut Guides */}
                        {[1, 2, 3].map(cut => (
                          <div
                            key={cut}
                            style={{
                              position: 'absolute',
                              left: `${cut * 25}%`,
                              top: 12,
                              bottom: 0,
                              width: 1,
                              borderLeft: '1px dashed #bbb',
                              pointerEvents: 'none',
                            }}
                          >
                            <span style={{ position: 'absolute', top: -11, left: -5, fontSize: 8, color: '#888' }}>
                              ✂
                            </span>
                          </div>
                        ))}
                      </div>

                      {/* Horizontal Center Cut Guide */}
                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', position: 'relative', margin: '2px 0' }}>
                        <div style={{ width: '100%', borderTop: '1.5px dashed #666' }} />
                        <span style={{ position: 'absolute', background: '#ffffff', padding: '0 6px', fontSize: 8, fontFamily: 'var(--font-mono)', fontWeight: 700, color: 'var(--color-brand)', display: 'flex', alignItems: 'center', gap: 3 }}>
                          <Scissors size={9} />
                          <span>HORIZONTAL CENTER CUT (14.5 CM)</span>
                          <Scissors size={9} />
                        </span>
                      </div>

                      {/* Bottom Row */}
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', position: 'relative', padding: '0 2px' }}>
                        {Array.from({ length: 4 }, (_, c) => {
                          const stripIdx = (currentSheetIndex * 8 + c + 4) % strips.length
                          const strip = strips[stripIdx]
                          return (
                            <div key={c} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
                              <span style={{ fontSize: 7, fontFamily: 'var(--font-mono)', color: '#888', marginBottom: 2 }}>
                                #{c + 5}
                              </span>
                              {strip ? (
                                <MiniStrip strip={strip} stripIdx={stripIdx} width={92} fixedHeight={230} hideFooter={false} />
                              ) : (
                                <div style={{ width: 92, height: 230, border: '1px dashed #ccc', background: '#f8f8f8' }} />
                              )}
                            </div>
                          )
                        })}

                        {/* Bottom Row Vertical Cut Guides */}
                        {[1, 2, 3].map(cut => (
                          <div
                            key={cut}
                            style={{
                              position: 'absolute',
                              left: `${cut * 25}%`,
                              top: 12,
                              bottom: 0,
                              width: 1,
                              borderLeft: '1px dashed #bbb',
                              pointerEvents: 'none',
                            }}
                          />
                        ))}
                      </div>
                    </div>

                    {/* Bottom Margins Footer */}
                    <div style={{ borderTop: '1px solid #eee', paddingTop: 4, marginTop: 6, display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: 7, fontFamily: 'var(--font-mono)', color: '#888' }}>
                      <span>5 MM SLIM PRINT MARGINS</span>
                      <span>MAXIMIZES A4 PHOTO PAPER · 8 READY STRIPS</span>
                    </div>
                  </motion.div>
                ) : (
                  /* ─── SINGLE STRIP PREVIEW ────────────────────────────────────── */
                  <motion.div
                    key="single"
                    initial={{ opacity: 0, scale: 0.96 }}
                    animate={{ opacity: 1, scale: 1 }}
                    exit={{ opacity: 0, scale: 0.96 }}
                    transition={{ duration: 0.18 }}
                    style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 10 }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6, background: 'var(--color-bg-surface)', padding: '3px 12px', borderRadius: 'var(--radius-full)', border: '1px solid var(--color-border-subtle)' }}>
                      <span style={{ fontFamily: 'var(--font-mono)', fontSize: 10, color: 'var(--color-brand-light)' }}>
                        STRIP {currentSheetIndex + 1} OF {strips.length} · 2" × 6" (5.08 × 15.24 CM)
                      </span>
                    </div>
                    {strips[currentSheetIndex] && (
                      <MiniStrip
                        strip={strips[currentSheetIndex]}
                        stripIdx={currentSheetIndex}
                        width={240}
                        maxContainerHeight={typeof window !== 'undefined' ? Math.max(220, window.innerHeight - 280) : 420}
                        hideFooter={false}
                      />
                    )}
                  </motion.div>
                )}
              </AnimatePresence>
            </div>

            {/* Bottom info banner + PRINT NOW quick action */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap', justifyContent: 'center' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 11, fontFamily: 'var(--font-mono)', color: 'var(--color-text-secondary)', background: 'var(--color-bg-surface)', padding: '6px 14px', borderRadius: 'var(--radius-full)', border: '1px solid var(--color-border-subtle)' }}>
                <Sparkles size={12} color="var(--color-brand)" />
                <span>
                  {paperLayout === 'a5-2'
                    ? `A5 Paper (Epson L3150 · 14.8 × 21.0 cm) · 2 Vertical Strips Side-by-Side · Total ${physicalSheets} A5 Sheet(s) · Zero Waste!`
                    : (paperLayout === '4x5-split' || (paperLayout as string) === '4x6-split')
                    ? strips.length > 1
                      ? `Dye-Sub 4" × 5" Media · All ${strips.length} custom strips on the SAME paper · Total ${copies} sheet(s) (${totalPrints} cut strips)`
                      : `Dye-Sub 4" × 5" Media · Dual duplicate 2"×5" strips on 1 paper · Total ${copies} sheet(s) (${totalPrints} cut strips)`
                    : paperLayout === 'a4-5'
                    ? `A4 Landscape (Epson L3150 · 230 GSM Matte) · ${totalPrints} strip(s) on ${totalA4Sheets} sheet(s) · Unused slots blank (Ink Saved)`
                    : paperLayout === 'a4-6'
                    ? `6 strips per A4 sheet · ${totalA4Sheets} sheet(s) total`
                    : paperLayout === 'a4-8'
                    ? `8 strips per A4 sheet · ${totalA4Sheets} sheet(s) total`
                    : paperLayout === 'a4-4'
                    ? `4 strips per A4 sheet · ${totalA4Sheets} sheet(s) total`
                    : `Single 2"×6" strips · ${totalPrints} prints`}
                </span>
              </div>
              {/* PRINT NOW shortcut — always visible in the canvas area */}
              <button
                id="print-now-canvas-btn"
                className="btn btn-primary"
                onClick={() => handlePrint()}
                disabled={printing || exporting}
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: 7,
                  fontSize: 12,
                  fontFamily: 'var(--font-mono)',
                  fontWeight: 800,
                  letterSpacing: '0.06em',
                  padding: '8px 18px',
                  borderRadius: 'var(--radius-full)',
                  flexShrink: 0,
                  boxShadow: '0 4px 16px rgba(109,6,38,0.45)',
                  touchAction: 'manipulation',
                }}
              >
                {printing ? <RefreshCw size={14} className="animate-spin" /> : <Printer size={14} />}
                <span>{printing ? 'PRINTING…' : 'PRINT NOW'}</span>
              </button>
            </div>
          </>
        )}
      </div>

      {/* ─── Right Control Sidebar ─────────────────────────────────────────── */}
      <div
        className="panel panel-right export-sidebar"
        style={{
          background: 'var(--color-bg-surface)',
          borderLeft: 'var(--border-w-lg) solid rgba(0, 22, 24, 0.7)',
          display: 'flex',
          flexDirection: 'column',
          flexShrink: 0,
        }}
      >
        <div style={{ padding: '14px 16px', borderBottom: 'var(--border-w-md) solid var(--color-border-subtle)' }}>
          <span style={{ fontFamily: 'var(--font-mono)', fontSize: 13, letterSpacing: '0.08em', color: 'var(--color-brand)', textTransform: 'uppercase', fontWeight: 800 }}>
            PRINT & EXPORT CONTROLS
          </span>
        </div>

        <div className="panel-body flex flex-col gap-4" style={{ padding: '16px', flex: 1, overflowY: 'auto' }}>
          {/* ─── 1. Paper & Print Sheet Layout ────────────────────────────── */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 2 }}>
              <FileText size={15} color="var(--color-brand)" />
              <span style={{ fontSize: 11, fontFamily: 'var(--font-mono)', color: 'var(--color-text-secondary)', textTransform: 'uppercase', fontWeight: 700, letterSpacing: '0.04em' }}>
                Paper Layout
              </span>
            </div>

            {/* ── PRIMARY: A5 Duplex (2 Strips / Half-A4 · Zero Waste) ── */}
            <button
              type="button"
              onClick={() => { setPaperLayout('a5-2'); setCurrentSheetIndex(0) }}
              style={{
                padding: '13px 12px',
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'flex-start',
                gap: 4,
                borderRadius: 'var(--radius-md)',
                border: paperLayout === 'a5-2' ? '2.5px solid var(--color-brand)' : '2px solid var(--color-border-subtle)',
                background: paperLayout === 'a5-2' ? 'var(--color-brand)' : 'var(--color-bg-base)',
                color: paperLayout === 'a5-2' ? '#ffffff' : 'var(--color-text-secondary)',
                cursor: 'pointer',
                transition: 'all var(--transition-fast)',
                position: 'relative',
                touchAction: 'manipulation',
                width: '100%',
              }}
            >
              <span style={{
                position: 'absolute',
                top: -9,
                right: 8,
                background: paperLayout === 'a5-2' ? '#16a34a' : 'rgba(109, 6, 38, 0.85)',
                color: '#fff',
                fontSize: 9,
                fontWeight: 800,
                padding: '2px 8px',
                borderRadius: 'var(--radius-full)',
                letterSpacing: '0.05em'
              }}>
                {paperLayout === 'a5-2' ? '★ ACTIVE A5 PAPER · 2 STRIPS' : '★ POPULAR (₹99) · A5 TRAY'}
              </span>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <Scissors size={15} style={{ opacity: 0.9, flexShrink: 0 }} />
                <span style={{ fontSize: 13, fontFamily: 'var(--font-mono)', fontWeight: 800 }}>
                  A5 Paper  —  2 Vertical Strips (14.8 × 21.0 cm)
                </span>
              </div>
              <span style={{ fontSize: 10, opacity: 0.90, fontFamily: 'var(--font-mono)', paddingLeft: 23 }}>
                Two Vertical Strips Side-by-Side (7.4 × 21 cm each) · 1 Center Cut · Zero Waste
              </span>
              <span style={{ fontSize: 10, opacity: 0.80, fontFamily: 'var(--font-mono)', paddingLeft: 23 }}>
                Epson L3150 A5 Paper Tray · 230 GSM Matte Finish · 300 DPI (1748 × 2480 px)
              </span>
            </button>

            {/* ── SECONDARY: A4 5-up (Epson L3150 Full Sheet) ── */}
            <button
              type="button"
              onClick={() => { setPaperLayout('a4-5'); setCurrentSheetIndex(0) }}
              style={{
                padding: '11px 12px',
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'flex-start',
                gap: 3,
                borderRadius: 'var(--radius-md)',
                border: paperLayout === 'a4-5' ? '2.5px solid var(--color-brand)' : '2px solid var(--color-border-subtle)',
                background: paperLayout === 'a4-5' ? 'var(--color-brand)' : 'var(--color-bg-base)',
                color: paperLayout === 'a4-5' ? '#ffffff' : 'var(--color-text-secondary)',
                cursor: 'pointer',
                transition: 'all var(--transition-fast)',
                position: 'relative',
                touchAction: 'manipulation',
                width: '100%',
              }}
            >
              {paperLayout === 'a4-5' && (
                <span style={{ position: 'absolute', top: -9, right: 8, background: '#16a34a', color: '#fff', fontSize: 9, fontWeight: 800, padding: '2px 8px', borderRadius: 'var(--radius-full)', letterSpacing: '0.05em' }}>
                  ★ ACTIVE A4 SHEET
                </span>
              )}
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <Scissors size={15} style={{ opacity: 0.9, flexShrink: 0 }} />
                <span style={{ fontSize: 12, fontFamily: 'var(--font-mono)', fontWeight: 800 }}>
                  5 Strips / A4 Landscape  (29.7 × 21.0 cm)
                </span>
              </div>
              <span style={{ fontSize: 9.5, opacity: 0.85, fontFamily: 'var(--font-mono)', paddingLeft: 23 }}>
                Full A4 sheet · 5 Strips · 1:1 Ink Saver mode active
              </span>
            </button>

            {/* ── SECONDARY: Standard 4"×6" Duplex ─────────────────────────── */}
            <button
              type="button"
              onClick={() => { setPaperLayout('4x6-duplex'); setCurrentSheetIndex(0) }}
              style={{
                padding: '11px 12px',
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'flex-start',
                gap: 3,
                borderRadius: 'var(--radius-md)',
                border: paperLayout === '4x6-duplex' ? '2.5px solid var(--color-brand)' : '2px solid var(--color-border-subtle)',
                background: paperLayout === '4x6-duplex' ? 'var(--color-brand)' : 'var(--color-bg-base)',
                color: paperLayout === '4x6-duplex' ? '#ffffff' : 'var(--color-text-secondary)',
                cursor: 'pointer',
                transition: 'all var(--transition-fast)',
                position: 'relative',
                touchAction: 'manipulation',
                width: '100%',
              }}
            >
              <span style={{ position: 'absolute', top: -9, right: 8, background: '#16a34a', color: '#fff', fontSize: 9, fontWeight: 800, padding: '2px 8px', borderRadius: 'var(--radius-full)', letterSpacing: '0.05em' }}>
                {strips.length === 1 && paperSaving ? '🌱 2-UP PAPER SAVER' : '★ RETAIL STANDARD'}
              </span>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <Scissors size={15} style={{ opacity: 0.9, flexShrink: 0 }} />
                <span style={{ fontSize: 12, fontFamily: 'var(--font-mono)', fontWeight: 800 }}>
                  4" × 6" Duplex  —  2 Strips Per Sheet
                </span>
              </div>
              <span style={{ fontSize: 9.5, opacity: 0.85, fontFamily: 'var(--font-mono)', paddingLeft: 23 }}>
                {strips.length === 1 && paperSaving
                  ? 'Auto-duplicates single strip across 4"×6" · 2 physical keepsakes · 0 wasted paper'
                  : 'Standard photo paper · Two 2"×6" strips · 1 centre cut · Customer keeps both halves'}
              </span>
            </button>

            {/* ── Paper Saving Toggle Card (for 4x6 duplex) ── */}
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                padding: '9px 12px',
                borderRadius: 'var(--radius-md)',
                background: paperSaving ? 'rgba(22, 163, 74, 0.08)' : 'var(--color-bg-base)',
                border: paperSaving ? '1.5px solid rgba(22, 163, 74, 0.4)' : '1.5px solid var(--color-border-subtle)',
              }}
            >
              <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                  <span style={{ fontSize: 12 }}>🌱</span>
                  <span style={{ fontSize: 11, fontFamily: 'var(--font-mono)', fontWeight: 800, color: paperSaving ? '#15803d' : 'var(--color-text-secondary)' }}>
                    4×6 Duplex Auto-Duplicate
                  </span>
                </div>
                <span style={{ fontSize: 9.5, fontFamily: 'var(--font-mono)', color: 'var(--color-text-tertiary)' }}>
                  Auto-duplicate odd/single strip on 4×6 photo paper
                </span>
              </div>
              <button
                type="button"
                onClick={() => setPaperSaving(prev => !prev)}
                style={{
                  padding: '4px 10px',
                  borderRadius: 'var(--radius-full)',
                  border: 'none',
                  background: paperSaving ? '#16a34a' : 'var(--color-bg-surface)',
                  color: paperSaving ? '#ffffff' : 'var(--color-text-secondary)',
                  fontWeight: 800,
                  fontSize: 10.5,
                  fontFamily: 'var(--font-mono)',
                  cursor: 'pointer',
                  boxShadow: paperSaving ? '0 2px 8px rgba(22, 163, 74, 0.35)' : 'none',
                }}
              >
                {paperSaving ? 'ON' : 'OFF'}
              </button>
            </div>

            {/* ── TERTIARY: 4×5" Dye-Sub ──────────────────────────────────── */}
            <button
              type="button"
              onClick={() => { setPaperLayout('4x5-split'); setCurrentSheetIndex(0) }}
              style={{
                padding: '10px 12px',
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'flex-start',
                gap: 3,
                borderRadius: 'var(--radius-md)',
                border: (paperLayout === '4x5-split' || (paperLayout as string) === '4x6-split') ? '2.5px solid var(--color-brand)' : '2px solid var(--color-border-subtle)',
                background: (paperLayout === '4x5-split' || (paperLayout as string) === '4x6-split') ? 'var(--color-brand)' : 'var(--color-bg-base)',
                color: (paperLayout === '4x5-split' || (paperLayout as string) === '4x6-split') ? '#ffffff' : 'var(--color-text-secondary)',
                cursor: 'pointer',
                transition: 'all var(--transition-fast)',
                touchAction: 'manipulation',
                width: '100%',
              }}
            >
              <span style={{ fontSize: 12, fontFamily: 'var(--font-mono)', fontWeight: 800 }}>Dye-Sub 4"×5" Split-Cut</span>
              <span style={{ fontSize: 10, opacity: 0.80, fontFamily: 'var(--font-mono)' }}>
                DNP / Citizen / HiTi · Two 2"×5" strips · Hardware blade cut
              </span>
            </button>

            {/* ── MISC OPTIONS: 3-column grid ─────────────────────────────── */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 6 }}>
              {([
                { key: 'a4-6',  label: '6 / A4',     sub: '5.0 × 21 cm' },
                { key: 'a4-4',  label: '4 / A4',     sub: '6.0 × 21 cm' },
                { key: 'single',label: strips.length === 1 ? 'Single ★' : 'Single', sub: strips.length === 1 ? '1:1 Default' : '2" × 6"' },
              ] as { key: PaperLayout; label: string; sub: string }[]).map(({ key, label, sub }) => (
                <button
                  key={key}
                  type="button"
                  onClick={() => { setPaperLayout(key); setCurrentSheetIndex(0) }}
                  style={{
                    padding: '8px 4px',
                    display: 'flex',
                    flexDirection: 'column',
                    alignItems: 'center',
                    gap: 2,
                    borderRadius: 'var(--radius-md)',
                    border: paperLayout === key ? '2px solid var(--color-brand)' : '1.5px solid var(--color-border-subtle)',
                    background: paperLayout === key ? 'var(--color-brand)' : 'var(--color-bg-base)',
                    color: paperLayout === key ? '#ffffff' : 'var(--color-text-secondary)',
                    cursor: 'pointer',
                    transition: 'all var(--transition-fast)',
                    touchAction: 'manipulation',
                  }}
                >
                  <span style={{ fontSize: 11, fontFamily: 'var(--font-mono)', fontWeight: 700 }}>{label}</span>
                  <span style={{ fontSize: 9, opacity: 0.75, fontFamily: 'var(--font-mono)' }}>{sub}</span>
                </button>
              ))}
            </div>
          </div>

          {/* ─── 2. Copies Selector Card ─────────────────────────────────── */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10, background: 'var(--color-bg-base)', padding: '12px 14px', borderRadius: 'var(--radius-md)', border: '2px solid var(--color-border-subtle)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <Layers size={16} color="var(--color-brand-light)" />
                <span style={{ fontSize: 12, fontFamily: 'var(--font-mono)', color: 'var(--color-text-tertiary)', textTransform: 'uppercase', fontWeight: 700, letterSpacing: '0.04em' }}>
                  Number of Copies
                </span>
              </div>
              <span style={{ fontSize: 12, fontFamily: 'var(--font-mono)', color: 'var(--color-brand-light)', fontWeight: 800 }}>
                {totalPrints} PRINTS
              </span>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 8 }}>
              {[
                { n: 1, title: '1x' },
                { n: 2, title: '2x' },
                { n: 3, title: '3x' },
                { n: 4, title: '4x' },
              ].map(({ n, title }) => {
                const isSelected = copies === n
                return (
                  <button
                    key={n}
                    type="button"
                    onClick={() => handleCopiesChange(n)}
                    style={{
                      minHeight: 44,
                      padding: '8px 4px',
                      borderRadius: 'var(--radius-md)',
                      border: isSelected ? '2px solid var(--color-brand-light)' : '2px solid var(--color-border-subtle)',
                      background: isSelected ? 'var(--color-brand)' : 'transparent',
                      color: isSelected ? '#ffffff' : 'var(--color-text-secondary)',
                      fontSize: 13,
                      fontFamily: 'var(--font-mono)',
                      fontWeight: isSelected ? 800 : 600,
                      cursor: 'pointer',
                      touchAction: 'manipulation',
                    }}
                  >
                    {title}
                  </button>
                )
              })}
            </div>

            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', paddingTop: 8, borderTop: 'var(--border-w-md) solid var(--color-border-subtle)' }}>
              <span style={{ fontSize: 12, fontFamily: 'var(--font-mono)', fontWeight: 600, color: 'var(--color-text-secondary)' }}>
                Fine Adjust:
              </span>
              <div className="flex items-center gap-3">
                <button
                  className="btn btn-secondary btn-icon"
                  onClick={() => handleCopiesChange(copies - 1)}
                  disabled={copies <= 1}
                  style={{ width: 44, height: 44, borderRadius: 'var(--radius-md)' }}
                  aria-label="Decrease copies"
                >
                  <Minus size={18} />
                </button>
                <span style={{ fontFamily: 'var(--font-mono)', fontSize: 16, fontWeight: 800, minWidth: 28, textAlign: 'center', color: 'var(--color-brand-light)' }}>
                  {copies}
                </span>
                <button
                  className="btn btn-secondary btn-icon"
                  onClick={() => handleCopiesChange(copies + 1)}
                  disabled={copies >= 10}
                  style={{ width: 44, height: 44, borderRadius: 'var(--radius-md)' }}
                  aria-label="Increase copies"
                >
                  <Plus size={18} />
                </button>
              </div>
            </div>
          </div>

          {/* ─── 3. File Export Format ───────────────────────────────────── */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            <span style={{ fontSize: 12, fontFamily: 'var(--font-mono)', color: 'var(--color-text-tertiary)', textTransform: 'uppercase', fontWeight: 700, letterSpacing: '0.04em' }}>
              Export Format
            </span>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 6 }}>
              {(['jpeg', 'png', 'webp', 'pdf'] as ExportFormat[]).map(f => (
                <button
                  key={f}
                  onClick={() => setFormat(f)}
                  style={{
                    height: 42,
                    fontSize: 12,
                    fontFamily: 'var(--font-mono)',
                    fontWeight: 700,
                    borderRadius: 'var(--radius-md)',
                    border: format === f ? '2px solid var(--color-primary)' : '2px solid var(--color-border-subtle)',
                    background: format === f ? 'var(--color-primary)' : 'var(--color-bg-base)',
                    color: format === f ? '#ffffff' : 'var(--color-text-secondary)',
                    cursor: 'pointer',
                    touchAction: 'manipulation',
                  }}
                >
                  {f.toUpperCase()}
                </button>
              ))}
            </div>
          </div>

          {/* ─── Instant Digital Sharing (QR / Email / SMS) ─────────────── */}
          <div
            style={{
              display: 'flex',
              flexDirection: 'column',
              gap: 10,
              padding: '14px',
              background: 'rgba(109, 6, 38, 0.05)',
              borderRadius: 'var(--radius-md)',
              border: '2px solid var(--color-border-subtle)',
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span
                style={{
                  fontSize: 12,
                  fontFamily: 'var(--font-mono)',
                  color: 'var(--color-brand-light)',
                  textTransform: 'uppercase',
                  fontWeight: 700,
                  letterSpacing: '0.06em',
                }}
              >
                Instant Digital Delivery
              </span>
              <span
                style={{
                  fontSize: 11,
                  fontFamily: 'var(--font-mono)',
                  fontWeight: 800,
                  color: 'var(--color-brand)',
                }}
              >
                FREE
              </span>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 8 }}>
              <button
                type="button"
                onClick={() => setShowQrModal(true)}
                className="btn btn-secondary"
                style={{
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: 'center',
                  gap: 6,
                  padding: '10px 4px',
                  height: 'auto',
                  minHeight: 60,
                  borderRadius: 'var(--radius-md)',
                  touchAction: 'manipulation',
                }}
              >
                <QrCode size={22} color="var(--color-brand)" />
                <span style={{ fontSize: 11, fontFamily: 'var(--font-mono)', fontWeight: 700 }}>QR CODE</span>
              </button>

              <button
                type="button"
                onClick={() => setShowEmailModal(true)}
                className="btn btn-secondary"
                style={{
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: 'center',
                  gap: 6,
                  padding: '10px 4px',
                  height: 'auto',
                  minHeight: 60,
                  borderRadius: 'var(--radius-md)',
                  touchAction: 'manipulation',
                }}
              >
                <Mail size={22} color="var(--color-brand)" />
                <span style={{ fontSize: 11, fontFamily: 'var(--font-mono)', fontWeight: 700 }}>EMAIL</span>
              </button>

              <button
                type="button"
                onClick={() => setShowSmsModal(true)}
                className="btn btn-secondary"
                style={{
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: 'center',
                  gap: 6,
                  padding: '10px 4px',
                  height: 'auto',
                  minHeight: 60,
                  borderRadius: 'var(--radius-md)',
                  touchAction: 'manipulation',
                }}
              >
                <Phone size={22} color="var(--color-brand)" />
                <span style={{ fontSize: 11, fontFamily: 'var(--font-mono)', fontWeight: 700 }}>TEXT SMS</span>
              </button>
            </div>
          </div>
        </div>
        {/* ─── END scrollable panel-body ─────────────────────────────────── */}

        {/* ─── 4. Action Buttons — PINNED STICKY FOOTER (always visible) ─── */}
        <div
          id="export-action-footer"
          style={{
            flexShrink: 0,
            borderTop: '2px solid var(--color-border-subtle)',
            background: 'var(--color-bg-surface)',
            boxShadow: '0 -8px 28px rgba(0,0,0,0.18)',
            padding: '14px 16px 16px',
            display: 'flex',
            flexDirection: 'column',
            gap: 8,
          }}
        >
          {/* Primary Print CTA */}
          <button
            id="print-main-btn"
            className="btn btn-primary btn-xl btn-expressive w-full"
            onClick={() => handlePrint()}
            disabled={printing || exporting}
            style={{
              minHeight: 60,
              fontSize: 15,
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              justifyContent: 'center',
              gap: 3,
              touchAction: 'manipulation',
              borderRadius: 'var(--radius-md)',
              boxShadow: printing ? 'none' : '0 6px 20px rgba(109,6,38,0.45)',
            }}
          >
            {printing ? (
              <>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <RefreshCw size={20} className="animate-spin" />
                  <span style={{ fontWeight: 800, letterSpacing: '0.06em' }}>PREPARING PRINT...</span>
                </div>
              </>
            ) : (
              <>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <Printer size={20} />
                  <span style={{ fontWeight: 800, letterSpacing: '0.06em' }}>
                    {paperLayout === 'a5-2'
                      ? `PRINT ${physicalSheets} A5 SHEET(S)`
                      : paperLayout === '4x6-duplex'
                      ? `PRINT ${physicalSheets} 4"×6" SHEET(S)`
                      : (paperLayout === '4x5-split' || (paperLayout as string) === '4x6-split')
                      ? `PRINT ${physicalSheets} 4×5" SHEET(S)`
                      : paperLayout === 'single'
                      ? `PRINT ${totalPrints} STRIP(S)`
                      : `PRINT ${totalA4Sheets} A4 SHEET(S)`}
                  </span>
                </div>
                <span style={{ fontSize: 10, fontFamily: 'var(--font-mono)', fontWeight: 500, opacity: 0.82, letterSpacing: '0.04em' }}>
                  Hand prints to customer & complete order
                </span>
              </>
            )}
          </button>

          {/* Secondary row: Save + Finish */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 7 }}>
            <button
              id="export-save-btn"
              className="btn btn-secondary"
              onClick={exportStrips}
              disabled={exporting || printing}
              style={{
                minHeight: 44,
                fontSize: 11,
                fontFamily: 'var(--font-mono)',
                fontWeight: 700,
                borderRadius: 'var(--radius-md)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: 6,
                touchAction: 'manipulation',
              }}
            >
              {exporting ? (
                <><RefreshCw size={14} className="animate-spin" /><span>EXPORTING...</span></>
              ) : (
                <><Download size={14} /><span>SAVE {format.toUpperCase()}</span></>
              )}
            </button>

            <button
              id="finish-session-btn"
              className="btn btn-ghost"
              onClick={handleFinishSession}
              style={{
                minHeight: 44,
                fontSize: 11,
                fontFamily: 'var(--font-mono)',
                fontWeight: 700,
                borderRadius: 'var(--radius-md)',
                color: 'var(--color-brand)',
                borderColor: 'rgba(109, 6, 38, 0.4)',
                background: 'rgba(109, 6, 38, 0.08)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: 6,
                touchAction: 'manipulation',
              }}
            >
              <CheckCircle2 size={14} />
              <span>DONE / RESET →</span>
            </button>
          </div>

          {/* Back link */}
          <button
            className="btn btn-ghost w-full"
            onClick={onBack}
            style={{
              minHeight: 34,
              fontSize: 11,
              fontFamily: 'var(--font-mono)',
              color: 'var(--color-text-tertiary)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: 5,
              touchAction: 'manipulation',
              paddingTop: 0,
              paddingBottom: 0,
            }}
          >
            <ArrowLeft size={13} />
            <span>Back to Preview</span>
          </button>
        </div>
      </div>

      {/* ─── QR Code Download Modal ────────────────────────────────────────── */}
      <AnimatePresence>
        {showQrModal && (
          <div
            style={{
              position: 'fixed',
              inset: 0,
              backgroundColor: 'rgba(0, 0, 0, 0.8)',
              backdropFilter: 'blur(10px)',
              WebkitBackdropFilter: 'blur(10px)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              zIndex: 9999,
              padding: 24,
            }}
            onClick={() => setShowQrModal(false)}
          >
            <motion.div
              initial={{ scale: 0.92, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.92, opacity: 0 }}
              onClick={e => e.stopPropagation()}
              style={{
                width: '100%',
                maxWidth: 380,
                background: 'var(--color-bg, #F7F1EA)',
                border: '2px solid var(--color-brand)',
                borderRadius: 'var(--radius-2xl)',
                padding: 28,
                textAlign: 'center',
                boxShadow: '0 24px 64px rgba(43, 5, 16, 0.4)',
              }}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
                <span style={{ fontFamily: 'var(--font-mono)', fontSize: 12, color: 'var(--color-brand)', letterSpacing: '0.08em', textTransform: 'uppercase', fontWeight: 800 }}>
                  Scan to Download Photos
                </span>
                <button
                  onClick={() => setShowQrModal(false)}
                  className="btn btn-ghost btn-sm"
                  style={{ borderRadius: '50%', width: 36, height: 36, padding: 0 }}
                >
                  <X size={16} />
                </button>
              </div>

              {/* White card container for crisp QR scanning */}
              <div
                style={{
                  background: '#ffffff',
                  padding: 18,
                  borderRadius: 'var(--radius-lg)',
                  display: 'inline-block',
                  margin: '0 auto 16px',
                  boxShadow: '0 8px 24px rgba(0, 0, 0, 0.3)',
                }}
              >
                <QRCodeSVG
                  value={`http://${window.location.hostname || 'localhost'}:3847/api/download/${session?.id}/strip`}
                  size={200}
                  level="H"
                  includeMargin={false}
                />
              </div>

              <p style={{ fontFamily: 'var(--font-body)', fontSize: 13, color: 'var(--color-text-secondary)', marginBottom: 16, lineHeight: 1.5 }}>
                Point your phone's camera at the QR code to instantly view and save your photo strip.
              </p>

              <button
                onClick={() => {
                  const url = `http://${window.location.hostname || 'localhost'}:3847/api/download/${session?.id}/strip`
                  navigator.clipboard.writeText(url)
                  setCopiedLink(true)
                  setTimeout(() => setCopiedLink(false), 2000)
                }}
                className="btn btn-secondary w-full"
                style={{ borderRadius: 'var(--radius-full)', height: 44, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6, fontSize: 12, fontFamily: 'var(--font-mono)' }}
              >
                {copiedLink ? <Check size={14} color="var(--color-success)" /> : <Copy size={14} />}
                <span>{copiedLink ? 'LINK COPIED' : 'COPY DOWNLOAD LINK'}</span>
              </button>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* ─── Email My Photos Modal (SMTP) ─────────────────────────────────── */}
      <AnimatePresence>
        {showEmailModal && (
          <div
            style={{
              position: 'fixed',
              inset: 0,
              backgroundColor: 'rgba(0, 0, 0, 0.8)',
              backdropFilter: 'blur(10px)',
              WebkitBackdropFilter: 'blur(10px)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              zIndex: 9999,
              padding: 24,
            }}
            onClick={() => setShowEmailModal(false)}
          >
            <motion.div
              initial={{ scale: 0.92, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.92, opacity: 0 }}
              onClick={e => e.stopPropagation()}
              style={{
                width: '100%',
                maxWidth: 440,
                background: 'var(--color-bg, #F7F1EA)',
                border: '2px solid var(--color-brand)',
                borderRadius: 'var(--radius-2xl)',
                padding: 28,
                boxShadow: '0 24px 64px rgba(43, 5, 16, 0.4)',
              }}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <Mail size={18} color="var(--color-brand)" />
                  <span style={{ fontFamily: 'var(--font-display)', fontSize: 18, fontWeight: 700, color: 'var(--color-brand)' }}>
                    Email My Photos
                  </span>
                </div>
                <button
                  onClick={() => setShowEmailModal(false)}
                  className="btn btn-ghost btn-sm"
                  style={{ borderRadius: '50%', width: 36, height: 36, padding: 0 }}
                >
                  <X size={16} />
                </button>
              </div>

              <p style={{ fontFamily: 'var(--font-body)', fontSize: 13, color: 'var(--color-text-secondary)', marginBottom: 16 }}>
                We'll send high-resolution digital copies directly to your inbox.
              </p>

              <input
                type="email"
                placeholder="guest@example.com"
                value={emailAddress}
                onChange={e => setEmailAddress(e.target.value)}
                style={{
                  width: '100%',
                  height: 48,
                  borderRadius: 'var(--radius-md)',
                  background: '#ffffff',
                  border: '1.5px solid var(--color-border-default)',
                  color: 'var(--color-text)',
                  padding: '0 16px',
                  fontFamily: 'var(--font-mono)',
                  fontSize: 15,
                  marginBottom: 10,
                  outline: 'none',
                }}
              />

              {/* Quick domain buttons for touch kiosks */}
              <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 18 }}>
                {['@gmail.com', '@yahoo.com', '@icloud.com', '@outlook.com'].map(dom => (
                  <button
                    key={dom}
                    type="button"
                    onClick={() => {
                      if (!emailAddress.includes('@')) {
                        setEmailAddress(prev => prev + dom)
                      }
                    }}
                    style={{
                      background: 'rgba(109, 6, 38, 0.08)',
                      border: '1px solid rgba(109, 6, 38, 0.25)',
                      borderRadius: 'var(--radius-sm)',
                      color: 'var(--color-brand)',
                      padding: '4px 10px',
                      fontSize: 11,
                      fontFamily: 'var(--font-mono)',
                      fontWeight: 600,
                      cursor: 'pointer',
                    }}
                  >
                    {dom}
                  </button>
                ))}
              </div>

              {emailSuccess ? (
                <div style={{ color: 'var(--color-success)', fontFamily: 'var(--font-mono)', fontSize: 13, textAlign: 'center', padding: 8, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6 }}>
                  <Check size={16} /> Photos successfully queued for delivery!
                </div>
              ) : (
                <button
                  type="button"
                  disabled={sendingEmail || !emailAddress.includes('@')}
                  onClick={async () => {
                    setSendingEmail(true)
                    try {
                      const res = await fetch(`http://${window.location.hostname || 'localhost'}:3847/api/email/send`, {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({
                          sessionId: session?.id,
                          recipientEmail: emailAddress,
                        }),
                      })
                      if (res.ok) {
                        setEmailSuccess(true)
                        setTimeout(() => {
                          setShowEmailModal(false)
                          setEmailSuccess(false)
                          setEmailAddress('')
                        }, 2000)
                      } else {
                        toast('Failed to send email. Spooled for offline delivery.', 'warning')
                      }
                    } catch (e) {
                      toast('Email queued for offline delivery.', 'info')
                    } finally {
                      setSendingEmail(false)
                    }
                  }}
                  className="btn btn-primary w-full"
                  style={{ borderRadius: 'var(--radius-full)', height: 48, fontFamily: 'var(--font-mono)', fontSize: 13 }}
                >
                  {sendingEmail ? 'SENDING...' : 'SEND PHOTOS'}
                </button>
              )}
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* ─── Text My Photos Modal (Twilio SMS) ─────────────────────────────── */}
      <PhonePadModal
        isOpen={showSmsModal}
        onClose={() => setShowSmsModal(false)}
        onSend={async (phoneNumber) => {
          try {
            const res = await fetch(`http://${window.location.hostname || 'localhost'}:3847/api/sms/send`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                sessionId: session?.id,
                recipientPhone: phoneNumber,
              }),
            })
            return res.ok
          } catch {
            return false
          }
        }}
      />

      {/* ─── Printer Paper Out Hard Stop Modal ──────────────────────────────── */}
      <AnimatePresence>
        {showPaperOutModal && (
          <div
            style={{
              position: 'fixed',
              inset: 0,
              backgroundColor: 'rgba(0, 0, 0, 0.85)',
              backdropFilter: 'blur(10px)',
              WebkitBackdropFilter: 'blur(10px)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              zIndex: 9999,
              padding: 24,
            }}
          >
            <motion.div
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.9, opacity: 0 }}
              style={{
                width: '100%',
                maxWidth: 440,
                background: 'linear-gradient(165deg, #3d1414, #1a0808)',
                border: '1px solid rgba(255, 100, 100, 0.4)',
                borderRadius: 'var(--radius-2xl)',
                padding: 32,
                textAlign: 'center',
                boxShadow: '0 24px 64px rgba(0, 0, 0, 0.8)',
              }}
            >
              <div
                style={{
                  width: 60,
                  height: 60,
                  borderRadius: '50%',
                  background: 'rgba(255, 60, 60, 0.2)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  margin: '0 auto 16px',
                }}
              >
                <AlertOctagon size={32} color="#ff6b6b" />
              </div>

              <h3 style={{ fontFamily: 'var(--font-display)', fontSize: 22, color: '#ffffff', marginBottom: 8 }}>
                Printer Paper Out
              </h3>

              <p style={{ fontFamily: 'var(--font-body)', fontSize: 14, color: 'rgba(255, 255, 255, 0.8)', lineHeight: 1.5, marginBottom: 20 }}>
                The printer roll has depleted. Please notify a booth attendant to install a new paper roll.
                <br />
                <span style={{ fontFamily: 'var(--font-mono)', fontSize: 12, color: 'var(--color-brand)' }}>
                  Prints remaining: {settings.printerRoll.printsRemaining}
                </span>
              </p>

              <div style={{ display: 'flex', gap: 10 }}>
                <button
                  onClick={() => setShowPaperOutModal(false)}
                  className="btn btn-secondary flex-1"
                  style={{ borderRadius: 'var(--radius-full)', height: 48 }}
                >
                  Close
                </button>
                <button
                  onClick={() => {
                    setShowPaperOutModal(false)
                    setShowQrModal(true)
                  }}
                  className="btn btn-primary flex-1"
                  style={{ borderRadius: 'var(--radius-full)', height: 48 }}
                >
                  Get Digital QR
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* ─── Plan Limit Exceeded Upsell Modal ─────────────────────────────────── */}
      <AnimatePresence>
        {showUpsellModal && (
          <div
            style={{
              position: 'fixed',
              inset: 0,
              backgroundColor: 'rgba(0, 0, 0, 0.88)',
              backdropFilter: 'blur(12px)',
              WebkitBackdropFilter: 'blur(12px)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              zIndex: 9999,
              padding: 20,
            }}
          >
            <motion.div
              initial={{ scale: 0.92, opacity: 0, y: 12 }}
              animate={{ scale: 1, opacity: 1, y: 0 }}
              exit={{ scale: 0.92, opacity: 0, y: 12 }}
              transition={{ duration: 0.2 }}
              style={{
                width: '100%',
                maxWidth: 480,
                background: 'linear-gradient(170deg, #3d0315 0%, #20020b 60%, #110006 100%)',
                border: '2px solid rgba(199, 27, 77, 0.45)',
                borderRadius: 'var(--radius-2xl)',
                padding: '24px 24px 20px',
                textAlign: 'center',
                boxShadow: '0 24px 64px rgba(0, 0, 0, 0.9), 0 0 35px rgba(109, 6, 38, 0.3)',
                position: 'relative',
              }}
            >
              {/* Close Button */}
              <button
                onClick={() => setShowUpsellModal(false)}
                style={{
                  position: 'absolute',
                  top: 14,
                  right: 14,
                  background: 'rgba(255, 255, 255, 0.08)',
                  border: 'none',
                  borderRadius: '50%',
                  width: 32,
                  height: 32,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  color: 'rgba(255, 255, 255, 0.7)',
                  cursor: 'pointer',
                }}
              >
                <X size={16} />
              </button>

              {/* Badge */}
              <div
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: 6,
                  background: 'rgba(199, 27, 77, 0.2)',
                  border: '1px solid rgba(199, 27, 77, 0.5)',
                  padding: '3px 12px',
                  borderRadius: 'var(--radius-full)',
                  marginBottom: 10,
                }}
              >
                <Sparkles size={12} color="#C71B4D" />
                <span style={{ fontSize: 10, fontFamily: 'var(--font-mono)', fontWeight: 800, color: '#F7EAEF', letterSpacing: '0.08em' }}>
                  PLAN LIMIT: {planStripLimit} STRIPS
                </span>
              </div>

              <h3 style={{ fontFamily: 'var(--font-display)', fontSize: 21, color: '#FFFFFF', marginBottom: 6, fontWeight: 800 }}>
                Unlock All {strips.length} Strips
              </h3>

              <p style={{ fontFamily: 'var(--font-body)', fontSize: 13, color: 'rgba(255, 255, 255, 0.85)', lineHeight: 1.45, marginBottom: 16 }}>
                You paid for <span style={{ color: '#F7EAEF', fontWeight: 700 }}>₹{effectivePlan} ({planStripLimit} strips)</span>, but created <span style={{ color: '#fff', fontWeight: 700 }}>{strips.length} strips</span>.
                <br />
                Choose your upgrade plan below to unlock all strips:
              </p>

              {/* Upgrade Tier Options */}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 14 }}>
                {/* Tier 1 */}
                <button
                  type="button"
                  onClick={() => setSelectedUpsellTier('tier1')}
                  style={{
                    background: selectedUpsellTier === 'tier1' ? 'rgba(199, 27, 77, 0.28)' : 'rgba(255, 255, 255, 0.04)',
                    border: selectedUpsellTier === 'tier1' ? '2px solid #C71B4D' : '1.5px solid rgba(255, 255, 255, 0.12)',
                    borderRadius: 'var(--radius-lg)',
                    padding: '10px 8px',
                    cursor: 'pointer',
                    textAlign: 'left',
                    transition: 'all 0.15s ease',
                    position: 'relative',
                  }}
                >
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 3 }}>
                    <span style={{ fontFamily: 'var(--font-display)', fontSize: 16, fontWeight: 800, color: selectedUpsellTier === 'tier1' ? '#F7EAEF' : '#fff' }}>
                      +₹{upgradeOffers.tier1.fee}
                    </span>
                    {selectedUpsellTier === 'tier1' && <CheckCircle2 size={14} color="#C71B4D" />}
                  </div>
                  <div style={{ fontSize: 11, fontFamily: 'var(--font-mono)', fontWeight: 700, color: '#fff' }}>
                    {upgradeOffers.tier1.title.split(' · ')[1]}
                  </div>
                  <div style={{ fontSize: 9, fontFamily: 'var(--font-mono)', color: 'rgba(255, 255, 255, 0.65)', marginTop: 2 }}>
                    {upgradeOffers.tier1.desc}
                  </div>
                </button>

                {/* Tier 2 (Best Offer) */}
                <button
                  type="button"
                  onClick={() => setSelectedUpsellTier('tier2')}
                  style={{
                    background: selectedUpsellTier === 'tier2' ? 'rgba(199, 27, 77, 0.28)' : 'rgba(255, 255, 255, 0.04)',
                    border: selectedUpsellTier === 'tier2' ? '2px solid #C71B4D' : '1.5px solid rgba(255, 255, 255, 0.12)',
                    borderRadius: 'var(--radius-lg)',
                    padding: '10px 8px',
                    cursor: 'pointer',
                    textAlign: 'left',
                    transition: 'all 0.15s ease',
                    position: 'relative',
                  }}
                >
                  <span
                    style={{
                      position: 'absolute',
                      top: -9,
                      right: 8,
                      background: '#C71B4D',
                      color: '#ffffff',
                      fontSize: 8.5,
                      fontWeight: 900,
                      padding: '1px 7px',
                      borderRadius: 'var(--radius-full)',
                      letterSpacing: '0.04em',
                    }}
                  >
                    BEST OFFER ⭐
                  </span>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 3 }}>
                    <span style={{ fontFamily: 'var(--font-display)', fontSize: 16, fontWeight: 800, color: selectedUpsellTier === 'tier2' ? '#F7EAEF' : '#fff' }}>
                      +₹{upgradeOffers.tier2.fee}
                    </span>
                    {selectedUpsellTier === 'tier2' && <CheckCircle2 size={14} color="#C71B4D" />}
                  </div>
                  <div style={{ fontSize: 11, fontFamily: 'var(--font-mono)', fontWeight: 700, color: '#fff' }}>
                    {upgradeOffers.tier2.title.split(' · ')[1]}
                  </div>
                  <div style={{ fontSize: 9, fontFamily: 'var(--font-mono)', color: 'rgba(255, 255, 255, 0.65)', marginTop: 2 }}>
                    {upgradeOffers.tier2.desc}
                  </div>
                </button>
              </div>

              {/* Payment Method Switcher (Razorpay vs Direct UPI vs Cash) */}
              <div style={{ display: 'grid', gridTemplateColumns: '1.2fr 1fr 1fr', gap: 6, marginBottom: 14 }}>
                <button
                  type="button"
                  onClick={() => setUpsellPaymentMethod('razorpay')}
                  style={{
                    padding: '7px 8px',
                    borderRadius: 'var(--radius-full)',
                    border: upsellPaymentMethod === 'razorpay' ? '2px solid #C71B4D' : '1.5px solid rgba(255,255,255,0.15)',
                    background: upsellPaymentMethod === 'razorpay' ? 'rgba(199, 27, 77, 0.28)' : 'transparent',
                    color: upsellPaymentMethod === 'razorpay' ? '#FFF' : 'rgba(255,255,255,0.65)',
                    fontFamily: 'var(--font-mono)',
                    fontSize: 10.5,
                    fontWeight: 800,
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: 5,
                  }}
                >
                  <Sparkles size={12} color="#C71B4D" />
                  <span>⚡ RAZORPAY</span>
                </button>
                <button
                  type="button"
                  onClick={() => setUpsellPaymentMethod('upi')}
                  style={{
                    padding: '7px 8px',
                    borderRadius: 'var(--radius-full)',
                    border: upsellPaymentMethod === 'upi' ? '2px solid #C71B4D' : '1.5px solid rgba(255,255,255,0.15)',
                    background: upsellPaymentMethod === 'upi' ? 'rgba(199, 27, 77, 0.28)' : 'transparent',
                    color: upsellPaymentMethod === 'upi' ? '#FFF' : 'rgba(255,255,255,0.65)',
                    fontFamily: 'var(--font-mono)',
                    fontSize: 10.5,
                    fontWeight: 800,
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: 5,
                  }}
                >
                  <QrCode size={12} />
                  <span>DIRECT UPI</span>
                </button>
                <button
                  type="button"
                  onClick={() => setUpsellPaymentMethod('cash')}
                  style={{
                    padding: '7px 8px',
                    borderRadius: 'var(--radius-full)',
                    border: upsellPaymentMethod === 'cash' ? '2px solid #C71B4D' : '1.5px solid rgba(255,255,255,0.15)',
                    background: upsellPaymentMethod === 'cash' ? 'rgba(199, 27, 77, 0.28)' : 'transparent',
                    color: upsellPaymentMethod === 'cash' ? '#FFF' : 'rgba(255,255,255,0.65)',
                    fontFamily: 'var(--font-mono)',
                    fontSize: 10.5,
                    fontWeight: 800,
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: 5,
                  }}
                >
                  <span>💵 CASH</span>
                </button>
              </div>

              {/* Payment Mode Body */}
              {upsellPaymentMethod === 'razorpay' ? (
                <div
                  style={{
                    background: '#FFFFFF',
                    borderRadius: 'var(--radius-lg)',
                    padding: '16px 14px',
                    display: 'flex',
                    flexDirection: 'column',
                    alignItems: 'center',
                    boxShadow: '0 8px 24px rgba(0, 0, 0, 0.5)',
                    marginBottom: 16,
                    gap: 10,
                    textAlign: 'center',
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <span style={{ fontSize: 13, fontFamily: 'var(--font-mono)', fontWeight: 800, color: '#111827' }}>
                      Auto-Verified Instant Payment
                    </span>
                    <span style={{ fontSize: 9, fontFamily: 'var(--font-mono)', background: 'rgba(22, 163, 74, 0.12)', color: '#16a34a', padding: '2px 8px', borderRadius: 12, fontWeight: 800 }}>
                      ✓ 100% SECURE
                    </span>
                  </div>

                  <p style={{ fontSize: 11, fontFamily: 'var(--font-mono)', color: '#4b5563', margin: 0, lineHeight: 1.4 }}>
                    Tap below to open Razorpay modal. Pay via <strong>Dynamic UPI QR, GPay, PhonePe, Paytm, or Card</strong>. Signature is automatically verified by the server!
                  </p>

                  <button
                    type="button"
                    onClick={() => {
                      openRazorpayCheckout({
                        amount: currentUpgrade.fee,
                        description: `Upgrade to ${currentUpgrade.title} (Ticket #${ticketNumber})`,
                        ticketId: session?.ticketId,
                        planType: currentUpgrade.targetPlan,
                        onSuccess: (paymentResp) => {
                          setShowUpsellModal(false)
                          toast(`Payment verified! ID: ${paymentResp.razorpay_payment_id}`, 'success')
                          handleConfirmUpgrade(currentUpgrade.targetPlan, 'UPI')
                        },
                        onFailure: (err) => {
                          toast(`Payment declined: ${err.message}`, 'error')
                        },
                        onDismiss: () => {
                          toast('Payment cancelled. You can retry or pay with Cash.', 'info')
                        },
                      })
                    }}
                    style={{
                      width: '100%',
                      background: 'linear-gradient(90deg, #6D0626 0%, #9E103A 100%)',
                      color: '#ffffff',
                      border: 'none',
                      borderRadius: 'var(--radius-full)',
                      padding: '12px 16px',
                      fontFamily: 'var(--font-mono)',
                      fontSize: 12.5,
                      fontWeight: 900,
                      letterSpacing: '0.03em',
                      cursor: 'pointer',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      gap: 8,
                      boxShadow: '0 4px 16px rgba(109, 6, 38, 0.35)',
                    }}
                  >
                    <Sparkles size={15} />
                    <span>⚡ PAY ₹{currentUpgrade.fee} VIA RAZORPAY NOW →</span>
                  </button>

                  <span style={{ fontSize: 9, fontFamily: 'var(--font-mono)', color: '#6b7280' }}>
                    Payment Handle: <strong style={{ color: 'var(--color-brand)' }}>razorpay.me/@purabsohiltailor</strong>
                  </span>
                </div>
              ) : upsellPaymentMethod === 'upi' ? (
                <div
                  style={{
                    background: '#FFFFFF',
                    borderRadius: 'var(--radius-lg)',
                    padding: '12px 14px',
                    display: 'inline-flex',
                    flexDirection: 'column',
                    alignItems: 'center',
                    boxShadow: '0 8px 24px rgba(0, 0, 0, 0.5)',
                    marginBottom: 16,
                  }}
                >
                  <QRCodeSVG
                    value={upgradeUpiUrl}
                    size={135}
                    level="M"
                    includeMargin={false}
                  />
                  <div style={{ marginTop: 6, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2 }}>
                    <span style={{ fontSize: 11, fontFamily: 'var(--font-mono)', fontWeight: 800, color: '#111827', letterSpacing: '0.02em' }}>
                      SCAN &amp; PAY &#8377;{currentUpgrade.fee}/-
                    </span>
                    <span style={{ fontSize: 9, fontFamily: 'var(--font-mono)', color: '#4b5563' }}>
                      GPay &middot; PhonePe &middot; Paytm &middot; Any UPI
                    </span>
                    <span style={{ fontSize: 8.5, fontFamily: 'var(--font-mono)', color: 'var(--color-brand)', fontWeight: 700 }}>
                      9313780044@superyes
                    </span>
                  </div>
                </div>
              ) : (
                <div
                  style={{
                    background: '#FFFFFF',
                    borderRadius: 'var(--radius-lg)',
                    padding: '18px 16px',
                    display: 'flex',
                    flexDirection: 'column',
                    alignItems: 'center',
                    boxShadow: '0 8px 24px rgba(0, 0, 0, 0.5)',
                    marginBottom: 16,
                    gap: 8,
                  }}
                >
                  <div style={{ width: 44, height: 44, borderRadius: '50%', background: 'rgba(109, 6, 38, 0.1)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    <span style={{ fontSize: 22 }}>💵</span>
                  </div>
                  <span style={{ fontSize: 13, fontFamily: 'var(--font-display)', fontWeight: 800, color: '#111827' }}>
                    Pay &#8377;{currentUpgrade.fee} Cash to Attendant
                  </span>
                  <p style={{ fontSize: 10.5, fontFamily: 'var(--font-mono)', color: '#4b5563', margin: 0 }}>
                    Please hand &#8377;{currentUpgrade.fee}/- cash to the counter operator or photobooth attendant.
                  </p>
                </div>
              )}

              {/* Action Buttons */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {upsellPaymentMethod !== 'razorpay' && (
                  <button
                    onClick={() => {
                      setShowUpsellModal(false)
                      handleConfirmUpgrade(undefined, upsellPaymentMethod === 'cash' ? 'CASH' : 'UPI')
                    }}
                    className="btn btn-primary"
                    style={{
                      height: 48,
                      borderRadius: 'var(--radius-full)',
                      fontFamily: 'var(--font-mono)',
                      fontSize: 12.5,
                      fontWeight: 800,
                      letterSpacing: '0.03em',
                      background: 'linear-gradient(90deg, #6D0626 0%, #9E103A 100%)',
                      boxShadow: '0 6px 20px rgba(109, 6, 38, 0.5)',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      gap: 6,
                      color: '#fff',
                      border: 'none',
                      cursor: 'pointer',
                    }}
                  >
                    <Sparkles size={16} />
                    <span>
                      {upsellPaymentMethod === 'cash'
                        ? `CONFIRM CASH PAID (₹${currentUpgrade.fee}) → UNLOCK & PRINT`
                        : `I HAVE PAID ₹${currentUpgrade.fee} VIA UPI → UNLOCK & PRINT`}
                    </span>
                  </button>
                )}

                <button
                  onClick={handlePrintOnlyPaidStrips}
                  className="btn btn-ghost"
                  style={{
                    height: 40,
                    borderRadius: 'var(--radius-full)',
                    fontFamily: 'var(--font-mono)',
                    fontSize: 11,
                    color: 'rgba(255, 255, 255, 0.85)',
                    border: '1px solid rgba(255, 255, 255, 0.2)',
                    cursor: 'pointer',
                  }}
                >
                  No thanks, print my chosen {selectedStripIndices.length} strips
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  )
}

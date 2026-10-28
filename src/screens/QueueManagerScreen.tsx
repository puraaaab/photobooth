import React, { useState, useEffect, useMemo } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import {
  Ticket as TicketIcon,
  Users,
  Camera,
  Printer,
  CheckCircle2,
  Clock,
  Plus,
  RefreshCw,
  Search,
  Trash2,
  ArrowRight,
  ExternalLink,
  Copy,
  Check,
  AlertTriangle,
  QrCode,
  X,
  Phone,
  User,
  Sparkles,
  Monitor,
  IndianRupee,
  Banknote,
  Receipt,
  Download,
  AlertCircle,
  Star,
  Folder
} from 'lucide-react'
import { QRCodeSVG } from 'qrcode.react'
import { useQueueStore } from '@/store/queueStore'
import { useConnectionStore } from '@/store/connectionStore'
import type { Ticket, TicketStatus, TicketPlan } from '@/types'
import { openRazorpayCheckout } from '@/utils/razorpay'

export const TICKET_PRICE = 99
export const UPI_ID = '9313780044@superyes'
export const UPI_PAYEE_NAME = 'Photobooth Studio'

// Ticket Plans
export const TICKET_PLANS: { plan: TicketPlan; strips: number; label: string; paperLabel: string; desc: string; badge?: string }[] = [
  { plan: 99,  strips: 2, label: '₹99',  paperLabel: 'A5 Paper',    desc: '2 Photo Strips · A5 Paper',     badge: 'POPULAR' },
  { plan: 149, strips: 3, label: '₹149', paperLabel: 'A4 · 5-up',   desc: '3 Photo Strips · A4 5-up Sheet' },
  { plan: 179, strips: 5, label: '₹179', paperLabel: 'A4 · 5-up',   desc: '5 Photo Strips · A4 5-up Sheet', badge: 'BEST VALUE' },
]

export function getUpiPaymentUrl(code: string, amount: number = 99): string {
  const cleanCode = code.replace(/^#/, '').trim()
  const note = encodeURIComponent(`Photobooth Pass #${cleanCode}`)
  const pn = encodeURIComponent(UPI_PAYEE_NAME)
  return `upi://pay?pa=${UPI_ID}&pn=${pn}&am=${amount}&cu=INR&tn=${note}`
}

interface QueueManagerScreenProps {
  onSwitchToKiosk?: () => void
}

const STATUS_CONFIG: Record<TicketStatus, { label: string; color: string; bg: string; border: string }> = {
  WAITING: {
    label: 'Waiting in Queue',
    color: '#b45309',
    bg: 'rgba(180, 83, 9, 0.12)',
    border: 'rgba(180, 83, 9, 0.35)',
  },
  IN_BOOTH: {
    label: 'Inside Booth',
    color: '#0284c7',
    bg: 'rgba(2, 132, 199, 0.12)',
    border: 'rgba(2, 132, 199, 0.35)',
  },
  EDITING: {
    label: 'Editing & Strips',
    color: '#9333ea',
    bg: 'rgba(147, 51, 234, 0.12)',
    border: 'rgba(147, 51, 234, 0.35)',
  },
  PRINTING: {
    label: 'Printing Strips',
    color: '#0d9488',
    bg: 'rgba(13, 148, 136, 0.12)',
    border: 'rgba(13, 148, 136, 0.35)',
  },
  COMPLETED: {
    label: 'Completed',
    color: '#16a34a',
    bg: 'rgba(22, 163, 74, 0.12)',
    border: 'rgba(22, 163, 74, 0.35)',
  },
  CANCELLED: {
    label: 'Void / Cancelled',
    color: '#dc2626',
    bg: 'rgba(220, 38, 38, 0.12)',
    border: 'rgba(220, 38, 38, 0.35)',
  },
}

function formatElapsed(dateString: string): string {
  const diffSec = Math.max(0, Math.floor((Date.now() - new Date(dateString).getTime()) / 1000))
  if (diffSec < 60) return `${diffSec}s ago`
  const min = Math.floor(diffSec / 60)
  if (min < 60) return `${min}m ago`
  const hours = Math.floor(min / 60)
  return `${hours}h ${min % 60}m ago`
}

export function QueueManagerScreen({ onSwitchToKiosk }: QueueManagerScreenProps) {
  const {
    tickets,
    nextCode,
    isLoading,
    fetchTickets,
    issueTicket,
    updateTicketStatus,
    updateTicketPayment,
    deleteTicket,
    resetQueue,
  } = useQueueStore()

  const { socket, server } = useConnectionStore()

  // Form state
  const [customerName, setCustomerName] = useState('')
  const [customerPhone, setCustomerPhone] = useState('')
  const [notes, setNotes] = useState('')
  const [customCode, setCustomCode] = useState('')
  const [useCustomCode, setUseCustomCode] = useState(false)
  const [selectedPlan, setSelectedPlan] = useState<TicketPlan>(99)

  // Payment flow state
  const [paymentMethod, setPaymentMethod] = useState<'UPI' | 'CASH'>('UPI')
  const [showUpiModal, setShowUpiModal] = useState(false)
  const [pendingTicketData, setPendingTicketData] = useState<{
    customerName?: string
    customerPhone?: string
    notes?: string
    code: string
    planType: TicketPlan
  } | null>(null)
  const [cashCollectionModal, setCashCollectionModal] = useState<Ticket | null>(null)
  const [showFinancialLedgerModal, setShowFinancialLedgerModal] = useState(false)
  const [ledgerFilter, setLedgerFilter] = useState<'ALL' | 'UPI' | 'CASH' | 'PENDING'>('ALL')
  const [ledgerSearchQuery, setLedgerSearchQuery] = useState('')
  const [copiedUpiId, setCopiedUpiId] = useState(false)
  const [upiTxnRef, setUpiTxnRef] = useState('')
  const [isConfirmingPayment, setIsConfirmingPayment] = useState(false)

  // Filter & Search
  const [filterTab, setFilterTab] = useState<'ALL' | 'WAITING' | 'ACTIVE' | 'COMPLETED'>('ALL')
  const [searchQuery, setSearchQuery] = useState('')

  // Modals
  const [issuedTicketModal, setIssuedTicketModal] = useState<Ticket | null>(null)
  const [showResetConfirm, setShowResetConfirm] = useState(false)
  const [copiedUrl, setCopiedUrl] = useState(false)

  // Polling fallback to keep times fresh
  useEffect(() => {
    fetchTickets()
    const timer = setInterval(() => {
      // Re-render elapsed times
      useQueueStore.getState().fetchTickets()
    }, 10000)
    return () => clearInterval(timer)
  }, [fetchTickets])

  // Stats calculation
  const stats = useMemo(() => {
    const waiting = tickets.filter(t => t.status === 'WAITING').length
    const inBooth = tickets.filter(t => t.status === 'IN_BOOTH').length
    const editing = tickets.filter(t => t.status === 'EDITING' || t.status === 'PRINTING').length
    const completed = tickets.filter(t => t.status === 'COMPLETED').length
    const estWaitMins = waiting * 3 // ~3 minutes per group
    return { waiting, inBooth, editing, completed, estWaitMins }
  }, [tickets])

  // Financial Revenue & Ledger calculation
  const financialStats = useMemo(() => {
    let totalCollected = 0
    let totalUpi = 0
    let totalCash = 0
    let pendingCash = 0
    let upiCount = 0
    let cashCount = 0
    let pendingCashCount = 0
    let totalPaidCount = 0

    tickets.forEach(t => {
      const amount = t.paymentAmount ?? t.planType ?? 99
      if (t.paymentStatus === 'PAID') {
        totalCollected += amount
        totalPaidCount++
        if (t.paymentMethod === 'UPI') {
          totalUpi += amount
          upiCount++
        } else if (t.paymentMethod === 'CASH') {
          totalCash += amount
          cashCount++
        } else {
          totalUpi += amount
          upiCount++
        }
      } else if (t.paymentMethod === 'CASH' && (t.paymentStatus === 'PENDING' || !t.paymentStatus)) {
        pendingCash += amount
        pendingCashCount++
      }
    })

    return {
      totalCollected,
      totalUpi,
      totalCash,
      pendingCash,
      upiCount,
      cashCount,
      pendingCashCount,
      totalPaidCount,
    }
  }, [tickets])

  // Filtered tickets
  const filteredTickets = useMemo(() => {
    return tickets.filter(t => {
      // Tab filter
      if (filterTab === 'WAITING' && t.status !== 'WAITING') return false
      if (filterTab === 'ACTIVE' && t.status !== 'IN_BOOTH' && t.status !== 'EDITING' && t.status !== 'PRINTING') return false
      if (filterTab === 'COMPLETED' && t.status !== 'COMPLETED' && t.status !== 'CANCELLED') return false

      // Query filter
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase().trim()
        const matchCode = t.code.toLowerCase().includes(q)
        const matchName = t.customerName?.toLowerCase().includes(q)
        const matchPhone = t.customerPhone?.toLowerCase().includes(q)
        return matchCode || matchName || matchPhone
      }
      return true
    })
  }, [tickets, filterTab, searchQuery])

  // Filtered Ledger Tickets
  const filteredLedgerTickets = useMemo(() => {
    return tickets.filter(t => {
      if (ledgerFilter === 'UPI' && (t.paymentMethod !== 'UPI' || t.paymentStatus !== 'PAID')) return false
      if (ledgerFilter === 'CASH' && (t.paymentMethod !== 'CASH' || t.paymentStatus !== 'PAID')) return false
      if (ledgerFilter === 'PENDING' && !(t.paymentMethod === 'CASH' && t.paymentStatus === 'PENDING')) return false

      if (ledgerSearchQuery.trim()) {
        const q = ledgerSearchQuery.toLowerCase().trim()
        const matchCode = t.code.toLowerCase().includes(q)
        const matchName = t.customerName?.toLowerCase().includes(q)
        const matchPhone = t.customerPhone?.toLowerCase().includes(q)
        const matchMethod = (t.paymentMethod || '').toLowerCase().includes(q)
        return matchCode || matchName || matchPhone || matchMethod
      }
      return true
    })
  }, [tickets, ledgerFilter, ledgerSearchQuery])

  // Handle Form Submit
  const handleIssueTicket = async (e: React.FormEvent) => {
    e.preventDefault()

    // ── Input Validations ──
    const digitsOnly = customerPhone.replace(/\D/g, '')
    if (digitsOnly.length > 0 && digitsOnly.length !== 10) {
      alert(`Please enter a valid 10-digit mobile number (${digitsOnly.length}/10 digits entered), or leave it empty.`)
      return
    }

    if (useCustomCode) {
      if (customCode.length !== 4) {
        alert('Custom ticket code must be exactly 4 numeric digits (e.g. 7788).')
        return
      }
      if (isCustomCodeTaken) {
        alert(`Ticket code #${customCode} is already assigned to an active guest in the queue. Please choose a different code.`)
        return
      }
    }

    const targetCode = useCustomCode && customCode.trim() ? customCode.trim() : (nextCode || '1001')

    if (paymentMethod === 'UPI') {
      // Step 1 for UPI: Show the QR code modal for guest to scan
      setPendingTicketData({
        customerName: customerName.trim() || undefined,
        customerPhone: digitsOnly || undefined,
        notes: notes.trim() || undefined,
        code: targetCode,
        planType: selectedPlan,
      })
      setShowUpiModal(true)
      return
    }

    // Step for CASH: Create the ticket FIRST!
    const createdTicket = await issueTicket({
      customerName: customerName.trim() || undefined,
      customerPhone: customerPhone.trim() || undefined,
      notes: notes.trim() || undefined,
      code: targetCode,
      paymentMethod: 'CASH',
      paymentAmount: selectedPlan,
      paymentStatus: 'PENDING',
      planType: selectedPlan,
    })

    // Reset inputs
    setCustomerName('')
    setCustomerPhone('')
    setNotes('')
    setCustomCode('')
    setUseCustomCode(false)

    // Open cash collection modal
    setCashCollectionModal(createdTicket)
  }

  // Confirm UPI payment and issue ticket
  const handleConfirmUpiPayment = async () => {
    if (!pendingTicketData) return
    setIsConfirmingPayment(true)
    try {
      const ticket = await issueTicket({
        customerName: pendingTicketData.customerName,
        customerPhone: pendingTicketData.customerPhone,
        notes: pendingTicketData.notes,
        code: pendingTicketData.code,
        paymentMethod: 'UPI',
        paymentAmount: pendingTicketData.planType,
        paymentStatus: 'PAID',
        paidAt: new Date().toISOString(),
        upiTransactionRef: upiTxnRef.trim() || undefined,
        planType: pendingTicketData.planType,
      })

      // Reset inputs
      setCustomerName('')
      setCustomerPhone('')
      setNotes('')
      setCustomCode('')
      setUseCustomCode(false)
      setUpiTxnRef('')
      setPendingTicketData(null)
      setShowUpiModal(false)

      // Open ticket pass modal
      setIssuedTicketModal(ticket)
    } finally {
      setIsConfirmingPayment(false)
    }
  }

  // Confirm Cash payment received
  const handleConfirmCashCollected = async (ticket: Ticket) => {
    setIsConfirmingPayment(true)
    const amountToCollect = ticket.paymentAmount ?? ticket.planType ?? 99
    try {
      const updated = await updateTicketPayment(ticket.id, {
        paymentStatus: 'PAID',
        paymentMethod: 'CASH',
        paymentAmount: amountToCollect,
        planType: ticket.planType,
        paidAt: new Date().toISOString(),
      })
      setCashCollectionModal(null)
      if (updated) {
        setIssuedTicketModal(updated)
      } else {
        setIssuedTicketModal({
          ...ticket,
          paymentStatus: 'PAID',
          paymentMethod: 'CASH',
          paymentAmount: amountToCollect,
          paidAt: new Date().toISOString(),
        })
      }
    } finally {
      setIsConfirmingPayment(false)
    }
  }

  // Copy UPI ID helper
  const copyUpiId = () => {
    if (navigator.clipboard) {
      navigator.clipboard.writeText(UPI_ID)
      setCopiedUpiId(true)
      setTimeout(() => setCopiedUpiId(false), 2000)
    }
  }

  // Open Ticket Media Folder in Windows Explorer
  const openTicketFolder = async (ticketCode: string) => {
    try {
      await fetch(`/api/tickets/${ticketCode}/open-folder`, { method: 'POST' })
    } catch (e) {
      console.warn('Failed opening ticket folder:', e)
    }
  }

  // Live validation checks
  const isCustomCodeTaken = useCustomCode && customCode.length === 4 && tickets.some(
    t => t.code === customCode && (t.status === 'WAITING' || t.status === 'IN_BOOTH' || t.status === 'EDITING')
  )
  const isCustomCodeIncomplete = useCustomCode && customCode.length > 0 && customCode.length < 4
  const phoneDigits = customerPhone.replace(/\D/g, '')
  const isPhoneIncomplete = phoneDigits.length > 0 && phoneDigits.length < 10
  const isPhoneValid = phoneDigits.length === 10
  const isPhoneInvalid = isPhoneIncomplete
  const isFormInvalid = isPhoneIncomplete || isCustomCodeTaken || (useCustomCode && customCode.length !== 4)

  // Export ledger to CSV
  const exportLedgerCsv = () => {
    const headers = [
      'Ticket ID',
      'Ticket Code',
      'Guest Name',
      'Phone',
      'Payment Method',
      'Amount (INR)',
      'Payment Status',
      'Created At',
      'Paid At',
      'Queue Status',
      'Notes'
    ]
    const rows = tickets.map(t => [
      t.id,
      t.code,
      `"${(t.customerName || 'Walk-in').replace(/"/g, '""')}"`,
      `"${(t.customerPhone || '').replace(/"/g, '""')}"`,
      t.paymentMethod || 'UPI',
      t.paymentAmount ?? t.planType ?? 99,
      t.paymentStatus || (t.paymentMethod === 'CASH' ? 'PENDING' : 'PAID'),
      t.createdAt,
      t.paidAt || '',
      t.status,
      `"${(t.notes || '').replace(/"/g, '""')}"`
    ])
    const csvContent = 'data:text/csv;charset=utf-8,' + [headers.join(','), ...rows.map(e => e.join(','))].join('\n')
    const encodedUri = encodeURI(csvContent)
    const link = document.createElement('a')
    link.setAttribute('href', encodedUri)
    link.setAttribute('download', `Photobooth_Payments_${new Date().toISOString().slice(0, 10)}.csv`)
    document.body.appendChild(link)
    link.click()
    document.body.removeChild(link)
  }

  const lanQueueUrl = typeof window !== 'undefined'
    ? `${window.location.protocol}//${window.location.hostname}:5173/?view=queue`
    : 'http://localhost:5173/?view=queue'

  const copyLanUrl = () => {
    if (navigator.clipboard) {
      navigator.clipboard.writeText(lanQueueUrl)
      setCopiedUrl(true)
      setTimeout(() => setCopiedUrl(false), 2000)
    }
  }

  return (
    <div
      className="qm-root"
      style={{
        display: 'flex',
        flexDirection: 'column',
        height: '100vh',
        width: '100vw',
        background: 'var(--color-bg, #F7F1EA)',
        color: 'var(--color-text, #2B0510)',
        fontFamily: 'var(--font-primary)',
        overflow: 'hidden',
        userSelect: 'none',
      }}
    >
      {/* ─── Top Operator Navigation Header ──────────────────────────────────── */}
      <header
        className="qm-header"
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '12px 24px',
          background: 'var(--color-card, #FFFFFF)',
          borderBottom: '1px solid var(--color-border-subtle)',
          flexShrink: 0,
          zIndex: 10,
          boxShadow: '0 2px 8px rgba(109, 6, 38, 0.05)',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
          <div
            style={{
              width: 38,
              height: 38,
              borderRadius: 'var(--radius-md)',
              background: 'var(--color-brand)',
              border: '1px solid rgba(109, 6, 38, 0.3)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <TicketIcon size={20} color="#F7F1EA" />
          </div>
          <div>
            <h1
              style={{
                fontFamily: 'var(--font-display)',
                fontSize: 16,
                fontWeight: 700,
                letterSpacing: '0.04em',
                lineHeight: 1.2,
                display: 'flex',
                alignItems: 'center',
                gap: 8,
              }}
            >
              <span>STATION A • QUEUE & TICKET CONTROLLER</span>
              <span
                style={{
                  fontSize: 10,
                  fontFamily: 'var(--font-mono)',
                  color: 'var(--color-brand)',
                  background: 'rgba(109, 6, 38, 0.1)',
                  padding: '2px 8px',
                  borderRadius: 'var(--radius-full)',
                  border: '1px solid rgba(109, 6, 38, 0.25)',
                  fontWeight: 700,
                }}
              >
                LIVE SYNC
              </span>
            </h1>
            <p
              style={{
                fontSize: 11,
                fontFamily: 'var(--font-mono)',
                color: 'var(--color-text-tertiary)',
                margin: 0,
              }}
            >
              Issues 4-digit codes & isolates customer photo sessions with zero overlap
            </p>
          </div>
        </div>

        {/* Center / Right controls */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          {/* LAN Access badge */}
          <button
            onClick={copyLanUrl}
            className="btn btn-ghost btn-sm"
            title="Click to copy iPad / tablet remote access URL"
            style={{
              fontSize: 11,
              fontFamily: 'var(--font-mono)',
              color: 'var(--color-brand)',
              fontWeight: 700,
              background: 'rgba(109, 6, 38, 0.08)',
              border: '1px solid rgba(109, 6, 38, 0.22)',
              borderRadius: 'var(--radius-full)',
              padding: '6px 14px',
              display: 'flex',
              alignItems: 'center',
              gap: 8,
            }}
          >
            {copiedUrl ? <Check size={12} color="var(--color-success)" /> : <ExternalLink size={12} color="var(--color-brand)" />}
            <span>Remote Tablet URL: {window.location.hostname}:5173/?view=queue</span>
            {copiedUrl && <span style={{ color: 'var(--color-success)' }}>Copied!</span>}
          </button>

          {/* Connection status indicator */}
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 6,
              fontSize: 11,
              fontFamily: 'var(--font-mono)',
              color: 'var(--color-text-tertiary)',
              padding: '6px 12px',
              borderRadius: 'var(--radius-full)',
              background: 'var(--color-bg-base)',
              border: '1px solid var(--color-border-subtle)',
            }}
          >
            <div
              style={{
                width: 7,
                height: 7,
                borderRadius: '50%',
                background: socket.connected ? 'var(--color-success)' : 'var(--color-brand)',
                boxShadow: socket.connected ? '0 0 8px rgba(74, 222, 128, 0.6)' : 'none',
              }}
            />
            <span>{socket.connected ? 'Server Connected' : 'Offline Mode'}</span>
          </div>

          {/* Financial Ledger Modal Button */}
          <button
            onClick={() => setShowFinancialLedgerModal(true)}
            className="btn btn-secondary btn-sm"
            title="Open comprehensive payment ledger & transactions"
            style={{
              borderRadius: 'var(--radius-full)',
              fontFamily: 'var(--font-mono)',
              fontSize: 12,
              fontWeight: 700,
              display: 'flex',
              alignItems: 'center',
              gap: 6,
              padding: '8px 16px',
              background: 'rgba(22, 163, 74, 0.08)',
              color: '#16a34a',
              border: '1.5px solid rgba(22, 163, 74, 0.35)',
            }}
          >
            <Receipt size={14} color="#16a34a" />
            <span>Ledger: ₹{financialStats.totalCollected}</span>
          </button>

          {/* Switch to Kiosk Display button */}
          {onSwitchToKiosk && (
            <button
              onClick={onSwitchToKiosk}
              className="btn btn-secondary btn-sm"
              style={{
                borderRadius: 'var(--radius-full)',
                fontFamily: 'var(--font-mono)',
                fontSize: 12,
                display: 'flex',
                alignItems: 'center',
                gap: 6,
                padding: '8px 16px',
              }}
            >
              <Monitor size={14} />
              <span>Open Kiosk Mode</span>
            </button>
          )}

          {/* Reset Queue */}
          <button
            onClick={() => setShowResetConfirm(true)}
            className="btn btn-ghost btn-sm"
            title="Reset active ticket queue"
            style={{
              color: '#ef4444',
              fontFamily: 'var(--font-mono)',
              fontSize: 11,
              padding: '6px 10px',
            }}
          >
            Reset
          </button>
        </div>
      </header>

      {/* ─── Top Metric KPI Cards ────────────────────────────────────────────── */}
      <div
        className="qm-kpi-grid"
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(5, 1fr)',
          gap: 14,
          padding: '16px 24px',
          background: 'rgba(109, 6, 38, 0.04)',
          borderBottom: '1px solid var(--color-border-subtle)',
          flexShrink: 0,
        }}
      >
        {/* Waiting Card */}
        <div
          style={{
            background: 'var(--color-card)',
            border: '1.5px solid rgba(180, 83, 9, 0.3)',
            borderRadius: 'var(--radius-lg)',
            padding: '12px 16px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            boxShadow: '0 4px 16px rgba(109, 6, 38, 0.05)',
          }}
        >
          <div>
            <span style={{ fontSize: 11, fontFamily: 'var(--font-mono)', color: 'var(--color-text-secondary)', textTransform: 'uppercase', fontWeight: 700 }}>
              Waiting in Queue
            </span>
            <div style={{ display: 'flex', alignItems: 'baseline', gap: 6, marginTop: 4 }}>
              <span style={{ fontSize: 24, fontFamily: 'var(--font-display)', fontWeight: 800, color: '#b45309' }}>
                {stats.waiting}
              </span>
              <span style={{ fontSize: 11, fontFamily: 'var(--font-mono)', color: 'var(--color-text-tertiary)' }}>
                ~{stats.estWaitMins}m wait
              </span>
            </div>
          </div>
          <div style={{ width: 38, height: 38, borderRadius: '50%', background: 'rgba(180, 83, 9, 0.12)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <Users size={18} color="#b45309" />
          </div>
        </div>

        {/* In Booth Card */}
        <div
          style={{
            background: 'var(--color-card)',
            border: '1.5px solid rgba(2, 132, 199, 0.3)',
            borderRadius: 'var(--radius-lg)',
            padding: '12px 16px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            boxShadow: '0 4px 16px rgba(109, 6, 38, 0.05)',
          }}
        >
          <div>
            <span style={{ fontSize: 11, fontFamily: 'var(--font-mono)', color: 'var(--color-text-secondary)', textTransform: 'uppercase', fontWeight: 700 }}>
              Inside Booth
            </span>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 4 }}>
              <span style={{ fontSize: 24, fontFamily: 'var(--font-display)', fontWeight: 800, color: '#0284c7' }}>
                {stats.inBooth}
              </span>
              {stats.inBooth > 0 && (
                <span className="animate-pulse" style={{ fontSize: 10, fontFamily: 'var(--font-mono)', color: '#0284c7', background: 'rgba(2, 132, 199, 0.15)', padding: '2px 6px', borderRadius: 4, fontWeight: 700 }}>
                  ● LIVE
                </span>
              )}
            </div>
          </div>
          <div style={{ width: 38, height: 38, borderRadius: '50%', background: 'rgba(2, 132, 199, 0.12)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <Camera size={18} color="#0284c7" />
          </div>
        </div>

        {/* Editing / Printing Card */}
        <div
          style={{
            background: 'var(--color-card)',
            border: '1.5px solid rgba(147, 51, 234, 0.3)',
            borderRadius: 'var(--radius-lg)',
            padding: '12px 16px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            boxShadow: '0 4px 16px rgba(109, 6, 38, 0.05)',
          }}
        >
          <div>
            <span style={{ fontSize: 11, fontFamily: 'var(--font-mono)', color: 'var(--color-text-secondary)', textTransform: 'uppercase', fontWeight: 700 }}>
              Designing & Prints
            </span>
            <div style={{ display: 'flex', alignItems: 'baseline', gap: 6, marginTop: 4 }}>
              <span style={{ fontSize: 24, fontFamily: 'var(--font-display)', fontWeight: 800, color: '#9333ea' }}>
                {stats.editing}
              </span>
              <span style={{ fontSize: 11, fontFamily: 'var(--font-mono)', color: 'var(--color-text-tertiary)' }}>
                in editor
              </span>
            </div>
          </div>
          <div style={{ width: 38, height: 38, borderRadius: '50%', background: 'rgba(147, 51, 234, 0.12)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <Printer size={18} color="#9333ea" />
          </div>
        </div>

        {/* Completed Card */}
        <div
          style={{
            background: 'var(--color-card)',
            border: '1.5px solid rgba(22, 163, 74, 0.3)',
            borderRadius: 'var(--radius-lg)',
            padding: '12px 16px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            boxShadow: '0 4px 16px rgba(109, 6, 38, 0.05)',
          }}
        >
          <div>
            <span style={{ fontSize: 11, fontFamily: 'var(--font-mono)', color: 'var(--color-text-secondary)', textTransform: 'uppercase', fontWeight: 700 }}>
              Completed
            </span>
            <div style={{ display: 'flex', alignItems: 'baseline', gap: 6, marginTop: 4 }}>
              <span style={{ fontSize: 24, fontFamily: 'var(--font-display)', fontWeight: 800, color: '#16a34a' }}>
                {stats.completed}
              </span>
              <span style={{ fontSize: 11, fontFamily: 'var(--font-mono)', color: 'var(--color-text-tertiary)' }}>
                finished
              </span>
            </div>
          </div>
          <div style={{ width: 38, height: 38, borderRadius: '50%', background: 'rgba(22, 163, 74, 0.12)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <CheckCircle2 size={18} color="#16a34a" />
          </div>
        </div>

        {/* Total Revenue & Collections KPI Card */}
        <div
          onClick={() => setShowFinancialLedgerModal(true)}
          style={{
            background: 'var(--color-card)',
            border: '1.5px solid rgba(22, 163, 74, 0.35)',
            borderRadius: 'var(--radius-lg)',
            padding: '12px 16px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            boxShadow: '0 4px 16px rgba(22, 163, 74, 0.08)',
            cursor: 'pointer',
            transition: 'all 0.15s ease',
          }}
          title="Click to view complete payment ledger and transactions"
        >
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <span style={{ fontSize: 11, fontFamily: 'var(--font-mono)', color: 'var(--color-text-secondary)', textTransform: 'uppercase', fontWeight: 700 }}>
                Total Revenue
              </span>
              <span style={{ fontSize: 9, fontFamily: 'var(--font-mono)', color: '#16a34a', background: 'rgba(22, 163, 74, 0.12)', padding: '1px 6px', borderRadius: 4, fontWeight: 800 }}>
                VIEW LEDGER
              </span>
            </div>
            <div style={{ display: 'flex', alignItems: 'baseline', gap: 6, marginTop: 4 }}>
              <span style={{ fontSize: 24, fontFamily: 'var(--font-display)', fontWeight: 800, color: '#16a34a' }}>
                ₹{financialStats.totalCollected}
              </span>
              <span style={{ fontSize: 11, fontFamily: 'var(--font-mono)', color: 'var(--color-text-tertiary)' }}>
                ({financialStats.totalPaidCount} paid)
              </span>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 2, fontSize: 10, fontFamily: 'var(--font-mono)' }}>
              <span style={{ color: 'var(--color-brand)', fontWeight: 700 }}>UPI: ₹{financialStats.totalUpi}</span>
              <span style={{ color: 'var(--color-text-tertiary)' }}>•</span>
              <span style={{ color: '#16a34a', fontWeight: 700 }}>Cash: ₹{financialStats.totalCash}</span>
              {financialStats.pendingCash > 0 && (
                <>
                  <span style={{ color: 'var(--color-text-tertiary)' }}>•</span>
                  <span style={{ color: '#b45309', fontWeight: 700 }}>Due: ₹{financialStats.pendingCash}</span>
                </>
              )}
            </div>
          </div>
          <div style={{ width: 38, height: 38, borderRadius: '50%', background: 'rgba(22, 163, 74, 0.12)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <IndianRupee size={18} color="#16a34a" />
          </div>
        </div>
      </div>

      {/* ─── Main Two-Column Workflow Area ───────────────────────────────────── */}
      <div className="qm-main-area" style={{ display: 'flex', flex: 1, overflow: 'hidden' }}>
        {/* LEFT COLUMN: Fast Ticket Issuing Desk */}
        <div
          className="qm-left-desk"
          style={{
            width: 380,
            background: 'var(--color-bg-surface)',
            borderRight: '1px solid var(--color-border-subtle)',
            display: 'flex',
            flexDirection: 'column',
            padding: 24,
            overflowY: 'auto',
            flexShrink: 0,
          }}
        >
          <div style={{ marginBottom: 16 }}>
            <span style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--color-brand)', textTransform: 'uppercase', letterSpacing: '0.08em', fontWeight: 700 }}>
              FAST TICKET DESK
            </span>
            <h2 style={{ fontFamily: 'var(--font-display)', fontSize: 20, fontWeight: 800, marginTop: 4 }}>
              Issue Customer Ticket
            </h2>
            <p style={{ fontSize: 12, color: 'var(--color-text-secondary)', lineHeight: 1.4, margin: '4px 0 0' }}>
              Give the customer their 4-digit code. When they step inside the booth, they type this code to begin.
            </p>
          </div>

          {/* Next Auto-Generated Code Highlight Card */}
          <div
            style={{
              background: 'linear-gradient(145deg, rgba(109, 6, 38, 0.08), rgba(47, 1, 14, 0.04))',
              border: '1.5px solid rgba(109, 6, 38, 0.25)',
              borderRadius: 'var(--radius-xl)',
              padding: '16px 20px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              marginBottom: 20,
              boxShadow: '0 8px 24px rgba(0, 0, 0, 0.1)',
            }}
          >
            <div>
              <span style={{ fontSize: 12, fontFamily: 'var(--font-mono)', color: 'var(--color-brand)', textTransform: 'uppercase', letterSpacing: '0.08em', fontWeight: 800 }}>
                NEXT TICKET CODE
              </span>
              <div
                style={{
                  fontFamily: 'var(--font-mono)',
                  fontSize: 40,
                  fontWeight: 800,
                  color: 'var(--color-brand)',
                  letterSpacing: '0.15em',
                  marginTop: 2,
                }}
              >
                #{useCustomCode && customCode ? customCode : nextCode}
              </div>
            </div>
            <div
              style={{
                width: 44,
                height: 44,
                borderRadius: 'var(--radius-full)',
                background: 'rgba(109, 6, 38, 0.12)',
                border: '1px solid rgba(109, 6, 38, 0.25)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              <Sparkles size={22} color="var(--color-brand)" />
            </div>
          </div>

          {/* Form */}
          <form onSubmit={handleIssueTicket} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            {/* Customer Name */}
            <div>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 }}>
                <label style={{ fontSize: 11, fontFamily: 'var(--font-mono)', color: 'var(--color-text-primary)', fontWeight: 700, letterSpacing: '0.04em' }}>
                  GUEST / GROUP NAME (OPTIONAL)
                </label>
                {customerName.length > 25 && (
                  <span style={{ fontSize: 10, fontFamily: 'var(--font-mono)', color: 'var(--color-text-secondary)', fontWeight: 600 }}>
                    {customerName.length}/40
                  </span>
                )}
              </div>
              <div style={{ position: 'relative' }}>
                <input
                  type="text"
                  maxLength={40}
                  placeholder="e.g. Maya & Carlos, Table 4"
                  value={customerName}
                  onChange={e => setCustomerName(e.target.value.slice(0, 40))}
                  className="input w-full"
                  style={{
                    paddingLeft: 38,
                    height: 44,
                    fontSize: 13,
                    borderRadius: 'var(--radius-md)',
                  }}
                />
                <User size={16} color="var(--color-brand)" style={{ position: 'absolute', left: 12, top: 14 }} />
              </div>
            </div>

            {/* Customer Phone */}
            <div>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 }}>
                <label style={{ fontSize: 11, fontFamily: 'var(--font-mono)', color: 'var(--color-text-primary)', fontWeight: 700, letterSpacing: '0.04em' }}>
                  MOBILE PHONE (FOR SMS PHOTOS)
                </label>
                <span
                  style={{
                    fontSize: 10,
                    fontFamily: 'var(--font-mono)',
                    fontWeight: 700,
                    color: isPhoneIncomplete ? '#dc2626' : isPhoneValid ? '#16a34a' : 'var(--color-text-secondary)',
                    background: isPhoneIncomplete ? 'rgba(220, 38, 38, 0.1)' : isPhoneValid ? 'rgba(22, 163, 74, 0.12)' : 'transparent',
                    padding: '1px 7px',
                    borderRadius: 'var(--radius-sm)',
                    border: isPhoneIncomplete ? '1px solid rgba(220, 38, 38, 0.3)' : isPhoneValid ? '1px solid rgba(22, 163, 74, 0.3)' : 'none',
                  }}
                >
                  {customerPhone.length === 0 ? 'Max 10 digits · Optional' : isPhoneValid ? '10/10 ✓' : `${customerPhone.length}/10 digits`}
                </span>
              </div>
              <div style={{ position: 'relative' }}>
                <input
                  type="tel"
                  inputMode="numeric"
                  pattern="[0-9]{10}"
                  maxLength={10}
                  placeholder="e.g. 9876543210 (10 digits)"
                  value={customerPhone}
                  onChange={e => {
                    // Strictly strip non-digits and cap at exactly 10 digits
                    const digits = e.target.value.replace(/\D/g, '').slice(0, 10)
                    setCustomerPhone(digits)
                  }}
                  className="input w-full"
                  style={{
                    paddingLeft: 38,
                    paddingRight: 38,
                    height: 44,
                    fontSize: 14,
                    fontFamily: 'var(--font-mono)',
                    letterSpacing: customerPhone.length > 0 ? '0.08em' : 'normal',
                    borderRadius: 'var(--radius-md)',
                    borderColor: isPhoneIncomplete ? '#dc2626' : isPhoneValid ? '#16a34a' : undefined,
                    boxShadow: isPhoneIncomplete ? '0 0 0 1px #dc2626' : isPhoneValid ? '0 0 0 1px #16a34a' : undefined,
                  }}
                />
                <Phone size={16} color={isPhoneIncomplete ? '#dc2626' : isPhoneValid ? '#16a34a' : 'var(--color-brand)'} style={{ position: 'absolute', left: 12, top: 14 }} />
                {isPhoneValid && (
                  <Check size={16} color="#16a34a" style={{ position: 'absolute', right: 12, top: 14 }} />
                )}
              </div>
              {isPhoneIncomplete && (
                <span style={{ fontSize: 11, color: '#dc2626', fontFamily: 'var(--font-mono)', marginTop: 4, display: 'flex', alignItems: 'center', gap: 4, fontWeight: 700 }}>
                  <AlertCircle size={13} color="#dc2626" />
                  Must be exactly 10 digits ({customerPhone.length}/10 entered)
                </span>
              )}
              {isPhoneValid && (
                <span style={{ fontSize: 11, color: '#16a34a', fontFamily: 'var(--font-mono)', marginTop: 4, display: 'flex', alignItems: 'center', gap: 4, fontWeight: 700 }}>
                  <Check size={13} color="#16a34a" />
                  Valid 10-digit mobile number for SMS photos
                </span>
              )}
            </div>

            {/* Custom Code Checkbox */}
            <div style={{ marginTop: 2 }}>
              <button
                type="button"
                onClick={() => setUseCustomCode(!useCustomCode)}
                style={{
                  background: 'none',
                  border: 'none',
                  color: 'var(--color-brand)',
                  fontFamily: 'var(--font-mono)',
                  fontSize: 12,
                  fontWeight: 700,
                  display: 'flex',
                  alignItems: 'center',
                  gap: 6,
                  cursor: 'pointer',
                  padding: 0,
                }}
              >
                <span>{useCustomCode ? '[-] Use Random Auto-Code' : '[+] Enter Specific 4-Digit Code'}</span>
              </button>

              {useCustomCode && (
                <div style={{ marginTop: 8 }}>
                  <input
                    type="text"
                    inputMode="numeric"
                    maxLength={4}
                    placeholder="4-digit code e.g. 7788"
                    value={customCode}
                    onChange={e => setCustomCode(e.target.value.replace(/\D/g, '').slice(0, 4))}
                    className="input w-full"
                    style={{
                      height: 42,
                      fontFamily: 'var(--font-mono)',
                      fontSize: 15,
                      fontWeight: 700,
                      letterSpacing: '0.15em',
                      color: isCustomCodeTaken ? '#dc2626' : 'var(--color-brand)',
                      borderColor: isCustomCodeTaken || isCustomCodeIncomplete ? '#dc2626' : customCode.length === 4 ? '#16a34a' : undefined,
                      boxShadow: isCustomCodeTaken || isCustomCodeIncomplete ? '0 0 0 1px #dc2626' : customCode.length === 4 ? '0 0 0 1px #16a34a' : undefined,
                    }}
                  />
                  {isCustomCodeTaken && (
                    <span style={{ fontSize: 11, color: '#dc2626', fontFamily: 'var(--font-mono)', fontWeight: 700, marginTop: 4, display: 'flex', alignItems: 'center', gap: 4 }}>
                      <AlertCircle size={13} color="#dc2626" />
                      Code #{customCode} is already assigned to an active guest!
                    </span>
                  )}
                  {isCustomCodeIncomplete && (
                    <span style={{ fontSize: 11, color: '#dc2626', fontFamily: 'var(--font-mono)', marginTop: 3, display: 'flex', alignItems: 'center', gap: 4, fontWeight: 600 }}>
                      <AlertCircle size={13} color="#dc2626" />
                      Code must be exactly 4 digits ({customCode.length}/4)
                    </span>
                  )}
                  {customCode.length === 4 && !isCustomCodeTaken && (
                    <span style={{ fontSize: 11, color: '#16a34a', fontFamily: 'var(--font-mono)', marginTop: 3, display: 'flex', alignItems: 'center', gap: 4, fontWeight: 700 }}>
                      <Check size={13} color="#16a34a" />
                      Code #{customCode} is available!
                    </span>
                  )}
                </div>
              )}
            </div>

            {/* Notes */}
            <div>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 }}>
                <label style={{ fontSize: 11, fontFamily: 'var(--font-mono)', color: 'var(--color-text-primary)', fontWeight: 700, letterSpacing: '0.04em' }}>
                  NOTES (OPTIONAL)
                </label>
                {notes.length > 70 && (
                  <span style={{ fontSize: 10, fontFamily: 'var(--font-mono)', color: 'var(--color-text-secondary)', fontWeight: 600 }}>
                    {notes.length}/100
                  </span>
                )}
              </div>
              <input
                type="text"
                maxLength={100}
                placeholder="e.g. 2 physical prints, VIP strip"
                value={notes}
                onChange={e => setNotes(e.target.value.slice(0, 100))}
                className="input w-full"
                style={{ height: 42, fontSize: 13, borderRadius: 'var(--radius-md)' }}
              />
            </div>

            {/* ─── Ticket Plan Selector ─────────────────────────────── */}
            <div style={{ marginTop: 4 }}>
              <label style={{ display: 'block', fontSize: 11, fontFamily: 'var(--font-mono)', color: 'var(--color-text-primary)', fontWeight: 800, letterSpacing: '0.06em', marginBottom: 8 }}>
                TICKET PLAN
              </label>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                {TICKET_PLANS.map(({ plan, strips, label, paperLabel, desc, badge }) => {
                  const isActive = selectedPlan === plan
                  return (
                    <button
                      key={plan}
                      type="button"
                      onClick={() => setSelectedPlan(plan)}
                      style={{
                        position: 'relative',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        padding: '10px 14px',
                        borderRadius: 'var(--radius-lg)',
                        border: isActive ? '2.5px solid var(--color-brand)' : '1.5px solid var(--color-border-subtle)',
                        background: isActive ? 'rgba(109, 6, 38, 0.07)' : 'var(--color-bg-base)',
                        cursor: 'pointer',
                        transition: 'all 0.15s ease',
                        boxShadow: isActive ? '0 4px 14px rgba(109, 6, 38, 0.15)' : 'none',
                        textAlign: 'left',
                      }}
                    >
                      {badge && (
                        <span style={{
                          position: 'absolute', top: -9, right: 8,
                          background: plan === 99 ? '#0284c7' : '#16a34a',
                          color: '#fff', fontSize: 9, fontWeight: 800,
                          padding: '2px 8px', borderRadius: 'var(--radius-full)',
                          letterSpacing: '0.05em',
                        }}>
                          {badge}
                        </span>
                      )}
                      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                        <div style={{
                          width: 32, height: 32, borderRadius: '50%',
                          background: isActive ? 'var(--color-brand)' : 'var(--color-bg-surface)',
                          border: isActive ? 'none' : '1.5px solid var(--color-border-subtle)',
                          display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
                        }}>
                          <span style={{ fontSize: 10, fontFamily: 'var(--font-mono)', fontWeight: 800, color: isActive ? '#fff' : 'var(--color-brand)' }}>
                            {strips}✂
                          </span>
                        </div>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
                          <span style={{ fontSize: 12, fontFamily: 'var(--font-mono)', fontWeight: 800, color: isActive ? 'var(--color-brand)' : 'var(--color-text-primary)' }}>
                            {desc}
                          </span>
                          <span style={{ fontSize: 9.5, fontFamily: 'var(--font-mono)', color: 'var(--color-text-tertiary)' }}>
                            {strips === 2 ? 'A5 Half-Sheet \xb7 1 centre cut' : `Up to ${strips} strips on A4 landscape`}
                          </span>
                        </div>
                      </div>
                      <span style={{
                        fontSize: 17, fontFamily: 'var(--font-display)', fontWeight: 800,
                        color: isActive ? 'var(--color-brand)' : 'var(--color-text-secondary)',
                        flexShrink: 0,
                      }}>
                        {label}
                      </span>
                    </button>
                  )
                })}
              </div>
            </div>

            {/* ─── Payment Method Selection (UPI or CASH) ──────────────── */}
            <div style={{ marginTop: 4 }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
                <label style={{ display: 'block', fontSize: 11, fontFamily: 'var(--font-mono)', color: 'var(--color-text-primary)', fontWeight: 800, letterSpacing: '0.06em', margin: 0 }}>
                  PAYMENT METHOD
                </label>
                <span
                  style={{
                    fontSize: 11,
                    fontFamily: 'var(--font-mono)',
                    fontWeight: 800,
                    color: '#16a34a',
                    background: 'rgba(22, 163, 74, 0.12)',
                    border: '1px solid rgba(22, 163, 74, 0.3)',
                    padding: '2px 8px',
                    borderRadius: 'var(--radius-full)',
                  }}
                >
                  FEE: &#8377;{selectedPlan}/-
                </span>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                {/* UPI Option */}
                <button
                  type="button"
                  onClick={() => setPaymentMethod('UPI')}
                  style={{
                    display: 'flex',
                    flexDirection: 'column',
                    alignItems: 'center',
                    justifyContent: 'center',
                    padding: '12px 10px',
                    borderRadius: 'var(--radius-lg)',
                    border: paymentMethod === 'UPI' ? '2px solid var(--color-brand)' : '1.5px solid var(--color-border-subtle)',
                    background: paymentMethod === 'UPI' ? 'rgba(109, 6, 38, 0.08)' : '#FFFFFF',
                    cursor: 'pointer',
                    transition: 'all 0.15s ease',
                    boxShadow: paymentMethod === 'UPI' ? '0 4px 14px rgba(109, 6, 38, 0.15)' : 'none',
                    textAlign: 'center',
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 4 }}>
                    <QrCode size={18} color="var(--color-brand)" />
                    <span style={{ fontFamily: 'var(--font-mono)', fontSize: 13, fontWeight: 800, color: 'var(--color-brand)' }}>
                      UPI PAY
                    </span>
                  </div>
                  <span style={{ fontSize: 10, fontFamily: 'var(--font-mono)', color: 'var(--color-text-secondary)', fontWeight: 600 }}>
                    Scan QR &middot; &#8377;{selectedPlan}
                  </span>
                  <span style={{ fontSize: 9, fontFamily: 'var(--font-mono)', color: 'var(--color-brand)', marginTop: 2, fontWeight: 700 }}>
                    9313780044@superyes
                  </span>
                </button>

                {/* Cash Option */}
                <button
                  type="button"
                  onClick={() => setPaymentMethod('CASH')}
                  style={{
                    display: 'flex',
                    flexDirection: 'column',
                    alignItems: 'center',
                    justifyContent: 'center',
                    padding: '12px 10px',
                    borderRadius: 'var(--radius-lg)',
                    border: paymentMethod === 'CASH' ? '2px solid #16a34a' : '1.5px solid var(--color-border-subtle)',
                    background: paymentMethod === 'CASH' ? 'rgba(22, 163, 74, 0.08)' : '#FFFFFF',
                    cursor: 'pointer',
                    transition: 'all 0.15s ease',
                    boxShadow: paymentMethod === 'CASH' ? '0 4px 14px rgba(22, 163, 74, 0.15)' : 'none',
                    textAlign: 'center',
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 4 }}>
                    <Banknote size={18} color="#16a34a" />
                    <span style={{ fontFamily: 'var(--font-mono)', fontSize: 13, fontWeight: 800, color: '#16a34a' }}>
                      CASH
                    </span>
                  </div>
                  <span style={{ fontSize: 10, fontFamily: 'var(--font-mono)', color: 'var(--color-text-secondary)', fontWeight: 600 }}>
                    Counter Cash &middot; &#8377;{selectedPlan}
                  </span>
                  <span style={{ fontSize: 9, fontFamily: 'var(--font-mono)', color: '#16a34a', marginTop: 2, fontWeight: 700 }}>
                    Create Ticket &amp; Collect
                  </span>
                </button>
              </div>
            </div>

            {/* Submit Button */}
            {paymentMethod === 'UPI' ? (
              <button
                type="submit"
                disabled={isLoading || isFormInvalid}
                className="btn btn-primary"
                style={{
                  marginTop: 10,
                  height: 52,
                  borderRadius: 'var(--radius-full)',
                  fontFamily: 'var(--font-mono)',
                  fontSize: 13,
                  fontWeight: 800,
                  letterSpacing: '0.04em',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: 8,
                  color: '#F7F1EA',
                  background: isFormInvalid ? '#9ca3af' : 'var(--color-brand)',
                  boxShadow: isFormInvalid ? 'none' : '0 8px 24px rgba(109, 6, 38, 0.3)',
                  cursor: isFormInvalid ? 'not-allowed' : 'pointer',
                  opacity: isFormInvalid ? 0.7 : 1,
                  transition: 'all 0.2s ease',
                }}
              >
                <QrCode size={18} color="#F7F1EA" />
                <span>
                  {isPhoneIncomplete
                    ? `⚠️ ENTER 10-DIGIT PHONE (${customerPhone.length}/10)`
                    : isCustomCodeTaken
                    ? '⚠️ CODE ALREADY TAKEN'
                    : isCustomCodeIncomplete
                    ? '⚠️ CODE MUST BE 4 DIGITS'
                    : `SHOW UPI QR (₹${selectedPlan}) → ISSUE PASS`}
                </span>
                <ArrowRight size={16} color="#F7F1EA" />
              </button>
            ) : (
              <button
                type="submit"
                disabled={isLoading || isFormInvalid}
                className="btn"
                style={{
                  marginTop: 10,
                  height: 52,
                  borderRadius: 'var(--radius-full)',
                  fontFamily: 'var(--font-mono)',
                  fontSize: 13,
                  fontWeight: 800,
                  letterSpacing: '0.04em',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: 8,
                  color: '#FFFFFF',
                  background: isFormInvalid ? '#9ca3af' : '#16a34a',
                  border: 'none',
                  boxShadow: isFormInvalid ? 'none' : '0 8px 24px rgba(22, 163, 74, 0.3)',
                  cursor: isFormInvalid ? 'not-allowed' : 'pointer',
                  opacity: isFormInvalid ? 0.7 : 1,
                  transition: 'all 0.2s ease',
                }}
              >
                <Banknote size={18} color="#FFFFFF" />
                <span>
                  {isPhoneIncomplete
                    ? `⚠️ ENTER 10-DIGIT PHONE (${customerPhone.length}/10)`
                    : isCustomCodeTaken
                    ? '⚠️ CODE ALREADY TAKEN'
                    : isCustomCodeIncomplete
                    ? '⚠️ CODE MUST BE 4 DIGITS'
                    : `CREATE TICKET & COLLECT ₹${selectedPlan} CASH`}
                </span>
                <ArrowRight size={16} color="#FFFFFF" />
              </button>
            )}
          </form>
        </div>

        {/* RIGHT COLUMN: Live Queue Board */}
        <div
          className="qm-right-board"
          style={{
            flex: 1,
            display: 'flex',
            flexDirection: 'column',
            overflow: 'hidden',
            background: 'var(--color-bg)',
          }}
        >
          {/* Filter Bar & Search */}
          <div
            className="qm-filter-bar"
            style={{
              padding: '16px 24px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              borderBottom: '1px solid var(--color-border-subtle)',
              gap: 16,
              flexShrink: 0,
            }}
          >
            {/* Filter Tabs */}
            <div style={{ display: 'flex', gap: 6, background: 'var(--color-surface)', padding: 4, borderRadius: 'var(--radius-full)', border: '1px solid var(--color-border-subtle)' }}>
              {(['ALL', 'WAITING', 'ACTIVE', 'COMPLETED'] as const).map(tab => {
                const isActive = filterTab === tab
                const count =
                  tab === 'ALL' ? tickets.length :
                  tab === 'WAITING' ? stats.waiting :
                  tab === 'ACTIVE' ? stats.inBooth + stats.editing :
                  stats.completed

                return (
                  <button
                    key={tab}
                    onClick={() => setFilterTab(tab)}
                    style={{
                      padding: '6px 16px',
                      borderRadius: 'var(--radius-full)',
                      border: 'none',
                      background: isActive ? 'var(--color-brand)' : 'transparent',
                      color: isActive ? '#F7F1EA' : 'var(--color-text-primary)',
                      fontFamily: 'var(--font-mono)',
                      fontSize: 11,
                      fontWeight: 700,
                      cursor: 'pointer',
                      transition: 'all 0.15s ease',
                      display: 'flex',
                      alignItems: 'center',
                      gap: 6,
                    }}
                  >
                    <span>{tab}</span>
                    <span
                      style={{
                        fontSize: 10,
                        padding: '1px 6px',
                        borderRadius: 'var(--radius-full)',
                        background: isActive ? 'rgba(247, 241, 234, 0.25)' : 'rgba(109, 6, 38, 0.12)',
                        color: isActive ? '#F7F1EA' : 'var(--color-brand)',
                        fontWeight: 700,
                      }}
                    >
                      {count}
                    </span>
                  </button>
                )
              })}
            </div>

            {/* Search input */}
            <div style={{ position: 'relative', width: 240 }}>
              <input
                type="text"
                placeholder="Search ticket # or name..."
                value={searchQuery}
                onChange={e => setSearchQuery(e.target.value)}
                className="input w-full"
                style={{
                  height: 38,
                  paddingLeft: 34,
                  fontSize: 12,
                  fontFamily: 'var(--font-mono)',
                  borderRadius: 'var(--radius-full)',
                  background: '#FFFFFF',
                  color: 'var(--color-text-primary)',
                  border: '1.5px solid var(--color-border-default)',
                }}
              />
              <Search size={15} color="var(--color-brand)" style={{ position: 'absolute', left: 12, top: 12 }} />
              {searchQuery && (
                <button
                  onClick={() => setSearchQuery('')}
                  style={{
                    position: 'absolute',
                    right: 10,
                    top: 10,
                    background: 'none',
                    border: 'none',
                    color: 'var(--color-text-tertiary)',
                    cursor: 'pointer',
                  }}
                >
                  <X size={14} />
                </button>
              )}
            </div>
          </div>

          {/* Ticket Grid / List */}
          <div
            style={{
              flex: 1,
              overflowY: 'auto',
              padding: 24,
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))',
              gap: 16,
              alignContent: 'start',
            }}
          >
            {filteredTickets.length === 0 ? (
              <div
                style={{
                  gridColumn: '1 / -1',
                  textAlign: 'center',
                  padding: '60px 20px',
                  color: 'var(--color-text-tertiary)',
                }}
              >
                <TicketIcon size={44} style={{ opacity: 0.3, margin: '0 auto 12px' }} />
                <p style={{ fontFamily: 'var(--font-mono)', fontSize: 13, marginBottom: 4 }}>
                  {searchQuery ? 'No matching tickets found' : 'No tickets in this view'}
                </p>
                <p style={{ fontSize: 12, color: 'var(--color-text-disabled)' }}>
                  Issue a ticket on the left desk to get customers started!
                </p>
              </div>
            ) : (
              filteredTickets.map(ticket => {
                const config = STATUS_CONFIG[ticket.status] || STATUS_CONFIG.WAITING

                return (
                  <motion.div
                    key={ticket.id}
                    layout
                    initial={{ opacity: 0, scale: 0.95 }}
                    animate={{ opacity: 1, scale: 1 }}
                    exit={{ opacity: 0, scale: 0.95 }}
                    style={{
                      background: 'var(--color-card)',
                      border: `1.5px solid ${config.border}`,
                      borderRadius: 'var(--radius-xl)',
                      padding: 18,
                      display: 'flex',
                      flexDirection: 'column',
                      gap: 12,
                      boxShadow: '0 4px 16px rgba(109, 6, 38, 0.06)',
                      position: 'relative',
                      overflow: 'hidden',
                    }}
                  >
                    {/* Status accent bar */}
                    <div
                      style={{
                        position: 'absolute',
                        top: 0,
                        left: 0,
                        right: 0,
                        height: 3,
                        background: config.color,
                      }}
                    />

                    {/* Card Header: 4-digit code & status pill */}
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        <span
                          style={{
                            fontFamily: 'var(--font-mono)',
                            fontSize: 24,
                            fontWeight: 800,
                            color: 'var(--color-brand)',
                            letterSpacing: '0.08em',
                          }}
                        >
                          #{ticket.code}
                        </span>
                        {ticket.customerName && (
                          <span
                            style={{
                              fontSize: 14,
                              fontWeight: 700,
                              color: 'var(--color-text-primary)',
                              maxWidth: 140,
                              overflow: 'hidden',
                              textOverflow: 'ellipsis',
                              whiteSpace: 'nowrap',
                            }}
                          >
                            {ticket.customerName}
                          </span>
                        )}
                      </div>

                      {/* Status badge */}
                      <span
                        style={{
                          fontSize: 11,
                          fontFamily: 'var(--font-mono)',
                          color: config.color,
                          background: config.bg,
                          border: `1px solid ${config.border}`,
                          padding: '3px 10px',
                          borderRadius: 'var(--radius-full)',
                          display: 'flex',
                          alignItems: 'center',
                          gap: 6,
                          fontWeight: 700,
                          letterSpacing: '0.04em',
                          textTransform: 'uppercase',
                        }}
                      >
                        <span
                          style={{
                            width: 6,
                            height: 6,
                            borderRadius: '50%',
                            background: config.color,
                            boxShadow: ticket.status === 'IN_BOOTH' ? `0 0 6px ${config.color}` : 'none',
                          }}
                          className={ticket.status === 'IN_BOOTH' ? 'animate-ping' : ''}
                        />
                        {config.label}
                      </span>
                    </div>

                    {/* Details row: time & metrics */}
                    <div
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        fontSize: 11,
                        fontFamily: 'var(--font-mono)',
                        color: 'var(--color-text-secondary)',
                        padding: '6px 0',
                        borderTop: '1px solid var(--color-border-subtle)',
                        borderBottom: '1px solid var(--color-border-subtle)',
                      }}
                    >
                      <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                        <Clock size={12} />
                        <span>{formatElapsed(ticket.createdAt)}</span>
                      </div>

                      <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                        {ticket.photoCount !== undefined && ticket.photoCount > 0 && (
                          <span style={{ color: 'var(--color-brand)', fontWeight: 700, display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                            <Camera size={12} />
                            <span>{ticket.photoCount} shots</span>
                          </span>
                        )}
                        {ticket.printCount !== undefined && ticket.printCount > 0 && (
                          <span style={{ color: 'var(--color-brand-bright)', fontWeight: 700, display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                            <Printer size={12} />
                            <span>{ticket.printCount} strips</span>
                          </span>
                        )}
                        {ticket.customerPhone && (
                          <span title={ticket.customerPhone} style={{ color: 'var(--color-text-secondary)', fontWeight: 600, display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                            <Phone size={12} />
                            <span>···{ticket.customerPhone.slice(-4)}</span>
                          </span>
                        )}
                      </div>
                    </div>

                    {/* Individual Payment Record Badge & Action */}
                    <div
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        padding: '6px 10px',
                        borderRadius: 'var(--radius-md)',
                        background: ticket.paymentStatus === 'PAID'
                          ? (ticket.paymentMethod === 'UPI' ? 'rgba(109, 6, 38, 0.05)' : 'rgba(22, 163, 74, 0.05)')
                          : 'rgba(180, 83, 9, 0.08)',
                        border: `1px solid ${ticket.paymentStatus === 'PAID' ? 'var(--color-border-subtle)' : 'rgba(180, 83, 9, 0.3)'}`,
                      }}
                    >
                      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                        {ticket.paymentMethod === 'UPI' ? (
                          <span
                            style={{
                              display: 'inline-flex',
                              alignItems: 'center',
                              gap: 4,
                              fontSize: 11,
                              fontFamily: 'var(--font-mono)',
                              fontWeight: 800,
                              color: 'var(--color-brand)',
                              background: 'rgba(109, 6, 38, 0.1)',
                              padding: '2px 8px',
                              borderRadius: 'var(--radius-full)',
                            }}
                          >
                            <QrCode size={12} />
                            <span>UPI · ₹{ticket.paymentAmount ?? ticket.planType ?? 99}</span>
                          </span>
                        ) : (
                          <span
                            style={{
                              display: 'inline-flex',
                              alignItems: 'center',
                              gap: 4,
                              fontSize: 11,
                              fontFamily: 'var(--font-mono)',
                              fontWeight: 800,
                              color: '#16a34a',
                              background: 'rgba(22, 163, 74, 0.12)',
                              padding: '2px 8px',
                              borderRadius: 'var(--radius-full)',
                            }}
                          >
                            <Banknote size={12} />
                            <span>CASH · ₹{ticket.paymentAmount ?? ticket.planType ?? 99}</span>
                          </span>
                        )}

                        {ticket.paymentStatus === 'PAID' ? (
                          <span
                            style={{
                              display: 'inline-flex',
                              alignItems: 'center',
                              gap: 4,
                              fontSize: 10,
                              fontFamily: 'var(--font-mono)',
                              fontWeight: 800,
                              color: '#16a34a',
                            }}
                          >
                            <CheckCircle2 size={12} />
                            <span>PAID</span>
                          </span>
                        ) : (
                          <span
                            style={{
                              display: 'inline-flex',
                              alignItems: 'center',
                              gap: 4,
                              fontSize: 10,
                              fontFamily: 'var(--font-mono)',
                              fontWeight: 800,
                              color: '#b45309',
                            }}
                          >
                            <AlertCircle size={12} />
                            <span>COLLECT CASH</span>
                          </span>
                        )}
                      </div>

                      {/* Quick Collect Action if Cash is pending */}
                      {ticket.paymentMethod === 'CASH' && ticket.paymentStatus !== 'PAID' && (
                        <button
                          type="button"
                          onClick={() => handleConfirmCashCollected(ticket)}
                          className="btn btn-sm"
                          style={{
                            fontSize: 10,
                            fontFamily: 'var(--font-mono)',
                            fontWeight: 800,
                            padding: '3px 10px',
                            height: 24,
                            borderRadius: 'var(--radius-full)',
                            background: '#16a34a',
                            color: '#FFFFFF',
                            border: 'none',
                            display: 'flex',
                            alignItems: 'center',
                            gap: 4,
                            cursor: 'pointer',
                            boxShadow: '0 2px 6px rgba(22, 163, 74, 0.25)',
                          }}
                        >
                          <Check size={11} />
                          <span>Collect ₹{ticket.paymentAmount ?? ticket.planType ?? 99}</span>
                        </button>
                      )}
                    </div>

                    {ticket.notes && (
                      <p style={{ fontSize: 11, color: 'var(--color-text-secondary)', margin: 0, fontStyle: 'italic' }}>
                        Note: {ticket.notes}
                      </p>
                    )}

                    {/* Action buttons */}
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: 4 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                        <button
                          onClick={() => setIssuedTicketModal(ticket)}
                          className="btn btn-ghost btn-sm"
                          style={{ fontSize: 10, fontFamily: 'var(--font-mono)', padding: '4px 8px', gap: 4 }}
                        >
                          <QrCode size={12} />
                          <span>View Pass</span>
                        </button>

                        <button
                          type="button"
                          onClick={() => openTicketFolder(ticket.code)}
                          className="btn btn-ghost btn-sm"
                          style={{ fontSize: 10, fontFamily: 'var(--font-mono)', padding: '4px 8px', gap: 4, color: '#0284c7' }}
                          title={`Open ${ticket.code} photo folder in File Explorer`}
                        >
                          <Folder size={12} />
                          <span>Folder</span>
                        </button>
                      </div>

                      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                        {ticket.status === 'WAITING' && (
                          <button
                            onClick={() => updateTicketStatus(ticket.id, 'IN_BOOTH')}
                            className="btn btn-secondary btn-sm"
                            style={{
                              fontSize: 10,
                              fontFamily: 'var(--font-mono)',
                              padding: '4px 10px',
                              borderRadius: 'var(--radius-full)',
                              color: 'var(--color-brand)',
                            }}
                          >
                            Call Inside →
                          </button>
                        )}

                        {ticket.status !== 'COMPLETED' && ticket.status !== 'CANCELLED' && (
                          <button
                            onClick={() => updateTicketStatus(ticket.id, 'CANCELLED')}
                            className="btn btn-ghost btn-sm"
                            style={{
                              fontSize: 10,
                              fontFamily: 'var(--font-mono)',
                              padding: '4px 8px',
                              color: '#ef4444',
                            }}
                          >
                            Void
                          </button>
                        )}

                        <button
                          onClick={() => deleteTicket(ticket.id)}
                          className="btn btn-ghost btn-icon btn-sm"
                          title="Delete ticket record"
                          style={{ width: 24, height: 24, color: 'var(--color-text-tertiary)' }}
                        >
                          <Trash2 size={12} />
                        </button>
                      </div>
                    </div>
                  </motion.div>
                )
              })
            )}
          </div>
        </div>
      </div>

      {/* ─── Modal: Printable / Displayable Ticket Pass ──────────────────────── */}
      <AnimatePresence>
        {issuedTicketModal && (
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
            onClick={() => setIssuedTicketModal(null)}
          >
            <motion.div
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.9, opacity: 0 }}
              onClick={e => e.stopPropagation()}
              style={{
                width: '100%',
                maxWidth: 420,
                background: 'var(--color-bg, #F7F1EA)',
                border: '2px solid var(--color-brand)',
                borderRadius: 'var(--radius-2xl)',
                padding: 32,
                textAlign: 'center',
                boxShadow: '0 24px 64px rgba(43, 5, 16, 0.4)',
                position: 'relative',
              }}
            >
              <button
                onClick={() => setIssuedTicketModal(null)}
                style={{
                  position: 'absolute',
                  top: 16,
                  right: 16,
                  background: 'none',
                  border: 'none',
                  color: 'var(--color-text-secondary)',
                  cursor: 'pointer',
                }}
              >
                <X size={20} />
              </button>

              <div
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: 6,
                  background: 'rgba(109, 6, 38, 0.10)',
                  border: '1px solid rgba(109, 6, 38, 0.25)',
                  padding: '4px 14px',
                  borderRadius: 'var(--radius-full)',
                  color: 'var(--color-brand)',
                  fontFamily: 'var(--font-mono)',
                  fontSize: 11,
                  letterSpacing: '0.08em',
                  textTransform: 'uppercase',
                  fontWeight: 700,
                  marginBottom: 16,
                }}
              >
                <TicketIcon size={14} />
                <span>PHOTOBOOTH ACCESS PASS</span>
              </div>

              <h2
                style={{
                  fontFamily: 'var(--font-mono)',
                  fontSize: 56,
                  fontWeight: 800,
                  letterSpacing: '0.18em',
                  color: 'var(--color-brand)',
                  textShadow: '0 2px 10px rgba(109, 6, 38, 0.15)',
                  margin: '8px 0',
                }}
              >
                #{issuedTicketModal.code}
              </h2>

              {issuedTicketModal.customerName && (
                <p style={{ fontSize: 16, color: 'var(--color-text-primary)', fontWeight: 700, margin: '4px 0 16px' }}>
                  Guest: {issuedTicketModal.customerName}
                </p>
              )}

              {/* QR Code */}
              <div
                style={{
                  background: '#ffffff',
                  padding: 14,
                  borderRadius: 'var(--radius-lg)',
                  display: 'inline-block',
                  margin: '12px auto',
                  border: '1.5px solid var(--color-border-subtle)',
                  boxShadow: '0 8px 24px rgba(109, 6, 38, 0.1)',
                }}
              >
                <QRCodeSVG value={issuedTicketModal.code} size={150} level="M" />
              </div>

              {/* Payment Receipt Box */}
              <div
                style={{
                  background: 'rgba(109, 6, 38, 0.04)',
                  border: '1.5px dashed var(--color-brand)',
                  borderRadius: 'var(--radius-lg)',
                  padding: '10px 16px',
                  margin: '12px auto',
                  maxWidth: 320,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  fontSize: 11,
                  fontFamily: 'var(--font-mono)',
                }}
              >
                <div style={{ textAlign: 'left' }}>
                  <span style={{ color: 'var(--color-text-secondary)', display: 'block', fontSize: 10 }}>PAYMENT METHOD</span>
                  <strong style={{ color: 'var(--color-brand)', fontSize: 12 }}>
                    {issuedTicketModal.paymentMethod === 'UPI' ? 'UPI (9313780044@superyes)' : 'CASH COUNTER'}
                  </strong>
                </div>
                <div style={{ textAlign: 'right' }}>
                  <span style={{ color: 'var(--color-text-secondary)', display: 'block', fontSize: 10 }}>FEE RECORD</span>
                  <strong style={{ color: '#16a34a', fontSize: 14 }}>
                    ₹{issuedTicketModal.paymentAmount ?? issuedTicketModal.planType ?? 99}/-
                  </strong>
                </div>
              </div>

              <p
                style={{
                  fontFamily: 'var(--font-mono)',
                  fontSize: 12,
                  color: 'var(--color-text-secondary)',
                  lineHeight: 1.5,
                  maxWidth: 320,
                  margin: '14px auto 20px',
                }}
              >
                Step up to the photobooth touchscreen, enter <strong style={{ color: 'var(--color-brand)', fontWeight: 800 }}>#{issuedTicketModal.code}</strong>, and touch begin!
              </p>

              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                <button
                  type="button"
                  onClick={() => openTicketFolder(issuedTicketModal.code)}
                  className="btn btn-secondary w-full"
                  style={{
                    borderRadius: 'var(--radius-full)',
                    height: 44,
                    fontFamily: 'var(--font-mono)',
                    fontSize: 12,
                    fontWeight: 700,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: 6,
                    color: 'var(--color-brand)',
                  }}
                >
                  <Folder size={15} />
                  <span>Open Ticket #{issuedTicketModal.code} Folder on Disk</span>
                </button>

                <button
                  onClick={() => setIssuedTicketModal(null)}
                  className="btn btn-primary w-full"
                  style={{
                    borderRadius: 'var(--radius-full)',
                    height: 48,
                    fontFamily: 'var(--font-mono)',
                    fontSize: 13,
                    fontWeight: 700,
                    letterSpacing: '0.06em',
                  }}
                >
                  DONE / NEXT GUEST
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* ─── Modal 1: UPI Payment QR Code (149/-) ─────────────────────────── */}
      <AnimatePresence>
        {showUpiModal && pendingTicketData && (
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
              padding: 24,
            }}
            onClick={() => setShowUpiModal(false)}
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
                border: '2.5px solid var(--color-brand)',
                borderRadius: 'var(--radius-2xl)',
                padding: '28px 24px',
                textAlign: 'center',
                boxShadow: '0 24px 64px rgba(43, 5, 16, 0.5)',
                position: 'relative',
              }}
            >
              <button
                onClick={() => setShowUpiModal(false)}
                style={{
                  position: 'absolute',
                  top: 16,
                  right: 16,
                  background: 'none',
                  border: 'none',
                  color: 'var(--color-text-secondary)',
                  cursor: 'pointer',
                }}
              >
                <X size={20} />
              </button>

              {/* Tag Header */}
              <div
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: 6,
                  background: 'rgba(109, 6, 38, 0.10)',
                  border: '1px solid rgba(109, 6, 38, 0.25)',
                  padding: '4px 14px',
                  borderRadius: 'var(--radius-full)',
                  color: 'var(--color-brand)',
                  fontFamily: 'var(--font-mono)',
                  fontSize: 11,
                  letterSpacing: '0.08em',
                  textTransform: 'uppercase',
                  fontWeight: 700,
                  marginBottom: 10,
                }}
              >
                <QrCode size={14} />
                <span>UPI INSTANT PAYMENT</span>
              </div>

              <h2
                style={{
                  fontFamily: 'var(--font-display)',
                  fontSize: 22,
                  fontWeight: 800,
                  color: 'var(--color-text-primary)',
                  margin: '4px 0 2px',
                }}
              >
                Scan QR to Pay ₹{pendingTicketData.planType}/-
              </h2>

              <p
                style={{
                  fontFamily: 'var(--font-mono)',
                  fontSize: 12,
                  color: 'var(--color-text-secondary)',
                  margin: '0 0 14px',
                }}
              >
                Pass Code: <strong style={{ color: 'var(--color-brand)' }}>#{pendingTicketData.code}</strong>
                {pendingTicketData.customerName ? ` • ${pendingTicketData.customerName}` : ''}
              </p>

              {/* Amount Highlight */}
              <div
                style={{
                  background: 'linear-gradient(135deg, rgba(109, 6, 38, 0.08), rgba(22, 163, 74, 0.08))',
                  border: '1px solid rgba(109, 6, 38, 0.2)',
                  borderRadius: 'var(--radius-lg)',
                  padding: '10px 16px',
                  marginBottom: 16,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                }}
              >
                <span style={{ fontSize: 12, fontFamily: 'var(--font-mono)', fontWeight: 700, color: 'var(--color-text-secondary)' }}>
                  AMOUNT DUE
                </span>
                <span style={{ fontSize: 28, fontFamily: 'var(--font-display)', fontWeight: 900, color: '#16a34a' }}>
                  ₹{pendingTicketData.planType}.00
                </span>
              </div>

              {/* Razorpay Instant Checkout Button */}
              <div style={{ marginBottom: 14 }}>
                <button
                  type="button"
                  disabled={isConfirmingPayment}
                  onClick={() => {
                    if (!pendingTicketData) return
                    openRazorpayCheckout({
                      amount: pendingTicketData.planType,
                      description: `Photobooth Pass #${pendingTicketData.code} (${pendingTicketData.planType === 99 ? '2 Strips' : pendingTicketData.planType === 149 ? '3 Strips' : '5 Strips'})`,
                      customerName: pendingTicketData.customerName,
                      customerPhone: pendingTicketData.customerPhone,
                      onSuccess: async (res) => {
                        setIsConfirmingPayment(true)
                        try {
                          const ticket = await issueTicket({
                            customerName: pendingTicketData.customerName,
                            customerPhone: pendingTicketData.customerPhone,
                            notes: pendingTicketData.notes,
                            code: pendingTicketData.code,
                            paymentMethod: 'UPI',
                            paymentAmount: pendingTicketData.planType,
                            paymentStatus: 'PAID',
                            paidAt: new Date().toISOString(),
                            upiTransactionRef: res.razorpay_payment_id,
                            planType: pendingTicketData.planType,
                          })
                          setCustomerName('')
                          setCustomerPhone('')
                          setNotes('')
                          setCustomCode('')
                          setUseCustomCode(false)
                          setUpiTxnRef('')
                          setPendingTicketData(null)
                          setShowUpiModal(false)
                          setIssuedTicketModal(ticket)
                        } finally {
                          setIsConfirmingPayment(false)
                        }
                      },
                      onFailure: (err) => {
                        alert(`Payment failed: ${err.message}`)
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
                    fontSize: 12,
                    fontWeight: 800,
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: 6,
                    boxShadow: '0 4px 14px rgba(109, 6, 38, 0.35)',
                  }}
                >
                  <Sparkles size={14} />
                  <span>⚡ PAY ₹{pendingTicketData.planType} VIA RAZORPAY (AUTO-VERIFY)</span>
                </button>
              </div>

              <div style={{ display: 'flex', alignItems: 'center', margin: '8px 0 12px', gap: 10 }}>
                <div style={{ flex: 1, height: 1, background: 'var(--color-border-subtle)' }} />
                <span style={{ fontSize: 10, fontFamily: 'var(--font-mono)', color: 'var(--color-text-secondary)', fontWeight: 700 }}>OR SCAN DIRECT UPI QR</span>
                <div style={{ flex: 1, height: 1, background: 'var(--color-border-subtle)' }} />
              </div>

              {/* UPI QR Code */}
              <div
                style={{
                  background: '#ffffff',
                  padding: 16,
                  borderRadius: 'var(--radius-xl)',
                  display: 'inline-block',
                  margin: '0 auto 14px',
                  border: '2px solid rgba(109, 6, 38, 0.25)',
                  boxShadow: '0 12px 32px rgba(109, 6, 38, 0.15)',
                }}
              >
                <QRCodeSVG
                  value={getUpiPaymentUrl(pendingTicketData.code, pendingTicketData.planType)}
                  size={190}
                  level="H"
                  includeMargin={true}
                />
              </div>

              {/* UPI ID Badge with Copy */}
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: 8,
                  marginBottom: 12,
                }}
              >
                <div
                  style={{
                    background: '#FFFFFF',
                    border: '1.5px solid var(--color-border-subtle)',
                    padding: '6px 14px',
                    borderRadius: 'var(--radius-full)',
                    fontFamily: 'var(--font-mono)',
                    fontSize: 12,
                    fontWeight: 700,
                    color: 'var(--color-brand)',
                    display: 'flex',
                    alignItems: 'center',
                    gap: 8,
                  }}
                >
                  <span>UPI ID: {UPI_ID}</span>
                  <button
                    onClick={copyUpiId}
                    style={{
                      background: 'none',
                      border: 'none',
                      cursor: 'pointer',
                      color: copiedUpiId ? 'var(--color-success)' : 'var(--color-brand)',
                      display: 'flex',
                      alignItems: 'center',
                      padding: 0,
                    }}
                    title="Copy UPI ID"
                  >
                    {copiedUpiId ? <Check size={14} color="#16a34a" /> : <Copy size={14} />}
                  </button>
                </div>
                {copiedUpiId && (
                  <span style={{ fontSize: 11, fontFamily: 'var(--font-mono)', color: '#16a34a', fontWeight: 700 }}>
                    Copied!
                  </span>
                )}
              </div>

              {/* Accepted UPI Apps info */}
              <p
                style={{
                  fontSize: 11,
                  fontFamily: 'var(--font-mono)',
                  color: 'var(--color-text-secondary)',
                  margin: '0 0 14px',
                }}
              >
                Scan via Google Pay, PhonePe, Paytm, BHIM, Cred or any UPI app
              </p>

              {/* Optional Ref / UTR */}
              <div style={{ marginBottom: 16 }}>
                <input
                  type="text"
                  placeholder="Optional UPI Ref / UTR (last 4 digits)..."
                  value={upiTxnRef}
                  onChange={e => setUpiTxnRef(e.target.value)}
                  className="input w-full"
                  style={{
                    height: 36,
                    fontSize: 11,
                    fontFamily: 'var(--font-mono)',
                    borderRadius: 'var(--radius-md)',
                    textAlign: 'center',
                  }}
                />
              </div>

              {/* Actions */}
              <div style={{ display: 'flex', gap: 10 }}>
                <button
                  type="button"
                  onClick={() => setShowUpiModal(false)}
                  className="btn btn-secondary flex-1"
                  style={{ borderRadius: 'var(--radius-full)', height: 46 }}
                >
                  Cancel
                </button>
                <button
                  type="button"
                  disabled={isConfirmingPayment}
                  onClick={handleConfirmUpiPayment}
                  className="btn btn-primary flex-1"
                  style={{
                    borderRadius: 'var(--radius-full)',
                    height: 46,
                    fontFamily: 'var(--font-mono)',
                    fontSize: 12,
                    fontWeight: 800,
                    background: '#16a34a',
                    borderColor: '#16a34a',
                    color: '#FFFFFF',
                    boxShadow: '0 4px 14px rgba(22, 163, 74, 0.3)',
                  }}
                >
                  {isConfirmingPayment ? 'Confirming...' : `✅ Received ₹${pendingTicketData.planType} (Manual) → Issue Pass`}
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* ─── Modal 2: Cash Collection Prompt ("create ticket before collecting cash") */}
      <AnimatePresence>
        {cashCollectionModal && (
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
              padding: 24,
            }}
            onClick={() => setCashCollectionModal(null)}
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
                border: '2.5px solid #16a34a',
                borderRadius: 'var(--radius-2xl)',
                padding: '30px 24px',
                textAlign: 'center',
                boxShadow: '0 24px 64px rgba(22, 163, 74, 0.35)',
                position: 'relative',
              }}
            >
              <button
                onClick={() => setCashCollectionModal(null)}
                style={{
                  position: 'absolute',
                  top: 16,
                  right: 16,
                  background: 'none',
                  border: 'none',
                  color: 'var(--color-text-secondary)',
                  cursor: 'pointer',
                }}
              >
                <X size={20} />
              </button>

              {/* Status Header */}
              <div
                style={{
                  width: 56,
                  height: 56,
                  borderRadius: '50%',
                  background: 'rgba(22, 163, 74, 0.12)',
                  border: '2px solid rgba(22, 163, 74, 0.3)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  margin: '0 auto 14px',
                }}
              >
                <Banknote size={28} color="#16a34a" />
              </div>

              <div
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: 6,
                  background: 'rgba(22, 163, 74, 0.12)',
                  border: '1px solid rgba(22, 163, 74, 0.3)',
                  padding: '4px 14px',
                  borderRadius: 'var(--radius-full)',
                  color: '#16a34a',
                  fontFamily: 'var(--font-mono)',
                  fontSize: 11,
                  letterSpacing: '0.08em',
                  textTransform: 'uppercase',
                  fontWeight: 800,
                  marginBottom: 10,
                }}
              >
                <span>TICKET CREATED • COLLECT CASH</span>
              </div>

              <h2
                style={{
                  fontFamily: 'var(--font-mono)',
                  fontSize: 48,
                  fontWeight: 900,
                  color: 'var(--color-brand)',
                  letterSpacing: '0.12em',
                  margin: '4px 0',
                }}
              >
                #{cashCollectionModal.code}
              </h2>

              <p style={{ fontSize: 14, color: 'var(--color-text-primary)', fontWeight: 700, margin: '2px 0 14px' }}>
                Guest: {cashCollectionModal.customerName || 'Walk-in Guest'}
              </p>

              {/* Big Cash Due Alert Box */}
              <div
                style={{
                  background: 'rgba(22, 163, 74, 0.08)',
                  border: '2px solid #16a34a',
                  borderRadius: 'var(--radius-xl)',
                  padding: '16px 20px',
                  marginBottom: 18,
                  textAlign: 'center',
                }}
              >
                <span
                  style={{
                    fontSize: 11,
                    fontFamily: 'var(--font-mono)',
                    color: '#16a34a',
                    fontWeight: 800,
                    textTransform: 'uppercase',
                    letterSpacing: '0.08em',
                    display: 'block',
                    marginBottom: 4,
                  }}
                >
                  COLLECT FROM GUEST NOW
                </span>
                <span
                  style={{
                    fontSize: 36,
                    fontFamily: 'var(--font-display)',
                    fontWeight: 900,
                    color: '#16a34a',
                    display: 'block',
                  }}
                >
                  ₹{cashCollectionModal.paymentAmount ?? cashCollectionModal.planType ?? 99}/- CASH
                </span>
                <p
                  style={{
                    fontSize: 11,
                    fontFamily: 'var(--font-mono)',
                    color: 'var(--color-text-secondary)',
                    margin: '6px 0 0',
                  }}
                >
                  Ticket has been created in queue. Please collect ₹{cashCollectionModal.paymentAmount ?? cashCollectionModal.planType ?? 99} before handing the access pass to the guest.
                </p>
              </div>

              {/* Action Buttons */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                <button
                  type="button"
                  disabled={isConfirmingPayment}
                  onClick={() => handleConfirmCashCollected(cashCollectionModal)}
                  className="btn"
                  style={{
                    width: '100%',
                    height: 50,
                    borderRadius: 'var(--radius-full)',
                    fontFamily: 'var(--font-mono)',
                    fontSize: 13,
                    fontWeight: 800,
                    letterSpacing: '0.04em',
                    background: '#16a34a',
                    color: '#FFFFFF',
                    border: 'none',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: 8,
                    boxShadow: '0 8px 24px rgba(22, 163, 74, 0.35)',
                    cursor: 'pointer',
                  }}
                >
                  <Check size={18} />
                  <span>{isConfirmingPayment ? 'Updating...' : `✅ Cash Received (₹${cashCollectionModal.paymentAmount ?? cashCollectionModal.planType ?? 99}) → Hand Over Pass`}</span>
                </button>

                <button
                  type="button"
                  onClick={() => setCashCollectionModal(null)}
                  className="btn btn-ghost"
                  style={{
                    fontFamily: 'var(--font-mono)',
                    fontSize: 11,
                    color: 'var(--color-text-secondary)',
                    borderRadius: 'var(--radius-full)',
                  }}
                >
                  Collect Cash Later (Leave Ticket in Queue as Due)
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* ─── Modal 3: Financial Ledger & Payment Records Register ─────────── */}
      <AnimatePresence>
        {showFinancialLedgerModal && (
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
              padding: 24,
            }}
            onClick={() => setShowFinancialLedgerModal(false)}
          >
            <motion.div
              initial={{ scale: 0.94, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.94, opacity: 0 }}
              onClick={e => e.stopPropagation()}
              style={{
                width: '100%',
                maxWidth: 820,
                maxHeight: '90vh',
                background: 'var(--color-bg, #F7F1EA)',
                border: '2px solid rgba(22, 163, 74, 0.4)',
                borderRadius: 'var(--radius-2xl)',
                padding: '24px 28px',
                display: 'flex',
                flexDirection: 'column',
                boxShadow: '0 24px 64px rgba(0, 0, 0, 0.5)',
                position: 'relative',
                overflow: 'hidden',
              }}
            >
              {/* Header */}
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                  <div
                    style={{
                      width: 42,
                      height: 42,
                      borderRadius: 'var(--radius-lg)',
                      background: 'rgba(22, 163, 74, 0.12)',
                      border: '1.5px solid rgba(22, 163, 74, 0.3)',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                    }}
                  >
                    <Receipt size={22} color="#16a34a" />
                  </div>
                  <div>
                    <h2 style={{ fontFamily: 'var(--font-display)', fontSize: 20, fontWeight: 800, margin: 0 }}>
                      Photobooth Payment Records & Financial Ledger
                    </h2>
                    <p style={{ fontSize: 11, fontFamily: 'var(--font-mono)', color: 'var(--color-text-secondary)', margin: '2px 0 0' }}>
                      Real-time revenue tracking • UPI (9313780044@superyes) & Cash collections
                    </p>
                  </div>
                </div>

                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <button
                    onClick={exportLedgerCsv}
                    className="btn btn-secondary btn-sm"
                    style={{
                      borderRadius: 'var(--radius-full)',
                      fontFamily: 'var(--font-mono)',
                      fontSize: 11,
                      display: 'flex',
                      alignItems: 'center',
                      gap: 6,
                    }}
                    title="Export payments table as CSV spreadsheet"
                  >
                    <Download size={13} />
                    <span>Export CSV</span>
                  </button>

                  <button
                    onClick={() => setShowFinancialLedgerModal(false)}
                    style={{
                      background: 'none',
                      border: 'none',
                      color: 'var(--color-text-secondary)',
                      cursor: 'pointer',
                      padding: 4,
                    }}
                  >
                    <X size={20} />
                  </button>
                </div>
              </div>

              {/* 4 Financial Summary KPI Cards */}
              <div
                style={{
                  display: 'grid',
                  gridTemplateColumns: 'repeat(4, 1fr)',
                  gap: 12,
                  marginBottom: 20,
                }}
              >
                {/* Total Collected */}
                <div
                  style={{
                    background: '#FFFFFF',
                    border: '1.5px solid rgba(22, 163, 74, 0.35)',
                    borderRadius: 'var(--radius-lg)',
                    padding: '12px 16px',
                  }}
                >
                  <span style={{ fontSize: 10, fontFamily: 'var(--font-mono)', color: 'var(--color-text-secondary)', textTransform: 'uppercase', fontWeight: 700 }}>
                    Total Collected
                  </span>
                  <div style={{ fontSize: 24, fontFamily: 'var(--font-display)', fontWeight: 900, color: '#16a34a', marginTop: 2 }}>
                    ₹{financialStats.totalCollected}
                  </div>
                  <span style={{ fontSize: 10, fontFamily: 'var(--font-mono)', color: 'var(--color-text-tertiary)' }}>
                    {financialStats.totalPaidCount} tickets paid
                  </span>
                </div>

                {/* UPI Collected */}
                <div
                  style={{
                    background: '#FFFFFF',
                    border: '1.5px solid rgba(109, 6, 38, 0.25)',
                    borderRadius: 'var(--radius-lg)',
                    padding: '12px 16px',
                  }}
                >
                  <span style={{ fontSize: 10, fontFamily: 'var(--font-mono)', color: 'var(--color-text-secondary)', textTransform: 'uppercase', fontWeight: 700 }}>
                    UPI Revenue
                  </span>
                  <div style={{ fontSize: 24, fontFamily: 'var(--font-display)', fontWeight: 900, color: 'var(--color-brand)', marginTop: 2 }}>
                    ₹{financialStats.totalUpi}
                  </div>
                  <span style={{ fontSize: 10, fontFamily: 'var(--font-mono)', color: 'var(--color-text-tertiary)' }}>
                    {financialStats.upiCount} UPI passes
                  </span>
                </div>

                {/* Cash Collected */}
                <div
                  style={{
                    background: '#FFFFFF',
                    border: '1.5px solid rgba(22, 163, 74, 0.25)',
                    borderRadius: 'var(--radius-lg)',
                    padding: '12px 16px',
                  }}
                >
                  <span style={{ fontSize: 10, fontFamily: 'var(--font-mono)', color: 'var(--color-text-secondary)', textTransform: 'uppercase', fontWeight: 700 }}>
                    Cash Collected
                  </span>
                  <div style={{ fontSize: 24, fontFamily: 'var(--font-display)', fontWeight: 900, color: '#16a34a', marginTop: 2 }}>
                    ₹{financialStats.totalCash}
                  </div>
                  <span style={{ fontSize: 10, fontFamily: 'var(--font-mono)', color: 'var(--color-text-tertiary)' }}>
                    {financialStats.cashCount} cash tickets
                  </span>
                </div>

                {/* Pending Cash */}
                <div
                  style={{
                    background: '#FFFFFF',
                    border: '1.5px solid rgba(180, 83, 9, 0.3)',
                    borderRadius: 'var(--radius-lg)',
                    padding: '12px 16px',
                  }}
                >
                  <span style={{ fontSize: 10, fontFamily: 'var(--font-mono)', color: 'var(--color-text-secondary)', textTransform: 'uppercase', fontWeight: 700 }}>
                    Pending Cash Due
                  </span>
                  <div style={{ fontSize: 24, fontFamily: 'var(--font-display)', fontWeight: 900, color: financialStats.pendingCash > 0 ? '#b45309' : '#16a34a', marginTop: 2 }}>
                    ₹{financialStats.pendingCash}
                  </div>
                  <span style={{ fontSize: 10, fontFamily: 'var(--font-mono)', color: 'var(--color-text-tertiary)' }}>
                    {financialStats.pendingCashCount} tickets waiting
                  </span>
                </div>
              </div>

              {/* Filter Tabs & Search Bar */}
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  gap: 12,
                  marginBottom: 14,
                }}
              >
                {/* Tabs */}
                <div
                  style={{
                    display: 'flex',
                    gap: 6,
                    background: 'var(--color-surface)',
                    padding: 3,
                    borderRadius: 'var(--radius-full)',
                    border: '1px solid var(--color-border-subtle)',
                  }}
                >
                  {(['ALL', 'UPI', 'CASH', 'PENDING'] as const).map(tab => {
                    const isActive = ledgerFilter === tab
                    const count =
                      tab === 'ALL' ? tickets.length :
                      tab === 'UPI' ? financialStats.upiCount :
                      tab === 'CASH' ? financialStats.cashCount :
                      financialStats.pendingCashCount

                    return (
                      <button
                        key={tab}
                        onClick={() => setLedgerFilter(tab)}
                        style={{
                          padding: '5px 14px',
                          borderRadius: 'var(--radius-full)',
                          border: 'none',
                          background: isActive ? 'var(--color-brand)' : 'transparent',
                          color: isActive ? '#FFFFFF' : 'var(--color-text-primary)',
                          fontFamily: 'var(--font-mono)',
                          fontSize: 11,
                          fontWeight: 700,
                          cursor: 'pointer',
                          display: 'flex',
                          alignItems: 'center',
                          gap: 6,
                        }}
                      >
                        <span>{tab}</span>
                        <span
                          style={{
                            fontSize: 10,
                            padding: '1px 6px',
                            borderRadius: 'var(--radius-full)',
                            background: isActive ? 'rgba(255, 255, 255, 0.25)' : 'rgba(0, 0, 0, 0.08)',
                          }}
                        >
                          {count}
                        </span>
                      </button>
                    )
                  })}
                </div>

                {/* Search */}
                <div style={{ position: 'relative', width: 220 }}>
                  <input
                    type="text"
                    placeholder="Search code, guest..."
                    value={ledgerSearchQuery}
                    onChange={e => setLedgerSearchQuery(e.target.value)}
                    className="input w-full"
                    style={{
                      height: 34,
                      paddingLeft: 30,
                      fontSize: 11,
                      fontFamily: 'var(--font-mono)',
                      borderRadius: 'var(--radius-full)',
                      background: '#FFFFFF',
                    }}
                  />
                  <Search size={14} color="var(--color-brand)" style={{ position: 'absolute', left: 10, top: 10 }} />
                </div>
              </div>

              {/* Transactions List */}
              <div
                style={{
                  flex: 1,
                  overflowY: 'auto',
                  background: '#FFFFFF',
                  borderRadius: 'var(--radius-lg)',
                  border: '1px solid var(--color-border-subtle)',
                  padding: 8,
                }}
              >
                {filteredLedgerTickets.length === 0 ? (
                  <div style={{ textAlign: 'center', padding: '40px 20px', color: 'var(--color-text-tertiary)' }}>
                    <Receipt size={32} style={{ opacity: 0.3, margin: '0 auto 8px' }} />
                    <p style={{ fontFamily: 'var(--font-mono)', fontSize: 12 }}>No transactions match this filter</p>
                  </div>
                ) : (
                  <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12, fontFamily: 'var(--font-mono)' }}>
                    <thead>
                      <tr style={{ borderBottom: '1px solid var(--color-border-subtle)', textAlign: 'left', color: 'var(--color-text-secondary)', fontSize: 10 }}>
                        <th style={{ padding: '8px 12px' }}>TICKET</th>
                        <th style={{ padding: '8px 12px' }}>GUEST NAME</th>
                        <th style={{ padding: '8px 12px' }}>METHOD</th>
                        <th style={{ padding: '8px 12px' }}>AMOUNT</th>
                        <th style={{ padding: '8px 12px' }}>STATUS</th>
                        <th style={{ padding: '8px 12px' }}>TIME</th>
                        <th style={{ padding: '8px 12px', textAlign: 'right' }}>ACTION</th>
                      </tr>
                    </thead>
                    <tbody>
                      {filteredLedgerTickets.map(t => {
                        const isPaid = t.paymentStatus === 'PAID'
                        return (
                          <tr
                            key={t.id}
                            style={{
                              borderBottom: '1px solid rgba(0, 0, 0, 0.04)',
                              transition: 'background 0.15s',
                            }}
                          >
                            <td style={{ padding: '8px 12px', fontWeight: 800, color: 'var(--color-brand)' }}>
                              #{t.code}
                            </td>
                            <td style={{ padding: '8px 12px', color: 'var(--color-text-primary)' }}>
                              {t.customerName || 'Walk-in'}
                            </td>
                            <td style={{ padding: '8px 12px' }}>
                              {t.paymentMethod === 'UPI' ? (
                                <span style={{ color: 'var(--color-brand)', background: 'rgba(109, 6, 38, 0.08)', padding: '2px 8px', borderRadius: 'var(--radius-full)', fontWeight: 700, fontSize: 10 }}>
                                  UPI
                                </span>
                              ) : (
                                <span style={{ color: '#16a34a', background: 'rgba(22, 163, 74, 0.08)', padding: '2px 8px', borderRadius: 'var(--radius-full)', fontWeight: 700, fontSize: 10 }}>
                                  CASH
                                </span>
                              )}
                            </td>
                            <td style={{ padding: '8px 12px', fontWeight: 800, color: '#16a34a' }}>
                              ₹{t.paymentAmount ?? t.planType ?? 99}
                            </td>
                            <td style={{ padding: '8px 12px' }}>
                              {isPaid ? (
                                <span style={{ color: '#16a34a', fontWeight: 700, display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                                  <CheckCircle2 size={12} />
                                  PAID
                                </span>
                              ) : (
                                <span style={{ color: '#b45309', background: 'rgba(180, 83, 9, 0.1)', padding: '2px 6px', borderRadius: 4, fontWeight: 700, fontSize: 10 }}>
                                  DUE
                                </span>
                              )}
                            </td>
                            <td style={{ padding: '8px 12px', color: 'var(--color-text-tertiary)', fontSize: 10 }}>
                              {formatElapsed(t.createdAt)}
                            </td>
                            <td style={{ padding: '8px 12px', textAlign: 'right' }}>
                              {!isPaid && t.paymentMethod === 'CASH' ? (
                                <button
                                  onClick={() => handleConfirmCashCollected(t)}
                                  className="btn btn-sm"
                                  style={{
                                    fontSize: 10,
                                    fontFamily: 'var(--font-mono)',
                                    padding: '2px 8px',
                                    height: 22,
                                    borderRadius: 'var(--radius-full)',
                                    background: '#16a34a',
                                    color: '#FFFFFF',
                                    border: 'none',
                                    cursor: 'pointer',
                                  }}
                                >
                                  Collect ₹{t.paymentAmount ?? t.planType ?? 99}
                                </button>
                              ) : (
                                <button
                                  onClick={() => {
                                    setShowFinancialLedgerModal(false)
                                    setIssuedTicketModal(t)
                                  }}
                                  className="btn btn-ghost btn-sm"
                                  style={{ fontSize: 10, fontFamily: 'var(--font-mono)', padding: '2px 6px', height: 22 }}
                                >
                                  Pass
                                </button>
                              )}
                            </td>
                          </tr>
                        )
                      })}
                    </tbody>
                  </table>
                )}
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* ─── Modal: Confirm Reset Queue ─────────────────────────────────────── */}
      <AnimatePresence>
        {showResetConfirm && (
          <div
            style={{
              position: 'fixed',
              inset: 0,
              backgroundColor: 'rgba(0, 0, 0, 0.85)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              zIndex: 9999,
              padding: 24,
            }}
          >
            <div
              style={{
                width: '100%',
                maxWidth: 400,
                background: 'var(--color-bg-surface)',
                border: '1px solid rgba(239, 68, 68, 0.4)',
                borderRadius: 'var(--radius-xl)',
                padding: 24,
                textAlign: 'center',
              }}
            >
              <AlertTriangle size={36} color="#ef4444" style={{ margin: '0 auto 12px' }} />
              <h3 style={{ fontSize: 18, fontFamily: 'var(--font-display)', marginBottom: 8 }}>
                Reset Ticket Queue?
              </h3>
              <p style={{ fontSize: 13, color: 'var(--color-text-secondary)', marginBottom: 20 }}>
                This will clear all waiting and active tickets for a fresh event start.
              </p>
              <div style={{ display: 'flex', gap: 10 }}>
                <button
                  onClick={() => setShowResetConfirm(false)}
                  className="btn btn-secondary flex-1"
                  style={{ borderRadius: 'var(--radius-full)' }}
                >
                  Cancel
                </button>
                <button
                  onClick={async () => {
                    await resetQueue()
                    setShowResetConfirm(false)
                  }}
                  className="btn btn-primary flex-1"
                  style={{ borderRadius: 'var(--radius-full)', background: '#ef4444', borderColor: '#ef4444' }}
                >
                  Yes, Reset Queue
                </button>
              </div>
            </div>
          </div>
        )}
      </AnimatePresence>
    </div>
  )
}

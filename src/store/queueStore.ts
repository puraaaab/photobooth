import { create } from 'zustand'
import type { Ticket, TicketStatus, TicketPlan } from '@/types'
import { isValidPlan, DEFAULT_PLAN } from '@/constants/pricing'

const SERVER_BASE = typeof window !== 'undefined' && window.location.hostname
  ? `http://${window.location.hostname}:3847`
  : 'http://localhost:3847'

const LOCAL_STORAGE_KEY = 'photobooth_offline_tickets_v1'

export function generateRandomTicketCode(existingTickets: Ticket[] = []): string {
  const existing = new Set(existingTickets.map(t => t.code))
  for (let i = 0; i < 10000; i++) {
    const code = String(Math.floor(1000 + Math.random() * 9000))
    if (!existing.has(code)) return code
  }
  const active = new Set(
    existingTickets
      .filter(t => t.status === 'WAITING' || t.status === 'IN_BOOTH' || t.status === 'EDITING')
      .map(t => t.code)
  )
  for (let i = 0; i < 10000; i++) {
    const code = String(Math.floor(1000 + Math.random() * 9000))
    if (!active.has(code)) return code
  }
  return String(Math.floor(1000 + Math.random() * 9000))
}

function loadOfflineTickets(): { tickets: Ticket[]; nextCode: string } {
  try {
    const raw = localStorage.getItem(LOCAL_STORAGE_KEY)
    if (raw) {
      const parsed = JSON.parse(raw)
      const tickets = Array.isArray(parsed.tickets) ? parsed.tickets : []
      return {
        tickets,
        nextCode: parsed.nextCode && /^\d{4}$/.test(parsed.nextCode)
          ? parsed.nextCode
          : generateRandomTicketCode(tickets),
      }
    }
  } catch (e) {
    console.warn('[QueueStore] Failed reading localStorage tickets:', e)
  }
  return { tickets: [], nextCode: generateRandomTicketCode([]) }
}

function saveOfflineTickets(tickets: Ticket[], nextCode: string) {
  try {
    localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify({ tickets, nextCode }))
  } catch (e) {
    console.warn('[QueueStore] Failed saving localStorage tickets:', e)
  }
}

interface QueueState {
  tickets: Ticket[]
  activeTicket: Ticket | null
  nextCode: string
  isLoading: boolean
  error: string | null
  lastSyncTime: number

  // Actions
  fetchTickets: () => Promise<void>
  issueTicket: (data: {
    customerName?: string
    customerPhone?: string
    notes?: string
    code?: string
    paymentMethod?: 'UPI' | 'CASH'
    paymentAmount?: number
    paymentStatus?: 'PAID' | 'PENDING'
    paidAt?: string
    upiTransactionRef?: string
    planType?: TicketPlan
  }) => Promise<Ticket>
  claimTicket: (code: string, sessionId?: string) => Promise<{ success: boolean; ticket?: Ticket; error?: string }>
  updateTicketStatus: (
    ticketId: string,
    status: TicketStatus,
    meta?: { photoCount?: number; printCount?: number; sessionId?: string }
  ) => Promise<Ticket | null>
  updateTicketPayment: (
    ticketId: string,
    payment: {
      paymentStatus: 'PAID' | 'PENDING'
      paymentMethod?: 'UPI' | 'CASH'
      paymentAmount?: number
      paidAt?: string
      upiTransactionRef?: string
      planType?: TicketPlan
    },
    opts?: { staffPin?: string }
  ) => Promise<Ticket | null>
  resetQueue: () => Promise<void>
  deleteTicket: (ticketId: string) => Promise<void>
  setActiveTicket: (ticket: Ticket | null) => void

  // Socket sync handlers
  handleSocketTicketIssued: (ticket: Ticket) => void
  handleSocketTicketClaimed: (ticket: Ticket) => void
  handleSocketTicketUpdated: (ticket: Ticket) => void
  handleSocketQueueUpdated: (data: { tickets: Ticket[]; nextCode: string }) => void
  handleSocketQueueReset: () => void
}

export const useQueueStore = create<QueueState>()((set, get) => {
  const initialOffline = typeof window !== 'undefined' ? loadOfflineTickets() : { tickets: [], nextCode: '1001' }

  return {
    tickets: initialOffline.tickets,
    activeTicket: null,
    nextCode: initialOffline.nextCode,
    isLoading: false,
    error: null,
    lastSyncTime: 0,

    setActiveTicket: (activeTicket) => set({ activeTicket }),

    // ─── Fetch All Tickets ──────────────────────────────────────────────────
    fetchTickets: async () => {
      set({ isLoading: true, error: null })
      try {
        const res = await fetch(`${SERVER_BASE}/api/tickets`)
        if (res.ok) {
          const data = await res.json()
          // NEVER re-roll nextCode on a poll — only preserve what we have or
          // take the server value if the server explicitly tracks it.
          const currentCode = get().nextCode
          // Only use server nextCode if it's a valid 4-digit code we don't already have
          const next = (data.nextCode && /^\d{4}$/.test(data.nextCode))
            ? data.nextCode
            : currentCode   // ← keep current code, do NOT regenerate
          set({
            tickets: data.tickets || [],
            nextCode: next,
            isLoading: false,
            lastSyncTime: Date.now(),
          })
          saveOfflineTickets(data.tickets || [], next)
          return
        }
      } catch (err) {
        console.warn('[QueueStore] Backend offline, using local state:', err)
      }

      // Offline fallback: always preserve the current code — never regenerate
      const currentCode = get().nextCode
      const fallback = loadOfflineTickets()
      // Use in-memory current first, then localStorage, never generate fresh
      const stableNext = currentCode || fallback.nextCode
      set({
        tickets: fallback.tickets,
        nextCode: stableNext,
        isLoading: false,
      })
    },

    // ─── Issue Ticket ───────────────────────────────────────────────────────
    issueTicket: async (input) => {
      set({ isLoading: true, error: null })
      let refused: string | null = null
      try {
        const res = await fetch(`${SERVER_BASE}/api/tickets/issue`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(input),
        })

        if (res.ok) {
          const { ticket, nextCode: serverNextCode } = await res.json()
          set(state => {
            const updated = [ticket, ...state.tickets.filter(t => t.id !== ticket.id)]
            // Only after issue: advance to the next random ticket code!
            const next = serverNextCode || generateRandomTicketCode(updated)
            saveOfflineTickets(updated, next)
            return {
              tickets: updated,
              nextCode: next,
              isLoading: false,
            }
          })
          return ticket
        }
        // The server answered and said no (e.g. guest iPad without staff PIN): never invent a
        // local "offline" ticket — that would let an unpaid guest through.
        const d = await res.json().catch(() => ({}))
        refused = d.error || `Ticket could not be issued (${res.status})`
      } catch (err) {
        console.warn('[QueueStore] Offline issue ticket fallback:', err)
      }
      if (refused) {
        set({ isLoading: false, error: refused })
        throw new Error(refused)
      }

      // Offline fallback generation
      const state = get()
      let code = input.code ? input.code.trim() : state.nextCode
      if (!/^\d{4}$/.test(code)) code = state.nextCode

      // If code already taken by active ticket, pick new random code
      if (state.tickets.some(t => t.code === code && (t.status === 'WAITING' || t.status === 'IN_BOOTH' || t.status === 'EDITING'))) {
        code = generateRandomTicketCode(state.tickets)
      }

      const planType = input.planType || (isValidPlan(input.paymentAmount) ? (input.paymentAmount as TicketPlan) : (DEFAULT_PLAN as TicketPlan))
      const paymentAmount = input.paymentAmount !== undefined ? input.paymentAmount : (planType ?? (input.paymentMethod ? 99 : undefined))
      const paymentStatus = input.paymentStatus || (input.paymentMethod === 'UPI' ? 'PAID' : (input.paymentMethod === 'CASH' ? 'PENDING' : undefined))
      const paidAt = input.paidAt || (paymentStatus === 'PAID' ? new Date().toISOString() : undefined)

      const newTicket: Ticket = {
        id: `T-${code}-${Date.now().toString(36).slice(-4)}`,
        code,
        customerName: input.customerName?.trim(),
        customerPhone: input.customerPhone?.trim(),
        notes: input.notes?.trim(),
        status: 'WAITING',
        createdAt: new Date().toISOString(),
        photoCount: 0,
        printCount: 0,
        paymentMethod: input.paymentMethod || undefined,
        paymentAmount,
        paymentStatus,
        paidAt,
        upiTransactionRef: input.upiTransactionRef?.trim() || undefined,
        planType,
      }

      const updated = [newTicket, ...state.tickets.filter(t => t.id !== newTicket.id)]
      const next = generateRandomTicketCode(updated)
      saveOfflineTickets(updated, next)
      set({ tickets: updated, nextCode: next, isLoading: false })
      return newTicket
    },

    // ─── Claim Ticket (Inside Booth) ────────────────────────────────────────
    claimTicket: async (code, sessionId) => {
      const cleanCode = code.trim()
      set({ isLoading: true, error: null })

      try {
        const res = await fetch(`${SERVER_BASE}/api/tickets/claim`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ code: cleanCode, sessionId }),
        })

        const data = await res.json()
        if (res.ok && data.success && data.ticket) {
          set(state => {
            const updated = state.tickets.map(t =>
              t.id === data.ticket.id || t.code === data.ticket.code ? data.ticket : t
            )
            saveOfflineTickets(updated, state.nextCode)
            return {
              tickets: updated,
              activeTicket: data.ticket,
              isLoading: false,
            }
          })
          return { success: true, ticket: data.ticket }
        } else {
          set({ isLoading: false, error: data.error || 'Failed to claim ticket' })
          return { success: false, error: data.error || 'Ticket not found or already used' }
        }
      } catch (err) {
        console.warn('[QueueStore] Offline claim fallback:', err)
      }

      // Offline fallback claim
      const state = get()
      const found = state.tickets.find(t => t.code === cleanCode)
      if (!found) {
        set({ isLoading: false, error: `Ticket #${cleanCode} not found` })
        return { success: false, error: `Ticket #${cleanCode} not found` }
      }

      if (found.status === 'COMPLETED') {
        set({ isLoading: false, error: `Ticket #${cleanCode} is already completed` })
        return { success: false, error: `Ticket #${cleanCode} is already completed` }
      }

      const claimed: Ticket = {
        ...found,
        status: 'IN_BOOTH',
        claimedAt: found.claimedAt || new Date().toISOString(),
        startedAt: found.startedAt || new Date().toISOString(),
        sessionId: sessionId || found.sessionId,
      }

      const updated = state.tickets.map(t => (t.id === claimed.id ? claimed : t))
      saveOfflineTickets(updated, state.nextCode)
      set({
        tickets: updated,
        activeTicket: claimed,
        isLoading: false,
      })
      return { success: true, ticket: claimed }
    },

    // ─── Update Ticket Status ───────────────────────────────────────────────
    updateTicketStatus: async (ticketId, status, meta) => {
      try {
        const res = await fetch(`${SERVER_BASE}/api/tickets/${ticketId}/status`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ status, ...meta }),
        })

        if (res.ok) {
          const { ticket } = await res.json()
          set(state => {
            const updated = state.tickets.map(t =>
              t.id === ticket.id || t.code === ticket.code ? ticket : t
            )
            const activeTicket = state.activeTicket?.id === ticket.id ? ticket : state.activeTicket
            saveOfflineTickets(updated, state.nextCode)
            return { tickets: updated, activeTicket }
          })
          return ticket
        }
      } catch (err) {
        console.warn('[QueueStore] Offline status update fallback:', err)
      }

      // Offline update
      const state = get()
      const current = state.tickets.find(t => t.id === ticketId || t.code === ticketId)
      if (!current) return null

      const updatedTicket: Ticket = {
        ...current,
        status,
        completedAt: status === 'COMPLETED' ? new Date().toISOString() : current.completedAt,
        photoCount: meta?.photoCount !== undefined ? meta.photoCount : current.photoCount,
        printCount: meta?.printCount !== undefined ? (current.printCount || 0) + meta.printCount : current.printCount,
        sessionId: meta?.sessionId || current.sessionId,
      }

      const updated = state.tickets.map(t => (t.id === updatedTicket.id ? updatedTicket : t))
      const activeTicket = state.activeTicket?.id === updatedTicket.id ? updatedTicket : state.activeTicket
      saveOfflineTickets(updated, state.nextCode)
      set({ tickets: updated, activeTicket })
      return updatedTicket
    },

    // ─── Update Ticket Payment ──────────────────────────────────────────────
    updateTicketPayment: async (ticketId, payment, opts) => {
      try {
        const headers: Record<string, string> = { 'Content-Type': 'application/json' }
        if (opts?.staffPin) headers['X-Staff-Pin'] = opts.staffPin
        const res = await fetch(`${SERVER_BASE}/api/tickets/${ticketId}/payment`, {
          method: 'POST',
          headers,
          body: JSON.stringify(payment),
        })

        // The server answered and refused (e.g. 403 staff PIN required). Do NOT fall through to
        // the offline path — that used to mark tickets PAID locally even though nobody approved it.
        if (!res.ok) {
          console.warn('[QueueStore] Payment update rejected:', res.status)
          return null
        }

        if (res.ok) {
          const { ticket } = await res.json()
          set(state => {
            const updated = state.tickets.map(t =>
              t.id === ticket.id || t.code === ticket.code ? ticket : t
            )
            const activeTicket = state.activeTicket?.id === ticket.id ? ticket : state.activeTicket
            saveOfflineTickets(updated, state.nextCode)
            return { tickets: updated, activeTicket }
          })
          return ticket
        }
      } catch (err) {
        console.warn('[QueueStore] Offline payment update fallback:', err)
      }

      // Offline payment update
      const state = get()
      const current = state.tickets.find(t => t.id === ticketId || t.code === ticketId)
      if (!current) return null

      const updatedTicket: Ticket = {
        ...current,
        paymentStatus: payment.paymentStatus,
        paymentMethod: payment.paymentMethod || current.paymentMethod,
        paymentAmount: payment.paymentAmount !== undefined ? payment.paymentAmount : (current.paymentAmount ?? current.planType ?? 99),
        paidAt: payment.paymentStatus === 'PAID' ? (payment.paidAt || new Date().toISOString()) : (payment.paymentStatus === 'PENDING' ? undefined : current.paidAt),
        upiTransactionRef: payment.upiTransactionRef !== undefined ? payment.upiTransactionRef : current.upiTransactionRef,
        planType: payment.planType !== undefined ? payment.planType : current.planType,
      }

      const updated = state.tickets.map(t => (t.id === updatedTicket.id ? updatedTicket : t))
      const activeTicket = state.activeTicket?.id === updatedTicket.id ? updatedTicket : state.activeTicket
      saveOfflineTickets(updated, state.nextCode)
      set({ tickets: updated, activeTicket })
      return updatedTicket
    },

    // ─── Reset Queue ────────────────────────────────────────────────────────
    resetQueue: async () => {
      try {
        await fetch(`${SERVER_BASE}/api/tickets/reset`, { method: 'POST' })
      } catch (err) {
        console.warn('[QueueStore] Offline reset fallback:', err)
      }
      const freshCode = generateRandomTicketCode([])
      saveOfflineTickets([], freshCode)
      set({ tickets: [], activeTicket: null, nextCode: freshCode })
    },

    // ─── Delete Ticket ──────────────────────────────────────────────────────
    deleteTicket: async (ticketId) => {
      try {
        await fetch(`${SERVER_BASE}/api/tickets/${ticketId}`, { method: 'DELETE' })
      } catch (err) {
        console.warn('[QueueStore] Offline delete fallback:', err)
      }
      set(state => {
        const updated = state.tickets.filter(t => t.id !== ticketId && t.code !== ticketId)
        saveOfflineTickets(updated, state.nextCode)
        return {
          tickets: updated,
          activeTicket: state.activeTicket?.id === ticketId ? null : state.activeTicket,
        }
      })
    },

    // A ticket was issued (possibly from another connected device via socket).
    // ONLY add it to the list — do NOT re-roll nextCode here.
    // nextCode only advances when THIS device calls issueTicket().
    handleSocketTicketIssued: (ticket) => {
      set(state => {
        if (state.tickets.some(t => t.id === ticket.id)) return state
        const updated = [ticket, ...state.tickets]
        saveOfflineTickets(updated, state.nextCode)  // preserve existing code
        return { tickets: updated }  // nextCode unchanged
      })
    },

    handleSocketTicketClaimed: (ticket) => {
      set(state => {
        const updated = state.tickets.map(t => (t.id === ticket.id || t.code === ticket.code ? ticket : t))
        saveOfflineTickets(updated, state.nextCode)
        return {
          tickets: updated,
          activeTicket: state.activeTicket?.id === ticket.id ? ticket : state.activeTicket,
        }
      })
    },

    handleSocketTicketUpdated: (ticket) => {
      set(state => {
        const updated = state.tickets.map(t => (t.id === ticket.id || t.code === ticket.code ? ticket : t))
        saveOfflineTickets(updated, state.nextCode)
        return {
          tickets: updated,
          activeTicket: state.activeTicket?.id === ticket.id ? ticket : state.activeTicket,
        }
      })
    },

    handleSocketQueueUpdated: (data) => {
      if (Array.isArray(data.tickets)) {
        // Only accept server's nextCode if it's explicitly a valid 4-digit code.
        // Never generate a new random code from a queue sync event.
        const currentCode = get().nextCode
        const next = (data.nextCode && /^\d{4}$/.test(data.nextCode))
          ? data.nextCode
          : currentCode   // ← preserve, do NOT regenerate
        set({
          tickets: data.tickets,
          nextCode: next,
          lastSyncTime: Date.now(),
        })
        saveOfflineTickets(data.tickets, next)
      }
    },

    handleSocketQueueReset: () => {
      const currentCode = get().nextCode
      set({ tickets: [], activeTicket: null })
      saveOfflineTickets([], currentCode)
    },
  }
})

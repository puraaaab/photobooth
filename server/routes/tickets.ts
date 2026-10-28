import { Router, Request, Response } from 'express'
import { getTicketManager, getVaultManager, getDataPath, io } from '../index'
import type { TicketStatus } from '../ticketManager'
import { spawn } from 'child_process'
import { requireStaff, isStaff, cleanTicketCode, clientIp } from '../security'
import { isValidPlan, PLAN_PRICES, DEFAULT_PLAN } from '../../src/constants/pricing'
import * as path from 'path'
import * as fs from 'fs'

export const ticketRouter = Router()

// ─── Code-guessing lockout ───────────────────────────────────────────────────
// Ticket codes are 4 digits; with ~20 paid tickets waiting, a random guess hits one 1 in 450 times.
// Guest stations get MAX_MISSES wrong codes per window, then a cool-down. Staff are never limited.
const MAX_MISSES = 6
const MISS_WINDOW_MS = 5 * 60 * 1000
const LOCKOUT_MS = 3 * 60 * 1000
const misses = new Map<string, { count: number; first: number; lockedUntil: number }>()

function guessLocked(req: Request): number {
  if (isStaff(req)) return 0
  const m = misses.get(clientIp(req))
  return m && m.lockedUntil > Date.now() ? Math.ceil((m.lockedUntil - Date.now()) / 1000) : 0
}

function recordMiss(req: Request) {
  if (isStaff(req)) return
  const ip = clientIp(req)
  const now = Date.now()
  const m = misses.get(ip)
  const entry = !m || now - m.first > MISS_WINDOW_MS ? { count: 0, first: now, lockedUntil: 0 } : m
  entry.count++
  if (entry.count >= MAX_MISSES) {
    entry.lockedUntil = now + LOCKOUT_MS
    entry.count = 0
    entry.first = now
  }
  misses.set(ip, entry)
}

function lockedResponse(res: Response, seconds: number) {
  res.setHeader('Retry-After', String(seconds))
  return res.status(429).json({ error: `Too many wrong ticket codes. Please wait ${Math.ceil(seconds / 60)} min or ask staff.`, code: 'TOO_MANY_ATTEMPTS', retryAfter: seconds })
}

// ─── GET /api/tickets ────────────────────────────────────────────────────────
ticketRouter.get('/', (req: Request, res: Response) => {
  const manager = getTicketManager()
  if (!manager) {
    return res.status(503).json({ error: 'Ticket manager not ready' })
  }

  const tickets = manager.listTickets()
  res.json({
    tickets,
    nextCode: manager.getNextCode(),
    activeCount: tickets.filter(t => t.status === 'WAITING' || t.status === 'IN_BOOTH' || t.status === 'EDITING').length,
    waitingCount: tickets.filter(t => t.status === 'WAITING').length,
    completedCount: tickets.filter(t => t.status === 'COMPLETED').length,
    // Revenue figures are for the ticket desk only, not guest-facing stations
    financialSummary: isStaff(req) ? manager.getFinancialSummary() : undefined,
  })
})

// ─── GET /api/tickets/financial ──────────────────────────────────────────────
ticketRouter.get('/financial', requireStaff, (_req: Request, res: Response) => {
  const manager = getTicketManager()
  if (!manager) {
    return res.status(503).json({ error: 'Ticket manager not ready' })
  }
  res.json(manager.getFinancialSummary())
})

// ─── GET /api/tickets/next-code ──────────────────────────────────────────────
ticketRouter.get('/next-code', (_req: Request, res: Response) => {
  const manager = getTicketManager()
  if (!manager) {
    return res.status(503).json({ error: 'Ticket manager not ready' })
  }
  res.json({ nextCode: manager.getNextCode() })
})

// ─── GET /api/tickets/:code ──────────────────────────────────────────────────
ticketRouter.get('/:code', (req: Request, res: Response) => {
  const manager = getTicketManager()
  if (!manager) {
    return res.status(503).json({ error: 'Ticket manager not ready' })
  }

  const locked = guessLocked(req)
  if (locked) return lockedResponse(res, locked)

  const rawCode = req.params.code as string
  const cleanCode = rawCode.replace(/^#/, '').trim()
  const ticket = manager.getTicketByCode(cleanCode) || manager.getTicketById(cleanCode)

  if (!ticket) {
    recordMiss(req)
    return res.status(404).json({ error: `Ticket #${cleanCode} not found` })
  }

  const vault = getVaultManager()
  let vaultInfo = null
  try {
    vaultInfo = vault && isStaff(req) ? vault.getVaultInfo(ticket.code) : null
  } catch {}

  res.json({ ticket, vault: vaultInfo })
})

// ─── GET /api/tickets/:code/vault ────────────────────────────────────────────
// Inspect customer's photo folder on disk
ticketRouter.get('/:code/vault', requireStaff, (req: Request, res: Response) => {
  const cleanCode = cleanTicketCode(req.params.code)
  if (!cleanCode) {
    return res.status(400).json({ error: 'Ticket code must be exactly 4 digits' })
  }
  const vault = getVaultManager()

  if (!vault) {
    return res.status(503).json({ error: 'Vault manager not ready' })
  }

  const vaultInfo = vault.getVaultInfo(cleanCode)
  res.json({
    ticketCode: cleanCode,
    folderPath: vaultInfo.folderPath,
    exists: vaultInfo.exists,
    photoCount: vaultInfo.photos.length,
    stripCount: vaultInfo.strips.length,
    photos: vaultInfo.photos.map(p => ({
      filename: p,
      url: `/vault/${cleanCode}/originals/${p}`,
      thumbUrl: `/vault/${cleanCode}/thumbnails/${p}`,
    })),
    strips: vaultInfo.strips.map(s => ({
      filename: s,
      url: `/vault/${cleanCode}/strips/${s}`,
    })),
    manifest: vaultInfo.manifest,
  })
})

// ─── POST /api/tickets/:code/open-folder ──────────────────────────────────────
// Opens the ticket media folder in OS File Explorer (Windows)
ticketRouter.post('/:code/open-folder', requireStaff, (req: Request, res: Response) => {
  // Strict validation: this value used to be interpolated into a shell command (remote code execution).
  const cleanCode = cleanTicketCode(req.params.code)
  if (!cleanCode) {
    return res.status(400).json({ error: 'Ticket code must be exactly 4 digits' })
  }
  const vault = getVaultManager()
  const folderPath = vault ? vault.getTicketDir(cleanCode) : path.join(getDataPath(), 'tickets_vault', `Ticket_${cleanCode}`)

  fs.mkdirSync(folderPath, { recursive: true })

  // No shell: the path is passed as a single argv entry
  const opener = process.platform === 'win32' ? 'explorer' : process.platform === 'darwin' ? 'open' : 'xdg-open'
  try {
    const child = spawn(opener, [folderPath], { detached: true, stdio: 'ignore', shell: false })
    child.on('error', (err) => console.warn('[Tickets] Failed opening folder:', err))
    child.unref()
  } catch (err) {
    console.warn('[Tickets] Failed opening folder:', err)
  }

  res.json({ success: true, folderPath })
})

// ─── POST /api/tickets/issue ─────────────────────────────────────────────────
ticketRouter.post('/issue', requireStaff, (req: Request, res: Response) => {
  const manager = getTicketManager()
  if (!manager) {
    return res.status(503).json({ error: 'Ticket manager not ready' })
  }

  const {
    customerName,
    customerPhone,
    notes,
    code,
    paymentMethod,
    paymentAmount,
    paymentStatus,
    paidAt,
    upiTransactionRef,
    planType,
  } = req.body || {}

  // ─── VALIDATIONS ───────────────────────────────────────────────────────────
  // 1. Code Validation
  let validatedCode: string | undefined
  if (code !== undefined && code !== null && String(code).trim() !== '') {
    const rawCode = String(code).replace(/^#/, '').trim()
    if (!/^\d{4}$/.test(rawCode)) {
      return res.status(400).json({ error: 'Custom ticket code must be exactly 4 numeric digits (e.g. 1001)' })
    }
    // Check collision with currently active tickets
    const activeCollision = manager.listTickets().some(
      t => t.code === rawCode && (t.status === 'WAITING' || t.status === 'IN_BOOTH' || t.status === 'EDITING')
    )
    if (activeCollision) {
      return res.status(409).json({ error: `Ticket code #${rawCode} is currently in use by an active guest.` })
    }
    validatedCode = rawCode
  }

  // 2. Customer Phone Validation (strictly 10 digits or empty)
  let validatedPhone: string | undefined
  if (customerPhone !== undefined && customerPhone !== null && String(customerPhone).trim() !== '') {
    const raw = String(customerPhone).trim()
    const digitsOnly = raw.replace(/\D/g, '')
    if (digitsOnly.length !== 10) {
      return res.status(400).json({
        error: `Customer mobile phone must be exactly 10 digits (got ${digitsOnly.length} digits). E.g. 9876543210. Or leave empty.`
      })
    }
    validatedPhone = digitsOnly
  }

  // 3. Customer Name Sanitization
  const validatedName = customerName ? String(customerName).trim().slice(0, 40) : undefined

  // 4. Plan Validation
  let validatedPlan: number = DEFAULT_PLAN
  if (planType !== undefined) {
    const pNum = Number(planType)
    if (!isValidPlan(pNum)) {
      return res.status(400).json({ error: `Invalid plan type. Supported plans: ${PLAN_PRICES.join(', ')}` })
    }
    validatedPlan = pNum
  } else if (isValidPlan(paymentAmount)) {
    validatedPlan = Number(paymentAmount)
  }

  // 5. Payment Method Validation
  let validatedMethod: 'UPI' | 'CASH' | undefined
  if (paymentMethod) {
    const m = String(paymentMethod).toUpperCase()
    if (m !== 'UPI' && m !== 'CASH') {
      return res.status(400).json({ error: 'Payment method must be "UPI" or "CASH"' })
    }
    validatedMethod = m as 'UPI' | 'CASH'
  }

  // 6. Payment Status Validation
  let validatedStatus: 'PAID' | 'PENDING' | undefined
  if (paymentStatus) {
    const s = String(paymentStatus).toUpperCase()
    if (s !== 'PAID' && s !== 'PENDING') {
      return res.status(400).json({ error: 'Payment status must be "PAID" or "PENDING"' })
    }
    validatedStatus = s as 'PAID' | 'PENDING'
  }

  // 7. Payment Amount
  const validatedAmount = paymentAmount !== undefined ? Number(paymentAmount) : validatedPlan
  if (!Number.isFinite(validatedAmount) || validatedAmount <= 0 || validatedAmount > 100000) {
    return res.status(400).json({ error: 'Payment amount must be a positive number' })
  }

  const ticket = manager.issueTicket({
    customerName: validatedName,
    customerPhone: validatedPhone,
    notes: notes ? String(notes).trim().slice(0, 200) : undefined,
    code: validatedCode,
    paymentMethod: validatedMethod,
    paymentAmount: validatedAmount,
    paymentStatus: validatedStatus,
    paidAt: typeof paidAt === 'string' && !isNaN(Date.parse(paidAt)) ? paidAt : undefined,
    upiTransactionRef: upiTransactionRef ? String(upiTransactionRef).trim().slice(0, 60) : undefined,
    planType: validatedPlan,
  })

  const financialSummary = manager.getFinancialSummary()

  // Broadcast to all connected clients (operator dashboard & booth kiosks)
  io?.emit('ticket:issued', ticket)
  io?.emit('queue:updated', {
    tickets: manager.listTickets(),
    nextCode: manager.getNextCode(),
    financialSummary,
  })

  res.status(201).json({
    success: true,
    ticket,
    nextCode: manager.getNextCode(),
    financialSummary,
  })
})

// ─── POST /api/tickets/claim ─────────────────────────────────────────────────
ticketRouter.post('/claim', (req: Request, res: Response) => {
  const manager = getTicketManager()
  if (!manager) {
    return res.status(503).json({ error: 'Ticket manager not ready' })
  }

  const { code, sessionId } = req.body || {}
  if (!code) {
    return res.status(400).json({ success: false, error: 'Please enter a 4-digit ticket code.' })
  }

  const cleanCode = String(code).replace(/^#/, '').trim()
  if (!/^\d{4}$/.test(cleanCode)) {
    return res.status(400).json({ success: false, error: 'Ticket code must be exactly 4 numeric digits.' })
  }

  const locked = guessLocked(req)
  if (locked) return lockedResponse(res, locked)

  const existingTicket = manager.getTicketByCode(cleanCode)
  if (!existingTicket) {
    recordMiss(req)
    return res.status(404).json({ success: false, error: `Ticket #${cleanCode} not found. Please verify with cashier.` })
  }

  if (existingTicket.status === 'COMPLETED') {
    return res.status(400).json({
      success: false,
      error: `Ticket #${cleanCode} has already completed its booth photoshoot.`,
      ticket: existingTicket,
    })
  }

  if (existingTicket.status === 'CANCELLED') {
    return res.status(400).json({
      success: false,
      error: `Ticket #${cleanCode} was voided/cancelled.`,
      ticket: existingTicket,
    })
  }

  if (sessionId !== undefined && (typeof sessionId !== 'string' || !/^[a-zA-Z0-9_-]{1,128}$/.test(sessionId))) {
    return res.status(400).json({ success: false, error: 'Invalid session ID' })
  }
  const result = manager.claimTicket(cleanCode, sessionId)
  if (!result.success) {
    return res.status(400).json(result)
  }

  // Sync any session media into the ticket folder
  if (sessionId) {
    const vault = getVaultManager()
    const sessionDir = path.join(getDataPath(), 'sessions', sessionId)
    if (vault && fs.existsSync(sessionDir)) {
      vault.syncSessionPhotos(cleanCode, sessionDir)
    }
  }

  // Payment notice if unpaid cash
  const isPaymentPending = result.ticket?.paymentMethod === 'CASH' && result.ticket?.paymentStatus !== 'PAID'

  // Broadcast claim event
  io?.emit('ticket:claimed', result.ticket)
  io?.emit('queue:updated', {
    tickets: manager.listTickets(),
    nextCode: manager.getNextCode(),
  })

  res.json({
    ...result,
    isPaymentPending,
    paymentAmount: result.ticket?.paymentAmount ?? result.ticket?.planType ?? 99,
  })
})

// ─── POST /api/tickets/:id/status ────────────────────────────────────────────
ticketRouter.post('/:id/status', (req: Request, res: Response) => {
  const manager = getTicketManager()
  if (!manager) {
    return res.status(503).json({ error: 'Ticket manager not ready' })
  }

  const id = req.params.id as string
  const { status, photoCount, printCount, sessionId } = req.body || {}

  const validStatuses: TicketStatus[] = ['WAITING', 'IN_BOOTH', 'EDITING', 'PRINTING', 'COMPLETED', 'CANCELLED']
  if (!status || !validStatuses.includes(status)) {
    return res.status(400).json({ error: `Invalid status. Must be one of: ${validStatuses.join(', ')}` })
  }

  if (sessionId !== undefined && (typeof sessionId !== 'string' || !/^[a-zA-Z0-9_-]{1,128}$/.test(sessionId))) {
    return res.status(400).json({ error: 'Invalid session ID' })
  }
  const toCount = (v: unknown) => {
    if (v === undefined || v === null) return undefined
    const n = Number(v)
    return Number.isInteger(n) && n >= 0 && n <= 500 ? n : NaN
  }
  const photoCountNum = toCount(photoCount)
  const printCountNum = toCount(printCount)
  if (Number.isNaN(photoCountNum) || Number.isNaN(printCountNum)) {
    return res.status(400).json({ error: 'photoCount / printCount must be small non-negative integers' })
  }

  const current = manager.getTicketById(id) || manager.getTicketByCode(id)
  if (!current) {
    return res.status(404).json({ error: `Ticket not found: ${id}` })
  }
  // A guest station may only start a shoot on a paid ticket (whatever the payment method)
  if (!isStaff(req) && status === 'IN_BOOTH' && current.paymentStatus !== 'PAID') {
    return res.status(402).json({ error: `Ticket #${current.code} is not paid yet. Please pay at the counter.`, code: 'UNPAID' })
  }
  // Guest-facing stations (booth Pi, editing iPad) may only move tickets forward.
  // Staff (ticket desk) can force any status, e.g. to re-open or void a ticket.
  if (!isStaff(req) && !isAllowedStationTransition(current.status, status, current.photoCount ?? 0)) {
    return res.status(409).json({
      error: `Ticket #${current.code} cannot go from ${current.status} to ${status} from this station.`,
      code: 'INVALID_TRANSITION',
      currentStatus: current.status,
    })
  }

  const updated = manager.updateTicketStatus(current.id, status, { photoCount: photoCountNum, printCount: printCountNum, sessionId })
  if (!updated) {
    return res.status(404).json({ error: `Ticket not found: ${id}` })
  }

  // When completed, sync session photos into ticket vault
  if (status === 'COMPLETED' && updated.sessionId) {
    const vault = getVaultManager()
    const sessionDir = path.join(getDataPath(), 'sessions', updated.sessionId)
    if (vault && fs.existsSync(sessionDir)) {
      vault.syncSessionPhotos(updated.code, sessionDir)
    }
  }

  io?.emit('ticket:updated', updated)
  io?.emit('queue:updated', {
    tickets: manager.listTickets(),
    nextCode: manager.getNextCode(),
    financialSummary: manager.getFinancialSummary(),
  })

  res.json({ success: true, ticket: updated })
})

// ─── POST /api/tickets/:id/payment ───────────────────────────────────────────
ticketRouter.post('/:id/payment', requireStaff, (req: Request, res: Response) => {
  const manager = getTicketManager()
  if (!manager) {
    return res.status(503).json({ error: 'Ticket manager not ready' })
  }

  const id = req.params.id as string
  const { paymentStatus, paymentMethod, paymentAmount, paidAt, upiTransactionRef, planType } = req.body || {}

  if (!paymentStatus || (paymentStatus !== 'PAID' && paymentStatus !== 'PENDING')) {
    return res.status(400).json({ error: 'Valid paymentStatus ("PAID" | "PENDING") is required' })
  }

  if (paymentMethod !== undefined && paymentMethod !== 'UPI' && paymentMethod !== 'CASH') {
    return res.status(400).json({ error: 'Payment method must be "UPI" or "CASH"' })
  }
  if (planType !== undefined && !isValidPlan(planType)) {
    return res.status(400).json({ error: `Invalid plan type. Supported plans: ${PLAN_PRICES.join(', ')}` })
  }
  if (paymentAmount !== undefined && (!Number.isFinite(Number(paymentAmount)) || Number(paymentAmount) <= 0 || Number(paymentAmount) > 100000)) {
    return res.status(400).json({ error: 'Payment amount must be a positive number' })
  }

  const updated = manager.updateTicketPayment(id, {
    paymentStatus,
    paymentMethod,
    paymentAmount: paymentAmount !== undefined ? Number(paymentAmount) : undefined,
    paidAt,
    upiTransactionRef,
    planType: planType !== undefined ? Number(planType) : undefined,
  })

  if (!updated) {
    return res.status(404).json({ error: `Ticket not found: ${id}` })
  }

  const financialSummary = manager.getFinancialSummary()
  io?.emit('ticket:updated', updated)
  io?.emit('queue:updated', {
    tickets: manager.listTickets(),
    nextCode: manager.getNextCode(),
    financialSummary,
  })

  res.json({ success: true, ticket: updated, financialSummary })
})

// ─── POST /api/tickets/reset ─────────────────────────────────────────────────
ticketRouter.post('/reset', requireStaff, (_req: Request, res: Response) => {
  const manager = getTicketManager()
  if (!manager) {
    return res.status(503).json({ error: 'Ticket manager not ready' })
  }

  manager.resetQueue()
  io?.emit('ticket:reset')
  io?.emit('queue:updated', {
    tickets: [],
    nextCode: manager.getNextCode(),
    financialSummary: manager.getFinancialSummary(),
  })

  res.json({ success: true, message: 'Ticket queue reset successfully' })
})

// ─── DELETE /api/tickets/:id ─────────────────────────────────────────────────
ticketRouter.delete('/:id', requireStaff, (req: Request, res: Response) => {
  const manager = getTicketManager()
  if (!manager) {
    return res.status(503).json({ error: 'Ticket manager not ready' })
  }

  const id = req.params.id as string
  const deleted = manager.deleteTicket(id)
  if (!deleted) {
    return res.status(404).json({ error: `Ticket not found: ${id}` })
  }

  io?.emit('ticket:deleted', { id })
  io?.emit('queue:updated', {
    tickets: manager.listTickets(),
    nextCode: manager.getNextCode(),
    financialSummary: manager.getFinancialSummary(),
  })

  res.json({ success: true })
})

// ─── Ticket lifecycle rules for guest-facing stations ───────────────────────
//   WAITING → IN_BOOTH → EDITING → PRINTING → COMPLETED
// IN_BOOTH → IN_BOOTH is allowed only while no photos were uploaded (booth crashed / reloaded mid-shoot).
// Re-shooting an EDITING ticket is NOT allowed — that used to give unlimited sessions per ticket.
export function isAllowedStationTransition(from: TicketStatus, to: TicketStatus, photoCount: number): boolean {
  if (from === 'COMPLETED' || from === 'CANCELLED') return false
  switch (to) {
    case 'IN_BOOTH':
      return from === 'WAITING' || (from === 'IN_BOOTH' && photoCount === 0)
    case 'EDITING':
      return from === 'IN_BOOTH' || from === 'EDITING' || from === 'PRINTING'
    case 'PRINTING':
      return from === 'EDITING' || from === 'PRINTING'
    case 'COMPLETED':
      return from === 'EDITING' || from === 'PRINTING'
    default:
      return false // WAITING / CANCELLED are staff-only
  }
}

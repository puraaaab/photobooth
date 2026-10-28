import { Router, Request, Response } from 'express'
import { getTicketManager, getVaultManager, getDataPath, io } from '../index'
import type { TicketStatus } from '../ticketManager'
import { exec } from 'child_process'
import * as path from 'path'
import * as fs from 'fs'

export const ticketRouter = Router()

// ─── GET /api/tickets ────────────────────────────────────────────────────────
ticketRouter.get('/', (_req: Request, res: Response) => {
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
    financialSummary: manager.getFinancialSummary(),
  })
})

// ─── GET /api/tickets/financial ──────────────────────────────────────────────
ticketRouter.get('/financial', (_req: Request, res: Response) => {
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

  const rawCode = req.params.code as string
  const cleanCode = rawCode.replace(/^#/, '').trim()
  const ticket = manager.getTicketByCode(cleanCode) || manager.getTicketById(cleanCode)

  if (!ticket) {
    return res.status(404).json({ error: `Ticket #${cleanCode} not found` })
  }

  const vault = getVaultManager()
  const vaultInfo = vault ? vault.getVaultInfo(ticket.code) : null

  res.json({ ticket, vault: vaultInfo })
})

// ─── GET /api/tickets/:code/vault ────────────────────────────────────────────
// Inspect customer's photo folder on disk
ticketRouter.get('/:code/vault', (req: Request, res: Response) => {
  const rawCode = req.params.code as string
  const cleanCode = rawCode.replace(/^#/, '').trim()
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
ticketRouter.post('/:code/open-folder', (req: Request, res: Response) => {
  const rawCode = req.params.code as string
  const cleanCode = rawCode.replace(/^#/, '').trim()
  const vault = getVaultManager()
  const folderPath = vault ? vault.getTicketDir(cleanCode) : path.join(getDataPath(), 'tickets_vault', `Ticket_${cleanCode}`)

  fs.mkdirSync(folderPath, { recursive: true })

  if (process.platform === 'win32') {
    exec(`explorer "${folderPath}"`, (err) => {
      if (err) {
        console.warn('[Tickets] Failed opening Windows Explorer:', err)
      }
    })
  } else if (process.platform === 'darwin') {
    exec(`open "${folderPath}"`)
  } else {
    exec(`xdg-open "${folderPath}"`)
  }

  res.json({ success: true, folderPath })
})

// ─── POST /api/tickets/issue ─────────────────────────────────────────────────
ticketRouter.post('/issue', (req: Request, res: Response) => {
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
  let validatedPlan: number = 99
  if (planType !== undefined) {
    const pNum = Number(planType)
    if (pNum !== 99 && pNum !== 149 && pNum !== 179) {
      return res.status(400).json({ error: 'Invalid plan type. Supported plans: 99, 149, 179' })
    }
    validatedPlan = pNum
  } else if (paymentAmount === 99 || paymentAmount === 149 || paymentAmount === 179) {
    validatedPlan = paymentAmount
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

  const ticket = manager.issueTicket({
    customerName: validatedName,
    customerPhone: validatedPhone,
    notes: notes ? String(notes).trim().slice(0, 200) : undefined,
    code: validatedCode,
    paymentMethod: validatedMethod,
    paymentAmount: validatedAmount,
    paymentStatus: validatedStatus,
    paidAt,
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

  const existingTicket = manager.getTicketByCode(cleanCode)
  if (!existingTicket) {
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

  const updated = manager.updateTicketStatus(id, status, { photoCount, printCount, sessionId })
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
ticketRouter.post('/:id/payment', (req: Request, res: Response) => {
  const manager = getTicketManager()
  if (!manager) {
    return res.status(503).json({ error: 'Ticket manager not ready' })
  }

  const id = req.params.id as string
  const { paymentStatus, paymentMethod, paymentAmount, paidAt, upiTransactionRef, planType } = req.body || {}

  if (!paymentStatus || (paymentStatus !== 'PAID' && paymentStatus !== 'PENDING')) {
    return res.status(400).json({ error: 'Valid paymentStatus ("PAID" | "PENDING") is required' })
  }

  if (paymentAmount !== undefined && (isNaN(Number(paymentAmount)) || Number(paymentAmount) <= 0)) {
    return res.status(400).json({ error: 'Payment amount must be a positive number' })
  }

  const updated = manager.updateTicketPayment(id, {
    paymentStatus,
    paymentMethod,
    paymentAmount: paymentAmount !== undefined ? Number(paymentAmount) : undefined,
    paidAt,
    upiTransactionRef,
    planType,
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
ticketRouter.post('/reset', (_req: Request, res: Response) => {
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
ticketRouter.delete('/:id', (req: Request, res: Response) => {
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

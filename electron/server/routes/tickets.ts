import { Router, Request, Response } from 'express'
import { getTicketManager, io } from '../index'
import type { TicketStatus } from '../../ticketManager'

export const ticketRouter = Router()

// ─── GET /api/tickets ────────────────────────────────────────────────────────
ticketRouter.get('/', (_req: Request, res: Response) => {
  const manager = getTicketManager()
  if (!manager) {
    return res.status(503).json({ error: 'Ticket manager not ready' })
  }

  const tickets = manager.listTickets()
  const nextCode = manager.getNextCode()
  const financialSummary = manager.getFinancialSummary()
  res.json({
    tickets,
    nextCode,
    activeCount: tickets.filter(t => t.status === 'WAITING' || t.status === 'IN_BOOTH' || t.status === 'EDITING').length,
    waitingCount: tickets.filter(t => t.status === 'WAITING').length,
    completedCount: tickets.filter(t => t.status === 'COMPLETED').length,
    financialSummary,
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

  const code = req.params.code as string
  const ticket = manager.getTicketByCode(code) || manager.getTicketById(code)
  if (!ticket) {
    return res.status(404).json({ error: `Ticket #${code} not found` })
  }
  res.json({ ticket })
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

  const ticket = manager.issueTicket({
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
    return res.status(400).json({ success: false, error: 'Ticket code is required' })
  }

  const result = manager.claimTicket(String(code), sessionId)
  if (!result.success) {
    return res.status(400).json(result)
  }

  // Broadcast claim event
  io?.emit('ticket:claimed', result.ticket)
  io?.emit('queue:updated', {
    tickets: manager.listTickets(),
    nextCode: manager.getNextCode(),
  })

  res.json(result)
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
  if (!validStatuses.includes(status)) {
    return res.status(400).json({ error: `Invalid status: ${status}` })
  }

  const updated = manager.updateTicketStatus(id, status, { photoCount, printCount, sessionId })
  if (!updated) {
    return res.status(404).json({ error: `Ticket not found: ${id}` })
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

  const updated = manager.updateTicketPayment(id, {
    paymentStatus,
    paymentMethod,
    paymentAmount,
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

import * as fs from 'fs'
import * as path from 'path'

export type TicketStatus =
  | 'WAITING'
  | 'IN_BOOTH'
  | 'EDITING'
  | 'PRINTING'
  | 'COMPLETED'
  | 'CANCELLED'

export type PaymentMethod = 'UPI' | 'CASH'
export type PaymentStatus = 'PAID' | 'PENDING'

export interface Ticket {
  id: string              // e.g. "T-1001"
  code: string            // 4-digit numeric code e.g. "1001"
  customerName?: string   // e.g. "Alex & Sarah"
  customerPhone?: string  // e.g. "+1-555-0199"
  notes?: string
  status: TicketStatus
  createdAt: string
  claimedAt?: string      // when customer enters booth
  startedAt?: string      // when shoot begins
  completedAt?: string    // when printed / finished
  sessionId?: string      // bound photobooth session
  photoCount?: number
  printCount?: number
  paymentMethod?: PaymentMethod
  paymentAmount?: number
  paymentStatus?: PaymentStatus
  paidAt?: string
  upiTransactionRef?: string
}

export class TicketManager {
  private filePath: string
  private tickets: Ticket[] = []

  constructor(baseDir: string) {
    this.filePath = path.join(baseDir, 'tickets.json')
    this.loadTickets()
  }

  private loadTickets(): void {
    try {
      if (fs.existsSync(this.filePath)) {
        const raw = fs.readFileSync(this.filePath, 'utf-8')
        const parsed = JSON.parse(raw)
        if (Array.isArray(parsed)) {
          this.tickets = parsed
        } else if (parsed && typeof parsed === 'object') {
          this.tickets = Array.isArray(parsed.tickets) ? parsed.tickets : []
          if (parsed.currentNextCode && /^\d{4}$/.test(parsed.currentNextCode)) {
            this.currentNextCode = parsed.currentNextCode
          }
        }
        console.log(`[TicketManager] Loaded ${this.tickets.length} ticket(s) from disk`)
      } else {
        this.tickets = []
      }
    } catch (err) {
      console.error('[TicketManager] Failed to load tickets from disk:', err)
      this.tickets = []
    }
  }

  private saveTickets(): void {
    try {
      fs.mkdirSync(path.dirname(this.filePath), { recursive: true })
      fs.writeFileSync(
        this.filePath,
        JSON.stringify({ tickets: this.tickets, currentNextCode: this.getNextCode() }, null, 2),
        'utf-8'
      )
    } catch (err) {
      console.error('[TicketManager] Failed to save tickets to disk:', err)
    }
  }

  private currentNextCode: string = ''

  private generateUniqueRandomCode(): string {
    const existing = new Set(this.tickets.map(t => t.code))
    for (let attempts = 0; attempts < 10000; attempts++) {
      const code = String(Math.floor(1000 + Math.random() * 9000))
      if (!existing.has(code)) return code
    }
    const active = new Set(
      this.tickets
        .filter(t => t.status === 'WAITING' || t.status === 'IN_BOOTH' || t.status === 'EDITING')
        .map(t => t.code)
    )
    for (let attempts = 0; attempts < 10000; attempts++) {
      const code = String(Math.floor(1000 + Math.random() * 9000))
      if (!active.has(code)) return code
    }
    return String(Math.floor(1000 + Math.random() * 9000))
  }

  public getNextCode(): string {
    if (!this.currentNextCode) {
      this.currentNextCode = this.generateUniqueRandomCode()
    }
    return this.currentNextCode
  }

  public getRandomCode(): string {
    return this.getNextCode()
  }

  public issueTicket(data: {
    customerName?: string
    customerPhone?: string
    notes?: string
    code?: string
    paymentMethod?: PaymentMethod
    paymentAmount?: number
    paymentStatus?: PaymentStatus
    paidAt?: string
    upiTransactionRef?: string
    planType?: number
  }): Ticket {
    let code = data.code ? data.code.trim() : ''
    if (!code || !/^\d{4}$/.test(code)) {
      code = this.getNextCode()
    }

    // Check if code is already waiting or active; if so, pick a fresh random code
    const existingActive = this.tickets.find(
      t => t.code === code && (t.status === 'WAITING' || t.status === 'IN_BOOTH' || t.status === 'EDITING')
    )
    if (existingActive) {
      code = this.generateUniqueRandomCode()
    }

    const planType = data.planType || (data.paymentAmount === 99 || data.paymentAmount === 149 || data.paymentAmount === 179 ? data.paymentAmount : 99)
    const paymentAmount = data.paymentAmount !== undefined ? data.paymentAmount : (planType ?? (data.paymentMethod ? 99 : undefined))
    const paymentStatus = data.paymentStatus || (data.paymentMethod === 'UPI' ? 'PAID' : (data.paymentMethod === 'CASH' ? 'PENDING' : undefined))
    const paidAt = data.paidAt || (paymentStatus === 'PAID' ? new Date().toISOString() : undefined)

    const ticket: Ticket = {
      id: `T-${code}-${Date.now().toString(36).slice(-4)}`,
      code,
      customerName: data.customerName?.trim() || undefined,
      customerPhone: data.customerPhone?.trim() || undefined,
      notes: data.notes?.trim() || undefined,
      status: 'WAITING',
      createdAt: new Date().toISOString(),
      photoCount: 0,
      printCount: 0,
      paymentMethod: data.paymentMethod || undefined,
      paymentAmount,
      paymentStatus,
      paidAt,
      upiTransactionRef: data.upiTransactionRef?.trim() || undefined,
      planType,
    }

    this.tickets.unshift(ticket)
    this.saveTickets()

    // ─── Only advance to the next random ticket code AFTER ticket is issued ───
    this.currentNextCode = this.generateUniqueRandomCode()
    console.log(`[TicketManager] Issued ticket #${ticket.code} (${ticket.customerName || 'Walk-in'}) [Pay: ${ticket.paymentMethod || 'NONE'} - ₹${ticket.paymentAmount || 0} (${ticket.paymentStatus || 'N/A'})]`)
    return ticket
  }

  public claimTicket(
    code: string,
    sessionId?: string
  ): { success: boolean; ticket?: Ticket; error?: string } {
    const cleanCode = code.trim()
    const ticket = this.tickets.find(t => t.code === cleanCode)

    if (!ticket) {
      return { success: false, error: `Ticket #${cleanCode} not found` }
    }

    if (ticket.status === 'COMPLETED') {
      return {
        success: false,
        error: `Ticket #${cleanCode} has already been completed and printed.`,
        ticket,
      }
    }

    if (ticket.status === 'CANCELLED') {
      return {
        success: false,
        error: `Ticket #${cleanCode} was cancelled.`,
        ticket,
      }
    }

    // Valid ticket! Mark as inside booth unless already editing
    if (ticket.status !== 'EDITING') {
      ticket.status = 'IN_BOOTH'
    }
    ticket.claimedAt = ticket.claimedAt || new Date().toISOString()
    ticket.startedAt = ticket.startedAt || new Date().toISOString()
    if (sessionId && !ticket.sessionId) {
      ticket.sessionId = sessionId
    }

    this.saveTickets()
    console.log(`[TicketManager] Ticket #${ticket.code} claimed by booth (Session: ${sessionId || 'pending'})`)
    return { success: true, ticket }
  }

  public updateTicketStatus(
    ticketId: string,
    status: TicketStatus,
    meta?: { photoCount?: number; printCount?: number; sessionId?: string }
  ): Ticket | null {
    const ticket = this.tickets.find(t => t.id === ticketId || t.code === ticketId)
    if (!ticket) return null

    ticket.status = status
    if (status === 'COMPLETED') {
      ticket.completedAt = new Date().toISOString()
    }
    if (meta?.photoCount !== undefined) {
      ticket.photoCount = meta.photoCount
    }
    if (meta?.printCount !== undefined) {
      ticket.printCount = (ticket.printCount || 0) + meta.printCount
    }
    if (meta?.sessionId) {
      ticket.sessionId = meta.sessionId
    }

    this.saveTickets()
    console.log(`[TicketManager] Ticket #${ticket.code} status -> ${status}`)
    return ticket
  }

  public updateTicketPayment(
    ticketId: string,
    payment: {
      paymentStatus: PaymentStatus
      paymentMethod?: PaymentMethod
      paymentAmount?: number
      paidAt?: string
      upiTransactionRef?: string
      planType?: number
    }
  ): Ticket | null {
    const ticket = this.tickets.find(t => t.id === ticketId || t.code === ticketId)
    if (!ticket) return null

    if (payment.paymentStatus !== undefined) ticket.paymentStatus = payment.paymentStatus
    if (payment.paymentMethod !== undefined) ticket.paymentMethod = payment.paymentMethod
    if (payment.paymentAmount !== undefined) ticket.paymentAmount = payment.paymentAmount
    if (payment.upiTransactionRef !== undefined) ticket.upiTransactionRef = payment.upiTransactionRef
    if (payment.planType !== undefined) ticket.planType = payment.planType

    if (payment.paymentStatus === 'PAID') {
      ticket.paidAt = payment.paidAt || new Date().toISOString()
    } else if (payment.paymentStatus === 'PENDING') {
      ticket.paidAt = undefined
    }

    this.saveTickets()
    console.log(`[TicketManager] Updated payment for ticket #${ticket.code}: ${ticket.paymentStatus} (${ticket.paymentMethod || 'N/A'}, ₹${ticket.paymentAmount || 0})`)
    return ticket
  }

  public getFinancialSummary() {
    const paidTickets = this.tickets.filter(t => t.paymentStatus === 'PAID')
    const upiPaid = paidTickets.filter(t => t.paymentMethod === 'UPI')
    const cashPaid = paidTickets.filter(t => t.paymentMethod === 'CASH')
    const pendingCash = this.tickets.filter(t => t.paymentMethod === 'CASH' && t.paymentStatus === 'PENDING')

    const totalCollected = paidTickets.reduce((sum, t) => sum + (t.paymentAmount ?? t.planType ?? 99), 0)
    const totalUpi = upiPaid.reduce((sum, t) => sum + (t.paymentAmount ?? t.planType ?? 99), 0)
    const totalCash = cashPaid.reduce((sum, t) => sum + (t.paymentAmount ?? t.planType ?? 99), 0)
    const totalPendingCash = pendingCash.reduce((sum, t) => sum + (t.paymentAmount ?? t.planType ?? 99), 0)

    return {
      totalCollected,
      totalUpi,
      totalCash,
      totalPendingCash,
      totalPaidCount: paidTickets.length,
      upiCount: upiPaid.length,
      cashCount: cashPaid.length,
      pendingCashCount: pendingCash.length,
    }
  }

  public getTicketByCode(code: string): Ticket | undefined {
    return this.tickets.find(t => t.code === code.trim())
  }

  public getTicketById(id: string): Ticket | undefined {
    return this.tickets.find(t => t.id === id)
  }

  public listTickets(): Ticket[] {
    return [...this.tickets]
  }

  public resetQueue(): void {
    this.tickets = []
    this.saveTickets()
    console.log('[TicketManager] Ticket queue has been reset')
  }

  public deleteTicket(id: string): boolean {
    const initialLen = this.tickets.length
    this.tickets = this.tickets.filter(t => t.id !== id && t.code !== id)
    if (this.tickets.length !== initialLen) {
      this.saveTickets()
      return true
    }
    return false
  }
}

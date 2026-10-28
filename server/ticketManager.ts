import * as fs from 'fs'
import * as path from 'path'
import { PhotoboothDatabase, type TicketRow } from './db'
import { VaultManager } from './vaultManager'
import { isValidPlan, DEFAULT_PLAN } from '../src/constants/pricing'

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
  id: string              // e.g. "T-1001-xxxx"
  code: string            // 4-digit numeric code e.g. "1001"
  customerName?: string   // e.g. "Alex & Sarah"
  customerPhone?: string  // e.g. "+91 9876543210"
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
  planType?: number
  vaultPath?: string
}

export class TicketManager {
  private filePath: string
  private tickets: Ticket[] = []
  private db: PhotoboothDatabase
  private vault: VaultManager
  private currentNextCode: string = ''

  constructor(baseDir: string) {
    this.filePath = path.join(baseDir, 'tickets.json')
    this.db = new PhotoboothDatabase(baseDir)
    this.vault = new VaultManager(baseDir)
    this.loadTickets()
  }

  public getDatabase(): PhotoboothDatabase {
    return this.db
  }

  public getVaultManager(): VaultManager {
    return this.vault
  }

  private loadTickets(): void {
    try {
      // 1. Primary Source of Truth: SQLite Database
      const dbTickets = this.db.getAllTickets()

      if (dbTickets.length > 0) {
        this.tickets = dbTickets.map(t => ({
          ...t,
          vaultPath: this.safeVaultDir(t.code),
        }))
        console.log(`[TicketManager] Loaded ${this.tickets.length} ticket(s) from SQLite Database`)
      } else if (fs.existsSync(this.filePath)) {
        // 2. Migration: If DB is fresh, import existing tickets.json into SQLite
        const raw = fs.readFileSync(this.filePath, 'utf-8')
        const parsed = JSON.parse(raw)
        const jsonTickets: Ticket[] = Array.isArray(parsed)
          ? parsed
          : Array.isArray(parsed?.tickets)
            ? parsed.tickets
            : []

        for (const t of jsonTickets) {
          const row: TicketRow = {
            id: t.id,
            code: t.code,
            customerName: t.customerName,
            customerPhone: t.customerPhone,
            notes: t.notes,
            status: t.status,
            createdAt: t.createdAt,
            claimedAt: t.claimedAt,
            startedAt: t.startedAt,
            completedAt: t.completedAt,
            sessionId: t.sessionId,
            photoCount: t.photoCount ?? 0,
            printCount: t.printCount ?? 0,
            paymentMethod: t.paymentMethod,
            paymentAmount: t.paymentAmount,
            paymentStatus: t.paymentStatus,
            paidAt: t.paidAt,
            upiTransactionRef: t.upiTransactionRef,
            planType: t.planType ?? 99,
            vaultPath: this.safeVaultDir(t.code),
          }
          this.db.upsertTicket(row)
          this.vault.ensureVault(t.code)
          this.vault.updateManifestWithTicket(t)
        }

        this.tickets = jsonTickets
        console.log(`[TicketManager] Migrated ${jsonTickets.length} ticket(s) from tickets.json into SQLite Database`)
      } else {
        this.tickets = []
      }
    } catch (err) {
      console.error('[TicketManager] Failed loading tickets from SQLite/disk:', err)
      this.tickets = []
    }
  }

  /** One malformed legacy code must not make the whole queue fail to load. */
  private safeVaultDir(code: string): string | undefined {
    try {
      return this.vault.getTicketDir(code)
    } catch {
      return undefined
    }
  }

  private saveTickets(): void {
    try {
      // Sync memory tickets to disk JSON as an atomic secondary backup mirror
      fs.mkdirSync(path.dirname(this.filePath), { recursive: true })
      fs.writeFileSync(
        this.filePath,
        JSON.stringify({ tickets: this.tickets, currentNextCode: this.getNextCode() }, null, 2),
        'utf-8'
      )
    } catch (err) {
      console.error('[TicketManager] Failed to sync tickets.json mirror:', err)
    }
  }

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

    const planType = data.planType || (isValidPlan(data.paymentAmount) ? Number(data.paymentAmount) : DEFAULT_PLAN)
    const paymentAmount = data.paymentAmount !== undefined ? data.paymentAmount : (planType ?? (data.paymentMethod ? 99 : undefined))
    const paymentStatus = data.paymentStatus || (data.paymentMethod === 'UPI' ? 'PAID' : (data.paymentMethod === 'CASH' ? 'PENDING' : undefined))
    const paidAt = data.paidAt || (paymentStatus === 'PAID' ? new Date().toISOString() : undefined)

    // Ensure dedicated ticket folder exists in vault
    const vaultPath = this.vault.ensureVault(code)

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
      vaultPath,
    }

    // 1. Write to SQLite DB
    this.db.upsertTicket({
      ...ticket,
      photoCount: 0,
      printCount: 0,
    })

    // 2. Initialize ticket manifest in folder
    this.vault.updateManifestWithTicket(ticket)

    // 3. Log Audit
    this.db.logAudit('TICKET_ISSUED', ticket.code, undefined, {
      id: ticket.id,
      customerName: ticket.customerName,
      paymentMethod: ticket.paymentMethod,
      paymentAmount: ticket.paymentAmount,
      paymentStatus: ticket.paymentStatus,
      planType: ticket.planType,
    })

    // 4. Update memory & mirror file
    this.tickets.unshift(ticket)
    this.saveTickets()

    this.currentNextCode = this.generateUniqueRandomCode()
    console.log(`[TicketManager] Issued ticket #${ticket.code} (${ticket.customerName || 'Walk-in'}) [Vault: ${vaultPath}] [Pay: ${ticket.paymentMethod || 'NONE'} - ₹${ticket.paymentAmount || 0} (${ticket.paymentStatus || 'N/A'})]`)
    return ticket
  }

  public resolveTicketSessionId(ticket: Ticket): string | undefined {
    if (!ticket.code) return ticket.sessionId
    const dataDir = path.dirname(this.filePath)
    const sessionsDir = path.join(dataDir, 'sessions')

    // 1. Check if current ticket.sessionId is valid and has photos
    if (ticket.sessionId) {
      const curFile = path.join(sessionsDir, ticket.sessionId, 'session.json')
      try {
        if (fs.existsSync(curFile)) {
          const curData = JSON.parse(fs.readFileSync(curFile, 'utf-8'))
          if ((curData.photos?.length || 0) > 0) {
            if (ticket.photoCount !== curData.photos.length) {
              ticket.photoCount = curData.photos.length
              this.db.upsertTicket({
                ...ticket,
                photoCount: ticket.photoCount ?? 0,
                printCount: ticket.printCount ?? 0,
              })
              this.saveTickets()
            }
            return ticket.sessionId
          }
        }
      } catch {}
    }

    // 2. Search for any session recorded for this ticketCode that has photos
    if (fs.existsSync(sessionsDir)) {
      try {
        const dirs = fs.readdirSync(sessionsDir)
        for (const d of dirs) {
          const sFile = path.join(sessionsDir, d, 'session.json')
          if (fs.existsSync(sFile)) {
            try {
              const sData = JSON.parse(fs.readFileSync(sFile, 'utf-8'))
              if (sData.ticketCode === ticket.code && (sData.photos?.length || 0) > 0) {
                console.log(`[TicketManager] Auto-healed ticket #${ticket.code} session -> ${d} (${sData.photos.length} photos)`)
                ticket.sessionId = d
                ticket.photoCount = sData.photos.length
                this.db.upsertTicket({
                  ...ticket,
                  photoCount: ticket.photoCount ?? 0,
                  printCount: ticket.printCount ?? 0,
                })
                this.saveTickets()
                return d
              }
            } catch {}
          }
        }
      } catch {}
    }

    return ticket.sessionId
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

    // Resolve & preserve existing session if photos already exist
    this.resolveTicketSessionId(ticket)
    if (sessionId && !ticket.sessionId) {
      ticket.sessionId = sessionId
      // Link session photos to ticket in DB and sync media to ticket vault folder
      this.db.linkSessionPhotosToTicket(sessionId, cleanCode)
    }

    // Update in DB
    this.db.upsertTicket({
      ...ticket,
      photoCount: ticket.photoCount ?? 0,
      printCount: ticket.printCount ?? 0,
    })

    // Log Audit
    this.db.logAudit('TICKET_CLAIMED', ticket.code, ticket.sessionId || sessionId, {
      status: ticket.status,
      claimedAt: ticket.claimedAt,
    })

    this.vault.updateManifestWithTicket(ticket)
    this.saveTickets()
    console.log(`[TicketManager] Ticket #${ticket.code} claimed by booth (Session: ${ticket.sessionId || sessionId || 'pending'})`)
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
      this.db.linkSessionPhotosToTicket(meta.sessionId, ticket.code)
    }

    // Update in SQLite DB
    this.db.upsertTicket({
      ...ticket,
      photoCount: ticket.photoCount ?? 0,
      printCount: ticket.printCount ?? 0,
    })

    this.db.logAudit('TICKET_STATUS_UPDATED', ticket.code, ticket.sessionId, {
      status,
      photoCount: ticket.photoCount,
      printCount: ticket.printCount,
    })

    this.vault.updateManifestWithTicket(ticket)
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

    // Update in SQLite DB
    this.db.upsertTicket({
      ...ticket,
      photoCount: ticket.photoCount ?? 0,
      printCount: ticket.printCount ?? 0,
    })

    this.db.logAudit('PAYMENT_UPDATED', ticket.code, ticket.sessionId, {
      paymentStatus: ticket.paymentStatus,
      paymentMethod: ticket.paymentMethod,
      paymentAmount: ticket.paymentAmount,
      paidAt: ticket.paidAt,
    })

    this.vault.updateManifestWithTicket(ticket)
    this.saveTickets()
    console.log(`[TicketManager] Updated payment for ticket #${ticket.code}: ${ticket.paymentStatus} (${ticket.paymentMethod || 'N/A'}, ₹${ticket.paymentAmount || 0})`)
    return ticket
  }

  public updateTicketPlan(ticketId: string, planType: number): Ticket | null {
    const ticket = this.tickets.find(t => t.id === ticketId || t.code === ticketId)
    if (!ticket) return null

    ticket.planType = planType
    this.db.upsertTicket({
      ...ticket,
      photoCount: ticket.photoCount ?? 0,
      printCount: ticket.printCount ?? 0,
    })
    this.vault.updateManifestWithTicket(ticket)
    this.saveTickets()
    console.log(`[TicketManager] Updated plan for ticket #${ticket.code} -> ₹${planType}`)
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
    const ticket = this.tickets.find(t => t.code === code.trim())
    if (ticket) {
      this.resolveTicketSessionId(ticket)
    }
    return ticket
  }

  public getTicketById(id: string): Ticket | undefined {
    const ticket = this.tickets.find(t => t.id === id)
    if (ticket) {
      this.resolveTicketSessionId(ticket)
    }
    return ticket
  }

  public listTickets(): Ticket[] {
    return [...this.tickets]
  }

  public resetQueue(): void {
    this.tickets = []
    this.db.clearAllTickets()
    this.db.logAudit('QUEUE_RESET')
    this.saveTickets()
    console.log('[TicketManager] Ticket queue has been reset in SQLite & disk')
  }

  public deleteTicket(id: string): boolean {
    const initialLen = this.tickets.length
    const target = this.tickets.find(t => t.id === id || t.code === id)
    this.tickets = this.tickets.filter(t => t.id !== id && t.code !== id)
    if (this.tickets.length !== initialLen) {
      if (target) {
        this.db.deleteTicket(target.id)
        this.db.logAudit('TICKET_DELETED', target.code, target.sessionId)
      }
      this.saveTickets()
      return true
    }
    return false
  }
}

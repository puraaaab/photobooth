import * as path from 'path'
import * as fs from 'fs'
import type { DatabaseSync as DatabaseSyncType, StatementSync } from 'node:sqlite'

export interface TicketRow {
  id: string
  code: string
  customerName?: string
  customerPhone?: string
  notes?: string
  status: 'WAITING' | 'IN_BOOTH' | 'EDITING' | 'PRINTING' | 'COMPLETED' | 'CANCELLED'
  createdAt: string
  claimedAt?: string
  startedAt?: string
  completedAt?: string
  sessionId?: string
  photoCount: number
  printCount: number
  paymentMethod?: 'UPI' | 'CASH'
  paymentAmount?: number
  paymentStatus?: 'PAID' | 'PENDING'
  paidAt?: string
  upiTransactionRef?: string
  planType?: number
  vaultPath?: string
}

export interface SessionRow {
  id: string
  ticketCode?: string
  ticketId?: string
  sessionToken?: string
  status: string
  piId?: string
  piName?: string
  createdAt: string
  completedAt?: string
  photoCount: number
  settingsJson?: string
}

export interface PhotoRow {
  id: string
  sessionId: string
  ticketCode?: string
  originalPath: string
  thumbnailPath?: string
  previewPath?: string
  vaultPath?: string
  originalUrl?: string
  thumbnailUrl?: string
  previewUrl?: string
  width?: number
  height?: number
  size?: number
  isFavorite?: number
  uploadedAt: string
}

export class PhotoboothDatabase {
  private db: DatabaseSyncType | null = null
  private dbPath: string
  private isFallback = false
  private memoryTickets: Map<string, TicketRow> = new Map()

  constructor(dataDir: string) {
    fs.mkdirSync(dataDir, { recursive: true })
    this.dbPath = path.join(dataDir, 'photobooth.db')
    this.initDatabase()
  }

  private initDatabase(): void {
    try {
      // Dynamic require so it gracefully handles runtimes
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const { DatabaseSync } = require('node:sqlite')
      this.db = new DatabaseSync(this.dbPath)

      // Enable Write-Ahead Logging (WAL) for high concurrency, durability and crash safety
      this.db.exec('PRAGMA journal_mode = WAL;')
      this.db.exec('PRAGMA synchronous = NORMAL;')
      this.db.exec('PRAGMA foreign_keys = ON;')

      this.createTables()
      console.log(`[Database] SQLite database initialized successfully at: ${this.dbPath}`)
    } catch (err) {
      console.warn('[Database] Native SQLite unavailable, falling back to memory/JSON persistence:', err)
      this.isFallback = true
    }
  }

  private createTables(): void {
    if (!this.db) return

    this.db.exec(`
      CREATE TABLE IF NOT EXISTS tickets (
        id TEXT PRIMARY KEY,
        code TEXT NOT NULL,
        customer_name TEXT,
        customer_phone TEXT,
        notes TEXT,
        status TEXT NOT NULL DEFAULT 'WAITING',
        created_at TEXT NOT NULL,
        claimed_at TEXT,
        started_at TEXT,
        completed_at TEXT,
        session_id TEXT,
        photo_count INTEGER NOT NULL DEFAULT 0,
        print_count INTEGER NOT NULL DEFAULT 0,
        payment_method TEXT,
        payment_amount INTEGER,
        payment_status TEXT,
        paid_at TEXT,
        upi_transaction_ref TEXT,
        plan_type INTEGER DEFAULT 99,
        vault_path TEXT
      );

      CREATE INDEX IF NOT EXISTS idx_tickets_code ON tickets(code);
      CREATE INDEX IF NOT EXISTS idx_tickets_status ON tickets(status);
      CREATE INDEX IF NOT EXISTS idx_tickets_created_at ON tickets(created_at);

      CREATE TABLE IF NOT EXISTS sessions (
        id TEXT PRIMARY KEY,
        ticket_code TEXT,
        ticket_id TEXT,
        session_token TEXT,
        status TEXT NOT NULL DEFAULT 'receiving',
        pi_id TEXT,
        pi_name TEXT,
        created_at TEXT NOT NULL,
        completed_at TEXT,
        photo_count INTEGER NOT NULL DEFAULT 0,
        settings_json TEXT
      );

      CREATE INDEX IF NOT EXISTS idx_sessions_ticket_code ON sessions(ticket_code);

      CREATE TABLE IF NOT EXISTS photos (
        id TEXT PRIMARY KEY,
        session_id TEXT NOT NULL,
        ticket_code TEXT,
        original_path TEXT NOT NULL,
        thumbnail_path TEXT,
        preview_path TEXT,
        vault_path TEXT,
        original_url TEXT,
        thumbnail_url TEXT,
        preview_url TEXT,
        width INTEGER,
        height INTEGER,
        size INTEGER,
        is_favorite INTEGER DEFAULT 0,
        uploaded_at TEXT NOT NULL
      );

      CREATE INDEX IF NOT EXISTS idx_photos_session_id ON photos(session_id);
      CREATE INDEX IF NOT EXISTS idx_photos_ticket_code ON photos(ticket_code);

      CREATE TABLE IF NOT EXISTS audit_logs (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        timestamp TEXT NOT NULL,
        action TEXT NOT NULL,
        ticket_code TEXT,
        session_id TEXT,
        details TEXT
      );

      CREATE INDEX IF NOT EXISTS idx_audit_timestamp ON audit_logs(timestamp);
    `)
  }

  // ─── TICKETS CRUD ──────────────────────────────────────────────────────────

  public upsertTicket(ticket: TicketRow): void {
    if (this.isFallback || !this.db) {
      this.memoryTickets.set(ticket.id, ticket)
      return
    }

    const stmt = this.db.prepare(`
      INSERT INTO tickets (
        id, code, customer_name, customer_phone, notes, status,
        created_at, claimed_at, started_at, completed_at, session_id,
        photo_count, print_count, payment_method, payment_amount,
        payment_status, paid_at, upi_transaction_ref, plan_type, vault_path
      ) VALUES (
        ?, ?, ?, ?, ?, ?,
        ?, ?, ?, ?, ?,
        ?, ?, ?, ?,
        ?, ?, ?, ?, ?
      )
      ON CONFLICT(id) DO UPDATE SET
        code = excluded.code,
        customer_name = excluded.customer_name,
        customer_phone = excluded.customer_phone,
        notes = excluded.notes,
        status = excluded.status,
        claimed_at = excluded.claimed_at,
        started_at = excluded.started_at,
        completed_at = excluded.completed_at,
        session_id = excluded.session_id,
        photo_count = excluded.photo_count,
        print_count = excluded.print_count,
        payment_method = excluded.payment_method,
        payment_amount = excluded.payment_amount,
        payment_status = excluded.payment_status,
        paid_at = excluded.paid_at,
        upi_transaction_ref = excluded.upi_transaction_ref,
        plan_type = excluded.plan_type,
        vault_path = excluded.vault_path
    `)

    stmt.run(
      ticket.id,
      ticket.code,
      ticket.customerName ?? null,
      ticket.customerPhone ?? null,
      ticket.notes ?? null,
      ticket.status,
      ticket.createdAt,
      ticket.claimedAt ?? null,
      ticket.startedAt ?? null,
      ticket.completedAt ?? null,
      ticket.sessionId ?? null,
      ticket.photoCount ?? 0,
      ticket.printCount ?? 0,
      ticket.paymentMethod ?? null,
      ticket.paymentAmount ?? null,
      ticket.paymentStatus ?? null,
      ticket.paidAt ?? null,
      ticket.upiTransactionRef ?? null,
      ticket.planType ?? 99,
      ticket.vaultPath ?? null
    )
  }

  public getTicketById(id: string): TicketRow | undefined {
    if (this.isFallback || !this.db) {
      return this.memoryTickets.get(id)
    }

    const stmt = this.db.prepare('SELECT * FROM tickets WHERE id = ? LIMIT 1')
    const row = stmt.get(id) as Record<string, any> | undefined
    return row ? this.mapRowToTicket(row) : undefined
  }

  public getTicketByCode(code: string): TicketRow | undefined {
    const cleanCode = code.replace(/^#/, '').trim()
    if (this.isFallback || !this.db) {
      return Array.from(this.memoryTickets.values()).find(t => t.code === cleanCode)
    }

    const stmt = this.db.prepare('SELECT * FROM tickets WHERE code = ? ORDER BY created_at DESC LIMIT 1')
    const row = stmt.get(cleanCode) as Record<string, any> | undefined
    return row ? this.mapRowToTicket(row) : undefined
  }

  public getAllTickets(): TicketRow[] {
    if (this.isFallback || !this.db) {
      return Array.from(this.memoryTickets.values()).sort(
        (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
      )
    }

    const stmt = this.db.prepare('SELECT * FROM tickets ORDER BY created_at DESC')
    const rows = stmt.all() as Record<string, any>[]
    return rows.map(r => this.mapRowToTicket(r))
  }

  public deleteTicket(id: string): boolean {
    if (this.isFallback || !this.db) {
      return this.memoryTickets.delete(id)
    }

    const stmt = this.db.prepare('DELETE FROM tickets WHERE id = ? OR code = ?')
    stmt.run(id, id)
    return true
  }

  public clearAllTickets(): void {
    if (this.isFallback || !this.db) {
      this.memoryTickets.clear()
      return
    }

    this.db.exec('DELETE FROM tickets;')
  }

  // ─── SESSIONS CRUD ────────────────────────────────────────────────────────

  public upsertSession(session: SessionRow): void {
    if (this.isFallback || !this.db) return

    const stmt = this.db.prepare(`
      INSERT INTO sessions (
        id, ticket_code, ticket_id, session_token, status,
        pi_id, pi_name, created_at, completed_at, photo_count, settings_json
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(id) DO UPDATE SET
        ticket_code = excluded.ticket_code,
        ticket_id = excluded.ticket_id,
        status = excluded.status,
        completed_at = excluded.completed_at,
        photo_count = excluded.photo_count,
        settings_json = excluded.settings_json
    `)

    stmt.run(
      session.id,
      session.ticketCode ?? null,
      session.ticketId ?? null,
      session.sessionToken ?? null,
      session.status,
      session.piId ?? null,
      session.piName ?? null,
      session.createdAt,
      session.completedAt ?? null,
      session.photoCount ?? 0,
      session.settingsJson ?? null
    )
  }

  public getSessionById(id: string): SessionRow | undefined {
    if (this.isFallback || !this.db) return undefined

    const stmt = this.db.prepare('SELECT * FROM sessions WHERE id = ? LIMIT 1')
    const row = stmt.get(id) as Record<string, any> | undefined
    if (!row) return undefined

    return {
      id: row.id,
      ticketCode: row.ticket_code ?? undefined,
      ticketId: row.ticket_id ?? undefined,
      sessionToken: row.session_token ?? undefined,
      status: row.status,
      piId: row.pi_id ?? undefined,
      piName: row.pi_name ?? undefined,
      createdAt: row.created_at,
      completedAt: row.completed_at ?? undefined,
      photoCount: Number(row.photo_count || 0),
      settingsJson: row.settings_json ?? undefined,
    }
  }

  public getSessionByTicketCode(ticketCode: string): SessionRow | undefined {
    if (this.isFallback || !this.db) return undefined

    const stmt = this.db.prepare('SELECT * FROM sessions WHERE ticket_code = ? ORDER BY created_at DESC LIMIT 1')
    const row = stmt.get(ticketCode) as Record<string, any> | undefined
    if (!row) return undefined

    return {
      id: row.id,
      ticketCode: row.ticket_code ?? undefined,
      ticketId: row.ticket_id ?? undefined,
      sessionToken: row.session_token ?? undefined,
      status: row.status,
      piId: row.pi_id ?? undefined,
      piName: row.pi_name ?? undefined,
      createdAt: row.created_at,
      completedAt: row.completed_at ?? undefined,
      photoCount: Number(row.photo_count || 0),
      settingsJson: row.settings_json ?? undefined,
    }
  }

  // ─── PHOTOS CRUD ──────────────────────────────────────────────────────────

  public insertPhoto(photo: PhotoRow): void {
    if (this.isFallback || !this.db) return

    const stmt = this.db.prepare(`
      INSERT INTO photos (
        id, session_id, ticket_code, original_path, thumbnail_path,
        preview_path, vault_path, original_url, thumbnail_url, preview_url,
        width, height, size, is_favorite, uploaded_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(id) DO UPDATE SET
        ticket_code = excluded.ticket_code,
        vault_path = excluded.vault_path,
        is_favorite = excluded.is_favorite
    `)

    stmt.run(
      photo.id,
      photo.sessionId,
      photo.ticketCode ?? null,
      photo.originalPath,
      photo.thumbnailPath ?? null,
      photo.previewPath ?? null,
      photo.vaultPath ?? null,
      photo.originalUrl ?? null,
      photo.thumbnailUrl ?? null,
      photo.previewUrl ?? null,
      photo.width ?? null,
      photo.height ?? null,
      photo.size ?? null,
      photo.isFavorite ?? 0,
      photo.uploadedAt
    )
  }

  public getPhotosByTicketCode(ticketCode: string): PhotoRow[] {
    if (this.isFallback || !this.db) return []

    const stmt = this.db.prepare('SELECT * FROM photos WHERE ticket_code = ? ORDER BY uploaded_at ASC')
    const rows = stmt.all(ticketCode) as Record<string, any>[]
    return rows.map(r => ({
      id: r.id,
      sessionId: r.session_id,
      ticketCode: r.ticket_code ?? undefined,
      originalPath: r.original_path,
      thumbnailPath: r.thumbnail_path ?? undefined,
      previewPath: r.preview_path ?? undefined,
      vaultPath: r.vault_path ?? undefined,
      originalUrl: r.original_url ?? undefined,
      thumbnailUrl: r.thumbnail_url ?? undefined,
      previewUrl: r.preview_url ?? undefined,
      width: r.width ? Number(r.width) : undefined,
      height: r.height ? Number(r.height) : undefined,
      size: r.size ? Number(r.size) : undefined,
      isFavorite: r.is_favorite ? Number(r.is_favorite) : 0,
      uploadedAt: r.uploaded_at,
    }))
  }

  public linkSessionPhotosToTicket(sessionId: string, ticketCode: string): void {
    if (this.isFallback || !this.db) return

    const stmt = this.db.prepare('UPDATE photos SET ticket_code = ? WHERE session_id = ?')
    stmt.run(ticketCode, sessionId)

    const sessionStmt = this.db.prepare('UPDATE sessions SET ticket_code = ? WHERE id = ?')
    sessionStmt.run(ticketCode, sessionId)
  }

  // ─── AUDIT LOGGING ────────────────────────────────────────────────────────

  public logAudit(action: string, ticketCode?: string, sessionId?: string, details?: Record<string, any>): void {
    try {
      const now = new Date().toISOString()
      const detailsStr = details ? JSON.stringify(details) : null

      if (!this.isFallback && this.db) {
        const stmt = this.db.prepare(`
          INSERT INTO audit_logs (timestamp, action, ticket_code, session_id, details)
          VALUES (?, ?, ?, ?, ?)
        `)
        stmt.run(now, action, ticketCode ?? null, sessionId ?? null, detailsStr)
      }
      console.log(`[Audit] [${action}] Ticket: #${ticketCode || 'N/A'} | Session: ${sessionId || 'N/A'}`)
    } catch (e) {
      console.warn('[Audit] Failed writing audit log:', e)
    }
  }

  // ─── HELPER MAPPERS ───────────────────────────────────────────────────────

  private mapRowToTicket(row: Record<string, any>): TicketRow {
    return {
      id: row.id,
      code: row.code,
      customerName: row.customer_name ?? undefined,
      customerPhone: row.customer_phone ?? undefined,
      notes: row.notes ?? undefined,
      status: row.status,
      createdAt: row.created_at,
      claimedAt: row.claimed_at ?? undefined,
      startedAt: row.started_at ?? undefined,
      completedAt: row.completed_at ?? undefined,
      sessionId: row.session_id ?? undefined,
      photoCount: Number(row.photo_count || 0),
      printCount: Number(row.print_count || 0),
      paymentMethod: row.payment_method ?? undefined,
      paymentAmount: row.payment_amount !== null && row.payment_amount !== undefined ? Number(row.payment_amount) : undefined,
      paymentStatus: row.payment_status ?? undefined,
      paidAt: row.paid_at ?? undefined,
      upiTransactionRef: row.upi_transaction_ref ?? undefined,
      planType: row.plan_type ? Number(row.plan_type) : 99,
      vaultPath: row.vault_path ?? undefined,
    }
  }
}

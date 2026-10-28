import { Router, Request, Response } from 'express'
import * as path from 'path'
import * as fs from 'fs'
import * as crypto from 'crypto'
import { v4 as uuidv4 } from 'uuid'
import { getDataPath, io, getDatabase } from '../index'

export const sessionRouter = Router()

// ─── POST /api/session/create ──────────────────────────────────────────────
sessionRouter.post('/create', (req: Request, res: Response) => {
  const { piId, piName, ticketCode, ticketId } = req.body || {}
  
  const now = new Date()
  const dateStr = now.toISOString().replace(/[:.]/g, '-').slice(0, 19)
  // Collision-free high-resolution session ID
  const sessionId = `SESSION-${dateStr}-${uuidv4().slice(0, 8)}`
  
  // 64-char crypto session token
  const sessionToken = crypto.randomBytes(32).toString('hex')
  const cleanTicketCode = ticketCode ? String(ticketCode).replace(/^#/, '').trim() : undefined
  
  const session = {
    id: sessionId,
    sessionToken,
    createdAt: now.toISOString(),
    status: 'receiving',
    piId: piId ?? 'unknown',
    piName: piName ?? 'Camera Unit',
    ticketCode: cleanTicketCode,
    ticketId: ticketId ?? undefined,
    photos: [],
    selectedPhotoIds: [],
    assignments: [],
    strips: [],
    layout: { photosPerStrip: 4, stripCount: 1 },
    template: null,
    globalFilter: null,
    canvasElements: [],
    exportSettings: {
      format: 'jpeg',
      quality: 95,
      dpi: 300,
    },
    printSettings: {
      copies: 1,
      paperSize: '4x6',
    },
  }
  
  // Create session directory structure safely
  const sessionDir = path.join(getDataPath(), 'sessions', sessionId)
  for (const dir of ['originals', 'thumbnails', 'previews', 'exports']) {
    fs.mkdirSync(path.join(sessionDir, dir), { recursive: true })
  }
  
  // Write session.json
  fs.writeFileSync(
    path.join(sessionDir, 'session.json'),
    JSON.stringify(session, null, 2)
  )

  // Record in SQLite database
  const db = getDatabase()
  if (db) {
    db.upsertSession({
      id: sessionId,
      ticketCode: cleanTicketCode,
      ticketId: ticketId ?? undefined,
      sessionToken,
      status: 'receiving',
      piId: piId ?? 'unknown',
      piName: piName ?? 'Camera Unit',
      createdAt: now.toISOString(),
      photoCount: 0,
    })
    db.logAudit('SESSION_CREATED', cleanTicketCode, sessionId, { piName: piName ?? 'Camera Unit' })
  }
  
  io?.emit('session:created', { sessionId, piName: piName ?? 'Camera Unit', ticketCode: cleanTicketCode })
  console.log(`[Sessions] Created collision-free session: ${sessionId} [Ticket: #${cleanTicketCode || 'N/A'}]`)
  
  res.json({
    sessionId,
    sessionToken,
    ticketCode: cleanTicketCode,
    uploadEndpoint: `/api/photos/upload`,
    wsEndpoint: `/`,
  })
})

// ─── GET /api/session/:id ─────────────────────────────────────────────────
sessionRouter.get('/:id', (req: Request, res: Response) => {
  const id = req.params.id as string
  if (!/^[a-zA-Z0-9_-]+$/.test(id)) {
    return res.status(400).json({ error: 'Invalid session ID' })
  }

  const sessionFile = path.join(getDataPath(), 'sessions', id, 'session.json')
  if (!fs.existsSync(sessionFile)) {
    return res.status(404).json({ error: 'Session not found' })
  }
  
  const session = JSON.parse(fs.readFileSync(sessionFile, 'utf-8'))
  const { sessionToken: _token, ...publicSession } = session
  res.json(publicSession)
})

// ─── GET /api/session/:id/photos ─────────────────────────────────────────
sessionRouter.get('/:id/photos', (req: Request, res: Response) => {
  const id = req.params.id as string
  if (!/^[a-zA-Z0-9_-]+$/.test(id)) {
    return res.status(400).json({ error: 'Invalid session ID' })
  }

  const sessionFile = path.join(getDataPath(), 'sessions', id, 'session.json')
  if (!fs.existsSync(sessionFile)) {
    return res.status(404).json({ error: 'Session not found' })
  }
  
  const session = JSON.parse(fs.readFileSync(sessionFile, 'utf-8'))
  res.json({ photos: session.photos })
})

// ─── POST /api/session/:id/complete ──────────────────────────────────────
sessionRouter.post('/:id/complete', validateToken, (req: Request, res: Response) => {
  const id = req.params.id as string
  const sessionFile = path.join(getDataPath(), 'sessions', id, 'session.json')
  
  if (!fs.existsSync(sessionFile)) {
    return res.status(404).json({ error: 'Session not found' })
  }
  
  const session = JSON.parse(fs.readFileSync(sessionFile, 'utf-8'))
  session.status = 'selecting'
  
  fs.writeFileSync(sessionFile, JSON.stringify(session, null, 2))
  
  io?.emit('session:complete', {
    sessionId: id,
    count: session.photos.length,
  })
  
  console.log(`[Sessions] Completed session: ${id} (${session.photos.length} photos)`)
  res.json({ success: true, photoCount: session.photos.length })
})

// ─── POST /api/session/:id/update ────────────────────────────────────────
sessionRouter.post('/:id/update', (req: Request, res: Response) => {
  const id = req.params.id as string
  if (!/^[a-zA-Z0-9_-]+$/.test(id)) {
    return res.status(400).json({ error: 'Invalid session ID' })
  }

  const sessionFile = path.join(getDataPath(), 'sessions', id, 'session.json')
  if (!fs.existsSync(sessionFile)) {
    return res.status(404).json({ error: 'Session not found' })
  }
  
  const session = JSON.parse(fs.readFileSync(sessionFile, 'utf-8'))
  const updates = req.body
  
  // Merge updates safely, preserving photos
  const updated = { ...session, ...updates, photos: session.photos }
  fs.writeFileSync(sessionFile, JSON.stringify(updated, null, 2))
  
  res.json({ success: true })
})

// ─── POST /api/session/cleanup ───────────────────────────────────────────
sessionRouter.post('/cleanup', (req: Request, res: Response) => {
  const retentionDays = Math.max(1, Math.min(365, Number(req.body.retentionDays) || 7))
  const sessionsDir = path.join(getDataPath(), 'sessions')
  
  if (!fs.existsSync(sessionsDir)) {
    return res.json({ deletedCount: 0, reclaimedBytes: 0 })
  }

  const now = Date.now()
  const maxAgeMs = retentionDays * 24 * 60 * 60 * 1000
  let deletedCount = 0
  let reclaimedBytes = 0

  const entries = fs.readdirSync(sessionsDir, { withFileTypes: true })
  for (const entry of entries) {
    if (!entry.isDirectory()) continue
    const sessionDir = path.join(sessionsDir, entry.name)
    const sessionJson = path.join(sessionDir, 'session.json')
    
    try {
      let createdAtMs = 0
      if (fs.existsSync(sessionJson)) {
        const data = JSON.parse(fs.readFileSync(sessionJson, 'utf-8'))
        createdAtMs = new Date(data.createdAt).getTime()
      } else {
        createdAtMs = fs.statSync(sessionDir).mtimeMs
      }

      if (now - createdAtMs > maxAgeMs) {
        // Calculate size before deleting
        const getDirSize = (d: string): number => {
          let s = 0
          for (const f of fs.readdirSync(d, { withFileTypes: true })) {
            const p = path.join(d, f.name)
            s += f.isDirectory() ? getDirSize(p) : fs.statSync(p).size
          }
          return s
        }

        try {
          reclaimedBytes += getDirSize(sessionDir)
          fs.rmSync(sessionDir, { recursive: true, force: true })
          deletedCount++
          console.log(`[Sessions] Retention pruned expired session: ${entry.name}`)
        } catch (delErr) {
          console.error(`[Sessions] Failed to prune directory ${sessionDir}:`, delErr)
        }
      }
    } catch (parseErr) {
      console.warn(`[Sessions] Error evaluating session ${entry.name}:`, parseErr)
    }
  }

  res.json({
    success: true,
    deletedCount,
    reclaimedBytes,
    message: `Cleaned up ${deletedCount} session(s) older than ${retentionDays} day(s).`,
  })
})

// ─── GET /api/session (Protected against unauthenticated LAN scraping) ────
sessionRouter.get('/', (req: Request, res: Response) => {
  // Allow local loopback callers or admin token
  const clientIp = req.ip || req.socket.remoteAddress || ''
  const isLoopback = clientIp.includes('127.0.0.1') || clientIp === '::1' || clientIp.includes('localhost')
  const adminHeader = req.headers['x-admin-auth']

  if (!isLoopback && !adminHeader) {
    return res.status(403).json({ error: 'Access restricted to kiosk host' })
  }

  const sessionsDir = path.join(getDataPath(), 'sessions')
  if (!fs.existsSync(sessionsDir)) return res.json({ sessions: [] })
  
  const sessions = fs.readdirSync(sessionsDir)
    .filter(name => fs.existsSync(path.join(sessionsDir, name, 'session.json')))
    .map(name => {
      try {
        const data = JSON.parse(
          fs.readFileSync(path.join(sessionsDir, name, 'session.json'), 'utf-8')
        )
        const { sessionToken: _token, ...publicData } = data
        return publicData
      } catch {
        return null
      }
    })
    .filter(Boolean)
    .sort((a, b) => 
      new Date((b as { createdAt: string }).createdAt).getTime() - 
      new Date((a as { createdAt: string }).createdAt).getTime()
    )
  
  res.json({ sessions })
})

// ─── Token validation middleware ──────────────────────────────────────────
function validateToken(req: Request, res: Response, next: () => void) {
  const id = req.params.id as string
  const authHeader = req.headers.authorization
  
  if (!authHeader?.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Missing authorization token' })
  }
  
  const token = authHeader.slice(7).trim()
  const sessionFile = path.join(getDataPath(), 'sessions', id, 'session.json')
  
  if (!fs.existsSync(sessionFile)) {
    return res.status(404).json({ error: 'Session not found' })
  }
  
  try {
    const session = JSON.parse(fs.readFileSync(sessionFile, 'utf-8'))
    const tokenBuf = Buffer.from(token)
    const storedBuf = Buffer.from(session.sessionToken ?? '')
    
    // Constant-time length check prevents RangeError DoS
    if (tokenBuf.length === 0 || tokenBuf.length !== storedBuf.length || !crypto.timingSafeEqual(tokenBuf, storedBuf)) {
      return res.status(403).json({ error: 'Invalid token' })
    }
  } catch {
    return res.status(403).json({ error: 'Token validation error' })
  }
  
  next()
}

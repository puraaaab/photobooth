import { Router, Request, Response } from 'express'
import * as path from 'path'
import * as fs from 'fs'
import * as crypto from 'crypto'
import multer from 'multer'
import { v4 as uuidv4 } from 'uuid'
import sharp from 'sharp'
import { getDataPath, io, getDatabase, getVaultManager, getTicketManager } from '../index'

export const photoRouter = Router()

// ─── Security config ──────────────────────────────────────────────────────
const MAX_FILE_SIZE = 25 * 1024 * 1024 // 25MB
const ALLOWED_MIME_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp'])
const ALLOWED_EXTENSIONS = new Set(['.jpg', '.jpeg', '.png', '.webp'])
const MAX_PHOTOS_PER_SESSION = 60
const SANITIZE_FILENAME = /[^a-zA-Z0-9._-]/g

// ─── Multer configuration ──────────────────────────────────────────────────
const storage = multer.diskStorage({
  destination: (req, _file, cb) => {
    const sessionId = req.headers['x-session-id'] as string
    if (!sessionId || !/^[a-zA-Z0-9_-]+$/.test(sessionId)) {
      return cb(new Error('Invalid or missing session ID'), '')
    }
    const uploadDir = path.join(getDataPath(), 'sessions', sessionId, 'originals')
    try {
      fs.mkdirSync(uploadDir, { recursive: true })
      cb(null, uploadDir)
    } catch (err) {
      cb(err as Error, '')
    }
  },
  filename: (_req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase()
    const safeExt = ALLOWED_EXTENSIONS.has(ext) ? ext : '.jpg'
    cb(null, `photo-${Date.now()}-${uuidv4().slice(0, 8)}${safeExt}`)
  },
})

const upload = multer({
  storage,
  limits: { fileSize: MAX_FILE_SIZE },
  fileFilter: (_req, file, cb) => {
    if (!ALLOWED_MIME_TYPES.has(file.mimetype)) {
      return cb(new Error(`Invalid file type: ${file.mimetype}`))
    }
    const ext = path.extname(file.originalname).toLowerCase()
    if (!ALLOWED_EXTENSIONS.has(ext)) {
      return cb(new Error(`Invalid extension: ${ext}`))
    }
    cb(null, true)
  },
})

// ─── Token validation ─────────────────────────────────────────────────────
function validateSessionToken(req: Request, res: Response): string | null {
  const rawSessionId = req.headers['x-session-id'] || req.params.sessionId
  const sessionId = typeof rawSessionId === 'string' ? rawSessionId : Array.isArray(rawSessionId) ? rawSessionId[0] : ''
  const authHeader = req.headers.authorization
  const isInternalBooth = req.headers['x-booth-internal'] === 'true'
  
  if (!sessionId || !/^[a-zA-Z0-9_-]+$/.test(sessionId)) {
    res.status(401).json({ error: 'Missing or invalid session ID' })
    return null
  }

  if (!isInternalBooth && !authHeader?.startsWith('Bearer ')) {
    res.status(401).json({ error: 'Missing authorization token' })
    return null
  }
  
  const sessionFile = path.join(getDataPath(), 'sessions', sessionId, 'session.json')
  
  if (!fs.existsSync(sessionFile)) {
    res.status(404).json({ error: 'Session not found' })
    return null
  }
  
  try {
    const session = JSON.parse(fs.readFileSync(sessionFile, 'utf-8'))
    
    // Check session lock
    if (['completed', 'archived'].includes(session.status)) {
      res.status(409).json({ 
        error: 'Session is completed and locked', 
        status: session.status,
      })
      return null
    }
    
    // Check photo limit
    if ((session.photos?.length ?? 0) >= MAX_PHOTOS_PER_SESSION) {
      res.status(429).json({ error: 'Maximum photos per session reached' })
      return null
    }
    
    // If bearer token is provided, validate it; otherwise if internal booth, pass
    if (authHeader?.startsWith('Bearer ')) {
      const token = authHeader.slice(7).trim()
      const tokenBuf = Buffer.from(token)
      const storedBuf = Buffer.from(session.sessionToken ?? '')
      if (tokenBuf.length === 0 || tokenBuf.length !== storedBuf.length || !crypto.timingSafeEqual(tokenBuf, storedBuf)) {
        res.status(403).json({ error: 'Invalid session token' })
        return null
      }
    }
  } catch (err) {
    res.status(403).json({ error: 'Token validation failed' })
    return null
  }
  
  return sessionId
}

// ─── POST /api/photos/upload ──────────────────────────────────────────────
photoRouter.post('/upload', (req: Request, res: Response) => {
  const sessionId = validateSessionToken(req, res)
  if (!sessionId) return
  
  upload.single('photo')(req, res, async (err) => {
    if (err) {
      if (err.code === 'LIMIT_FILE_SIZE') {
        return res.status(413).json({ error: 'File too large (max 25MB)' })
      }
      return res.status(400).json({ error: err.message })
    }
    
    if (!req.file) {
      return res.status(400).json({ error: 'No photo file uploaded' })
    }
    
    const file = req.file
    const photoId = `photo-${Date.now()}-${uuidv4().slice(0, 8)}`
    const originalPath = file.path
    
    try {
      const thumbDir = path.join(getDataPath(), 'sessions', sessionId, 'thumbnails')
      const thumbPath = path.join(thumbDir, `${photoId}-thumb.jpg`)
      fs.mkdirSync(thumbDir, { recursive: true })
      
      // Auto-orient based on EXIF tag with .rotate()
      await sharp(originalPath)
        .rotate()
        .resize(600, 800, { fit: 'inside', withoutEnlargement: true })
        .jpeg({ quality: 90 })
        .toFile(thumbPath)
      
      const previewDir = path.join(getDataPath(), 'sessions', sessionId, 'previews')
      const previewPath = path.join(previewDir, `${photoId}-preview.jpg`)
      fs.mkdirSync(previewDir, { recursive: true })
      
      const rotatedMetadata = await sharp(originalPath).rotate().metadata()
      
      await sharp(originalPath)
        .rotate()
        .resize(2560, 2560, { fit: 'inside', withoutEnlargement: true })
        .jpeg({ quality: 95 })
        .toFile(previewPath)
      
      // Relative URLs for dynamic LAN / loopback host portability
      const originalFilename = path.basename(originalPath)
      const photo = {
        id: photoId,
        sessionId,
        originalPath,
        thumbnailPath: thumbPath,
        previewPath,
        originalUrl: `/sessions/${sessionId}/originals/${originalFilename}`,
        thumbnailUrl: `/sessions/${sessionId}/thumbnails/${path.basename(thumbPath)}`,
        previewUrl: `/sessions/${sessionId}/previews/${path.basename(previewPath)}`,
        metadata: {
          width: rotatedMetadata.width ?? 0,
          height: rotatedMetadata.height ?? 0,
          format: rotatedMetadata.format ?? 'jpeg',
          size: file.size,
          originalName: file.originalname.replace(SANITIZE_FILENAME, ''),
        },
        edits: {
          filter: 'original',
          filterIntensity: 100,
          crop: { x: 0, y: 0, width: 1, height: 1 },
          rotation: 0,
          flipH: false,
          flipV: false,
          brightness: 0,
          contrast: 0,
          saturation: 0,
          exposure: 0,
          temperature: 0,
          tint: 0,
          highlights: 0,
          shadows: 0,
          sharpness: 0,
          blur: 0,
          grain: 0,
          vignette: 0,
          fade: 0,
        },
        isFavorite: false,
        uploadedAt: new Date().toISOString(),
      }
      
      // Append to session safely
      const sessionFile = path.join(getDataPath(), 'sessions', sessionId, 'session.json')
      const session = JSON.parse(fs.readFileSync(sessionFile, 'utf-8'))
      
      session.photos.push(photo)
      fs.writeFileSync(sessionFile, JSON.stringify(session, null, 2))

      // ─── Save photo to Ticket Vault folder by Ticket Number ─────────────────
      let ticketCode: string | undefined =
        (req.headers['x-ticket-code'] as string)?.replace(/^#/, '').trim() ||
        session.ticketCode?.replace(/^#/, '').trim()

      if (!ticketCode) {
        const matchingTicket = getTicketManager()?.listTickets().find(t => t.sessionId === sessionId)
        if (matchingTicket) {
          ticketCode = matchingTicket.code
          session.ticketCode = ticketCode
          try {
            fs.writeFileSync(sessionFile, JSON.stringify(session, null, 2))
          } catch {}
        }
      }

      let vaultOriginalPath: string | undefined
      if (ticketCode) {
        const vault = getVaultManager()
        if (vault) {
          const saved = vault.savePhoto(ticketCode, photoId, originalPath, thumbPath)
          vaultOriginalPath = saved.vaultOriginal
          console.log(`[Photos] Saved photo to ticket vault: Ticket #${ticketCode} -> ${saved.vaultOriginal}`)
        }
      }

      // ─── Record photo in SQLite Database ────────────────────────────────────
      const db = getDatabase()
      if (db) {
        db.insertPhoto({
          id: photoId,
          sessionId,
          ticketCode,
          originalPath,
          thumbnailPath: thumbPath,
          previewPath,
          vaultPath: vaultOriginalPath,
          originalUrl: photo.originalUrl,
          thumbnailUrl: photo.thumbnailUrl,
          previewUrl: photo.previewUrl,
          width: rotatedMetadata.width,
          height: rotatedMetadata.height,
          size: file.size,
          uploadedAt: photo.uploadedAt,
        })
        db.logAudit('PHOTO_INGESTED', ticketCode, sessionId, {
          photoId,
          size: file.size,
          vaultPath: vaultOriginalPath,
        })
      }
      
      // Emit real-time event to UI
      io?.emit('photo:received', {
        photoId,
        sessionId,
        ticketCode,
        originalUrl: photo.originalUrl,
        thumbnailUrl: photo.thumbnailUrl,
        previewUrl: photo.previewUrl,
        vaultOriginalUrl: ticketCode ? `/vault/${ticketCode}/originals/${path.basename(vaultOriginalPath || '')}` : undefined,
        metadata: photo.metadata,
        photoIndex: session.photos.length - 1,
        totalPhotos: session.photos.length,
      })
      
      console.log(`[Photos] Ingested photo ${photoId} for session ${sessionId} [Ticket: #${ticketCode || 'N/A'}] (total: ${session.photos.length})`)
      
      res.json({
        photoId,
        sessionId,
        ticketCode,
        originalUrl: photo.originalUrl,
        thumbnailUrl: photo.thumbnailUrl,
        previewUrl: photo.previewUrl,
        duplicate: false,
      })
      
    } catch (processErr: unknown) {
      console.error('[Photos] Processing error:', processErr)
      if (fs.existsSync(originalPath)) {
        try { fs.unlinkSync(originalPath) } catch {}
      }

      // Check for disk full (ENOSPC)
      if ((processErr as { code?: string })?.code === 'ENOSPC') {
        return res.status(507).json({ 
          error: 'Insufficient storage on booth drive. Please alert attendant.',
          code: 'ENOSPC'
        })
      }

      res.status(500).json({ error: 'Failed to process photo' })
    }
  })
})

// ─── GET /api/photos/:sessionId/:photoId ──────────────────────────────────
photoRouter.get('/:sessionId/:photoId', (req: Request, res: Response) => {
  const sessionId = req.params.sessionId as string
  const photoId = req.params.photoId as string
  if (!/^[a-zA-Z0-9_-]+$/.test(sessionId) || !/^[a-zA-Z0-9_-]+$/.test(photoId)) {
    return res.status(400).json({ error: 'Invalid parameters' })
  }

  const sessionFile = path.join(getDataPath(), 'sessions', sessionId, 'session.json')
  if (!fs.existsSync(sessionFile)) {
    return res.status(404).json({ error: 'Session not found' })
  }
  
  const session = JSON.parse(fs.readFileSync(sessionFile, 'utf-8'))
  const photo = session.photos.find((p: { id: string }) => p.id === photoId)
  
  if (!photo) {
    return res.status(404).json({ error: 'Photo not found' })
  }
  
  const { sessionToken: _t, ...publicPhoto } = photo
  res.json(publicPhoto)
})

// ─── DELETE /api/photos/:sessionId/:photoId ───────────────────────────────
photoRouter.delete('/:sessionId/:photoId', (req: Request, res: Response) => {
  const sessionId = validateSessionToken(req, res)
  if (!sessionId) return

  const photoId = req.params.photoId as string
  const sessionFile = path.join(getDataPath(), 'sessions', sessionId, 'session.json')
  
  if (!fs.existsSync(sessionFile)) {
    return res.status(404).json({ error: 'Session not found' })
  }
  
  const session = JSON.parse(fs.readFileSync(sessionFile, 'utf-8'))
  const photoIndex = session.photos.findIndex((p: { id: string }) => p.id === photoId)
  
  if (photoIndex === -1) {
    return res.status(404).json({ error: 'Photo not found' })
  }

  // Delete physical files
  const photo = session.photos[photoIndex]
  if (photo.originalPath && fs.existsSync(photo.originalPath)) {
    try { fs.unlinkSync(photo.originalPath) } catch {}
  }
  if (photo.thumbnailPath && fs.existsSync(photo.thumbnailPath)) {
    try { fs.unlinkSync(photo.thumbnailPath) } catch {}
  }
  if (photo.previewPath && fs.existsSync(photo.previewPath)) {
    try { fs.unlinkSync(photo.previewPath) } catch {}
  }
  
  session.photos.splice(photoIndex, 1)
  fs.writeFileSync(sessionFile, JSON.stringify(session, null, 2))

  io?.emit('photo:deleted', { sessionId, photoId })
  res.json({ success: true, message: 'Photo deleted successfully' })
})

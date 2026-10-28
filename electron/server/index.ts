import express, { Request, Response } from 'express'
import * as http from 'http'
import * as path from 'path'
import * as fs from 'fs'
import cors from 'cors'
import { Server as SocketIOServer } from 'socket.io'
import { sessionRouter } from './routes/sessions'
import { photoRouter } from './routes/photos'
import { exportRouter } from './routes/export'
import { downloadRouter } from './routes/download'
import { emailRouter, processEmailQueue } from './routes/email'
import { smsRouter, processSmsQueue } from './routes/sms'
import { ticketRouter } from './routes/tickets'
import { TicketManager } from '../ticketManager'

const PORT = 3847

let server: http.Server | null = null
export let io: SocketIOServer | null = null
let userDataPath = ''
let ticketManager: TicketManager | null = null
let backgroundWorkerTimer: NodeJS.Timeout | null = null

export function getDataPath() {
  return userDataPath
}

export function getTicketManager() {
  return ticketManager
}

export async function startServer(dataPath: string): Promise<void> {
  userDataPath = dataPath
  ticketManager = new TicketManager(dataPath)
  
  const app = express()

  // ─── Middleware ────────────────────────────────────────────────────────────
  app.use(cors({
    origin: true,
    credentials: true,
  }))
  
  app.use(express.json({ limit: '25mb' }))
  app.use(express.urlencoded({ extended: true, limit: '25mb' }))

  // ─── Secure Session File Streaming (NO PUBLIC DIRECTORY LISTING) ────────────
  // Replaces raw express.static to prevent unauthenticated LAN directory browsing
  app.get('/sessions/:sessionId/:folder/:filename', (req: Request, res: Response) => {
    const sessionId = typeof req.params.sessionId === 'string' ? req.params.sessionId : ''
    const folder = typeof req.params.folder === 'string' ? req.params.folder : ''
    const filename = typeof req.params.filename === 'string' ? req.params.filename : ''

    if (!/^[a-zA-Z0-9_-]+$/.test(sessionId) || !/^[a-zA-Z0-9_-]+$/.test(folder) || !/^[a-zA-Z0-9._-]+$/.test(filename)) {
      return res.status(400).send('Invalid path parameters')
    }

    const allowedFolders = ['thumbnails', 'previews', 'exports', 'originals']
    if (!allowedFolders.includes(folder)) {
      return res.status(403).send('Forbidden folder')
    }

    const filePath = path.join(userDataPath, 'sessions', sessionId, folder, filename)
    if (!fs.existsSync(filePath)) {
      return res.status(404).send('Resource not found')
    }

    // Set proper cache and content type
    const ext = path.extname(filename).toLowerCase()
    const mimeTypes: Record<string, string> = {
      '.jpg': 'image/jpeg',
      '.jpeg': 'image/jpeg',
      '.png': 'image/png',
      '.webp': 'image/webp',
      '.json': 'application/json',
    }

    if (mimeTypes[ext]) {
      res.setHeader('Content-Type', mimeTypes[ext])
    }
    res.setHeader('Access-Control-Allow-Origin', '*')
    res.setHeader('Access-Control-Allow-Methods', 'GET, HEAD, OPTIONS')
    res.setHeader('Cross-Origin-Resource-Policy', 'cross-origin')
    res.setHeader('Cache-Control', 'public, max-age=86400')
    res.sendFile(filePath)
  })

  // ─── Routes ───────────────────────────────────────────────────────────────
  app.use('/api/session', sessionRouter)
  app.use('/api/photos', photoRouter)
  app.use('/api/export', exportRouter)
  app.use('/api/download', downloadRouter)
  app.use('/api/email', emailRouter)
  app.use('/api/sms', smsRouter)
  app.use('/api/tickets', ticketRouter)

  // Remote Hardware Webhook Trigger (Allows Raspberry Pi, ESP32, or foot pedal to trigger booth over LAN)
  app.post('/api/trigger/start', (req: Request, res: Response) => {
    const { source = 'remote' } = req.body || {}
    console.log(`[Server] Hardware trigger received from: ${source}`)
    io?.emit('hardware:trigger', { source, timestamp: new Date().toISOString() })
    res.json({ success: true, message: 'Capture trigger broadcasted' })
  })

  // Health check
  app.get('/api/health', (_req, res) => {
    res.json({ 
      status: 'ok', 
      timestamp: new Date().toISOString(),
      port: PORT,
    })
  })

  // ─── HTTP Server ──────────────────────────────────────────────────────────
  server = http.createServer(app)

  // ─── Socket.IO ───────────────────────────────────────────────────────────
  io = new SocketIOServer(server, {
    cors: {
      origin: '*',
      methods: ['GET', 'POST'],
    },
  })

  io.on('connection', (socket) => {
    console.log('[WS] Client connected:', socket.id)
    
    socket.on('disconnect', () => {
      console.log('[WS] Client disconnected:', socket.id)
    })
    
    // Pi heartbeat
    socket.on('pi:heartbeat', (data: { ipAddress: string; sessionId?: string }) => {
      io?.emit('pi:status', {
        connected: true,
        ipAddress: data.ipAddress,
        sessionId: data.sessionId,
        timestamp: new Date().toISOString(),
      })
    })

    // Capture trigger forwarder
    socket.on('client:trigger', () => {
      io?.emit('hardware:trigger', { source: 'client', timestamp: new Date().toISOString() })
    })

    // Queue synchronization request
    socket.on('queue:sync', () => {
      if (ticketManager) {
        socket.emit('queue:updated', {
          tickets: ticketManager.listTickets(),
          nextCode: ticketManager.getNextCode(),
        })
      }
    })

    // Direct ticket status change
    socket.on('ticket:status_change', (data: { ticketId: string; status: any; photoCount?: number; printCount?: number; sessionId?: string }) => {
      if (ticketManager && data.ticketId && data.status) {
        const updated = ticketManager.updateTicketStatus(data.ticketId, data.status, {
          photoCount: data.photoCount,
          printCount: data.printCount,
          sessionId: data.sessionId,
        })
        if (updated) {
          io?.emit('ticket:updated', updated)
          io?.emit('queue:updated', {
            tickets: ticketManager.listTickets(),
            nextCode: ticketManager.getNextCode(),
          })
        }
      }
    })
  })

  // Periodic offline queue processor (processes pending emails & SMS every 20 seconds)
  backgroundWorkerTimer = setInterval(() => {
    processEmailQueue().catch(err => console.error('[Worker] Email worker error:', err))
    processSmsQueue().catch(err => console.error('[Worker] SMS worker error:', err))
  }, 20000)

  // Bind host: bind to 0.0.0.0 only when remote Pi / LAN access is enabled
  const allowRemote = process.env.ALLOW_REMOTE_PI !== 'false'
  const bindAddress = allowRemote ? '0.0.0.0' : '127.0.0.1'

  return new Promise((resolve, reject) => {
    server!.listen(PORT, bindAddress, () => {
      console.log(`[Server] Photobooth server running on ${bindAddress}:${PORT}`)
      resolve()
    })
    server!.on('error', reject)
  })
}

export async function stopServer(): Promise<void> {
  if (backgroundWorkerTimer) {
    clearInterval(backgroundWorkerTimer)
    backgroundWorkerTimer = null
  }
  return new Promise((resolve) => {
    if (server) {
      io?.close()
      server.close(() => {
        console.log('[Server] Server stopped')
        resolve()
      })
    } else {
      resolve()
    }
  })
}

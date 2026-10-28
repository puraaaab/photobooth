import * as dns from 'dns'
import express, { Request, Response } from 'express'
import * as http from 'http'
import * as path from 'path'
import * as fs from 'fs'
import * as os from 'os'
import cors from 'cors'
import { Server as SocketIOServer } from 'socket.io'
import { sessionRouter } from './routes/sessions'
import { photoRouter } from './routes/photos'
import { exportRouter } from './routes/export'
import { downloadRouter } from './routes/download'
import { emailRouter, processEmailQueue } from './routes/email'
import { smsRouter, processSmsQueue } from './routes/sms'
import { ticketRouter } from './routes/tickets'
import { paymentRouter } from './routes/payments'
import { TicketManager } from './ticketManager'

const PORT = 3847

let discoveredPiIp: string | null = '192.168.29.69'
let lastPiCheckTime = 0

export async function testCameraIp(ip: string, timeoutMs = 500): Promise<boolean> {
  try {
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), timeoutMs)
    const res = await fetch(`http://${ip}:8081/health`, { signal: controller.signal })
    clearTimeout(timer)
    if (res.ok) return true
  } catch {}
  try {
    const controller2 = new AbortController()
    const timer2 = setTimeout(() => controller2.abort(), timeoutMs)
    const res2 = await fetch(`http://${ip}:8080/frame?t=${Date.now()}`, { signal: controller2.signal })
    clearTimeout(timer2)
    if (res2.ok) return true
  } catch {}
  return false
}

export function getAllLocalSubnetPrefixes(): string[] {
  const nets = os.networkInterfaces()
  const prefixes = new Set<string>()
  for (const name of Object.keys(nets)) {
    for (const net of nets[name] || []) {
      if (net.family === 'IPv4' && !net.internal && net.address) {
        const lastDot = net.address.lastIndexOf('.')
        if (lastDot > 0) {
          prefixes.add(net.address.substring(0, lastDot))
        }
      }
    }
  }
  return Array.from(prefixes)
}

export async function scanSubnetForPi(): Promise<string | null> {
  const prefixes = getAllLocalSubnetPrefixes()
  if (prefixes.length === 0) prefixes.push('192.168.29')

  // Check known quick candidate list first
  const quickList = Array.from(new Set([
    discoveredPiIp,
    '192.168.29.69',
    '192.168.29.27',
    ...prefixes.map(p => `${p}.69`),
    ...prefixes.map(p => `${p}.27`),
    ...prefixes.map(p => `${p}.70`),
    '127.0.0.1',
    'localhost',
  ])).filter(Boolean) as string[]

  for (const ip of quickList) {
    if (await testCameraIp(ip, 400)) {
      discoveredPiIp = ip
      lastPiCheckTime = Date.now()
      return ip
    }
  }

  // Parallel scan across entire /24 subnet(s) in batches
  for (const prefix of prefixes) {
    const allIps = Array.from({ length: 254 }, (_, i) => `${prefix}.${i + 1}`)
    const batchSize = 35
    for (let i = 0; i < allIps.length; i += batchSize) {
      const batch = allIps.slice(i, i + batchSize)
      const results = await Promise.all(
        batch.map(async (ip) => {
          const isAlive = await testCameraIp(ip, 350)
          return isAlive ? ip : null
        })
      )
      const found = results.find(Boolean)
      if (found) {
        discoveredPiIp = found
        lastPiCheckTime = Date.now()
        console.log(`[Camera] Discovered active camera on network at IP: ${found}`)
        return found
      }
    }
  }

  return null
}

export async function findRaspberryPiIp(): Promise<string> {
  // If we already have a discovered IP and recently verified, return it
  if (discoveredPiIp && (Date.now() - lastPiCheckTime < 10000)) {
    return discoveredPiIp
  }

  if (discoveredPiIp && await testCameraIp(discoveredPiIp, 450)) {
    lastPiCheckTime = Date.now()
    return discoveredPiIp
  }

  // 1. Try mDNS resolution (works on Windows/macOS/Linux via AF_INET)
  try {
    const ip = await new Promise<string>((resolve, reject) => {
      dns.lookup('raspberrypi.local', { family: 4 }, (err, address) => {
        if (err || !address) reject(err)
        else resolve(address)
      })
    })
    if (ip && await testCameraIp(ip, 450)) {
      discoveredPiIp = ip
      lastPiCheckTime = Date.now()
      return ip
    }
  } catch {}

  // 2. Full subnet scanning
  const foundIp = await scanSubnetForPi()
  if (foundIp) {
    return foundIp
  }

  return discoveredPiIp || '192.168.29.27'
}

export function getLocalIpAddress(): string {
  const nets = os.networkInterfaces()
  for (const name of Object.keys(nets)) {
    for (const net of nets[name] || []) {
      if (net.family === 'IPv4' && !net.internal) {
        return net.address
      }
    }
  }
  return '127.0.0.1'
}

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

export function getDatabase() {
  return ticketManager?.getDatabase() ?? null
}

export function getVaultManager() {
  return ticketManager?.getVaultManager() ?? null
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

  // ─── Secure Ticket Vault Media Streaming ──────────────────────────────────
  app.get('/vault/:ticketCode/:folder/:filename', (req: Request, res: Response) => {
    const ticketCode = typeof req.params.ticketCode === 'string' ? req.params.ticketCode.replace(/^#/, '').trim() : ''
    const folder = typeof req.params.folder === 'string' ? req.params.folder : ''
    const filename = typeof req.params.filename === 'string' ? req.params.filename : ''

    if (!/^[a-zA-Z0-9_-]+$/.test(ticketCode) || !/^[a-zA-Z0-9_-]+$/.test(folder) || !/^[a-zA-Z0-9._-]+$/.test(filename)) {
      return res.status(400).send('Invalid path parameters')
    }

    const allowedFolders = ['thumbnails', 'strips', 'originals']
    if (!allowedFolders.includes(folder)) {
      return res.status(403).send('Forbidden folder')
    }

    const filePath = path.join(userDataPath, 'tickets_vault', `Ticket_${ticketCode}`, folder, filename)
    if (!fs.existsSync(filePath)) {
      return res.status(404).send('Resource not found')
    }

    const ext = path.extname(filename).toLowerCase()
    const mimeTypes: Record<string, string> = {
      '.jpg': 'image/jpeg',
      '.jpeg': 'image/jpeg',
      '.png': 'image/png',
      '.webp': 'image/webp',
      '.pdf': 'application/pdf',
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
  app.use('/api', paymentRouter)
  app.use('/website', express.static(path.resolve(__dirname, '..', 'website')))

  // Remote Hardware Webhook Trigger (Allows Raspberry Pi, ESP32, or foot pedal to trigger booth over LAN)
  app.post('/api/trigger/start', (req: Request, res: Response) => {
    const { source = 'remote' } = req.body || {}
    console.log(`[Server] Hardware trigger received from: ${source}`)
    io?.emit('hardware:trigger', { source, timestamp: new Date().toISOString() })
    res.json({ success: true, message: 'Capture trigger broadcasted' })
  })

  // Template Management: Remove selected templates permanently from code
  app.post('/api/templates/remove', (req: Request, res: Response) => {
    try {
      const { ids } = req.body as { ids: string[] }
      if (!Array.isArray(ids) || ids.length === 0) {
        return res.status(400).json({ error: 'ids must be a non-empty array' })
      }
      const tsPath = path.resolve(__dirname, '..', 'src', 'templates', 'batchGeneratedTemplates.ts')
      if (fs.existsSync(tsPath)) {
        const content = fs.readFileSync(tsPath, 'utf-8')
        const jsonMatch = content.match(/BATCH_GENERATED_TEMPLATES:\s*Template\[\]\s*=\s*(\[[\s\S]*\])/)
        if (jsonMatch) {
          const templates = JSON.parse(jsonMatch[1])
          const filtered = templates.filter((t: any) => !ids.includes(t.id))
          const newContent = `import type { Template } from '@/types'\n\n/**\n * Auto-extracted templates from template_images/ with background removed\n * Total templates: ${filtered.length}\n */\nexport const BATCH_GENERATED_TEMPLATES: Template[] = ${JSON.stringify(filtered, null, 2)}\n`
          fs.writeFileSync(tsPath, newContent, 'utf-8')
          console.log(`[Server] Removed ${ids.length} templates. Remaining: ${filtered.length}`)
          return res.json({ success: true, removedCount: ids.length, remainingCount: filtered.length })
        }
      }
      res.json({ success: true, removedCount: ids.length })
    } catch (err: any) {
      console.error('[Server] Error removing templates:', err.message)
      res.status(500).json({ error: err.message })
    }
  })

  // Health check
  app.get('/api/health', (_req, res) => {
    res.json({ 
      status: 'ok', 
      timestamp: new Date().toISOString(),
      port: PORT,
      address: getLocalIpAddress(),
    })
  })

  // Raspberry Pi Camera Auto-Discovery & Status
  app.get('/api/camera/discover', async (_req: Request, res: Response) => {
    const piIp = await findRaspberryPiIp()
    let reachable = false
    try {
      const controller = new AbortController()
      const timer = setTimeout(() => controller.abort(), 1200)
      const healthRes = await fetch(`http://${piIp}:8081/health`, { signal: controller.signal })
      clearTimeout(timer)
      reachable = healthRes.ok
    } catch {}

    res.json({
      success: true,
      piIp,
      reachable,
      streamUrl: `http://${piIp}:8080/stream`,
      frameUrl: `http://${piIp}:8080/frame`,
      captureUrl: `http://${piIp}:8081/capture`,
      healthUrl: `http://${piIp}:8081/health`,
    })
  })

  // Manual IP update
  app.post('/api/camera/set-ip', (req: Request, res: Response) => {
    const { ip } = req.body || {}
    if (ip && typeof ip === 'string') {
      discoveredPiIp = ip.trim()
      lastPiCheckTime = Date.now()
      console.log(`[Camera] Manual Pi IP set to: ${discoveredPiIp}`)
      return res.json({ success: true, piIp: discoveredPiIp })
    }
    res.status(400).json({ error: 'Valid IP string required' })
  })

  // Camera Frame Proxy (solves any CORS / mixed-content / network bridge issue)
  app.get('/api/camera/frame', async (_req: Request, res: Response) => {
    const piIp = await findRaspberryPiIp()
    try {
      const controller = new AbortController()
      const timer = setTimeout(() => controller.abort(), 2000)
      const upstream = await fetch(`http://${piIp}:8080/frame?t=${Date.now()}`, { signal: controller.signal })
      clearTimeout(timer)
      if (!upstream.ok) {
        return res.status(upstream.status).end()
      }
      const buffer = await upstream.arrayBuffer()
      res.setHeader('Content-Type', 'image/jpeg')
      res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate')
      res.send(Buffer.from(buffer))
    } catch (err: any) {
      res.status(503).json({ error: 'Camera frame unreachable', details: err.message })
    }
  })

  // Camera Zoom Proxy
  app.all('/api/camera/zoom', async (req: Request, res: Response) => {
    const piIp = await findRaspberryPiIp()
    const qs = new URLSearchParams(req.query as any).toString()
    try {
      const controller = new AbortController()
      const timer = setTimeout(() => controller.abort(), 2000)
      const upstream = await fetch(`http://${piIp}:8080/zoom?${qs}`, { signal: controller.signal })
      clearTimeout(timer)
      const data = await upstream.json()
      res.json(data)
    } catch (err: any) {
      res.status(500).json({ error: 'Failed to proxy zoom', details: err.message })
    }
  })

  // Camera Capture Proxy (solves direct network blocking)
  app.post('/api/camera/capture', async (req: Request, res: Response) => {
    const piIp = await findRaspberryPiIp()
    try {
      const controller = new AbortController()
      const timer = setTimeout(() => controller.abort(), 8000)
      const upstream = await fetch(`http://${piIp}:8081/capture`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(req.body || {}),
        signal: controller.signal,
      })
      clearTimeout(timer)
      if (!upstream.ok) {
        return res.status(upstream.status).end()
      }
      const buffer = await upstream.arrayBuffer()
      res.setHeader('Content-Type', 'image/jpeg')
      res.send(Buffer.from(buffer))
    } catch (err: any) {
      res.status(500).json({ error: 'Capture proxy failed', details: err.message })
    }
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
      if (data?.ipAddress) {
        discoveredPiIp = data.ipAddress
        lastPiCheckTime = Date.now()
      }
      io?.emit('pi:status', {
        connected: true,
        ipAddress: data?.ipAddress || discoveredPiIp,
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

// Auto-start server in standalone Node environment
const defaultDataDir = process.env.DATA_DIR || path.join(process.cwd(), 'data')
if (!fs.existsSync(defaultDataDir)) {
  fs.mkdirSync(defaultDataDir, { recursive: true })
}
startServer(defaultDataDir).catch((err) => {
  console.error('[Server] Failed to start server:', err)
})

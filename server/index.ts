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
import { paymentRouter, startPaymentReconciler } from './routes/payments'
import { printRouter, autoSetupPrinter } from './routes/print'
import { TicketManager } from './ticketManager'
import { isAllowedOrigin, initStaffPin, requireStaff, clientIp } from './security'
import { getAllLocalSubnetPrefixes, getPrimaryLanAddress } from './network'
export { getAllLocalSubnetPrefixes }

const PORT = Number(process.env.PORT) || 3847

// ─── Pi camera discovery ─────────────────────────────────────────────────────
// Three ways the laptop learns where the booth Pi is, fastest first:
//   1. the Pi announces itself (pi-camera.py → POST /api/camera/announce every 10 s)
//   2. mDNS name raspberrypi.local
//   3. background scan of the laptop's /24 subnet(s)
// Requests never wait for a scan: they use the last known address while the background loop works.
let discoveredPiIp: string | null = null
let lastPiCheckTime = 0
let lastAnnounceTime = 0
let scanInFlight: Promise<string | null> | null = null

export async function testCameraIp(ip: string, timeoutMs = 500): Promise<boolean> {
  try {
    const res = await fetch(`http://${ip}:8081/health`, { signal: AbortSignal.timeout(timeoutMs) })
    if (res.ok) return true
  } catch {}
  try {
    const res2 = await fetch(`http://${ip}:8080/health`, { signal: AbortSignal.timeout(timeoutMs) })
    if (res2.ok) return true
  } catch {}
  return false
}

export async function scanSubnetForPi(): Promise<string | null> {
  for (const prefix of getAllLocalSubnetPrefixes()) {
    const allIps = Array.from({ length: 254 }, (_, i) => `${prefix}.${i + 1}`)
    for (let i = 0; i < allIps.length; i += 64) {
      const results = await Promise.all(allIps.slice(i, i + 64).map(async ip => (await testCameraIp(ip, 400)) ? ip : null))
      const found = results.find(Boolean)
      if (found) return found
    }
  }
  return null
}

function setPiIp(ip: string, how: string) {
  if (discoveredPiIp !== ip) console.log(`[Camera] Booth Pi at ${ip} (${how})`)
  discoveredPiIp = ip
  lastPiCheckTime = Date.now()
}

async function discoverPiOnce(): Promise<string | null> {
  if (discoveredPiIp && await testCameraIp(discoveredPiIp, 600)) {
    lastPiCheckTime = Date.now()
    return discoveredPiIp
  }
  try {
    const ip = await new Promise<string>((resolve, reject) => {
      dns.lookup('raspberrypi.local', { family: 4 }, (err, address) => (err || !address ? reject(err) : resolve(address)))
    })
    if (await testCameraIp(ip, 600)) { setPiIp(ip, 'mDNS'); return ip }
  } catch {}
  const found = await scanSubnetForPi()
  if (found) { setPiIp(found, 'subnet scan'); return found }
  return null
}

/** Background loop: keeps discoveredPiIp fresh. Cheap health check when known, scan only when lost. */
function startPiDiscoveryLoop() {
  const tick = async () => {
    const announcedRecently = Date.now() - lastAnnounceTime < 25_000
    if (!announcedRecently && !scanInFlight) {
      scanInFlight = discoverPiOnce().catch(() => null).finally(() => { scanInFlight = null })
    }
  }
  tick()
  setInterval(tick, 10_000).unref()
}

export function recordPiAnnounce(ip: string) {
  lastAnnounceTime = Date.now()
  setPiIp(ip, 'announced')
}

/** Never blocks on a scan; returns the best address known right now. */
export async function findRaspberryPiIp(): Promise<string> {
  if (discoveredPiIp) return discoveredPiIp
  // First request after boot: give an in-flight scan a moment, then fall back to the mDNS name
  if (scanInFlight) await Promise.race([scanInFlight, new Promise(r => setTimeout(r, 1500))])
  return discoveredPiIp || 'raspberrypi.local'
}

export function getLocalIpAddress(): string {
  return getPrimaryLanAddress()
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
  initStaffPin(dataPath)
  ticketManager = new TicketManager(dataPath)
  
  const app = express()

  // ─── Middleware ────────────────────────────────────────────────────────────
  // Only pages served from localhost / the private LAN may call the API. With `origin: true`
  // any internet website open on the ticket laptop could drive these endpoints.
  app.use(cors({
    origin: (origin, cb) => cb(null, isAllowedOrigin(origin)),
    credentials: true,
  }))
  app.use((req, res, next) => {
    if (!isAllowedOrigin(req.headers.origin)) {
      return res.status(403).json({ error: 'Origin not allowed' })
    }
    next()
  })
  
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
    if (!/^\d{4}$/.test(ticketCode)) {
      return res.status(400).send('Invalid ticket code')
    }
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
  app.use('/api/print', printRouter)
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
  app.post('/api/templates/remove', requireStaff, (req: Request, res: Response) => {
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

  // Lets guest-facing stations check an attendant's PIN (reprints, cash upgrades) without exposing it
  app.post('/api/staff/verify', requireStaff, (_req: Request, res: Response) => {
    res.json({ success: true })
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

  // The booth Pi's camera service calls this every 10 s: the laptop then knows the Pi's current IP
  // without scanning, even after the router hands out a new address.
  app.post('/api/camera/announce', (req: Request, res: Response) => {
    const ip = clientIp(req)
    if (!/^\d{1,3}(\.\d{1,3}){3}$/.test(ip)) return res.status(400).json({ error: 'IPv4 peer required' })
    recordPiAnnounce(ip)
    io?.emit('pi:status', { connected: true, ipAddress: ip, timestamp: new Date().toISOString() })
    res.json({ success: true, serverTime: new Date().toISOString() })
  })

  // Manual IP update
  app.post('/api/camera/set-ip', requireStaff, (req: Request, res: Response) => {
    const { ip } = req.body || {}
    if (ip && typeof ip === 'string' && /^[a-zA-Z0-9.-]{1,253}$/.test(ip.trim())) {
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
    const params = new URLSearchParams()
    if (typeof req.query.level === 'string' && /^\d+(\.\d+)?$/.test(req.query.level)) params.set('level', req.query.level)
    if (typeof req.query.roi === 'string' && /^[\d.,]+$/.test(req.query.roi)) params.set('roi', req.query.roi)
    const qs = params.toString()
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

  // ─── Production UI (single port: http://<laptop-ip>:3847) ──────────────────
  // `npm run build` then `npm start` — no Vite dev server needed at events.
  const distDir = path.resolve(__dirname, '..', 'dist')
  if (fs.existsSync(path.join(distDir, 'index.html'))) {
    app.use(express.static(distDir, { index: false, maxAge: '1h' }))
    app.get(/^\/(?!api\/|sessions\/|vault\/|website\/|socket\.io\/).*/, (_req, res) => {
      res.setHeader('Cache-Control', 'no-cache')
      res.sendFile(path.join(distDir, 'index.html'))
    })
  }

  app.use('/api', (_req: Request, res: Response) => {
    res.status(404).json({ error: 'Unknown API endpoint' })
  })

  // JSON error handler (malformed JSON bodies etc.) so clients never get HTML stack traces
  app.use((err: any, _req: Request, res: Response, _next: () => void) => {
    const status = err?.status || err?.statusCode || 500
    if (status >= 500) console.error('[Server] Unhandled error:', err)
    res.status(status).json({ error: status >= 500 ? 'Internal server error' : (err?.message || 'Bad request') })
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

    // NOTE: the old unauthenticated `ticket:status_change` socket event was removed.
    // Ticket mutations go through the HTTP API, which validates transitions.
  })

  // Periodic offline queue processor (processes pending emails & SMS every 20 seconds)
  let workerBusy = false
  backgroundWorkerTimer = setInterval(async () => {
    if (workerBusy) return // a slow SMTP/Twilio run must not overlap the next tick (double sends)
    workerBusy = true
    try {
      await processEmailQueue().catch(err => console.error('[Worker] Email worker error:', err))
      await processSmsQueue().catch(err => console.error('[Worker] SMS worker error:', err))
    } finally {
      workerBusy = false
    }
  }, 20000)

  // Bind host: bind to 0.0.0.0 only when remote Pi / LAN access is enabled
  const allowRemote = process.env.ALLOW_REMOTE_PI !== 'false'
  const bindAddress = allowRemote ? '0.0.0.0' : '127.0.0.1'

  return new Promise((resolve, reject) => {
    server!.listen(PORT, bindAddress, () => {
      console.log(`[Server] Photobooth server running on ${bindAddress}:${PORT}`)
      // Find the Wi-Fi printer in the background (no setup needed when there is exactly one)
      autoSetupPrinter().catch(err => console.warn('[Print] Printer auto-setup failed:', err?.message))
      startPaymentReconciler()
      startPiDiscoveryLoop()
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

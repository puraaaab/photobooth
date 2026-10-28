#!/usr/bin/env node
/**
 * Photobooth Pi Camera Server
 * ─────────────────────────────────────────────────────────────────────────────
 * Runs on Raspberry Pi 4 alongside the Electron app.
 * 
 * Provides two HTTP endpoints:
 *   GET  :8080/stream   → MJPEG live stream (wide-angle, center-cropped)
 *   POST :8081/capture  → Captures a still image, returns JPEG
 *   GET  :8081/health   → Health check
 *
 * Usage:
 *   node camera-server.js
 *
 * Environment variables:
 *   ZOOM_ROI      Center-crop ROI (default: "0.2,0.1,0.6,0.8" = 1.67x zoom)
 *   JPEG_QUALITY  JPEG quality 1-100 (default: 95)
 *   STREAM_FPS    Live stream framerate (default: 30)
 *   STREAM_W      Stream width  (default: 800)
 *   STREAM_H      Stream height (default: 480)
 *   STILL_W       Still capture width  (default: 2304)
 *   STILL_H       Still capture height (default: 1296)
 */

'use strict'

const http       = require('http')
const { spawn }  = require('child_process')
const express    = require('express')
const cors       = require('cors')
const fs         = require('fs')
const path       = require('path')
const os         = require('os')

// ─── Config ──────────────────────────────────────────────────────────────────
const STREAM_PORT  = parseInt(process.env.STREAM_PORT  || '8080')
const CAPTURE_PORT = parseInt(process.env.CAPTURE_PORT || '8081')

let currentRoi     = process.env.ZOOM_ROI     || '0.2,0.1,0.6,0.8'
const JPEG_QUALITY = parseInt(process.env.JPEG_QUALITY || '95')
const STREAM_FPS   = parseInt(process.env.STREAM_FPS   || '30')
const STREAM_W     = parseInt(process.env.STREAM_W     || '800')
const STREAM_H     = parseInt(process.env.STREAM_H     || '480')
const STILL_W      = parseInt(process.env.STILL_W      || '2304')
const STILL_H      = parseInt(process.env.STILL_H      || '1296')

function zoomLevelToRoi(lvl) {
  const z = Math.max(1, parseFloat(lvl) || 1)
  const w = 1 / z
  const h = 1 / z
  const x = (1 - w) / 2
  const y = (1 - h) / 2
  return `${x.toFixed(4)},${y.toFixed(4)},${w.toFixed(4)},${h.toFixed(4)}`
}

// Apple Camera / True Tone ISP Tuning
const CAMERA_SHARPNESS  = parseFloat(process.env.CAMERA_SHARPNESS  || '1.45')
const CAMERA_CONTRAST   = parseFloat(process.env.CAMERA_CONTRAST   || '1.12')
const CAMERA_SATURATION = parseFloat(process.env.CAMERA_SATURATION || '1.18')
const CAMERA_DENOISE    = process.env.CAMERA_DENOISE || 'cdn_off'
const CAMERA_EV         = parseFloat(process.env.CAMERA_EV || '0.2')
const CAMERA_AWB        = process.env.CAMERA_AWB || 'auto'
const CAMERA_AF_MODE    = process.env.CAMERA_AF_MODE || 'continuous'

const TMP_DIR = os.tmpdir()

// ─── Camera Command Detection (Bookworm: rpicam-vid / Bullseye: libcamera-vid) ─
function getCommand(preferred, fallback) {
  try {
    const { execSync } = require('child_process')
    const out = execSync(`which ${preferred} 2>/dev/null || which ${fallback} 2>/dev/null`).toString().trim()
    return out.includes(fallback) ? fallback : preferred
  } catch {
    return preferred
  }
}
const VID_CMD = process.env.VID_CMD || getCommand('rpicam-vid', 'libcamera-vid')
const STILL_CMD = process.env.STILL_CMD || getCommand('rpicam-still', 'libcamera-still')
console.log(`[Camera] Using video binary: ${VID_CMD}, still binary: ${STILL_CMD}`)

// ─── MJPEG Stream Server (port 8080) ─────────────────────────────────────────
const streamClients = new Set()
let streamProcess   = null
let mjpegBuffer     = Buffer.alloc(0)
let latestJpegFrame = null
const MJPEG_BOUNDARY = '--BoundaryString'

function startStreamProcess() {
  if (streamProcess) {
    streamProcess.kill()
    streamProcess = null
  }

  console.log(`[Camera] Starting MJPEG stream with Apple ISP profile (${VID_CMD}, ROI: ${currentRoi})...`)

  const args = [
    '--width',     String(STREAM_W),
    '--height',    String(STREAM_H),
    '--roi',       currentRoi,
    '--framerate', String(STREAM_FPS),
    '--codec',     'mjpeg',
    '--quality',   String(JPEG_QUALITY),
    '--sharpness', String(CAMERA_SHARPNESS),
    '--contrast',  String(CAMERA_CONTRAST),
    '--saturation',String(CAMERA_SATURATION),
    '--denoise',   String(CAMERA_DENOISE),
    '--ev',        String(CAMERA_EV),
    '--awb',       String(CAMERA_AWB),
    '--inline',
    '--nopreview',
    '--timeout',   '0',
    '-o',          '-',    // stdout
  ]

  if (CAMERA_AF_MODE) {
    args.push('--autofocus-mode', CAMERA_AF_MODE, '--autofocus-range', 'normal')
  }

  streamProcess = spawn(VID_CMD, args, { stdio: ['ignore', 'pipe', 'pipe'] })

  streamProcess.stdout.on('data', (chunk) => {
    mjpegBuffer = Buffer.concat([mjpegBuffer, chunk])

    // Parse MJPEG frames from buffer and broadcast to all clients
    let start, end
    while (
      (start = findJpegStart(mjpegBuffer)) !== -1 &&
      (end   = findJpegEnd(mjpegBuffer, start)) !== -1
    ) {
      const frame = mjpegBuffer.slice(start, end + 2)
      mjpegBuffer = mjpegBuffer.slice(end + 2)
      latestJpegFrame = frame

      const header = [
        MJPEG_BOUNDARY,
        'Content-Type: image/jpeg',
        `Content-Length: ${frame.length}`,
        '',
        '',
      ].join('\r\n')

      for (const client of streamClients) {
        try {
          client.write(Buffer.from(header))
          client.write(frame)
          client.write('\r\n')
        } catch {
          streamClients.delete(client)
        }
      }
    }

    // Prevent buffer growing unbounded
    if (mjpegBuffer.length > 5 * 1024 * 1024) {
      mjpegBuffer = Buffer.alloc(0)
    }
  })

  streamProcess.stderr.on('data', (d) => {
    // libcamera writes info to stderr — only log errors
    const msg = d.toString()
    if (msg.toLowerCase().includes('error')) {
      console.error('[Camera stream]', msg.trim())
    }
  })

  streamProcess.on('exit', (code) => {
    console.log(`[Camera] Stream process exited (code ${code})`)
    streamProcess = null
    // Auto-restart after 2s if there are clients
    if (streamClients.size > 0) {
      setTimeout(startStreamProcess, 2000)
    }
  })
}

function findJpegStart(buf) {
  for (let i = 0; i < buf.length - 1; i++) {
    if (buf[i] === 0xFF && buf[i + 1] === 0xD8) return i
  }
  return -1
}

function findJpegEnd(buf, startAt) {
  for (let i = startAt + 2; i < buf.length - 1; i++) {
    if (buf[i] === 0xFF && buf[i + 1] === 0xD9) return i
  }
  return -1
}

// Stream HTTP server (port 8080)
const streamServer = http.createServer((req, res) => {
  // CORS support
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type')

  if (req.method === 'OPTIONS') {
    res.writeHead(204)
    res.end()
    return
  }

  const parsedUrl = new URL(req.url, `http://${req.headers.host || 'localhost'}`)
  const pathname = parsedUrl.pathname

  // 1. Single frame fetch (/frame)
  if (pathname === '/frame') {
    if (!streamProcess) startStreamProcess()
    if (latestJpegFrame) {
      res.writeHead(200, {
        'Content-Type': 'image/jpeg',
        'Content-Length': latestJpegFrame.length,
        'Cache-Control': 'no-store, no-cache, must-revalidate',
        'Pragma': 'no-cache',
      })
      res.end(latestJpegFrame)
      return
    }
    // Stream warming up, return 503
    res.writeHead(503, { 'Retry-After': '1', 'Content-Type': 'application/json' })
    res.end(JSON.stringify({ error: 'Stream warming up' }))
    return
  }

  // 2. Zoom command (/zoom?level=2 or /zoom?roi=...)
  if (pathname === '/zoom') {
    const level = parsedUrl.searchParams.get('level')
    const roi = parsedUrl.searchParams.get('roi')
    if (roi) {
      currentRoi = roi
    } else if (level) {
      currentRoi = zoomLevelToRoi(level)
    }
    process.env.ZOOM_ROI = currentRoi
    console.log(`[Camera] Zoom updated: level=${level || 'custom'} -> ROI=${currentRoi}`)
    startStreamProcess()
    res.writeHead(200, { 'Content-Type': 'application/json' })
    res.end(JSON.stringify({ success: true, roi: currentRoi, level }))
    return
  }

  // 3. MJPEG live stream (/stream)
  if (pathname !== '/stream') {
    res.writeHead(404, { 'Content-Type': 'text/plain' })
    res.end('Not found')
    return
  }

  console.log(`[Camera] New stream client: ${req.socket.remoteAddress}`)

  res.writeHead(200, {
    'Content-Type': `multipart/x-mixed-replace; boundary=${MJPEG_BOUNDARY}`,
    'Connection': 'keep-alive',
    'Cache-Control': 'no-cache',
    'Pragma': 'no-cache',
  })

  streamClients.add(res)

  // Start stream if not already running
  if (!streamProcess) startStreamProcess()

  req.on('close', () => {
    streamClients.delete(res)
    console.log(`[Camera] Stream client disconnected (${streamClients.size} remaining)`)
    // Stop stream if no clients
    if (streamClients.size === 0 && streamProcess) {
      setTimeout(() => {
        if (streamClients.size === 0 && streamProcess) {
          streamProcess.kill()
          streamProcess = null
          console.log('[Camera] Stream stopped (no clients)')
        }
      }, 5000)
    }
  })
})

// ─── Photo Local Storage ───────────────────────────────────────────────────
const PHOTO_STORAGE_DIR = process.env.PHOTO_STORAGE_DIR || path.join(os.homedir(), 'photobooth-photos')
try {
  if (!fs.existsSync(PHOTO_STORAGE_DIR)) {
    fs.mkdirSync(PHOTO_STORAGE_DIR, { recursive: true })
  }
} catch (err) {
  console.warn('[Camera] Could not create PHOTO_STORAGE_DIR:', err.message)
}

// ─── Capture API (port 8081) ─────────────────────────────────────────────────
const captureApp = express()
captureApp.use(cors())
captureApp.use(express.json())

let captureInProgress = false

captureApp.get('/health', (_req, res) => {
  res.json({
    status: 'ok',
    camera: streamProcess ? 'streaming' : 'idle',
    clients: streamClients.size,
    config: { zoom: ZOOM_ROI, quality: JPEG_QUALITY, resolution: `${STILL_W}x${STILL_H}` },
    storageDir: PHOTO_STORAGE_DIR,
  })
})

// List stored sessions
captureApp.get('/photos', (_req, res) => {
  try {
    const sessions = fs.readdirSync(PHOTO_STORAGE_DIR, { withFileTypes: true })
      .filter(d => d.isDirectory())
      .map(d => d.name)
    res.json({ sessions })
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

// List photos in a session
captureApp.get('/photos/:sessionId', (req, res) => {
  try {
    const cleanId = String(req.params.sessionId).replace(/[^a-zA-Z0-9_-]/g, '_')
    const sessionDir = path.join(PHOTO_STORAGE_DIR, cleanId)
    if (!fs.existsSync(sessionDir)) {
      return res.status(404).json({ error: 'Session not found on Pi' })
    }
    const files = fs.readdirSync(sessionDir).filter(f => f.endsWith('.jpg') || f.endsWith('.jpeg'))
    res.json({ sessionId: cleanId, photos: files })
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

// Serve a specific photo from Pi storage
captureApp.get('/photos/:sessionId/:filename', (req, res) => {
  try {
    const cleanId = String(req.params.sessionId).replace(/[^a-zA-Z0-9_-]/g, '_')
    const cleanFile = path.basename(req.params.filename)
    const filePath = path.join(PHOTO_STORAGE_DIR, cleanId, cleanFile)
    if (!fs.existsSync(filePath)) {
      return res.status(404).json({ error: 'Photo not found' })
    }
    res.setHeader('Content-Type', 'image/jpeg')
    fs.createReadStream(filePath).pipe(res)
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

captureApp.post('/capture', async (req, res) => {
  if (captureInProgress) {
    return res.status(429).json({ error: 'Capture already in progress' })
  }
  captureInProgress = true

  const {
    roi       = currentRoi,
    quality   = JPEG_QUALITY,
    width     = STILL_W,
    height    = STILL_H,
    sessionId = null,
    shotIndex = null,
  } = req.body || {}

  let outputPath
  let isPersistent = false

  if (sessionId) {
    const cleanId = String(sessionId).replace(/[^a-zA-Z0-9_-]/g, '_')
    const sessionDir = path.join(PHOTO_STORAGE_DIR, cleanId)
    try {
      fs.mkdirSync(sessionDir, { recursive: true })
      const filename = shotIndex ? `shot-${shotIndex}.jpg` : `shot-${Date.now()}.jpg`
      outputPath = path.join(sessionDir, filename)
      isPersistent = true
    } catch {
      outputPath = path.join(TMP_DIR, `pb-capture-${Date.now()}.jpg`)
    }
  } else {
    outputPath = path.join(TMP_DIR, `pb-capture-${Date.now()}.jpg`)
  }

  const args = [
    '--width',      String(width),
    '--height',     String(height),
    '--roi',        roi,
    '--quality',    String(quality),
    '--sharpness',  String(CAMERA_SHARPNESS),
    '--contrast',   String(CAMERA_CONTRAST),
    '--saturation', String(CAMERA_SATURATION),
    '--ev',         String(CAMERA_EV),
    '--shutter',    '0',       // auto exposure
    '--awb',        String(CAMERA_AWB),    // auto white balance
    '--denoise',    String(CAMERA_DENOISE), // sharper output
    '--nopreview',
    '--timeout',    '800',     // 0.8s for fast capture & focus settle
    '--output',     outputPath,
  ]

  if (CAMERA_AF_MODE) {
    args.push('--autofocus-mode', CAMERA_AF_MODE, '--autofocus-range', 'normal')
  }

  console.log(`[Camera] Capturing still: ${width}x${height} roi=${roi} q=${quality} persistent=${isPersistent} -> ${outputPath}`)
  const start = Date.now()

  const proc = spawn(STILL_CMD, args, { stdio: ['ignore', 'pipe', 'pipe'] })

  let stderr = ''
  proc.stderr.on('data', d => { stderr += d.toString() })

  proc.on('exit', (code) => {
    captureInProgress = false
    const elapsed = Date.now() - start

    if (code !== 0 || !fs.existsSync(outputPath)) {
      console.error(`[Camera] Capture failed (code ${code}):`, stderr)
      return res.status(500).json({ error: 'Camera capture failed', details: stderr })
    }

    console.log(`[Camera] Captured in ${elapsed}ms → ${outputPath}`)
    res.setHeader('Content-Type', 'image/jpeg')
    res.setHeader('Cache-Control', 'no-cache')
    if (isPersistent) {
      res.setHeader('X-Saved-Path', outputPath)
    }

    const stream = fs.createReadStream(outputPath)
    stream.pipe(res)
    stream.on('end', () => {
      // Only delete if it's a temporary unlinked file, NEVER delete persistent session photos
      if (!isPersistent) {
        fs.unlink(outputPath, () => {})
      }
    })
    stream.on('error', () => {
      res.status(500).end()
      if (!isPersistent) {
        fs.unlink(outputPath, () => {})
      }
    })
  })
})

// Config update endpoint (change zoom/quality at runtime)
captureApp.post('/config', (req, res) => {
  const { roi, quality } = req.body || {}
  if (roi) process.env.ZOOM_ROI = roi
  if (quality) process.env.JPEG_QUALITY = String(quality)
  res.json({ success: true, roi: process.env.ZOOM_ROI, quality: process.env.JPEG_QUALITY })
})

const captureServer = http.createServer(captureApp)

// ─── Start Both Servers ───────────────────────────────────────────────────────
streamServer.listen(STREAM_PORT, '0.0.0.0', () => {
  console.log(`[Camera] MJPEG stream server → http://localhost:${STREAM_PORT}/stream`)
})

captureServer.listen(CAPTURE_PORT, '0.0.0.0', () => {
  console.log(`[Camera] Still capture API  → http://localhost:${CAPTURE_PORT}/capture`)
  console.log(`[Camera] Health check       → http://localhost:${CAPTURE_PORT}/health`)
  console.log('')
  console.log('[Camera] Config:')
  console.log(`  Zoom ROI:    ${ZOOM_ROI}`)
  console.log(`  JPEG quality: ${JPEG_QUALITY}`)
  console.log(`  Stream:      ${STREAM_W}×${STREAM_H} @ ${STREAM_FPS}fps`)
  console.log(`  Still:       ${STILL_W}×${STILL_H}`)
})

// ─── Graceful Shutdown ────────────────────────────────────────────────────────
process.on('SIGINT',  () => shutdown())
process.on('SIGTERM', () => shutdown())

function shutdown() {
  console.log('\n[Camera] Shutting down...')
  if (streamProcess) streamProcess.kill()
  streamServer.close()
  captureServer.close()
  process.exit(0)
}

#!/usr/bin/env node
/**
 * Standalone Zero-Dependency Raspberry Pi Photobooth Camera Server
 * Runs on port 8080 (MJPEG Stream) and port 8081 (Still Capture & Health)
 * Compatible with Raspberry Pi OS Bookworm (rpicam) & Bullseye (libcamera)
 */
'use strict'

const http = require('http')
const { spawn, execSync } = require('child_process')
const fs = require('fs')
const path = require('path')
const os = require('os')

const STREAM_PORT = parseInt(process.env.STREAM_PORT || '8080')
const CAPTURE_PORT = parseInt(process.env.CAPTURE_PORT || '8081')

const STREAM_FPS = parseInt(process.env.STREAM_FPS || '30')
const STREAM_W = parseInt(process.env.STREAM_W || '1280')
const STREAM_H = parseInt(process.env.STREAM_H || '720')
const STILL_W = parseInt(process.env.STILL_W || '2304')
const STILL_H = parseInt(process.env.STILL_H || '1296')

// Apple-tuned ISP profile
const CAMERA_QUALITY = process.env.CAMERA_QUALITY || '95'
const CAMERA_SHARPNESS = process.env.CAMERA_SHARPNESS || '1.45'
const CAMERA_CONTRAST = process.env.CAMERA_CONTRAST || '1.12'
const CAMERA_SATURATION = process.env.CAMERA_SATURATION || '1.18'
const CAMERA_DENOISE = process.env.CAMERA_DENOISE || 'cdn_off'
const CAMERA_AWB = process.env.CAMERA_AWB || 'auto'
const CAMERA_EV = process.env.CAMERA_EV || '0.2'
const CAMERA_AF_MODE = process.env.CAMERA_AF_MODE || 'continuous'

function detectBinary(primary, fallback) {
  try {
    const res = execSync(`which ${primary} 2>/dev/null || which ${fallback} 2>/dev/null`).toString().trim()
    return res.includes(fallback) ? fallback : primary
  } catch {
    return primary
  }
}

const VID_CMD = process.env.VID_CMD || detectBinary('rpicam-vid', 'libcamera-vid')
const STILL_CMD = process.env.STILL_CMD || detectBinary('rpicam-still', 'libcamera-still')

console.log('════════════════════════════════════════════════════════════════')
console.log('  🍓 PAPIT PHOTOBOOTH - Pi Camera Server (Apple Tuned)')
console.log(`  • Video binary:   ${VID_CMD}`)
console.log(`  • Still binary:   ${STILL_CMD}`)
console.log(`  • Resolution:     ${STREAM_W}x${STREAM_H} @ ${STREAM_FPS}fps (q=${CAMERA_QUALITY})`)
console.log(`  • Tuning:         sharpness=${CAMERA_SHARPNESS}, contrast=${CAMERA_CONTRAST}, sat=${CAMERA_SATURATION}`)
console.log(`  • Stream port:    ${STREAM_PORT}  (GET /stream)`)
console.log(`  • Capture port:   ${CAPTURE_PORT} (POST /capture, GET /health)`)
console.log('════════════════════════════════════════════════════════════════')

// ─── 1. MJPEG Stream Server (Port 8080) ──────────────────────────────────────
const streamClients = new Set()
let streamProcess = null
let mjpegBuffer = Buffer.alloc(0)
let latestFrame = null
let latestFrameTime = 0
const MJPEG_BOUNDARY = '--BoundaryString'

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

function startStreamProcess() {
  if (streamProcess) {
    streamProcess.kill()
    streamProcess = null
  }

  console.log(`[Camera] Starting live MJPEG stream with Apple ISP profile (${VID_CMD})...`)

  const args = [
    '--width',     String(STREAM_W),
    '--height',    String(STREAM_H),
    '--framerate', String(STREAM_FPS),
    '--codec',     'mjpeg',
    '--quality',   String(CAMERA_QUALITY),
    '--sharpness', String(CAMERA_SHARPNESS),
    '--contrast',  String(CAMERA_CONTRAST),
    '--saturation',String(CAMERA_SATURATION),
    '--denoise',   String(CAMERA_DENOISE),
    '--ev',        String(CAMERA_EV),
    '--awb',       String(CAMERA_AWB),
    '--inline',
    '--nopreview',
    '--timeout',   '0',
    '-o',          '-',
  ]

  if (CAMERA_AF_MODE) {
    args.push('--autofocus-mode', CAMERA_AF_MODE, '--autofocus-range', 'normal')
  }

  streamProcess = spawn(VID_CMD, args, { stdio: ['ignore', 'pipe', 'pipe'] })

  streamProcess.stdout.on('data', (chunk) => {
    mjpegBuffer = Buffer.concat([mjpegBuffer, chunk])

    let start, end
    while (
      (start = findJpegStart(mjpegBuffer)) !== -1 &&
      (end   = findJpegEnd(mjpegBuffer, start)) !== -1
    ) {
      const frame = mjpegBuffer.slice(start, end + 2)
      mjpegBuffer = mjpegBuffer.slice(end + 2)
      latestFrame = frame
      latestFrameTime = Date.now()

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

    if (mjpegBuffer.length > 5 * 1024 * 1024) {
      mjpegBuffer = Buffer.alloc(0)
    }
  })

  streamProcess.stderr.on('data', (d) => {
    const msg = d.toString()
    if (msg.toLowerCase().includes('error')) {
      console.error('[Stream error]', msg.trim())
    }
  })

  streamProcess.on('exit', (code) => {
    console.log(`[Camera] Stream process exited (code ${code})`)
    streamProcess = null
    if (streamClients.size > 0) {
      setTimeout(startStreamProcess, 1500)
    }
  })
}

const streamServer = http.createServer((req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS')

  if (req.method === 'OPTIONS') {
    res.writeHead(204)
    res.end()
    return
  }

  if (req.url !== '/stream' && req.url !== '/') {
    res.writeHead(404, { 'Content-Type': 'text/plain' })
    res.end('Not found')
    return
  }

  console.log(`[Camera] Client connected: ${req.socket.remoteAddress}`)

  res.writeHead(200, {
    'Content-Type': `multipart/x-mixed-replace; boundary=${MJPEG_BOUNDARY}`,
    'Connection': 'keep-alive',
    'Cache-Control': 'no-cache, no-store, must-revalidate',
    'Pragma': 'no-cache',
    'Access-Control-Allow-Origin': '*',
  })

  streamClients.add(res)
  if (!streamProcess) startStreamProcess()

  req.on('close', () => {
    streamClients.delete(res)
    console.log(`[Camera] Client disconnected (${streamClients.size} active)`)
    if (streamClients.size === 0 && streamProcess) {
      setTimeout(() => {
        if (streamClients.size === 0 && streamProcess) {
          streamProcess.kill()
          streamProcess = null
          console.log('[Camera] Stream idle, process paused.')
        }
      }, 5000)
    }
  })
})

streamServer.listen(STREAM_PORT, '0.0.0.0', () => {
  console.log(`[Camera] MJPEG Stream server ready on http://0.0.0.0:${STREAM_PORT}/stream`)
})

// ─── 2. Capture Server (Port 8081) ───────────────────────────────────────────
let captureLock = false

const captureServer = http.createServer((req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-Requested-With')
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS')

  if (req.method === 'OPTIONS') {
    res.writeHead(204)
    res.end()
    return
  }

  if (req.url === '/health') {
    res.writeHead(200, { 'Content-Type': 'application/json' })
    res.end(JSON.stringify({
      status: 'ok',
      camera: streamProcess ? 'streaming' : 'idle',
      clients: streamClients.size,
      binary: VID_CMD,
    }))
    return
  }

  if (req.url === '/capture' && (req.method === 'POST' || req.method === 'GET')) {
    if (latestFrame && Date.now() - latestFrameTime < 3000) {
      res.writeHead(200, {
        'Content-Type': 'image/jpeg',
        'Cache-Control': 'no-cache, no-store, must-revalidate',
        'Access-Control-Allow-Origin': '*',
      })
      res.end(latestFrame)
      console.log(`[Camera] Instant frame captured (${latestFrame.length} bytes)`)
      return
    }

    if (!streamProcess) {
      startStreamProcess()
      setTimeout(() => {
        if (latestFrame) {
          res.writeHead(200, {
            'Content-Type': 'image/jpeg',
            'Cache-Control': 'no-cache, no-store, must-revalidate',
            'Access-Control-Allow-Origin': '*',
          })
          res.end(latestFrame)
        } else {
          res.writeHead(503, { 'Content-Type': 'application/json' })
          res.end(JSON.stringify({ error: 'Camera stream starting, try again' }))
        }
      }, 500)
      return
    }

    res.writeHead(503, { 'Content-Type': 'application/json' })
    res.end(JSON.stringify({ error: 'Camera frame not available' }))
    return
  }

  res.writeHead(404, { 'Content-Type': 'text/plain' })
  res.end('Not found')
})

captureServer.listen(CAPTURE_PORT, '0.0.0.0', () => {
  console.log(`[Camera] Capture server ready on http://0.0.0.0:${CAPTURE_PORT}/capture`)
})

import { Router, Request, Response } from 'express'
import * as fs from 'fs'
import * as path from 'path'
import { getDataPath, getTicketManager, getDatabase, io } from '../index'
import { requireStaff, isStaff, isSafeId } from '../security'
import { stripLimitForPlan } from '../../src/constants/pricing'
import {
  getPrinterInfo, printSheets, discoverPrinters, probeHost,
  loadPrinterConfig, savePrinterConfig, type PrinterInfo,
} from '../printer'

export const printRouter = Router()

// ─── Print ledger: strips printed per ticket (survives restarts) ────────────
type Ledger = Record<string, { strips: number; sheets: number; jobs: number }>
const ledgerFile = () => path.join(getDataPath(), 'print-ledger.json')
function loadLedger(): Ledger {
  try { return JSON.parse(fs.readFileSync(ledgerFile(), 'utf-8')) } catch { return {} }
}
function saveLedger(l: Ledger) {
  fs.writeFileSync(ledgerFile(), JSON.stringify(l, null, 2), 'utf-8')
}

// ─── Printer state cache (status is polled by the iPad; don't hit the printer every time) ─
let cachedInfo: PrinterInfo | null = null
let cachedAt = 0
let lastError = ''
let discovering: Promise<PrinterInfo[]> | null = null

async function currentPrinter(force = false): Promise<PrinterInfo | null> {
  const cfg = loadPrinterConfig(getDataPath())
  if (!cfg) return null
  if (!force && cachedInfo?.uri === cfg.uri && Date.now() - cachedAt < 5000) return cachedInfo
  try {
    cachedInfo = await getPrinterInfo(cfg.uri)
    cachedAt = Date.now()
    lastError = ''
  } catch (err: any) {
    // The printer's DHCP address may have changed: look for the same model elsewhere on the LAN
    lastError = err?.message || 'unreachable'
    cachedInfo = null
    const moved = await rediscover(cfg.makeAndModel)
    if (moved) cachedInfo = moved
  }
  return cachedInfo
}

async function rediscover(makeAndModel?: string): Promise<PrinterInfo | null> {
  discovering ||= discoverPrinters().finally(() => { discovering = null })
  const list = await discovering
  const match = list.find(p => !makeAndModel || p.makeAndModel === makeAndModel) || (list.length === 1 ? list[0] : null)
  if (match) {
    savePrinterConfig(getDataPath(), { uri: match.uri, makeAndModel: match.makeAndModel, savedAt: new Date().toISOString() })
    console.log(`[Print] Using printer ${match.makeAndModel || ''} at ${match.uri}`)
    cachedAt = Date.now()
  }
  return match
}

/** Called at server start: if no printer is saved yet and exactly one is on the network, adopt it. */
export async function autoSetupPrinter(): Promise<void> {
  if (process.env.PRINTER_AUTOSETUP === '0') return // tests: never adopt a real printer
  if (loadPrinterConfig(getDataPath())) return
  const list = await discoverPrinters().catch(() => [])
  if (list.length === 1) {
    savePrinterConfig(getDataPath(), { uri: list[0].uri, makeAndModel: list[0].makeAndModel, savedAt: new Date().toISOString() })
    console.log(`[Print] Auto-configured network printer: ${list[0].makeAndModel || list[0].uri}`)
  } else if (list.length > 1) {
    console.log(`[Print] ${list.length} printers found — pick one in the ticket desk (Admin → Printer)`)
  }
}

// ─── GET /api/print/status ───────────────────────────────────────────────────
printRouter.get('/status', async (_req: Request, res: Response) => {
  const cfg = loadPrinterConfig(getDataPath())
  const info = cfg ? await currentPrinter() : null
  res.json({
    configured: Boolean(cfg),
    reachable: Boolean(info),
    mode: info ? 'network' : 'airprint',
    printer: info ? {
      model: info.makeAndModel, name: info.name, state: info.state, stateReasons: info.stateReasons,
      ink: info.ink, supportsA5: info.media.includes('iso_a5_148x210mm'),
      formats: info.formats.filter(f => f === 'image/jpeg' || f === 'application/pdf'),
    } : null,
    error: cfg && !info ? lastError : undefined,
  })
})

// ─── POST /api/print/discover (staff) ───────────────────────────────────────
printRouter.post('/discover', requireStaff, async (_req: Request, res: Response) => {
  discovering ||= discoverPrinters().finally(() => { discovering = null })
  const list = await discovering
  res.json({ printers: list.map(p => ({ uri: p.uri, model: p.makeAndModel, name: p.name, state: p.state })) })
})

// ─── POST /api/print/config (staff) { host } | { uri } | { clear: true } ─────
printRouter.post('/config', requireStaff, async (req: Request, res: Response) => {
  const { host, uri, clear } = req.body || {}
  if (clear) {
    savePrinterConfig(getDataPath(), null)
    cachedInfo = null
    return res.json({ success: true, configured: false })
  }
  let info: PrinterInfo | null = null
  if (typeof uri === 'string' && /^ipp:\/\/[a-zA-Z0-9.-]+(:\d+)?\/[\w/.-]*$/.test(uri)) {
    info = await getPrinterInfo(uri).catch(() => null)
  } else if (typeof host === 'string' && /^[a-zA-Z0-9.-]{1,253}$/.test(host)) {
    info = await probeHost(host, 2500)
  } else {
    return res.status(400).json({ error: 'Provide a printer IP/hostname or ipp:// URI' })
  }
  if (!info) return res.status(404).json({ error: 'No IPP printer answered at that address' })
  savePrinterConfig(getDataPath(), { uri: info.uri, makeAndModel: info.makeAndModel, savedAt: new Date().toISOString() })
  cachedInfo = info
  cachedAt = Date.now()
  res.json({ success: true, printer: { uri: info.uri, model: info.makeAndModel, formats: info.formats } })
})

// ─── POST /api/print/job ─────────────────────────────────────────────────────
// Body: { ticketId?, sessionId?, stripCount, sheets: [jpeg data URLs] }
// The server, not the guest, decides whether this ticket still has strips left.
printRouter.post('/job', async (req: Request, res: Response) => {
  const { ticketId, sessionId, stripCount, sheets } = req.body || {}

  if (!Array.isArray(sheets) || sheets.length === 0 || sheets.length > 12) {
    return res.status(400).json({ error: 'sheets must be 1–12 JPEG data URLs' })
  }
  const strips = Number(stripCount)
  if (!Number.isInteger(strips) || strips < 1 || strips > 24) {
    return res.status(400).json({ error: 'stripCount must be 1–24' })
  }
  if (ticketId !== undefined && ticketId !== null && !isSafeId(ticketId)) {
    return res.status(400).json({ error: 'Invalid ticket ID' })
  }
  if (sessionId !== undefined && sessionId !== null && !isSafeId(sessionId)) {
    return res.status(400).json({ error: 'Invalid session ID' })
  }
  const jpegs: Buffer[] = []
  for (const s of sheets) {
    const m = typeof s === 'string' ? s.match(/^data:image\/jpeg;base64,([A-Za-z0-9+/=]+)$/) : null
    if (!m) return res.status(400).json({ error: 'Each sheet must be a JPEG data URL' })
    const buf = Buffer.from(m[1], 'base64')
    if (buf.length < 1000 || buf.length > 15 * 1024 * 1024) return res.status(400).json({ error: 'Sheet image size out of range' })
    jpegs.push(buf)
  }

  // ─── Quota ──
  const manager = getTicketManager()
  const ticket = ticketId ? (manager?.getTicketById(ticketId) || manager?.getTicketByCode(ticketId)) : undefined
  const staff = isStaff(req)
  if (!ticket && !staff) {
    return res.status(403).json({ error: 'Printing without a ticket needs staff approval', code: 'STAFF_REQUIRED' })
  }
  const ledger = loadLedger()
  const key = ticket?.id || 'staff-walkin'
  const used = ledger[key]?.strips || 0
  if (ticket) {
    if (ticket.paymentStatus !== 'PAID' && !staff) {
      return res.status(402).json({ error: `Ticket #${ticket.code} is not paid yet`, code: 'UNPAID' })
    }
    const allowance = stripLimitForPlan(ticket.planType)
    if (used + strips > allowance && !staff) {
      return res.status(403).json({
        error: `Ticket #${ticket.code} covers ${allowance} strips and ${used} were already printed.`,
        code: used > 0 ? 'REPRINT_NEEDS_STAFF' : 'OVER_PLAN',
        allowance, used,
      })
    }
  }

  const info = await currentPrinter(true)
  if (!info) {
    return res.status(503).json({ error: 'Network printer not reachable', code: 'PRINTER_OFFLINE', detail: lastError })
  }
  if (info.state === 'stopped') {
    return res.status(503).json({ error: `Printer is stopped: ${info.stateReasons.join(', ') || 'check paper/ink'}`, code: 'PRINTER_STOPPED' })
  }

  try {
    const { jobs, format } = await printSheets(info, jpegs, `Photobooth ${ticket ? '#' + ticket.code : 'staff'}`)
    ledger[key] = { strips: used + strips, sheets: (ledger[key]?.sheets || 0) + jpegs.length, jobs: (ledger[key]?.jobs || 0) + 1 }
    saveLedger(ledger)
    if (ticket && manager) {
      const updated = manager.updateTicketStatus(ticket.id, ticket.status === 'COMPLETED' ? 'COMPLETED' : 'PRINTING', { sessionId: sessionId || undefined })
      if (updated) io?.emit('ticket:updated', updated)
    }
    getDatabase()?.logAudit('PRINT_JOB', ticket?.code, sessionId, { strips, sheets: jpegs.length, jobs, format, byStaff: staff })
    res.json({ success: true, jobs, sheets: jpegs.length, format, printedStrips: used + strips })
  } catch (err: any) {
    console.error('[Print] Job failed:', err?.message)
    res.status(502).json({ error: err?.message || 'Printer rejected the job', code: 'PRINT_FAILED' })
  }
})

// ─── POST /api/print/test (staff) — prints one A5 calibration page ──────────
printRouter.post('/test', requireStaff, async (_req: Request, res: Response) => {
  const info = await currentPrinter(true)
  if (!info) return res.status(503).json({ error: 'Network printer not reachable', detail: lastError })
  const W = 1748, H = 2480 // A5 @ 300 dpi
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}">
    <rect width="100%" height="100%" fill="#fff"/>
    <rect x="30" y="30" width="${W - 60}" height="${H - 60}" fill="none" stroke="#000" stroke-width="6"/>
    <line x1="${W / 2}" y1="30" x2="${W / 2}" y2="${H - 30}" stroke="#999" stroke-width="3" stroke-dasharray="20,20"/>
    ${['#00AEEF', '#EC008C', '#FFF200', '#000000', '#C71B4D'].map((c, i) => `<rect x="${140 + i * 300}" y="1900" width="260" height="260" fill="${c}"/>`).join('')}
    <text x="${W / 2}" y="600" font-size="110" text-anchor="middle" font-family="Arial" font-weight="bold">PHOTOBOOTH TEST</text>
    <text x="${W / 2}" y="760" font-size="60" text-anchor="middle" font-family="Arial">A5 · 148 × 210 mm · cut on dashed line</text>
    <text x="${W / 2}" y="880" font-size="48" text-anchor="middle" font-family="Arial">${(info.makeAndModel || 'printer').replace(/[<&>]/g, '')}</text>
    <text x="${W / 2}" y="980" font-size="40" text-anchor="middle" font-family="Arial">${new Date().toLocaleString('en-IN')}</text>
  </svg>`
  try {
    const sharp = (await import('sharp')).default
    const jpeg = await sharp(Buffer.from(svg)).jpeg({ quality: 92 }).toBuffer()
    const r = await printSheets(info, [jpeg], 'Photobooth test page')
    res.json({ success: true, ...r })
  } catch (err: any) {
    res.status(502).json({ error: err?.message || 'Test print failed' })
  }
})

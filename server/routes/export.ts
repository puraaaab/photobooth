import { Router, Request, Response } from 'express'
import * as path from 'path'
import * as fs from 'fs'
import { getDataPath, getVaultManager, getTicketManager } from '../index'
import { isSafeId, isSafeFilename, cleanTicketCode, safeJoin } from '../security'

export const exportRouter = Router()

const EXPORT_EXTENSIONS = ['.jpg', '.jpeg', '.png', '.pdf', '.webp']
const MAX_EXPORT_BYTES = 20 * 1024 * 1024

// GET /api/export/:sessionId/list
exportRouter.get('/:sessionId/list', (req: Request, res: Response) => {
  const sessionId = req.params.sessionId
  if (!isSafeId(sessionId)) {
    return res.status(400).json({ error: 'Invalid session ID' })
  }
  const exportsDir = safeJoin(getDataPath(), 'sessions', sessionId, 'exports')

  if (!fs.existsSync(exportsDir)) {
    return res.json({ exports: [] })
  }

  const files = fs.readdirSync(exportsDir)
    .filter(f => EXPORT_EXTENSIONS.includes(path.extname(f).toLowerCase()))
    .map(f => {
      const stat = fs.statSync(path.join(exportsDir, f))
      return {
        filename: f,
        url: `/sessions/${sessionId}/exports/${f}`,
        size: stat.size,
        createdAt: stat.mtime.toISOString(),
      }
    })

  res.json({ exports: files })
})

// POST /api/export/save-strip
// Saves an exported strip (image or PDF dataUrl) to the session exports folder and the ticket vault.
// Previously `sessionId`/`filename` were unvalidated (arbitrary file write via ../) and `dataUrl`
// could be a local file path that got copied into a web-served folder (arbitrary file read).
exportRouter.post('/save-strip', (req: Request, res: Response) => {
  const { ticketCode, sessionId, filename, dataUrl } = req.body || {}

  if (!isSafeFilename(filename) || !EXPORT_EXTENSIONS.includes(path.extname(filename).toLowerCase())) {
    return res.status(400).json({ error: 'filename must be a plain image/PDF file name' })
  }
  if (sessionId !== undefined && !isSafeId(sessionId)) {
    return res.status(400).json({ error: 'Invalid session ID' })
  }
  const match = typeof dataUrl === 'string' ? dataUrl.match(/^data:(image\/(?:jpeg|png|webp)|application\/pdf);base64,([A-Za-z0-9+/=\s]+)$/) : null
  if (!match) {
    return res.status(400).json({ error: 'dataUrl must be a base64 image or PDF data URL' })
  }
  const buffer = Buffer.from(match[2], 'base64')
  if (buffer.length === 0 || buffer.length > MAX_EXPORT_BYTES) {
    return res.status(413).json({ error: 'Export is empty or too large' })
  }

  let code = ticketCode !== undefined ? cleanTicketCode(ticketCode) : null
  if (ticketCode !== undefined && ticketCode !== null && ticketCode !== '' && !code) {
    return res.status(400).json({ error: 'Invalid ticket code' })
  }
  if (!code && sessionId) {
    const matchingTicket = getTicketManager()?.listTickets().find(t => t.sessionId === sessionId)
    if (matchingTicket) {
      code = matchingTicket.code
    }
  }

  try {
    if (sessionId) {
      const exportsDir = safeJoin(getDataPath(), 'sessions', sessionId, 'exports')
      fs.mkdirSync(exportsDir, { recursive: true })
      fs.writeFileSync(safeJoin(exportsDir, filename), buffer)
    }

    let vaultPath: string | undefined
    if (code) {
      const vault = getVaultManager()
      if (vault) {
        vaultPath = vault.saveStrip(code, filename, buffer)
      }
    }

    res.json({ success: true, ticketCode: code, vaultPath, filename })
  } catch (err: any) {
    console.error('[Export] save-strip failed:', err?.message)
    res.status(err?.code === 'ENOSPC' ? 507 : 500).json({ error: 'Failed to save export' })
  }
})

import { Router, Request, Response } from 'express'
import * as path from 'path'
import * as fs from 'fs'
import { getDataPath, getVaultManager, getTicketManager } from '../index'

export const exportRouter = Router()

// GET /api/export/:sessionId/list
exportRouter.get('/:sessionId/list', (req: Request, res: Response) => {
  const sessionId = req.params.sessionId as string
  const exportsDir = path.join(getDataPath(), 'sessions', sessionId, 'exports')
  
  if (!fs.existsSync(exportsDir)) {
    return res.json({ exports: [] })
  }
  
  const files = fs.readdirSync(exportsDir)
    .filter(f => ['.jpg', '.jpeg', '.png', '.pdf', '.webp'].includes(
      path.extname(f).toLowerCase()
    ))
    .map(f => ({
      filename: f,
      url: `/sessions/${sessionId}/exports/${f}`,
      size: fs.statSync(path.join(exportsDir, f)).size,
      createdAt: fs.statSync(path.join(exportsDir, f)).mtime.toISOString(),
    }))
  
  res.json({ exports: files })
})

// POST /api/export/save-strip
// Saves an exported strip (image or PDF dataUrl) directly to the ticket vault folder
exportRouter.post('/save-strip', (req: Request, res: Response) => {
  const { ticketCode, sessionId, filename, dataUrl } = req.body || {}

  let code = ticketCode ? String(ticketCode).replace(/^#/, '').trim() : undefined
  if (!code && sessionId) {
    const matchingTicket = getTicketManager()?.listTickets().find(t => t.sessionId === sessionId)
    if (matchingTicket) {
      code = matchingTicket.code
    }
  }

  if (!filename || !dataUrl) {
    return res.status(400).json({ error: 'filename and dataUrl are required' })
  }

  // Also save in session exports directory
  if (sessionId) {
    const exportsDir = path.join(getDataPath(), 'sessions', sessionId, 'exports')
    fs.mkdirSync(exportsDir, { recursive: true })
    const base64Data = dataUrl.replace(/^data:[^;]+;base64,/, '')
    fs.writeFileSync(path.join(exportsDir, filename), Buffer.from(base64Data, 'base64'))
  }

  let vaultPath: string | undefined
  if (code) {
    const vault = getVaultManager()
    if (vault) {
      vaultPath = vault.saveStrip(code, filename, dataUrl)
    }
  }

  res.json({
    success: true,
    ticketCode: code,
    vaultPath,
    filename,
  })
})

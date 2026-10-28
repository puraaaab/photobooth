import { Router, Request, Response } from 'express'
import * as path from 'path'
import * as fs from 'fs'
import { getDataPath } from '../index'

export const downloadRouter = Router()

// GET /api/download/:sessionId/strip
downloadRouter.get('/:sessionId/strip', (req: Request, res: Response) => {
  const sessionId = req.params.sessionId as string
  if (!sessionId || !/^[a-zA-Z0-9_-]+$/.test(sessionId)) {
    return res.status(400).send('Invalid session ID')
  }

  const sessionDir = path.join(getDataPath(), 'sessions', sessionId)
  const exportsDir = path.join(sessionDir, 'exports')

  if (!fs.existsSync(exportsDir)) {
    return res.status(404).send('Session export not ready')
  }

  const files = fs.readdirSync(exportsDir)
    .filter(f => ['.jpg', '.jpeg', '.png', '.webp'].includes(path.extname(f).toLowerCase()))
    .sort((a, b) => fs.statSync(path.join(exportsDir, b)).mtimeMs - fs.statSync(path.join(exportsDir, a)).mtimeMs)

  if (files.length === 0) {
    return res.status(404).send('No exported image found for this session')
  }

  const latestExport = path.join(exportsDir, files[0])
  res.setHeader('Content-Disposition', `attachment; filename="Photobooth_${sessionId}.jpg"`)
  res.setHeader('Content-Type', 'image/jpeg')
  res.sendFile(latestExport)
})

// GET /api/download/:sessionId/view
downloadRouter.get('/:sessionId/view', (req: Request, res: Response) => {
  const sessionId = req.params.sessionId as string
  if (!sessionId || !/^[a-zA-Z0-9_-]+$/.test(sessionId)) {
    return res.status(400).send('Invalid session ID')
  }

  const sessionDir = path.join(getDataPath(), 'sessions', sessionId)
  const exportsDir = path.join(sessionDir, 'exports')

  if (!fs.existsSync(exportsDir)) {
    return res.status(404).send('Session export not ready')
  }

  const files = fs.readdirSync(exportsDir)
    .filter(f => ['.jpg', '.jpeg', '.png', '.webp'].includes(path.extname(f).toLowerCase()))
    .sort((a, b) => fs.statSync(path.join(exportsDir, b)).mtimeMs - fs.statSync(path.join(exportsDir, a)).mtimeMs)

  if (files.length === 0) {
    return res.status(404).send('No exported image found')
  }

  const latestExport = path.join(exportsDir, files[0])
  res.setHeader('Content-Type', 'image/jpeg')
  res.sendFile(latestExport)
})

import { Router, Request, Response } from 'express'
import * as path from 'path'
import * as fs from 'fs'
import { getDataPath } from '../index'

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
      url: `http://localhost:3847/sessions/${sessionId}/exports/${f}`,
      size: fs.statSync(path.join(exportsDir, f)).size,
      createdAt: fs.statSync(path.join(exportsDir, f)).mtime.toISOString(),
    }))
  
  res.json({ exports: files })
})

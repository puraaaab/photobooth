import * as fs from 'fs'
import * as path from 'path'

export interface SessionSummary {
  id: string
  createdAt: string
  status: string
  photoCount: number
  sessionsDir: string
}

export class FileSystemManager {
  constructor(private sessionsDir: string) {
    fs.mkdirSync(sessionsDir, { recursive: true })
  }

  listSessions(): SessionSummary[] {
    if (!fs.existsSync(this.sessionsDir)) return []
    
    const entries = fs.readdirSync(this.sessionsDir, { withFileTypes: true })
    const sessions: SessionSummary[] = []
    
    for (const entry of entries) {
      if (!entry.isDirectory()) continue
      const sessionJson = path.join(this.sessionsDir, entry.name, 'session.json')
      if (!fs.existsSync(sessionJson)) continue
      
      try {
        const data = JSON.parse(fs.readFileSync(sessionJson, 'utf-8'))
        sessions.push({
          id: data.id,
          createdAt: data.createdAt,
          status: data.status,
          photoCount: data.photos?.length ?? 0,
          sessionsDir: path.join(this.sessionsDir, entry.name),
        })
      } catch {
        // Corrupt session, skip
      }
    }
    
    return sessions.sort((a, b) => 
      new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
    )
  }

  getSessionPath(sessionId: string): string {
    return path.join(this.sessionsDir, sessionId)
  }

  ensureSessionDirs(sessionId: string): void {
    const base = this.getSessionPath(sessionId)
    for (const dir of ['originals', 'thumbnails', 'previews', 'exports']) {
      fs.mkdirSync(path.join(base, dir), { recursive: true })
    }
  }
}

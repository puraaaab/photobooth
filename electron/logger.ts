import * as fs from 'fs'
import * as path from 'path'

export class FileLogger {
  private logDir: string
  private currentLogDate: string = ''
  private currentLogStream: fs.WriteStream | null = null

  constructor(baseDir: string) {
    this.logDir = path.join(baseDir, 'logs')
    fs.mkdirSync(this.logDir, { recursive: true })
    this.rotate()
    this.pruneOldLogs(7)
  }

  private getDateString(): string {
    return new Date().toISOString().slice(0, 10)
  }

  private rotate(): void {
    const today = this.getDateString()
    if (this.currentLogDate !== today || !this.currentLogStream) {
      if (this.currentLogStream) {
        this.currentLogStream.end()
      }
      this.currentLogDate = today
      const logFile = path.join(this.logDir, `app-${today}.log`)
      this.currentLogStream = fs.createWriteStream(logFile, { flags: 'a' })
    }
  }

  public log(level: 'INFO' | 'WARN' | 'ERROR' | 'SECURITY', message: string, details?: unknown): void {
    try {
      this.rotate()
      const timestamp = new Date().toISOString()
      const formattedDetails = details ? ` | ${typeof details === 'object' ? JSON.stringify(details) : details}` : ''
      const line = `[${timestamp}] [${level}] ${message}${formattedDetails}\n`
      this.currentLogStream?.write(line)
      if (level === 'ERROR' || level === 'SECURITY') {
        console.error(line.trim())
      } else {
        console.log(line.trim())
      }
    } catch (err) {
      console.error('[FileLogger] Failed to write log:', err)
    }
  }

  public info(message: string, details?: unknown): void {
    this.log('INFO', message, details)
  }

  public warn(message: string, details?: unknown): void {
    this.log('WARN', message, details)
  }

  public error(message: string, details?: unknown): void {
    this.log('ERROR', message, details)
  }

  public security(message: string, details?: unknown): void {
    this.log('SECURITY', message, details)
  }

  public pruneOldLogs(retentionDays: number = 7): void {
    try {
      if (!fs.existsSync(this.logDir)) return
      const files = fs.readdirSync(this.logDir)
      const now = Date.now()
      const maxAgeMs = retentionDays * 24 * 60 * 60 * 1000

      for (const file of files) {
        if (!file.startsWith('app-') || !file.endsWith('.log')) continue
        const filePath = path.join(this.logDir, file)
        const stats = fs.statSync(filePath)
        if (now - stats.mtimeMs > maxAgeMs) {
          fs.unlinkSync(filePath)
          console.log(`[FileLogger] Pruned expired log file: ${file}`)
        }
      }
    } catch (err) {
      console.error('[FileLogger] Failed to prune logs:', err)
    }
  }

  public getLogDir(): string {
    return this.logDir
  }
}

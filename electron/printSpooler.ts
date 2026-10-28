import * as fs from 'fs'
import * as path from 'path'
import { v4 as uuidv4 } from 'uuid'

export interface PrintJob {
  id: string
  sessionId: string
  dataUrl: string
  printerName?: string
  copies: number
  paperSize?: string
  attempts: number
  maxAttempts: number
  status: 'queued' | 'printing' | 'completed' | 'failed'
  createdAt: string
  lastAttemptAt?: string
  error?: string
}

export class PrintSpooler {
  private queueFilePath: string
  private queue: PrintJob[] = []
  private isProcessing: boolean = false
  private printExecutor: ((job: PrintJob) => Promise<boolean>) | null = null

  constructor(baseDir: string) {
    this.queueFilePath = path.join(baseDir, 'print-queue.json')
    this.loadQueue()
  }

  private loadQueue(): void {
    try {
      if (fs.existsSync(this.queueFilePath)) {
        const raw = fs.readFileSync(this.queueFilePath, 'utf-8')
        this.queue = JSON.parse(raw)
        // Reset any jobs stuck in 'printing' back to 'queued' so they resume
        let recovered = 0
        for (const job of this.queue) {
          if (job.status === 'printing') {
            job.status = 'queued'
            recovered++
          }
        }
        if (recovered > 0) {
          this.saveQueue()
          console.log(`[PrintSpooler] Recovered ${recovered} unfinished print job(s) from previous run`)
        }
      } else {
        this.queue = []
      }
    } catch (err) {
      console.error('[PrintSpooler] Failed to load print queue from disk:', err)
      this.queue = []
    }
  }

  private saveQueue(): void {
    try {
      fs.mkdirSync(path.dirname(this.queueFilePath), { recursive: true })
      fs.writeFileSync(this.queueFilePath, JSON.stringify(this.queue, null, 2), 'utf-8')
    } catch (err) {
      console.error('[PrintSpooler] Failed to save print queue to disk:', err)
    }
  }

  public setExecutor(executor: (job: PrintJob) => Promise<boolean>): void {
    this.printExecutor = executor
    this.processNext()
  }

  public addJob(jobData: {
    sessionId: string
    dataUrl: string
    printerName?: string
    copies: number
    paperSize?: string
    maxAttempts?: number
  }): PrintJob {
    const job: PrintJob = {
      id: `print-${Date.now()}-${uuidv4().slice(0, 8)}`,
      sessionId: jobData.sessionId,
      dataUrl: jobData.dataUrl,
      printerName: jobData.printerName,
      copies: Math.max(1, jobData.copies || 1),
      paperSize: jobData.paperSize,
      attempts: 0,
      maxAttempts: jobData.maxAttempts || 3,
      status: 'queued',
      createdAt: new Date().toISOString(),
    }

    this.queue.push(job)
    this.saveQueue()
    console.log(`[PrintSpooler] Queued print job ${job.id} for session ${job.sessionId}`)

    this.processNext()
    return job
  }

  public async processNext(): Promise<void> {
    if (this.isProcessing || !this.printExecutor) return

    const nextJob = this.queue.find((j) => j.status === 'queued')
    if (!nextJob) return

    this.isProcessing = true
    nextJob.status = 'printing'
    nextJob.attempts++
    nextJob.lastAttemptAt = new Date().toISOString()
    this.saveQueue()

    try {
      console.log(`[PrintSpooler] Executing print job ${nextJob.id} (Attempt ${nextJob.attempts}/${nextJob.maxAttempts})`)
      const success = await this.printExecutor(nextJob)
      if (success) {
        nextJob.status = 'completed'
        console.log(`[PrintSpooler] Print job ${nextJob.id} completed successfully`)
      } else {
        throw new Error('Printer returned failure status')
      }
    } catch (err) {
      console.error(`[PrintSpooler] Print job ${nextJob.id} failed:`, err)
      nextJob.error = err instanceof Error ? err.message : String(err)
      if (nextJob.attempts >= nextJob.maxAttempts) {
        nextJob.status = 'failed'
      } else {
        nextJob.status = 'queued' // Will retry
      }
    } finally {
      this.saveQueue()
      this.isProcessing = false
      // Clean up old completed jobs after 5 minutes or keep up to last 20
      this.pruneOldCompletedJobs()
      // Process next if any
      setTimeout(() => this.processNext(), 500)
    }
  }

  private pruneOldCompletedJobs(): void {
    const completed = this.queue.filter((j) => j.status === 'completed')
    if (completed.length > 20) {
      const toRemove = completed.slice(0, completed.length - 20)
      const idsToRemove = new Set(toRemove.map((j) => j.id))
      this.queue = this.queue.filter((j) => !idsToRemove.has(j.id))
      this.saveQueue()
    }
  }

  public getQueue(): PrintJob[] {
    return [...this.queue]
  }

  public getPendingCount(): number {
    return this.queue.filter((j) => j.status === 'queued' || j.status === 'printing').length
  }
}

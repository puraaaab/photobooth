import { Router, Request, Response } from 'express'
import * as path from 'path'
import * as fs from 'fs'
import nodemailer from 'nodemailer'
import { getDataPath } from '../index'
import { isSafeId, requireStaff } from '../security'

export const emailRouter = Router()

interface EmailJob {
  id: string
  sessionId: string
  toEmail: string
  subject: string
  bodyText: string
  attachmentPath: string
  smtpConfig: {
    host: string
    port: number
    secure: boolean
    user: string
    pass: string
    from: string
  }
  attempts: number
  status: 'queued' | 'sent' | 'failed'
  createdAt: string
  error?: string
}

const EMAIL_QUEUE_FILE = () => path.join(getDataPath(), 'email-queue.json')

function loadQueue(): EmailJob[] {
  try {
    const file = EMAIL_QUEUE_FILE()
    if (fs.existsSync(file)) {
      return JSON.parse(fs.readFileSync(file, 'utf-8'))
    }
  } catch (err) {
    console.error('[Email] Failed to read email queue:', err)
  }
  return []
}

function saveQueue(queue: EmailJob[]) {
  try {
    const file = EMAIL_QUEUE_FILE()
    fs.mkdirSync(path.dirname(file), { recursive: true })
    fs.writeFileSync(file, JSON.stringify(queue, null, 2), 'utf-8')
  } catch (err) {
    console.error('[Email] Failed to save email queue:', err)
  }
}

async function sendEmailJob(job: EmailJob): Promise<boolean> {
  const { host, port, secure, user, pass, from } = job.smtpConfig
  if (!host || !user) {
    throw new Error('Incomplete SMTP configuration')
  }

  const transporter = nodemailer.createTransport({
    host,
    port,
    secure,
    auth: { user, pass },
    connectionTimeout: 8000,
    socketTimeout: 8000,
  })

  await transporter.sendMail({
    from: from || user,
    to: job.toEmail,
    subject: job.subject || 'Your Photobooth Strip!',
    text: job.bodyText || 'Here is your photo strip from the event. Enjoy!',
    attachments: [
      {
        filename: `Photobooth_${job.sessionId}.jpg`,
        path: job.attachmentPath,
      },
    ],
  })

  return true
}

// Background queue processor
export async function processEmailQueue() {
  const queue = loadQueue()
  let modified = false

  for (const job of queue) {
    if (job.status === 'queued') {
      job.attempts++
      try {
        await sendEmailJob(job)
        job.status = 'sent'
        modified = true
      } catch (err) {
        job.error = err instanceof Error ? err.message : String(err)
        if (job.attempts >= 3) {
          job.status = 'failed'
        }
        modified = true
      }
    }
  }

  if (modified) {
    saveQueue(queue)
  }
}

// POST /api/email/send
emailRouter.post('/send', async (req: Request, res: Response) => {
  const { sessionId, toEmail, subject, bodyText, smtpConfig } = req.body

  if (!isSafeId(sessionId) || typeof toEmail !== 'string' || !/^[^\s@<>,;]{1,64}@[^\s@<>,;]{1,190}\.[a-z]{2,}$/i.test(toEmail.trim())) {
    return res.status(400).json({ error: 'Valid sessionId and toEmail required' })
  }

  // Find latest export
  const exportsDir = path.join(getDataPath(), 'sessions', sessionId, 'exports')
  if (!fs.existsSync(exportsDir)) {
    return res.status(404).json({ error: 'No export found for session' })
  }

  const files = fs.readdirSync(exportsDir)
    .filter(f => ['.jpg', '.jpeg', '.png'].includes(path.extname(f).toLowerCase()))
    .sort((a, b) => fs.statSync(path.join(exportsDir, b)).mtimeMs - fs.statSync(path.join(exportsDir, a)).mtimeMs)

  if (files.length === 0) {
    return res.status(404).json({ error: 'No exported image file available' })
  }

  const attachmentPath = path.join(exportsDir, files[0])

  const job: EmailJob = {
    id: `email-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    sessionId,
    toEmail,
    subject: subject || 'Your Photobooth Strip!',
    bodyText: bodyText || 'Thank you for stopping by the photobooth! Attached is your digital photo strip.',
    attachmentPath,
    smtpConfig: smtpConfig || {},
    attempts: 0,
    status: 'queued',
    createdAt: new Date().toISOString(),
  }

  // Try immediate send
  try {
    if (smtpConfig && smtpConfig.host) {
      await sendEmailJob(job)
      job.status = 'sent'
      return res.json({ success: true, message: 'Email sent successfully!' })
    } else {
      // Spool for offline or pending config
      const queue = loadQueue()
      queue.push(job)
      saveQueue(queue)
      return res.json({ success: true, queued: true, message: 'Email queued for delivery.' })
    }
  } catch (err) {
    console.warn('[Email] Immediate send failed, saving to offline spool:', err)
    job.error = err instanceof Error ? err.message : String(err)
    const queue = loadQueue()
    queue.push(job)
    saveQueue(queue)
    return res.json({ success: true, queued: true, message: 'Saved to queue; will send when connected.' })
  }
})

// GET /api/email/queue
emailRouter.get('/queue', requireStaff, (_req: Request, res: Response) => {
  const queue = loadQueue()
  res.json({ queue: queue.map(({ smtpConfig: _s, ...rest }) => rest) })
})

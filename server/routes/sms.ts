import { Router, Request, Response } from 'express'
import * as path from 'path'
import * as fs from 'fs'
import { getDataPath } from '../index'
import { isSafeId, requireStaff } from '../security'

export const smsRouter = Router()

interface SmsJob {
  id: string
  sessionId: string
  toPhone: string
  message: string
  mediaUrl?: string
  twilioConfig: {
    accountSid: string
    authToken: string
    fromNumber: string
  }
  attempts: number
  status: 'queued' | 'sent' | 'failed'
  createdAt: string
  error?: string
}

const SMS_QUEUE_FILE = () => path.join(getDataPath(), 'sms-queue.json')

function loadQueue(): SmsJob[] {
  try {
    const file = SMS_QUEUE_FILE()
    if (fs.existsSync(file)) {
      return JSON.parse(fs.readFileSync(file, 'utf-8'))
    }
  } catch (err) {
    console.error('[SMS] Failed to read SMS queue:', err)
  }
  return []
}

function saveQueue(queue: SmsJob[]) {
  try {
    const file = SMS_QUEUE_FILE()
    fs.mkdirSync(path.dirname(file), { recursive: true })
    fs.writeFileSync(file, JSON.stringify(queue, null, 2), 'utf-8')
  } catch (err) {
    console.error('[SMS] Failed to save SMS queue:', err)
  }
}

async function sendSmsJob(job: SmsJob): Promise<boolean> {
  const { accountSid, authToken, fromNumber } = job.twilioConfig
  if (!accountSid || !authToken || !fromNumber) {
    throw new Error('Incomplete Twilio SMS configuration')
  }

  // Use Twilio REST API via native fetch
  const endpoint = `https://api.twilio.com/2010-04-01/Accounts/${accountSid}/Messages.json`
  const body = new URLSearchParams()
  body.append('To', job.toPhone)
  body.append('From', fromNumber)
  body.append('Body', job.message)
  if (job.mediaUrl && job.mediaUrl.startsWith('http')) {
    body.append('MediaUrl', job.mediaUrl)
  }

  const credentials = Buffer.from(`${accountSid}:${authToken}`).toString('base64')
  const res = await fetch(endpoint, {
    method: 'POST',
    headers: {
      'Authorization': `Basic ${credentials}`,
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: body.toString(),
  })

  if (!res.ok) {
    const errText = await res.text()
    throw new Error(`Twilio error (${res.status}): ${errText}`)
  }

  return true
}

// Background queue processor
export async function processSmsQueue() {
  const queue = loadQueue()
  let modified = false

  for (const job of queue) {
    if (job.status === 'queued') {
      job.attempts++
      try {
        await sendSmsJob(job)
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

// POST /api/sms/send
smsRouter.post('/send', async (req: Request, res: Response) => {
  const { sessionId, toPhone, message, mediaUrl, twilioConfig } = req.body

  if (!isSafeId(sessionId) || typeof toPhone !== 'string' || !/^\+?\d{10,15}$/.test(toPhone.replace(/[\s-]/g, ''))) {
    return res.status(400).json({ error: 'Valid sessionId and toPhone required' })
  }

  const job: SmsJob = {
    id: `sms-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    sessionId,
    toPhone,
    message: message || 'Your photo strip is ready! Download it here:',
    mediaUrl,
    twilioConfig: twilioConfig || {},
    attempts: 0,
    status: 'queued',
    createdAt: new Date().toISOString(),
  }

  try {
    if (twilioConfig && twilioConfig.accountSid) {
      await sendSmsJob(job)
      job.status = 'sent'
      return res.json({ success: true, message: 'SMS sent successfully!' })
    } else {
      const queue = loadQueue()
      queue.push(job)
      saveQueue(queue)
      return res.json({ success: true, queued: true, message: 'SMS spooled for delivery.' })
    }
  } catch (err) {
    console.warn('[SMS] Immediate send failed, saving to spool:', err)
    job.error = err instanceof Error ? err.message : String(err)
    const queue = loadQueue()
    queue.push(job)
    saveQueue(queue)
    return res.json({ success: true, queued: true, message: 'Saved to queue; will send when connected.' })
  }
})

// GET /api/sms/queue
smsRouter.get('/queue', requireStaff, (_req: Request, res: Response) => {
  const queue = loadQueue()
  res.json({ queue: queue.map(({ twilioConfig: _t, ...rest }) => rest) })
})

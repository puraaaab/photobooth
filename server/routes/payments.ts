import { Router, Request, Response } from 'express'
import crypto from 'crypto'
import Razorpay from 'razorpay'
import fs from 'fs'
import path from 'path'
import { getTicketManager, getDataPath, io } from '../index'
import { isSafeId } from '../security'
import { PLAN_PRICES as PLAN_PRICE_LIST, allowedChargeAmounts } from '../../src/constants/pricing'

// Helper to guarantee .env variables are loaded (does not override real environment variables)
function loadEnv() {
  const envPath = path.resolve(process.cwd(), '.env')
  if (fs.existsSync(envPath)) {
    const lines = fs.readFileSync(envPath, 'utf-8').split('\n')
    for (const line of lines) {
      const trimmed = line.trim()
      if (!trimmed || trimmed.startsWith('#')) continue
      const eqIdx = trimmed.indexOf('=')
      if (eqIdx > 0) {
        const key = trimmed.slice(0, eqIdx).trim()
        const val = trimmed.slice(eqIdx + 1).trim()
        if (process.env[key] === undefined) process.env[key] = val
      }
    }
  }
}
loadEnv()

// Keys come ONLY from the environment / .env. A live secret used to be hard-coded here and was
// pushed to GitHub — it must be rotated in the Razorpay dashboard.
const KEY_ID = process.env.RAZORPAY_KEY_ID || ''
const KEY_SECRET = process.env.RAZORPAY_KEY_SECRET || ''
const isConfigured = Boolean(KEY_ID && KEY_SECRET)

let razorpayInstance: Razorpay | null = null
if (isConfigured) {
  try {
    razorpayInstance = new Razorpay({ key_id: KEY_ID, key_secret: KEY_SECRET })
  } catch (err: any) {
    console.error('[Razorpay] Init error:', err.message)
  }
} else {
  console.warn('[Razorpay] RAZORPAY_KEY_ID / RAZORPAY_KEY_SECRET not set — online payments disabled.')
}

// ─── Server-side price list (₹) ──────────────────────────────────────────────
// The browser used to send any amount it liked. Now only these amounts can be charged.
// Defined in src/constants/pricing.ts (shared with the UI)
const VALID_PLANS = new Set(PLAN_PRICE_LIST)
const ALLOWED_AMOUNTS = new Set(allowedChargeAmounts())

// Payments already applied to a ticket (prevents replaying one verified payment to add credit twice)
const appliedPaymentIds = new Set<string>()

/**
 * Credit a captured Razorpay payment to a ticket. Shared by checkout verification, dynamic UPI QR
 * polling and the background reconciler, so whichever notices the payment first applies it once.
 */
function applyPaymentToTicket(ticketId: string, paymentId: string, paidRupees: number, planType: number, purpose: string): boolean {
  if (!ticketId || appliedPaymentIds.has(paymentId)) return false
  const manager = getTicketManager()
  const ticket = manager?.getTicketById(ticketId) || manager?.getTicketByCode(ticketId)
  if (!manager || !ticket) return false
  appliedPaymentIds.add(paymentId)
  const isUpgrade = purpose === 'upgrade' && ticket.paymentStatus === 'PAID'
  const newAmount = isUpgrade ? (ticket.paymentAmount ?? 0) + paidRupees : paidRupees
  const updated = manager.updateTicketPayment(ticket.id, {
    paymentStatus: 'PAID',
    paymentMethod: 'UPI',
    paymentAmount: newAmount,
    upiTransactionRef: paymentId,
    planType: VALID_PLANS.has(planType) ? planType : undefined,
  })
  if (updated) {
    io?.emit('ticket:updated', updated)
    io?.emit('queue:updated', {
      tickets: manager.listTickets(),
      nextCode: manager.getNextCode(),
      financialSummary: manager.getFinancialSummary(),
    })
  }
  return true
}

// ─── Pending payments (watched by the reconciler until paid or expired) ──────
interface PendingPayment {
  kind: 'order' | 'qr' | 'link'
  id: string                 // Razorpay order_…, qr_… or plink_…
  amount: number             // ₹
  ticketId: string
  planType: number
  purpose: 'ticket' | 'upgrade'
  createdAt: number
  status: 'pending' | 'paid' | 'expired'
  paymentId?: string
  imageUrl?: string
  payUrl?: string
}
const PENDING_TTL_MS = 20 * 60 * 1000
const pending = new Map<string, PendingPayment>()
const pendingFile = () => path.join(getDataPath(), 'pending-payments.json')

function persistPending() {
  try {
    fs.writeFileSync(pendingFile(), JSON.stringify([...pending.values()], null, 2), 'utf-8')
  } catch {}
}

function loadPending() {
  try {
    for (const p of JSON.parse(fs.readFileSync(pendingFile(), 'utf-8')) as PendingPayment[]) {
      if (p.status === 'pending' && Date.now() - p.createdAt < PENDING_TTL_MS) pending.set(p.id, p)
      if (p.paymentId) appliedPaymentIds.add(p.paymentId)
    }
  } catch {}
}

function markPaid(p: PendingPayment, paymentId: string) {
  if (p.status === 'paid') return
  p.status = 'paid'
  p.paymentId = paymentId
  applyPaymentToTicket(p.ticketId, paymentId, p.amount, p.planType, p.purpose)
  persistPending()
  console.log(`[Payments] Auto-confirmed ${p.kind} ${p.id}: ₹${p.amount} (${paymentId})`)
  io?.emit('payment:confirmed', { id: p.id, kind: p.kind, ticketId: p.ticketId, amount: p.amount, paymentId, planType: p.planType })
}

async function checkPending(p: PendingPayment): Promise<void> {
  if (!razorpayInstance || p.status !== 'pending') return
  if (Date.now() - p.createdAt > PENDING_TTL_MS) {
    p.status = 'expired'
    persistPending()
    return
  }
  if (p.kind === 'qr') {
    const list: any = await (razorpayInstance as any).qrCode.fetchAllPayments(p.id, { count: 10 })
    const hit = (list?.items || []).find((x: any) => x.status === 'captured' || x.status === 'authorized')
    if (hit && Math.round(Number(hit.amount) / 100) >= p.amount) markPaid(p, hit.id)
  } else if (p.kind === 'link') {
    const link: any = await (razorpayInstance as any).paymentLink.fetch(p.id)
    if (link?.status === 'paid' || Number(link?.amount_paid) >= p.amount * 100) {
      const pay = (link.payments || []).find((x: any) => x.status === 'captured') || (link.payments || [])[0]
      markPaid(p, pay?.payment_id || `link:${p.id}`)
    } else if (link?.status === 'expired' || link?.status === 'cancelled') {
      p.status = 'expired'
      persistPending()
    }
  } else {
    const order: any = await razorpayInstance.orders.fetch(p.id)
    if (order.status === 'paid') {
      const pays: any = await razorpayInstance.orders.fetchPayments(p.id)
      const hit = (pays?.items || []).find((x: any) => x.status === 'captured')
      markPaid(p, hit?.id || `order:${p.id}`)
    }
  }
}

let reconcilerTimer: NodeJS.Timeout | null = null
/** Polls Razorpay for every pending order / QR — confirmation does not depend on the screen staying open. */
export function startPaymentReconciler(): void {
  if (reconcilerTimer || !razorpayInstance) return
  loadPending()
  let busy = false
  reconcilerTimer = setInterval(async () => {
    if (busy) return
    busy = true
    try {
      for (const p of pending.values()) {
        await checkPending(p).catch(err => console.warn('[Payments] Reconcile check failed:', err?.error?.description || err?.message))
      }
      for (const [id, p] of pending) if (p.status !== 'pending' && Date.now() - p.createdAt > PENDING_TTL_MS) pending.delete(id)
    } finally {
      busy = false
    }
  }, 4000)
}

export const paymentRouter = Router()

// ─── GET /api/razorpay/config ────────────────────────────────────────────────
paymentRouter.get('/razorpay/config', (_req: Request, res: Response) => {
  res.json({ key_id: KEY_ID, enabled: isConfigured })
})

// ─── POST /api/create-order ──────────────────────────────────────────────────
paymentRouter.post('/create-order', async (req: Request, res: Response) => {
  try {
    if (!razorpayInstance) {
      return res.status(503).json({ error: 'Online payments are not configured on this booth' })
    }
    const { amount, currency = 'INR', ticketId, planType } = req.body || {}

    // Amount is in rupees and must be one of the booth's prices
    const rupees = Number(amount)
    const isPlanPrice = VALID_PLANS.has(rupees)
    if (!Number.isInteger(rupees) || !ALLOWED_AMOUNTS.has(rupees)) {
      return res.status(400).json({ error: 'Amount does not match any booth price' })
    }
    if (currency !== 'INR') {
      return res.status(400).json({ error: 'Only INR is supported' })
    }
    if (ticketId !== undefined && ticketId !== null && ticketId !== '' && !isSafeId(ticketId)) {
      return res.status(400).json({ error: 'Invalid ticket ID' })
    }
    const plan = planType !== undefined && planType !== null ? Number(planType) : undefined
    if (plan !== undefined && !VALID_PLANS.has(plan)) {
      return res.status(400).json({ error: 'Invalid plan type' })
    }

    const order = await razorpayInstance.orders.create({
      amount: rupees * 100,
      currency: 'INR',
      receipt: `rcpt_${Date.now()}_${crypto.randomBytes(3).toString('hex')}`,
      notes: {
        ticketId: ticketId || '',
        planType: plan !== undefined ? String(plan) : '',
        purpose: isPlanPrice && !ticketId ? 'ticket' : 'upgrade',
        source: 'Photobooth Kiosk',
      },
    })

    pending.set(order.id, {
      kind: 'order', id: order.id, amount: rupees, ticketId: ticketId || '', planType: plan ?? 0,
      purpose: isPlanPrice && !ticketId ? 'ticket' : 'upgrade', createdAt: Date.now(), status: 'pending',
    })
    persistPending()
    console.log(`[Razorpay] Order created: ${order.id} for ₹${rupees}`)
    res.json({ order_id: order.id, amount: order.amount, currency: order.currency, key_id: KEY_ID })
  } catch (error: any) {
    console.error('[Razorpay] Create order failed:', error?.error?.description || error?.message)
    const statusCode = error?.statusCode && error.statusCode < 500 ? 502 : 500
    res.status(statusCode).json({ error: 'Failed to create payment order' })
  }
})

// ─── POST /api/verify-payment ────────────────────────────────────────────────
paymentRouter.post('/verify-payment', async (req: Request, res: Response) => {
  try {
    if (!razorpayInstance) {
      return res.status(503).json({ success: false, error: 'Online payments are not configured on this booth' })
    }
    const { razorpay_order_id, razorpay_payment_id, razorpay_signature } = req.body || {}

    if (typeof razorpay_order_id !== 'string' || typeof razorpay_payment_id !== 'string' || typeof razorpay_signature !== 'string'
      || !/^order_[A-Za-z0-9]+$/.test(razorpay_order_id) || !/^pay_[A-Za-z0-9]+$/.test(razorpay_payment_id)
      || !/^[a-f0-9]{64}$/.test(razorpay_signature)) {
      return res.status(400).json({ success: false, error: 'Missing or malformed Razorpay payment fields' })
    }

    // HMAC-SHA256(order_id + "|" + payment_id, KEY_SECRET), compared in constant time
    const expected = crypto.createHmac('sha256', KEY_SECRET).update(`${razorpay_order_id}|${razorpay_payment_id}`).digest()
    const supplied = Buffer.from(razorpay_signature, 'hex')
    if (supplied.length !== expected.length || !crypto.timingSafeEqual(supplied, expected)) {
      console.warn(`[Razorpay] Signature mismatch for order: ${razorpay_order_id}`)
      return res.status(400).json({ success: false, error: 'Payment verification failed: Signature mismatch' })
    }

    // Ticket, plan and amount come from the order we created — never from this request body
    const order: any = await razorpayInstance.orders.fetch(razorpay_order_id)
    const paidRupees = Math.round(Number(order.amount_paid ?? order.amount) / 100)
    if (order.status !== 'paid' && Number(order.amount_paid) <= 0) {
      return res.status(402).json({ success: false, error: 'Order is not paid yet' })
    }
    const notes = order.notes || {}
    const ticketId: string = typeof notes.ticketId === 'string' ? notes.ticketId : ''
    const planType = Number(notes.planType)

    console.log(`[Razorpay] Payment verified: ${razorpay_payment_id} for order ${razorpay_order_id} (₹${paidRupees})`)

    applyPaymentToTicket(ticketId, razorpay_payment_id, paidRupees, planType, String(notes.purpose || ''))
    const p = pending.get(razorpay_order_id)
    if (p) markPaid(p, razorpay_payment_id)

    res.json({
      success: true,
      message: 'Payment verified successfully',
      payment_id: razorpay_payment_id,
      order_id: razorpay_order_id,
      amount: paidRupees,
      planType: VALID_PLANS.has(planType) ? planType : undefined,
    })
  } catch (error: any) {
    console.error('[Razorpay] Verify payment failed:', error?.error?.description || error?.message)
    res.status(500).json({ success: false, error: 'Failed to verify payment' })
  }
})

// ─── Dynamic UPI QR (auto-confirmed) ─────────────────────────────────────────
// Replaces the static "pay to my UPI ID" QR: Razorpay generates a one-time QR for the exact
// amount, and the server sees the payment by itself — nobody has to check a phone and tap "received".

// POST /api/payments/upi-qr { amount, ticketId?, planType? }
paymentRouter.post('/payments/upi-qr', async (req: Request, res: Response) => {
  if (!razorpayInstance) {
    return res.status(503).json({ error: 'Online payments are not configured on this booth', code: 'NOT_CONFIGURED' })
  }
  const { amount, ticketId, planType } = req.body || {}
  const rupees = Number(amount)
  if (!Number.isInteger(rupees) || !ALLOWED_AMOUNTS.has(rupees)) {
    return res.status(400).json({ error: 'Amount does not match any booth price' })
  }
  if (ticketId !== undefined && ticketId !== null && ticketId !== '' && !isSafeId(ticketId)) {
    return res.status(400).json({ error: 'Invalid ticket ID' })
  }
  const plan = planType !== undefined && planType !== null ? Number(planType) : 0
  if (plan && !VALID_PLANS.has(plan)) {
    return res.status(400).json({ error: 'Invalid plan type' })
  }
  try {
    const qr: any = await (razorpayInstance as any).qrCode.create({
      type: 'upi_qr',
      name: 'PAPIT Photobooth',
      usage: 'single_use',
      fixed_amount: true,
      payment_amount: rupees * 100,
      description: ticketId ? `Photobooth upgrade` : `Photobooth pass`,
      close_by: Math.floor((Date.now() + PENDING_TTL_MS) / 1000),
      notes: { ticketId: ticketId || '', planType: plan ? String(plan) : '', source: 'Photobooth Kiosk' },
    })
    const entry: PendingPayment = {
      kind: 'qr', id: qr.id, amount: rupees, ticketId: ticketId || '', planType: plan,
      purpose: VALID_PLANS.has(rupees) && !ticketId ? 'ticket' : 'upgrade',
      createdAt: Date.now(), status: 'pending', imageUrl: qr.image_url,
    }
    pending.set(qr.id, entry)
    persistPending()
    res.json({ id: qr.id, imageUrl: qr.image_url, amount: rupees, expiresAt: entry.createdAt + PENDING_TTL_MS })
  } catch (err: any) {
    // QR Codes is a feature Razorpay enables per account. Fall back to a Payment Link for the exact
    // amount: its QR opens Razorpay's page in any phone camera / UPI app and is confirmed the same way.
    console.warn('[Payments] QR Codes unavailable, using Payment Link:', err?.error?.description || err?.message)
    try {
      const link: any = await (razorpayInstance as any).paymentLink.create({
        amount: rupees * 100,
        currency: 'INR',
        accept_partial: false,
        description: ticketId ? 'Photobooth upgrade' : 'Photobooth pass',
        expire_by: Math.floor((Date.now() + PENDING_TTL_MS) / 1000),
        reminder_enable: false,
        notify: { sms: false, email: false },
        notes: { ticketId: ticketId || '', planType: plan ? String(plan) : '', source: 'Photobooth Kiosk' },
      })
      const entry: PendingPayment = {
        kind: 'link', id: link.id, amount: rupees, ticketId: ticketId || '', planType: plan,
        purpose: VALID_PLANS.has(rupees) && !ticketId ? 'ticket' : 'upgrade',
        createdAt: Date.now(), status: 'pending', payUrl: link.short_url,
      }
      pending.set(link.id, entry)
      persistPending()
      return res.json({ id: link.id, payUrl: link.short_url, amount: rupees, expiresAt: entry.createdAt + PENDING_TTL_MS, kind: 'link' })
    } catch (err2: any) {
      console.warn('[Payments] Payment Link create failed:', err2?.error?.description || err2?.message)
      res.status(502).json({ error: err2?.error?.description || 'Could not create UPI payment', code: 'QR_UNAVAILABLE' })
    }
  }
})

// GET /api/payments/upi-qr/:id → { status: pending | paid | expired, paymentId? }
paymentRouter.get('/payments/upi-qr/:id', async (req: Request, res: Response) => {
  const p = pending.get(String(req.params.id))
  if (!p || p.kind === 'order') return res.status(404).json({ error: 'Unknown QR' })
  if (p.status === 'pending') await checkPending(p).catch(() => {})
  res.json({ status: p.status, paymentId: p.paymentId, amount: p.amount })
})

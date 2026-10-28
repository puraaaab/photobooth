import { Router, Request, Response } from 'express'
import crypto from 'crypto'
import Razorpay from 'razorpay'
import fs from 'fs'
import path from 'path'
import { getTicketManager, io } from '../index'

// Helper to guarantee .env variables are loaded
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
        process.env[key] = val
      }
    }
  }
}
loadEnv()

const KEY_ID = process.env.RAZORPAY_KEY_ID || 'rzp_live_TmAYEziEgmPCkU'
const KEY_SECRET = process.env.RAZORPAY_KEY_SECRET || 'C94T4KK6eXs6qTl816beTBFK'

let razorpayInstance: Razorpay | null = null
try {
  razorpayInstance = new Razorpay({
    key_id: KEY_ID,
    key_secret: KEY_SECRET,
  })
} catch (err: any) {
  console.error('[Razorpay] Init error:', err.message)
}

export const paymentRouter = Router()

// ─── GET /api/razorpay/config ────────────────────────────────────────────────
paymentRouter.get('/razorpay/config', (_req: Request, res: Response) => {
  res.json({
    key_id: KEY_ID,
  })
})

// ─── POST /api/create-order ──────────────────────────────────────────────────
paymentRouter.post('/create-order', async (req: Request, res: Response) => {
  try {
    const { amount, currency = 'INR', receipt, ticketId } = req.body || {}

    if (!amount || typeof amount !== 'number' || isNaN(amount)) {
      return res.status(400).json({ error: 'Valid amount is required' })
    }

    // Convert to paise if passed in rupees (e.g. 99 -> 9900 paise)
    // If amount is >= 1000 and looks already in paise, handle accordingly; standard in photobooth is in rupees (99, 149, 179, 49, 79)
    const amountInPaise = amount < 1000 ? Math.round(amount * 100) : Math.round(amount)

    if (amountInPaise < 100) {
      return res.status(400).json({ error: 'Minimum amount must be at least 100 paise (₹1)' })
    }

    if (!razorpayInstance) {
      razorpayInstance = new Razorpay({
        key_id: KEY_ID,
        key_secret: KEY_SECRET,
      })
    }

    const orderOptions = {
      amount: amountInPaise,
      currency,
      receipt: receipt || `rcpt_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
      notes: {
        ticketId: ticketId || '',
        source: 'Photobooth Kiosk',
      },
    }

    const order = await razorpayInstance.orders.create(orderOptions)

    console.log(`[Razorpay] Order created: ${order.id} for ₹${amountInPaise / 100}`)

    res.json({
      order_id: order.id,
      amount: order.amount,
      currency: order.currency,
      key_id: KEY_ID,
    })
  } catch (error: any) {
    console.error('[Razorpay] Create order failed:', error)
    const statusCode = error?.statusCode || 500
    res.status(statusCode).json({
      error: error?.error?.description || error.message || 'Failed to create Razorpay order',
    })
  }
})

// ─── POST /api/verify-payment ────────────────────────────────────────────────
paymentRouter.post('/verify-payment', async (req: Request, res: Response) => {
  try {
    const { razorpay_order_id, razorpay_payment_id, razorpay_signature, ticketId, planType } = req.body || {}

    if (!razorpay_order_id || !razorpay_payment_id || !razorpay_signature) {
      return res.status(400).json({
        success: false,
        error: 'Missing razorpay_order_id, razorpay_payment_id, or razorpay_signature',
      })
    }

    // Step 3: Signature verification HMAC-SHA256(order_id + "|" + payment_id, KEY_SECRET)
    const body = `${razorpay_order_id}|${razorpay_payment_id}`
    const expectedSignature = crypto
      .createHmac('sha256', KEY_SECRET)
      .update(body)
      .digest('hex')

    const isAuthentic = expectedSignature === razorpay_signature

    if (!isAuthentic) {
      console.warn(`[Razorpay] Signature mismatch for order: ${razorpay_order_id}`)
      return res.status(400).json({
        success: false,
        error: 'Payment verification failed: Signature mismatch',
      })
    }

    console.log(`[Razorpay] Payment verified: ${razorpay_payment_id} for order ${razorpay_order_id}`)

    // Update ticket in local ticketManager if ticketId was provided
    if (ticketId) {
      const manager = getTicketManager()
      if (manager) {
        manager.updateTicketPayment(ticketId, {
          paymentStatus: 'PAID',
          paymentMethod: 'UPI',
        })
        if (planType && (planType === 99 || planType === 149 || planType === 179)) {
          manager.updateTicketPlan(ticketId, planType)
        }
        io?.emit('ticket:updated', { id: ticketId })
      }
    }

    res.json({
      success: true,
      message: 'Payment verified successfully',
      payment_id: razorpay_payment_id,
      order_id: razorpay_order_id,
    })
  } catch (error: any) {
    console.error('[Razorpay] Verify payment failed:', error)
    res.status(500).json({
      success: false,
      error: error.message || 'Failed to verify Razorpay payment',
    })
  }
})

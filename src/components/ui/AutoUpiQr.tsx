import React, { useEffect, useRef, useState } from 'react'
import { CheckCircle2, Loader2 } from 'lucide-react'
import { QRCodeSVG } from 'qrcode.react'

const SERVER_BASE = typeof window !== 'undefined' && window.location.hostname
  ? `http://${window.location.hostname}:3847`
  : 'http://localhost:3847'

interface AutoUpiQrProps {
  amount: number
  ticketId?: string
  planType?: number
  size?: number
  /** Called once when Razorpay reports the payment captured. */
  onPaid: (paymentId: string) => void
  /** Shown instead when dynamic QR isn't available (keys missing / QR Codes not enabled / offline). */
  fallback: React.ReactNode
}

/**
 * One-time Razorpay UPI QR for an exact amount. The server polls Razorpay, so the payment is
 * confirmed automatically — nobody has to check a phone and tap "received".
 */
export function AutoUpiQr({ amount, ticketId, planType, size = 200, onPaid, fallback }: AutoUpiQrProps) {
  // imageUrl: Razorpay UPI QR image · payUrl: Razorpay payment link (used when QR Codes isn't enabled)
  const [qr, setQr] = useState<{ id: string; imageUrl?: string; payUrl?: string; expiresAt: number } | null>(null)
  const [state, setState] = useState<'loading' | 'ready' | 'paid' | 'expired' | 'unavailable'>('loading')
  const onPaidRef = useRef(onPaid)
  onPaidRef.current = onPaid

  useEffect(() => {
    let alive = true
    setState('loading')
    setQr(null)
    fetch(`${SERVER_BASE}/api/payments/upi-qr`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ amount, ticketId, planType }),
      signal: AbortSignal.timeout(10000),
    })
      .then(async r => (r.ok ? r.json() : Promise.reject(await r.json().catch(() => ({})))))
      .then(d => { if (alive) { setQr(d); setState('ready') } })
      .catch(() => { if (alive) setState('unavailable') })
    return () => { alive = false }
  }, [amount, ticketId, planType])

  useEffect(() => {
    if (!qr || state !== 'ready') return
    let alive = true
    const t = setInterval(async () => {
      try {
        const r = await fetch(`${SERVER_BASE}/api/payments/upi-qr/${qr.id}`)
        const d = await r.json()
        if (!alive) return
        if (d.status === 'paid') {
          setState('paid')
          onPaidRef.current(d.paymentId)
        } else if (d.status === 'expired') {
          setState('expired')
        }
      } catch {}
    }, 2500)
    return () => { alive = false; clearInterval(t) }
  }, [qr, state])

  if (state === 'unavailable') return <>{fallback}</>

  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8 }}>
      <div style={{ width: size, height: size, display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#fff', borderRadius: 12, overflow: 'hidden' }}>
        {state === 'loading' && <Loader2 size={28} style={{ animation: 'spin 1s linear infinite', color: '#6D0626' }} />}
        {(state === 'ready' || state === 'expired') && qr?.imageUrl && (
          // Razorpay's hosted QR image contains the exact amount + a unique reference
          <img src={qr.imageUrl} alt={`Scan to pay ₹${amount}`} style={{ width: '100%', height: '100%', objectFit: 'contain', opacity: state === 'expired' ? 0.25 : 1 }} />
        )}
        {(state === 'ready' || state === 'expired') && !qr?.imageUrl && qr?.payUrl && (
          <div style={{ opacity: state === 'expired' ? 0.25 : 1 }}>
            <QRCodeSVG value={qr.payUrl} size={size - 16} level="M" includeMargin={false} />
          </div>
        )}
        {state === 'paid' && <CheckCircle2 size={72} color="#16a34a" />}
      </div>
      <span style={{ fontSize: 11, fontFamily: 'var(--font-mono)', fontWeight: 700, color: state === 'paid' ? '#16a34a' : '#374151' }}>
        {state === 'paid' ? `₹${amount} received ✓`
          : state === 'expired' ? 'QR expired — close and try again'
          : state === 'loading' ? 'Creating secure QR…'
          : qr?.payUrl ? `Scan with phone camera · pay ₹${amount} by UPI · confirms automatically`
          : `Scan & pay ₹${amount} · confirms automatically`}
      </span>
    </div>
  )
}

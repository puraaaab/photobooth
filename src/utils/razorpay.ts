declare global {
  interface Window {
    Razorpay: any
  }
}

export interface RazorpayCheckoutOptions {
  amount: number // In Rupees (e.g. 49, 79, 99, 149, 179)
  description?: string
  ticketId?: string
  planType?: number
  customerName?: string
  customerPhone?: string
  onSuccess: (paymentResult: {
    razorpay_payment_id: string
    razorpay_order_id: string
    razorpay_signature: string
  }) => void
  onFailure?: (error: Error) => void
  onDismiss?: () => void
}

/**
 * Loads Razorpay script dynamically if not already present on page
 */
export async function loadRazorpayScript(): Promise<boolean> {
  if (typeof window !== 'undefined' && window.Razorpay) {
    return true
  }

  return new Promise((resolve) => {
    const script = document.createElement('script')
    script.src = 'https://checkout.razorpay.com/v1/checkout.js'
    script.async = true
    script.onload = () => resolve(true)
    script.onerror = () => resolve(false)
    document.body.appendChild(script)
  })
}

/**
 * Initiates Razorpay Standard Checkout:
 * 1. Calls /api/create-order to create order on server
 * 2. Opens official Razorpay modal (UPI QR, Cards, Netbanking)
 * 3. On success, posts signature to /api/verify-payment for cryptographic verification
 */
export async function openRazorpayCheckout(opts: RazorpayCheckoutOptions): Promise<void> {
  const {
    amount,
    description = 'Photobooth Pass',
    ticketId,
    planType,
    customerName,
    customerPhone,
    onSuccess,
    onFailure,
    onDismiss,
  } = opts

  try {
    const scriptLoaded = await loadRazorpayScript()
    if (!scriptLoaded) {
      throw new Error('Failed to load Razorpay payment SDK')
    }

    // Step 1: Create order on backend
    const orderRes = await fetch('/api/create-order', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        amount,
        currency: 'INR',
        ticketId,
        receipt: `kiosk_${ticketId || Date.now()}`,
      }),
    })

    if (!orderRes.ok) {
      const errJson = await orderRes.json().catch(() => ({}))
      throw new Error(errJson.error || `Server error (${orderRes.status}) while creating order`)
    }

    const orderData = await orderRes.json()

    // Step 2: Open Razorpay Checkout modal
    const keyId =
      orderData.key_id ||
      (typeof import.meta !== 'undefined' && (import.meta as any).env?.VITE_RAZORPAY_KEY_ID) ||
      'rzp_live_TmAYEziEgmPCkU'

    const rzpOptions: any = {
      key: keyId,
      amount: orderData.amount,
      currency: orderData.currency || 'INR',
      name: 'PAPIT Photobooth',
      description,
      image: '/papit.png',
      order_id: orderData.order_id,
      handler: async function (response: any) {
        try {
          // Step 3: Verify signature on backend
          const verifyRes = await fetch('/api/verify-payment', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              razorpay_order_id: response.razorpay_order_id,
              razorpay_payment_id: response.razorpay_payment_id,
              razorpay_signature: response.razorpay_signature,
              ticketId,
              planType,
            }),
          })

          const verifyData = await verifyRes.json()
          if (!verifyRes.ok || !verifyData.success) {
            throw new Error(verifyData.error || 'Payment signature verification failed')
          }

          onSuccess(response)
        } catch (verifyErr: any) {
          console.error('[Razorpay] Verification error:', verifyErr)
          if (onFailure) onFailure(verifyErr)
        }
      },
      prefill: {
        name: customerName || '',
        contact: customerPhone || '',
      },
      theme: {
        color: '#6D0626', // Brand Cherry Red
      },
      modal: {
        ondismiss: function () {
          if (onDismiss) onDismiss()
        },
      },
    }

    const rzp = new window.Razorpay(rzpOptions)

    rzp.on('payment.failed', function (resp: any) {
      console.warn('[Razorpay] Payment failed:', resp.error)
      if (onFailure) {
        onFailure(new Error(resp.error?.description || 'Payment was unsuccessful'))
      }
    })

    rzp.open()
  } catch (err: any) {
    console.error('[Razorpay] Checkout launch error:', err)
    if (onFailure) {
      onFailure(err)
    } else {
      alert(`Payment Error: ${err.message}`)
    }
  }
}

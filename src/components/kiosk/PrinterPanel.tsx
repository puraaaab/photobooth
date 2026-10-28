import React, { useCallback, useEffect, useState } from 'react'
import { Printer, RefreshCw, X } from 'lucide-react'
import { QRCodeSVG } from 'qrcode.react'

const SERVER_BASE = typeof window !== 'undefined' && window.location.hostname
  ? `http://${window.location.hostname}:3847`
  : 'http://localhost:3847'

interface PrintStatus {
  configured: boolean
  reachable: boolean
  mode: 'network' | 'airprint'
  printer: null | {
    model?: string
    state?: string
    stateReasons: string[]
    ink: Array<{ name: string; level: number; color?: string }>
    supportsA5: boolean
  }
  error?: string
}

/**
 * Ticket-desk widget for the Wi-Fi printer the editing iPad prints to.
 * The server finds the printer by itself; this panel is for checking ink, picking among several
 * printers, and printing a test page.
 */
export function PrinterPanel() {
  const [open, setOpen] = useState(false)
  const [status, setStatus] = useState<PrintStatus | null>(null)
  const [found, setFound] = useState<Array<{ uri: string; model?: string; state?: string }> | null>(null)
  const [busy, setBusy] = useState('')
  const [message, setMessage] = useState('')

  const [lanAddress, setLanAddress] = useState('')
  const refresh = useCallback(async () => {
    try {
      const r = await fetch(`${SERVER_BASE}/api/print/status`)
      setStatus(await r.json())
      const h = await fetch(`${SERVER_BASE}/api/health`).then(x => x.json())
      if (h?.address) setLanAddress(h.address)
    } catch {
      setStatus(null)
    }
  }, [])
  const editorUrl = lanAddress ? `http://${lanAddress}:3847/?view=editor` : ''

  useEffect(() => {
    refresh()
    const t = setInterval(refresh, 20000)
    return () => clearInterval(t)
  }, [refresh])

  const call = async (label: string, path: string, body?: object) => {
    setBusy(label)
    setMessage('')
    try {
      const r = await fetch(`${SERVER_BASE}${path}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: body ? JSON.stringify(body) : undefined,
      })
      const d = await r.json().catch(() => ({}))
      if (!r.ok) setMessage(d.error || `Failed (${r.status})`)
      return r.ok ? d : null
    } finally {
      setBusy('')
    }
  }

  const ok = status?.reachable
  const lowInk = status?.printer?.ink.filter(i => i.level >= 0 && i.level <= 15) ?? []
  const dot = ok ? (lowInk.length || status?.printer?.state === 'stopped' ? '#f59e0b' : '#22c55e') : status?.configured ? '#ef4444' : '#9ca3af'

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        title="Printer"
        style={{
          position: 'fixed', right: 16, bottom: 16, zIndex: 900, display: 'flex', alignItems: 'center', gap: 8,
          padding: '10px 14px', borderRadius: 999, border: '1px solid var(--color-border-subtle)',
          background: 'var(--color-bg-base, #fff)', boxShadow: '0 6px 20px rgba(0,0,0,0.12)', cursor: 'pointer',
          fontFamily: 'var(--font-mono)', fontSize: 12, fontWeight: 700, color: 'var(--color-text-primary)',
        }}
      >
        <span style={{ width: 9, height: 9, borderRadius: '50%', background: dot }} />
        <Printer size={16} />
        {ok ? (status?.printer?.model || 'Printer') : status?.configured ? 'Printer offline' : 'AirPrint mode'}
      </button>

      {open && (
        <div onClick={() => setOpen(false)} style={{ position: 'fixed', inset: 0, zIndex: 9999, background: 'rgba(0,0,0,0.45)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}>
          <div onClick={e => e.stopPropagation()} style={{ width: 'min(460px, 100%)', background: 'var(--color-bg-base, #fff)', borderRadius: 16, padding: 20, fontFamily: 'var(--font-mono)', color: 'var(--color-text-primary)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
              <strong style={{ fontSize: 15 }}>Printer & devices</strong>
              <button type="button" onClick={() => setOpen(false)} style={{ background: 'none', border: 'none', cursor: 'pointer' }}><X size={18} /></button>
            </div>

            {ok ? (
              <div style={{ fontSize: 12, lineHeight: 1.6 }}>
                <div><b>{status?.printer?.model}</b> · {status?.printer?.state}{status?.printer?.stateReasons.length ? ` (${status.printer.stateReasons.join(', ')})` : ''}</div>
                <div>{status?.printer?.supportsA5 ? 'A5 paper supported ✓' : '⚠ printer does not list A5 media'}</div>
                <div style={{ marginTop: 8, display: 'grid', gap: 4 }}>
                  {status?.printer?.ink.map(i => (
                    <div key={i.name} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <span style={{ width: 70 }}>{i.name}</span>
                      <div style={{ flex: 1, height: 8, background: '#e5e7eb', borderRadius: 4, overflow: 'hidden' }}>
                        <div style={{ width: `${Math.max(0, i.level)}%`, height: '100%', background: i.color?.startsWith('#') ? i.color : '#6b7280' }} />
                      </div>
                      <span style={{ width: 36, textAlign: 'right', color: i.level <= 15 ? '#dc2626' : undefined }}>{i.level >= 0 ? `${i.level}%` : '—'}</span>
                    </div>
                  ))}
                </div>
                <p style={{ marginTop: 10, color: 'var(--color-text-secondary)' }}>
                  Guests print from the iPad as usual; sheets go straight to this printer with the copy count fixed by the server.
                </p>
              </div>
            ) : (
              <p style={{ fontSize: 12, lineHeight: 1.5 }}>
                {status?.configured
                  ? `Saved printer not reachable (${status.error || 'offline'}). Check it is on and on the same Wi-Fi, or search again.`
                  : 'No network printer set up — the iPad will use the iOS AirPrint dialog (guests can change copies there). Search to fix.'}
              </p>
            )}

            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 12 }}>
              <button type="button" className="btn btn-secondary btn-sm" disabled={!!busy} onClick={async () => {
                const d = await call('search', '/api/print/discover')
                if (d) setFound(d.printers)
              }}>
                <RefreshCw size={14} /> {busy === 'search' ? 'Searching… (~20s)' : 'Search network'}
              </button>
              {ok && (
                <button type="button" className="btn btn-secondary btn-sm" disabled={!!busy} onClick={async () => {
                  const d = await call('test', '/api/print/test')
                  if (d) setMessage(`Test page sent (${d.format}).`)
                }}>
                  {busy === 'test' ? 'Printing…' : 'Print test page'}
                </button>
              )}
            </div>

            {found && (
              <div style={{ marginTop: 12, display: 'grid', gap: 6 }}>
                {found.length === 0 && <span style={{ fontSize: 12 }}>No IPP/AirPrint printers found on this network.</span>}
                {found.map(p => (
                  <button key={p.uri} type="button" className="btn btn-sm" disabled={!!busy} onClick={async () => {
                    const d = await call('use', '/api/print/config', { uri: p.uri })
                    if (d) { setFound(null); refresh() }
                  }} style={{ justifyContent: 'space-between', display: 'flex', border: '1px solid var(--color-border-subtle)' }}>
                    <span>{p.model || 'Printer'}</span><span style={{ opacity: 0.6 }}>{new URL(p.uri.replace('ipp:', 'http:')).hostname}</span>
                  </button>
                ))}
              </div>
            )}
            {editorUrl && (
              <div style={{ marginTop: 16, paddingTop: 12, borderTop: '1px solid var(--color-border-subtle)', display: 'flex', gap: 12, alignItems: 'center' }}>
                <div style={{ background: '#fff', padding: 6, borderRadius: 8 }}><QRCodeSVG value={editorUrl} size={96} /></div>
                <div style={{ fontSize: 11, lineHeight: 1.5 }}>
                  <b>Connect the editing iPad</b><br />
                  Scan with the iPad camera, then Share → Add to Home Screen.<br />
                  <span style={{ opacity: 0.7 }}>{editorUrl}</span><br />
                  <span style={{ opacity: 0.7 }}>The booth Pi finds this laptop by itself.</span>
                </div>
              </div>
            )}
            {message && <p style={{ fontSize: 12, marginTop: 10, color: message.startsWith('Test') ? '#16a34a' : '#dc2626' }}>{message}</p>}
          </div>
        </div>
      )}
    </>
  )
}

import * as crypto from 'crypto'
import * as fs from 'fs'
import * as os from 'os'
import * as path from 'path'
import type { Request, Response, NextFunction } from 'express'

// ─── Identifier validation ───────────────────────────────────────────────────
export const SAFE_ID = /^[a-zA-Z0-9_-]{1,128}$/
export const SAFE_FILENAME = /^[a-zA-Z0-9][a-zA-Z0-9._-]{0,127}$/
export const TICKET_CODE = /^\d{4}$/

export function isSafeId(v: unknown): v is string {
  return typeof v === 'string' && SAFE_ID.test(v)
}

export function isSafeFilename(v: unknown): v is string {
  return typeof v === 'string' && SAFE_FILENAME.test(v) && !v.includes('..')
}

export function cleanTicketCode(v: unknown): string | null {
  if (v === undefined || v === null) return null
  const code = String(v).replace(/^#/, '').trim()
  return TICKET_CODE.test(code) ? code : null
}

/** Resolves `parts` under `root` and throws if the result escapes `root`. */
export function safeJoin(root: string, ...parts: string[]): string {
  const base = path.resolve(root)
  const target = path.resolve(base, ...parts)
  if (target !== base && !target.startsWith(base + path.sep)) {
    throw new Error('Path escapes data directory')
  }
  return target
}

// ─── Network origin checks ───────────────────────────────────────────────────
function stripV6Prefix(ip: string): string {
  return ip.startsWith('::ffff:') ? ip.slice(7) : ip
}

export function isPrivateHost(host: string): boolean {
  const h = stripV6Prefix(host.toLowerCase())
  if (h === 'localhost' || h === '::1' || h.endsWith('.local')) return true
  const m = h.match(/^(\d+)\.(\d+)\.(\d+)\.(\d+)$/)
  if (!m) return false
  const [a, b] = [Number(m[1]), Number(m[2])]
  return a === 10 || a === 127 || (a === 192 && b === 168) || (a === 172 && b >= 16 && b <= 31) || (a === 169 && b === 254)
}

/** CORS: only allow pages served from localhost / private LAN addresses (blocks drive-by requests from internet sites). */
export function isAllowedOrigin(origin: string | undefined): boolean {
  if (!origin) return true // same-origin requests, curl, Pi scripts
  try {
    const u = new URL(origin)
    return (u.protocol === 'http:' || u.protocol === 'https:') && isPrivateHost(u.hostname)
  } catch {
    return false
  }
}

function localAddresses(): Set<string> {
  const set = new Set(['127.0.0.1', '::1'])
  for (const list of Object.values(os.networkInterfaces())) {
    for (const net of list || []) set.add(stripV6Prefix(net.address))
  }
  return set
}

/** Effective client IP. X-Forwarded-For is only trusted when the direct peer is loopback (the Vite dev proxy). */
export function clientIp(req: Request): string {
  const peer = stripV6Prefix(req.socket.remoteAddress || '')
  if (peer === '127.0.0.1' || peer === '::1') {
    const fwd = req.headers['x-forwarded-for']
    const first = (Array.isArray(fwd) ? fwd[0] : fwd)?.split(',')[0]?.trim()
    if (first) return stripV6Prefix(first)
  }
  return peer
}

/** True when the request originates on the server machine itself (the ticket desk laptop). */
export function isLocalMachine(req: Request): boolean {
  return localAddresses().has(clientIp(req))
}

// ─── Staff PIN ───────────────────────────────────────────────────────────────
let staffPin = ''

export function initStaffPin(dataDir: string): string {
  const fromEnv = process.env.STAFF_PIN?.trim()
  if (fromEnv && /^\d{4,8}$/.test(fromEnv)) {
    staffPin = fromEnv
    return staffPin
  }
  const file = path.join(dataDir, 'staff-pin.txt')
  try {
    const saved = fs.readFileSync(file, 'utf-8').trim()
    if (/^\d{4,8}$/.test(saved)) staffPin = saved
  } catch {}
  if (!staffPin) {
    staffPin = String(crypto.randomInt(100000, 1000000))
    fs.writeFileSync(file, staffPin + '\n', 'utf-8')
  }
  console.log(`[Security] Staff PIN loaded (data/staff-pin.txt or STAFF_PIN env). Remote stations need it for staff actions.`)
  return staffPin
}

const pinFailures = new Map<string, { count: number; until: number }>()

export function checkStaffPin(req: Request): boolean {
  const supplied = req.headers['x-staff-pin']
  const pin = (Array.isArray(supplied) ? supplied[0] : supplied)?.trim()
  if (!pin || !staffPin) return false

  const ip = clientIp(req)
  const state = pinFailures.get(ip)
  if (state && state.until > Date.now()) return false

  const a = Buffer.from(pin)
  const b = Buffer.from(staffPin)
  const ok = a.length === b.length && crypto.timingSafeEqual(a, b)
  if (ok) {
    pinFailures.delete(ip)
    return true
  }
  const count = (state?.count || 0) + 1
  pinFailures.set(ip, { count, until: count >= 5 ? Date.now() + 60_000 : 0 })
  return false
}

export function isStaff(req: Request): boolean {
  return isLocalMachine(req) || checkStaffPin(req)
}

/** Express guard for operator-only routes: ticket desk on the server machine, or any station presenting the staff PIN. */
export function requireStaff(req: Request, res: Response, next: NextFunction) {
  if (isStaff(req)) return next()
  res.status(403).json({ error: 'Staff authorization required', code: 'STAFF_REQUIRED' })
}

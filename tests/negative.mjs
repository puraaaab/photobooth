// Negative / abuse tests. Start a throwaway server first:
//   PRINTER_AUTOSETUP=0 DATA_DIR=./tmp-test-data PORT=13847 STAFF_PIN=246810 RAZORPAY_KEY_ID= RAZORPAY_KEY_SECRET= npx tsx server/index.ts
// then: npm run test:negative
const BASE = process.env.BASE || 'http://127.0.0.1:13847'
const LAN = { 'X-Forwarded-For': '192.168.1.50' }       // simulated guest station (iPad / Pi)
const PIN = process.env.STAFF_PIN || '246810'
let pass = 0, fail = 0
const results = []

async function req(method, path, { body, headers = {}, raw } = {}) {
  const h = { ...headers }
  let payload
  if (raw !== undefined) { payload = raw; h['Content-Type'] = 'application/json' }
  else if (body !== undefined) { payload = JSON.stringify(body); h['Content-Type'] = 'application/json' }
  const res = await fetch(BASE + path, { method, headers: h, body: payload })
  let data = null
  const text = await res.text()
  try { data = JSON.parse(text) } catch { data = text }
  return { status: res.status, data }
}

const SKIP = process.env.SKIP ? new RegExp(process.env.SKIP) : null
function check(name, cond, detail = '') {
  if (SKIP && SKIP.test(name)) { results.push('SKIP  ' + name); return }
  if (cond) pass++; else fail++
  results.push(`${cond ? 'PASS' : 'FAIL'}  ${name}${cond ? '' : '  -> ' + detail}`)
}

// ── Staff-only routes must reject guest stations ────────────────────────────
let r = await req('POST', '/api/tickets/issue', { body: { planType: 99, paymentMethod: 'CASH' }, headers: LAN })
check('LAN station cannot issue tickets', r.status === 403, r.status)

r = await req('POST', '/api/tickets/issue', { body: { planType: 99, paymentMethod: 'CASH' }, headers: { ...LAN, 'X-Staff-Pin': '000000' } })
check('Wrong staff PIN rejected', r.status === 403, r.status)

r = await req('POST', '/api/tickets/issue', { body: { planType: 99, paymentMethod: 'CASH' }, headers: { ...LAN, 'X-Staff-Pin': PIN } })
check('Correct staff PIN accepted from LAN', r.status === 201, r.status)
const cashTicket = r.data.ticket

r = await req('POST', '/api/tickets/issue', { body: { planType: 169, paymentMethod: 'UPI', paymentStatus: 'PAID' } })
check('Ticket desk (local) can issue', r.status === 201, r.status)
const ticket = r.data.ticket

r = await req('POST', `/api/tickets/${ticket.id}/payment`, { body: { paymentStatus: 'PAID', paymentAmount: 229, planType: 229 }, headers: LAN })
check('Guest station cannot mark itself PAID / upgrade plan', r.status === 403, r.status)

r = await req('POST', '/api/tickets/reset', { headers: LAN })
check('Guest station cannot wipe the queue', r.status === 403, r.status)

r = await req('DELETE', `/api/tickets/${ticket.id}`, { headers: LAN })
check('Guest station cannot delete tickets', r.status === 403, r.status)

r = await req('GET', '/api/tickets', { headers: LAN })
check('Revenue summary hidden from guest stations', r.status === 200 && r.data.financialSummary === undefined, JSON.stringify(r.data.financialSummary))

r = await req('GET', '/api/tickets/financial', { headers: LAN })
check('Financial endpoint staff-only', r.status === 403, r.status)

r = await req('POST', '/api/templates/remove', { body: { ids: ['x'] }, headers: LAN })
check('Guest station cannot edit template source code', r.status === 403, r.status)

r = await req('GET', '/api/session', { headers: { ...LAN, 'x-admin-auth': 'anything' } })
check('Fake x-admin-auth header no longer lists all sessions', r.status === 403, r.status)

// ── Command injection / traversal ───────────────────────────────────────────
r = (SKIP && SKIP.test('open-folder')) ? { status: 0 } : await req('POST', '/api/tickets/' + encodeURIComponent('1"&calc&"') + '/open-folder')
check('open-folder rejects shell metacharacters (RCE fix)', r.status === 400, r.status)

r = await req('POST', '/api/export/save-strip', { body: { sessionId: '../../evil', filename: 'x.jpg', dataUrl: 'data:image/jpeg;base64,/9j/' } })
check('save-strip rejects traversal in sessionId', r.status === 400, r.status)

r = await req('POST', '/api/export/save-strip', { body: { filename: '../../../pwned.jpg', dataUrl: 'data:image/jpeg;base64,/9j/' } })
check('save-strip rejects traversal in filename', r.status === 400, r.status)

r = await req('POST', '/api/export/save-strip', { body: { ticketCode: '1234', filename: 'leak.jpg', dataUrl: 'C:\\projects\\Photobooth\\.env' } })
check('save-strip refuses to copy local files (file-read fix)', r.status === 400, r.status)

r = await req('POST', '/api/export/save-strip', { body: { ticketCode: '../../x', filename: 'a.jpg', dataUrl: 'data:image/jpeg;base64,/9j/4AAQ' } })
check('save-strip rejects traversal in ticketCode', r.status === 400, r.status)

r = await req('GET', '/api/export/..%2F..%2F..%2F/list')
check('export list rejects traversal', r.status === 400 || r.status === 404, r.status)

r = await req('GET', '/vault/..%2F..%2F/originals/x.jpg')
check('vault media rejects non-4-digit code', r.status === 400 || r.status === 404, r.status)

r = await req('GET', '/sessions/..%2F..%2F/originals/x.jpg')
check('session media rejects traversal', r.status === 400 || r.status === 404, r.status)

// ── Input validation ────────────────────────────────────────────────────────
r = await req('POST', '/api/tickets/issue', { raw: '{"broken json' })
check('Malformed JSON → 400 JSON (no HTML stack trace)', r.status === 400 && typeof r.data === 'object', `${r.status} ${typeof r.data}`)

r = await req('POST', '/api/tickets/issue', { body: { planType: 999 } })
check('Unknown plan rejected', r.status === 400, r.status)

r = await req('POST', '/api/tickets/issue', { body: { paymentAmount: -50 } })
check('Negative amount rejected', r.status === 400, r.status)

r = await req('POST', '/api/tickets/issue', { body: { paymentAmount: 'abc' } })
check('Non-numeric amount rejected', r.status === 400, r.status)

r = await req('POST', '/api/tickets/issue', { body: { customerPhone: '12345' } })
check('Short phone rejected', r.status === 400, r.status)

r = await req('POST', '/api/tickets/issue', { body: { code: '12a4' } })
check('Non-numeric custom code rejected', r.status === 400, r.status)

r = await req('POST', '/api/tickets/issue', { body: { code: ticket.code } })
check('Duplicate active code rejected', r.status === 409, r.status)

r = await req('POST', '/api/tickets/claim', { body: { code: '99999' } })
check('5-digit claim code rejected', r.status === 400, r.status)

r = await req('POST', '/api/tickets/claim', { body: { code: ticket.code, sessionId: '../../x' } })
check('Claim rejects bad sessionId', r.status === 400, r.status)

r = await req('POST', `/api/tickets/${ticket.id}/status`, { body: { status: 'HACKED' }, headers: LAN })
check('Unknown status rejected', r.status === 400, r.status)

r = await req('POST', `/api/tickets/${ticket.id}/status`, { body: { status: 'EDITING', printCount: 1e9 }, headers: LAN })
check('Absurd printCount rejected', r.status === 400, r.status)

r = await req('POST', '/api/email/send', { body: { sessionId: '../x', toEmail: 'a@b.com' } })
check('Email rejects bad sessionId', r.status === 400, r.status)

r = await req('POST', '/api/email/send', { body: { sessionId: 'S1', toEmail: 'not-an-email' } })
check('Email rejects malformed address', r.status === 400, r.status)

r = await req('POST', '/api/sms/send', { body: { sessionId: 'S1', toPhone: 'call-me' } })
check('SMS rejects malformed phone', r.status === 400, r.status)

r = await req('POST', '/api/camera/set-ip', { body: { ip: 'evil.com/../' }, headers: LAN })
check('Guest station cannot repoint camera IP', r.status === 403, r.status)

r = await req('POST', '/api/session/create', { body: { ticketCode: 'abcd' } })
check('Session create rejects bad ticket code', r.status === 400, r.status)

// ── Ticket lifecycle (state machine) from guest stations ────────────────────
r = await req('POST', `/api/tickets/${ticket.id}/status`, { body: { status: 'COMPLETED' }, headers: LAN })
check('Cannot jump WAITING → COMPLETED', r.status === 409, r.status)

r = await req('POST', `/api/tickets/${ticket.id}/status`, { body: { status: 'IN_BOOTH' }, headers: LAN })
check('WAITING → IN_BOOTH allowed', r.status === 200, r.status)

r = await req('POST', `/api/tickets/${ticket.id}/status`, { body: { status: 'IN_BOOTH' }, headers: LAN })
check('IN_BOOTH → IN_BOOTH (0 photos, crash resume) allowed', r.status === 200, r.status)

r = await req('POST', `/api/tickets/${ticket.id}/status`, { body: { status: 'EDITING', photoCount: 30 }, headers: LAN })
check('IN_BOOTH → EDITING allowed', r.status === 200, r.status)

r = await req('POST', `/api/tickets/${ticket.id}/status`, { body: { status: 'IN_BOOTH' }, headers: LAN })
check('Re-shoot of EDITING ticket blocked (unlimited sessions fix)', r.status === 409, r.status)

r = await req('POST', `/api/tickets/${ticket.id}/status`, { body: { status: 'WAITING' }, headers: LAN })
check('Guest station cannot reset ticket to WAITING', r.status === 409, r.status)

r = await req('POST', `/api/tickets/${ticket.id}/status`, { body: { status: 'COMPLETED', printCount: 3 }, headers: LAN })
check('EDITING → COMPLETED allowed', r.status === 200, r.status)

r = await req('POST', `/api/tickets/${ticket.id}/status`, { body: { status: 'EDITING' }, headers: LAN })
check('COMPLETED ticket cannot be reopened by guest', r.status === 409, r.status)

r = await req('POST', `/api/tickets/${ticket.id}/status`, { body: { status: 'EDITING' } })
check('Staff can still force-reopen a ticket', r.status === 200, r.status)

r = await req('POST', '/api/tickets/claim', { body: { code: cashTicket.code } })
check('Unpaid CASH ticket claim reports payment pending', r.status === 200 && r.data.isPaymentPending === true, JSON.stringify(r.data).slice(0, 120))

// ── Payments ────────────────────────────────────────────────────────────────
r = await req('GET', '/api/razorpay/config')
check('Razorpay config exposes no secret & reports disabled without keys', r.data.enabled === false && !JSON.stringify(r.data).includes('C94T4'), JSON.stringify(r.data))

r = (SKIP && SKIP.test('create-order')) ? { status: 0 } : await req('POST', '/api/create-order', { body: { amount: 1 } })
check('create-order refuses when not configured (no hardcoded fallback key)', r.status === 503, r.status)

r = await req('POST', '/api/verify-payment', { body: { razorpay_order_id: 'order_x', razorpay_payment_id: 'pay_x', razorpay_signature: 'zz', ticketId: ticket.id, planType: 179 } })
check('verify-payment refuses forged payload', r.status === 503 || r.status === 400, r.status)

r = await req('POST', '/api/staff/verify', { headers: { ...LAN, 'X-Staff-Pin': PIN } })
check('Staff PIN verify endpoint works for attendant', r.status === 200, r.status)

// Brute force lockout: 5 wrong PINs then even the right one is refused for 60s
for (let i = 0; i < 5; i++) await req('POST', '/api/staff/verify', { headers: { 'X-Forwarded-For': '192.168.1.77', 'X-Staff-Pin': '111111' } })
r = await req('POST', '/api/staff/verify', { headers: { 'X-Forwarded-For': '192.168.1.77', 'X-Staff-Pin': PIN } })
check('Staff PIN brute force locks out after 5 tries', r.status === 403, r.status)

// ── CORS ────────────────────────────────────────────────────────────────────
r = await req('POST', '/api/tickets/reset', { headers: { Origin: 'https://evil.example.com' } })
check('Internet origin blocked (drive-by CSRF fix)', r.status === 403, r.status)

r = await req('GET', '/api/health', { headers: { Origin: 'http://192.168.29.50:5173' } })
check('LAN origin allowed', r.status === 200, r.status)

console.log(results.join('\n'))
console.log(`\n${pass} passed, ${fail} failed`)
process.exit(fail ? 1 : 0)

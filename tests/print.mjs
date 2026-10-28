// End-to-end print tests: server (/api/print/*) → fake IPP printer (tests/mock-ipp-printer.mjs).
// 1) IPP_PORT=18631 OUT_DIR=./tmp-test-data node tests/mock-ipp-printer.mjs
// 2) PRINTER_AUTOSETUP=0 DATA_DIR=./tmp-test-data PORT=13847 STAFF_PIN=246810 npx tsx server/index.ts
// 3) BASE=http://127.0.0.1:13847 node tests/print.mjs
import fs from 'fs'
const BASE = process.env.BASE
const PIN = '246810'
const LAN = { 'X-Forwarded-For': '192.168.1.50' }
let pass = 0, fail = 0
const out = []
const check = (n, c, d = '') => { c ? pass++ : fail++; out.push(`${c ? 'PASS' : 'FAIL'}  ${n}${c ? '' : '  -> ' + d}`) }
async function req(method, path, body, headers = {}) {
  const res = await fetch(BASE + path, { method, headers: { 'Content-Type': 'application/json', ...headers }, body: body ? JSON.stringify(body) : undefined })
  return { status: res.status, data: await res.json().catch(() => null) }
}

// A real JPEG (from the repo's demo photos) stands in for a rendered A5 sheet
const jpeg = 'data:image/jpeg;base64,' + fs.readFileSync('public/demo-photos/1.jpg').toString('base64')

let r = await req('GET', '/api/print/status')
check('No printer configured → airprint mode', r.data.mode === 'airprint' && r.data.configured === false, JSON.stringify(r.data))
if (r.data.configured) { console.log('ABORT: server already has a printer configured — refusing to risk printing on a real printer'); process.exit(2) }

r = await req('POST', '/api/print/config', { uri: 'ipp://127.0.0.1:18631/ipp/print' }, LAN)
check('Guest station cannot change printer', r.status === 403, r.status)

r = await req('POST', '/api/print/config', { uri: 'ipp://127.0.0.1:18631/ipp/print' })
check('Staff configures printer (Get-Printer-Attributes works)', r.status === 200 && /\(mock\)/.test(r.data.printer.model), JSON.stringify(r.data))
if (r.status !== 200 || !/\(mock\)/.test(r.data.printer.model)) { console.log('ABORT: fake printer not configured'); process.exit(2) }

r = await req('GET', '/api/print/status')
check('Status: network mode, A5 supported, ink levels', r.data.mode === 'network' && r.data.printer.supportsA5 && r.data.printer.ink.length === 4, JSON.stringify(r.data))

// Tickets: ₹99 (2 strips) paid
r = await req('POST', '/api/tickets/issue', { planType: 99, paymentMethod: 'UPI', paymentStatus: 'PAID' })
const t99 = r.data.ticket
r = await req('POST', '/api/tickets/issue', { planType: 169, paymentMethod: 'CASH' })
const tUnpaid = r.data.ticket

r = await req('POST', '/api/print/job', { ticketId: t99.id, stripCount: 2, sheets: [jpeg] }, LAN)
check('₹99 ticket prints its 2 strips from the iPad', r.status === 200 && r.data.jobs.length === 1, JSON.stringify(r.data))

r = await req('POST', '/api/print/job', { ticketId: t99.id, stripCount: 2, sheets: [jpeg] }, LAN)
check('Second print of same ticket blocked (reprint needs staff)', r.status === 403 && r.data.code === 'REPRINT_NEEDS_STAFF', JSON.stringify(r.data))

r = await req('POST', '/api/print/job', { ticketId: t99.id, stripCount: 2, sheets: [jpeg] }, { ...LAN, 'X-Staff-Pin': PIN })
check('Reprint allowed with staff PIN', r.status === 200, JSON.stringify(r.data))

r = await req('POST', '/api/print/job', { ticketId: tUnpaid.id, stripCount: 2, sheets: [jpeg] }, LAN)
check('Unpaid cash ticket cannot print', r.status === 402, JSON.stringify(r.data))

r = await req('POST', '/api/tickets/issue', { planType: 169, paymentMethod: 'UPI', paymentStatus: 'PAID' })
const t169 = r.data.ticket
r = await req('POST', '/api/print/job', { ticketId: t169.id, stripCount: 6, sheets: [jpeg, jpeg, jpeg] }, LAN)
check('₹169 ticket cannot print 6 strips (over plan)', r.status === 403 && r.data.code === 'OVER_PLAN', JSON.stringify(r.data))

r = await req('POST', '/api/print/job', { ticketId: t169.id, stripCount: 4, sheets: [jpeg, jpeg] }, LAN)
check('₹169 ticket prints 4 strips on 2 sheets as ONE multi-page PDF job', r.status === 200 && r.data.format === 'application/pdf' && r.data.jobs.length === 1, JSON.stringify(r.data))

r = await req('POST', '/api/print/job', { stripCount: 2, sheets: [jpeg] }, LAN)
check('No-ticket print from guest station refused', r.status === 403, r.status)

r = await req('POST', '/api/print/job', { ticketId: t99.id, stripCount: 2, sheets: ['data:image/png;base64,AAAA'] }, LAN)
check('Non-JPEG sheet rejected', r.status === 400, r.status)

r = await req('POST', '/api/print/job', { ticketId: t99.id, stripCount: 999, sheets: [jpeg] }, LAN)
check('Absurd stripCount rejected', r.status === 400, r.status)

r = await req('POST', '/api/print/job', { ticketId: '../x', stripCount: 2, sheets: [jpeg] }, LAN)
check('Bad ticketId rejected', r.status === 400, r.status)

console.log(out.join('\n'))
console.log(`\n${pass} passed, ${fail} failed`)

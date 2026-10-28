// Fake AirPrint/IPP printer for tests. Logs every request; saves received documents.
import http from 'http'
import fs from 'fs'

const PORT = Number(process.env.IPP_PORT || 18631)
const OUT = process.env.OUT_DIR || '.'
const FORMATS = (process.env.FORMATS || 'image/jpeg,application/pdf,image/urf').split(',')
let jobId = 100

function parse(buf) {
  const version = buf.readUInt16BE(0), op = buf.readUInt16BE(2), reqId = buf.readUInt32BE(4)
  let i = 8, attrs = {}, group = 0, last = ''
  while (i < buf.length) {
    const tag = buf[i++]
    if (tag === 0x03) break
    if (tag < 0x10) { group = tag; continue }
    const nl = buf.readUInt16BE(i); i += 2
    const name = buf.toString('utf8', i, i + nl); i += nl
    const vl = buf.readUInt16BE(i); i += 2
    const raw = buf.subarray(i, i + vl); i += vl
    const key = `${group}:${name || last}`; last = name || last
    const val = (tag === 0x21 || tag === 0x23) ? raw.readInt32BE(0) : raw.toString('utf8')
    ;(attrs[key] ||= []).push(val)
  }
  return { version, op, reqId, attrs, data: buf.subarray(i) }
}

function attr(tag, name, value) {
  const n = Buffer.from(name), v = typeof value === 'number' ? (() => { const b = Buffer.alloc(4); b.writeInt32BE(value); return b })() : Buffer.from(value)
  const h = Buffer.alloc(5 + n.length); h[0] = tag; h.writeUInt16BE(n.length, 1); n.copy(h, 3); h.writeUInt16BE(v.length, 3 + n.length)
  return Buffer.concat([h, v])
}
function multi(tag, name, values) { return Buffer.concat(values.map((v, i) => attr(tag, i ? '' : name, v))) }

function response(reqId, status, printerGroup) {
  const head = Buffer.alloc(8); head.writeUInt16BE(0x0101, 0); head.writeUInt16BE(status, 2); head.writeUInt32BE(reqId, 4)
  return Buffer.concat([head, Buffer.from([0x01]), attr(0x47, 'attributes-charset', 'utf-8'), attr(0x48, 'attributes-natural-language', 'en'),
    ...(printerGroup ? [Buffer.from([printerGroup.tag]), printerGroup.body] : []), Buffer.from([0x03])])
}

http.createServer((req, res) => {
  const chunks = []
  req.on('data', c => chunks.push(c))
  req.on('end', () => {
    if (req.method !== 'POST') { res.writeHead(200); return res.end('CUPS-like') }
    const r = parse(Buffer.concat(chunks))
    const log = { path: req.url, ctype: req.headers['content-type'], version: r.version.toString(16), op: r.op, attrs: r.attrs, dataBytes: r.data.length }
    console.log(JSON.stringify(log))
    res.writeHead(200, { 'Content-Type': 'application/ipp' })
    if (r.op === 0x000b) {
      const body = Buffer.concat([
        attr(0x41, 'printer-make-and-model', 'EPSON L3150 Series (mock)'),
        attr(0x42, 'printer-name', 'EPSON-L3150'),
        attr(0x23, 'printer-state', 3),
        attr(0x44, 'printer-state-reasons', 'none'),
        multi(0x49, 'document-format-supported', FORMATS),
        multi(0x44, 'media-supported', ['iso_a4_210x297mm', 'iso_a5_148x210mm']),
        multi(0x42, 'marker-names', ['Black', 'Cyan', 'Magenta', 'Yellow']),
        multi(0x21, 'marker-levels', [80, 45, 60, 12]),
        multi(0x44, 'pwg-raster-document-type-supported', ['sgray_8']),
        (() => { const n = Buffer.from('pwg-raster-document-resolution-supported'); const h = Buffer.alloc(5 + n.length); h[0] = 0x32; h.writeUInt16BE(n.length, 1); n.copy(h, 3); h.writeUInt16BE(9, 3 + n.length); const v = Buffer.alloc(9); v.writeInt32BE(600, 0); v.writeInt32BE(600, 4); v[8] = 3; return Buffer.concat([h, v]) })(),
      ])
      return res.end(response(r.reqId, 0, { tag: 0x04, body }))
    }
    if (r.op === 0x0002) {
      const fmt = r.attrs['1:document-format']?.[0] || 'x'
      fs.writeFileSync(`${OUT}/job-${jobId}.${fmt.includes('pdf') ? 'pdf' : fmt.includes('pwg') ? 'pwg' : 'jpg'}`, r.data)
      return res.end(response(r.reqId, 0, { tag: 0x02, body: attr(0x21, 'job-id', jobId++) }))
    }
    res.end(response(r.reqId, 0x0501))
  })
}).listen(PORT, () => console.log('mock ipp on ' + PORT))

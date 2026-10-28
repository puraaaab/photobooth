/**
 * Network printing over IPP — the same protocol AirPrint uses, so any printer the iPad can AirPrint to
 * can also be driven from here, over the same Wi-Fi, without the iOS print dialog (where guests could
 * change the copy count). No driver, no extra device: the server just talks HTTP to printer:631.
 */
import * as fs from 'fs'
import * as path from 'path'
import sharp from 'sharp'
import { getAllLocalSubnetPrefixes } from './network'

// ─── Minimal IPP/1.1 encoder & decoder (RFC 8010) ────────────────────────────
const TAG = {
  operation: 0x01, job: 0x02, end: 0x03, printer: 0x04,
  integer: 0x21, boolean: 0x22, enum: 0x23,
  keyword: 0x44, uri: 0x45, charset: 0x47, language: 0x48, mime: 0x49, name: 0x42, text: 0x41,
} as const

const OP = { printJob: 0x0002, getPrinterAttributes: 0x000b } as const

type IppValue = { tag: number; value: string | number | boolean }
type IppAttr = [name: string, ...values: IppValue[]]

function encodeValue(v: IppValue): Buffer {
  if (v.tag === TAG.integer || v.tag === TAG.enum) {
    const b = Buffer.alloc(4); b.writeInt32BE(Number(v.value)); return b
  }
  if (v.tag === TAG.boolean) return Buffer.from([v.value ? 1 : 0])
  return Buffer.from(String(v.value), 'utf-8')
}

function encodeRequest(op: number, requestId: number, groups: Array<[number, IppAttr[]]>, data?: Buffer): Buffer {
  const parts: Buffer[] = []
  const head = Buffer.alloc(8)
  head.writeUInt16BE(0x0101, 0) // IPP/1.1 — the widest-supported version
  head.writeUInt16BE(op, 2)
  head.writeUInt32BE(requestId, 4)
  parts.push(head)
  for (const [groupTag, attrs] of groups) {
    parts.push(Buffer.from([groupTag]))
    for (const [name, ...values] of attrs) {
      values.forEach((v, i) => {
        const nameBuf = Buffer.from(i === 0 ? name : '', 'utf-8') // additional values use an empty name
        const valBuf = encodeValue(v)
        const h = Buffer.alloc(1 + 2 + nameBuf.length + 2)
        h.writeUInt8(v.tag, 0)
        h.writeUInt16BE(nameBuf.length, 1)
        nameBuf.copy(h, 3)
        h.writeUInt16BE(valBuf.length, 3 + nameBuf.length)
        parts.push(h, valBuf)
      })
    }
  }
  parts.push(Buffer.from([TAG.end]))
  if (data) parts.push(data)
  return Buffer.concat(parts)
}

export interface IppResponse {
  statusCode: number
  attributes: Record<string, Array<string | number | boolean>>
}

export function decodeResponse(buf: Buffer): IppResponse {
  if (buf.length < 8) throw new Error('IPP response too short')
  const statusCode = buf.readUInt16BE(2)
  const attributes: IppResponse['attributes'] = {}
  let i = 8
  let lastName = ''
  while (i < buf.length) {
    const tag = buf[i++]
    if (tag === TAG.end) break
    if (tag < 0x10) continue // group delimiter
    if (i + 2 > buf.length) break
    const nameLen = buf.readUInt16BE(i); i += 2
    const name = buf.toString('utf-8', i, i + nameLen); i += nameLen
    const valLen = buf.readUInt16BE(i); i += 2
    const raw = buf.subarray(i, i + valLen); i += valLen
    const key = name || lastName
    lastName = key
    let value: string | number | boolean
    if ((tag === TAG.integer || tag === TAG.enum) && valLen === 4) value = raw.readInt32BE(0)
    else if (tag === TAG.boolean) value = raw[0] === 1
    else if (tag === 0x32 && valLen === 9) value = `${raw.readInt32BE(0)}x${raw.readInt32BE(4)}` // resolution
    else if (tag >= 0x40) value = raw.toString('utf-8')
    else continue // ranges, resolutions, collections: not needed here
    ;(attributes[key] ||= []).push(value)
  }
  return { statusCode, attributes }
}

async function ippCall(uri: string, body: Buffer, timeoutMs: number): Promise<IppResponse> {
  const httpUrl = uri.replace(/^ipp:\/\//, 'http://')
  const res = await fetch(httpUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/ipp' },
    body: new Uint8Array(body),
    signal: AbortSignal.timeout(timeoutMs),
  })
  if (!res.ok) throw new Error(`Printer HTTP ${res.status}`)
  return decodeResponse(Buffer.from(await res.arrayBuffer()))
}

function baseOperationAttrs(uri: string): IppAttr[] {
  return [
    ['attributes-charset', { tag: TAG.charset, value: 'utf-8' }],
    ['attributes-natural-language', { tag: TAG.language, value: 'en' }],
    ['printer-uri', { tag: TAG.uri, value: uri }],
    ['requesting-user-name', { tag: TAG.name, value: 'photobooth' }],
  ]
}

let requestCounter = 1

// ─── Printer info ────────────────────────────────────────────────────────────
export interface PrinterInfo {
  uri: string
  host: string
  makeAndModel?: string
  name?: string
  state?: 'idle' | 'printing' | 'stopped' | 'unknown'
  stateReasons: string[]
  formats: string[]
  media: string[]
  ink: Array<{ name: string; level: number; color?: string }>
  pwgTypes: string[]        // e.g. srgb_8, sgray_8
  pwgResolutions: number[]  // dpi values (square resolutions only)
  colorModes: string[]
}

const STATE_NAMES: Record<number, PrinterInfo['state']> = { 3: 'idle', 4: 'printing', 5: 'stopped' }

export async function getPrinterInfo(uri: string, timeoutMs = 2500): Promise<PrinterInfo> {
  const body = encodeRequest(OP.getPrinterAttributes, requestCounter++, [[TAG.operation, [
    ...baseOperationAttrs(uri),
    ['requested-attributes',
      { tag: TAG.keyword, value: 'printer-make-and-model' }, { tag: TAG.keyword, value: 'printer-name' },
      { tag: TAG.keyword, value: 'printer-state' }, { tag: TAG.keyword, value: 'printer-state-reasons' },
      { tag: TAG.keyword, value: 'document-format-supported' }, { tag: TAG.keyword, value: 'media-supported' },
      { tag: TAG.keyword, value: 'marker-names' }, { tag: TAG.keyword, value: 'marker-levels' },
      { tag: TAG.keyword, value: 'marker-colors' },
      { tag: TAG.keyword, value: 'pwg-raster-document-type-supported' },
      { tag: TAG.keyword, value: 'pwg-raster-document-resolution-supported' },
      { tag: TAG.keyword, value: 'print-color-mode-supported' }],
  ]]])
  const r = await ippCall(uri, body, timeoutMs)
  if (r.statusCode >= 0x0400) throw new Error(`Printer refused attribute query (0x${r.statusCode.toString(16)})`)
  const a = r.attributes
  const names = (a['marker-names'] || []).map(String)
  const levels = (a['marker-levels'] || []).map(Number)
  const colors = (a['marker-colors'] || []).map(String)
  return {
    uri,
    host: new URL(uri.replace(/^ipp:/, 'http:')).hostname,
    makeAndModel: a['printer-make-and-model']?.[0] as string | undefined,
    name: a['printer-name']?.[0] as string | undefined,
    state: STATE_NAMES[Number(a['printer-state']?.[0])] ?? 'unknown',
    stateReasons: (a['printer-state-reasons'] || []).map(String).filter(s => s !== 'none'),
    formats: (a['document-format-supported'] || []).map(String),
    media: (a['media-supported'] || []).map(String),
    ink: names.map((name, i) => ({ name, level: levels[i] ?? -1, color: colors[i] })),
    pwgTypes: (a['pwg-raster-document-type-supported'] || []).map(String),
    pwgResolutions: (a['pwg-raster-document-resolution-supported'] || [])
      .map(String).map(r => r.split('x').map(Number)).filter(([x, y]) => x === y && x > 0).map(([x]) => x),
    colorModes: (a['print-color-mode-supported'] || []).map(String),
  }
}

// ─── Minimal PDF wrapper for JPEG pages (for printers that accept PDF but not JPEG) ─
function jpegSize(jpeg: Buffer): { w: number; h: number } {
  let i = 2
  while (i < jpeg.length) {
    if (jpeg[i] !== 0xff) { i++; continue }
    const marker = jpeg[i + 1]
    const len = jpeg.readUInt16BE(i + 2)
    if (marker >= 0xc0 && marker <= 0xcf && ![0xc4, 0xc8, 0xcc].includes(marker)) {
      return { h: jpeg.readUInt16BE(i + 5), w: jpeg.readUInt16BE(i + 7) }
    }
    i += 2 + len
  }
  throw new Error('Not a baseline JPEG')
}

/** One page per JPEG, each page exactly A5 (420 × 595 pt), image stretched to the page. */
export function jpegsToA5Pdf(jpegs: Buffer[]): Buffer {
  const W = 419.53, H = 595.28
  const objects: Buffer[] = []
  const add = (b: Buffer | string) => { objects.push(Buffer.isBuffer(b) ? b : Buffer.from(b, 'latin1')); return objects.length }
  const pageIds: number[] = []
  const pagesId = 2
  add('<< /Type /Catalog /Pages 2 0 R >>')
  add('') // placeholder for Pages, filled below
  for (const jpg of jpegs) {
    const { w, h } = jpegSize(jpg)
    const imgId = add(Buffer.concat([
      Buffer.from(`<< /Type /XObject /Subtype /Image /Width ${w} /Height ${h} /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ${jpg.length} >>\nstream\n`, 'latin1'),
      jpg, Buffer.from('\nendstream', 'latin1'),
    ]))
    const content = `q ${W} 0 0 ${H} 0 0 cm /Im0 Do Q`
    const contentId = add(`<< /Length ${content.length} >>\nstream\n${content}\nendstream`)
    pageIds.push(add(`<< /Type /Page /Parent ${pagesId} 0 R /MediaBox [0 0 ${W} ${H}] /Resources << /XObject << /Im0 ${imgId} 0 R >> >> /Contents ${contentId} 0 R >>`))
  }
  objects[pagesId - 1] = Buffer.from(`<< /Type /Pages /Kids [${pageIds.map(id => `${id} 0 R`).join(' ')}] /Count ${pageIds.length} >>`, 'latin1')

  const chunks: Buffer[] = [Buffer.from('%PDF-1.4\n%\xe2\xe3\xcf\xd3\n', 'latin1')]
  const offsets: number[] = []
  let pos = chunks[0].length
  objects.forEach((obj, idx) => {
    offsets.push(pos)
    const piece = Buffer.concat([Buffer.from(`${idx + 1} 0 obj\n`, 'latin1'), obj, Buffer.from('\nendobj\n', 'latin1')])
    chunks.push(piece)
    pos += piece.length
  })
  const xref = ['xref', `0 ${objects.length + 1}`, '0000000000 65535 f ', ...offsets.map(o => `${String(o).padStart(10, '0')} 00000 n `)].join('\n')
  chunks.push(Buffer.from(`${xref}\ntrailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${pos}\n%%EOF\n`, 'latin1'))
  return Buffer.concat(chunks)
}


// ─── PWG raster (PWG 5102.4) — mandatory for IPP Everywhere, so virtually every AirPrint printer ─
// accepts it even when it takes neither JPEG nor PDF (e.g. many Brother/HP lasers and inkjets).
const A5_MM = { w: 148, h: 210 }

function pwgHeader(o: { width: number; height: number; dpi: number; channels: 1 | 3; pages: number }): Buffer {
  const h = Buffer.alloc(1796)
  h.write('PwgRaster', 0, 'ascii')
  h.writeUInt32BE(o.dpi, 276)                                   // HWResolution
  h.writeUInt32BE(o.dpi, 280)
  h.writeUInt32BE(1, 340)                                       // NumCopies
  h.writeUInt32BE(Math.round(A5_MM.w / 25.4 * 72), 352)         // PageSize (points)
  h.writeUInt32BE(Math.round(A5_MM.h / 25.4 * 72), 356)
  h.writeUInt32BE(o.width, 372)                                 // cupsWidth
  h.writeUInt32BE(o.height, 376)                                // cupsHeight
  h.writeUInt32BE(8, 384)                                       // BitsPerColor
  h.writeUInt32BE(8 * o.channels, 388)                          // BitsPerPixel
  h.writeUInt32BE(o.width * o.channels, 392)                    // BytesPerLine
  h.writeUInt32BE(0, 396)                                       // ColorOrder: chunky
  h.writeUInt32BE(o.channels === 3 ? 19 : 18, 400)              // ColorSpace: sRGB / sGray
  h.writeUInt32BE(o.channels, 420)                              // NumColors
  h.writeUInt32BE(o.pages, 452)                                 // TotalPageCount
  h.writeUInt32BE(1, 456)                                       // CrossFeedTransform
  h.writeUInt32BE(1, 460)                                       // FeedTransform
  h.writeUInt32BE(o.width, 472)                                 // ImageBoxRight
  h.writeUInt32BE(o.height, 476)                                // ImageBoxBottom
  h.write('iso_a5_148x210mm', 1732, 'ascii')                    // PageSizeName
  return h
}

/** PWG line compression: line-repeat byte, then pixel runs (0..127 = repeat, 129..255 = literal run). */
export function encodePwgPage(pixels: Buffer, width: number, height: number, channels: number): Buffer {
  const bpl = width * channels
  const out: Buffer[] = []
  const lineBuf = Buffer.alloc(1 + bpl * 2 + Math.ceil(width / 128) + 8)
  const sameLine = (a: number, b: number) => pixels.compare(pixels, b * bpl, (b + 1) * bpl, a * bpl, (a + 1) * bpl) === 0
  const samePx = (a: number, b: number) => {
    for (let c = 0; c < channels; c++) if (pixels[a + c] !== pixels[b + c]) return false
    return true
  }
  let y = 0
  while (y < height) {
    let repeat = 0
    while (repeat < 255 && y + repeat + 1 < height && sameLine(y, y + repeat + 1)) repeat++
    let n = 0
    lineBuf[n++] = repeat
    const row = y * bpl
    let x = 0
    while (x < width) {
      const p = row + x * channels
      let run = 1
      while (run < 128 && x + run < width && samePx(p, p + run * channels)) run++
      if (run > 1 || x + 1 === width) {
        lineBuf[n++] = run - 1
        pixels.copy(lineBuf, n, p, p + channels); n += channels
        x += run
      } else {
        let lit = 1
        while (lit < 128 && x + lit < width && !(x + lit + 1 < width && samePx(p + lit * channels, p + (lit + 1) * channels))) lit++
        if (lit === 1) {
          lineBuf[n++] = 0
          pixels.copy(lineBuf, n, p, p + channels); n += channels
        } else {
          lineBuf[n++] = 257 - lit
          pixels.copy(lineBuf, n, p, p + lit * channels); n += lit * channels
        }
        x += lit
      }
    }
    out.push(Buffer.from(lineBuf.subarray(0, n)))
    y += repeat + 1
  }
  return Buffer.concat(out)
}

export async function jpegsToPwgRaster(jpegs: Buffer[], info: Pick<PrinterInfo, 'pwgTypes' | 'pwgResolutions'>): Promise<Buffer> {
  const color = info.pwgTypes.includes('srgb_8') || info.pwgTypes.includes('rgb_8')
  if (!color && !info.pwgTypes.includes('sgray_8')) {
    throw new Error(`Printer PWG raster types unsupported: ${info.pwgTypes.join(', ') || 'none listed'}`)
  }
  // Prefer 300 dpi (sheets are rendered at 300 dpi); otherwise the lowest the printer offers
  const dpis = [...info.pwgResolutions].sort((a, b) => a - b)
  const dpi = dpis.includes(300) ? 300 : (dpis.find(d => d >= 300) ?? dpis[0] ?? 300)
  const width = Math.round(A5_MM.w / 25.4 * dpi)
  const height = Math.round(A5_MM.h / 25.4 * dpi)
  const channels: 1 | 3 = color ? 3 : 1
  const parts: Buffer[] = [Buffer.from('RaS2', 'ascii')]
  for (const jpg of jpegs) {
    let img = sharp(jpg).rotate().resize(width, height, { fit: 'fill' }).flatten({ background: '#ffffff' })
    img = color ? img.toColourspace('srgb') : img.grayscale()
    const raw = await img.raw().toBuffer({ resolveWithObject: true })
    if (raw.info.channels !== channels) throw new Error('Unexpected channel count from image decoder')
    parts.push(pwgHeader({ width, height, dpi, channels, pages: jpegs.length }), encodePwgPage(raw.data, width, height, channels))
  }
  return Buffer.concat(parts)
}

// ─── Print job ───────────────────────────────────────────────────────────────
const A5_MEDIA = 'iso_a5_148x210mm'

export async function printSheets(info: PrinterInfo, jpegs: Buffer[], jobName: string): Promise<{ jobs: number[]; format: string }> {
  const supportsJpeg = info.formats.includes('image/jpeg')
  const supportsPdf = info.formats.includes('application/pdf')
  const supportsPwg = info.formats.includes('image/pwg-raster') && info.pwgTypes.length > 0
  if (!supportsJpeg && !supportsPdf && !supportsPwg) {
    throw new Error(`Printer accepts only ${info.formats.join(', ') || 'unknown formats'} — needs JPEG, PDF or PWG raster`)
  }
  const jobAttrs = (withMedia: boolean): IppAttr[] => [
    ['copies', { tag: TAG.integer, value: 1 }],   // copies are decided by the server, never the guest
    ['print-scaling', { tag: TAG.keyword, value: 'fill' }],
    ...(withMedia && info.media.includes(A5_MEDIA) ? [['media', { tag: TAG.keyword, value: A5_MEDIA }] as IppAttr] : []),
  ]

  // Preference: PDF (one multi-page job) → JPEG (one job per sheet) → PWG raster (one multi-page job).
  const documents = supportsPdf && (!supportsJpeg || jpegs.length > 1)
    ? [{ format: 'application/pdf', data: jpegsToA5Pdf(jpegs) }]
    : supportsJpeg
      ? jpegs.map(data => ({ format: 'image/jpeg', data }))
      : [{ format: 'image/pwg-raster', data: await jpegsToPwgRaster(jpegs, info) }]

  const jobs: number[] = []
  for (const [idx, doc] of documents.entries()) {
    const send = async (withJobAttrs: boolean) => ippCall(info.uri, encodeRequest(OP.printJob, requestCounter++, [
      [TAG.operation, [
        ...baseOperationAttrs(info.uri),
        ['job-name', { tag: TAG.name, value: documents.length > 1 ? `${jobName} (${idx + 1}/${documents.length})` : jobName }],
        ['document-format', { tag: TAG.mime, value: doc.format }],
      ]],
      ...(withJobAttrs ? [[TAG.job, jobAttrs(true)] as [number, IppAttr[]]] : []),
    ], doc.data), 60_000)

    let r = await send(true)
    // Some printers reject optional job attributes outright — retry with defaults
    if (r.statusCode === 0x040b || r.statusCode === 0x0400) r = await send(false)
    if (r.statusCode >= 0x0400) throw new Error(`Printer rejected the job (IPP status 0x${r.statusCode.toString(16)})`)
    const jobId = Number(r.attributes['job-id']?.[0] ?? 0)
    jobs.push(jobId)
  }
  return { jobs, format: documents[0].format }
}

// ─── Discovery & persisted config ────────────────────────────────────────────
const IPP_PATHS = ['/ipp/print', '/ipp', '/ipp/printer']

export async function probeHost(host: string, timeoutMs = 700): Promise<PrinterInfo | null> {
  for (const p of IPP_PATHS) {
    try {
      return await getPrinterInfo(`ipp://${host}:631${p}`, timeoutMs)
    } catch {}
  }
  return null
}

/** Scans the laptop's /24 subnet(s) for IPP printers (same approach as the Pi camera discovery). */
export async function discoverPrinters(): Promise<PrinterInfo[]> {
  const found: PrinterInfo[] = []
  for (const prefix of getAllLocalSubnetPrefixes()) {
    const hosts = Array.from({ length: 254 }, (_, i) => `${prefix}.${i + 1}`)
    for (let i = 0; i < hosts.length; i += 48) {
      const batch = await Promise.all(hosts.slice(i, i + 48).map(async h => {
        // Fast pre-check: is anything listening on 631?
        try {
          await fetch(`http://${h}:631/`, { signal: AbortSignal.timeout(400) })
        } catch (e: any) {
          if (e?.name === 'TimeoutError' || e?.cause?.code === 'ECONNREFUSED' || e?.cause?.code === 'EHOSTUNREACH') return null
        }
        return probeHost(h, 1500)
      }))
      found.push(...batch.filter((p): p is PrinterInfo => Boolean(p)))
    }
  }
  return found
}

export interface PrinterConfig { uri: string; makeAndModel?: string; savedAt: string }

export function loadPrinterConfig(dataDir: string): PrinterConfig | null {
  try {
    const cfg = JSON.parse(fs.readFileSync(path.join(dataDir, 'printer.json'), 'utf-8'))
    return typeof cfg?.uri === 'string' && /^ipp:\/\/[a-zA-Z0-9.-]+(:\d+)?\/[\w/.-]*$/.test(cfg.uri) ? cfg : null
  } catch {
    return null
  }
}

export function savePrinterConfig(dataDir: string, cfg: PrinterConfig | null): void {
  const file = path.join(dataDir, 'printer.json')
  if (!cfg) { try { fs.unlinkSync(file) } catch {} ; return }
  fs.writeFileSync(file, JSON.stringify(cfg, null, 2), 'utf-8')
}

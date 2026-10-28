// Round-trip check for the PWG raster encoder (server/printer.ts) with an independent decoder.
// Run: npx tsx tests/pwg-raster.test.ts
import * as fs from 'fs'
import sharp from 'sharp'
import { encodePwgPage, jpegsToPwgRaster, jpegsToA5Pdf } from '../server/printer'

function decodePwgPage(data: Buffer, offset: number, width: number, height: number, ch: number): { pixels: Buffer; end: number } {
  const bpl = width * ch
  const out = Buffer.alloc(bpl * height)
  let i = offset
  let y = 0
  while (y < height) {
    const repeat = data[i++]
    const line = Buffer.alloc(bpl)
    let x = 0
    while (x < width) {
      const c = data[i++]
      if (c === 128) { line.fill(255, x * ch); x = width; continue }
      if (c < 128) {
        const px = data.subarray(i, i + ch); i += ch
        for (let k = 0; k <= c; k++) { px.copy(line, (x + k) * ch) }
        x += c + 1
      } else {
        const n = 257 - c
        data.copy(line, x * ch, i, i + n * ch); i += n * ch
        x += n
      }
    }
    if (x !== width) throw new Error(`line ${y} overflow: ${x} != ${width}`)
    for (let r = 0; r <= repeat; r++) line.copy(out, (y + r) * bpl)
    y += repeat + 1
  }
  return { pixels: out, end: i }
}

let failures = 0
const check = (name: string, ok: boolean, detail = '') => {
  if (!ok) failures++
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${ok ? '' : '  -> ' + detail}`)
}

async function main() {
  // 1. Synthetic edge cases: runs of 1, 2, 128, 129 pixels, literal runs, repeated lines
  const w = 300, h = 7, ch = 3
  const px = Buffer.alloc(w * h * ch)
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const v = y < 3 ? (x < 129 ? 10 : x < 131 ? 20 : (x * 37) % 251) : (y === 3 ? (x % 2) * 200 : 99)
    px[(y * w + x) * ch] = v; px[(y * w + x) * ch + 1] = (v * 3) % 256; px[(y * w + x) * ch + 2] = 255 - v
  }
  const enc = encodePwgPage(px, w, h, ch)
  const dec = decodePwgPage(enc, 0, w, h, ch)
  check('synthetic RGB page round-trips exactly', dec.pixels.equals(px) && dec.end === enc.length, `end ${dec.end} vs ${enc.length}`)

  // 2. Real photo through the full pipeline (grayscale 600 dpi like the Brother HL-L2350DW, and sRGB 300 dpi)
  const jpg = fs.readFileSync('public/demo-photos/1.jpg')
  for (const [types, dpi] of [[['sgray_8'], [600]], [['srgb_8', 'sgray_8'], [300, 600]]] as const) {
    const doc = await jpegsToPwgRaster([jpg, jpg], { pwgTypes: [...types], pwgResolutions: [...dpi] })
    const chans = types.includes('srgb_8' as never) ? 3 : 1
    const useDpi = dpi.includes(300 as never) ? 300 : 600
    const W = Math.round(148 / 25.4 * useDpi), H = Math.round(210 / 25.4 * useDpi)
    check(`${types[0]} @${useDpi}dpi: sync word`, doc.toString('ascii', 0, 4) === 'RaS2')
    const hdr = doc.subarray(4, 4 + 1796)
    check(`${types[0]}: header width/height/bpp`, hdr.readUInt32BE(372) === W && hdr.readUInt32BE(376) === H && hdr.readUInt32BE(388) === 8 * chans,
      `${hdr.readUInt32BE(372)}x${hdr.readUInt32BE(376)} bpp ${hdr.readUInt32BE(388)}`)
    const page1 = decodePwgPage(doc, 4 + 1796, W, H, chans)
    let img = sharp(jpg).rotate().resize(W, H, { fit: 'fill' }).flatten({ background: '#ffffff' })
    img = chans === 3 ? img.toColourspace('srgb') : img.grayscale()
    const expected = await img.raw().toBuffer()
    check(`${types[0]}: page 1 pixels exact`, page1.pixels.equals(expected))
    const page2 = decodePwgPage(doc, page1.end + 1796, W, H, chans)
    check(`${types[0]}: 2 pages, stream fully consumed`, page2.end === doc.length, `${page2.end} vs ${doc.length}`)
    console.log(`      size: ${(doc.length / 1e6).toFixed(1)} MB for 2 A5 pages (raw would be ${(W * H * chans * 2 / 1e6).toFixed(0)} MB)`)
  }

  // 3. PDF wrapper is structurally valid
  const pdf = jpegsToA5Pdf([jpg, jpg])
  const text = pdf.toString('latin1')
  const startxref = Number(text.match(/startxref\n(\d+)/)?.[1])
  check('PDF: header, 2 pages, xref offset points at xref', text.startsWith('%PDF-1.4') && /\/Count 2/.test(text) && text.slice(startxref, startxref + 4) === 'xref')

  if (failures) { console.log(`\n${failures} failure(s)`); process.exit(1) }
  console.log('\nall PWG/PDF checks passed')
}
main()

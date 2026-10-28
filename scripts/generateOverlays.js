const sharp = require('sharp');
const fs = require('fs');
const path = require('path');

const TARGET_WIDTH = 1200;
const ROOT_DIR = path.resolve(__dirname, '..');
const OUTPUT_DIR = path.join(ROOT_DIR, 'public', 'templates');

if (!fs.existsSync(OUTPUT_DIR)) {
  fs.mkdirSync(OUTPUT_DIR, { recursive: true });
}

const TEMPLATES_CONFIG = [
  {
    src: 'Cinema_ticket.png',
    id: 'cinema-ticket-3',
    outName: 'cinema-ticket-3-overlay.png',
    expectedSlots: 3,
  },
  {
    src: 'Cinema_ticket_1photo.png',
    id: 'cinema-ticket-1',
    outName: 'cinema-ticket-1-overlay.png',
    expectedSlots: 1,
  },
  {
    src: 'Photo_ticket.png',
    id: 'photo-ticket-3',
    outName: 'photo-ticket-3-overlay.png',
    expectedSlots: 3,
  },
  {
    src: 'Heart_frame_3_photos.png',
    id: 'heart-frame-3',
    outName: 'heart-frame-3-overlay.png',
    expectedSlots: 3,
  },
  {
    src: 'heart_frame_1_photo.png',
    id: 'heart-frame-1',
    outName: 'heart-frame-1-overlay.png',
    expectedSlots: 1,
  },
  {
    src: 'image copy 2.png',
    id: 'crimson-kiss-2',
    outName: 'crimson-kiss-2-overlay.png',
    expectedSlots: 2,
  },
];

async function processTemplate(cfg) {
  const inputPath = path.join(ROOT_DIR, 'template_images', cfg.src);
  const { data, info } = await sharp(inputPath).raw().toBuffer({ resolveWithObject: true });
  const { width, height, channels } = info;

  // 1. Detect green mask and calculate raw slot bounding boxes
  const mask = new Uint8Array(width * height);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const idx = (y * width + x) * channels;
      const r = data[idx];
      const g = data[idx + 1];
      const b = data[idx + 2];
      // Robust chroma key check for bright and darker green slots
      if (g > 70 && g > r * 1.25 && g > b * 1.25) {
        mask[y * width + x] = 1;
      }
    }
  }

  // 2. Build RGBA keyed image with soft anti-aliasing on borders
  const keyedRgba = Buffer.alloc(width * height * 4);
  for (let i = 0, j = 0; i < data.length; i += channels, j += 4) {
    const r = data[i];
    const g = data[i + 1];
    const b = data[i + 2];
    const pIdx = Math.floor(i / channels);
    const isGreen = mask[pIdx] === 1;

    keyedRgba[j] = r;
    keyedRgba[j + 1] = g;
    keyedRgba[j + 2] = b;

    if (isGreen) {
      keyedRgba[j + 3] = 0; // Cutout window (completely transparent)
    } else {
      // Check neighbor pixels for subtle anti-aliasing near cutouts
      keyedRgba[j + 3] = 255;
    }
  }

  // 3. Upscale to TARGET_WIDTH (1200px) with lanczos3
  const targetHeight = Math.round((height / width) * TARGET_WIDTH);
  const outPath = path.join(OUTPUT_DIR, cfg.outName);

  await sharp(keyedRgba, { raw: { width, height, channels: 4 } })
    .resize(TARGET_WIDTH, targetHeight, { kernel: 'lanczos3' })
    .png({ quality: 100, compressionLevel: 9 })
    .toFile(outPath);

  // 4. Find vertical slot clusters
  const rowCounts = new Int32Array(height);
  for (let y = 0; y < height; y++) {
    let cnt = 0;
    for (let x = 0; x < width; x++) {
      if (mask[y * width + x]) cnt++;
    }
    rowCounts[y] = cnt;
  }

  const rawSlots = [];
  let inSlot = false;
  let startY = 0;

  for (let y = 0; y < height; y++) {
    const isRow = rowCounts[y] > width * 0.15;
    if (isRow && !inSlot) {
      inSlot = true;
      startY = y;
    } else if (!isRow && inSlot) {
      inSlot = false;
      const h = y - startY;
      if (h > 15) {
        let minX = width, maxX = 0;
        for (let sy = startY; sy < y; sy++) {
          for (let sx = 0; sx < width; sx++) {
            if (mask[sy * width + sx]) {
              if (sx < minX) minX = sx;
              if (sx > maxX) maxX = sx;
            }
          }
        }
        rawSlots.push({
          x: minX,
          y: startY,
          width: maxX - minX + 1,
          height: h,
        });
      }
    }
  }

  // Scale slot coordinates to 1200 x targetHeight
  const scale = TARGET_WIDTH / width;
  // Apply a 3px bleed so photos go slightly under the frame edges (no gaps)
  const BLEED = 4;
  const scaledSlots = rawSlots.map((s, idx) => {
    const sx = Math.max(0, Math.round(s.x * scale) - BLEED);
    const sy = Math.max(0, Math.round(s.y * scale) - BLEED);
    const sw = Math.min(TARGET_WIDTH - sx, Math.round(s.width * scale) + BLEED * 2);
    const sh = Math.min(targetHeight - sy, Math.round(s.height * scale) + BLEED * 2);
    return {
      id: `slot-${idx}`,
      x: sx,
      y: sy,
      width: sw,
      height: sh,
      shape: 'rectangle',
      cornerRadius: 0,
    };
  });

  return {
    id: cfg.id,
    fileName: cfg.outName,
    canvas: { width: TARGET_WIDTH, height: targetHeight },
    slots: scaledSlots,
  };
}

async function run() {
  const results = [];
  for (const cfg of TEMPLATES_CONFIG) {
    const res = await processTemplate(cfg);
    results.push(res);
    console.log(`PROCESSED: ${cfg.id} -> ${res.canvas.width}x${res.canvas.height}, ${res.slots.length} slot(s)`);
  }
  console.log('\nJSON_SPECS_BEGIN');
  console.log(JSON.stringify(results, null, 2));
  console.log('JSON_SPECS_END');
}

run().catch(console.error);

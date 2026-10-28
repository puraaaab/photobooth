#!/usr/bin/env node

/**
 * ═══════════════════════════════════════════════════════════════════════════════
 * Photobooth Kiosk — Autonomous Sticker Sheet Auto-Cropper & Sorter
 * ═══════════════════════════════════════════════════════════════════════════════
 * Usage:
 *   npm run extract-stickers <path-to-image-or-folder> [category]
 * 
 * Features:
 *   - Auto-detects sheet background (white, light gray checkerboard, solid, or transparent)
 *   - Uses flood-fill + 8-way Connected Component Labeling to find individual stickers
 *   - Preserves white die-cut borders while making the outer sheet transparent
 *   - Automatically trims excess boundary padding
 *   - Saves cleanly organized PNGs into public/stickers/<category>/
 *   - Automatically updates public/stickers/stickers_manifest.json
 */

const fs = require('fs');
const path = require('path');
const sharp = require('sharp');

const STICKERS_BASE = path.resolve(__dirname, '../public/stickers');
const MANIFEST_PATH = path.join(STICKERS_BASE, 'stickers_manifest.json');

const VALID_CATEGORIES = ['pop_culture', 'streetwear', 'retro', 'motorsport', 'music_misc', 'custom'];

async function processSheet(imagePath, targetCategory = 'custom') {
  console.log(`\n📷 Processing Sticker Sheet: ${path.basename(imagePath)}`);
  console.log(`📂 Target Category: ${targetCategory}`);

  const { data, info } = await sharp(imagePath).raw().toBuffer({ resolveWithObject: true });
  const { width, height, channels } = info;

  // 1. Detect background color by sampling perimeter
  const perimeter = [];
  for (let x = 0; x < width; x += 4) {
    perimeter.push(getPixel(data, width, channels, 0, x));
    perimeter.push(getPixel(data, width, channels, height - 1, x));
  }
  for (let y = 0; y < height; y += 4) {
    perimeter.push(getPixel(data, width, channels, y, 0));
    perimeter.push(getPixel(data, width, channels, y, width - 1));
  }

  let avgR = perimeter.reduce((s, p) => s + p[0], 0) / perimeter.length;
  let avgG = perimeter.reduce((s, p) => s + p[1], 0) / perimeter.length;
  let avgB = perimeter.reduce((s, p) => s + p[2], 0) / perimeter.length;
  console.log(`🔍 Detected sheet background: R=${Math.round(avgR)}, G=${Math.round(avgG)}, B=${Math.round(avgB)}`);

  function isBgPixel(y, x) {
    const [r, g, b, a] = getPixel(data, width, channels, y, x);
    if (channels === 4 && a < 20) return true;

    // Checkerboard gray or pure white background
    const isPureWhite = (r >= 244 && g >= 244 && b >= 244);
    const isGrayCheck = (r >= 220 && r <= 245 && Math.abs(r - g) <= 6 && Math.abs(g - b) <= 6);
    const isCloseToAvg = Math.sqrt((r - avgR)**2 + (g - avgG)**2 + (b - avgB)**2) < 20;

    if (avgR > 240) {
      return isPureWhite || isGrayCheck;
    } else {
      return isCloseToAvg || isGrayCheck;
    }
  }

  // 2. Flood-fill from outer perimeter to identify background connected to edges
  const bgMask = new Uint8Array(width * height);
  const queue = new Int32Array(width * height);
  let qHead = 0, qTail = 0;

  for (let x = 0; x < width; x++) {
    queue[qTail++] = (0 * width + x);
    queue[qTail++] = ((height - 1) * width + x);
  }
  for (let y = 0; y < height; y++) {
    queue[qTail++] = (y * width + 0);
    queue[qTail++] = (y * width + (width - 1));
  }

  while (qHead < qTail) {
    const curr = queue[qHead++];
    if (bgMask[curr] !== 0) continue;
    const cy = Math.floor(curr / width);
    const cx = curr % width;

    if (isBgPixel(cy, cx)) {
      bgMask[curr] = 1;
      if (cx > 0 && bgMask[curr - 1] === 0) queue[qTail++] = curr - 1;
      if (cx < width - 1 && bgMask[curr + 1] === 0) queue[qTail++] = curr + 1;
      if (cy > 0 && bgMask[curr - width] === 0) queue[qTail++] = curr - width;
      if (cy < height - 1 && bgMask[curr + width] === 0) queue[qTail++] = curr + width;
    }
  }

  // 3. Connected Component Analysis on foreground (bgMask === 0)
  const labels = new Int32Array(width * height).fill(0);
  let labelCount = 0;
  const components = [];

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const idx = y * width + x;
      if (bgMask[idx] === 0 && labels[idx] === 0) {
        labelCount++;
        labels[idx] = labelCount;
        const cQ = [idx];
        let h = 0;
        let minX = x, maxX = x, minY = y, maxY = y;
        let pCount = 0;

        while (h < cQ.length) {
          const c = cQ[h++];
          pCount++;
          const py = Math.floor(c / width);
          const px = c % width;
          if (px < minX) minX = px;
          if (px > maxX) maxX = px;
          if (py < minY) minY = py;
          if (py > maxY) maxY = py;

          for (let dy = -1; dy <= 1; dy++) {
            const ny = py + dy;
            if (ny < 0 || ny >= height) continue;
            for (let dx = -1; dx <= 1; dx++) {
              if (dx === 0 && dy === 0) continue;
              const nx = px + dx;
              if (nx < 0 || nx >= width) continue;
              const nIdx = ny * width + nx;
              if (bgMask[nIdx] === 0 && labels[nIdx] === 0) {
                labels[nIdx] = labelCount;
                cQ.push(nIdx);
              }
            }
          }
        }

        const compW = maxX - minX + 1;
        const compH = maxY - minY + 1;
        // Ignore tiny specs / dust (< 350 pixels)
        if (pCount >= 350 && compW >= 24 && compH >= 24) {
          components.push({
            minX, maxX, minY, maxY,
            width: compW,
            height: compH,
            pixelCount: pCount
          });
        }
      }
    }
  }

  // 4. Merge only intimate fragments (e.g. laces/accents within 5px)
  const finalStickers = [];
  const mergedSet = new Set();

  for (let i = 0; i < components.length; i++) {
    if (mergedSet.has(i)) continue;
    let box = { ...components[i] };
    mergedSet.add(i);

    let changed = true;
    while (changed) {
      changed = false;
      for (let j = 0; j < components.length; j++) {
        if (mergedSet.has(j)) continue;
        const other = components[j];

        const xOverlap = !(box.maxX + 4 < other.minX || other.maxX + 4 < box.minX);
        const yOverlap = !(box.maxY + 4 < other.minY || other.maxY + 4 < box.minY);

        if (xOverlap && yOverlap) {
          box.minX = Math.min(box.minX, other.minX);
          box.maxX = Math.max(box.maxX, other.maxX);
          box.minY = Math.min(box.minY, other.minY);
          box.maxY = Math.max(box.maxY, other.maxY);
          box.width = box.maxX - box.minX + 1;
          box.height = box.maxY - box.minY + 1;
          box.pixelCount += other.pixelCount;
          mergedSet.add(j);
          changed = true;
        }
      }
    }
    finalStickers.push(box);
  }

  console.log(`✨ Found ${finalStickers.length} isolated stickers in sheet.`);

  // 5. Output directory
  const catDir = path.join(STICKERS_BASE, targetCategory);
  if (!fs.existsSync(catDir)) fs.mkdirSync(catDir, { recursive: true });

  // Read existing manifest
  let manifest = [];
  if (fs.existsSync(MANIFEST_PATH)) {
    try {
      manifest = JSON.parse(fs.readFileSync(MANIFEST_PATH, 'utf8'));
    } catch {
      manifest = [];
    }
  }

  const basePrefix = path.basename(imagePath, path.extname(imagePath))
    .toLowerCase()
    .replace(/[^a-z0-9_-]/g, '_');

  let extractedCount = 0;

  for (let i = 0; i < finalStickers.length; i++) {
    const s = finalStickers[i];
    const pad = 4;
    const cropX = Math.max(0, s.minX - pad);
    const cropY = Math.max(0, s.minY - pad);
    const cropW = Math.min(width - cropX, s.width + pad * 2);
    const cropH = Math.min(height - cropY, s.height + pad * 2);

    const buffer = Buffer.alloc(cropW * cropH * 4);

    for (let y = 0; y < cropH; y++) {
      for (let x = 0; x < cropW; x++) {
        const srcX = cropX + x;
        const srcY = cropY + y;
        const destIdx = (y * cropW + x) * 4;
        const isBackground = bgMask[srcY * width + srcX] === 1;

        if (isBackground) {
          buffer[destIdx] = 0;
          buffer[destIdx + 1] = 0;
          buffer[destIdx + 2] = 0;
          buffer[destIdx + 3] = 0;
        } else {
          const [r, g, b, a] = getPixel(data, width, channels, srcY, srcX);
          buffer[destIdx] = r;
          buffer[destIdx + 1] = g;
          buffer[destIdx + 2] = b;
          buffer[destIdx + 3] = a;
        }
      }
    }

    const stickerId = `${basePrefix}_${String(i + 1).padStart(2, '0')}`;
    const filename = `${stickerId}.png`;
    const outPath = path.join(catDir, filename);

    await sharp(buffer, {
      raw: { width: cropW, height: cropH, channels: 4 }
    })
    .trim()
    .png({ compressionLevel: 9 })
    .toFile(outPath);

    const meta = await sharp(outPath).metadata();
    const relUrl = `/stickers/${targetCategory}/${filename}`;

    // Add or update in manifest
    const existingIdx = manifest.findIndex(m => m.id === stickerId);
    const itemData = {
      id: stickerId,
      name: `${formatName(basePrefix)} #${i + 1}`,
      category: targetCategory,
      tags: [targetCategory, basePrefix],
      url: relUrl,
      width: meta.width,
      height: meta.height,
      aspectRatio: Number((meta.width / meta.height).toFixed(3))
    };

    if (existingIdx !== -1) {
      manifest[existingIdx] = itemData;
    } else {
      manifest.push(itemData);
    }

    extractedCount++;
    console.log(`  ✔ [${i + 1}/${finalStickers.length}] Saved: ${filename} (${meta.width}x${meta.height} px)`);
  }

  // Write updated manifest
  fs.writeFileSync(MANIFEST_PATH, JSON.stringify(manifest, null, 2), 'utf8');
  console.log(`\n🎉 Extracted ${extractedCount} stickers into ${catDir}`);
  console.log(`📄 Manifest updated at: ${MANIFEST_PATH} (Total: ${manifest.length} stickers)`);
}

function getPixel(data, width, channels, y, x) {
  const idx = (y * width + x) * channels;
  return [data[idx], data[idx + 1], data[idx + 2], channels === 4 ? data[idx + 3] : 255];
}

function formatName(str) {
  return str
    .split(/[_-]+/)
    .map(w => w.charAt(0).toUpperCase() + w.slice(1))
    .join(' ');
}

// CLI Execution
async function main() {
  const args = process.argv.slice(2);
  if (args.length === 0) {
    console.log(`
Usage:
  npm run extract-stickers <image-file-or-folder> [category]

Categories available:
  - pop_culture
  - streetwear
  - retro
  - motorsport
  - music_misc
  - custom (default)

Example:
  npm run extract-stickers ./my-stickers-sheet.png streetwear
  npm run extract-stickers ./all-sheets-folder/ retro
    `);
    process.exit(0);
  }

  const targetPath = path.resolve(process.cwd(), args[0]);
  const category = args[1] && VALID_CATEGORIES.includes(args[1]) ? args[1] : 'custom';

  if (!fs.existsSync(targetPath)) {
    console.error(`❌ Error: Path not found: ${targetPath}`);
    process.exit(1);
  }

  const stat = fs.statSync(targetPath);
  if (stat.isDirectory()) {
    const files = fs.readdirSync(targetPath).filter(f => /\.(png|jpe?g|webp)$/i.test(f));
    console.log(`📁 Scanning folder: found ${files.length} image sheets.`);
    for (const file of files) {
      await processSheet(path.join(targetPath, file), category);
    }
  } else {
    await processSheet(targetPath, category);
  }
}

main().catch(err => {
  console.error('Extraction failed:', err);
  process.exit(1);
});

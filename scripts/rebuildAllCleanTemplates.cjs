const sharp = require('sharp');
const fs = require('fs');
const path = require('path');
const { detectStripCrops, isGreenPixel } = require('./cleanAllTemplates.cjs');

const ROOT_DIR = path.resolve(__dirname, '..');
const INPUT_DIR = path.join(ROOT_DIR, 'template_images');
const OUTPUT_DIR = path.join(ROOT_DIR, 'public', 'templates');
const THUMBS_DIR = path.join(OUTPUT_DIR, 'thumbs');
const TARGET_WIDTH = 1200;
const BLEED = 4;

if (!fs.existsSync(OUTPUT_DIR)) fs.mkdirSync(OUTPUT_DIR, { recursive: true });
if (!fs.existsSync(THUMBS_DIR)) fs.mkdirSync(THUMBS_DIR, { recursive: true });

function generateCleanId(filename, stripIndex, totalStrips) {
  let base = path.basename(filename, path.extname(filename))
    .toLowerCase()
    .replace(/[^a-z0-9_-]/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '');

  if (base.length > 28) {
    base = base.slice(0, 28).replace(/-$/, '');
  }

  if (totalStrips > 1) {
    return `custom-${base}-part${stripIndex + 1}`;
  }
  return `custom-${base}`;
}

function generateCleanName(filename, stripIndex, totalStrips, slotCount) {
  let base = path.basename(filename, path.extname(filename))
    .replace(/[-_]/g, ' ')
    .replace(/\b\w/g, c => c.toUpperCase())
    .trim();

  if (/^[0-9a-fA-F]{8}/.test(base)) {
    base = `Studio Strip ${base.slice(0, 6).toUpperCase()}`;
  }

  if (totalStrips > 1) {
    return `${base} (Strip ${stripIndex + 1} · ${slotCount}-Shot)`;
  }
  return `${base} (${slotCount}-Shot)`;
}

// Detect photo slots in a cropped, background-free strip
function detectSlotsInStrip(data, width, height, channels) {
  const slotMask = new Uint8Array(width * height);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const idx = (y * width + x) * channels;
      const r = data[idx];
      const g = data[idx + 1];
      const b = data[idx + 2];
      const a = channels === 4 ? data[idx + 3] : 255;

      if (a < 30 || isGreenPixel(r, g, b)) {
        slotMask[y * width + x] = 1;
      }
    }
  }

  // Row counts
  const rowCounts = new Int32Array(height);
  for (let y = 0; y < height; y++) {
    let cnt = 0;
    for (let x = 0; x < width; x++) {
      if (slotMask[y * width + x]) cnt++;
    }
    rowCounts[y] = cnt;
  }

  const minSlotRowPixels = width * 0.20;
  const rawSlots = [];
  let inSlot = false;
  let startY = 0;

  for (let y = 0; y < height; y++) {
    const isSlotRow = rowCounts[y] > minSlotRowPixels;
    if (isSlotRow && !inSlot) {
      inSlot = true;
      startY = y;
    } else if (!isSlotRow && inSlot) {
      inSlot = false;
      const slotH = y - startY;
      if (slotH > height * 0.04) {
        let minX = width, maxX = 0;
        for (let sy = startY; sy < y; sy++) {
          for (let sx = 0; sx < width; sx++) {
            if (slotMask[sy * width + sx]) {
              if (sx < minX) minX = sx;
              if (sx > maxX) maxX = sx;
            }
          }
        }
        const slotW = maxX - minX + 1;
        if (slotW > width * 0.20) {
          rawSlots.push({
            x: minX,
            y: startY,
            width: slotW,
            height: slotH,
          });
        }
      }
    }
  }

  // Handle slot that extends all the way to the bottom edge
  if (inSlot) {
    const slotH = height - startY;
    if (slotH > height * 0.04) {
      let minX = width, maxX = 0;
      for (let sy = startY; sy < height; sy++) {
        for (let sx = 0; sx < width; sx++) {
          if (slotMask[sy * width + sx]) {
            if (sx < minX) minX = sx;
            if (sx > maxX) maxX = sx;
          }
        }
      }
      const slotW = maxX - minX + 1;
      if (slotW > width * 0.20) {
        rawSlots.push({
          x: minX,
          y: startY,
          width: slotW,
          height: slotH,
        });
      }
    }
  }

  // Fallback if 0 slots detected
  if (rawSlots.length === 0) {
    const count = 4;
    const outerM = 48;
    const gap = 32;
    const slotW = width - outerM * 2;
    const availableH = height - outerM * 2 - (count - 1) * gap;
    const slotH = Math.floor(availableH / count);
    for (let i = 0; i < count; i++) {
      rawSlots.push({
        x: outerM,
        y: outerM + i * (slotH + gap),
        width: slotW,
        height: slotH,
      });
    }
  }

  return { rawSlots, slotMask };
}

async function rebuildAll() {
  const files = fs.readdirSync(INPUT_DIR).filter(f => {
    const stat = fs.statSync(path.join(INPUT_DIR, f));
    return stat.isFile() && !f.endsWith('.lnk') && /\.(png|jpg|jpeg|webp)$/i.test(f);
  });

  console.log(`Rebuilding clean background-free templates from ${files.length} images in template_images/...`);

  const createdTemplates = [];

  for (let fIdx = 0; fIdx < files.length; fIdx++) {
    const file = files[fIdx];
    const filePath = path.join(INPUT_DIR, file);

    try {
      const { data, info } = await sharp(filePath).raw().toBuffer({ resolveWithObject: true });
      const crops = await detectStripCrops(data, info.width, info.height, info.channels);

      for (let sIdx = 0; sIdx < crops.length; sIdx++) {
        const crop = crops[sIdx];
        if (crop.width < 40 || crop.height < 80) continue;

        // 1. Crop strip from source image (removes all surrounding background)
        const croppedBuffer = await sharp(filePath)
          .extract({ left: crop.left, top: crop.top, width: crop.width, height: crop.height })
          .toBuffer();

        // 2. Scale to standard 1200px width (capped at 4200px height)
        let targetH = Math.round((crop.height / crop.width) * TARGET_WIDTH);
        if (targetH > 4200) targetH = 4200;
        if (targetH < 800) targetH = 800;

        const scaled = await sharp(croppedBuffer)
          .resize(TARGET_WIDTH, targetH, { kernel: 'lanczos3' })
          .raw()
          .toBuffer({ resolveWithObject: true });

        const sData = scaled.data;
        const sW = scaled.info.width;
        const sH = scaled.info.height;
        const sChannels = scaled.info.channels;

        // 3. Detect photo slots inside the clean strip
        const { rawSlots, slotMask } = detectSlotsInStrip(sData, sW, sH, sChannels);

        const templateId = generateCleanId(file, sIdx, crops.length);
        const outOverlayFileName = `${templateId}-overlay.png`;
        const outOverlayPath = path.join(OUTPUT_DIR, outOverlayFileName);
        const outThumbFileName = `${templateId}-overlay-thumb.webp`;
        const outThumbPath = path.join(THUMBS_DIR, outThumbFileName);

        // 4. Build transparent cutout overlay RGBA
        const overlayRgba = Buffer.alloc(sW * sH * 4);
        for (let y = 0; y < sH; y++) {
          for (let x = 0; x < sW; x++) {
            const srcIdx = (y * sW + x) * sChannels;
            const destIdx = (y * sW + x) * 4;

            const r = sData[srcIdx];
            const g = sData[srcIdx + 1];
            const b = sData[srcIdx + 2];
            const a = sChannels === 4 ? sData[srcIdx + 3] : 255;

            overlayRgba[destIdx] = r;
            overlayRgba[destIdx + 1] = g;
            overlayRgba[destIdx + 2] = b;

            // Check if pixel is in slot aperture
            let isInsideSlot = false;
            for (const slot of rawSlots) {
              if (
                x >= slot.x &&
                x < slot.x + slot.width &&
                y >= slot.y &&
                y < slot.y + slot.height
              ) {
                const inInnerX = x >= slot.x + 6 && x <= slot.x + slot.width - 6;
                const inInnerY = y >= slot.y + 6 && y <= slot.y + slot.height - 6;
                if (a < 30 || isGreenPixel(r, g, b) || (inInnerX && inInnerY && slotMask[y * sW + x])) {
                  isInsideSlot = true;
                  break;
                }
              }
            }

            if (isInsideSlot || isGreenPixel(r, g, b)) {
              overlayRgba[destIdx + 3] = 0; // Cutout aperture for photos
            } else {
              overlayRgba[destIdx + 3] = 255; // Crisp opaque artwork & frame
            }
          }
        }

        // Save full overlay PNG (compressed)
        await sharp(overlayRgba, { raw: { width: sW, height: sH, channels: 4 } })
          .png({ compressionLevel: 9, palette: true })
          .toFile(outOverlayPath);

        // Save fast WebP thumbnail (~15KB)
        await sharp(overlayRgba, { raw: { width: sW, height: sH, channels: 4 } })
          .resize(260, null, { fit: 'inside' })
          .webp({ quality: 80, effort: 4 })
          .toFile(outThumbPath);

        // 5. Format photo slots with bleed
        const scaledPhotoSlots = rawSlots.map((s, idx) => ({
          id: `slot-${idx}`,
          x: Math.max(0, s.x - BLEED),
          y: Math.max(0, s.y - BLEED),
          width: Math.min(sW - Math.max(0, s.x - BLEED), s.width + BLEED * 2),
          height: Math.min(sH - Math.max(0, s.y - BLEED), s.height + BLEED * 2),
          shape: 'rectangle',
          cornerRadius: 0,
        }));

        const templateName = generateCleanName(file, sIdx, crops.length, scaledPhotoSlots.length);

        createdTemplates.push({
          id: templateId,
          name: templateName,
          category: 'custom',
          supportedPhotoCounts: [scaledPhotoSlots.length],
          supportedOrientations: ['vertical'],
          canvas: { width: sW, height: sH },
          overlayImageUrl: `/templates/${outOverlayFileName}`,
          thumbnailUrl: `/templates/thumbs/${outThumbFileName}`,
          background: { type: 'solid', color: '#FAF5EC' },
          border: { type: 'none' },
          spacing: { outerMargin: 0, photoSpacing: 20, padding: 0 },
          photoSlots: scaledPhotoSlots,
          textElements: [],
        });

        console.log(`  ✓ [${createdTemplates.length}] ${templateId} (crop: ${crop.width}x${crop.height} -> canvas: ${sW}x${sH}, ${scaledPhotoSlots.length} shots) -> ${templateName}`);
      }
    } catch (err) {
      console.error(`  ✗ Error processing ${file}:`, err.message);
    }
  }

  console.log(`\nWriting updated batchGeneratedTemplates.ts with ${createdTemplates.length} clean templates...`);
  const tsContent = `import type { Template } from '@/types'\n\n/**\n * Auto-extracted templates from template_images/ with background removed\n * Total templates: ${createdTemplates.length}\n */\nexport const BATCH_GENERATED_TEMPLATES: Template[] = ${JSON.stringify(createdTemplates, null, 2)}\n`;

  const tsPath = path.join(ROOT_DIR, 'src', 'templates', 'batchGeneratedTemplates.ts');
  fs.writeFileSync(tsPath, tsContent, 'utf-8');
  console.log(`Done! Saved ${createdTemplates.length} clean templates to ${tsPath}`);
}

rebuildAll().catch(console.error);

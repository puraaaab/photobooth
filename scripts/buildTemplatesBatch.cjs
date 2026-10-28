const fs = require('fs');
const path = require('path');
const sharp = require('sharp');
const ROOT_DIR = path.resolve(__dirname, '..');
const {
  findHorizontalStripSegments,
  findVerticalBounds,
  detectSlots,
  isGreenPixel,
  getCornerBg,
  TARGET_WIDTH,
  INPUT_DIR,
  OUTPUT_DIR,
} = require('./extractAllTemplates.cjs');

// BLEED: expansion in pixels so photos extend slightly under the cutout frame border
const BLEED = 4;

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

  // If it's a UUID, give it a neat friendly title
  if (/^[0-9a-fA-F]{8}/.test(base)) {
    base = `Studio Strip ${base.slice(0, 6).toUpperCase()}`;
  }

  if (totalStrips > 1) {
    return `${base} (Strip ${stripIndex + 1} · ${slotCount}-Shot)`;
  }
  return `${base} (${slotCount}-Shot)`;
}

async function processAll() {
  const files = fs.readdirSync(INPUT_DIR).filter(f => {
    const stat = fs.statSync(path.join(INPUT_DIR, f));
    return stat.isFile() && !f.endsWith('.lnk') && /\.(png|jpg|jpeg|webp)$/i.test(f);
  });

  console.log(`Starting extraction of ${files.length} template image files...`);

  const createdTemplates = [];

  for (let fIdx = 0; fIdx < files.length; fIdx++) {
    const file = files[fIdx];
    const filePath = path.join(INPUT_DIR, file);

    try {
      const { data, info } = await sharp(filePath).raw().toBuffer({ resolveWithObject: true });
      const bg = getCornerBg(data, info.width, info.height, info.channels);
      const hSpans = findHorizontalStripSegments(data, info.width, info.height, info.channels, bg);

      for (let sIdx = 0; sIdx < hSpans.length; sIdx++) {
        const span = hSpans[sIdx];
        const vBounds = findVerticalBounds(data, info.width, info.height, info.channels, span.startX, span.endX, bg);

        const cropW = span.endX - span.startX + 1;
        const cropH = vBounds.maxY - vBounds.minY + 1;

        if (cropW < 40 || cropH < 80) continue;

        // 1. Crop strip from source image
        const croppedBuffer = await sharp(filePath)
          .extract({ left: span.startX, top: vBounds.minY, width: cropW, height: cropH })
          .toBuffer();

        // 2. Scale to TARGET_WIDTH (1200px)
        const targetH = Math.round((cropH / cropW) * TARGET_WIDTH);
        if (targetH > 5600 || targetH < 700) continue;

        const scaled = await sharp(croppedBuffer)
          .resize(TARGET_WIDTH, targetH, { kernel: 'lanczos3' })
          .raw()
          .toBuffer({ resolveWithObject: true });

        const sData = scaled.data;
        const sW = scaled.info.width;
        const sH = scaled.info.height;
        const sChannels = scaled.info.channels;

        // 3. Detect slots
        const { rawSlots, slotMask } = detectSlots(sData, sW, sH, sChannels);

        // Fallback slots if detection found 0 slots
        let finalSlots = rawSlots;
        if (finalSlots.length === 0) {
          // Default to 4 slots with 48px outer margin
          const count = 4;
          const outerM = 48;
          const gap = 32;
          const slotW = sW - outerM * 2;
          const availableH = sH - outerM * 2 - (count - 1) * gap;
          const slotH = Math.floor(availableH / count);
          finalSlots = [];
          for (let i = 0; i < count; i++) {
            finalSlots.push({
              x: outerM,
              y: outerM + i * (slotH + gap),
              width: slotW,
              height: slotH,
            });
          }
        }

        const templateId = generateCleanId(file, sIdx, hSpans.length);
        const outOverlayFileName = `${templateId}-overlay.png`;
        const outOverlayPath = path.join(OUTPUT_DIR, outOverlayFileName);

        // 4. Build RGBA cutout overlay buffer
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

            // Check if this pixel is inside any detected slot AND (green OR transparent OR within slot core)
            let isInsideSlot = false;
            for (const slot of finalSlots) {
              if (
                x >= slot.x &&
                x < slot.x + slot.width &&
                y >= slot.y &&
                y < slot.y + slot.height
              ) {
                // If it's green or transparent, or in the inner 85% of the slot
                const inInnerX = x >= slot.x + 8 && x <= slot.x + slot.width - 8;
                const inInnerY = y >= slot.y + 8 && y <= slot.y + slot.height - 8;
                if (a < 30 || isGreenPixel(r, g, b) || (inInnerX && inInnerY && slotMask[y * sW + x])) {
                  isInsideSlot = true;
                  break;
                }
              }
            }

            if (isInsideSlot || isGreenPixel(r, g, b)) {
              overlayRgba[destIdx + 3] = 0; // Transparent aperture
            } else {
              overlayRgba[destIdx + 3] = 255; // Opaque decorative frame
            }
          }
        }

        // Save overlay PNG
        await sharp(overlayRgba, { raw: { width: sW, height: sH, channels: 4 } })
          .png({ compressionLevel: 8 })
          .toFile(outOverlayPath);

        // 5. Format photo slots with bleed
        const scaledPhotoSlots = finalSlots.map((s, idx) => ({
          id: `slot-${idx}`,
          x: Math.max(0, s.x - BLEED),
          y: Math.max(0, s.y - BLEED),
          width: Math.min(sW - Math.max(0, s.x - BLEED), s.width + BLEED * 2),
          height: Math.min(sH - Math.max(0, s.y - BLEED), s.height + BLEED * 2),
          shape: 'rectangle',
          cornerRadius: 0,
        }));

        const templateName = generateCleanName(file, sIdx, hSpans.length, scaledPhotoSlots.length);

        createdTemplates.push({
          id: templateId,
          name: templateName,
          category: 'custom',
          supportedPhotoCounts: [scaledPhotoSlots.length],
          supportedOrientations: ['vertical'],
          canvas: { width: sW, height: sH },
          overlayImageUrl: `/templates/${outOverlayFileName}`,
          thumbnailUrl: `/templates/thumbs/${outOverlayFileName.replace(/\.png$/i, '-thumb.webp')}`,
          background: { type: 'solid', color: '#FAF5EC' },
          border: { type: 'none' },
          spacing: { outerMargin: 0, photoSpacing: 20, padding: 0 },
          photoSlots: scaledPhotoSlots,
          textElements: [],
        });

        console.log(`  ✓ [${createdTemplates.length}] ${templateId} (${sW}x${sH}, ${scaledPhotoSlots.length} shots) -> ${templateName}`);
      }
    } catch (err) {
      console.error(`  ✗ Error processing ${file}:`, err.message);
    }
  }

  console.log(`\nSuccessfully processed ${createdTemplates.length} templates! Writing TypeScript definitions...`);

  // Write TypeScript file
  const tsContent = `import type { Template } from '@/types'\n\n/**\n * Auto-extracted templates from template_images/\n * Total templates: ${createdTemplates.length}\n */\nexport const BATCH_GENERATED_TEMPLATES: Template[] = ${JSON.stringify(createdTemplates, null, 2)}\n`;

  const tsPath = path.join(ROOT_DIR, 'src', 'templates', 'batchGeneratedTemplates.ts');
  fs.writeFileSync(tsPath, tsContent, 'utf-8');
  console.log(`Saved definitions to ${tsPath}`);
}

processAll().catch(console.error);

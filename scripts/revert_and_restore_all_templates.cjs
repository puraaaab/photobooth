const sharp = require('sharp');
const fs = require('fs');
const path = require('path');

const ROOT_DIR = path.resolve(__dirname, '..');
const RB_DIR = path.join(ROOT_DIR, 'template_images', 'removed_backgrounds');
const TI_DIR = path.join(ROOT_DIR, 'template_images');
const TEMPLATES_DIR = path.join(ROOT_DIR, 'public', 'templates');
const THUMBS_DIR = path.join(TEMPLATES_DIR, 'thumbs');
const BATCH_TS = path.join(ROOT_DIR, 'src', 'templates', 'batchGeneratedTemplates.ts');

function isGreen(r, g, b) {
  return (g > 110 && g > r * 1.2 && g > b * 1.2) ||
         (g > 140 && r < 120 && b < 120) ||
         (g > 95 && r < 80 && b < 80);
}

// Templates that have custom tailored fixes from previous user feedback
const PRESERVED_IDS = new Set([
  'custom-rb-awb4ye_subject-1',       // Velvet Crimson Slanted Strip (3-Shot)
  'custom-rb-heart_frame_1_photo',    // Sweetheart Solo Polaroid (1-Shot)
  'custom-rb-heart_frame_3_photos',   // Sweetheart Romance Frame (3-Shot)
  'template-img-cinema_ticket',        // Retro Cinema Ticket (3-Shot)
  'template-img-cinema_ticket_1photo', // Retro Cinema Ticket Solo (1-Shot)
  'template-img-bad8ac94-4871-452b-bd09', // Silver Slate Aesthetic Strip (3-Shot) #2
  'template-img-d549ed68-af43-4cd1-a6a8', // Silver Slate Aesthetic Strip (3-Shot) #4
  'template-img-download-25',         // Pearl Minimal Vintage Camera (1-Shot)
  'template-img-2c58d6f6-11f4-4664-916f', // Silver Slate Aesthetic Strip (4-Shot)
  'template-img-1443a760-2e64-410f-879e', // Silver Slate Aesthetic Strip (3-Shot)
  'template-img-4a41de25-7340-4960-9da3', // Deep Indigo Aesthetic Strip (3-Shot)
  'template-img-a1f9cab2-cad2-4924-a290', // Pearl Minimal Vintage Polaroid (1-Shot)
  'template-img-b9974b13-22f5-4c49-a17a'  // Sweet Pink Strawberry Shortcake Strip (3-Shot)
]);

async function run() {
  console.log('=== STARTING COMPLETE REVERT & PROPER BACKGROUND REMOVAL ===\n');

  // Load batchGeneratedTemplates.ts
  const tsContent = fs.readFileSync(BATCH_TS, 'utf8');
  const startIdx = tsContent.search(/\[\s*\{/);
  const endIdx = tsContent.lastIndexOf(']');
  const templates = JSON.parse(tsContent.substring(startIdx, endIdx + 1));
  console.log(`Loaded ${templates.length} templates from batchGeneratedTemplates.ts`);

  // 1. Process all custom-rb templates from template_images/removed_backgrounds/
  const rbFiles = fs.readdirSync(RB_DIR).filter(f => f.endsWith('.png'));
  console.log(`Found ${rbFiles.length} original files in removed_backgrounds/...`);

  let restoredRbCount = 0;
  for (const f of rbFiles) {
    let rawBase = path.basename(f, path.extname(f))
      .toLowerCase()
      .replace(/[^a-z0-9_-]/g, '-')
      .replace(/-+/g, '-')
      .replace(/^-|-$/g, '');
    if (rawBase.length > 24) rawBase = rawBase.slice(0, 24).replace(/-$/, '');
    const templateId = `custom-rb-${rawBase}`;

    if (PRESERVED_IDS.has(templateId)) {
      console.log(`Skipping preserved template: ${templateId}`);
      continue;
    }

    const t = templates.find(item => item.id === templateId);
    if (!t) continue;

    const filePath = path.join(RB_DIR, f);
    const { data: origData, info: origInfo } = await sharp(filePath).raw().toBuffer({ resolveWithObject: true });
    const { width: origW, height: origH, channels } = origInfo;

    const scale = 1200 / origW;
    let targetH = Math.round(origH * scale);
    if (targetH > 4200) targetH = 4200;
    if (targetH < 800) targetH = 800;

    const scaled = await sharp(filePath)
      .resize(1200, targetH, { kernel: 'lanczos3' })
      .raw()
      .toBuffer({ resolveWithObject: true });

    const sData = scaled.data;
    const sW = scaled.info.width;
    const sH = scaled.info.height;
    const sChannels = scaled.info.channels;

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

        // ONLY existing transparent background or green screen photo slots are transparent!
        // ZERO WHITE PAPER IS REMOVED!
        if (a < 30 || isGreen(r, g, b)) {
          overlayRgba[destIdx + 3] = 0;
        } else {
          // Despill green fringe on edges if any
          if (g > 110 && g > r && g > b) {
            overlayRgba[destIdx + 1] = Math.round((r + b) / 2);
          }
          overlayRgba[destIdx + 3] = a;
        }
      }
    }

    const outOverlayPath = path.join(TEMPLATES_DIR, `${templateId}-overlay.png`);
    const outThumbPath = path.join(THUMBS_DIR, `${templateId}-overlay-thumb.webp`);

    await sharp(overlayRgba, { raw: { width: sW, height: sH, channels: 4 } })
      .png()
      .toFile(outOverlayPath);

    await sharp(outOverlayPath).resize(300).webp({ quality: 85 }).toFile(outThumbPath);

    t.canvas = { width: sW, height: sH };
    t.background = { type: 'solid', color: 'transparent' };
    restoredRbCount++;
  }
  console.log(`Successfully restored ${restoredRbCount} custom-rb templates with 100% white paper intact!\n`);

  // 2. Process stripped template-img JPGs
  const strippedJpgs = [
    { id: 'template-img-07400719-6a19-4b27-9f41', file: '07400719-6a19-4b27-9f41-6c71c4e5db42.jpg' },
    { id: 'template-img-1e58e926-2967-4363-b108', file: '1e58e926-2967-4363-b108-4f6e51b77a65.jpg' },
    { id: 'template-img-3282e81d-6869-403b-854e', file: '3282e81d-6869-403b-854e-37bf89514b17.jpg' },
    { id: 'template-img-32f28a0d-5a8b-4acf-bcaf', file: '32f28a0d-5a8b-4acf-bcaf-e8fe40c4ba95.jpg' },
    { id: 'template-img-386d528e-49be-44f4-8772', file: '386d528e-49be-44f4-8772-cd45cf9725c3.jpg' },
    { id: 'template-img-e0fd4bf0-a89d-461e-835a', file: 'e0fd4bf0-a89d-461e-835a-cadf8642dedc.jpg' }
  ];

  for (const item of strippedJpgs) {
    const filePath = path.join(TI_DIR, item.file);
    if (!fs.existsSync(filePath)) continue;

    const { data, info } = await sharp(filePath).raw().toBuffer({ resolveWithObject: true });
    const { width: w, height: h } = info;

    // Detect strip bounds: in all these JPGs, the background is neutral grey (220-230, |r-g|<=2, |r-b|<=2)
    let minX = w, maxX = 0, minY = h, maxY = 0;
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const idx = (y * w + x) * 3;
        const r = data[idx], g = data[idx+1], b = data[idx+2];
        const isNeutralGrey = Math.abs(r - 225) <= 10 && Math.abs(g - 225) <= 10 && Math.abs(b - 225) <= 10 && Math.abs(r - g) <= 2 && Math.abs(r - b) <= 2;
        if (!isNeutralGrey) {
          if (x < minX) minX = x;
          if (x > maxX) maxX = x;
          if (y < minY) minY = y;
          if (y > maxY) maxY = y;
        }
      }
    }

    if (minX >= maxX || minY >= maxY) continue;

    const cropW = maxX - minX + 1;
    const cropH = maxY - minY + 1;
    const scale = 1200 / cropW;
    const targetH = Math.round(cropH * scale);

    const outData = Buffer.alloc(cropW * cropH * 4);
    const slotMask = new Uint8Array(cropW * cropH);

    for (let y = minY; y <= maxY; y++) {
      for (let x = minX; x <= maxX; x++) {
        const srcIdx = (y * w + x) * 3;
        const dstX = x - minX;
        const dstY = y - minY;
        const dstIdx = (dstY * cropW + dstX) * 4;
        const r = data[srcIdx], g = data[srcIdx+1], b = data[srcIdx+2];

        const isNeutralGrey = Math.abs(r - 225) <= 10 && Math.abs(g - 225) <= 10 && Math.abs(b - 225) <= 10 && Math.abs(r - g) <= 2 && Math.abs(r - b) <= 2;
        const green = isGreen(r, g, b);

        if (isNeutralGrey) {
          outData[dstIdx+3] = 0;
        } else if (green) {
          outData[dstIdx+3] = 0;
          slotMask[dstY * cropW + dstX] = 1;
        } else {
          // KEEP WHITE PAPER INTACT!
          outData[dstIdx] = r;
          outData[dstIdx+1] = g;
          outData[dstIdx+2] = b;
          outData[dstIdx+3] = 255;
        }
      }
    }

    const outOverlayPath = path.join(TEMPLATES_DIR, `${item.id}-overlay.png`);
    const outThumbPath = path.join(THUMBS_DIR, `${item.id}-overlay-thumb.webp`);

    await sharp(outData, { raw: { width: cropW, height: cropH, channels: 4 } })
      .resize(1200, targetH)
      .png()
      .toFile(outOverlayPath);

    await sharp(outOverlayPath).resize(300).webp({ quality: 85 }).toFile(outThumbPath);

    // Update slots in batchGeneratedTemplates.ts
    const yHisto = new Array(cropH).fill(0);
    for (let y = 0; y < cropH; y++) {
      for (let x = 0; x < cropW; x++) {
        if (slotMask[y * cropW + x]) yHisto[y]++;
      }
    }

    const spans = [];
    let inSpan = false, sY = 0;
    for (let y = 0; y < cropH; y++) {
      if (yHisto[y] > 40) {
        if (!inSpan) { inSpan = true; sY = y; }
      } else {
        if (inSpan) {
          inSpan = false;
          if (y - 1 - sY >= 25) spans.push({ sY, eY: y - 1 });
        }
      }
    }
    if (inSpan && (cropH - 1 - sY >= 25)) spans.push({ sY, eY: cropH - 1 });

    const slots = spans.map((span, idx) => {
      let minSX = cropW, maxSX = 0;
      for (let y = span.sY; y <= span.eY; y++) {
        for (let x = 0; x < cropW; x++) {
          if (slotMask[y * cropW + x]) {
            if (x < minSX) minSX = x;
            if (x > maxSX) maxSX = x;
          }
        }
      }
      return {
        id: `slot-${idx}`,
        x: Math.round(minSX * scale),
        y: Math.round(span.sY * scale),
        width: Math.round((maxSX - minSX + 1) * scale),
        height: Math.round((span.eY - span.sY + 1) * scale),
        rotation: 0,
        shape: 'rectangle',
        cornerRadius: 0
      };
    });

    const t = templates.find(x => x.id === item.id);
    if (t) {
      t.canvas = { width: 1200, height: targetH };
      t.photoSlots = slots;
      t.background = { type: 'solid', color: 'transparent' };
      console.log(`Restored stripped JPG ${item.id}: canvas: 1200x${targetH}, slots: ${slots.length}`);
    }
  }

  // Also check transparent PNGs in template_images/ (template_09_love_snoopy_ & template_11_pink_denim_g)
  for (const pngName of ['template_09_love_snoopy_green_transparent.png', 'template_11_pink_denim_green_transparent.png']) {
    const filePath = path.join(TI_DIR, pngName);
    if (!fs.existsSync(filePath)) continue;
    const baseId = pngName.replace('_green_transparent.png', '');
    const templateId = `template-img-${baseId}`;
    const t = templates.find(x => x.id.startsWith(templateId));
    if (!t) continue;

    const { data, info } = await sharp(filePath).raw().toBuffer({ resolveWithObject: true });
    const { width: origW, height: origH, channels } = info;
    const scale = 1200 / origW;
    const targetH = Math.round(origH * scale);

    const scaled = await sharp(filePath)
      .resize(1200, targetH)
      .raw()
      .toBuffer({ resolveWithObject: true });

    const sData = scaled.data;
    const outData = Buffer.alloc(1200 * targetH * 4);

    for (let i = 0; i < 1200 * targetH; i++) {
      const r = sData[i * channels];
      const g = sData[i * channels + 1];
      const b = sData[i * channels + 2];
      const a = channels === 4 ? sData[i * channels + 3] : 255;

      outData[i * 4] = r;
      outData[i * 4 + 1] = g;
      outData[i * 4 + 2] = b;

      if (a < 30 || isGreen(r, g, b)) {
        outData[i * 4 + 3] = 0;
      } else {
        outData[i * 4 + 3] = a;
      }
    }

    const outOverlayPath = path.join(TEMPLATES_DIR, `${t.id}-overlay.png`);
    const outThumbPath = path.join(THUMBS_DIR, `${t.id}-overlay-thumb.webp`);

    await sharp(outData, { raw: { width: 1200, height: targetH, channels: 4 } })
      .png()
      .toFile(outOverlayPath);

    await sharp(outOverlayPath).resize(300).webp({ quality: 85 }).toFile(outThumbPath);
    console.log(`Restored transparent PNG ${t.id}`);
  }

  // Save updated batchGeneratedTemplates.ts
  const newTsContent = `import type { Template } from '@/types'\n\n/**\n * Auto-extracted photobooth templates with pixel-accurate slots and clean cutouts\n * Total templates: ${templates.length}\n */\nexport const BATCH_GENERATED_TEMPLATES: Template[] = ${JSON.stringify(templates, null, 2)}\n`;
  fs.writeFileSync(BATCH_TS, newTsContent, 'utf8');
  console.log(`\nSuccessfully wrote updated ${BATCH_TS}!`);
  console.log('=== COMPLETE REVERT & RESTORATION COMPLETED SUCCESSFULLY ===');
}

run().catch(err => {
  console.error('Error during restoration:', err);
  process.exit(1);
});

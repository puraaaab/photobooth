const sharp = require('sharp');
const fs = require('fs');
const path = require('path');

const ROOT_DIR = path.resolve(__dirname, '..');
const TEMPLATES_DIR = path.join(ROOT_DIR, 'public', 'templates');
const THUMBS_DIR = path.join(TEMPLATES_DIR, 'thumbs');
const BATCH_TS = path.join(ROOT_DIR, 'src', 'templates', 'batchGeneratedTemplates.ts');

function isGreen(r, g, b) {
  return (g > 130 && g > r * 1.25 && g > b * 1.25) || (g > 160 && r < 100 && b < 100);
}

async function run() {
  console.log('=== STARTING PRECISION FIXES ===\n');

  // Load batch templates
  let tsContent = fs.readFileSync(BATCH_TS, 'utf8');
  const startIdx = tsContent.search(/\[\s*\{/);
  const endIdx = tsContent.lastIndexOf(']');
  const templates = JSON.parse(tsContent.substring(startIdx, endIdx + 1));
  console.log(`Loaded ${templates.length} templates from batchGeneratedTemplates.ts`);

  function updateTemplate(id, updater) {
    const t = templates.find(item => item.id === id);
    if (!t) {
      console.warn(`Template ${id} not found!`);
      return;
    }
    updater(t);
    console.log(`Updated template ${id}: ${t.name}, canvas: ${t.canvas.width}x${t.canvas.height}, slots: ${t.photoSlots.length}`);
  }

  // -------------------------------------------------------------
  // 1. Retro Cinema Ticket (3-Shot) - template-img-cinema_ticket
  // -------------------------------------------------------------
  {
    console.log('\n--- 1. Fixing Retro Cinema Ticket (3-Shot) ---');
    const img = sharp(path.join(ROOT_DIR, 'template_images', 'Cinema_ticket.png'));
    const { data, info } = await img.raw().toBuffer({ resolveWithObject: true });
    const w = info.width, h = info.height;

    const outData = Buffer.alloc(w * h * 4);
    const slotsMask = new Uint8Array(w * h);

    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const srcIdx = (y * w + x) * 3;
        const dstIdx = (y * w + x) * 4;
        const r = data[srcIdx], g = data[srcIdx+1], b = data[srcIdx+2];

        const isDarkShadow = (r < 100 && g < 100 && b < 100);
        const isOuterBg = (x < 60 || x > 320 || y < 42 || y > 970);
        const green = isGreen(r, g, b);

        if (isOuterBg || isDarkShadow) {
          outData[dstIdx+3] = 0;
        } else if (green) {
          outData[dstIdx+3] = 0;
          slotsMask[y * w + x] = 1;
        } else {
          outData[dstIdx] = r;
          outData[dstIdx+1] = g;
          outData[dstIdx+2] = b;
          outData[dstIdx+3] = 255;
        }
      }
    }

    const minX = 60, maxX = 320, minY = 42, maxY = 970;
    const cropW = maxX - minX + 1;
    const cropH = maxY - minY + 1;
    const scale = 1200 / cropW;
    const targetH = Math.round(cropH * scale);

    const outPath = path.join(TEMPLATES_DIR, 'template-img-cinema_ticket-overlay.png');
    const thumbPath = path.join(THUMBS_DIR, 'template-img-cinema_ticket-overlay-thumb.webp');

    await sharp(outData, { raw: { width: w, height: h, channels: 4 } })
      .extract({ left: minX, top: minY, width: cropW, height: cropH })
      .resize(1200, targetH)
      .png()
      .toFile(outPath);

    await sharp(outPath).resize(300).webp({ quality: 85 }).toFile(thumbPath);

    // 3 slots
    const ySlots = [
      { startY: 253, endY: 411 },
      { startY: 428, endY: 586 },
      { startY: 603, endY: 761 }
    ];
    const scaledSlots = ySlots.map((ys, idx) => {
      let sMinX = w, sMaxX = 0;
      for (let y = ys.startY; y <= ys.endY; y++) {
        for (let x = minX; x <= maxX; x++) {
          if (slotsMask[y * w + x]) {
            if (x < sMinX) sMinX = x;
            if (x > sMaxX) sMaxX = x;
          }
        }
      }
      return {
        id: `slot-${idx}`,
        x: Math.round((sMinX - minX) * scale),
        y: Math.round((ys.startY - minY) * scale),
        width: Math.round((sMaxX - sMinX + 1) * scale),
        height: Math.round((ys.endY - ys.startY + 1) * scale),
        rotation: 0,
        shape: 'rectangle',
        cornerRadius: 0
      };
    });

    updateTemplate('template-img-cinema_ticket', t => {
      t.canvas = { width: 1200, height: targetH };
      t.photoSlots = scaledSlots;
      t.background = { type: 'solid', color: 'transparent' };
    });
  }

  // -------------------------------------------------------------
  // 2. Retro Cinema Ticket Solo (1-Shot) - template-img-cinema_ticket_1photo
  // -------------------------------------------------------------
  {
    console.log('\n--- 2. Fixing Retro Cinema Ticket Solo (1-Shot) ---');
    const img = sharp(path.join(ROOT_DIR, 'template_images', 'Cinema_ticket_1photo.png'));
    const { data, info } = await img.raw().toBuffer({ resolveWithObject: true });
    const w = info.width, h = info.height;

    const outData = Buffer.alloc(w * h * 4);
    const slotsMask = new Uint8Array(w * h);

    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const srcIdx = (y * w + x) * 3;
        const dstIdx = (y * w + x) * 4;
        const r = data[srcIdx], g = data[srcIdx+1], b = data[srcIdx+2];

        const isOuterBg = (x < 42 || x > 368 || y < 53 || y > 1016);
        const green = isGreen(r, g, b);

        if (isOuterBg) {
          outData[dstIdx+3] = 0;
        } else if (green) {
          outData[dstIdx+3] = 0;
          slotsMask[y * w + x] = 1;
        } else {
          outData[dstIdx] = r;
          outData[dstIdx+1] = g;
          outData[dstIdx+2] = b;
          outData[dstIdx+3] = 255;
        }
      }
    }

    const minX = 42, maxX = 368, minY = 53, maxY = 1016;
    const cropW = maxX - minX + 1;
    const cropH = maxY - minY + 1;
    const scale = 1200 / cropW;
    const targetH = Math.round(cropH * scale);

    const outPath = path.join(TEMPLATES_DIR, 'template-img-cinema_ticket_1photo-overlay.png');
    const thumbPath = path.join(THUMBS_DIR, 'template-img-cinema_ticket_1photo-overlay-thumb.webp');

    await sharp(outData, { raw: { width: w, height: h, channels: 4 } })
      .extract({ left: minX, top: minY, width: cropW, height: cropH })
      .resize(1200, targetH)
      .png()
      .toFile(outPath);

    await sharp(outPath).resize(300).webp({ quality: 85 }).toFile(thumbPath);

    let sMinX = w, sMaxX = 0, sMinY = h, sMaxY = 0;
    for (let y = minY; y <= maxY; y++) {
      for (let x = minX; x <= maxX; x++) {
        if (slotsMask[y * w + x]) {
          if (x < sMinX) sMinX = x;
          if (x > sMaxX) sMaxX = x;
          if (y < sMinY) sMinY = y;
          if (y > sMaxY) sMaxY = y;
        }
      }
    }

    const scaledSlots = [{
      id: 'slot-0',
      x: Math.round((sMinX - minX) * scale),
      y: Math.round((sMinY - minY) * scale),
      width: Math.round((sMaxX - sMinX + 1) * scale),
      height: Math.round((sMaxY - sMinY + 1) * scale),
      rotation: 0,
      shape: 'rectangle',
      cornerRadius: 0
    }];

    updateTemplate('template-img-cinema_ticket_1photo', t => {
      t.canvas = { width: 1200, height: targetH };
      t.photoSlots = scaledSlots;
      t.background = { type: 'solid', color: 'transparent' };
    });
  }

  // -------------------------------------------------------------
  // 3. Silver Slate Aesthetic Strip (3-Shot) - template-img-bad8ac94-4871-452b-bd09
  // -------------------------------------------------------------
  {
    console.log('\n--- 3. Fixing Silver Slate Aesthetic Strip (template-img-bad8ac94-4871-452b-bd09) ---');
    const img = sharp(path.join(ROOT_DIR, 'template_images', 'bad8ac94-4871-452b-bd09-347b306c7db1.jpg'));
    const { data, info } = await img.raw().toBuffer({ resolveWithObject: true });
    const w = info.width, h = info.height;

    // Bounds of the strip: x=[119, 503], y=[89, 951]
    const minX = 119, maxX = 503, minY = 89, maxY = 951;
    const cropW = maxX - minX + 1;
    const cropH = maxY - minY + 1;
    const scale = 1200 / cropW;
    const targetH = Math.round(cropH * scale);

    const outData = Buffer.alloc(cropW * cropH * 4);
    const slotsMask = new Uint8Array(cropW * cropH);

    for (let y = minY; y <= maxY; y++) {
      for (let x = minX; x <= maxX; x++) {
        const srcIdx = (y * w + x) * 3;
        const dstX = x - minX;
        const dstY = y - minY;
        const dstIdx = (dstY * cropW + dstX) * 4;
        const r = data[srcIdx], g = data[srcIdx+1], b = data[srcIdx+2];

        // Is it the grey background in corners of rounded strip?
        const isGreyBg = Math.abs(r - 112) < 20 && Math.abs(g - 112) < 20 && Math.abs(b - 112) < 20;
        const green = isGreen(r, g, b);

        if (isGreyBg) {
          outData[dstIdx+3] = 0;
        } else if (green) {
          outData[dstIdx+3] = 0;
          slotsMask[dstY * cropW + dstX] = 1;
        } else {
          outData[dstIdx] = r;
          outData[dstIdx+1] = g;
          outData[dstIdx+2] = b;
          outData[dstIdx+3] = 255;
        }
      }
    }

    const outPath = path.join(TEMPLATES_DIR, 'template-img-bad8ac94-4871-452b-bd09-overlay.png');
    const thumbPath = path.join(THUMBS_DIR, 'template-img-bad8ac94-4871-452b-bd09-overlay-thumb.webp');

    await sharp(outData, { raw: { width: cropW, height: cropH, channels: 4 } })
      .resize(1200, targetH)
      .png()
      .toFile(outPath);

    await sharp(outPath).resize(300).webp({ quality: 85 }).toFile(thumbPath);

    const ySlots = [
      { startY: 143, endY: 336 },
      { startY: 364, endY: 557 },
      { startY: 580, endY: 773 }
    ];
    const scaledSlots = ySlots.map((ys, idx) => {
      let sMinX = cropW, sMaxX = 0;
      for (let y = ys.startY - minY; y <= ys.endY - minY; y++) {
        for (let x = 0; x < cropW; x++) {
          if (slotsMask[y * cropW + x]) {
            if (x < sMinX) sMinX = x;
            if (x > sMaxX) sMaxX = x;
          }
        }
      }
      return {
        id: `slot-${idx}`,
        x: Math.round(sMinX * scale),
        y: Math.round((ys.startY - minY) * scale),
        width: Math.round((sMaxX - sMinX + 1) * scale),
        height: Math.round((ys.endY - ys.startY + 1) * scale),
        rotation: 0,
        shape: 'rectangle',
        cornerRadius: 0
      };
    });

    updateTemplate('template-img-bad8ac94-4871-452b-bd09', t => {
      t.canvas = { width: 1200, height: targetH };
      t.photoSlots = scaledSlots;
      t.background = { type: 'solid', color: 'transparent' };
    });
  }

  // Also fix Silver Slate #4 (d549ed68-af43-4cd1-a6a8) in case it has mockup grey background
  {
    console.log('\n--- 3b. Fixing Silver Slate Aesthetic Strip (template-img-d549ed68-af43-4cd1-a6a8) ---');
    const img = sharp(path.join(ROOT_DIR, 'template_images', 'd549ed68-af43-4cd1-a6a8-ce246439ae22.jpg'));
    const { data, info } = await img.raw().toBuffer({ resolveWithObject: true });
    const w = info.width, h = info.height;

    const minX = 105, maxX = 503, minY = 38, maxY = 989;
    const cropW = maxX - minX + 1;
    const cropH = maxY - minY + 1;
    const scale = 1200 / cropW;
    const targetH = Math.round(cropH * scale);

    const outData = Buffer.alloc(cropW * cropH * 4);
    const slotsMask = new Uint8Array(cropW * cropH);

    for (let y = minY; y <= maxY; y++) {
      for (let x = minX; x <= maxX; x++) {
        const srcIdx = (y * w + x) * 3;
        const dstX = x - minX;
        const dstY = y - minY;
        const dstIdx = (dstY * cropW + dstX) * 4;
        const r = data[srcIdx], g = data[srcIdx+1], b = data[srcIdx+2];

        const isGreyBg = Math.abs(r - 126) < 20 && Math.abs(g - 126) < 20 && Math.abs(b - 126) < 20;
        const green = isGreen(r, g, b);

        if (isGreyBg) {
          outData[dstIdx+3] = 0;
        } else if (green) {
          outData[dstIdx+3] = 0;
          slotsMask[dstY * cropW + dstX] = 1;
        } else {
          outData[dstIdx] = r;
          outData[dstIdx+1] = g;
          outData[dstIdx+2] = b;
          outData[dstIdx+3] = 255;
        }
      }
    }

    const outPath = path.join(TEMPLATES_DIR, 'template-img-d549ed68-af43-4cd1-a6a8-overlay.png');
    const thumbPath = path.join(THUMBS_DIR, 'template-img-d549ed68-af43-4cd1-a6a8-overlay-thumb.webp');

    await sharp(outData, { raw: { width: cropW, height: cropH, channels: 4 } })
      .resize(1200, targetH)
      .png()
      .toFile(outPath);

    await sharp(outPath).resize(300).webp({ quality: 85 }).toFile(thumbPath);

    const ySlots = [
      { startY: 184, endY: 374 },
      { startY: 390, endY: 580 },
      { startY: 596, endY: 786 }
    ];
    const scaledSlots = ySlots.map((ys, idx) => {
      let sMinX = cropW, sMaxX = 0;
      for (let y = ys.startY - minY; y <= ys.endY - minY; y++) {
        for (let x = 0; x < cropW; x++) {
          if (slotsMask[y * cropW + x]) {
            if (x < sMinX) sMinX = x;
            if (x > sMaxX) sMaxX = x;
          }
        }
      }
      return {
        id: `slot-${idx}`,
        x: Math.round(sMinX * scale),
        y: Math.round((ys.startY - minY) * scale),
        width: Math.round((sMaxX - sMinX + 1) * scale),
        height: Math.round((ys.endY - ys.startY + 1) * scale),
        rotation: 0,
        shape: 'rectangle',
        cornerRadius: 0
      };
    });

    updateTemplate('template-img-d549ed68-af43-4cd1-a6a8', t => {
      t.canvas = { width: 1200, height: targetH };
      t.photoSlots = scaledSlots;
      t.background = { type: 'solid', color: 'transparent' };
    });
  }

  // -------------------------------------------------------------
  // 4. Pearl Minimal Camera (template-img-download-25)
  // -------------------------------------------------------------
  {
    console.log('\n--- 4. Fixing Pearl Minimal Camera (template-img-download-25) ---');
    const img = sharp(path.join(ROOT_DIR, 'template_images', 'download (25).png'));
    const { data, info } = await img.raw().toBuffer({ resolveWithObject: true });
    const w = info.width, h = info.height;

    // Camera bounds in 1152x2048:
    // x=[95, 1085], y=[675, 1350]
    const minX = 95, maxX = 1085, minY = 675, maxY = 1350;
    const cropW = maxX - minX + 1;
    const cropH = maxY - minY + 1;
    const scale = 1200 / cropW;
    const targetH = Math.round(cropH * scale);

    // Flood fill only pure white outside the camera!
    // Inside the cropped area, let's flood fill pure white from the crop perimeter
    const cropBuffer = Buffer.alloc(cropW * cropH * 4);
    for (let y = minY; y <= maxY; y++) {
      for (let x = minX; x <= maxX; x++) {
        const srcIdx = (y * w + x) * info.channels;
        const dstIdx = ((y - minY) * cropW + (x - minX)) * 4;
        cropBuffer[dstIdx] = data[srcIdx];
        cropBuffer[dstIdx+1] = data[srcIdx+1];
        cropBuffer[dstIdx+2] = data[srcIdx+2];
        cropBuffer[dstIdx+3] = 255;
      }
    }

    // Flood fill pure white (r >= 250, g >= 250, b >= 250) from perimeter
    const visited = new Uint8Array(cropW * cropH);
    const queue = [];

    function checkAndPush(qx, qy) {
      const idx = qy * cropW + qx;
      if (visited[idx]) return;
      const r = cropBuffer[idx * 4];
      const g = cropBuffer[idx * 4 + 1];
      const b = cropBuffer[idx * 4 + 2];
      // Only flood pure background white, don't eat silver/grey camera (which is <= 235)
      if (r >= 248 && g >= 248 && b >= 248) {
        visited[idx] = 1;
        queue.push((qy << 16) | qx);
      }
    }

    for (let x = 0; x < cropW; x++) {
      checkAndPush(x, 0);
      checkAndPush(x, cropH - 1);
    }
    for (let y = 0; y < cropH; y++) {
      checkAndPush(0, y);
      checkAndPush(cropW - 1, y);
    }

    let head = 0;
    while (head < queue.length) {
      const val = queue[head++];
      const qx = val & 0xffff;
      const qy = val >>> 16;

      if (qx > 0) checkAndPush(qx - 1, qy);
      if (qx < cropW - 1) checkAndPush(qx + 1, qy);
      if (qy > 0) checkAndPush(qx, qy - 1);
      if (qy < cropH - 1) checkAndPush(qx, qy + 1);
    }

    // Apply transparency: visited pixels become 0 alpha, green slot pixels become 0 alpha
    let slotMinX = cropW, slotMaxX = 0, slotMinY = cropH, slotMaxY = 0;
    for (let y = 0; y < cropH; y++) {
      for (let x = 0; x < cropW; x++) {
        const idx = y * cropW + x;
        const bIdx = idx * 4;
        const r = cropBuffer[bIdx];
        const g = cropBuffer[bIdx+1];
        const b = cropBuffer[bIdx+2];

        if (visited[idx]) {
          cropBuffer[bIdx+3] = 0;
        } else if (isGreen(r, g, b)) {
          cropBuffer[bIdx+3] = 0;
          if (x < slotMinX) slotMinX = x;
          if (x > slotMaxX) slotMaxX = x;
          if (y < slotMinY) slotMinY = y;
          if (y > slotMaxY) slotMaxY = y;
        }
      }
    }

    const outPath = path.join(TEMPLATES_DIR, 'template-img-download-25-overlay.png');
    const thumbPath = path.join(THUMBS_DIR, 'template-img-download-25-overlay-thumb.webp');

    await sharp(cropBuffer, { raw: { width: cropW, height: cropH, channels: 4 } })
      .resize(1200, targetH)
      .png()
      .toFile(outPath);

    await sharp(outPath).resize(300).webp({ quality: 85 }).toFile(thumbPath);

    const soloSlot = [{
      id: 'slot-0',
      x: Math.round(slotMinX * scale),
      y: Math.round(slotMinY * scale),
      width: Math.round((slotMaxX - slotMinX + 1) * scale),
      height: Math.round((slotMaxY - slotMinY + 1) * scale),
      rotation: 0,
      shape: 'rectangle',
      cornerRadius: 0
    }];

    updateTemplate('template-img-download-25', t => {
      t.canvas = { width: 1200, height: targetH };
      t.photoSlots = soloSlot;
      t.name = 'Pearl Minimal Vintage Camera (1-Shot)';
      t.background = { type: 'solid', color: 'transparent' };
    });
  }

  // -------------------------------------------------------------
  // 5. Velvet Crimson Slanted Strip (3-Shot) - custom-rb-awb4ye_subject-1
  // -------------------------------------------------------------
  {
    console.log('\n--- 5. Fixing Velvet Crimson Slanted Strip (custom-rb-awb4ye_subject-1) ---');
    // Scale: 1200 / 440 = 2.7272727
    const scale = 1200 / 440;
    const slots = [
      {
        id: 'slot-0',
        x: Math.round(33 * scale),
        y: Math.round(191 * scale),
        width: Math.round((404 - 33 + 1) * scale),
        height: Math.round((505 - 191 + 1) * scale),
        rotation: 2.2,
        shape: 'rectangle',
        cornerRadius: 0
      },
      {
        id: 'slot-1',
        x: Math.round(28 * scale),
        y: Math.round(485 * scale),
        width: Math.round((409 - 28 + 1) * scale),
        height: Math.round((785 - 485 + 1) * scale),
        rotation: -7.9,
        shape: 'rectangle',
        cornerRadius: 0
      },
      {
        id: 'slot-2',
        x: Math.round(29 * scale),
        y: Math.round(775 * scale),
        width: Math.round((402 - 29 + 1) * scale),
        height: Math.round((1070 - 775 + 1) * scale),
        rotation: 4.9,
        shape: 'rectangle',
        cornerRadius: 0
      }
    ];

    updateTemplate('custom-rb-awb4ye_subject-1', t => {
      t.name = 'Velvet Crimson Slanted Strip (3-Shot)';
      t.supportedPhotoCounts = [3];
      t.photoSlots = slots;
      t.background = { type: 'solid', color: 'transparent' };
    });
  }

  // -------------------------------------------------------------
  // 6. Rose Blush Aesthetic Strip (custom-rb-awb4ye_subject-2) - Revoke & Restore Ticket BG
  // -------------------------------------------------------------
  {
    console.log('\n--- 6. Restoring Rose Blush Aesthetic Strip (custom-rb-awb4ye_subject-2) ---');
    const srcPath = path.join(ROOT_DIR, 'template_images', 'removed_backgrounds', 'awb4ye_Subject-2.png');
    const img = sharp(srcPath);
    const { data, info } = await img.raw().toBuffer({ resolveWithObject: true });
    const w = info.width, h = info.height;

    const scale = 1200 / w;
    const targetH = Math.round(h * scale);

    const outData = Buffer.alloc(w * h * 4);
    let sMinX = w, sMaxX = 0, sMinY = h, sMaxY = 0;

    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const idx = (y * w + x) * 4;
        const r = data[idx], g = data[idx+1], b = data[idx+2], a = data[idx+3];

        if (a < 30) {
          outData[idx+3] = 0;
        } else if (isGreen(r, g, b)) {
          outData[idx+3] = 0;
          if (x < sMinX) sMinX = x;
          if (x > sMaxX) sMaxX = x;
          if (y < sMinY) sMinY = y;
          if (y > sMaxY) sMaxY = y;
        } else {
          // RETAIN 100% OF TICKET BACKGROUND & GRAPHICS
          outData[idx] = r;
          outData[idx+1] = g;
          outData[idx+2] = b;
          outData[idx+3] = 255;
        }
      }
    }

    const outPath = path.join(TEMPLATES_DIR, 'custom-rb-awb4ye_subject-2-overlay.png');
    const thumbPath = path.join(THUMBS_DIR, 'custom-rb-awb4ye_subject-2-overlay-thumb.webp');

    await sharp(outData, { raw: { width: w, height: h, channels: 4 } })
      .resize(1200, targetH)
      .png()
      .toFile(outPath);

    await sharp(outPath).resize(300).webp({ quality: 85 }).toFile(thumbPath);

    const soloSlot = [{
      id: 'slot-0',
      x: Math.round(sMinX * scale),
      y: Math.round(sMinY * scale),
      width: Math.round((sMaxX - sMinX + 1) * scale),
      height: Math.round((sMaxY - sMinY + 1) * scale),
      rotation: 0,
      shape: 'rectangle',
      cornerRadius: 0
    }];

    updateTemplate('custom-rb-awb4ye_subject-2', t => {
      t.canvas = { width: 1200, height: targetH };
      t.photoSlots = soloSlot;
      t.background = { type: 'solid', color: 'transparent' };
    });
  }

  // Save updated batchGeneratedTemplates.ts
  const newTsContent = `import type { Template } from '@/types'\n\n/**\n * Auto-extracted photobooth templates with pixel-accurate slots and clean cutouts\n * Total templates: ${templates.length}\n */\nexport const BATCH_GENERATED_TEMPLATES: Template[] = ${JSON.stringify(templates, null, 2)}\n`;
  fs.writeFileSync(BATCH_TS, newTsContent, 'utf8');
  console.log(`\nSuccessfully wrote updated ${BATCH_TS}!`);
  console.log('=== ALL PRECISION FIXES COMPLETED SUCCESSFULLY ===');
}

run().catch(err => {
  console.error('Error running precision fixes:', err);
  process.exit(1);
});

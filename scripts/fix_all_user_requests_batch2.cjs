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
  console.log('=== STARTING BATCH 2 PRECISION FIXES ===\n');

  let tsContent = fs.readFileSync(BATCH_TS, 'utf8');
  const startIdx = tsContent.search(/\[\s*\{/);
  const endIdx = tsContent.lastIndexOf(']');
  const templates = JSON.parse(tsContent.substring(startIdx, endIdx + 1));

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
  // 1. Sweetheart Solo Polaroid (1-Shot) - custom-rb-heart_frame_1_photo
  // -------------------------------------------------------------
  {
    console.log('\n--- 1. Fixing Sweetheart Solo Polaroid (1-Shot) ---');
    const srcPath = path.join(ROOT_DIR, 'template_images', 'removed_backgrounds', 'heart_frame_1_photo.png');
    const { data, info } = await sharp(srcPath).raw().toBuffer({ resolveWithObject: true });
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
          // RETAIN 100% OF POLAROID BODY, CREAM CARD, HEARTS & GRAPHICS
          outData[idx] = r;
          outData[idx+1] = g;
          outData[idx+2] = b;
          outData[idx+3] = 255;
        }
      }
    }

    const outPath = path.join(TEMPLATES_DIR, 'custom-rb-heart_frame_1_photo-overlay.png');
    const thumbPath = path.join(THUMBS_DIR, 'custom-rb-heart_frame_1_photo-overlay-thumb.webp');

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

    updateTemplate('custom-rb-heart_frame_1_photo', t => {
      t.canvas = { width: 1200, height: targetH };
      t.photoSlots = soloSlot;
      t.background = { type: 'solid', color: 'transparent' };
    });
  }

  // Also Sweetheart 3-Photos (Heart_frame_3_photos)
  {
    console.log('\n--- 1b. Fixing Sweetheart Romance Frame (3-Shot) ---');
    const srcPath = path.join(ROOT_DIR, 'template_images', 'removed_backgrounds', 'Heart_frame_3_photos.png');
    if (fs.existsSync(srcPath)) {
      const { data, info } = await sharp(srcPath).raw().toBuffer({ resolveWithObject: true });
      const w = info.width, h = info.height;
      const scale = 1200 / w;
      const targetH = Math.round(h * scale);

      const outData = Buffer.alloc(w * h * 4);
      const slotMask = new Uint8Array(w * h);

      for (let y = 0; y < h; y++) {
        for (let x = 0; x < w; x++) {
          const idx = (y * w + x) * 4;
          const r = data[idx], g = data[idx+1], b = data[idx+2], a = data[idx+3];

          if (a < 30) {
            outData[idx+3] = 0;
          } else if (isGreen(r, g, b)) {
            outData[idx+3] = 0;
            slotMask[y * w + x] = 1;
          } else {
            outData[idx] = r;
            outData[idx+1] = g;
            outData[idx+2] = b;
            outData[idx+3] = 255;
          }
        }
      }

      const outPath = path.join(TEMPLATES_DIR, 'custom-rb-heart_frame_3_photos-overlay.png');
      const thumbPath = path.join(THUMBS_DIR, 'custom-rb-heart_frame_3_photos-overlay-thumb.webp');

      await sharp(outData, { raw: { width: w, height: h, channels: 4 } })
        .resize(1200, targetH)
        .png()
        .toFile(outPath);

      await sharp(outPath).resize(300).webp({ quality: 85 }).toFile(thumbPath);

      const ySpans = [
        { sY: 27, eY: 108 },
        { sY: 144, eY: 220 },
        { sY: 251, eY: 338 }
      ];

      const slots = ySpans.map((span, idx) => {
        let minSX = w, maxSX = 0;
        for (let y = span.sY; y <= span.eY; y++) {
          for (let x = 0; x < w; x++) {
            if (slotMask[y * w + x]) {
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

      updateTemplate('custom-rb-heart_frame_3_photos', t => {
        t.canvas = { width: 1200, height: targetH };
        t.photoSlots = slots;
        t.background = { type: 'solid', color: 'transparent' };
      });
    }
  }

  // -------------------------------------------------------------
  // 2. Silver Slate Aesthetic Strip (4-Shot) - template-img-2c58d6f6-11f4-4664-916f
  // -------------------------------------------------------------
  {
    console.log('\n--- 2. Fixing Silver Slate Aesthetic Strip (4-Shot) [2c58d6f6] ---');
    const srcPath = path.join(ROOT_DIR, 'template_images', '2c58d6f6-11f4-4664-916f-8ad631d3faf4.png');
    const { data, info } = await sharp(srcPath).raw().toBuffer({ resolveWithObject: true });
    const w = info.width, h = info.height;

    // Strip bounds in 2c58d6f6: [225, 41] to [757, 1572] (size: 533x1532)
    const minX = 225, maxX = 757, minY = 41, maxY = 1572;
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

        // Outside strip / fabric background
        const isNeutralGrey = Math.abs(r - g) <= 5 && Math.abs(r - b) <= 5 && Math.abs(g - b) <= 5 && r >= 105 && r <= 220;
        const green = isGreen(r, g, b);

        if (isNeutralGrey) {
          outData[dstIdx+3] = 0;
        } else if (green) {
          outData[dstIdx+3] = 0;
          slotMask[dstY * cropW + dstX] = 1;
        } else {
          outData[dstIdx] = r;
          outData[dstIdx+1] = g;
          outData[dstIdx+2] = b;
          outData[dstIdx+3] = 255;
        }
      }
    }

    const outPath = path.join(TEMPLATES_DIR, 'template-img-2c58d6f6-11f4-4664-916f-overlay.png');
    const thumbPath = path.join(THUMBS_DIR, 'template-img-2c58d6f6-11f4-4664-916f-overlay-thumb.webp');

    await sharp(outData, { raw: { width: cropW, height: cropH, channels: 4 } })
      .resize(1200, targetH)
      .png()
      .toFile(outPath);

    await sharp(outPath).resize(300).webp({ quality: 85 }).toFile(thumbPath);

    // 4 slots in 2c58d6f6
    const yHisto = new Array(cropH).fill(0);
    for (let y = 0; y < cropH; y++) {
      for (let x = 0; x < cropW; x++) {
        if (slotMask[y * cropW + x]) yHisto[y]++;
      }
    }
    const spans = [];
    let inSpan = false, sY = 0;
    for (let y = 0; y < cropH; y++) {
      if (yHisto[y] > 50) {
        if (!inSpan) { inSpan = true; sY = y; }
      } else {
        if (inSpan) {
          inSpan = false;
          if (y - 1 - sY >= 30) {
            spans.push({ sY, eY: y - 1 });
          }
        }
      }
    }
    if (inSpan && (cropH - 1 - sY >= 30)) {
      spans.push({ sY, eY: cropH - 1 });
    }

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

    updateTemplate('template-img-2c58d6f6-11f4-4664-916f', t => {
      t.canvas = { width: 1200, height: targetH };
      t.photoSlots = slots;
      t.background = { type: 'solid', color: 'transparent' };
    });
  }

  // -------------------------------------------------------------
  // 3. Silver Slate Aesthetic Strip (3-Shot) - template-img-1443a760-2e64-410f-879e
  // -------------------------------------------------------------
  {
    console.log('\n--- 3. Fixing Silver Slate Aesthetic Strip (3-Shot) [1443a760] ---');
    const srcPath = path.join(ROOT_DIR, 'template_images', '1443a760-2e64-410f-879e-c2aa7a26fa61.png');
    const { data, info } = await sharp(srcPath).raw().toBuffer({ resolveWithObject: true });
    const w = info.width, h = info.height;

    // Bounds: [159, 17] to [814, 1599] (size: 656x1583)
    const minX = 159, maxX = 814, minY = 17, maxY = 1599;
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

        const isNeutralGrey = Math.abs(r - g) <= 6 && Math.abs(r - b) <= 6 && Math.abs(g - b) <= 6 && r >= 105 && r <= 220;
        const green = isGreen(r, g, b);

        if (isNeutralGrey) {
          outData[dstIdx+3] = 0;
        } else if (green) {
          outData[dstIdx+3] = 0;
          slotMask[dstY * cropW + dstX] = 1;
        } else {
          outData[dstIdx] = r;
          outData[dstIdx+1] = g;
          outData[dstIdx+2] = b;
          outData[dstIdx+3] = 255;
        }
      }
    }

    const outPath = path.join(TEMPLATES_DIR, 'template-img-1443a760-2e64-410f-879e-overlay.png');
    const thumbPath = path.join(THUMBS_DIR, 'template-img-1443a760-2e64-410f-879e-overlay-thumb.webp');

    await sharp(outData, { raw: { width: cropW, height: cropH, channels: 4 } })
      .resize(1200, targetH)
      .png()
      .toFile(outPath);

    await sharp(outPath).resize(300).webp({ quality: 85 }).toFile(thumbPath);

    const yHisto = new Array(cropH).fill(0);
    for (let y = 0; y < cropH; y++) {
      for (let x = 0; x < cropW; x++) {
        if (slotMask[y * cropW + x]) yHisto[y]++;
      }
    }
    const spans = [];
    let inSpan = false, sY = 0;
    for (let y = 0; y < cropH; y++) {
      if (yHisto[y] > 50) {
        if (!inSpan) { inSpan = true; sY = y; }
      } else {
        if (inSpan) {
          inSpan = false;
          if (y - 1 - sY >= 30) {
            spans.push({ sY, eY: y - 1 });
          }
        }
      }
    }
    if (inSpan && (cropH - 1 - sY >= 30)) {
      spans.push({ sY, eY: cropH - 1 });
    }

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

    updateTemplate('template-img-1443a760-2e64-410f-879e', t => {
      t.canvas = { width: 1200, height: targetH };
      t.photoSlots = slots;
      t.background = { type: 'solid', color: 'transparent' };
    });
  }

  // -------------------------------------------------------------
  // 4. Deep Indigo Aesthetic Strip (3-Shot) - template-img-4a41de25-7340-4960-9da3
  // -------------------------------------------------------------
  {
    console.log('\n--- 4. Fixing Deep Indigo Aesthetic Strip (3-Shot) [4a41de25] ---');
    const srcPath = path.join(ROOT_DIR, 'template_images', '4a41de25-7340-4960-9da3-647eb6078986.png');
    const { data, info } = await sharp(srcPath).raw().toBuffer({ resolveWithObject: true });
    const w = info.width, h = info.height;

    // Bounds: [185, 30] to [742, 1636] (size: 558x1607)
    const minX = 185, maxX = 742, minY = 30, maxY = 1636;
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

        const isNeutralGrey = Math.abs(r - g) <= 6 && Math.abs(r - b) <= 6 && Math.abs(g - b) <= 6 && r >= 105 && r <= 220;
        const green = isGreen(r, g, b);

        if (isNeutralGrey) {
          outData[dstIdx+3] = 0;
        } else if (green) {
          outData[dstIdx+3] = 0;
          slotMask[dstY * cropW + dstX] = 1;
        } else {
          outData[dstIdx] = r;
          outData[dstIdx+1] = g;
          outData[dstIdx+2] = b;
          outData[dstIdx+3] = 255;
        }
      }
    }

    const outPath = path.join(TEMPLATES_DIR, 'template-img-4a41de25-7340-4960-9da3-overlay.png');
    const thumbPath = path.join(THUMBS_DIR, 'template-img-4a41de25-7340-4960-9da3-overlay-thumb.webp');

    await sharp(outData, { raw: { width: cropW, height: cropH, channels: 4 } })
      .resize(1200, targetH)
      .png()
      .toFile(outPath);

    await sharp(outPath).resize(300).webp({ quality: 85 }).toFile(thumbPath);

    // 3 slots: top circle, middle star, bottom circle
    const yHisto = new Array(cropH).fill(0);
    for (let y = 0; y < cropH; y++) {
      for (let x = 0; x < cropW; x++) {
        if (slotMask[y * cropW + x]) yHisto[y]++;
      }
    }
    const spans = [];
    let inSpan = false, sY = 0;
    for (let y = 0; y < cropH; y++) {
      if (yHisto[y] > 50) {
        if (!inSpan) { inSpan = true; sY = y; }
      } else {
        if (inSpan) { inSpan = false; spans.push({ sY, eY: y - 1 }); }
      }
    }

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
        shape: idx === 1 ? 'star' : 'circle',
        cornerRadius: 0
      };
    });

    updateTemplate('template-img-4a41de25-7340-4960-9da3', t => {
      t.canvas = { width: 1200, height: targetH };
      t.photoSlots = slots;
      t.background = { type: 'solid', color: 'transparent' };
    });
  }

  // -------------------------------------------------------------
  // 5. Pearl Minimal Aesthetic Strip (1-Shot) - template-img-a1f9cab2-cad2-4924-a290
  // -------------------------------------------------------------
  {
    console.log('\n--- 5. Fixing Pearl Minimal Aesthetic Strip (1-Shot) [a1f9cab2] ---');
    const srcPath = path.join(ROOT_DIR, 'template_images', 'a1f9cab2-cad2-4924-a290-3b46f1d4b83f.jpg');
    const { data, info } = await sharp(srcPath).raw().toBuffer({ resolveWithObject: true });
    const w = info.width, h = info.height;

    // Polaroid frame bounds in 576x1024:
    // x in [16, 545], y in [325, 665] (excluding drop shadow below 665)
    const minX = 16, maxX = 545, minY = 325, maxY = 665;
    const cropW = maxX - minX + 1;
    const cropH = maxY - minY + 1;
    const scale = 1200 / cropW;
    const targetH = Math.round(cropH * scale);

    const outData = Buffer.alloc(cropW * cropH * 4);
    let sMinX = cropW, sMaxX = 0, sMinY = cropH, sMaxY = 0;

    for (let y = minY; y <= maxY; y++) {
      for (let x = minX; x <= maxX; x++) {
        const srcIdx = (y * w + x) * 3;
        const dstX = x - minX;
        const dstY = y - minY;
        const dstIdx = (dstY * cropW + dstX) * 4;
        const r = data[srcIdx], g = data[srcIdx+1], b = data[srcIdx+2];

        // Background is light grey (220-230)
        const isBg = Math.abs(r - 225) <= 10 && Math.abs(g - 225) <= 10 && Math.abs(b - 225) <= 10;
        // Drop shadow speckles: dark grey below y > 645
        const isShadow = y > 645 && Math.abs(r - g) <= 10 && Math.abs(r - b) <= 10 && r < 185;
        const green = isGreen(r, g, b);

        if (isBg || isShadow) {
          outData[dstIdx+3] = 0;
        } else if (green) {
          outData[dstIdx+3] = 0;
          if (dstX < sMinX) sMinX = dstX;
          if (dstX > sMaxX) sMaxX = dstX;
          if (dstY < sMinY) sMinY = dstY;
          if (dstY > sMaxY) sMaxY = dstY;
        } else {
          outData[dstIdx] = r;
          outData[dstIdx+1] = g;
          outData[dstIdx+2] = b;
          outData[dstIdx+3] = 255;
        }
      }
    }

    const outPath = path.join(TEMPLATES_DIR, 'template-img-a1f9cab2-cad2-4924-a290-overlay.png');
    const thumbPath = path.join(THUMBS_DIR, 'template-img-a1f9cab2-cad2-4924-a290-overlay-thumb.webp');

    await sharp(outData, { raw: { width: cropW, height: cropH, channels: 4 } })
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
      rotation: -3.5,
      shape: 'rectangle',
      cornerRadius: 0
    }];

    updateTemplate('template-img-a1f9cab2-cad2-4924-a290', t => {
      t.canvas = { width: 1200, height: targetH };
      t.photoSlots = soloSlot;
      t.name = 'Pearl Minimal Vintage Polaroid (1-Shot)';
      t.background = { type: 'solid', color: 'transparent' };
    });
  }

  // -------------------------------------------------------------
  // 6. Pearl Minimal Aesthetic Strip (3-Shot) #6 - template-img-b9974b13-22f5-4c49-a17a
  // -------------------------------------------------------------
  {
    console.log('\n--- 6. Fixing Pearl Minimal Pink Checkered Strip (3-Shot) #6 [b9974b13] ---');
    const srcPath = path.join(ROOT_DIR, 'template_images', 'b9974b13-22f5-4c49-a17a-f1d392918db9.jpg');
    const { data, info } = await sharp(srcPath).raw().toBuffer({ resolveWithObject: true });
    const w = info.width, h = info.height;

    // Strip bounds in 576x1024:
    // x in [150, 420], y in [105, 920]
    const minX = 150, maxX = 420, minY = 105, maxY = 920;
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

        // Background in b9974b13 is neutral grey: (220-230, 220-230, 220-230) with |r-g|<=3 and |r-b|<=3
        // IMPORTANT: The pink checkered border has r > 230, but g < 220 or b < 220 (it is pink!), so |r-g| >= 10!
        // ONLY the neutral grey background outside should be transparent!
        const isNeutralGreyBg = Math.abs(r - 226) <= 8 && Math.abs(g - 226) <= 8 && Math.abs(b - 226) <= 8 && Math.abs(r - g) <= 3 && Math.abs(r - b) <= 3;
        const green = isGreen(r, g, b);

        if (isNeutralGreyBg) {
          outData[dstIdx+3] = 0;
        } else if (green) {
          outData[dstIdx+3] = 0;
          slotMask[dstY * cropW + dstX] = 1;
        } else {
          // KEEP 100% OF PINK CHECKERED PATTERN, FLOWERS, STRAWBERRY SHORTCAKE!
          outData[dstIdx] = r;
          outData[dstIdx+1] = g;
          outData[dstIdx+2] = b;
          outData[dstIdx+3] = 255;
        }
      }
    }

    const outPath = path.join(TEMPLATES_DIR, 'template-img-b9974b13-22f5-4c49-a17a-overlay.png');
    const thumbPath = path.join(THUMBS_DIR, 'template-img-b9974b13-22f5-4c49-a17a-overlay-thumb.webp');

    await sharp(outData, { raw: { width: cropW, height: cropH, channels: 4 } })
      .resize(1200, targetH)
      .png()
      .toFile(outPath);

    await sharp(outPath).resize(300).webp({ quality: 85 }).toFile(thumbPath);

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
        if (inSpan) { inSpan = false; spans.push({ sY, eY: y - 1 }); }
      }
    }

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

    updateTemplate('template-img-b9974b13-22f5-4c49-a17a', t => {
      t.canvas = { width: 1200, height: targetH };
      t.photoSlots = slots;
      t.name = 'Sweet Pink Strawberry Shortcake Strip (3-Shot)';
      t.background = { type: 'solid', color: 'transparent' };
    });
  }

  // Save updated batchGeneratedTemplates.ts
  const newTsContent = `import type { Template } from '@/types'\n\n/**\n * Auto-extracted photobooth templates with pixel-accurate slots and clean cutouts\n * Total templates: ${templates.length}\n */\nexport const BATCH_GENERATED_TEMPLATES: Template[] = ${JSON.stringify(templates, null, 2)}\n`;
  fs.writeFileSync(BATCH_TS, newTsContent, 'utf8');
  console.log(`\nSuccessfully wrote updated ${BATCH_TS}!`);
  console.log('=== BATCH 2 PRECISION FIXES COMPLETED SUCCESSFULLY ===');
}

run().catch(err => {
  console.error('Error running batch 2 fixes:', err);
  process.exit(1);
});

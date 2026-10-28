const sharp = require('sharp');
const fs = require('fs');
const path = require('path');

const ROOT_DIR = path.resolve(__dirname, '..');
const INPUT_DIR = path.join(ROOT_DIR, 'template_images', 'removed_backgrounds');
const OUTPUT_DIR = path.join(ROOT_DIR, 'public', 'templates');
const THUMBS_DIR = path.join(OUTPUT_DIR, 'thumbs');

function isGreen(r, g, b) {
  return (g > 110 && g > r * 1.2 && g > b * 1.2) ||
         (g > 140 && r < 120 && b < 120) ||
         (g > 95 && r < 80 && b < 80);
}

async function testRestore4() {
  const tests = [
    { file: '122_Subject-1.png', id: 'custom-rb-122_subject-1' },
    { file: 'awervq_Subject-1.png', id: 'custom-rb-awervq_subject-1' },
    { file: 'awervq_Subject-2.png', id: 'custom-rb-awervq_subject-2' },
    { file: 'be5ar_Subject-2.png', id: 'custom-rb-be5ar_subject-2' }
  ];

  for (const t of tests) {
    const filePath = path.join(INPUT_DIR, t.file);
    const { data, info } = await sharp(filePath).raw().toBuffer({ resolveWithObject: true });
    const { width: origW, height: origH, channels } = info;

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
    let transCount = 0, opaqueCount = 0;

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
        if (a < 30 || isGreen(r, g, b)) {
          overlayRgba[destIdx + 3] = 0;
          transCount++;
        } else {
          // Despill green fringe on edges if any
          if (g > 110 && g > r && g > b) {
            overlayRgba[destIdx + 1] = Math.round((r + b) / 2);
          }
          overlayRgba[destIdx + 3] = a;
          opaqueCount++;
        }
      }
    }

    const outOverlayPath = path.join(OUTPUT_DIR, `${t.id}-overlay.png`);
    const outThumbPath = path.join(THUMBS_DIR, `${t.id}-overlay-thumb.webp`);

    await sharp(overlayRgba, { raw: { width: sW, height: sH, channels: 4 } })
      .png()
      .toFile(outOverlayPath);

    await sharp(outOverlayPath).resize(300).webp({ quality: 85 }).toFile(outThumbPath);

    console.log(`${t.id}: restored! W=${sW}, H=${sH}, trans=${transCount}, opaque=${opaqueCount}`);
  }
}
testRestore4();

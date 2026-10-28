const path = require('path');
const fs = require('fs');
const sharp = require('sharp');
const { STICKER_DEFINITIONS, userUploadDir, STICKERS_DIR } = require('./stickerCatalog.cjs');

// Ensure all category directories exist
const categories = ['pop_culture', 'streetwear', 'retro', 'motorsport', 'music_misc'];
categories.forEach(cat => {
  const dir = path.join(STICKERS_DIR, cat);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
});

async function processAll() {
  console.log(`Starting sticker extraction for ${STICKER_DEFINITIONS.length} stickers...`);

  // Cache loaded source images
  const imageCache = new Map();
  async function getImage(filename) {
    if (!imageCache.has(filename)) {
      const p = path.join(userUploadDir, filename);
      const { data, info } = await sharp(p).raw().toBuffer({ resolveWithObject: true });
      imageCache.set(filename, { data, info });
    }
    return imageCache.get(filename);
  }

  const manifest = [];

  for (const def of STICKER_DEFINITIONS) {
    const { data, info } = await getImage(def.file);
    const { left, top, width, height } = def.approxBox;

    // Safety bounds
    const cropX = Math.max(0, left);
    const cropY = Math.max(0, top);
    const cropW = Math.min(info.width - cropX, width);
    const cropH = Math.min(info.height - cropY, height);

    // Extract raw crop
    const cropBuffer = Buffer.alloc(cropW * cropH * 4);

    // Analyze background color for this local crop region
    // Sample corners of the crop box
    const cornerSamples = [
      getPixel(data, info, cropY, cropX),
      getPixel(data, info, cropY, cropX + cropW - 1),
      getPixel(data, info, cropY + cropH - 1, cropX),
      getPixel(data, info, cropY + cropH - 1, cropX + cropW - 1)
    ];

    // Flood fill background within this bounding crop from all 4 borders of the crop
    const localBg = new Uint8Array(cropW * cropH);
    const queue = [];

    // Push local perimeter
    for (let x = 0; x < cropW; x++) {
      queue.push(0 * cropW + x);
      queue.push((cropH - 1) * cropW + x);
    }
    for (let y = 0; y < cropH; y++) {
      queue.push(y * cropW + 0);
      queue.push(y * cropW + (cropW - 1));
    }

    let head = 0;
    while (head < queue.length) {
      const curr = queue[head++];
      if (localBg[curr] !== 0) continue;
      const cy = Math.floor(curr / cropW);
      const cx = curr % cropW;

      const srcX = cropX + cx;
      const srcY = cropY + cy;
      const [r, g, b, a] = getPixel(data, info, srcY, srcX);

      // Determine if pixel belongs to outer sheet background:
      let isSheetBg = false;
      if (a < 15) {
        isSheetBg = true;
      } else if (def.file === 'media_1790156903981.png') {
        // Sheet 1: White background (#FFFFFF).
        // Sticker has a die-cut border with outer shadow or outline separating it.
        // Pure white is background.
        isSheetBg = (r >= 250 && g >= 250 && b >= 250);
      } else if (def.file === 'media_1790156912531.png') {
        // Sheet 2: Checkerboard white & #EBEBEB / #E4E4E4
        const isWhite = (r >= 248 && g >= 248 && b >= 248);
        const isGray = (r >= 225 && r <= 245 && Math.abs(r - g) <= 5 && Math.abs(g - b) <= 5);
        isSheetBg = isWhite || isGray;
      } else if (def.file === 'media_1790156920149.png') {
        // Sheet 3: Solid light gray #E4E4E4 (228, 228, 228)
        const isGray = (r >= 215 && r <= 236 && Math.abs(r - g) <= 6 && Math.abs(g - b) <= 6);
        isSheetBg = isGray;
      }

      if (isSheetBg) {
        localBg[curr] = 1;
        if (cx > 0 && localBg[curr - 1] === 0) queue.push(curr - 1);
        if (cx < cropW - 1 && localBg[curr + 1] === 0) queue.push(curr + 1);
        if (cy > 0 && localBg[curr - cropW] === 0) queue.push(curr - cropW);
        if (cy < cropH - 1 && localBg[curr + cropW] === 0) queue.push(curr + cropW);
      }
    }

    // Build the RGBA buffer for this sticker
    for (let y = 0; y < cropH; y++) {
      for (let x = 0; x < cropW; x++) {
        const srcX = cropX + x;
        const srcY = cropY + y;
        const [r, g, b, a] = getPixel(data, info, srcY, srcX);
        const destIdx = (y * cropW + x) * 4;

        if (localBg[y * cropW + x] === 1) {
          // Transparent outside the sticker
          cropBuffer[destIdx] = 0;
          cropBuffer[destIdx + 1] = 0;
          cropBuffer[destIdx + 2] = 0;
          cropBuffer[destIdx + 3] = 0;
        } else {
          // Sticker foreground (including die-cut white outline!)
          cropBuffer[destIdx] = r;
          cropBuffer[destIdx + 1] = g;
          cropBuffer[destIdx + 2] = b;
          cropBuffer[destIdx + 3] = a;
        }
      }
    }

    const outFilename = `${def.id}.png`;
    const outRelPath = `/stickers/${def.category}/${outFilename}`;
    const outAbsPath = path.join(STICKERS_DIR, def.category, outFilename);

    await sharp(cropBuffer, {
      raw: {
        width: cropW,
        height: cropH,
        channels: 4
      }
    })
    .trim() // Tightly trim transparent edges
    .png({ compressionLevel: 9 })
    .toFile(outAbsPath);

    const meta = await sharp(outAbsPath).metadata();

    manifest.push({
      id: def.id,
      name: def.name,
      category: def.category,
      tags: def.tags,
      url: outRelPath,
      width: meta.width,
      height: meta.height,
      aspectRatio: Number((meta.width / meta.height).toFixed(3))
    });

    console.log(`[${def.category}] Extracted: ${def.name} -> ${outRelPath} (${meta.width}x${meta.height})`);
  }

  // Write manifest
  const manifestPath = path.join(STICKERS_DIR, 'stickers_manifest.json');
  fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2), 'utf8');
  console.log(`\nSuccessfully created sticker catalog manifest with ${manifest.length} stickers at: ${manifestPath}`);
}

function getPixel(data, info, y, x) {
  const idx = (y * info.width + x) * info.channels;
  return [data[idx], data[idx + 1], data[idx + 2], info.channels === 4 ? data[idx + 3] : 255];
}

processAll().catch(console.error);

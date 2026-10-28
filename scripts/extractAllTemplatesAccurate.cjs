const sharp = require('sharp');
const fs = require('fs');
const path = require('path');

const ROOT_DIR = path.resolve(__dirname, '..');
const INPUT_ROOT = path.join(ROOT_DIR, 'template_images');
const INPUT_REMOVED = path.join(ROOT_DIR, 'template_images', 'removed_backgrounds');
const OUTPUT_DIR = path.join(ROOT_DIR, 'public', 'templates');
const THUMBS_DIR = path.join(OUTPUT_DIR, 'thumbs');
const TARGET_WIDTH = 1200;
const BLEED = 4;

if (!fs.existsSync(OUTPUT_DIR)) fs.mkdirSync(OUTPUT_DIR, { recursive: true });
if (!fs.existsSync(THUMBS_DIR)) fs.mkdirSync(THUMBS_DIR, { recursive: true });

function isGreen(r, g, b) {
  return (g > 80 && g > r * 1.15 && g > b * 1.15) ||
         (g > 130 && r < 130 && b < 130) ||
         (g > 95 && r < 80 && b < 80);
}

// Convert RGB to HSL
function rgbToHsl(r, g, b) {
  r /= 255; g /= 255; b /= 255;
  const max = Math.max(r, g, b), min = Math.min(r, g, b);
  let h, s, l = (max + min) / 2;
  if (max === min) {
    h = s = 0;
  } else {
    const d = max - min;
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
    switch (max) {
      case r: h = (g - b) / d + (g < b ? 6 : 0); break;
      case g: h = (b - r) / d + 2; break;
      case b: h = (r - g) / d + 4; break;
    }
    h /= 6;
  }
  return [h * 360, s, l];
}

// Check if a slot is genuinely tilted by inspecting edge slope
function checkSlotTilt(mask, width, height, startY, endY) {
  const topY = new Int32Array(width).fill(-1);
  const botY = new Int32Array(width).fill(-1);

  for (let y = startY; y < endY; y++) {
    for (let x = 0; x < width; x++) {
      if (mask[y * width + x]) {
        if (topY[x] === -1) topY[x] = y;
        botY[x] = y;
      }
    }
  }

  // Find range where topY is valid
  let minX = -1, maxX = -1;
  for (let x = 0; x < width; x++) {
    if (topY[x] !== -1) {
      if (minX === -1) minX = x;
      maxX = x;
    }
  }

  if (minX === -1 || (maxX - minX < width * 0.25)) {
    return 0; // Not enough pixels
  }

  // Sample slope in middle 60% of width (to ignore corner stickers)
  const x1 = Math.floor(minX + (maxX - minX) * 0.25);
  const x2 = Math.floor(minX + (maxX - minX) * 0.75);

  if (topY[x1] === -1 || topY[x2] === -1 || botY[x1] === -1 || botY[x2] === -1) {
    return 0;
  }

  const topDy = topY[x2] - topY[x1];
  const botDy = botY[x2] - botY[x1];
  const dx = x2 - x1;

  const topAngle = (Math.atan2(topDy, dx) * 180) / Math.PI;
  const botAngle = (Math.atan2(botDy, dx) * 180) / Math.PI;

  // Genuine tilt: BOTH top and bottom edges must slope in the same direction with |angle| >= 3.5 deg
  if (Math.abs(topAngle) >= 3.5 && Math.abs(botAngle) >= 3.5 && Math.sign(topAngle) === Math.sign(botAngle)) {
    return Number(((topAngle + botAngle) / 2).toFixed(1));
  }

  return 0;
}

// Detect slots in an image
function extractSlots(data, width, height, channels) {
  const mask = new Uint8Array(width * height);
  const artworkColors = [];

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const idx = (y * width + x) * channels;
      const a = channels === 4 ? data[idx + 3] : 255;
      const r = data[idx], g = data[idx + 1], b = data[idx + 2];

      if (a > 30) {
        if (isGreen(r, g, b)) {
          mask[y * width + x] = 1;
        } else if (x % 12 === 0 && y % 12 === 0) {
          artworkColors.push([r, g, b]);
        }
      }
    }
  }

  // Vertical row counts
  const rowCounts = new Int32Array(height);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      if (mask[y * width + x]) rowCounts[y]++;
    }
  }

  const rawSlots = [];
  let inSlot = false;
  let startY = 0;
  const minRowGreen = Math.max(8, width * 0.12);

  for (let y = 0; y < height; y++) {
    const isRow = rowCounts[y] > minRowGreen;
    if (isRow && !inSlot) {
      inSlot = true;
      startY = y;
    } else if (!isRow && inSlot) {
      inSlot = false;
      const h = y - startY;
      if (h > height * 0.04) {
        let minX = width, maxX = 0;
        for (let sy = startY; sy < y; sy++) {
          for (let sx = 0; sx < width; sx++) {
            if (mask[sy * width + sx]) {
              if (sx < minX) minX = sx;
              if (sx > maxX) maxX = sx;
            }
          }
        }
        const w = maxX - minX + 1;
        if (w > width * 0.18) {
          const rotation = checkSlotTilt(mask, width, height, startY, y);
          rawSlots.push({ x: minX, y: startY, width: w, height: h, rotation });
        }
      }
    }
  }

  // Handle slot reaching bottom edge
  if (inSlot) {
    const h = height - startY;
    if (h > height * 0.04) {
      let minX = width, maxX = 0;
      for (let sy = startY; sy < height; sy++) {
        for (let sx = 0; sx < width; sx++) {
          if (mask[sy * width + sx]) {
            if (sx < minX) minX = sx;
            if (sx > maxX) maxX = sx;
          }
        }
      }
      const w = maxX - minX + 1;
      if (w > width * 0.18) {
        const rotation = checkSlotTilt(mask, width, height, startY, height);
        rawSlots.push({ x: minX, y: startY, width: w, height: h, rotation });
      }
    }
  }

  // Fallback if 0 slots found
  if (rawSlots.length === 0) {
    const count = 3;
    const outerM = Math.round(width * 0.08);
    const gap = Math.round(height * 0.02);
    const sW = width - outerM * 2;
    const availH = height - outerM * 2 - (count - 1) * gap;
    const sH = Math.floor(availH / count);
    for (let i = 0; i < count; i++) {
      rawSlots.push({
        x: outerM,
        y: outerM + i * (sH + gap),
        width: sW,
        height: sH,
        rotation: 0
      });
    }
  }

  return { rawSlots, mask, artworkColors };
}

// Theme analyzer for descriptive name and tags
function analyzeTheme(artworkColors, isSlanted, slotCount, filename) {
  let tags = [`${slotCount}-shot`];
  let colorName = 'Classic';
  let moodName = isSlanted ? 'Slanted' : 'Aesthetic';

  if (isSlanted) {
    tags.push('slanted', 'tilted');
  }

  const lower = filename.toLowerCase();
  if (lower.includes('heart')) {
    tags.push('romantic', 'hearts', 'love');
    colorName = 'Sweetheart';
  } else if (lower.includes('ticket') || lower.includes('cinema')) {
    tags.push('vintage', 'ticket', 'retro');
    colorName = 'Cinema Ticket';
  } else if (lower.includes('denim')) {
    tags.push('denim', 'y2k', 'blue');
    colorName = 'Denim Chic';
  } else if (lower.includes('newspaper')) {
    tags.push('vintage', 'newspaper', 'monochrome');
    colorName = 'Gazette Noir';
  } else if (lower.includes('stars')) {
    tags.push('stars', 'aesthetic', 'cute');
    colorName = 'Starry Night';
  } else if (lower.includes('ribbon') || lower.includes('burgundy')) {
    tags.push('romantic', 'ribbon', 'chic');
    colorName = 'Velvet Ribbon';
  }

  if (artworkColors.length > 5) {
    let sumL = 0;
    const hueBuckets = { pink: 0, red: 0, orange: 0, gold: 0, green: 0, cyan: 0, blue: 0, purple: 0 };

    for (const [r, g, b] of artworkColors) {
      const [h, s, l] = rgbToHsl(r, g, b);
      sumL += l;
      if (s > 0.18 && l > 0.12 && l < 0.90) {
        if (h >= 315 || h < 10) hueBuckets.red++;
        else if (h >= 10 && h < 45) hueBuckets.orange++;
        else if (h >= 45 && h < 70) hueBuckets.gold++;
        else if (h >= 70 && h < 165) hueBuckets.green++;
        else if (h >= 165 && h < 210) hueBuckets.cyan++;
        else if (h >= 210 && h < 265) hueBuckets.blue++;
        else if (h >= 265 && h < 315) hueBuckets.purple++;
      }
    }

    const avgL = sumL / artworkColors.length;
    let dominantHue = null, maxCount = 0;
    for (const [hue, cnt] of Object.entries(hueBuckets)) {
      if (cnt > maxCount) { maxCount = cnt; dominantHue = hue; }
    }

    if (maxCount < artworkColors.length * 0.12) {
      if (avgL < 0.28) {
        colorName = 'Midnight Noir';
        tags.push('dark', 'noir', 'minimal');
      } else if (avgL > 0.75) {
        colorName = 'Pearl Minimal';
        tags.push('minimal', 'cream', 'clean');
      } else {
        colorName = 'Silver Slate';
        tags.push('monochrome', 'vintage');
      }
    } else {
      switch (dominantHue) {
        case 'pink':
        case 'red':
          if (avgL > 0.6) { colorName = 'Rose Blush'; tags.push('pink', 'pastel', 'cute'); }
          else { colorName = 'Velvet Crimson'; tags.push('romantic', 'red', 'chic'); }
          break;
        case 'purple':
          colorName = 'Lavender Dream'; tags.push('purple', 'pastel', 'lavender');
          break;
        case 'cyan':
        case 'blue':
          colorName = avgL > 0.6 ? 'Sky Breeze' : 'Deep Indigo'; tags.push('blue', 'aesthetic', 'chic');
          break;
        case 'gold':
        case 'orange':
          colorName = 'Golden Glow'; tags.push('golden', 'vintage', 'warm');
          break;
        case 'green':
          colorName = 'Mint Sage'; tags.push('mint', 'pastel', 'fresh');
          break;
      }
    }
  }

  tags = Array.from(new Set(tags));
  return { colorName, moodName, tags };
}

async function processImage(filePath, idPrefix, filename, nameCounts) {
  const { data, info } = await sharp(filePath).raw().toBuffer({ resolveWithObject: true });
  const { width: origW, height: origH, channels } = info;

  // 1. Detect slots & theme
  const { rawSlots, mask, artworkColors } = extractSlots(data, origW, origH, channels);
  const isSlanted = rawSlots.some(s => s.rotation !== 0);
  const { colorName, moodName, tags } = analyzeTheme(artworkColors, isSlanted, rawSlots.length, filename);

  // 2. Scale target dimension
  const scale = TARGET_WIDTH / origW;
  let targetH = Math.round(origH * scale);
  if (targetH > 4200) targetH = 4200;
  if (targetH < 800) targetH = 800;

  // Exact scaled photo slots with bleed
  const photoSlots = rawSlots.map((s, idx) => {
    const sx = Math.max(0, Math.round(s.x * scale) - BLEED);
    const sy = Math.max(0, Math.round(s.y * scale) - BLEED);
    const sw = Math.min(TARGET_WIDTH - sx, Math.round(s.width * scale) + BLEED * 2);
    const sh = Math.min(targetH - sy, Math.round(s.height * scale) + BLEED * 2);

    return {
      id: `slot-${idx}`,
      x: sx,
      y: sy,
      width: sw,
      height: sh,
      rotation: s.rotation,
      shape: 'rectangle',
      cornerRadius: 0
    };
  });

  // 3. Generate clean overlay RGBA
  const scaled = await sharp(filePath)
    .resize(TARGET_WIDTH, targetH, { kernel: 'lanczos3' })
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

      // 100% transparent cutout for green screen or transparent input
      if (a < 30 || isGreen(r, g, b)) {
        overlayRgba[destIdx + 3] = 0;
      } else {
        // Despill subtle green fringe on edge
        if (g > 110 && g > r && g > b) {
          overlayRgba[destIdx + 1] = Math.round((r + b) / 2);
        }
        overlayRgba[destIdx + 3] = a;
      }
    }
  }

  // Clean template ID
  let rawBase = path.basename(filename, path.extname(filename))
    .toLowerCase()
    .replace(/[^a-z0-9_-]/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '');
  if (rawBase.length > 24) rawBase = rawBase.slice(0, 24).replace(/-$/, '');
  const templateId = `${idPrefix}-${rawBase}`;

  const outOverlayFileName = `${templateId}-overlay.png`;
  const outOverlayPath = path.join(OUTPUT_DIR, outOverlayFileName);
  const outThumbFileName = `${templateId}-overlay-thumb.webp`;
  const outThumbPath = path.join(THUMBS_DIR, outThumbFileName);

  // Save overlay PNG
  await sharp(overlayRgba, { raw: { width: sW, height: sH, channels: 4 } })
    .png({ compressionLevel: 8 })
    .toFile(outOverlayPath);

  // Save WebP thumbnail
  await sharp(overlayRgba, { raw: { width: sW, height: sH, channels: 4 } })
    .resize(260, null, { fit: 'inside' })
    .webp({ quality: 80, effort: 4 })
    .toFile(outThumbPath);

  const baseTitle = `${colorName} ${moodName} Strip (${rawSlots.length}-Shot)`;
  nameCounts[baseTitle] = (nameCounts[baseTitle] || 0) + 1;
  const finalName = nameCounts[baseTitle] > 1 ? `${baseTitle} #${nameCounts[baseTitle]}` : baseTitle;

  return {
    id: templateId,
    name: finalName,
    category: 'custom',
    supportedPhotoCounts: [photoSlots.length],
    supportedOrientations: ['vertical'],
    canvas: { width: sW, height: sH },
    overlayImageUrl: `/templates/${outOverlayFileName}`,
    thumbnailUrl: `/templates/thumbs/${outThumbFileName}`,
    background: { type: 'solid', color: '#FAF5EC' },
    border: { type: 'none' },
    spacing: { outerMargin: 0, photoSpacing: 20, padding: 0 },
    photoSlots,
    textElements: [],
    tags
  };
}

async function run() {
  console.log('Extracting all templates accurately...');
  const nameCounts = {};
  const allTemplates = [];

  // 1. Process root templates in template_images/ (63 files)
  const rootFiles = fs.readdirSync(INPUT_ROOT).filter(f => {
    const stat = fs.statSync(path.join(INPUT_ROOT, f));
    return stat.isFile() && !f.endsWith('.lnk') && /\.(png|jpg|jpeg|webp)$/i.test(f);
  });

  console.log(`Processing ${rootFiles.length} root template files from template_images/...`);
  for (let i = 0; i < rootFiles.length; i++) {
    const f = rootFiles[i];
    try {
      const t = await processImage(path.join(INPUT_ROOT, f), 'template-img', f, nameCounts);
      allTemplates.push(t);
      if ((i + 1) % 15 === 0 || i === rootFiles.length - 1) {
        console.log(`  [Root ${i + 1}/${rootFiles.length}] ${t.name} (${t.photoSlots.length} slots)`);
      }
    } catch (err) {
      console.error(`  Error on ${f}:`, err.message);
    }
  }

  // 2. Process removed_backgrounds templates (277 files)
  const rbFiles = fs.readdirSync(INPUT_REMOVED).filter(f => {
    const stat = fs.statSync(path.join(INPUT_REMOVED, f));
    return stat.isFile() && !f.endsWith('.lnk') && /\.(png|jpg|jpeg|webp)$/i.test(f);
  });

  console.log(`\nProcessing ${rbFiles.length} cutout files from template_images/removed_backgrounds/...`);
  for (let i = 0; i < rbFiles.length; i++) {
    const f = rbFiles[i];
    try {
      const t = await processImage(path.join(INPUT_REMOVED, f), 'custom-rb', f, nameCounts);
      allTemplates.push(t);
      if ((i + 1) % 50 === 0 || i === rbFiles.length - 1) {
        console.log(`  [Cutouts ${i + 1}/${rbFiles.length}] ${t.name} (${t.photoSlots.length} slots)`);
      }
    } catch (err) {
      console.error(`  Error on ${f}:`, err.message);
    }
  }

  // Deduplicate by ID
  const uniqueTemplates = allTemplates.filter((t, idx, self) =>
    idx === self.findIndex(o => o.id === t.id)
  );

  const slantedCount = uniqueTemplates.filter(t => t.tags.includes('slanted')).length;
  console.log(`\nDone! Successfully processed ${uniqueTemplates.length} total templates!`);
  console.log(`Genuinely slanted templates: ${slantedCount}`);

  // Write TypeScript file
  const tsContent = `import type { Template } from '@/types'\n\n/**\n * Auto-extracted photobooth templates with pixel-accurate slots and clean green cutouts\n * Total templates: ${uniqueTemplates.length}\n * Slanted templates: ${slantedCount}\n */\nexport const BATCH_GENERATED_TEMPLATES: Template[] = ${JSON.stringify(uniqueTemplates, null, 2)}\n`;

  const tsPath = path.join(ROOT_DIR, 'src', 'templates', 'batchGeneratedTemplates.ts');
  fs.writeFileSync(tsPath, tsContent, 'utf-8');
  console.log(`Saved batchGeneratedTemplates.ts with ${uniqueTemplates.length} templates.`);
}

run().catch(console.error);

const sharp = require('sharp');
const fs = require('fs');
const path = require('path');

const ROOT_DIR = path.resolve(__dirname, '..');
const INPUT_DIR = path.join(ROOT_DIR, 'template_images', 'removed_backgrounds');
const OUTPUT_DIR = path.join(ROOT_DIR, 'public', 'templates');
const THUMBS_DIR = path.join(OUTPUT_DIR, 'thumbs');
const TARGET_WIDTH = 1200;
const BLEED = 6;

if (!fs.existsSync(OUTPUT_DIR)) fs.mkdirSync(OUTPUT_DIR, { recursive: true });
if (!fs.existsSync(THUMBS_DIR)) fs.mkdirSync(THUMBS_DIR, { recursive: true });

function isGreen(r, g, b) {
  return (g > 85 && g > r * 1.15 && g > b * 1.15) ||
         (g > 130 && r < 130 && b < 130) ||
         (g > 100 && r < 80 && b < 80);
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

// Detect slots and slant angles
function detectSlots(data, width, height, channels) {
  const mask = new Uint8Array(width * height);
  const artworkColors = [];

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const idx = (y * width + x) * channels;
      const r = data[idx], g = data[idx + 1], b = data[idx + 2];
      const a = channels === 4 ? data[idx + 3] : 255;

      if (a > 30) {
        if (isGreen(r, g, b)) {
          mask[y * width + x] = 1;
        } else if (x % 10 === 0 && y % 10 === 0) {
          artworkColors.push([r, g, b]);
        }
      }
    }
  }

  // Connected components BFS
  const visited = new Uint8Array(width * height);
  const components = [];
  const minPixels = Math.max(50, Math.floor(width * height * 0.012));

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const pos = y * width + x;
      if (mask[pos] && !visited[pos]) {
        const queue = [pos];
        visited[pos] = 1;
        const pixels = [];
        let head = 0;

        while (head < queue.length) {
          const curr = queue[head++];
          const cy = Math.floor(curr / width);
          const cx = curr % width;
          pixels.push({ x: cx, y: cy });

          const neighbors = [
            curr - 1, curr + 1,
            curr - width, curr + width,
            curr - width - 1, curr - width + 1,
            curr + width - 1, curr + width + 1
          ];

          for (const n of neighbors) {
            if (n >= 0 && n < width * height && mask[n] && !visited[n]) {
              visited[n] = 1;
              queue.push(n);
            }
          }
        }

        if (pixels.length >= minPixels) {
          let sumX = 0, sumY = 0;
          for (const px of pixels) {
            sumX += px.x; sumY += px.y;
          }
          const cx = sumX / pixels.length;
          const cy = sumY / pixels.length;

          // Second central moments for rotation angle
          let u20 = 0, u02 = 0, u11 = 0;
          for (const px of pixels) {
            const dx = px.x - cx;
            const dy = px.y - cy;
            u20 += dx * dx; u02 += dy * dy; u11 += dx * dy;
          }

          let theta = 0.5 * Math.atan2(2 * u11, u20 - u02);
          let angleDeg = (theta * 180) / Math.PI;
          let uprightAngle = angleDeg;
          while (uprightAngle > 45) uprightAngle -= 90;
          while (uprightAngle < -45) uprightAngle += 90;

          const cos = Math.cos(uprightAngle * Math.PI / 180);
          const sin = Math.sin(uprightAngle * Math.PI / 180);

          let minU = Infinity, maxU = -Infinity;
          let minV = Infinity, maxV = -Infinity;

          for (const px of pixels) {
            const dx = px.x - cx;
            const dy = px.y - cy;
            const u = dx * cos + dy * sin;
            const v = -dx * sin + dy * cos;
            if (u < minU) minU = u;
            if (u > maxU) maxU = u;
            if (v < minV) minV = v;
            if (v > maxV) maxV = v;
          }

          const rotWidth = maxU - minU;
          const rotHeight = maxV - minV;

          components.push({
            cx, cy,
            rotWidth, rotHeight,
            rotation: Math.abs(uprightAngle) >= 1.5 ? Number(uprightAngle.toFixed(1)) : 0,
            pixels: pixels.length
          });
        }
      }
    }
  }

  components.sort((a, b) => a.cy - b.cy);

  // Fallback if no components detected
  if (components.length === 0) {
    const count = 3;
    const outerM = Math.round(width * 0.08);
    const gap = Math.round(height * 0.02);
    const sW = width - outerM * 2;
    const availH = height - outerM * 2 - (count - 1) * gap;
    const sH = Math.floor(availH / count);
    for (let i = 0; i < count; i++) {
      components.push({
        cx: width / 2,
        cy: outerM + i * (sH + gap) + sH / 2,
        rotWidth: sW,
        rotHeight: sH,
        rotation: 0,
        pixels: sW * sH
      });
    }
  }

  return { components, artworkColors };
}

// Analyze artwork colors to produce aesthetic theme and tags
function analyzeTheme(artworkColors, isSlanted, slotCount, filename) {
  let tags = [`${slotCount}-shot`];
  let colorName = 'Classic';
  let moodName = isSlanted ? 'Slanted' : 'Aesthetic';

  if (isSlanted) {
    tags.push('slanted', 'tilted');
  }

  // Check specific filename cues
  const lower = filename.toLowerCase();
  if (lower.includes('heart')) {
    tags.push('romantic', 'hearts', 'love');
    colorName = 'Sweetheart';
  } else if (lower.includes('ticket') || lower.includes('cinema')) {
    tags.push('vintage', 'ticket', 'retro');
    colorName = 'Cinema Ticket';
  } else if (lower.includes('denim')) {
    tags.push('denim', 'y2k', 'blue');
    colorName = 'Denim Blue';
  } else if (lower.includes('newspaper')) {
    tags.push('vintage', 'newspaper', 'monochrome');
    colorName = 'Gazette Noir';
  }

  if (artworkColors.length > 5) {
    let sumL = 0, sumS = 0;
    const hueBuckets = {
      pink: 0,
      red: 0,
      orange: 0,
      gold: 0,
      green: 0,
      cyan: 0,
      blue: 0,
      purple: 0
    };

    for (const [r, g, b] of artworkColors) {
      const [h, s, l] = rgbToHsl(r, g, b);
      sumL += l;
      sumS += s;

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
    const avgS = sumS / artworkColors.length;

    // Find dominant hue
    let dominantHue = null;
    let maxCount = 0;
    for (const [hue, cnt] of Object.entries(hueBuckets)) {
      if (cnt > maxCount) {
        maxCount = cnt;
        dominantHue = hue;
      }
    }

    if (maxCount < artworkColors.length * 0.12) {
      // Neutral palette
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
          if (avgL > 0.6) {
            colorName = 'Rose Blush';
            tags.push('pink', 'pastel', 'cute');
          } else {
            colorName = 'Velvet Crimson';
            tags.push('romantic', 'red', 'chic');
          }
          break;
        case 'purple':
          colorName = 'Lavender Dream';
          tags.push('purple', 'pastel', 'lavender');
          break;
        case 'cyan':
        case 'blue':
          colorName = avgL > 0.6 ? 'Sky Breeze' : 'Deep Indigo';
          tags.push('blue', 'aesthetic', 'chic');
          break;
        case 'gold':
        case 'orange':
          colorName = 'Golden Glow';
          tags.push('golden', 'vintage', 'warm');
          break;
        case 'green':
          colorName = 'Mint Sage';
          tags.push('mint', 'pastel', 'fresh');
          break;
      }
    }
  }

  // Deduplicate tags
  tags = Array.from(new Set(tags));
  return { colorName, moodName, tags };
}

async function rebuildAll() {
  const files = fs.readdirSync(INPUT_DIR).filter(f => {
    const stat = fs.statSync(path.join(INPUT_DIR, f));
    return stat.isFile() && !f.endsWith('.lnk') && /\.(png|jpg|jpeg|webp)$/i.test(f);
  });

  console.log(`Starting extraction of ${files.length} clean green-screen templates from removed_backgrounds/...`);

  const createdTemplates = [];
  const nameCounts = {};

  for (let fIdx = 0; fIdx < files.length; fIdx++) {
    const file = files[fIdx];
    const filePath = path.join(INPUT_DIR, file);

    try {
      const { data, info } = await sharp(filePath).raw().toBuffer({ resolveWithObject: true });
      const { width: origW, height: origH, channels } = info;

      // 1. Detect slots & theme in original resolution
      const { components, artworkColors } = detectSlots(data, origW, origH, channels);
      const isSlanted = components.some(c => c.rotation !== 0);
      const { colorName, moodName, tags } = analyzeTheme(artworkColors, isSlanted, components.length, file);

      // 2. Scale target dimension
      const scale = TARGET_WIDTH / origW;
      let targetH = Math.round(origH * scale);
      if (targetH > 4200) targetH = 4200;
      if (targetH < 800) targetH = 800;

      // Scale slot coordinates with bleed
      const photoSlots = components.map((c, sIdx) => {
        const cx_s = c.cx * scale;
        const cy_s = c.cy * scale;
        const w_s = Math.round(c.rotWidth * scale + BLEED * 2);
        const h_s = Math.round(c.rotHeight * scale + BLEED * 2);
        const x = Math.max(0, Math.round(cx_s - w_s / 2));
        const y = Math.max(0, Math.round(cy_s - h_s / 2));

        return {
          id: `slot-${sIdx}`,
          x,
          y,
          width: w_s,
          height: h_s,
          rotation: c.rotation,
          shape: 'rectangle',
          cornerRadius: 0
        };
      });

      // 3. Generate clean overlay RGBA at TARGET_WIDTH x targetH
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

          if (a < 30 || isGreen(r, g, b)) {
            overlayRgba[destIdx + 3] = 0; // Transparent cutout for photo aperture
          } else {
            // Despill green fringe on edges if any
            if (g > 110 && g > r && g > b) {
              overlayRgba[destIdx + 1] = Math.round((r + b) / 2);
            }
            overlayRgba[destIdx + 3] = a;
          }
        }
      }

      // Generate Clean ID
      let rawBase = path.basename(file, path.extname(file))
        .toLowerCase()
        .replace(/[^a-z0-9_-]/g, '-')
        .replace(/-+/g, '-')
        .replace(/^-|-$/g, '');
      if (rawBase.length > 24) rawBase = rawBase.slice(0, 24).replace(/-$/, '');
      const templateId = `custom-rb-${rawBase}`;

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

      // Generate unique aesthetic title
      const baseTitle = `${colorName} ${moodName} Strip (${components.length}-Shot)`;
      nameCounts[baseTitle] = (nameCounts[baseTitle] || 0) + 1;
      const finalName = nameCounts[baseTitle] > 1 ? `${baseTitle} #${nameCounts[baseTitle]}` : baseTitle;

      createdTemplates.push({
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
      });

      if ((fIdx + 1) % 25 === 0 || fIdx === files.length - 1) {
        console.log(`  Processed [${fIdx + 1}/${files.length}] templates... (Latest: "${finalName}", ${photoSlots.length} slots, slanted: ${isSlanted})`);
      }
    } catch (err) {
      console.error(`  ✗ Error processing ${file}:`, err.message);
    }
  }

  console.log(`\nSuccessfully created ${createdTemplates.length} clean templates!`);
  const slantedCount = createdTemplates.filter(t => t.tags.includes('slanted')).length;
  console.log(`Templates with slanted slots: ${slantedCount}`);

  // Write TypeScript file
  const tsContent = `import type { Template } from '@/types'\n\n/**\n * Auto-extracted templates from template_images/removed_backgrounds with green screen cutouts & slant detection\n * Total templates: ${createdTemplates.length}\n * Slanted templates: ${slantedCount}\n */\nexport const BATCH_GENERATED_TEMPLATES: Template[] = ${JSON.stringify(createdTemplates, null, 2)}\n`;

  const tsPath = path.join(ROOT_DIR, 'src', 'templates', 'batchGeneratedTemplates.ts');
  fs.writeFileSync(tsPath, tsContent, 'utf-8');
  console.log(`Saved batchGeneratedTemplates.ts to ${tsPath}`);
}

rebuildAll().catch(console.error);

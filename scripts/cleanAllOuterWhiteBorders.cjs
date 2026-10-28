const sharp = require('sharp');
const fs = require('fs');
const path = require('path');

const ROOT_DIR = path.resolve(__dirname, '..');
const TEMPLATES_DIR = path.join(ROOT_DIR, 'public', 'templates');
const THUMBS_DIR = path.join(TEMPLATES_DIR, 'thumbs');
const BATCH_TS = path.join(ROOT_DIR, 'src', 'templates', 'batchGeneratedTemplates.ts');

function isOuterBackground(r, g, b, a) {
  if (a < 30) return true; // already transparent
  const maxDiff = Math.max(Math.abs(r - g), Math.abs(r - b), Math.abs(g - b));
  // Solid white or near-white / pale gray
  if (r >= 215 && g >= 215 && b >= 215 && maxDiff <= 24) return true;
  // Light cream / warm paper background
  if (r >= 205 && g >= 195 && b >= 165 && r >= g && g >= b && (r - b) <= 45 && maxDiff <= 32) return true;
  // Pale edge drop shadow
  if (r >= 170 && g >= 165 && b >= 155 && maxDiff <= 18) return true;
  return false;
}

// Load template slot definitions
function loadTemplates() {
  const templateSlots = {};
  if (!fs.existsSync(BATCH_TS)) return templateSlots;

  try {
    const fc = fs.readFileSync(BATCH_TS, 'utf8');
    const startIdx = fc.search(/\[\s*\{/);
    const endIdx = fc.lastIndexOf(']');
    const list = JSON.parse(fc.substring(startIdx, endIdx + 1));
    for (const t of list) {
      if (t.overlayImageUrl) {
        const base = path.basename(t.overlayImageUrl);
        templateSlots[base] = t.photoSlots || [];
      }
    }
  } catch (err) {
    console.warn('Could not parse batchGeneratedTemplates.ts for slot bounding boxes:', err.message);
  }
  return templateSlots;
}

async function cleanOverlay(filename, knownSlots) {
  const filePath = path.join(TEMPLATES_DIR, filename);
  const { data, info } = await sharp(filePath).raw().toBuffer({ resolveWithObject: true });
  const { width, height } = info;

  // Step 1: Pre-clean thin 1-6px outer scan lines / border lines
  // Left edge
  for (let edgeX = 0; edgeX <= 5; edgeX++) {
    let edgeDark = 0, innerBg = 0;
    for (let y = Math.floor(height * 0.1); y < Math.floor(height * 0.9); y += 8) {
      const idxE = (y * width + edgeX) * 4;
      const idxI = (y * width + 15) * 4;
      if (data[idxE + 3] > 30 && !isOuterBackground(data[idxE], data[idxE+1], data[idxE+2], data[idxE+3])) edgeDark++;
      if (isOuterBackground(data[idxI], data[idxI+1], data[idxI+2], data[idxI+3])) innerBg++;
    }
    if (edgeDark > 15 && innerBg > 15) {
      for (let y = 0; y < height; y++) {
        data[(y * width + edgeX) * 4 + 3] = 0;
      }
    }
  }

  // Right edge
  for (let edgeX = width - 1; edgeX >= width - 6; edgeX--) {
    let edgeDark = 0, innerBg = 0;
    for (let y = Math.floor(height * 0.1); y < Math.floor(height * 0.9); y += 8) {
      const idxE = (y * width + edgeX) * 4;
      const idxI = (y * width + (width - 16)) * 4;
      if (data[idxE + 3] > 30 && !isOuterBackground(data[idxE], data[idxE+1], data[idxE+2], data[idxE+3])) edgeDark++;
      if (isOuterBackground(data[idxI], data[idxI+1], data[idxI+2], data[idxI+3])) innerBg++;
    }
    if (edgeDark > 15 && innerBg > 15) {
      for (let y = 0; y < height; y++) {
        data[(y * width + edgeX) * 4 + 3] = 0;
      }
    }
  }

  // Top edge
  for (let edgeY = 0; edgeY <= 5; edgeY++) {
    let edgeDark = 0, innerBg = 0;
    for (let x = Math.floor(width * 0.1); x < Math.floor(width * 0.9); x += 8) {
      const idxE = (edgeY * width + x) * 4;
      const idxI = (15 * width + x) * 4;
      if (data[idxE + 3] > 30 && !isOuterBackground(data[idxE], data[idxE+1], data[idxE+2], data[idxE+3])) edgeDark++;
      if (isOuterBackground(data[idxI], data[idxI+1], data[idxI+2], data[idxI+3])) innerBg++;
    }
    if (edgeDark > 15 && innerBg > 15) {
      for (let x = 0; x < width; x++) {
        data[(edgeY * width + x) * 4 + 3] = 0;
      }
    }
  }

  // Bottom edge
  for (let edgeY = height - 1; edgeY >= height - 6; edgeY--) {
    let edgeDark = 0, innerBg = 0;
    for (let x = Math.floor(width * 0.1); x < Math.floor(width * 0.9); x += 8) {
      const idxE = (edgeY * width + x) * 4;
      const idxI = ((height - 16) * width + x) * 4;
      if (data[idxE + 3] > 30 && !isOuterBackground(data[idxE], data[idxE+1], data[idxE+2], data[idxE+3])) edgeDark++;
      if (isOuterBackground(data[idxI], data[idxI+1], data[idxI+2], data[idxI+3])) innerBg++;
    }
    if (edgeDark > 15 && innerBg > 15) {
      for (let x = 0; x < width; x++) {
        data[(edgeY * width + x) * 4 + 3] = 0;
      }
    }
  }

  // Step 2: Seed perimeter for BFS
  const visited = new Uint8Array(width * height);
  const queue = [];

  for (let x = 0; x < width; x++) {
    const idxT = x * 4;
    if (isOuterBackground(data[idxT], data[idxT+1], data[idxT+2], data[idxT+3])) {
      visited[x] = 1; queue.push(x);
    }
    const posB = (height - 1) * width + x;
    const idxB = posB * 4;
    if (isOuterBackground(data[idxB], data[idxB+1], data[idxB+2], data[idxB+3])) {
      visited[posB] = 1; queue.push(posB);
    }
  }

  for (let y = 0; y < height; y++) {
    const posL = y * width;
    const idxL = posL * 4;
    if (!visited[posL] && isOuterBackground(data[idxL], data[idxL+1], data[idxL+2], data[idxL+3])) {
      visited[posL] = 1; queue.push(posL);
    }
    const posR = y * width + (width - 1);
    const idxR = posR * 4;
    if (!visited[posR] && isOuterBackground(data[idxR], data[idxR+1], data[idxR+2], data[idxR+3])) {
      visited[posR] = 1; queue.push(posR);
    }
  }

  if (queue.length === 0) return { modified: false, pixels: 0 };

  // Step 3: BFS Flood Fill with slot interior protection
  let head = 0;
  while (head < queue.length) {
    const curr = queue[head++];
    const cy = Math.floor(curr / width);
    const cx = curr % width;

    const neighbors = [ curr - 1, curr + 1, curr - width, curr + width ];
    for (const n of neighbors) {
      if (n >= 0 && n < width * height && !visited[n]) {
        const ny = Math.floor(n / width);
        const nx = n % width;
        if (Math.abs(nx - cx) <= 1 && Math.abs(ny - cy) <= 1) {
          // If known slots exist, protect inner slot area
          let inSlotInterior = false;
          if (knownSlots && knownSlots.length > 0) {
            for (const s of knownSlots) {
              if (nx >= s.x + 8 && nx <= s.x + s.width - 8 &&
                  ny >= s.y + 8 && ny <= s.y + s.height - 8) {
                inSlotInterior = true;
                break;
              }
            }
          }
          if (inSlotInterior) continue;

          const idx = n * 4;
          if (isOuterBackground(data[idx], data[idx+1], data[idx+2], data[idx+3])) {
            visited[n] = 1;
            queue.push(n);
          }
        }
      }
    }
  }

  // Safety threshold: if flood fill took more than 35% of image, verify we didn't eat a whole strip
  if (queue.length > width * height * 0.35 && (!knownSlots || knownSlots.length === 0)) {
    console.log(`  Skipping ${filename} (flood filled ${(queue.length / (width*height)*100).toFixed(1)}% - safety limit)`);
    return { modified: false, pixels: 0 };
  }

  // Step 4: Zero out flooded pixels
  let newlyZeroed = 0;
  for (let i = 0; i < queue.length; i++) {
    const idx = queue[i] * 4;
    if (data[idx + 3] > 0) newlyZeroed++;
    data[idx + 3] = 0;
  }

  // Step 5: Feather/despill the 1-2px edge boundary next to flooded pixels
  for (let i = 0; i < queue.length; i++) {
    const curr = queue[i];
    const cy = Math.floor(curr / width);
    const cx = curr % width;
    const neighbors = [ curr - 1, curr + 1, curr - width, curr + width ];
    for (const n of neighbors) {
      if (n >= 0 && n < width * height && !visited[n]) {
        const ny = Math.floor(n / width);
        const nx = n % width;
        if (Math.abs(nx - cx) <= 1 && Math.abs(ny - cy) <= 1) {
          const idx = n * 4;
          const r = data[idx], g = data[idx+1], b = data[idx+2];
          // Clear white/light gray halo
          if (r >= 170 && g >= 170 && b >= 170) {
            data[idx + 3] = 0;
            visited[n] = 1;
            newlyZeroed++;
          }
        }
      }
    }
  }

  if (newlyZeroed < 100) {
    return { modified: false, pixels: 0 };
  }

  // Step 6: Save cleaned overlay PNG
  await sharp(data, { raw: { width, height, channels: 4 } })
    .png({ compressionLevel: 8 })
    .toFile(filePath);

  // Step 7: Update/Regenerate WebP thumbnail
  const thumbBase = filename.replace(/\.png$/i, '-thumb.webp');
  const thumbPath = path.join(THUMBS_DIR, thumbBase);
  await sharp(data, { raw: { width, height, channels: 4 } })
    .resize(260, null, { fit: 'inside' })
    .webp({ quality: 80, effort: 4 })
    .toFile(thumbPath);

  return { modified: true, pixels: newlyZeroed, pct: ((newlyZeroed / (width * height)) * 100).toFixed(1) };
}

async function run() {
  console.log('=== Batch Outer White Border & Edge Line Removal ===');
  const slotMap = loadTemplates();
  console.log(`Loaded slot coordinates for ${Object.keys(slotMap).length} templates.`);

  const allFiles = fs.readdirSync(TEMPLATES_DIR)
    .filter(f => f.endsWith('-overlay.png'))
    .sort();

  console.log(`Found ${allFiles.length} overlay files in ${TEMPLATES_DIR}.`);

  let modifiedCount = 0;
  let totalPixelsCleaned = 0;

  for (let i = 0; i < allFiles.length; i++) {
    const f = allFiles[i];
    const knownSlots = slotMap[f] || [];
    try {
      const res = await cleanOverlay(f, knownSlots);
      if (res.modified) {
        modifiedCount++;
        totalPixelsCleaned += res.pixels;
        if (modifiedCount <= 10 || modifiedCount % 25 === 0 || i === allFiles.length - 1) {
          console.log(`[${i+1}/${allFiles.length}] Cleaned ${f}: removed ${res.pixels} px (${res.pct}%)`);
        }
      }
    } catch (err) {
      console.error(`Error processing ${f}:`, err.message);
    }
  }

  console.log('\n=== COMPLETE ===');
  console.log(`Total overlays processed: ${allFiles.length}`);
  console.log(`Total overlays cleaned: ${modifiedCount}`);
  console.log(`Total background pixels cut out: ${totalPixelsCleaned}`);
}

run();

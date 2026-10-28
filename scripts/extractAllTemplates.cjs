const fs = require('fs');
const path = require('path');
const sharp = require('sharp');

const ROOT_DIR = path.resolve(__dirname, '..');
const INPUT_DIR = path.join(ROOT_DIR, 'template_images');
const OUTPUT_DIR = path.join(ROOT_DIR, 'public', 'templates');
const TARGET_WIDTH = 1200;

if (!fs.existsSync(OUTPUT_DIR)) {
  fs.mkdirSync(OUTPUT_DIR, { recursive: true });
}

// Check green chroma key
function isGreenPixel(r, g, b) {
  // Chroma green: dominant green channel
  return (g > 70 && g > r * 1.20 && g > b * 1.20) ||
         (g > 140 && r < 120 && b < 120);
}

// Detect background color from 4 corners
function getCornerBg(data, width, height, channels) {
  const corners = [
    0,
    (width - 1) * channels,
    (height - 1) * width * channels,
    ((height - 1) * width + width - 1) * channels,
  ];

  let transparentCorners = 0;
  if (channels === 4) {
    for (const c of corners) {
      if (data[c + 3] < 30) transparentCorners++;
    }
  }
  const isTransparent = transparentCorners >= 2;

  let rSum = 0, gSum = 0, bSum = 0, count = 0;
  for (const c of corners) {
    if (channels === 4 && data[c + 3] < 30) continue;
    rSum += data[c];
    gSum += data[c + 1];
    bSum += data[c + 2];
    count++;
  }
  const bgR = count > 0 ? Math.round(rSum / count) : 255;
  const bgG = count > 0 ? Math.round(gSum / count) : 255;
  const bgB = count > 0 ? Math.round(bSum / count) : 255;

  return { isTransparent, bgR, bgG, bgB };
}

// Find horizontal strip segments (separating 2 or more strips side-by-side)
function findHorizontalStripSegments(data, width, height, channels, bg) {
  const colActivity = new Float32Array(width);

  for (let x = 0; x < width; x++) {
    let active = 0;
    // Sample vertical middle 80%
    const startY = Math.floor(height * 0.1);
    const endY = Math.floor(height * 0.9);
    for (let y = startY; y < endY; y++) {
      const idx = (y * width + x) * channels;
      if (bg.isTransparent) {
        if (data[idx + 3] > 30) active++;
      } else {
        const dist = Math.abs(data[idx] - bg.bgR) + Math.abs(data[idx + 1] - bg.bgG) + Math.abs(data[idx + 2] - bg.bgB);
        if (dist > 30) active++;
      }
    }
    colActivity[x] = active / (endY - startY);
  }

  // Smooth horizontally
  const smooth = new Float32Array(width);
  const radius = Math.max(2, Math.floor(width * 0.005));
  for (let x = 0; x < width; x++) {
    let sum = 0, n = 0;
    for (let dx = -radius; dx <= radius; dx++) {
      const nx = x + dx;
      if (nx >= 0 && nx < width) { sum += colActivity[nx]; n++; }
    }
    smooth[x] = sum / n;
  }

  // Find active column clusters
  const threshold = bg.isTransparent ? 0.06 : 0.12;
  const activeCols = [];
  for (let x = 0; x < width; x++) {
    if (smooth[x] > threshold) activeCols.push(x);
  }

  if (activeCols.length === 0) {
    return [{ startX: 0, endX: width - 1 }];
  }

  // Detect separate strips if there is a real gap between multiple strips
  const minGap = Math.max(20, Math.floor(width * 0.04));
  const minStripW = Math.max(80, Math.floor(width * 0.22));

  const spans = [];
  let segStart = activeCols[0];
  let prev = activeCols[0];

  for (let i = 1; i < activeCols.length; i++) {
    const cur = activeCols[i];
    if (cur - prev > minGap) {
      if (prev - segStart >= minStripW) {
        spans.push({ startX: segStart, endX: prev });
      }
      segStart = cur;
    }
    prev = cur;
  }
  if (prev - segStart >= minStripW) {
    spans.push({ startX: segStart, endX: prev });
  }

  // If no spans met minStripW, return full width
  if (spans.length === 0) {
    return [{ startX: 0, endX: width - 1 }];
  }

  return spans;
}

// Find vertical bounds of strip within a horizontal span
function findVerticalBounds(data, width, height, channels, startX, endX, bg) {
  const spanW = endX - startX + 1;
  let minY = height, maxY = 0;

  for (let y = 0; y < height; y++) {
    let active = 0;
    for (let x = startX; x <= endX; x++) {
      const idx = (y * width + x) * channels;
      if (bg.isTransparent) {
        if (data[idx + 3] > 30) active++;
      } else {
        const dist = Math.abs(data[idx] - bg.bgR) + Math.abs(data[idx + 1] - bg.bgG) + Math.abs(data[idx + 2] - bg.bgB);
        if (dist > 30) active++;
      }
    }
    if (active > spanW * 0.08) {
      if (y < minY) minY = y;
      if (y > maxY) maxY = y;
    }
  }

  if (maxY <= minY) {
    return { minY: 0, maxY: height - 1 };
  }

  // Add small 2px margin if available
  minY = Math.max(0, minY - 2);
  maxY = Math.min(height - 1, maxY + 2);

  return { minY, maxY };
}

// Detect photo slots in a cropped strip
function detectSlots(data, width, height, channels) {
  // 1. Mark slot pixels (green chroma key OR transparent)
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

  // 2. Count slot pixels per row
  const rowCounts = new Int32Array(height);
  for (let y = 0; y < height; y++) {
    let cnt = 0;
    for (let x = 0; x < width; x++) {
      if (slotMask[y * width + x]) cnt++;
    }
    rowCounts[y] = cnt;
  }

  // 3. Cluster contiguous rows into slot regions
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
        if (slotW > width * 0.25) {
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
      if (slotW > width * 0.25) {
        rawSlots.push({
          x: minX,
          y: startY,
          width: slotW,
          height: slotH,
        });
      }
    }
  }

  return { rawSlots, slotMask };
}

module.exports = {
  findHorizontalStripSegments,
  findVerticalBounds,
  detectSlots,
  isGreenPixel,
  getCornerBg,
  TARGET_WIDTH,
  INPUT_DIR,
  OUTPUT_DIR,
};

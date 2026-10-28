const sharp = require('sharp');
const path = require('path');
const fs = require('fs');

// Ensure destination directories exist
const STICKERS_BASE = 'c:/projects/Photobooth/public/stickers';

const CATEGORIES = {
  streetwear: { name: 'Streetwear & Skate', icon: '🛹' },
  retro: { name: 'Retro & Vintage', icon: '📻' },
  pop_culture: { name: 'Pop Culture & Anime', icon: '⚡' },
  motorsport: { name: 'Cars & Garage', icon: '🏎️' },
  music_misc: { name: 'Music & Vibes', icon: '🎸' }
};

// Advanced sticker extraction algorithm using edge & luminance segmentation
async function extractStickersFromSheet(imagePath, options = {}) {
  const {
    padding = 6,
    minArea = 450,
    minDim = 30,
    bgTolerance = 24
  } = options;

  const { data, info } = await sharp(imagePath).raw().toBuffer({ resolveWithObject: true });
  const { width, height, channels } = info;

  // Step 1: Detect background color by sampling boundary
  const samples = [];
  for (let x = 0; x < width; x += 3) {
    samples.push(getPixel(0, x));
    samples.push(getPixel(height - 1, x));
  }
  for (let y = 0; y < height; y += 3) {
    samples.push(getPixel(y, 0));
    samples.push(getPixel(y, width - 1));
  }

  function getPixel(y, x) {
    const idx = (y * width + x) * channels;
    return [data[idx], data[idx + 1], data[idx + 2], channels === 4 ? data[idx + 3] : 255];
  }

  let totalR = 0, totalG = 0, totalB = 0, totalA = 0;
  for (const s of samples) {
    totalR += s[0]; totalG += s[1]; totalB += s[2]; totalA += s[3];
  }
  const avgR = totalR / samples.length;
  const avgG = totalG / samples.length;
  const avgB = totalB / samples.length;
  const avgA = totalA / samples.length;

  console.log(`Sheet: ${path.basename(imagePath)} - Bg Sample: R=${Math.round(avgR)}, G=${Math.round(avgG)}, B=${Math.round(avgB)}`);

  // Step 2: Flood-fill outer background mask
  const bgMask = new Uint8Array(width * height); // 1 = background, 0 = foreground/sticker

  function isBackgroundPixel(y, x) {
    const p = getPixel(y, x);
    if (channels === 4 && p[3] < 20) return true; // transparent

    // If outer background is white
    if (avgR > 240 && avgG > 240 && avgB > 240) {
      // Must be pure white / near white
      return p[0] >= 244 && p[1] >= 244 && p[2] >= 244;
    }

    // If outer background is light gray (e.g. #E0E0E0 - #EDEDED)
    if (avgR >= 210 && avgR <= 245) {
      const dist = Math.sqrt((p[0] - avgR)**2 + (p[1] - avgG)**2 + (p[2] - avgB)**2);
      const isGrayish = Math.abs(p[0] - p[1]) < 8 && Math.abs(p[1] - p[2]) < 8;
      // Gray background or transparent or checkerboard
      return (dist < bgTolerance) || (isGrayish && p[0] >= 215 && p[0] <= 246);
    }

    const dist = Math.sqrt((p[0] - avgR)**2 + (p[1] - avgG)**2 + (p[2] - avgB)**2);
    return dist < bgTolerance;
  }

  // Queue-based flood fill from image perimeter
  const queue = [];
  for (let x = 0; x < width; x++) {
    queue.push(0 * width + x);
    queue.push((height - 1) * width + x);
  }
  for (let y = 0; y < height; y++) {
    queue.push(y * width + 0);
    queue.push(y * width + (width - 1));
  }

  let head = 0;
  while (head < queue.length) {
    const curr = queue[head++];
    if (bgMask[curr] !== 0) continue;
    const cy = Math.floor(curr / width);
    const cx = curr % width;

    if (isBackgroundPixel(cy, cx)) {
      bgMask[curr] = 1;
      if (cx > 0 && bgMask[curr - 1] === 0) queue.push(curr - 1);
      if (cx < width - 1 && bgMask[curr + 1] === 0) queue.push(curr + 1);
      if (cy > 0 && bgMask[curr - width] === 0) queue.push(curr - width);
      if (cy < height - 1 && bgMask[curr + width] === 0) queue.push(curr + width);
    }
  }

  // Step 3: Connected Component Labeling on foreground (!bgMask)
  const labels = new Int32Array(width * height).fill(0);
  let currentLabel = 0;
  const rawComponents = [];

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const idx = y * width + x;
      if (bgMask[idx] === 0 && labels[idx] === 0) {
        currentLabel++;
        const cQueue = [idx];
        labels[idx] = currentLabel;
        let cHead = 0;
        let minX = x, maxX = x, minY = y, maxY = y;
        let pixelCount = 0;

        while (cHead < cQueue.length) {
          const cCurr = cQueue[cHead++];
          pixelCount++;
          const py = Math.floor(cCurr / width);
          const px = cCurr % width;
          if (px < minX) minX = px;
          if (px > maxX) maxX = px;
          if (py < minY) minY = py;
          if (py > maxY) maxY = py;

          // 8-way connectivity
          for (let dy = -1; dy <= 1; dy++) {
            for (let dx = -1; dx <= 1; dx++) {
              if (dx === 0 && dy === 0) continue;
              const ny = py + dy;
              const nx = px + dx;
              if (nx >= 0 && nx < width && ny >= 0 && ny < height) {
                const nIdx = ny * width + nx;
                if (bgMask[nIdx] === 0 && labels[nIdx] === 0) {
                  labels[nIdx] = currentLabel;
                  cQueue.push(nIdx);
                }
              }
            }
          }
        }

        const compW = maxX - minX + 1;
        const compH = maxY - minY + 1;
        if (pixelCount >= minArea && compW >= minDim && compH >= minDim) {
          rawComponents.push({
            label: currentLabel,
            pixelCount,
            minX, maxX, minY, maxY,
            width: compW,
            height: compH
          });
        }
      }
    }
  }

  // Step 4: Merge components that overlap significantly or are parts of the same item (e.g. Jordan sneaker laces / text / shadow)
  // Two components merge if their bounding boxes are very close (distance < 12px)
  const mergedComponents = [];
  const visited = new Set();

  for (let i = 0; i < rawComponents.length; i++) {
    if (visited.has(i)) continue;
    let comp = { ...rawComponents[i] };
    visited.add(i);

    let expanded = true;
    while (expanded) {
      expanded = false;
      for (let j = 0; j < rawComponents.length; j++) {
        if (visited.has(j)) continue;
        const other = rawComponents[j];

        // Check if boxes are within 10px of each other
        const xOverlap = !(comp.maxX + 10 < other.minX || other.maxX + 10 < comp.minX);
        const yOverlap = !(comp.maxY + 10 < other.minY || other.maxY + 10 < comp.minY);

        if (xOverlap && yOverlap) {
          // Merge
          comp.minX = Math.min(comp.minX, other.minX);
          comp.maxX = Math.max(comp.maxX, other.maxX);
          comp.minY = Math.min(comp.minY, other.minY);
          comp.maxY = Math.max(comp.maxY, other.maxY);
          comp.width = comp.maxX - comp.minX + 1;
          comp.height = comp.maxY - comp.minY + 1;
          comp.pixelCount += other.pixelCount;
          visited.add(j);
          expanded = true;
        }
      }
    }
    mergedComponents.push(comp);
  }

  console.log(`Merged into ${mergedComponents.length} distinct stickers.`);
  return { mergedComponents, data, info, bgMask };
}

module.exports = { extractStickersFromSheet, CATEGORIES };

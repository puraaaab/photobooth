const sharp = require('sharp');
const fs = require('fs');
const path = require('path');

const ROOT_DIR = path.resolve(__dirname, '..');
const INPUT_DIR = path.join(ROOT_DIR, 'template_images');
const OUTPUT_DIR = path.join(ROOT_DIR, 'public', 'templates');
const THUMBS_DIR = path.join(OUTPUT_DIR, 'thumbs');
const TARGET_WIDTH = 1200;
const BLEED = 4;

if (!fs.existsSync(OUTPUT_DIR)) fs.mkdirSync(OUTPUT_DIR, { recursive: true });
if (!fs.existsSync(THUMBS_DIR)) fs.mkdirSync(THUMBS_DIR, { recursive: true });

function isGreenPixel(r, g, b) {
  return (g > 95 && g > r * 1.25 && g > b * 1.25) ||
         (g > 140 && r < 120 && b < 120);
}

// Find one or multiple strips in an image, cutting off all surrounding background
async function detectStripCrops(data, width, height, channels) {
  // 1. Column-by-column green density
  const greenInCol = new Int32Array(width);
  let totalGreen = 0;

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const idx = (y * width + x) * channels;
      const r = data[idx], g = data[idx + 1], b = data[idx + 2];
      const a = channels === 4 ? data[idx + 3] : 255;
      if (a > 30 && isGreenPixel(r, g, b)) {
        greenInCol[x]++;
        totalGreen++;
      }
    }
  }

  // Sample outer perimeter background colors
  const bgSamples = [];
  const edgeDist = Math.max(4, Math.floor(Math.min(width, height) * 0.015));
  for (let x = 0; x < width; x += 12) {
    const idxT = (edgeDist * width + x) * channels;
    bgSamples.push([data[idxT], data[idxT+1], data[idxT+2]]);
    const idxB = ((height - 1 - edgeDist) * width + x) * channels;
    bgSamples.push([data[idxB], data[idxB+1], data[idxB+2]]);
  }
  for (let y = 0; y < height; y += 12) {
    const idxL = (y * width + edgeDist) * channels;
    bgSamples.push([data[idxL], data[idxL+1], data[idxL+2]]);
    const idxR = (y * width + (width - 1 - edgeDist)) * channels;
    bgSamples.push([data[idxR], data[idxR+1], data[idxR+2]]);
  }

  function isBgPixel(r, g, b, a = 255) {
    if (a < 30) return true;
    let minDist = 999;
    for (const s of bgSamples) {
      const d = Math.abs(r - s[0]) + Math.abs(g - s[1]) + Math.abs(b - s[2]);
      if (d < minDist) minDist = d;
    }
    return minDist < 32;
  }

  // CASE A: Image has green photo slots
  if (totalGreen > 2500) {
    // Find contiguous horizontal green clusters (detecting multi-strip side-by-side)
    const minColGreen = Math.max(12, Math.floor(height * 0.03));
    const greenClusters = [];
    let inCluster = false;
    let clusterStart = 0;

    for (let x = 0; x < width; x++) {
      if (greenInCol[x] > minColGreen) {
        if (!inCluster) { inCluster = true; clusterStart = x; }
      } else {
        if (inCluster) {
          inCluster = false;
          if (x - clusterStart > 18) {
            greenClusters.push({ startX: clusterStart, endX: x - 1 });
          }
        }
      }
    }
    if (inCluster && width - clusterStart > 18) {
      greenClusters.push({ startX: clusterStart, endX: width - 1 });
    }

    // Merge clusters that are only separated by a tiny gap (< 3% of width)
    const mergedClusters = [];
    for (const c of greenClusters) {
      if (mergedClusters.length === 0) {
        mergedClusters.push(c);
      } else {
        const prev = mergedClusters[mergedClusters.length - 1];
        if (c.startX - prev.endX < width * 0.035) {
          prev.endX = c.endX;
        } else {
          mergedClusters.push(c);
        }
      }
    }

    const stripCrops = [];

    for (const cluster of mergedClusters) {
      // Find vertical green bounds for this specific cluster
      let minGy = height, maxGy = 0;
      for (let y = 0; y < height; y++) {
        for (let x = cluster.startX; x <= cluster.endX; x++) {
          const idx = (y * width + x) * channels;
          const r = data[idx], g = data[idx+1], b = data[idx+2];
          const a = channels === 4 ? data[idx+3] : 255;
          if (a > 30 && isGreenPixel(r, g, b)) {
            if (y < minGy) minGy = y;
            if (y > maxGy) maxGy = y;
          }
        }
      }

      if (maxGy <= minGy) continue;

      // Expand outward from green bounds until background is reached
      // Scan LEFT from cluster.startX
      let stripLeft = 0;
      for (let x = cluster.startX - 1; x >= 0; x--) {
        let bgHits = 0;
        const testPoints = 25;
        for (let i = 0; i < testPoints; i++) {
          const y = Math.floor(minGy + (i / (testPoints - 1)) * (maxGy - minGy));
          const idx = (y * width + x) * channels;
          const a = channels === 4 ? data[idx+3] : 255;
          if (isBgPixel(data[idx], data[idx+1], data[idx+2], a)) bgHits++;
        }
        if (bgHits >= testPoints * 0.55) {
          stripLeft = Math.min(cluster.startX - 4, x + 2);
          break;
        }
      }

      // Scan RIGHT from cluster.endX
      let stripRight = width - 1;
      for (let x = cluster.endX + 1; x < width; x++) {
        let bgHits = 0;
        const testPoints = 25;
        for (let i = 0; i < testPoints; i++) {
          const y = Math.floor(minGy + (i / (testPoints - 1)) * (maxGy - minGy));
          const idx = (y * width + x) * channels;
          const a = channels === 4 ? data[idx+3] : 255;
          if (isBgPixel(data[idx], data[idx+1], data[idx+2], a)) bgHits++;
        }
        if (bgHits >= testPoints * 0.55) {
          stripRight = Math.max(cluster.endX + 4, x - 2);
          break;
        }
      }

      // Scan TOP from minGy within [stripLeft, stripRight]
      let stripTop = 0;
      const sW = stripRight - stripLeft + 1;
      for (let y = minGy - 1; y >= 0; y--) {
        let bgHits = 0;
        const testPoints = 20;
        for (let i = 0; i < testPoints; i++) {
          const x = Math.floor(stripLeft + 0.1 * sW + (i / (testPoints - 1)) * (0.8 * sW));
          const idx = (y * width + x) * channels;
          const a = channels === 4 ? data[idx+3] : 255;
          if (isBgPixel(data[idx], data[idx+1], data[idx+2], a)) bgHits++;
        }
        if (bgHits >= testPoints * 0.6) {
          stripTop = Math.min(minGy - 4, y + 2);
          break;
        }
      }

      // Scan BOTTOM from maxGy within [stripLeft, stripRight]
      let stripBottom = height - 1;
      for (let y = maxGy + 1; y < height; y++) {
        let bgHits = 0;
        const testPoints = 20;
        for (let i = 0; i < testPoints; i++) {
          const x = Math.floor(stripLeft + 0.1 * sW + (i / (testPoints - 1)) * (0.8 * sW));
          const idx = (y * width + x) * channels;
          const a = channels === 4 ? data[idx+3] : 255;
          if (isBgPixel(data[idx], data[idx+1], data[idx+2], a)) bgHits++;
        }
        if (bgHits >= testPoints * 0.6) {
          stripBottom = Math.max(maxGy + 4, y - 2);
          break;
        }
      }

      const cropW = stripRight - stripLeft + 1;
      const cropH = stripBottom - stripTop + 1;

      // Sanity check: valid strip aspect ratio (must be taller than 1.1x width)
      if (cropW >= 40 && cropH >= 80 && cropH >= cropW * 1.1) {
        stripCrops.push({
          left: stripLeft,
          top: stripTop,
          width: cropW,
          height: cropH,
        });
      }
    }

    if (stripCrops.length > 0) return stripCrops;
  }

  // CASE B: Non-green image (detect bounding box of non-background content)
  let minX = width, maxX = 0, minY = height, maxY = 0;
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const idx = (y * width + x) * channels;
      const a = channels === 4 ? data[idx + 3] : 255;
      if (!isBgPixel(data[idx], data[idx+1], data[idx+2], a)) {
        if (x < minX) minX = x;
        if (x > maxX) maxX = x;
        if (y < minY) minY = y;
        if (y > maxY) maxY = y;
      }
    }
  }

  if (maxX > minX && maxY > minY) {
    const cropW = maxX - minX + 1;
    const cropH = maxY - minY + 1;
    if (cropW >= 60 && cropH >= 80) {
      return [{ left: minX, top: minY, width: cropW, height: cropH }];
    }
  }

  return [{ left: 0, top: 0, width, height }];
}

module.exports = {
  detectStripCrops,
  isGreenPixel,
};

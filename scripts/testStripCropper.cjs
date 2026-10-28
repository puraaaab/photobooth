const sharp = require('sharp');
const path = require('path');
const fs = require('fs');

const ROOT_DIR = path.resolve(__dirname, '..');
const INPUT_DIR = path.join(ROOT_DIR, 'template_images');

// Check green chroma pixel
function isGreenPixel(r, g, b) {
  return (g > 95 && g > r * 1.25 && g > b * 1.25) ||
         (g > 140 && r < 120 && b < 120);
}

// Find strip bounding box using green slot guidance and background flood detection
async function findAccurateStripBounds(filePath) {
  const { data, info } = await sharp(filePath).raw().toBuffer({ resolveWithObject: true });
  const { width, height, channels } = info;

  // 1. Find green slot clusters
  let minGx = width, maxGx = 0, minGy = height, maxGy = 0, greenCount = 0;
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const idx = (y * width + x) * channels;
      const r = data[idx], g = data[idx + 1], b = data[idx + 2];
      const a = channels === 4 ? data[idx + 3] : 255;
      if (a > 30 && isGreenPixel(r, g, b)) {
        greenCount++;
        if (x < minGx) minGx = x;
        if (x > maxGx) maxGx = x;
        if (y < minGy) minGy = y;
        if (y > maxGy) maxGy = y;
      }
    }
  }

  // If no green slots, fallback
  if (greenCount < 2000) {
    return [{ left: 0, top: 0, width, height }];
  }

  // Green slots are present!
  // In a photobooth strip, the width of the green slots is typically 70% to 92% of the strip width.
  // The frame border on left/right is at least 15px to 60px.
  // Let's find the exact outer strip boundary by scanning outwards from the green box.

  // Sample the background color from outer borders (10px in from the 4 outer edges of image)
  const bgSamples = [];
  for (let x = 0; x < width; x += 10) {
    // top border
    const idxT = (10 * width + x) * channels;
    bgSamples.push([data[idxT], data[idxT+1], data[idxT+2]]);
    // bottom border
    const idxB = ((height - 11) * width + x) * channels;
    bgSamples.push([data[idxB], data[idxB+1], data[idxB+2]]);
  }
  for (let y = 0; y < height; y += 10) {
    // left border
    const idxL = (y * width + 10) * channels;
    bgSamples.push([data[idxL], data[idxL+1], data[idxL+2]]);
    // right border
    const idxR = (y * width + (width - 11)) * channels;
    bgSamples.push([data[idxR], data[idxR+1], data[idxR+2]]);
  }

  // Function to check if a pixel matches background
  function matchesBackground(r, g, b) {
    // If transparent
    // Check min distance to any sample
    let minDist = 999;
    for (const s of bgSamples) {
      const d = Math.abs(r - s[0]) + Math.abs(g - s[1]) + Math.abs(b - s[2]);
      if (d < minDist) minDist = d;
    }
    return minDist < 35;
  }

  // Scan LEFT from minGx
  let stripLeft = 0;
  for (let x = minGx - 1; x >= 0; x--) {
    let bgMatchCount = 0;
    const testSamples = 20;
    for (let i = 0; i < testSamples; i++) {
      const y = Math.floor(minGy + (i / (testSamples - 1)) * (maxGy - minGy));
      const idx = (y * width + x) * channels;
      if (matchesBackground(data[idx], data[idx+1], data[idx+2])) {
        bgMatchCount++;
      }
    }
    // If over 60% of vertical samples match background, we reached the outer edge!
    if (bgMatchCount > testSamples * 0.6) {
      stripLeft = Math.min(minGx - 5, x + 3);
      break;
    }
  }

  // Scan RIGHT from maxGx
  let stripRight = width - 1;
  for (let x = maxGx + 1; x < width; x++) {
    let bgMatchCount = 0;
    const testSamples = 20;
    for (let i = 0; i < testSamples; i++) {
      const y = Math.floor(minGy + (i / (testSamples - 1)) * (maxGy - minGy));
      const idx = (y * width + x) * channels;
      if (matchesBackground(data[idx], data[idx+1], data[idx+2])) {
        bgMatchCount++;
      }
    }
    if (bgMatchCount > testSamples * 0.6) {
      stripRight = Math.max(maxGx + 5, x - 3);
      break;
    }
  }

  // Scan TOP from minGy
  let stripTop = 0;
  const stripMidX = Math.floor((stripLeft + stripRight) / 2);
  const stripW = stripRight - stripLeft;
  for (let y = minGy - 1; y >= 0; y--) {
    let bgMatchCount = 0;
    const testSamples = 15;
    for (let i = 0; i < testSamples; i++) {
      const x = Math.floor(stripLeft + 0.1 * stripW + (i / (testSamples - 1)) * (0.8 * stripW));
      const idx = (y * width + x) * channels;
      if (matchesBackground(data[idx], data[idx+1], data[idx+2])) {
        bgMatchCount++;
      }
    }
    if (bgMatchCount > testSamples * 0.6) {
      stripTop = Math.min(minGy - 5, y + 3);
      break;
    }
  }

  // Scan BOTTOM from maxGy
  let stripBottom = height - 1;
  for (let y = maxGy + 1; y < height; y++) {
    let bgMatchCount = 0;
    const testSamples = 15;
    for (let i = 0; i < testSamples; i++) {
      const x = Math.floor(stripLeft + 0.1 * stripW + (i / (testSamples - 1)) * (0.8 * stripW));
      const idx = (y * width + x) * channels;
      if (matchesBackground(data[idx], data[idx+1], data[idx+2])) {
        bgMatchCount++;
      }
    }
    if (bgMatchCount > testSamples * 0.6) {
      stripBottom = Math.max(maxGy + 5, y - 3);
      break;
    }
  }

  return [{
    left: stripLeft,
    top: stripTop,
    width: stripRight - stripLeft + 1,
    height: stripBottom - stripTop + 1,
    greenBox: { minGx, maxGx, minGy, maxGy }
  }];
}

async function test() {
  const files = [
    '3f795db0-d8d0-43d7-ac90-60fa513d2599.png',
    '4a41de25-7340-4960-9da3-647eb6078986.png',
    '4ae8332f-5d11-4eb1-b574-60753b77af86.png',
    '76e9451a-afb1-4232-9bfb-3694e8bf8b5b.png',
    '85b918ac-4e65-4649-9c34-33e3297e31f5.png',
    '386d528e-49be-44f4-8772-cd45cf9725c3.jpg',
    '1443a760-2e64-410f-879e-c2aa7a26fa61.png',
    '3282e81d-6869-403b-854e-37bf89514b17.jpg'
  ];

  for (const f of files) {
    const res = await findAccurateStripBounds(path.join(INPUT_DIR, f));
    console.log(f, res);
  }
}

test();

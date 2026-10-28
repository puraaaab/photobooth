const sharp = require('sharp');
const fs = require('fs');
const path = require('path');

function isGreen(r, g, b) {
  return g > 130 && g > r * 1.25 && g > b * 1.25;
}

// Flood fill background from borders
function floodFillBackground(data, width, height, channels, bgR, bgG, bgB, tolerance = 28) {
  const mask = new Uint8Array(width * height); // 1 = background to remove
  const visited = new Uint8Array(width * height);
  const queue = [];

  function colorDist(idx) {
    const dr = data[idx] - bgR;
    const dg = data[idx + 1] - bgG;
    const db = data[idx + 2] - bgB;
    return Math.sqrt(dr * dr + dg * dg + db * db);
  }

  // Seed with border pixels
  for (let x = 0; x < width; x++) {
    queue.push(x); // top row
    queue.push((height - 1) * width + x); // bottom row
  }
  for (let y = 0; y < height; y++) {
    queue.push(y * width); // left col
    queue.push(y * width + (width - 1)); // right col
  }

  let head = 0;
  while (head < queue.length) {
    const pos = queue[head++];
    if (visited[pos]) continue;
    visited[pos] = 1;

    const idx = pos * channels;
    if (colorDist(idx) <= tolerance) {
      mask[pos] = 1;
      const cy = Math.floor(pos / width);
      const cx = pos % width;

      if (cx > 0 && !visited[pos - 1]) queue.push(pos - 1);
      if (cx < width - 1 && !visited[pos + 1]) queue.push(pos + 1);
      if (cy > 0 && !visited[pos - width]) queue.push(pos - width);
      if (cy < height - 1 && !visited[pos + width]) queue.push(pos + width);
    }
  }

  return mask;
}

// Process an image with chroma-key green removal + outer background flood-fill removal
async function processTemplateWithStickers({
  srcPath,
  destPath,
  cropBox, // { left, top, width, height }
  bgR, bgG, bgB,
  tolerance = 25,
  bleed = 4
}) {
  // 1. Crop to the artwork + stickers bounding box
  const cropped = await sharp(srcPath)
    .extract(cropBox)
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });

  const { data, info } = cropped;
  const { width, height } = info;

  // 2. Flood-fill background from edges
  const bgMask = floodFillBackground(data, width, height, 4, bgR, bgG, bgB, tolerance);

  // 3. Detect green components (photo slots) before zeroing alpha
  const greenMask = new Uint8Array(width * height);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const idx = (y * width + x) * 4;
      if (isGreen(data[idx], data[idx + 1], data[idx + 2])) {
        greenMask[y * width + x] = 1;
      }
    }
  }

  // Find green slot bounding boxes
  const visited = new Uint8Array(width * height);
  const rawSlots = [];
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const pos = y * width + x;
      if (greenMask[pos] && !visited[pos]) {
        let minX = x, maxX = x, minY = y, maxY = y;
        const q = [pos];
        visited[pos] = 1;
        let count = 0;
        let qHead = 0;

        while (qHead < q.length) {
          const curr = q[qHead++];
          const cy = Math.floor(curr / width);
          const cx = curr % width;
          count++;
          if (cx < minX) minX = cx;
          if (cx > maxX) maxX = cx;
          if (cy < minY) minY = cy;
          if (cy > maxY) maxY = cy;

          const neighbors = [curr - 1, curr + 1, curr - width, curr + width];
          for (const n of neighbors) {
            if (n >= 0 && n < greenMask.length && greenMask[n] && !visited[n]) {
              visited[n] = 1;
              q.push(n);
            }
          }
        }

        if (count > 300) {
          rawSlots.push({ minX, maxX, minY, maxY, w: maxX - minX, h: maxY - minY, count });
        }
      }
    }
  }

  // Sort slots by top-to-bottom
  rawSlots.sort((a, b) => a.minY - b.minY);

  // 4. Apply alpha: zero out background and green photo slots
  const outData = Buffer.from(data);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const pos = y * width + x;
      const idx = pos * 4;
      if (bgMask[pos] || greenMask[pos]) {
        outData[idx + 3] = 0; // Transparent!
      }
    }
  }

  // 5. Scale to standard 1200 x 4200
  const TARGET_W = 1200;
  const TARGET_H = 4200;
  const scaleX = TARGET_W / width;
  const scaleY = TARGET_H / height;

  const finalPng = await sharp(outData, { raw: { width, height, channels: 4 } })
    .resize({ width: TARGET_W, height: TARGET_H, fit: 'fill', kernel: 'lanczos3' })
    .png({ compressionLevel: 8 })
    .toBuffer();

  fs.writeFileSync(destPath, finalPng);

  // 6. Map slot coordinates to 1200x4200 with bleed
  const mappedSlots = rawSlots.map((s, idx) => {
    const x = Math.max(0, Math.round(s.minX * scaleX) - bleed);
    const y = Math.max(0, Math.round(s.minY * scaleY) - bleed);
    const w = Math.min(TARGET_W - x, Math.round(s.w * scaleX) + bleed * 2);
    const h = Math.min(TARGET_H - y, Math.round(s.h * scaleY) + bleed * 2);
    return {
      id: `slot-${idx}`,
      x,
      y,
      width: w,
      height: h,
      rotation: 0,
      shape: 'rectangle',
      cornerRadius: 0
    };
  });

  return mappedSlots;
}

module.exports = {
  processTemplateWithStickers,
  isGreen
};

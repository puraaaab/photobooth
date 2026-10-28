const sharp = require('sharp');
const fs = require('fs');

function isGreen(r, g, b) {
  return g > 140 && g > r * 1.3 && g > b * 1.3;
}

async function analyze4ae8() {
  const file = 'template_images/4ae8332f-5d11-4eb1-b574-60753b77af86.png';
  const { data, info } = await sharp(file).raw().toBuffer({ resolveWithObject: true });
  console.log(`\n=== Analyzing 4ae8 (${info.width}x${info.height}) ===`);

  // Detect background color (corners)
  const bgR = data[0], bgG = data[1], bgB = data[2];
  console.log(`Background color: rgb(${bgR}, ${bgG}, ${bgB})`);

  // Artwork bounding box
  let minArtX = info.width, maxArtX = 0, minArtY = info.height, maxArtY = 0;
  for (let y = 0; y < info.height; y++) {
    for (let x = 0; x < info.width; x++) {
      const idx = (y * info.width + x) * info.channels;
      const dr = data[idx] - bgR;
      const dg = data[idx+1] - bgG;
      const db = data[idx+2] - bgB;
      const dist = Math.sqrt(dr*dr + dg*dg + db*db);
      if (dist > 18) {
        if (x < minArtX) minArtX = x;
        if (x > maxArtX) maxArtX = x;
        if (y < minArtY) minArtY = y;
        if (y > maxArtY) maxArtY = y;
      }
    }
  }
  console.log('Artwork bounding box:', { minArtX, maxArtX, minArtY, maxArtY, w: maxArtX - minArtX, h: maxArtY - minArtY });

  // Connected green components (slots)
  const visited = new Uint8Array(info.width * info.height);
  const slots = [];
  for (let y = minArtY; y <= maxArtY; y++) {
    for (let x = minArtX; x <= maxArtX; x++) {
      const pos = y * info.width + x;
      const idx = pos * info.channels;
      if (isGreen(data[idx], data[idx+1], data[idx+2]) && !visited[pos]) {
        let minX = x, maxX = x, minY = y, maxY = y;
        const queue = [pos];
        visited[pos] = 1;
        let head = 0;
        let count = 0;
        while (head < queue.length) {
          const curr = queue[head++];
          const cy = Math.floor(curr / info.width);
          const cx = curr % info.width;
          count++;
          if (cx < minX) minX = cx;
          if (cx > maxX) maxX = cx;
          if (cy < minY) minY = cy;
          if (cy > maxY) maxY = cy;

          const neighbors = [curr - 1, curr + 1, curr - info.width, curr + info.width];
          for (const n of neighbors) {
            if (n >= 0 && n < info.width * info.height && !visited[n]) {
              const nidx = n * info.channels;
              if (isGreen(data[nidx], data[nidx+1], data[nidx+2])) {
                visited[n] = 1;
                queue.push(n);
              }
            }
          }
        }
        if (count > 2000) {
          slots.push({ minX, maxX, minY, maxY, w: maxX - minX, h: maxY - minY, count });
        }
      }
    }
  }

  console.log(`Found ${slots.length} green photo slots:`);
  slots.forEach((s, i) => console.log(`  Slot ${i}: x=${s.minX}, y=${s.minY}, w=${s.w}, h=${s.h} (pixels: ${s.count})`));
}

analyze4ae8();

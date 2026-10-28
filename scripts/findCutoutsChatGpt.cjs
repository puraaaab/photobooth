const sharp = require('sharp');
const fs = require('fs');

async function findCutouts(file) {
  const { data, info } = await sharp(file).raw().toBuffer({ resolveWithObject: true });
  console.log(`\n=== Finding transparent cutouts in ${file} (${info.width}x${info.height}) ===`);

  // Mask of transparent pixels
  const mask = new Uint8Array(info.width * info.height);
  for (let i = 0; i < mask.length; i++) {
    const a = data[i * 4 + 3];
    if (a < 30) mask[i] = 1;
  }

  // BFS components
  const visited = new Uint8Array(info.width * info.height);
  const components = [];

  for (let y = 0; y < info.height; y += 4) {
    for (let x = 0; x < info.width; x += 4) {
      const pos = y * info.width + x;
      if (mask[pos] && !visited[pos]) {
        let minX = x, maxX = x, minY = y, maxY = y;
        let count = 0;
        const queue = [pos];
        visited[pos] = 1;
        let head = 0;

        while (head < queue.length) {
          const curr = queue[head++];
          const cy = Math.floor(curr / info.width);
          const cx = curr % info.width;
          count++;
          if (cx < minX) minX = cx;
          if (cx > maxX) maxX = cx;
          if (cy < minY) minY = cy;
          if (cy > maxY) maxY = cy;

          const neighbors = [
            curr - 4, curr + 4,
            curr - info.width * 4, curr + info.width * 4
          ];
          for (const n of neighbors) {
            if (n >= 0 && n < mask.length && mask[n] && !visited[n]) {
              visited[n] = 1;
              queue.push(n);
            }
          }
        }

        if (count > 500) {
          components.push({ minX, maxX, minY, maxY, w: maxX - minX, h: maxY - minY, count });
        }
      }
    }
  }

  console.log(`Found ${components.length} transparent cutouts:`);
  components.forEach((c, idx) => {
    console.log(`  Cutout ${idx}: x=${c.minX}, y=${c.minY}, w=${c.w}, h=${c.h} (pixels: ${c.count})`);
  });
}

findCutouts('public/templates/template-img-chatgpt-image-sep-30-202-overlay.png');

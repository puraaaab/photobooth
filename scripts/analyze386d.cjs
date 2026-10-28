const sharp = require('sharp');
const fs = require('fs');

function isGreen(r, g, b) {
  return g > 140 && g > r * 1.3 && g > b * 1.3;
}

async function analyze386d() {
  const file = 'template_images/386d528e-49be-44f4-8772-cd45cf9725c3.jpg';
  const { data, info } = await sharp(file).raw().toBuffer({ resolveWithObject: true });
  console.log(`\n=== Analyzing 386d (${info.width}x${info.height}) ===`);

  // Detect green boxes
  let minGX = info.width, maxGX = 0, minGY = info.height, maxGY = 0;
  for (let y = 0; y < info.height; y++) {
    for (let x = 0; x < info.width; x++) {
      const idx = (y * info.width + x) * info.channels;
      if (isGreen(data[idx], data[idx+1], data[idx+2])) {
        if (x < minGX) minGX = x;
        if (x > maxGX) maxGX = x;
        if (y < minGY) minGY = y;
        if (y > maxGY) maxGY = y;
      }
    }
  }
  console.log('Green bounding box:', { minGX, maxGX, minGY, maxGY, w: maxGX - minGX, h: maxGY - minGY });

  // Detect background color (top-left 20x20 average)
  let bgR = 0, bgG = 0, bgB = 0, count = 0;
  for (let y = 0; y < 20; y++) {
    for (let x = 0; x < 20; x++) {
      const idx = (y * info.width + x) * info.channels;
      bgR += data[idx]; bgG += data[idx+1]; bgB += data[idx+2];
      count++;
    }
  }
  bgR = Math.round(bgR / count);
  bgG = Math.round(bgG / count);
  bgB = Math.round(bgB / count);
  console.log(`Average background color: rgb(${bgR}, ${bgG}, ${bgB})`);

  // Detect where the stickers extend (any pixel significantly different from background)
  // Distance from bg: sqrt((r-bgR)^2 + (g-bgG)^2 + (b-bgB)^2) > 25
  let minArtX = info.width, maxArtX = 0, minArtY = info.height, maxArtY = 0;
  for (let y = 0; y < info.height; y++) {
    for (let x = 0; x < info.width; x++) {
      const idx = (y * info.width + x) * info.channels;
      const dr = data[idx] - bgR;
      const dg = data[idx+1] - bgG;
      const db = data[idx+2] - bgB;
      const dist = Math.sqrt(dr*dr + dg*dg + db*db);
      if (dist > 25) {
        if (x < minArtX) minArtX = x;
        if (x > maxArtX) maxArtX = x;
        if (y < minArtY) minArtY = y;
        if (y > maxArtY) maxArtY = y;
      }
    }
  }
  console.log('Artwork + stickers bounding box:', { minArtX, maxArtX, minArtY, maxArtY, w: maxArtX - minArtX, h: maxArtY - minArtY });
}

analyze386d();

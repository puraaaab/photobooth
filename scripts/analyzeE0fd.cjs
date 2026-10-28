const sharp = require('sharp');
const fs = require('fs');

function isGreen(r, g, b) {
  return g > 140 && g > r * 1.3 && g > b * 1.3;
}

async function analyzeE0fd() {
  const file = 'template_images/e0fd4bf0-a89d-461e-835a-cadf8642dedc.jpg';
  const { data, info } = await sharp(file).raw().toBuffer({ resolveWithObject: true });
  console.log(`\n=== Analyzing e0fd (${info.width}x${info.height}) ===`);

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

  // Average background color
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

  // Artwork + stickers bounding box
  let minArtX = info.width, maxArtX = 0, minArtY = info.height, maxArtY = 0;
  for (let y = 0; y < info.height; y++) {
    for (let x = 0; x < info.width; x++) {
      const idx = (y * info.width + x) * info.channels;
      const dr = data[idx] - bgR;
      const dg = data[idx+1] - bgG;
      const db = data[idx+2] - bgB;
      const dist = Math.sqrt(dr*dr + dg*dg + db*db);
      if (dist > 20) {
        if (x < minArtX) minArtX = x;
        if (x > maxArtX) maxArtX = x;
        if (y < minArtY) minArtY = y;
        if (y > maxArtY) maxArtY = y;
      }
    }
  }
  console.log('Artwork + red bows bounding box:', { minArtX, maxArtX, minArtY, maxArtY, w: maxArtX - minArtX, h: maxArtY - minArtY });
}

analyzeE0fd();

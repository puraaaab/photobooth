const sharp = require('sharp');
const fs = require('fs');

function isGreen(r, g, b) {
  return g > 150 && r < 100 && b < 100;
}

async function analyze(file) {
  const { data, info } = await sharp(file).raw().toBuffer({ resolveWithObject: true });
  console.log(`\n=== Analyzing ${file} (${info.width}x${info.height}) ===`);

  // Detect green boxes
  let minGreenX = info.width, maxGreenX = 0;
  let minGreenY = info.height, maxGreenY = 0;
  let greenPixels = 0;

  for (let y = 0; y < info.height; y++) {
    for (let x = 0; x < info.width; x++) {
      const idx = (y * info.width + x) * info.channels;
      const r = data[idx], g = data[idx + 1], b = data[idx + 2];
      if (isGreen(r, g, b)) {
        greenPixels++;
        if (x < minGreenX) minGreenX = x;
        if (x > maxGreenX) maxGreenX = x;
        if (y < minGreenY) minGreenY = y;
        if (y > maxGreenY) maxGreenY = y;
      }
    }
  }

  console.log('Green pixels found:', greenPixels);
  console.log('Green bounding box:', { minGreenX, maxGreenX, minGreenY, maxGreenY, w: maxGreenX - minGreenX, h: maxGreenY - minGreenY });
}

analyze('template_images/4ae8332f-5d11-4eb1-b574-60753b77af86.png');

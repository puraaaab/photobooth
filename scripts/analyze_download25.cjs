const sharp = require('sharp');

async function analyzeDownload25() {
  const img = sharp('template_images/download (25).png');
  const { data, info } = await img.raw().toBuffer({ resolveWithObject: true });
  const w = info.width;
  const h = info.height;

  // Let's find non-white pixels: where r < 240 or g < 240 or b < 240
  let minX = w, maxX = 0, minY = h, maxY = 0;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const idx = (y * w + x) * info.channels;
      const r = data[idx], g = data[idx+1], b = data[idx+2];
      // Check if green screen or camera details
      // green screen: g > 150 && g > r * 1.3 && g > b * 1.3
      const isGreen = g > 150 && g > r * 1.2 && g > b * 1.2;
      // non-background:
      if (r < 240 || g < 240 || b < 240) {
        if (x < minX) minX = x;
        if (x > maxX) maxX = x;
        if (y < minY) minY = y;
        if (y > maxY) maxY = y;
      }
    }
  }

  console.log(`download (25).png content bounds: x=[${minX}, ${maxX}] y=[${minY}, ${maxY}] (size: ${maxX-minX}x${maxY-minY})`);
}
analyzeDownload25();

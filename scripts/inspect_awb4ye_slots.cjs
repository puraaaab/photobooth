const sharp = require('sharp');

async function inspectSlots() {
  const img = sharp('template_images/removed_backgrounds/awb4ye_Subject-1.png');
  const { data, info } = await img.raw().toBuffer({ resolveWithObject: true });
  const w = info.width;
  const h = info.height;

  // Let's find green pixels or holes in this image
  // Check y distribution of green or transparent
  let greenPixels = 0;
  let transparentPixels = 0;
  const yHisto = new Array(h).fill(0);

  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const idx = (y * w + x) * 4;
      const r = data[idx], g = data[idx+1], b = data[idx+2], a = data[idx+3];
      if (a < 50) {
        transparentPixels++;
      } else if (g > 150 && g > r * 1.3 && g > b * 1.3) {
        greenPixels++;
        yHisto[y]++;
      }
    }
  }

  console.log(`w=${w}, h=${h}, total=${w*h}`);
  console.log(`transparentPixels=${transparentPixels}, greenPixels=${greenPixels}`);
  
  // Find continuous spans of y where yHisto > 10
  const spans = [];
  let inSpan = false, startY = 0;
  for (let y = 0; y < h; y++) {
    if (yHisto[y] > 20) {
      if (!inSpan) {
        inSpan = true;
        startY = y;
      }
    } else {
      if (inSpan) {
        inSpan = false;
        spans.push({ startY, endY: y - 1, count: y - startY });
      }
    }
  }
  if (inSpan) spans.push({ startY, endY: h - 1, count: h - startY });
  console.log('Green spans:', spans);
}
inspectSlots();

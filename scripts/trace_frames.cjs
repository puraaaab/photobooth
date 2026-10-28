const sharp = require('sharp');

async function traceFrames() {
  const img = sharp('template_images/removed_backgrounds/awb4ye_Subject-1.png');
  const { data, info } = await img.raw().toBuffer({ resolveWithObject: true });
  const w = info.width;
  const h = info.height;

  // Let's sample along vertical center x = w / 2 = 220
  const midX = Math.floor(w / 2);
  console.log(`Sampling vertical line at x=${midX}:`);
  let prevIsGreen = false;
  for (let y = 150; y < 1150; y++) {
    const idx = (y * w + midX) * 4;
    const r = data[idx], g = data[idx+1], b = data[idx+2];
    const isGreen = g > 150 && g > r * 1.3 && g > b * 1.3;
    if (isGreen !== prevIsGreen) {
      console.log(`Transition at y=${y}: isGreen=${isGreen} rgb=(${r},${g},${b})`);
      prevIsGreen = isGreen;
    }
  }
}
traceFrames();

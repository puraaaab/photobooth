const sharp = require('sharp');
const fs = require('fs');
const path = require('path');

const ROOT_DIR = path.resolve(__dirname, '..');
const INPUT_DIR = path.join(ROOT_DIR, 'template_images');

const files = fs.readdirSync(INPUT_DIR).filter(f => !fs.statSync(path.join(INPUT_DIR, f)).isDirectory() && /\.(png|jpg|jpeg|webp)$/i.test(f));

function isGreenPixel(r, g, b) {
  return (g > 95 && g > r * 1.25 && g > b * 1.25) || (g > 140 && r < 120 && b < 120);
}

async function analyzeAll() {
  console.log('Total files:', files.length);
  for (const f of files) {
    const p = path.join(INPUT_DIR, f);
    const { data, info } = await sharp(p).raw().toBuffer({ resolveWithObject: true });
    const { width, height, channels } = info;

    let transCount = 0;
    if (channels === 4) {
      for (let i = 3; i < data.length; i += 4) {
        if (data[i] < 30) transCount++;
      }
    }
    const isTrans = transCount > (width * height * 0.05);

    let greenCount = 0;
    for (let i = 0; i < data.length; i += channels) {
      if (isGreenPixel(data[i], data[i+1], data[i+2])) greenCount++;
    }

    const c1 = [data[0], data[1], data[2]];
    console.log(f.slice(0, 30).padEnd(32), `${width}x${height}`.padEnd(12), `trans: ${isTrans}`.padEnd(14), `green: ${greenCount > 4000}`.padEnd(14), `c1: [${c1.join(',')}]`);
  }
}
analyzeAll().catch(console.error);

const sharp = require('sharp');
const fs = require('fs');

async function inspectChatGpt() {
  const file = 'public/templates/template-img-chatgpt-image-sep-30-202-overlay.png';
  const { data, info } = await sharp(file).raw().toBuffer({ resolveWithObject: true });
  console.log(`\n=== chatgpt-image-sep-30-202 (${info.width}x${info.height}) ===`);

  // Find transparent regions
  // Check rows
  const transparentRows = [];
  for (let y = 0; y < info.height; y += 20) {
    let transCount = 0;
    for (let x = 0; x < info.width; x += 10) {
      const idx = (y * info.width + x) * info.channels;
      if (data[idx + 3] < 30) transCount++;
    }
    const pct = transCount / (info.width / 10);
    if (pct > 0.3) {
      transparentRows.push(y);
    }
  }

  console.log('Transparent Y ranges: min Y =', Math.min(...transparentRows), 'max Y =', Math.max(...transparentRows));
}

inspectChatGpt();

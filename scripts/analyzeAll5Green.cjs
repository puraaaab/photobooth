const sharp = require('sharp');
const fs = require('fs');

function isGreen(r, g, b) {
  return g > 140 && g > r * 1.3 && g > b * 1.3;
}

async function analyzeAll() {
  const list = [
    { name: '4ae8 (Golden Glow #2)', path: 'template_images/4ae8332f-5d11-4eb1-b574-60753b77af86.png' },
    { name: '386d (Pearl Minimal 4-Shot - blue stars)', path: 'template_images/386d528e-49be-44f4-8772-cd45cf9725c3.jpg' },
    { name: '7249 (Two-in-one Pearl Minimal #2)', path: 'template_images/72498825-8037-45dd-93a5-46f1de1348e1.jpg' },
    { name: 'chatgpt (Golden Glow #3 - knit sweater)', path: 'public/templates/template-img-chatgpt-image-sep-30-202-overlay.png' },
    { name: 'e0fd (Pearl Minimal #7 - red bows)', path: 'template_images/e0fd4bf0-a89d-461e-835a-cadf8642dedc.jpg' },
  ];

  for (const item of list) {
    if (!fs.existsSync(item.path)) {
      console.log('Not found:', item.path);
      continue;
    }
    const { data, info } = await sharp(item.path).raw().toBuffer({ resolveWithObject: true });
    let greenCount = 0;
    for (let i = 0; i < data.length; i += info.channels) {
      if (isGreen(data[i], data[i+1], data[i+2])) greenCount++;
    }
    console.log(`\n=== ${item.name} (${info.width}x${info.height}) ===`);
    console.log(`  Green pixels: ${greenCount} (${((greenCount / (info.width * info.height)) * 100).toFixed(1)}%)`);
    // Sample corner colors
    console.log(`  Corner top-left: rgb(${data[0]}, ${data[1]}, ${data[2]})`);
  }
}

analyzeAll();

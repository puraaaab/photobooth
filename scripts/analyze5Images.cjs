const sharp = require('sharp');
const fs = require('fs');

async function analyzeImage(imgPath) {
  if (!fs.existsSync(imgPath)) {
    console.log('Not found:', imgPath);
    return;
  }
  const { data, info } = await sharp(imgPath).raw().toBuffer({ resolveWithObject: true });
  console.log(`\n=== Analyzing ${imgPath} (${info.width}x${info.height}, channels: ${info.channels}) ===`);

  // Sample corner pixel colors
  const corners = [
    { name: 'Top-Left', idx: 0 },
    { name: 'Top-Right', idx: (info.width - 1) * info.channels },
    { name: 'Bottom-Left', idx: (info.height - 1) * info.width * info.channels },
    { name: 'Bottom-Right', idx: (info.width * info.height - 1) * info.channels },
  ];

  corners.forEach(c => {
    const r = data[c.idx];
    const g = data[c.idx + 1];
    const b = data[c.idx + 2];
    const a = info.channels === 4 ? data[c.idx + 3] : 255;
    console.log(`  ${c.name}: rgba(${r}, ${g}, ${b}, ${a})`);
  });
}

async function run() {
  await analyzeImage('public/templates/template-img-4ae8332f-5d11-4eb1-b574-overlay.png');
  await analyzeImage('public/templates/template-img-386d528e-49be-44f4-8772-overlay.png');
  await analyzeImage('public/templates/template-img-72498825-8037-45dd-93a5-overlay.png');
  await analyzeImage('public/templates/template-img-chatgpt-image-sep-30-202-overlay.png');
  await analyzeImage('public/templates/template-img-e0fd4bf0-a89d-461e-835a-overlay.png');
}

run();

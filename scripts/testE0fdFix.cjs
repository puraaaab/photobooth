const sharp = require('sharp');
const fs = require('fs');
const path = require('path');
const { processTemplateWithStickers } = require('./templateProcessorHelper.cjs');

async function run() {
  console.log('\n=== 4. Processing e0fd (Pearl Minimal #7 with red ribbon bows) ===');
  const slotsE0fd = await processTemplateWithStickers({
    srcPath: 'template_images/e0fd4bf0-a89d-461e-835a-cadf8642dedc.jpg',
    destPath: 'public/templates/template-img-e0fd4bf0-a89d-461e-835a-overlay.png',
    cropBox: { left: 145, top: 130, width: 410, height: 890 }, // 130 + 890 = 1020 <= 1024
    bgR: 255, bgG: 255, bgB: 255,
    tolerance: 20,
    bleed: 4
  });
  console.log('Slots e0fd (detected count:', slotsE0fd.length, '):', slotsE0fd);
}

run().catch(console.error);

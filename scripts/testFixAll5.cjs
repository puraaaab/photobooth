const sharp = require('sharp');
const fs = require('fs');
const path = require('path');
const { processTemplateWithStickers } = require('./templateProcessorHelper.cjs');

async function run() {
  console.log('=== 1. Processing 4ae8 (Golden Glow #2 with teddy bears) ===');
  const slots4ae8 = await processTemplateWithStickers({
    srcPath: 'template_images/4ae8332f-5d11-4eb1-b574-60753b77af86.png',
    destPath: 'public/templates/template-img-4ae8332f-5d11-4eb1-b574-overlay.png',
    cropBox: { left: 115, top: 20, width: 730, height: 1630 },
    bgR: 192, bgG: 193, bgB: 192,
    tolerance: 26,
    bleed: 4
  });
  console.log('Slots 4ae8 (detected count:', slots4ae8.length, '):', slots4ae8);

  console.log('\n=== 2. Processing 386d (Pearl Minimal 4-Shot with blue stars) ===');
  const slots386d = await processTemplateWithStickers({
    srcPath: 'template_images/386d528e-49be-44f4-8772-cd45cf9725c3.jpg',
    destPath: 'public/templates/template-img-386d528e-49be-44f4-8772-overlay.png',
    cropBox: { left: 135, top: 48, width: 310, height: 910 },
    bgR: 229, bgG: 229, bgB: 219,
    tolerance: 26,
    bleed: 4
  });
  console.log('Slots 386d (detected count:', slots386d.length, '):', slots386d);

  console.log('\n=== 3. Processing 7249 (Split into Two Templates: Left & Right) ===');
  // Part 1: Left strip
  const slots7249Left = await processTemplateWithStickers({
    srcPath: 'template_images/72498825-8037-45dd-93a5-46f1de1348e1.jpg',
    destPath: 'public/templates/template-img-72498825-8037-45dd-93a5-overlay.png',
    cropBox: { left: 35, top: 70, width: 250, height: 890 },
    bgR: 230, bgG: 230, bgB: 222,
    tolerance: 26,
    bleed: 4
  });
  console.log('Slots 7249 Left (detected count:', slots7249Left.length, '):', slots7249Left);

  // Part 2: Right strip
  const slots7249Right = await processTemplateWithStickers({
    srcPath: 'template_images/72498825-8037-45dd-93a5-46f1de1348e1.jpg',
    destPath: 'public/templates/template-img-72498825-part2-overlay.png',
    cropBox: { left: 285, top: 70, width: 250, height: 890 },
    bgR: 230, bgG: 230, bgB: 222,
    tolerance: 26,
    bleed: 4
  });
  console.log('Slots 7249 Right (detected count:', slots7249Right.length, '):', slots7249Right);

  console.log('\n=== 4. Processing e0fd (Pearl Minimal #7 with red ribbon bows) ===');
  const slotsE0fd = await processTemplateWithStickers({
    srcPath: 'template_images/e0fd4bf0-a89d-461e-835a-cadf8642dedc.jpg',
    destPath: 'public/templates/template-img-e0fd4bf0-a89d-461e-835a-overlay.png',
    cropBox: { left: 145, top: 130, width: 412, height: 895 },
    bgR: 255, bgG: 255, bgB: 255,
    tolerance: 25,
    bleed: 4
  });
  console.log('Slots e0fd (detected count:', slotsE0fd.length, '):', slotsE0fd);

  console.log('\n=== 5. Processing chatgpt (Golden Glow Knit Sweater 2-Shot) ===');
  const chatGptPath = 'public/templates/template-img-chatgpt-image-sep-30-202-overlay.png';
  const chatGptRaw = await sharp(chatGptPath).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  const { data, info } = chatGptRaw;
  // Fill accidental transparent holes at top edge (y < 120) with solid brown
  for (let y = 0; y < 120; y++) {
    for (let x = 0; x < info.width; x++) {
      const idx = (y * info.width + x) * 4;
      if (data[idx + 3] < 50) {
        data[idx] = 45; data[idx + 1] = 22; data[idx + 2] = 16; data[idx + 3] = 255;
      }
    }
  }
  await sharp(data, { raw: { width: info.width, height: info.height, channels: 4 } })
    .png({ compressionLevel: 8 })
    .toFile(chatGptPath);
  console.log('Cleaned top edge of chatgpt template image.');
}

run().catch(console.error);

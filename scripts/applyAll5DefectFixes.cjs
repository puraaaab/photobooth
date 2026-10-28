const sharp = require('sharp');
const fs = require('fs');
const path = require('path');
const { processTemplateWithStickers } = require('./templateProcessorHelper.cjs');

async function makeThumb(pngPath, thumbPath) {
  await sharp(pngPath)
    .resize({ width: 300, height: 1050, fit: 'fill' })
    .webp({ quality: 85 })
    .toFile(thumbPath);
}

async function run() {
  console.log('=== 1. Processing 4ae8 (Golden Glow #2 with teddy bears) ===');
  const png4ae8 = 'public/templates/template-img-4ae8332f-5d11-4eb1-b574-overlay.png';
  const slots4ae8 = await processTemplateWithStickers({
    srcPath: 'template_images/4ae8332f-5d11-4eb1-b574-60753b77af86.png',
    destPath: png4ae8,
    cropBox: { left: 115, top: 20, width: 730, height: 1630 },
    bgR: 192, bgG: 193, bgB: 192,
    tolerance: 26,
    bleed: 4
  });
  await makeThumb(png4ae8, 'public/templates/thumbs/template-img-4ae8332f-5d11-4eb1-b574-overlay-thumb.webp');

  console.log('=== 2. Processing 386d (Pearl Minimal 4-Shot with blue stars) ===');
  const png386d = 'public/templates/template-img-386d528e-49be-44f4-8772-overlay.png';
  const slots386d = await processTemplateWithStickers({
    srcPath: 'template_images/386d528e-49be-44f4-8772-cd45cf9725c3.jpg',
    destPath: png386d,
    cropBox: { left: 135, top: 48, width: 310, height: 910 },
    bgR: 229, bgG: 229, bgB: 219,
    tolerance: 26,
    bleed: 4
  });
  await makeThumb(png386d, 'public/templates/thumbs/template-img-386d528e-49be-44f4-8772-overlay-thumb.webp');

  console.log('=== 3. Processing 7249 (Split into Two Templates) ===');
  // Left strip
  const png7249Left = 'public/templates/template-img-72498825-8037-45dd-93a5-overlay.png';
  const slots7249Left = await processTemplateWithStickers({
    srcPath: 'template_images/72498825-8037-45dd-93a5-46f1de1348e1.jpg',
    destPath: png7249Left,
    cropBox: { left: 35, top: 70, width: 250, height: 890 },
    bgR: 230, bgG: 230, bgB: 222,
    tolerance: 26,
    bleed: 4
  });
  await makeThumb(png7249Left, 'public/templates/thumbs/template-img-72498825-8037-45dd-93a5-overlay-thumb.webp');

  // Right strip
  const png7249Right = 'public/templates/template-img-72498825-part2-overlay.png';
  const slots7249Right = await processTemplateWithStickers({
    srcPath: 'template_images/72498825-8037-45dd-93a5-46f1de1348e1.jpg',
    destPath: png7249Right,
    cropBox: { left: 285, top: 70, width: 250, height: 890 },
    bgR: 230, bgG: 230, bgB: 222,
    tolerance: 26,
    bleed: 4
  });
  await makeThumb(png7249Right, 'public/templates/thumbs/template-img-72498825-part2-overlay-thumb.webp');

  console.log('=== 4. Processing e0fd (Pearl Minimal #7 with red ribbon bows) ===');
  const pngE0fd = 'public/templates/template-img-e0fd4bf0-a89d-461e-835a-overlay.png';
  const slotsE0fd = await processTemplateWithStickers({
    srcPath: 'template_images/e0fd4bf0-a89d-461e-835a-cadf8642dedc.jpg',
    destPath: pngE0fd,
    cropBox: { left: 145, top: 130, width: 410, height: 890 },
    bgR: 255, bgG: 255, bgB: 255,
    tolerance: 20,
    bleed: 4
  });
  await makeThumb(pngE0fd, 'public/templates/thumbs/template-img-e0fd4bf0-a89d-461e-835a-overlay-thumb.webp');

  console.log('=== 5. Processing chatgpt (Golden Glow Knit Sweater 2-Shot) ===');
  const chatGptPath = 'public/templates/template-img-chatgpt-image-sep-30-202-overlay.png';
  const chatGptRaw = await sharp(chatGptPath).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  const { data, info } = chatGptRaw;
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
  await makeThumb(chatGptPath, 'public/templates/thumbs/template-img-chatgpt-image-sep-30-202-overlay-thumb.webp');

  const slotsChatGpt = [
    {
      id: 'slot-0',
      x: 192,
      y: 816,
      width: 860,
      height: 1180,
      rotation: 0,
      shape: 'rectangle',
      cornerRadius: 0
    },
    {
      id: 'slot-1',
      x: 192,
      y: 2500,
      width: 856,
      height: 1068,
      rotation: 0,
      shape: 'rectangle',
      cornerRadius: 0
    }
  ];

  // Update batchGeneratedTemplates.ts
  console.log('\n=== Updating batchGeneratedTemplates.ts ===');
  const tplFile = path.join(__dirname, '../src/templates/batchGeneratedTemplates.ts');
  const content = fs.readFileSync(tplFile, 'utf8');

  const assignIdx = content.indexOf('= [');
  const startIdx = content.indexOf('[', assignIdx);
  const endIdx = content.lastIndexOf(']');
  const prefix = content.slice(0, startIdx);
  const suffix = content.slice(endIdx + 1);
  const templates = JSON.parse(content.slice(startIdx, endIdx + 1));

  // 1. Update 4ae8
  const t4ae8 = templates.find(t => t.id === 'template-img-4ae8332f-5d11-4eb1-b574');
  if (t4ae8) {
    t4ae8.photoSlots = slots4ae8;
    t4ae8.canvas = { width: 1200, height: 4200 };
    console.log('Updated 4ae8 slots in code.');
  }

  // 2. Update 386d
  const t386d = templates.find(t => t.id === 'template-img-386d528e-49be-44f4-8772');
  if (t386d) {
    t386d.photoSlots = slots386d;
    t386d.canvas = { width: 1200, height: 4200 };
    console.log('Updated 386d slots in code.');
  }

  // 3. Update 7249 (Left) and insert 7249 (Right)
  const t7249 = templates.find(t => t.id === 'template-img-72498825-8037-45dd-93a5');
  if (t7249) {
    t7249.name = 'Pearl Minimal Seaside Strip (4-Shot)';
    t7249.photoSlots = slots7249Left;
    t7249.canvas = { width: 1200, height: 4200 };
    console.log('Updated 7249 Left strip in code.');
  }

  // Check if right strip already exists, else insert right after t7249
  const existingPart2 = templates.find(t => t.id === 'template-img-72498825-part2');
  if (!existingPart2) {
    const t7249Part2 = {
      id: 'template-img-72498825-part2',
      name: 'Pearl Minimal Starlight Strip (4-Shot)',
      category: 'custom',
      supportedPhotoCounts: [4],
      supportedOrientations: ['vertical'],
      canvas: { width: 1200, height: 4200 },
      overlayImageUrl: '/templates/template-img-72498825-part2-overlay.png',
      thumbnailUrl: '/templates/thumbs/template-img-72498825-part2-overlay-thumb.webp',
      background: { type: 'solid', color: 'transparent' },
      border: { type: 'none' },
      spacing: { outerMargin: 0, photoSpacing: 20, padding: 0 },
      photoSlots: slots7249Right,
      textElements: [],
      tags: ['4-shot', 'blue', 'stars', 'aesthetic', 'chic']
    };
    const t7249Idx = templates.findIndex(t => t.id === 'template-img-72498825-8037-45dd-93a5');
    templates.splice(t7249Idx + 1, 0, t7249Part2);
    console.log('Inserted 7249 Part 2 (Right strip) in code.');
  } else {
    existingPart2.photoSlots = slots7249Right;
    existingPart2.canvas = { width: 1200, height: 4200 };
    console.log('Updated existing 7249 Part 2 in code.');
  }

  // 4. Update chatgpt
  const tChatGpt = templates.find(t => t.id === 'template-img-chatgpt-image-sep-30-202');
  if (tChatGpt) {
    tChatGpt.name = 'Golden Glow Knit Aesthetic Strip (2-Shot)';
    tChatGpt.supportedPhotoCounts = [2];
    tChatGpt.photoSlots = slotsChatGpt;
    tChatGpt.canvas = { width: 1200, height: 4200 };
    console.log('Updated chatgpt as 2-shot strip with 2 frames in code.');
  }

  // 5. Update e0fd
  const tE0fd = templates.find(t => t.id === 'template-img-e0fd4bf0-a89d-461e-835a');
  if (tE0fd) {
    tE0fd.photoSlots = slotsE0fd;
    tE0fd.canvas = { width: 1200, height: 4200 };
    console.log('Updated e0fd slots in code.');
  }

  fs.writeFileSync(tplFile, prefix + JSON.stringify(templates, null, 2) + suffix, 'utf8');
  console.log('Successfully saved batchGeneratedTemplates.ts!');
}

run().catch(console.error);

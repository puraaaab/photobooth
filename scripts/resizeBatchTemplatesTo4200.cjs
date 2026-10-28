const sharp = require('sharp');
const fs = require('fs');
const path = require('path');
const { resizeOverlayImage, TARGET_HEIGHT, TARGET_WIDTH } = require('./resizeHelper.cjs');

// Also resize the standalone custom images
const customImages = [
  '/templates/custom-8c1e99bc-1ae4-4fdb-8fb3-4dde-overlay.png',
  '/templates/custom-85b918ac-4e65-4649-9c34-33e3-overlay.png'
];

async function run() {
  console.log('=== Resizing Standalone Custom PNGs ===');
  for (const img of customImages) {
    await resizeOverlayImage(img);
  }

  console.log('\n=== Loading batchGeneratedTemplates.ts ===');
  const filePath = path.join(__dirname, '../src/templates/batchGeneratedTemplates.ts');
  const content = fs.readFileSync(filePath, 'utf8');

  const assignIdx = content.indexOf('= [');
  const startIdx = content.indexOf('[', assignIdx);
  const endIdx = content.lastIndexOf(']');
  const prefix = content.slice(0, startIdx);
  const jsonStr = content.slice(startIdx, endIdx + 1);
  const suffix = content.slice(endIdx + 1);

  const templates = JSON.parse(jsonStr);
  console.log(`Loaded ${templates.length} templates.`);

  // Filter 3-shot and 4-shot strips to resize to 1200x4200
  let resizedCount = 0;
  for (let i = 0; i < templates.length; i++) {
    const t = templates[i];
    const photoCount = (t.supportedPhotoCounts || [])[0];

    // Resize 3-shot and 4-shot vertical strips
    if (photoCount === 3 || photoCount === 4) {
      if (t.canvas && t.canvas.height !== TARGET_HEIGHT && t.overlayImageUrl) {
        const oldHeight = t.canvas.height;
        const res = await resizeOverlayImage(t.overlayImageUrl);
        if (res && res.scaleY) {
          const scaleY = TARGET_HEIGHT / oldHeight;
          t.canvas.width = TARGET_WIDTH;
          t.canvas.height = TARGET_HEIGHT;

          if (Array.isArray(t.photoSlots)) {
            t.photoSlots.forEach(slot => {
              slot.y = Math.round(slot.y * scaleY);
              slot.height = Math.round(slot.height * scaleY);
            });
          }

          resizedCount++;
          if (resizedCount % 20 === 0) {
            console.log(`Progress: Resized ${resizedCount} batch templates...`);
          }
        }
      }
    }
  }

  console.log(`Total 3-shot & 4-shot templates resized in batch: ${resizedCount}`);

  // Backup original ts file
  const bakFile = filePath + '.bak4200';
  if (!fs.existsSync(bakFile)) {
    fs.writeFileSync(bakFile, content, 'utf8');
  }

  // Write updated file
  const updatedContent = prefix + JSON.stringify(templates, null, 2) + suffix;
  fs.writeFileSync(filePath, updatedContent, 'utf8');
  console.log('Saved updated batchGeneratedTemplates.ts!');
}

run().catch(console.error);

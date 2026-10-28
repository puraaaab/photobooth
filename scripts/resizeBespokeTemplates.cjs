const fs = require('fs');
const path = require('path');
const { resizeOverlayImage, TARGET_HEIGHT } = require('./resizeHelper.cjs');

async function processTemplateFile(filePath) {
  let content = fs.readFileSync(filePath, 'utf8');
  console.log(`\n=== Processing ${filePath} ===`);

  // Match each export const ... = { ... }
  // Find each overlayImageUrl, resize the image, and then adjust canvas & photoSlots
  const templateBlocks = content.split(/export const /);
  const header = templateBlocks[0];
  const newBlocks = [];

  for (let i = 1; i < templateBlocks.length; i++) {
    let block = templateBlocks[i];

    // Find overlayImageUrl
    const overlayMatch = block.match(/overlayImageUrl:\s*['"]([^'"]+)['"]/);
    const canvasMatch = block.match(/canvas:\s*\{[^}]*?height:\s*(\d+)/);

    if (overlayMatch && canvasMatch) {
      const overlayUrl = overlayMatch[1];
      const oldHeight = parseInt(canvasMatch[1], 10);

      const res = await resizeOverlayImage(overlayUrl);
      if (res && res.oldHeight) {
        const scaleY = TARGET_HEIGHT / res.oldHeight;

        // 1. Update canvas height
        block = block.replace(/(canvas:\s*\{[^}]*?height:\s*)\d+/, `$1${TARGET_HEIGHT}`);

        // 2. Update photoSlots: match each slot object
        block = block.replace(/photoSlots:\s*\[([\s\S]*?)\]\s*,/g, (match, slotsContent) => {
          const updatedSlots = slotsContent.replace(/(\{\s*id:\s*['"][^'"]+['"][\s\S]*?\})/g, (slotMatch) => {
            let updatedSlot = slotMatch;
            // update y
            updatedSlot = updatedSlot.replace(/(\by:\s*)(\d+)/, (m, prefix, val) => {
              const newY = Math.round(parseInt(val, 10) * scaleY);
              return `${prefix}${newY}`;
            });
            // update height
            updatedSlot = updatedSlot.replace(/(\bheight:\s*)(\d+)/, (m, prefix, val) => {
              const newH = Math.round(parseInt(val, 10) * scaleY);
              return `${prefix}${newH}`;
            });
            return updatedSlot;
          });
          return `photoSlots: [${updatedSlots}],`;
        });

        // 3. Update textElements if any
        block = block.replace(/textElements:\s*\[([\s\S]*?)\]\s*,/g, (match, textContent) => {
          const updatedText = textContent.replace(/(\{\s*id:\s*['"][^'"]+['"][\s\S]*?\})/g, (elemMatch) => {
            let updatedElem = elemMatch;
            updatedElem = updatedElem.replace(/(\by:\s*)(\d+)/, (m, prefix, val) => {
              const newY = Math.round(parseInt(val, 10) * scaleY);
              return `${prefix}${newY}`;
            });
            return updatedElem;
          });
          return `textElements: [${updatedText}],`;
        });

        console.log(`[CODE] Updated template in ${path.basename(filePath)}: scaled slots by ${scaleY.toFixed(4)} to height ${TARGET_HEIGHT}`);
      }
    }
    newBlocks.push(block);
  }

  const updatedContent = header + newBlocks.map(b => 'export const ' + b).join('');
  
  // Backup code file
  const codeBackup = filePath + '.bak4200';
  if (!fs.existsSync(codeBackup)) {
    fs.writeFileSync(codeBackup, content, 'utf8');
  }

  fs.writeFileSync(filePath, updatedContent, 'utf8');
  console.log(`[DONE] Saved updated ${filePath}`);
}

async function run() {
  await processTemplateFile(path.join(__dirname, '../src/templates/glamBatchTemplates.ts'));
  await processTemplateFile(path.join(__dirname, '../src/templates/emoTicketTemplates.ts'));
  await processTemplateFile(path.join(__dirname, '../src/templates/festiveKioskTemplates.ts'));
}

run().catch(console.error);

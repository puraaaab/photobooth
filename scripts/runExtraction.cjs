const path = require('path');
const fs = require('fs');
const sharp = require('sharp');
const { extractStickersFromSheet } = require('./extractStickers.cjs');

const userUploadDir = 'C:/Users/purab/.gemini/antigravity-ide/brain/9637d912-5234-47ab-8746-30b4ac70c69a/.user_uploaded';
const outputDir = 'c:/projects/Photobooth/public/stickers/extracted_test';

if (!fs.existsSync(outputDir)) {
  fs.mkdirSync(outputDir, { recursive: true });
}

async function run() {
  const files = fs.readdirSync(userUploadDir).filter(f => f.endsWith('.png'));

  let globalIndex = 0;
  for (const file of files) {
    const filePath = path.join(userUploadDir, file);
    console.log(`\n================ Processing ${file} ================`);
    const { mergedComponents, data, info, bgMask } = await extractStickersFromSheet(filePath);

    for (let i = 0; i < mergedComponents.length; i++) {
      globalIndex++;
      const comp = mergedComponents[i];
      const pad = 4;
      const cropX = Math.max(0, comp.minX - pad);
      const cropY = Math.max(0, comp.minY - pad);
      const cropW = Math.min(info.width - cropX, comp.width + pad * 2);
      const cropH = Math.min(info.height - cropY, comp.height + pad * 2);

      // Create an RGBA buffer for the cropped sticker
      const stickerBuffer = Buffer.alloc(cropW * cropH * 4);

      for (let y = 0; y < cropH; y++) {
        for (let x = 0; x < cropW; x++) {
          const srcX = cropX + x;
          const srcY = cropY + y;
          const srcIdx = (srcY * info.width + srcX) * info.channels;
          const destIdx = (y * cropW + x) * 4;

          const maskVal = bgMask[srcY * info.width + srcX];

          if (maskVal === 1) {
            // Background -> fully transparent
            stickerBuffer[destIdx] = 0;
            stickerBuffer[destIdx + 1] = 0;
            stickerBuffer[destIdx + 2] = 0;
            stickerBuffer[destIdx + 3] = 0;
          } else {
            // Foreground sticker
            stickerBuffer[destIdx] = data[srcIdx];
            stickerBuffer[destIdx + 1] = data[srcIdx + 1];
            stickerBuffer[destIdx + 2] = data[srcIdx + 2];
            stickerBuffer[destIdx + 3] = info.channels === 4 ? data[srcIdx + 3] : 255;
          }
        }
      }

      const outName = `sticker_${globalIndex.toString().padStart(2, '0')}_${comp.width}x${comp.height}.png`;
      const outPath = path.join(outputDir, outName);

      await sharp(stickerBuffer, {
        raw: {
          width: cropW,
          height: cropH,
          channels: 4
        }
      })
      .trim() // Trims any transparent boundary perfectly
      .png({ compressionLevel: 9 })
      .toFile(outPath);

      const croppedMeta = await sharp(outPath).metadata();
      console.log(`Saved: ${outName} (${croppedMeta.width}x${croppedMeta.height} px, ${fs.statSync(outPath).size} bytes)`);
    }
  }
  console.log(`\nSuccessfully extracted ${globalIndex} stickers!`);
}

run().catch(err => {
  console.error(err);
  process.exit(1);
});

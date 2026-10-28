const sharp = require('sharp');
const fs = require('fs');
const path = require('path');

const TARGET_WIDTH = 1200;
const TARGET_HEIGHT = 4200; // 6cm x 21cm @ standard photobooth DPI ratio

const BACKUP_DIR = path.join(__dirname, '../public/templates/backup_before_4200');
if (!fs.existsSync(BACKUP_DIR)) {
  fs.mkdirSync(BACKUP_DIR, { recursive: true });
}

// 1. Resize an image overlay while preserving 32-bit RGBA alpha transparency
async function resizeOverlayImage(relPath) {
  const fullPath = path.join(__dirname, '../public', relPath.replace(/^\//, ''));
  if (!fs.existsSync(fullPath)) {
    console.warn(`[WARN] Image not found: ${fullPath}`);
    return null;
  }

  const meta = await sharp(fullPath).metadata();
  if (meta.width === TARGET_WIDTH && meta.height === TARGET_HEIGHT) {
    console.log(`[SKIP] Already 1200x4200: ${relPath}`);
    return { oldWidth: meta.width, oldHeight: meta.height, scaleY: 1 };
  }

  // Backup original
  const backupPath = path.join(BACKUP_DIR, path.basename(fullPath));
  if (!fs.existsSync(backupPath)) {
    fs.copyFileSync(fullPath, backupPath);
  }

  const scaleY = TARGET_HEIGHT / meta.height;

  // Use sharp Lanczos3 resampling with raw RGBA channel preservation
  const buffer = await sharp(fullPath)
    .resize({
      width: TARGET_WIDTH,
      height: TARGET_HEIGHT,
      fit: 'fill',
      kernel: 'lanczos3'
    })
    .png({
      compressionLevel: 8,
      adaptiveFiltering: true,
      force: true
    })
    .toBuffer();

  fs.writeFileSync(fullPath, buffer);
  console.log(`[OK] Resized image ${relPath}: ${meta.width}x${meta.height} -> ${TARGET_WIDTH}x${TARGET_HEIGHT} (scaleY: ${scaleY.toFixed(4)})`);

  return { oldWidth: meta.width, oldHeight: meta.height, scaleY };
}

module.exports = {
  resizeOverlayImage,
  TARGET_WIDTH,
  TARGET_HEIGHT
};

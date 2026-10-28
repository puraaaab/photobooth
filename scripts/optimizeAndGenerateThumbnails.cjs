const fs = require('fs');
const path = require('path');
const sharp = require('sharp');

const ROOT_DIR = path.resolve(__dirname, '..');
const TEMPLATES_DIR = path.join(ROOT_DIR, 'public', 'templates');
const THUMBS_DIR = path.join(TEMPLATES_DIR, 'thumbs');

if (!fs.existsSync(THUMBS_DIR)) {
  fs.mkdirSync(THUMBS_DIR, { recursive: true });
}

async function run() {
  console.log('--- Optimizing Overlays and Generating Lightweight Thumbnails ---');

  const files = fs.readdirSync(TEMPLATES_DIR).filter(f => f.endsWith('.png'));
  console.log(`Found ${files.length} PNG overlay files in public/templates/`);

  let thumbsCreated = 0;
  let oversizedFixed = 0;

  for (const file of files) {
    const fullPath = path.join(TEMPLATES_DIR, file);
    const thumbName = file.replace(/\.png$/i, '-thumb.webp');
    const thumbPath = path.join(THUMBS_DIR, thumbName);

    try {
      const meta = await sharp(fullPath).metadata();

      // Check if image has insane dimensions (e.g. > 5000px height or > 50MB)
      const stats = fs.statSync(fullPath);
      const isOversized = stats.size > 8 * 1024 * 1024 || meta.height > 5500;

      if (isOversized) {
        console.log(`  Fixing oversized overlay: ${file} (${(stats.size / 1024 / 1024).toFixed(1)}MB, ${meta.width}x${meta.height})`);
        const maxH = 4200;
        const newH = Math.min(meta.height, maxH);
        const newW = Math.round((newH / meta.height) * meta.width);

        const optimizedBuffer = await sharp(fullPath)
          .resize(newW, newH, { fit: 'inside' })
          .png({ compressionLevel: 9, palette: true })
          .toBuffer();

        fs.writeFileSync(fullPath, optimizedBuffer);
        const newStats = fs.statSync(fullPath);
        console.log(`    -> Reduced to ${(newStats.size / 1024).toFixed(0)}KB`);
        oversizedFixed++;
      }

      // Generate ultra-lightweight WebP thumbnail (260px wide, ~15KB)
      await sharp(fullPath)
        .resize(260, null, { fit: 'inside', withoutEnlargement: true })
        .webp({ quality: 80, effort: 4 })
        .toFile(thumbPath);

      thumbsCreated++;
    } catch (err) {
      console.error(`  Error processing ${file}:`, err.message);
    }
  }

  console.log(`\nDone! Created ${thumbsCreated} thumbnails in public/templates/thumbs/`);
  console.log(`Fixed ${oversizedFixed} oversized overlays.`);
}

run().catch(console.error);

const sharp = require('sharp');
const fs = require('fs');
const path = require('path');

const ROOT_DIR = path.resolve(__dirname, '..');
const RB_DIR = path.join(ROOT_DIR, 'template_images', 'removed_backgrounds');
const TEMPLATES_DIR = path.join(ROOT_DIR, 'public', 'templates');

// Check custom-rb files
async function checkDamagedRb() {
  const rbFiles = fs.readdirSync(RB_DIR).filter(f => f.endsWith('.png'));
  console.log(`Checking ${rbFiles.length} files in removed_backgrounds...`);

  const damaged = [];
  for (const f of rbFiles) {
    let rawBase = path.basename(f, path.extname(f))
      .toLowerCase()
      .replace(/[^a-z0-9_-]/g, '-')
      .replace(/-+/g, '-')
      .replace(/^-|-$/g, '');
    if (rawBase.length > 24) rawBase = rawBase.slice(0, 24).replace(/-$/, '');
    const overlayFile = `custom-rb-${rawBase}-overlay.png`;
    const overlayPath = path.join(TEMPLATES_DIR, overlayFile);

    if (fs.existsSync(overlayPath)) {
      // Check if overlay has a lot fewer opaque pixels than original
      const origMeta = await sharp(path.join(RB_DIR, f)).metadata();
      const curMeta = await sharp(overlayPath).metadata();

      const origRaw = await sharp(path.join(RB_DIR, f)).raw().toBuffer({ resolveWithObject: true });
      const curRaw = await sharp(overlayPath).raw().toBuffer({ resolveWithObject: true });

      // Count opaque in orig vs cur
      let origOpaque = 0;
      for (let i = 0; i < origMeta.width * origMeta.height; i++) {
        if (origRaw.data[i * 4 + 3] >= 30) {
          const r = origRaw.data[i * 4], g = origRaw.data[i * 4 + 1], b = origRaw.data[i * 4 + 2];
          const isGreen = g > 110 && g > r * 1.2 && g > b * 1.2;
          if (!isGreen) origOpaque++;
        }
      }

      let curOpaque = 0;
      for (let i = 0; i < curMeta.width * curMeta.height; i++) {
        if (curRaw.data[i * 4 + 3] >= 30) curOpaque++;
      }

      // Expected curOpaque is roughly origOpaque * (curMeta.width / origMeta.width)^2
      const scale = curMeta.width / origMeta.width;
      const expectedCurOpaque = origOpaque * scale * scale;

      const ratio = curOpaque / expectedCurOpaque;
      if (ratio < 0.85) {
        damaged.push({ file: f, overlayFile, ratio: ratio.toFixed(2), expected: Math.round(expectedCurOpaque), actual: curOpaque });
      }
    }
  }

  console.log(`\nFound ${damaged.length} DAMAGED custom-rb templates where strip paper was eaten away!`);
  damaged.slice(0, 20).forEach(d => console.log(`  ${d.overlayFile}: ratio=${d.ratio} (lost ${(100 - d.ratio*100).toFixed(0)}% of content!)`));
}
checkDamagedRb();

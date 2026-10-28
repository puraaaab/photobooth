const sharp = require('sharp');
const path = require('path');
const fs = require('fs');

const targetDir = 'C:\\Users\\purab\\.gemini\\antigravity-ide\\brain\\f62d7079-c14e-4330-aa9d-15d9ca579fad\\template_preview';

if (!fs.existsSync(targetDir)) {
  fs.mkdirSync(targetDir, { recursive: true });
}

// Clean up test.jpg if exists
if (fs.existsSync('test.jpg')) fs.unlinkSync('test.jpg');

const files = [
  'burgundy-ribbon-3-overlay.png',
  'cinema-ticket-1-overlay.png',
  'cinema-ticket-3-overlay.png',
  'crimson-kiss-2-overlay.png',
  'custom-8c1e99bc-1ae4-4fdb-8fb3-4dde-overlay.png',
  'custom-85b918ac-4e65-4649-9c34-33e3-overlay.png'
];

async function run() {
  for (const f of files) {
    const srcPath = path.join('public/templates', f);
    const srcBuf = await sharp(srcPath).toBuffer();
    const meta = await sharp(srcBuf).metadata();

    // Create a pleasant photographic placeholder backing (soft charcoal) so the transparent cutouts are instantly clear
    const bgBuf = await sharp({
      create: {
        width: meta.width,
        height: meta.height,
        channels: 4,
        background: { r: 30, g: 34, b: 42, alpha: 1 }
      }
    }).png().toBuffer();

    const previewName = f.replace('.png', '-preview.jpg');
    const dest = path.join(targetDir, previewName);

    await sharp(bgBuf)
      .composite([{ input: srcBuf }])
      .resize({ width: 480 })
      .jpeg({ quality: 90 })
      .toFile(dest);

    console.log('Successfully generated preview for:', f, meta.width + 'x' + meta.height);
  }
}

run().catch(console.error);

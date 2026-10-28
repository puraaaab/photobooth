const sharp = require('sharp');
const fs = require('fs');
const path = require('path');

const targetDir = 'C:\\Users\\purab\\.gemini\\antigravity-ide\\brain\\f62d7079-c14e-4330-aa9d-15d9ca579fad\\fixed_templates_preview';
if (!fs.existsSync(targetDir)) {
  fs.mkdirSync(targetDir, { recursive: true });
}

const list = [
  { name: '1-golden-glow-bears', file: 'public/templates/template-img-4ae8332f-5d11-4eb1-b574-overlay.png' },
  { name: '2-pearl-blue-stars', file: 'public/templates/template-img-386d528e-49be-44f4-8772-overlay.png' },
  { name: '3-pearl-seaside-left', file: 'public/templates/template-img-72498825-8037-45dd-93a5-overlay.png' },
  { name: '3-pearl-starlight-right', file: 'public/templates/template-img-72498825-part2-overlay.png' },
  { name: '4-golden-glow-knit-2shot', file: 'public/templates/template-img-chatgpt-image-sep-30-202-overlay.png' },
  { name: '5-pearl-red-bows', file: 'public/templates/template-img-e0fd4bf0-a89d-461e-835a-overlay.png' },
];

async function run() {
  for (const item of list) {
    const srcBuf = await sharp(item.file).toBuffer();
    const meta = await sharp(srcBuf).metadata();
    const bg = await sharp({
      create: {
        width: meta.width,
        height: meta.height,
        channels: 4,
        background: { r: 24, g: 28, b: 36, alpha: 1 }
      }
    }).png().toBuffer();

    const compBuf = await sharp(bg).composite([{ input: srcBuf }]).png().toBuffer();
    const dest = path.join(targetDir, item.name + '.jpg');

    await sharp(compBuf)
      .resize({ width: 450 })
      .jpeg({ quality: 90 })
      .toFile(dest);

    console.log('Generated preview for:', item.name);
  }
}

run().catch(console.error);

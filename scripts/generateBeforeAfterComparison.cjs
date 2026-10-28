const sharp = require('sharp');
const path = require('path');
const fs = require('fs');

const targetDir = 'C:\\Users\\purab\\.gemini\\antigravity-ide\\brain\\f62d7079-c14e-4330-aa9d-15d9ca579fad\\before_after_previews';
if (!fs.existsSync(targetDir)) {
  fs.mkdirSync(targetDir, { recursive: true });
}

const templates = [
  {
    name: 'Burgundy Ribbon & Hearts (3-Shot)',
    filename: 'burgundy-ribbon-3-overlay.png',
  },
  {
    name: 'Cinema Ticket Admission (3-Shot)',
    filename: 'cinema-ticket-3-overlay.png',
  },
  {
    name: 'Cinema Ticket Single Hero (1-Shot)',
    filename: 'cinema-ticket-1-overlay.png',
  },
  {
    name: 'Crimson Kiss Noir (2-Shot)',
    filename: 'crimson-kiss-2-overlay.png',
  }
];

function escapeXml(str) {
  return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

async function createCard(srcPath, label, targetH = 850) {
  const srcBuf = await sharp(srcPath).toBuffer();
  const meta = await sharp(srcBuf).metadata();
  
  const bgBuf = await sharp({
    create: {
      width: meta.width,
      height: meta.height,
      channels: 4,
      background: { r: 24, g: 27, b: 34, alpha: 1 }
    }
  }).png().toBuffer();

  const comp = await sharp(bgBuf)
    .composite([{ input: srcBuf }])
    .png()
    .toBuffer();

  // Resize composite directly
  const resized = await sharp(comp)
    .resize({ height: targetH })
    .png()
    .toBuffer();

  const resMeta = await sharp(resized).metadata();

  // Overlay label bar
  const barSvg = Buffer.from(`
    <svg width="${resMeta.width}" height="48" viewBox="0 0 ${resMeta.width} 48" xmlns="http://www.w3.org/2000/svg">
      <rect width="100%" height="100%" fill="#090d16"/>
      <text x="${resMeta.width / 2}" y="30" font-size="15" font-family="Arial, sans-serif" font-weight="bold" fill="#38bdf8" text-anchor="middle">${escapeXml(label)}: ${meta.width}x${meta.height}</text>
    </svg>
  `);

  return sharp(resized)
    .composite([{ input: barSvg, top: 0, left: 0 }])
    .png()
    .toBuffer();
}

async function run() {
  for (const t of templates) {
    const beforeFile = path.join('public/templates/backup_before_4200', t.filename);
    const afterFile = path.join('public/templates', t.filename);

    if (!fs.existsSync(beforeFile) || !fs.existsSync(afterFile)) {
      console.log('Skipping', t.filename, 'not found in both dirs');
      continue;
    }

    const beforeCard = await createCard(beforeFile, 'BEFORE', 850);
    const afterCard = await createCard(afterFile, 'AFTER (6x21 cm)', 850);

    const bMeta = await sharp(beforeCard).metadata();
    const aMeta = await sharp(afterCard).metadata();

    const gap = 30;
    const totalW = bMeta.width + aMeta.width + gap + 40;
    const totalH = 920;

    const canvasBg = await sharp({
      create: {
        width: totalW,
        height: totalH,
        channels: 4,
        background: { r: 15, g: 18, b: 24, alpha: 1 }
      }
    }).png().toBuffer();

    const titleSvg = Buffer.from(`
      <svg width="${totalW}" height="45" viewBox="0 0 ${totalW} 45" xmlns="http://www.w3.org/2000/svg">
        <text x="${totalW / 2}" y="32" font-size="20" font-family="Arial, sans-serif" font-weight="bold" fill="#f8fafc" text-anchor="middle">${escapeXml(t.name)}</text>
      </svg>
    `);

    const sideBySideName = t.filename.replace('.png', '-comparison.jpg');
    const dest = path.join(targetDir, sideBySideName);

    await sharp(canvasBg)
      .composite([
        { input: titleSvg, top: 5, left: 0 },
        { input: beforeCard, top: 50, left: 20 },
        { input: afterCard, top: 50, left: 20 + bMeta.width + gap }
      ])
      .jpeg({ quality: 92 })
      .toFile(dest);

    console.log('Generated comparison for:', t.name, '->', sideBySideName);
  }
}

run().catch(console.error);

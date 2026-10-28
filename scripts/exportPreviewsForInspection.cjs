const sharp = require('sharp');
const path = require('path');
const fs = require('fs');

const targetDir = 'C:\\Users\\purab\\.gemini\\antigravity-ide\\brain\\f62d7079-c14e-4330-aa9d-15d9ca579fad\\defect_inspection';
if (!fs.existsSync(targetDir)) {
  fs.mkdirSync(targetDir, { recursive: true });
}

async function exportPreview(srcPath, name) {
  if (!fs.existsSync(srcPath)) return;
  const dest = path.join(targetDir, name + '.jpg');
  await sharp(srcPath).resize({ width: 600 }).jpeg({ quality: 90 }).toFile(dest);
  console.log('Exported:', name);
}

async function run() {
  await exportPreview('template_images/4ae8332f-5d11-4eb1-b574-60753b77af86.png', '1-source-golden-glow');
  await exportPreview('public/templates/template-img-4ae8332f-5d11-4eb1-b574-overlay.png', '1-overlay-golden-glow');

  await exportPreview('template_images/386d528e-49be-44f4-8772-cd45cf9725c3.jpg', '2-source-pearl-blue-stars');
  await exportPreview('public/templates/template-img-386d528e-49be-44f4-8772-overlay.png', '2-overlay-pearl-blue-stars');

  await exportPreview('template_images/72498825-8037-45dd-93a5-46f1de1348e1.jpg', '3-source-pearl-two-in-one');
  await exportPreview('public/templates/template-img-72498825-8037-45dd-93a5-overlay.png', '3-overlay-pearl-two-in-one');

  await exportPreview('public/templates/template-img-chatgpt-image-sep-30-202-overlay.png', '4-overlay-golden-glow-knit');

  await exportPreview('template_images/e0fd4bf0-a89d-461e-835a-cadf8642dedc.jpg', '5-source-pearl-red-bows');
  await exportPreview('public/templates/template-img-e0fd4bf0-a89d-461e-835a-overlay.png', '5-overlay-pearl-red-bows');
}

run();

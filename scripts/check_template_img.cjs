const sharp = require('sharp');
const fs = require('fs');
const path = require('path');

const ROOT_DIR = path.resolve(__dirname, '..');
const TI_DIR = path.join(ROOT_DIR, 'template_images');
const TEMPLATES_DIR = path.join(ROOT_DIR, 'public', 'templates');

async function checkTemplateImg() {
  const tsContent = fs.readFileSync(path.join(ROOT_DIR, 'src', 'templates', 'batchGeneratedTemplates.ts'), 'utf8');
  const startIdx = tsContent.search(/\[\s*\{/);
  const endIdx = tsContent.lastIndexOf(']');
  const templates = JSON.parse(tsContent.substring(startIdx, endIdx + 1));
  const tImg = templates.filter(t => !t.id.startsWith('custom-rb-'));

  console.log(`Checking ${tImg.length} template-img-* templates...`);
  // All template-img files
  for (const t of tImg) {
    const overlayFile = path.basename(t.overlayImageUrl);
    console.log(`Checking ${t.id} (${t.name}) -> ${overlayFile}`);
  }
}
checkTemplateImg();

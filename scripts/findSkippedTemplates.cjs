const fs = require('fs');
const path = require('path');

const content = fs.readFileSync('src/templates/batchGeneratedTemplates.ts', 'utf8');
const assignIdx = content.indexOf('= [');
const startIdx = content.indexOf('[', assignIdx);
const endIdx = content.lastIndexOf(']');
const templates = JSON.parse(content.slice(startIdx, endIdx + 1));

console.log('Total templates in batch:', templates.length);

const skipped3or4 = [];
templates.forEach(t => {
  const pCount = (t.supportedPhotoCounts || [])[0];
  if ((pCount === 3 || pCount === 4) && t.canvas.height !== 4200) {
    const fullImgPath = path.join('public', (t.overlayImageUrl || '').replace(/^\//, ''));
    const imgExists = fs.existsSync(fullImgPath);
    skipped3or4.push({
      id: t.id,
      name: t.name,
      photoCount: pCount,
      height: t.canvas.height,
      overlayUrl: t.overlayImageUrl,
      imgExists
    });
  }
});

console.log(`Found ${skipped3or4.length} templates with 3 or 4 photos that are NOT 4200:`);
skipped3or4.forEach(s => {
  console.log(`  - [${s.photoCount}-shot] ${s.name} (${s.id}) h=${s.height} | imgExists=${s.imgExists} | ${s.overlayUrl}`);
});

const sharp = require('sharp');
const fs = require('fs');
const path = require('path');

const mappings = [
  {
    id: 'template-img-386d528e-49be-44f4-8772',
    src: 'public/templates/custom-386d528e-49be-44f4-8772-cd45-overlay.png',
    dest: 'public/templates/template-img-386d528e-49be-44f4-8772-overlay.png'
  },
  {
    id: 'template-img-72498825-8037-45dd-93a5',
    src: 'public/templates/custom-72498825-8037-45dd-93a5-46f1-part1-overlay.png',
    dest: 'public/templates/template-img-72498825-8037-45dd-93a5-overlay.png'
  },
  {
    id: 'template-img-cce483a3-d13c-4500-b2e1',
    src: 'public/templates/custom-cce483a3-d13c-4500-b2e1-cd97-overlay.png',
    dest: 'public/templates/template-img-cce483a3-d13c-4500-b2e1-overlay.png'
  },
  {
    id: 'template-img-e0fd4bf0-a89d-461e-835a',
    src: 'public/templates/custom-e0fd4bf0-a89d-461e-835a-cadf-overlay.png',
    dest: 'public/templates/template-img-e0fd4bf0-a89d-461e-835a-overlay.png'
  }
];

async function run() {
  for (const m of mappings) {
    if (fs.existsSync(m.src)) {
      await sharp(m.src)
        .resize({ width: 1200, height: 4200, fit: 'fill', kernel: 'lanczos3' })
        .png({ compressionLevel: 8 })
        .toFile(m.dest);
      console.log('Processed', m.dest);
    }
  }

  // Update batchGeneratedTemplates.ts
  const tplFile = path.join(__dirname, '../src/templates/batchGeneratedTemplates.ts');
  const content = fs.readFileSync(tplFile, 'utf8');

  const assignIdx = content.indexOf('= [');
  const startIdx = content.indexOf('[', assignIdx);
  const endIdx = content.lastIndexOf(']');
  const prefix = content.slice(0, startIdx);
  const suffix = content.slice(endIdx + 1);
  const templates = JSON.parse(content.slice(startIdx, endIdx + 1));

  const allTargetIds = [
    'template-img-3282e81d-6869-403b-854e',
    'template-img-386d528e-49be-44f4-8772',
    'template-img-72498825-8037-45dd-93a5',
    'template-img-cce483a3-d13c-4500-b2e1',
    'template-img-e0fd4bf0-a89d-461e-835a'
  ];

  for (const t of templates) {
    if (allTargetIds.includes(t.id) && t.canvas.height !== 4200) {
      const oldH = t.canvas.height;
      const scaleY = 4200 / oldH;
      t.canvas.width = 1200;
      t.canvas.height = 4200;
      if (Array.isArray(t.photoSlots)) {
        t.photoSlots.forEach(slot => {
          slot.y = Math.round(slot.y * scaleY);
          slot.height = Math.round(slot.height * scaleY);
        });
      }
      console.log('Updated template in code:', t.id, `(scaled by ${scaleY.toFixed(4)})`);
    }
  }

  fs.writeFileSync(tplFile, prefix + JSON.stringify(templates, null, 2) + suffix, 'utf8');
  console.log('Saved batchGeneratedTemplates.ts successfully!');
}

run().catch(console.error);

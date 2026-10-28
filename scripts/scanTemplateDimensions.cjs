const fs = require('fs');
const path = require('path');

const files = [
  'src/templates/glamBatchTemplates.ts',
  'src/templates/emoTicketTemplates.ts',
  'src/templates/festiveKioskTemplates.ts',
  'src/templates/papitFilmStrip.ts',
  'src/data/templates.ts'
];

for (const f of files) {
  if (fs.existsSync(f)) {
    const content = fs.readFileSync(f, 'utf8');
    const regex = /id:\s*['"]([^'"]+)['"][\s\S]*?canvas:\s*\{\s*width:\s*(\d+),\s*height:\s*(\d+)\s*\}/g;
    let match;
    const found = [];
    while ((match = regex.exec(content)) !== null) {
      found.push({ id: match[1], width: match[2], height: match[3] });
    }
    console.log(f, 'has', found.length, 'templates');
    found.forEach(t => console.log('  ', t.id, t.width + 'x' + t.height));
  }
}

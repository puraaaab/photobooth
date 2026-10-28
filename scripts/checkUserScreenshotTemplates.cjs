const fs = require('fs');

const content = fs.readFileSync('src/templates/batchGeneratedTemplates.ts', 'utf8');

const names = [
  'Golden Glow',
  'Sky Breeze',
  'Silver Slate',
  'Velvet Crimson',
  'Pearl Minimal',
  'Rose Blush'
];

const assignIdx = content.indexOf('= [');
const startIdx = content.indexOf('[', assignIdx);
const endIdx = content.lastIndexOf(']');
const templates = JSON.parse(content.slice(startIdx, endIdx + 1));

console.log('Total templates:', templates.length);

const foundHeights = {};
templates.forEach(t => {
  const h = t.canvas.height;
  foundHeights[h] = (foundHeights[h] || 0) + 1;
});
console.log('All canvas heights in batchGeneratedTemplates:', foundHeights);

// Find templates matching names
names.forEach(name => {
  const matches = templates.filter(t => t.name.includes(name));
  console.log(`\nName: ${name} (matched ${matches.length})`);
  matches.slice(0, 5).forEach(m => {
    console.log(`  - ${m.name} | photos: ${m.supportedPhotoCounts} | canvas: ${m.canvas.width}x${m.canvas.height}`);
  });
});

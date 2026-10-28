const fs = require('fs');

const content = fs.readFileSync('src/templates/batchGeneratedTemplates.ts', 'utf8');

const jsonMatch = content.match(/export const BATCH_GENERATED_TEMPLATES: Template\[\] = (\[[\s\S]*\]);?/);
if (!jsonMatch) {
  console.log('Could not find array in file');
  process.exit(1);
}

const templates = JSON.parse(jsonMatch[1]);
console.log('Total parsed templates:', templates.length);

const targets = [
  'cinema ticket',
  'silver slate',
  'pearl minimal',
  'velvet crimson',
  'rose blush'
];

targets.forEach(query => {
  console.log(`\n=== QUERY: "${query}" ===`);
  const found = templates.filter(t => t.name.toLowerCase().includes(query.toLowerCase()));
  found.forEach(t => {
    console.log(`- ID: ${t.id}`);
    console.log(`  Name: ${t.name}`);
    console.log(`  Canvas: ${t.canvas.width}x${t.canvas.height}`);
    console.log(`  Overlay: ${t.overlayImageUrl}`);
    console.log(`  Slots (${t.photoSlots.length}):`, JSON.stringify(t.photoSlots));
  });
});

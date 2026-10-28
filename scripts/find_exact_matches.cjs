const fs = require('fs');

const content = fs.readFileSync('src/templates/batchGeneratedTemplates.ts', 'utf8');
const jsonMatch = content.match(/export const BATCH_GENERATED_TEMPLATES: Template\[\] = (\[[\s\S]*\]);?/);
const templates = JSON.parse(jsonMatch[1]);

const exactQueries = [
  'Retro Cinema Ticket (3-Shot)',
  'Retro Cinema Ticket Solo (1-Shot)',
  'Silver Slate Aesthetic Strip (3-Shot)',
  'Pearl Minimal Aesthetic Strip (1-Shot)',
  'Velvet Crimson Slanted Strip (1-Shot)',
  'Rose Blush Aesthetic Strip (1-Shot)'
];

exactQueries.forEach(eq => {
  const match = templates.filter(t => t.name.startsWith(eq) || t.name === eq);
  console.log(`\nMatch for "${eq}": count=${match.length}`);
  match.forEach(m => {
    console.log(`  ID: ${m.id}`);
    console.log(`  Name: ${m.name}`);
    console.log(`  Canvas: ${m.canvas.width}x${m.canvas.height}`);
    console.log(`  Overlay: ${m.overlayImageUrl}`);
    console.log(`  Thumbnail: ${m.thumbnailUrl}`);
    console.log(`  Slots:`, JSON.stringify(m.photoSlots));
  });
});

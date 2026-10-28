const sharp = require('sharp');

async function checkTicketStructure() {
  const img = sharp('template_images/Cinema_ticket.png');
  const meta = await img.metadata();
  const raw = await img.raw().toBuffer();
  const w = meta.width;
  const h = meta.height;

  // Let's sample a line at y = 200 across all x
  console.log('Sample line at y=200 for Cinema_ticket.png:');
  for (let x = 0; x < w; x += 20) {
    const idx = (200 * w + x) * 3;
    console.log(`x=${x}: rgb(${raw[idx]}, ${raw[idx+1]}, ${raw[idx+2]})`);
  }
}
checkTicketStructure();

const sharp = require('sharp');

async function inspectSourceCinema() {
  for (const name of ['Cinema_ticket.png', 'Cinema_ticket_1photo.png']) {
    const file = `template_images/${name}`;
    const img = sharp(file);
    const meta = await img.metadata();
    console.log(`\nOriginal: ${file} (${meta.width}x${meta.height}, channels: ${meta.channels})`);
    
    // Check color distribution along edges
    const raw = await img.raw().toBuffer();
    const w = meta.width;
    const h = meta.height;
    
    // Check 4 corners
    const corners = [
      { name: 'Top-Left', x: 20, y: 20 },
      { name: 'Top-Right', x: w - 20, y: 20 },
      { name: 'Bottom-Left', x: 20, y: h - 20 },
      { name: 'Bottom-Right', x: w - 20, y: h - 20 }
    ];
    corners.forEach(c => {
      const idx = (c.y * w + c.x) * meta.channels;
      console.log(`  ${c.name} (${c.x}, ${c.y}): rgb(${raw[idx]}, ${raw[idx+1]}, ${raw[idx+2]})${meta.channels === 4 ? ' a=' + raw[idx+3] : ''}`);
    });
  }
}
inspectSourceCinema();

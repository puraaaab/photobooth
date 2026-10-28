const sharp = require('sharp');
const fs = require('fs');

async function inspectCinema() {
  for (const name of ['template-img-cinema_ticket-overlay.png', 'template-img-cinema_ticket_1photo-overlay.png']) {
    const file = `public/templates/${name}`;
    const img = sharp(file);
    const meta = await img.metadata();
    console.log(`\nFile: ${file} (${meta.width}x${meta.height}, channels: ${meta.channels})`);
    
    // Check non-transparent pixels and their colors
    const raw = await img.raw().toBuffer();
    // Sample corners and edges
    // Let's check left edge, right edge, top edge, bottom edge
    console.log(`Pixel at (0, 0): rgba(${raw[0]}, ${raw[1]}, ${raw[2]}, ${raw[3]})`);
    console.log(`Pixel at (100, 100): rgba(${raw[(100 * meta.width + 100) * 4]}, ${raw[(100 * meta.width + 100) * 4 + 1]}, ${raw[(100 * meta.width + 100) * 4 + 2]}, ${raw[(100 * meta.width + 100) * 4 + 3]})`);
    console.log(`Pixel at (${meta.width - 20}, ${Math.floor(meta.height / 2)}): rgba(${raw[(Math.floor(meta.height / 2) * meta.width + meta.width - 20) * 4]}, ...)`);
  }
}
inspectCinema();

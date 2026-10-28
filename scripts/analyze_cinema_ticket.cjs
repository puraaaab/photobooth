const sharp = require('sharp');

async function analyzeCinemaTicket() {
  const img = sharp('template_images/Cinema_ticket.png');
  const { data, info } = await img.raw().toBuffer({ resolveWithObject: true });
  const w = info.width, h = info.height;

  // Let's inspect where the actual ticket boundaries are (the cream ticket with text)
  // Let's find pixels where r > 200 && g > 200 && b > 180 (ticket body)
  // vs r < 100 && g < 100 && b < 100 (dark shadow / backing)
  let minX = w, maxX = 0, minY = h, maxY = 0;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const idx = (y * w + x) * 3;
      const r = data[idx], g = data[idx+1], b = data[idx+2];
      // Check if ticket body or ticket content
      // ticket body is warm cream or dark text inside ticket or green screen
      // dark shadow outside ticket is around x < 70 or x > 310, y < 100 or y > 950
    }
  }

  // Sample across y=100, 300, 500, 700, 900
  [100, 300, 500, 700, 900].forEach(y => {
    console.log(`\nRow y=${y}:`);
    for (let x = 0; x < w; x += 30) {
      const idx = (y * w + x) * 3;
      console.log(`  x=${x}: (${data[idx]}, ${data[idx+1]}, ${data[idx+2]})`);
    }
  });
}
analyzeCinemaTicket();

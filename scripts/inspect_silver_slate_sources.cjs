const sharp = require('sharp');

async function inspectSilverSlateSources() {
  const list = [
    { id: 'bad8ac94-4871-452b-bd09', file: 'bad8ac94-4871-452b-bd09-347b306c7db1.jpg' },
    { id: 'c55fd71a-0238-4820-9520', file: 'c55fd71a-0238-4820-9520-2024651727a5.jpg' },
    { id: 'd549ed68-af43-4cd1-a6a8', file: 'd549ed68-af43-4cd1-a6a8-ce246439ae22.jpg' },
    { id: 'd612a3e8-73b3-4db7-8c43', file: 'd612a3e8-73b3-4db7-8c43-2f1a086140b3.jpg' }
  ];

  for (const item of list) {
    const p = `template_images/${item.file}`;
    const meta = await sharp(p).metadata();
    const raw = await sharp(p).raw().toBuffer();
    const w = meta.width, h = meta.height;
    // sample corner
    console.log(`${item.id} (${item.file}) size: ${w}x${h}`);
    console.log(`  corner (10, 10): rgb(${raw[0]}, ${raw[1]}, ${raw[2]})`);
    console.log(`  center (${Math.floor(w/2)}, ${Math.floor(h/2)}): rgb(${raw[(Math.floor(h/2)*w + Math.floor(w/2))*3]}, ...)`);
  }
}
inspectSilverSlateSources();

const sharp = require('sharp');

async function testMockupCrop() {
  const list = [
    { id: '2c58d6f6-11f4-4664-916f', file: '2c58d6f6-11f4-4664-916f-8ad631d3faf4.png', name: 'Silver Slate 4-shot' },
    { id: '1443a760-2e64-410f-879e', file: '1443a760-2e64-410f-879e-c2aa7a26fa61.png', name: 'Silver Slate 3-shot' },
    { id: '4a41de25-7340-4960-9da3', file: '4a41de25-7340-4960-9da3-647eb6078986.png', name: 'Deep Indigo 3-shot' }
  ];

  for (const item of list) {
    const img = sharp(`template_images/${item.file}`);
    const { data, info } = await img.raw().toBuffer({ resolveWithObject: true });
    const w = info.width, h = info.height;

    // In all 3, the strip is bounded roughly x in [220, 720].
    // Let's find for each row where the strip is:
    // Notice the strip has green slots, stickers, white or denim paper.
    // The mockup background is grey textured:
    // Let's check color characteristics of the mockup background:
    // It's neutral grey: |r - g| <= 6, |r - b| <= 6, and r between 110 and 215.
    // Inside the strip:
    // In Silver Slate 4-shot: white paper (r,g,b > 240) + green slots (g > 150) + red cherries/lily/kiss
    // In Silver Slate 3-shot: white paper (r,g,b > 240) + green slots + blue ribbons (b > r + 30)
    // In Deep Indigo 3-shot: blue denim (b > 60, r < 30, g < 60) + gold stars (r > 180, g > 150) + green slots
    
    // Let's find exact bounding box of the strip
    let minX = w, maxX = 0, minY = h, maxY = 0;
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const idx = (y * w + x) * 3;
        const r = data[idx], g = data[idx+1], b = data[idx+2];
        const isNeutralGrey = Math.abs(r - g) <= 5 && Math.abs(r - b) <= 5 && Math.abs(g - b) <= 5 && r >= 105 && r <= 220;
        if (!isNeutralGrey) {
          if (x < minX) minX = x;
          if (x > maxX) maxX = x;
          if (y < minY) minY = y;
          if (y > maxY) maxY = y;
        }
      }
    }
    console.log(`${item.name} (${item.file}): Strip bounds: [${minX}, ${minY}] to [${maxX}, ${maxY}] size: ${maxX-minX+1}x${maxY-minY+1}`);
  }
}
testMockupCrop();

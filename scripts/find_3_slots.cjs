const sharp = require('sharp');

async function find3Slots() {
  const img = sharp('template_images/removed_backgrounds/awb4ye_Subject-1.png');
  const { data, info } = await img.raw().toBuffer({ resolveWithObject: true });
  const w = info.width, h = info.height;

  // Let's divide into 3 regions:
  // Region 1: y: [190, 500]
  // Region 2: y: [480, 790]
  // Region 3: y: [770, 1070]
  const regions = [
    { name: 'Slot 1', minY: 190, maxY: 505 },
    { name: 'Slot 2', minY: 485, maxY: 785 },
    { name: 'Slot 3', minY: 775, maxY: 1070 }
  ];

  for (const r of regions) {
    let minX = w, maxX = 0, minY = h, maxY = 0;
    // Find green pixels in this region
    let count = 0;
    for (let y = r.minY; y <= r.maxY; y++) {
      for (let x = 0; x < w; x++) {
        const idx = (y * w + x) * 4;
        const red = data[idx], green = data[idx+1], blue = data[idx+2];
        const isGreen = green > 150 && green > red * 1.3 && green > blue * 1.3;
        if (isGreen) {
          count++;
          if (x < minX) minX = x;
          if (x > maxX) maxX = x;
          if (y < minY) minY = y;
          if (y > maxY) maxY = y;
        }
      }
    }

    // Now let's calculate slant angle by checking top edge slope and bottom edge slope
    // For top edge: find first green y for each x
    const topPoints = [];
    for (let x = minX; x <= maxX; x += 10) {
      for (let y = r.minY; y <= r.maxY; y++) {
        const idx = (y * w + x) * 4;
        const isGreen = data[idx+1] > 150 && data[idx+1] > data[idx] * 1.3 && data[idx+1] > data[idx+2] * 1.3;
        if (isGreen) {
          topPoints.push({ x, y });
          break;
        }
      }
    }
    // linear regression on topPoints
    let sumX = 0, sumY = 0, sumXY = 0, sumXX = 0;
    for (const p of topPoints) {
      sumX += p.x; sumY += p.y; sumXY += p.x * p.y; sumXX += p.x * p.x;
    }
    const n = topPoints.length;
    const slope = (n * sumXY - sumX * sumY) / (n * sumXX - sumX * sumX);
    const angleDeg = (Math.atan(slope) * 180) / Math.PI;

    console.log(`${r.name}: bounds [${minX}, ${minY}] to [${maxX}, ${maxY}] (size: ${maxX-minX}x${maxY-minY}), angle: ${angleDeg.toFixed(2)} deg, green count: ${count}`);
  }
}
find3Slots();

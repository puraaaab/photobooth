const sharp = require('sharp');
const fs = require('fs');

function isGreen(r, g, b) {
  return g > 140 && g > r * 1.3 && g > b * 1.3;
}

async function analyze7249() {
  const file = 'template_images/72498825-8037-45dd-93a5-46f1de1348e1.jpg';
  const { data, info } = await sharp(file).raw().toBuffer({ resolveWithObject: true });
  console.log(`\n=== Analyzing 7249 (${info.width}x${info.height}) ===`);

  // Detect green boxes on Left half vs Right half
  const midX = Math.floor(info.width / 2);

  let leftGreen = { minX: info.width, maxX: 0, minY: info.height, maxY: 0, count: 0 };
  let rightGreen = { minX: info.width, maxX: 0, minY: info.height, maxY: 0, count: 0 };

  for (let y = 0; y < info.height; y++) {
    for (let x = 0; x < info.width; x++) {
      const idx = (y * info.width + x) * info.channels;
      if (isGreen(data[idx], data[idx+1], data[idx+2])) {
        if (x < midX) {
          leftGreen.count++;
          if (x < leftGreen.minX) leftGreen.minX = x;
          if (x > leftGreen.maxX) leftGreen.maxX = x;
          if (y < leftGreen.minY) leftGreen.minY = y;
          if (y > leftGreen.maxY) leftGreen.maxY = y;
        } else {
          rightGreen.count++;
          if (x < rightGreen.minX) rightGreen.minX = x;
          if (x > rightGreen.maxX) rightGreen.maxX = x;
          if (y < rightGreen.minY) rightGreen.minY = y;
          if (y > rightGreen.maxY) rightGreen.maxY = y;
        }
      }
    }
  }

  console.log('Left green strip:', leftGreen);
  console.log('Right green strip:', rightGreen);
}

analyze7249();

const sharp = require('sharp');

async function analyzeMockup() {
  const f = '2c58d6f6-11f4-4664-916f-8ad631d3faf4.png';
  const img = sharp(`template_images/${f}`);
  const { data, info } = await img.raw().toBuffer({ resolveWithObject: true });
  const w = info.width, h = info.height;

  // Let's sample corners and middle
  console.log('Corner (10, 10):', data[0], data[1], data[2]);
  console.log('At (200, 200):', data[(200*w + 200)*3], data[(200*w + 200)*3+1], data[(200*w + 200)*3+2]);
  console.log('Center (470, 836):', data[(836*w + 470)*3], data[(836*w + 470)*3+1], data[(836*w + 470)*3+2]);

  // Where does the white strip start in x?
  // Sample row y = 800 across x:
  console.log('\nRow y=800 across x:');
  for (let x = 0; x < w; x += 40) {
    const idx = (800 * w + x) * 3;
    console.log(`x=${x}: (${data[idx]}, ${data[idx+1]}, ${data[idx+2]})`);
  }
}
analyzeMockup();

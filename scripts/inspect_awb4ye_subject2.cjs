const sharp = require('sharp');

async function inspectAwb4yeSubject2() {
  const p1 = 'template_images/removed_backgrounds/awb4ye_Subject-2.png';
  const p2 = 'public/templates/custom-rb-awb4ye_subject-2-overlay.png';

  for (const p of [p1, p2]) {
    const meta = await sharp(p).metadata();
    console.log(`\nFile: ${p} (${meta.width}x${meta.height}, channels: ${meta.channels})`);
    const raw = await sharp(p).raw().toBuffer();
    // Check pixel at center
    const cx = Math.floor(meta.width / 2);
    const cy = Math.floor(meta.height / 2);
    const idx = (cy * meta.width + cx) * 4;
    console.log(`Center pixel (${cx}, ${cy}): rgba(${raw[idx]}, ${raw[idx+1]}, ${raw[idx+2]}, ${raw[idx+3]})`);
    // Sample a few points
    const topIdx = (Math.floor(meta.height * 0.25) * meta.width + cx) * 4;
    console.log(`Top 25% pixel (${cx}, ${Math.floor(meta.height * 0.25)}): rgba(${raw[topIdx]}, ${raw[topIdx+1]}, ${raw[topIdx+2]}, ${raw[topIdx+3]})`);
    const botIdx = (Math.floor(meta.height * 0.75) * meta.width + cx) * 4;
    console.log(`Bottom 75% pixel (${cx}, ${Math.floor(meta.height * 0.75)}): rgba(${raw[botIdx]}, ${raw[botIdx+1]}, ${raw[botIdx+2]}, ${raw[botIdx+3]})`);
  }
}
inspectAwb4yeSubject2();

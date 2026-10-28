const sharp = require('sharp');

async function compareSubject2() {
  const orig = sharp('template_images/removed_backgrounds/awb4ye_Subject-2.png');
  const origResized = await orig.resize(1200, 4200).raw().toBuffer({ resolveWithObject: true });
  
  const current = sharp('public/templates/custom-rb-awb4ye_subject-2-overlay.png');
  const currentRaw = await current.raw().toBuffer({ resolveWithObject: true });

  let diffCount = 0;
  let transparentInCurrentButNotOrig = 0;
  
  for (let i = 0; i < 1200 * 4200; i++) {
    const oA = origResized.data[i * 4 + 3];
    const cA = currentRaw.data[i * 4 + 3];
    if (cA < 30 && oA >= 30) {
      // Check if green in orig
      const r = origResized.data[i * 4];
      const g = origResized.data[i * 4 + 1];
      const b = origResized.data[i * 4 + 2];
      const isGreen = g > 85 && g > r * 1.15 && g > b * 1.15;
      if (!isGreen) {
        transparentInCurrentButNotOrig++;
        if (transparentInCurrentButNotOrig <= 5) {
          const x = i % 1200;
          const y = Math.floor(i / 1200);
          console.log(`Lost pixel at (${x}, ${y}): orig rgba(${r}, ${g}, ${b}, ${oA}) -> current alpha=${cA}`);
        }
      }
    }
  }
  console.log(`Total non-green pixels wiped in current overlay: ${transparentInCurrentButNotOrig}`);
}
compareSubject2();

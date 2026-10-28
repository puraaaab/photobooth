const sharp = require('sharp');

async function inspectAwb4ye() {
  for (const p of [
    'template_images/removed_backgrounds/awb4ye_Subject-1.png',
    'template_images/templates/awb4ye.png',
    'public/templates/custom-rb-awb4ye_subject-1-overlay.png'
  ]) {
    const meta = await sharp(p).metadata();
    console.log(p, meta.width, 'x', meta.height, 'channels:', meta.channels);
  }
}
inspectAwb4ye();

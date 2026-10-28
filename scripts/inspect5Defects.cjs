const sharp = require('sharp');
const fs = require('fs');

async function inspect(name, file) {
  if (!fs.existsSync(file)) {
    console.log(name, 'NOT FOUND:', file);
    return;
  }
  const meta = await sharp(file).metadata();
  console.log(name, file, `${meta.width}x${meta.height}`, 'channels:', meta.channels, 'hasAlpha:', meta.hasAlpha);
}

async function run() {
  await inspect('1. Golden Glow #2', 'public/templates/template-img-4ae8332f-5d11-4eb1-b574-overlay.png');
  await inspect('   source', 'template_images/4ae8332f-5d11-4eb1-b574-60753b77af86.png');

  await inspect('2. Pearl Minimal 4-Shot (blue stars)', 'public/templates/template-img-386d528e-49be-44f4-8772-overlay.png');
  await inspect('   source', 'template_images/386d528e-49be-44f4-8772-cd45cf9725c3.jpg');

  await inspect('3. Two-in-one Pearl Minimal #2', 'public/templates/template-img-72498825-8037-45dd-93a5-overlay.png');
  await inspect('   source', 'template_images/72498825-8037-45dd-93a5-46f1de1348e1.jpg');

  await inspect('4. Golden Glow #3 (knit sweater)', 'public/templates/template-img-chatgpt-image-sep-30-202-overlay.png');

  await inspect('5. Pearl Minimal #7 (red bows)', 'public/templates/template-img-e0fd4bf0-a89d-461e-835a-overlay.png');
  await inspect('   source', 'template_images/e0fd4bf0-a89d-461e-835a-cadf8642dedc.jpg');
}

run();

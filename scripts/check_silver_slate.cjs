const sharp = require('sharp');

async function checkSilverSlate() {
  const ids = [
    'template-img-bad8ac94-4871-452b-bd09',
    'template-img-c55fd71a-0238-4820-9520',
    'template-img-d549ed68-af43-4cd1-a6a8',
    'template-img-d612a3e8-73b3-4db7-8c43'
  ];

  for (const id of ids) {
    const file = `public/templates/${id}-overlay.png`;
    const img = sharp(file);
    const meta = await img.metadata();
    const raw = await img.raw().toBuffer();
    const w = meta.width;
    // Check pixel at (100, 100) and (200, 200)
    const idx1 = (100 * w + 100) * 4;
    const idx2 = (200 * w + 200) * 4;
    console.log(`${id}: (100,100)=rgba(${raw[idx1]},${raw[idx1+1]},${raw[idx1+2]},${raw[idx1+3]}) (200,200)=rgba(${raw[idx2]},${raw[idx2+1]},${raw[idx2+2]},${raw[idx2+3]})`);
  }
}
checkSilverSlate();

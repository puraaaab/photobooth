const sharp = require('sharp');

async function checkAwb4yeFull() {
  const img = sharp('template_images/templates/awb4ye.png');
  const { data, info } = await img.raw().toBuffer({ resolveWithObject: true });
  const w = info.width;
  const h = info.height;

  // Let's check non-green, or find where the pink borders or dividing lines are
  // Let's inspect rows from y = 190 to 1100 in awb4ye_Subject-1.png, but scaled to awb4ye_Subject-1
  // In Screenshot 4, look at the image:
  // There is a top frame, a middle frame, and a bottom frame!
  // Between top and middle: on the right, there is a wedge of pink!
  // Between middle and bottom: on the left, there is a wedge of pink!
  // Let's check where the pink wedges are!
}
checkAwb4yeFull();

const sharp = require('sharp');
const fs = require('fs');

async function processCinemaTickets() {
  // 1. Cinema Ticket 3-Shot (Cinema_ticket.png)
  {
    console.log('--- Processing Cinema_ticket.png ---');
    const img = sharp('template_images/Cinema_ticket.png');
    const { data, info } = await img.raw().toBuffer({ resolveWithObject: true });
    const w = info.width, h = info.height;

    // Ticket boundaries:
    // x in [65, 316], y in [44, 971]
    // The ticket itself is cream (r > 200, g > 200, b > 180) with dark text/borders and green slots
    // Everything outside x in [65, 316] or y in [44, 971] is backing/shadow/background!
    // Also, at the notch curves on the sides or top/bottom, let's detect the ticket contour.
    
    // Create an RGBA buffer
    const outData = Buffer.alloc(w * h * 4);
    const slotsMask = new Uint8Array(w * h);

    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const srcIdx = (y * w + x) * 3;
        const dstIdx = (y * w + x) * 4;
        const r = data[srcIdx], g = data[srcIdx+1], b = data[srcIdx+2];

        // Is it inside the ticket outer bounds?
        // Note: the ticket has ticket cutouts/notches at y around 210-250 and 740-780
        // Outside the ticket is dark shadow: r < 120 && g < 120 && b < 120, OR outer cream: x < 55 || x > 325 || y < 35 || y > 980
        const isDarkShadow = (r < 100 && g < 100 && b < 100);
        const isOuterBg = (x < 60 || x > 320 || y < 40 || y > 975);
        const isGreen = (g > 150 && g > r * 1.3 && g > b * 1.3);

        if (isOuterBg || isDarkShadow) {
          // Transparent
          outData[dstIdx] = 0;
          outData[dstIdx+1] = 0;
          outData[dstIdx+2] = 0;
          outData[dstIdx+3] = 0;
        } else if (isGreen) {
          // Photo aperture - transparent
          outData[dstIdx] = 0;
          outData[dstIdx+1] = 0;
          outData[dstIdx+2] = 0;
          outData[dstIdx+3] = 0;
          slotsMask[y * w + x] = 1;
        } else {
          // Keep ticket graphic
          outData[dstIdx] = r;
          outData[dstIdx+1] = g;
          outData[dstIdx+2] = b;
          outData[dstIdx+3] = 255;
        }
      }
    }

    // Now let's crop to the ticket bounds so there's no dead space!
    // Find non-transparent bounds
    let minX = w, maxX = 0, minY = h, maxY = 0;
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const a = outData[(y * w + x) * 4 + 3];
        const isSlot = slotsMask[y * w + x];
        if (a > 0 || isSlot) {
          if (x < minX) minX = x;
          if (x > maxX) maxX = x;
          if (y < minY) minY = y;
          if (y > maxY) maxY = y;
        }
      }
    }
    console.log(`Cinema 3-shot ticket crop bounds: [${minX}, ${minY}] to [${maxX}, ${maxY}] (size: ${maxX-minX+1}x${maxY-minY+1})`);

    // Extract slots within this coordinate space
    // There are 3 slots in Cinema_ticket.png
    // Let's find green spans in y
    const ySlots = [];
    let inSlot = false, sY = 0;
    for (let y = minY; y <= maxY; y++) {
      let greenInRow = 0;
      for (let x = minX; x <= maxX; x++) {
        if (slotsMask[y * w + x]) greenInRow++;
      }
      if (greenInRow > 50) {
        if (!inSlot) { inSlot = true; sY = y; }
      } else {
        if (inSlot) {
          inSlot = false;
          ySlots.push({ startY: sY, endY: y - 1 });
        }
      }
    }
    console.log('Detected 3-shot slots in source:', ySlots);

    // Save overlay scaled to target width 1200
    const cropW = maxX - minX + 1;
    const cropH = maxY - minY + 1;
    const scale = 1200 / cropW;
    const targetH = Math.round(cropH * scale);

    const croppedImg = await sharp(outData, { raw: { width: w, height: h, channels: 4 } })
      .extract({ left: minX, top: minY, width: cropW, height: cropH })
      .resize(1200, targetH)
      .png()
      .toFile('public/templates/template-img-cinema_ticket-overlay.png');

    await sharp('public/templates/template-img-cinema_ticket-overlay.png')
      .resize(300)
      .webp({ quality: 85 })
      .toFile('public/templates/thumbs/template-img-cinema_ticket-overlay-thumb.webp');

    console.log(`Saved template-img-cinema_ticket-overlay.png (1200x${targetH})`);

    // Calculate slots in 1200x targetH space
    const scaledSlots = ySlots.map((ys, idx) => {
      // Find minX and maxX for this slot
      let slotMinX = w, slotMaxX = 0;
      for (let y = ys.startY; y <= ys.endY; y++) {
        for (let x = minX; x <= maxX; x++) {
          if (slotsMask[y * w + x]) {
            if (x < slotMinX) slotMinX = x;
            if (x > slotMaxX) slotMaxX = x;
          }
        }
      }
      return {
        id: `slot-${idx}`,
        x: Math.round((slotMinX - minX) * scale),
        y: Math.round((ys.startY - minY) * scale),
        width: Math.round((slotMaxX - slotMinX + 1) * scale),
        height: Math.round((ys.endY - ys.startY + 1) * scale),
        rotation: 0,
        shape: 'rectangle',
        cornerRadius: 0
      };
    });
    console.log('Scaled slots for 3-shot:', JSON.stringify(scaledSlots));
  }

  // 2. Cinema Ticket Solo 1-Shot (Cinema_ticket_1photo.png)
  {
    console.log('\n--- Processing Cinema_ticket_1photo.png ---');
    const img = sharp('template_images/Cinema_ticket_1photo.png');
    const { data, info } = await img.raw().toBuffer({ resolveWithObject: true });
    const w = info.width, h = info.height;

    const outData = Buffer.alloc(w * h * 4);
    const slotsMask = new Uint8Array(w * h);

    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const srcIdx = (y * w + x) * 3;
        const dstIdx = (y * w + x) * 4;
        const r = data[srcIdx], g = data[srcIdx+1], b = data[srcIdx+2];

        // Ticket bounds: x in [42, 368], y in [53, 1016]
        // Left of 42 has scanner artifacts and grey lines
        // Right of 368 has shadow backing
        // Top < 53 has outer paper
        // Bottom > 1016 has outer paper
        const isOuterBg = (x < 42 || x > 368 || y < 53 || y > 1016);
        const isGreen = (g > 140 && g > r * 1.3 && g > b * 1.3);

        if (isOuterBg) {
          outData[dstIdx] = 0;
          outData[dstIdx+1] = 0;
          outData[dstIdx+2] = 0;
          outData[dstIdx+3] = 0;
        } else if (isGreen) {
          outData[dstIdx] = 0;
          outData[dstIdx+1] = 0;
          outData[dstIdx+2] = 0;
          outData[dstIdx+3] = 0;
          slotsMask[y * w + x] = 1;
        } else {
          outData[dstIdx] = r;
          outData[dstIdx+1] = g;
          outData[dstIdx+2] = b;
          outData[dstIdx+3] = 255;
        }
      }
    }

    // Crop to ticket bounds
    let minX = w, maxX = 0, minY = h, maxY = 0;
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const a = outData[(y * w + x) * 4 + 3];
        const isSlot = slotsMask[y * w + x];
        if (a > 0 || isSlot) {
          if (x < minX) minX = x;
          if (x > maxX) maxX = x;
          if (y < minY) minY = y;
          if (y > maxY) maxY = y;
        }
      }
    }
    console.log(`Cinema 1-shot ticket crop bounds: [${minX}, ${minY}] to [${maxX}, ${maxY}] (size: ${maxX-minX+1}x${maxY-minY+1})`);

    const cropW = maxX - minX + 1;
    const cropH = maxY - minY + 1;
    const scale = 1200 / cropW;
    const targetH = Math.round(cropH * scale);

    await sharp(outData, { raw: { width: w, height: h, channels: 4 } })
      .extract({ left: minX, top: minY, width: cropW, height: cropH })
      .resize(1200, targetH)
      .png()
      .toFile('public/templates/template-img-cinema_ticket_1photo-overlay.png');

    await sharp('public/templates/template-img-cinema_ticket_1photo-overlay.png')
      .resize(300)
      .webp({ quality: 85 })
      .toFile('public/templates/thumbs/template-img-cinema_ticket_1photo-overlay-thumb.webp');

    console.log(`Saved template-img-cinema_ticket_1photo-overlay.png (1200x${targetH})`);

    // Find 1-shot slot
    let slotMinX = w, slotMaxX = 0, slotMinY = h, slotMaxY = 0;
    for (let y = minY; y <= maxY; y++) {
      for (let x = minX; x <= maxX; x++) {
        if (slotsMask[y * w + x]) {
          if (x < slotMinX) slotMinX = x;
          if (x > slotMaxX) slotMaxX = x;
          if (y < slotMinY) slotMinY = y;
          if (y > slotMaxY) slotMaxY = y;
        }
      }
    }

    const soloSlot = [{
      id: 'slot-0',
      x: Math.round((slotMinX - minX) * scale),
      y: Math.round((slotMinY - minY) * scale),
      width: Math.round((slotMaxX - slotMinX + 1) * scale),
      height: Math.round((slotMaxY - slotMinY + 1) * scale),
      rotation: 0,
      shape: 'rectangle',
      cornerRadius: 0
    }];
    console.log('Scaled slot for 1-shot:', JSON.stringify(soloSlot));
  }
}
processCinemaTickets();

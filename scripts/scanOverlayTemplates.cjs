const fs = require('fs');

function scanFile(filePath) {
  const content = fs.readFileSync(filePath, 'utf8');
  console.log('=== ' + filePath + ' ===');
  // find id, canvas, overlayImageUrl
  const tplRegex = /id:\s*['"]([^'"]+)['"][\s\S]*?canvas:\s*\{[^}]*?width:\s*(\d+)[^}]*?height:\s*(\d+)[^}]*\}[\s\S]*?overlayImageUrl:\s*['"]([^'"]+)['"]/g;
  let m;
  let count = 0;
  while ((m = tplRegex.exec(content)) !== null) {
    count++;
    console.log(`  ${count}. id: ${m[1]} | canvas: ${m[2]}x${m[3]} | overlay: ${m[4]}`);
  }
}

scanFile('src/templates/glamBatchTemplates.ts');
scanFile('src/templates/emoTicketTemplates.ts');
scanFile('src/templates/festiveKioskTemplates.ts');

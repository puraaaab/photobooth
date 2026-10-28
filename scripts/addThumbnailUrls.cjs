const fs = require('fs');
const path = require('path');

const ROOT_DIR = path.resolve(__dirname, '..');
const filePath = path.join(ROOT_DIR, 'src', 'templates', 'batchGeneratedTemplates.ts');
let content = fs.readFileSync(filePath, 'utf-8');

// Add thumbnailUrl if not present
content = content.replace(/("overlayImageUrl":\s*"\/templates\/([^"]+)")/g, (match, full, filename) => {
  const thumbName = filename.replace(/\.png$/i, '-thumb.webp');
  return `${full},\n    "thumbnailUrl": "/templates/thumbs/${thumbName}"`;
});

fs.writeFileSync(filePath, content, 'utf-8');
console.log('Successfully added thumbnailUrl to all templates in batchGeneratedTemplates.ts');

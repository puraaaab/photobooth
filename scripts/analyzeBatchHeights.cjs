const fs = require('fs');

const content = fs.readFileSync('src/templates/batchGeneratedTemplates.ts', 'utf8');
const heightCounts = {};
const regex = /"canvas":\s*\{\s*"width":\s*(\d+),\s*"height":\s*(\d+)\s*\}/g;
let m;
let total = 0;
while ((m = regex.exec(content)) !== null) {
  total++;
  const h = m[2];
  heightCounts[h] = (heightCounts[h] || 0) + 1;
}
console.log('Total templates in batchGeneratedTemplates:', total);
console.log('Height distribution:', heightCounts);

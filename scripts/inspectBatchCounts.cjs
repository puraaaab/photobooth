const fs = require('fs');

const content = fs.readFileSync('src/templates/batchGeneratedTemplates.ts', 'utf8');
const assignIdx = content.indexOf('= [');
const startIdx = content.indexOf('[', assignIdx);
const endIdx = content.lastIndexOf(']');
const jsonStr = content.slice(startIdx, endIdx + 1);

const templates = JSON.parse(jsonStr);

console.log('Total parsed templates:', templates.length);

const photoCountStats = {};
const orientationStats = {};
templates.forEach(t => {
  const count = (t.supportedPhotoCounts || [])[0] || 'unknown';
  photoCountStats[count] = (photoCountStats[count] || 0) + 1;

  const orient = (t.supportedOrientations || [])[0] || 'unknown';
  orientationStats[orient] = (orientationStats[orient] || 0) + 1;
});

console.log('Photo count distribution:', photoCountStats);
console.log('Orientation distribution:', orientationStats);

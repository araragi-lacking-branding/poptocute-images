// Node 16+ compatible
const fs = require('fs');
const path = require('path');

const publicDir = path.join(__dirname, '..', 'public');
const imagesDir = path.join(publicDir, 'images');
const outFile = path.join(publicDir, 'images.json');

if (!fs.existsSync(imagesDir)) {
  console.error('No images directory:', imagesDir);
  process.exit(1);
}

const files = fs.readdirSync(imagesDir)
  .filter(f => /\.(jpe?g|png|webp|gif|avif)$/i.test(f))
  .map(f => `images/${f}`);

// write manifest
fs.writeFileSync(outFile, JSON.stringify(files, null, 2));
console.log('Wrote', outFile, 'with', files.length, 'images');

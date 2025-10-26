// Check what's actually in R2 vs what should be there
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const IMAGES_DIR = path.join(__dirname, '..', 'public', 'images');

console.log('Calculating expected hashes for local files...\n');

const expectedFiles = [];
const files = fs.readdirSync(IMAGES_DIR).filter(f => 
  /\.(jpg|jpeg|png|gif|webp|avif)$/i.test(f)
);

files.forEach(filename => {
  const filePath = path.join(IMAGES_DIR, filename);
  const fileBuffer = fs.readFileSync(filePath);
  const hashSum = crypto.createHash('sha256');
  hashSum.update(fileBuffer);
  const hash = hashSum.digest('hex').substring(0, 16);
  const ext = path.extname(filename).toLowerCase();
  
  expectedFiles.push({
    original: filename,
    hash: hash,
    r2key: `images/${hash}${ext}`
  });
});

console.log(`Expected ${expectedFiles.length} files in R2`);
console.log('\nSample expected files:');
expectedFiles.slice(0, 5).forEach(f => {
  console.log(`  ${f.original} -> ${f.r2key}`);
});

fs.writeFileSync('expected-r2-files.json', JSON.stringify(expectedFiles, null, 2));
console.log('\n✓ Wrote expected-r2-files.json');

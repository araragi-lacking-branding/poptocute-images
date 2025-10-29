// VERIFY ONLY - no uploads
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { execSync } = require('child_process');

const IMAGES_DIR = path.join(__dirname, '..', 'public', 'images');

console.log('📋 Verification Report\n');
console.log('='.repeat(50));

// Calculate what SHOULD be in R2
const localFiles = fs.readdirSync(IMAGES_DIR).filter(f => 
  /\.(jpg|jpeg|png|gif|webp|avif)$/i.test(f)
);

const expected = {};
localFiles.forEach(filename => {
  const filePath = path.join(IMAGES_DIR, filename);
  const fileBuffer = fs.readFileSync(filePath);
  const hashSum = crypto.createHash('sha256');
  hashSum.update(fileBuffer);
  const hash = hashSum.digest('hex').substring(0, 16);
  const ext = path.extname(filename).toLowerCase();
  expected[`images/${hash}${ext}`] = filename;
});

console.log(`\nLocal files: ${localFiles.length}`);
console.log(`Expected R2 keys: ${Object.keys(expected).length}\n`);

// Test 10 random files
const testKeys = Object.keys(expected).slice(0, 10);
let found = 0;
let missing = 0;

console.log('Testing 10 sample files in R2:');
testKeys.forEach(key => {
  try {
    execSync(`npx wrangler r2 object get cutetopop-images/${key} --remote --file=temp.tmp`, { stdio: 'pipe' });
    fs.unlinkSync('temp.tmp');
    console.log(`  ✓ ${key}`);
    found++;
  } catch {
    console.log(`  ✗ ${key} (${expected[key]})`);
    missing++;
  }
});

console.log(`\nSample results: ${found} found, ${missing} missing`);
console.log('\n⚠️  NO UPLOADS PERFORMED - verification only');

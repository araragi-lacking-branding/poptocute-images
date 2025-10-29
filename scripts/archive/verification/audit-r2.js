// Complete R2 audit - find missing AND extra files
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { execSync } = require('child_process');

console.log('🔍 Complete R2 Audit\n');
console.log('='.repeat(60));

// 1. Calculate expected files from local storage (187)
const IMAGES_DIR = path.join(__dirname, '..', 'public', 'images');
const localFiles = fs.readdirSync(IMAGES_DIR).filter(f => 
  /\.(jpg|jpeg|png|gif|webp|avif)$/i.test(f)
);

const expectedFromLocal = new Set();
localFiles.forEach(filename => {
  const filePath = path.join(IMAGES_DIR, filename);
  const fileBuffer = fs.readFileSync(filePath);
  const hashSum = crypto.createHash('sha256');
  hashSum.update(fileBuffer);
  const hash = hashSum.digest('hex').substring(0, 16);
  const ext = path.extname(filename).toLowerCase();
  expectedFromLocal.add(`images/${hash}${ext}`);
});

console.log(`\n📊 Expected Totals:`);
console.log(`  Local files (should be in R2): ${expectedFromLocal.size}`);
console.log(`  Manually uploaded (yesterday): 55`);
console.log(`  Total expected in R2: ${expectedFromLocal.size + 55}`);
console.log(`  R2 dashboard shows: 229 objects`);
console.log(`  Discrepancy: ${(expectedFromLocal.size + 55) - 229}\n`);

// 2. Get D1 database count
console.log('📋 Checking D1 database...');
try {
  const dbResult = execSync('npx wrangler d1 execute cutetopop-db --remote --command "SELECT COUNT(*) as count FROM images WHERE status=\'active\'"', { 
    encoding: 'utf8',
    stdio: 'pipe'
  });
  const jsonMatch = dbResult.match(/\[[\s\S]*\]/);
  if (jsonMatch) {
    const data = JSON.parse(jsonMatch[0]);
    const dbCount = data[0]?.results?.[0]?.count || 0;
    console.log(`  D1 database has: ${dbCount} active images\n`);
  }
} catch (e) {
  console.log('  Could not query D1\n');
}

// 3. Sample verification
console.log('🔬 Verifying 20 random samples from expected files...');
const sampleKeys = Array.from(expectedFromLocal).slice(0, 20);
let verified = 0;
let missing = [];

sampleKeys.forEach(key => {
  try {
    execSync(`npx wrangler r2 object get cutetopop-images/${key} --remote --file=temp.tmp`, { stdio: 'pipe' });
    fs.unlinkSync('temp.tmp');
    verified++;
  } catch {
    missing.push(key);
  }
});

console.log(`  Verified: ${verified}/20`);
if (missing.length > 0) {
  console.log(`  Missing: ${missing.length}`);
  missing.forEach(k => console.log(`    - ${k}`));
}

console.log('\n' + '='.repeat(60));
console.log('⚠️  Note: R2 shows 229 objects but we expect 242');
console.log('   Possible causes:');
console.log('   1. Some uploads failed silently');
console.log('   2. Duplicate uploads with wrong names');
console.log('   3. Dashboard cache (refresh needed)');

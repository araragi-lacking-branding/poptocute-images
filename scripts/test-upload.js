// Test upload with full error output
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { execSync } = require('child_process');

const IMAGES_DIR = path.join(__dirname, '..', 'public', 'images');
const BUCKET_NAME = 'cutetopop-images';

// Test with just ONE file to see the actual error
const files = fs.readdirSync(IMAGES_DIR).filter(f => 
  /\.(jpg|jpeg|png)$/i.test(f)
);

const testFile = files[0];
const filePath = path.join(IMAGES_DIR, testFile);

const fileBuffer = fs.readFileSync(filePath);
const hashSum = crypto.createHash('sha256');
hashSum.update(fileBuffer);
const hash = hashSum.digest('hex').substring(0, 16);
const ext = path.extname(testFile).toLowerCase();
const r2Key = `images/${hash}${ext}`;

console.log(`Testing upload of: ${testFile}`);
console.log(`R2 key will be: ${r2Key}\n`);

try {
  // Show full output including errors
  execSync(`npx wrangler r2 object put ${BUCKET_NAME}/${r2Key} --file="${filePath}" --remote`, {
    stdio: 'inherit'
  });
  console.log('\n✓ Success!');
} catch (error) {
  console.error('\n✗ Upload failed!');
  console.error('Error:', error.message);
}

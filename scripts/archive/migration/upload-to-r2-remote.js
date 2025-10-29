// scripts/upload-to-r2-remote.js
// Upload images to REMOTE R2 with hash-based names
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { execSync } = require('child_process');

const IMAGES_DIR = path.join(__dirname, '..', 'public', 'images');
const BUCKET_NAME = 'cutetopop-images';

console.log('🚀 Upload to REMOTE R2 with Hash Names');
console.log('======================================\n');

const files = fs.readdirSync(IMAGES_DIR).filter(f => 
  /\.(jpg|jpeg|png|gif|webp|avif)$/i.test(f)
);

console.log(`Found ${files.length} images\n`);

let uploaded = 0;
files.forEach((filename, i) => {
  const filePath = path.join(IMAGES_DIR, filename);
  
  // Calculate hash
  const fileBuffer = fs.readFileSync(filePath);
  const hashSum = crypto.createHash('sha256');
  hashSum.update(fileBuffer);
  const hash = hashSum.digest('hex').substring(0, 16);
  
  const ext = path.extname(filename).toLowerCase();
  const r2Key = `images/${hash}${ext}`;
  
  try {
    // Upload with --remote flag
    execSync(`npx wrangler r2 object put ${BUCKET_NAME}/${r2Key} --file="${filePath}" --remote`, {
      stdio: 'pipe'
    });
    
    uploaded++;
    console.log(`[${i+1}/${files.length}] ✓ ${filename} -> ${hash}${ext}`);
  } catch (error) {
    console.error(`[${i+1}/${files.length}] ✗ ${filename}: ${error.message}`);
  }
});

console.log(`\n✅ Uploaded ${uploaded}/${files.length} to REMOTE R2`);

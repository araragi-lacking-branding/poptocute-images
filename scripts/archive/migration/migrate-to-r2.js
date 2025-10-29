// scripts/migrate-to-r2.js
// Migrates images from public/images/ to R2 bucket

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const IMAGES_DIR = path.join(__dirname, '..', 'public', 'images');
const BUCKET_NAME = 'cutetopop-images';
const BATCH_SIZE = 10; // Upload 10 at a time to avoid rate limits

console.log('🚀 R2 Migration Script');
console.log('======================\n');

// Check if images directory exists
if (!fs.existsSync(IMAGES_DIR)) {
  console.error('❌ Error: Images directory not found:', IMAGES_DIR);
  process.exit(1);
}

// Get all image files
console.log('📁 Scanning images directory...');
const files = fs.readdirSync(IMAGES_DIR).filter(f => 
  /\.(jpg|jpeg|png|gif|webp|avif)$/i.test(f)
);

console.log(`✓ Found ${files.length} images to migrate\n`);

if (files.length === 0) {
  console.log('❌ No images found to migrate.');
  process.exit(0);
}

// Ask for confirmation
console.log('⚠️  This will upload all images to R2 bucket:', BUCKET_NAME);
console.log('   Cost estimate: FREE (under 10 GB)\n');

// Process in batches
const batches = [];
for (let i = 0; i < files.length; i += BATCH_SIZE) {
  batches.push(files.slice(i, i + BATCH_SIZE));
}

console.log(`📦 Processing ${batches.length} batch(es) of up to ${BATCH_SIZE} images\n`);
console.log('🚀 Starting migration...\n');

let totalUploaded = 0;
let errors = [];

batches.forEach((batch, batchIndex) => {
  console.log(`📦 Batch ${batchIndex + 1}/${batches.length} (${batch.length} images)...`);
  
  batch.forEach((filename, fileIndex) => {
    const filePath = path.join(IMAGES_DIR, filename);
    const r2Key = `images/${filename}`; // Keep same path structure in R2
    
    try {
      // Upload to R2 using wrangler
      const command = `npx wrangler r2 object put ${BUCKET_NAME}/${r2Key} --file="${filePath}"`;
      
      execSync(command, { 
        stdio: 'pipe', // Suppress output for cleaner logs
        encoding: 'utf8'
      });
      
      console.log(`  ✓ ${filename}`);
      totalUploaded++;
      
    } catch (error) {
      console.error(`  ❌ Failed: ${filename}`);
      errors.push({ filename, error: error.message });
    }
  });
  
  console.log('');
});

// Summary
console.log('========================');
console.log('✅ Migration Complete!\n');
console.log(`📊 Summary:`);
console.log(`   Total images: ${files.length}`);
console.log(`   Successfully uploaded: ${totalUploaded}`);
console.log(`   Errors: ${errors.length}`);

if (errors.length > 0) {
  console.log('\n⚠️  Errors encountered:');
  errors.forEach(e => {
    console.log(`   ${e.filename}: ${e.error}`);
  });
}

console.log('\n🎉 Images are now in R2!');
console.log('   Bucket:', BUCKET_NAME);
console.log('   Path structure: images/IMG_*.PNG');
console.log('\n📝 Next steps:');
console.log('   1. Update Worker to serve from R2');
console.log('   2. Update D1 database paths (optional - already correct)');
console.log('   3. Test image serving');
console.log('   4. Remove images from GitHub (after confirming R2 works)');

// scripts/migrate-images.js
// Migrates images from public/images/ into D1 database
// Run with: node scripts/migrate-images.js

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

// Configuration
const IMAGES_DIR = path.join(__dirname, '..', 'public', 'images');
const DB_NAME = 'cutetopop-db';
const BATCH_SIZE = 50; // Insert images in batches

// Supported image formats (web-friendly)
const SUPPORTED_FORMATS = /\.(jpe?g|png|webp|gif|avif)$/i;
const HEIC_FORMAT = /\.heic$/i;

console.log('🎨 Image Migration Script');
console.log('========================\n');

// Check if images directory exists
if (!fs.existsSync(IMAGES_DIR)) {
  console.error('❌ Error: Images directory not found:', IMAGES_DIR);
  process.exit(1);
}

// Scan images directory
console.log('📁 Scanning images directory...');
const allFiles = fs.readdirSync(IMAGES_DIR);
const imageFiles = [];
const heicFiles = [];

allFiles.forEach(file => {
  if (SUPPORTED_FORMATS.test(file)) {
    imageFiles.push(file);
  } else if (HEIC_FORMAT.test(file)) {
    heicFiles.push(file);
  }
});

console.log(`✓ Found ${allFiles.length} total files`);
console.log(`✓ ${imageFiles.length} web-compatible images`);
console.log(`✓ ${heicFiles.length} HEIC files (will be skipped)\n`);

// Log HEIC files for manual handling
if (heicFiles.length > 0) {
  const heicLogPath = path.join(__dirname, '..', 'heic-files.txt');
  fs.writeFileSync(
    heicLogPath,
    `HEIC Files Requiring Conversion (${heicFiles.length} files)\n` +
    `Generated: ${new Date().toISOString()}\n\n` +
    heicFiles.map(f => `images/${f}`).join('\n')
  );
  console.log(`⚠️  HEIC files logged to: heic-files.txt\n`);
}

if (imageFiles.length === 0) {
  console.log('❌ No web-compatible images found to migrate.');
  process.exit(0);
}

// Generate SQL INSERT statements
console.log('📝 Generating SQL INSERT statements...');

function generateInsertSQL(files) {
  const values = files.map(filename => {
    const fullPath = path.join(IMAGES_DIR, filename);
    const stats = fs.statSync(fullPath);
    const fileSize = stats.size;
    
    // Detect mime type from extension
    const ext = path.extname(filename).toLowerCase();
    const mimeTypes = {
      '.jpg': 'image/jpeg',
      '.jpeg': 'image/jpeg',
      '.png': 'image/png',
      '.gif': 'image/gif',
      '.webp': 'image/webp',
      '.avif': 'image/avif'
    };
    const mimeType = mimeTypes[ext] || 'image/jpeg';
    
    // Escape single quotes in filename for SQL
    const escapedFilename = filename.replace(/'/g, "''");
    
    return `('images/${escapedFilename}', NULL, '${escapedFilename}', ${fileSize}, NULL, NULL, '${mimeType}', NULL, 'active', 1, datetime('now'), datetime('now'), NULL)`;
  });
  
  return `
-- Auto-generated migration SQL
-- Images: ${files.length}
-- Generated: ${new Date().toISOString()}

INSERT INTO images (
  filename, 
  alt_text, 
  original_filename, 
  file_size, 
  width, 
  height, 
  mime_type, 
  file_hash, 
  status, 
  credit_id, 
  created_at, 
  updated_at, 
  notes
) VALUES
${values.join(',\n')};
`;
}

// Process in batches
const batches = [];
for (let i = 0; i < imageFiles.length; i += BATCH_SIZE) {
  batches.push(imageFiles.slice(i, i + BATCH_SIZE));
}

console.log(`✓ Processing ${batches.length} batch(es) of up to ${BATCH_SIZE} images\n`);

// Execute migration
console.log('🚀 Starting migration...\n');

let totalInserted = 0;
let errors = [];

batches.forEach((batch, batchIndex) => {
  console.log(`📦 Batch ${batchIndex + 1}/${batches.length} (${batch.length} images)...`);
  
  // Generate SQL for this batch
  const sql = generateInsertSQL(batch);
  
  // Write to temporary file
  const tempSqlFile = path.join(__dirname, `temp-batch-${batchIndex}.sql`);
  fs.writeFileSync(tempSqlFile, sql);
  
  try {
    // Execute via wrangler
    const command = `npx wrangler d1 execute ${DB_NAME} --remote --file="${tempSqlFile}"`;
    const output = execSync(command, { 
      encoding: 'utf8',
      stdio: 'pipe'
    });
    
    console.log(`  ✓ Inserted ${batch.length} images`);
    totalInserted += batch.length;
    
    // Clean up temp file
    fs.unlinkSync(tempSqlFile);
    
  } catch (error) {
    console.error(`  ❌ Error in batch ${batchIndex + 1}:`, error.message);
    errors.push({ batch: batchIndex + 1, error: error.message });
    
    // Keep temp file for debugging
    console.log(`  ⚠️  SQL file kept for debugging: ${tempSqlFile}`);
  }
  
  console.log('');
});

// Summary
console.log('========================');
console.log('✅ Migration Complete!\n');
console.log(`📊 Summary:`);
console.log(`   Total images processed: ${imageFiles.length}`);
console.log(`   Successfully inserted: ${totalInserted}`);
console.log(`   HEIC files skipped: ${heicFiles.length}`);
console.log(`   Errors: ${errors.length}`);

if (errors.length > 0) {
  console.log('\n⚠️  Errors encountered:');
  errors.forEach(e => {
    console.log(`   Batch ${e.batch}: ${e.error}`);
  });
}

if (heicFiles.length > 0) {
  console.log(`\n📝 Next steps for HEIC files:`);
  console.log(`   1. Review heic-files.txt`);
  console.log(`   2. Convert HEIC to JPG/PNG`);
  console.log(`   3. Re-run this script to add converted files`);
}

console.log('\n🎉 Database is now populated with image metadata!');
console.log('   Run this to verify: npx wrangler d1 execute ' + DB_NAME + ' --remote --command "SELECT COUNT(*) FROM images"');
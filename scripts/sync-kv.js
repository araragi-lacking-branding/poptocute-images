// scripts/sync-kv.js
// Syncs images list from D1 database to KV for fast access
// Run after adding new images: node scripts/sync-kv.js

const { execSync } = require('child_process');

const DB_NAME = 'cutetopop-db';
const KV_NAMESPACE_ID = 'b3a4366fb67e42ccbdeaa92d0f2cb376';
const KV_KEY = 'images-list';

console.log('🔄 Syncing images from D1 to KV...\n');

try {
  // Step 1: Query D1 for all active images
  console.log('📊 Querying D1 database...');
  const command = `npx wrangler d1 execute ${DB_NAME} --remote --command "SELECT filename FROM images WHERE status = 'active'"`;
  const output = execSync(command, { 
    encoding: 'utf8',
    stdio: ['pipe', 'pipe', 'pipe']
  });
  
  // Parse JSON from output
  const jsonStart = output.indexOf('[');
  const jsonEnd = output.lastIndexOf(']') + 1;
  
  if (jsonStart === -1 || jsonEnd === 0) {
    throw new Error('Could not find JSON in output');
  }
  
  const jsonStr = output.substring(jsonStart, jsonEnd);
  const data = JSON.parse(jsonStr);
  
  // Extract filenames
  const filenames = data[0].results.map(row => row.filename);
  
  console.log(`✓ Found ${filenames.length} active images\n`);
  
  // Step 2: Write to KV
  console.log('💾 Writing to KV namespace...');
  
  // Create temporary file with the data
  const fs = require('fs');
  const tempFile = 'temp-kv-data.json';
  fs.writeFileSync(tempFile, JSON.stringify(filenames));
  
  // Upload to KV
  const kvCommand = `npx wrangler kv key put --namespace-id=${KV_NAMESPACE_ID} "${KV_KEY}" --path="${tempFile}"`;
  execSync(kvCommand, { stdio: 'inherit' });
  
  // Clean up temp file
  fs.unlinkSync(tempFile);
  
  console.log('\n✅ Successfully synced to KV!');
  console.log(`📊 ${filenames.length} images now available globally`);
  console.log('⚡ Site will now load in < 50ms!\n');
  
} catch (error) {
  console.error('\n❌ Error:', error.message);
  process.exit(1);
}

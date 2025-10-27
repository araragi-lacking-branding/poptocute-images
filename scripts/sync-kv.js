// scripts/sync-kv.js
// Syncs images list from D1 database to KV for fast access
// FIXED: Now writes to REMOTE KV
const { execSync } = require('child_process');

const DB_NAME = 'cutetopop-db';
const KV_NAMESPACE_ID = 'b3a4366fb67e42ccbdeaa92d0f2cb376';
const KV_KEY = 'images-list';

console.log('🔄 Syncing images from D1 to REMOTE KV...\n');

try {
  console.log('📊 Querying D1 database...');
  const command = `npx wrangler d1 execute ${DB_NAME} --remote --command "SELECT filename FROM images WHERE status = 'active'"`;
  const output = execSync(command, { 
    encoding: 'utf8',
    stdio: ['pipe', 'pipe', 'pipe']
  });
  
  const jsonStart = output.indexOf('[');
  const jsonEnd = output.lastIndexOf(']') + 1;
  
  if (jsonStart === -1 || jsonEnd === 0) {
    throw new Error('Could not find JSON in output');
  }
  
  const jsonStr = output.substring(jsonStart, jsonEnd);
  const data = JSON.parse(jsonStr);
  const filenames = data[0].results.map(row => row.filename);
  
  console.log(`✓ Found ${filenames.length} active images\n`);
  
  console.log('💾 Writing to REMOTE KV namespace...');
  
  const fs = require('fs');
  const tempFile = 'temp-kv-data.json';
  fs.writeFileSync(tempFile, JSON.stringify(filenames));
  
  // ADD --remote FLAG HERE
  const kvCommand = `npx wrangler kv key put --namespace-id=${KV_NAMESPACE_ID} "${KV_KEY}" --path="${tempFile}" --remote`;
  execSync(kvCommand, { stdio: 'inherit' });
  
  fs.unlinkSync(tempFile);
  
  console.log('\n✅ Successfully synced to REMOTE KV!');
  console.log(`📊 ${filenames.length} images now available globally`);
  console.log('⚡ Site will now load in < 50ms!\n');
  
} catch (error) {
  console.error('\n❌ Error:', error.message);
  process.exit(1);
}

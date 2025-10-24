// scripts/generate-static-manifest.js
// Generates public/images.json from D1 database

const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const DB_NAME = 'cutetopop-db';
const OUTPUT_FILE = path.join(__dirname, '..', 'public', 'images.json');

console.log('📝 Generating static images.json from D1 database...\n');

try {
  console.log('🔍 Querying database...');
  
  const command = `npx wrangler d1 execute ${DB_NAME} --remote --command "SELECT filename FROM images WHERE status = 'active'"`;
  const output = execSync(command, { 
    encoding: 'utf8',
    stdio: ['pipe', 'pipe', 'pipe']
  });
  
  // Find the JSON array in the output
  const jsonStart = output.indexOf('[');
  const jsonEnd = output.lastIndexOf(']') + 1;
  
  if (jsonStart === -1 || jsonEnd === 0) {
    throw new Error('Could not find JSON in output');
  }
  
  const jsonStr = output.substring(jsonStart, jsonEnd);
  const data = JSON.parse(jsonStr);
  
  // Extract filenames from JSON structure
  const filenames = data[0].results.map(row => row.filename);
  
  console.log(`✓ Found ${filenames.length} active images\n`);
  
  // Write to public/images.json
  fs.writeFileSync(OUTPUT_FILE, JSON.stringify(filenames, null, 2));
  
  console.log(`✅ Generated ${OUTPUT_FILE}`);
  console.log(`📊 Contains ${filenames.length} images`);
  console.log('\n💡 Commit this file to Git for instant loading!');
  
} catch (error) {
  console.error('\n❌ Error:', error.message);
  process.exit(1);
}

// Query D1 to get what SHOULD be in R2, then verify R2 has them
const { execSync } = require('child_process');
const fs = require('fs');

console.log('📋 Querying D1 database for expected files...\n');

const dbResult = execSync('npx wrangler d1 execute cutetopop-db --remote --command "SELECT filename FROM images WHERE status=\'active\'"', { 
  encoding: 'utf8',
  stdio: 'pipe'
});

const jsonMatch = dbResult.match(/\[[\s\S]*\]/);
if (!jsonMatch) {
  console.error('Could not parse D1 response');
  process.exit(1);
}

const data = JSON.parse(jsonMatch[0]);
const dbFiles = data[0].results.map(r => r.filename);

console.log(`D1 expects ${dbFiles.length} files in R2\n`);
console.log('Checking which ones are actually in R2...\n');

const missing = [];
const found = [];

dbFiles.forEach((filename, i) => {
  try {
    execSync(`npx wrangler r2 object get cutetopop-images/${filename} --remote --file=temp.tmp`, { stdio: 'pipe' });
    fs.unlinkSync('temp.tmp');
    found.push(filename);
    process.stdout.write(`\r${i+1}/${dbFiles.length}: ${found.length} found, ${missing.length} missing`);
  } catch {
    missing.push(filename);
    process.stdout.write(`\r${i+1}/${dbFiles.length}: ${found.length} found, ${missing.length} missing`);
  }
});

console.log(`\n\n✅ Found in R2: ${found.length}`);
console.log(`❌ Missing from R2: ${missing.length}\n`);

if (missing.length > 0) {
  console.log('Missing files:');
  missing.forEach(f => console.log(`  ${f}`));
  fs.writeFileSync('missing-from-r2.json', JSON.stringify(missing, null, 2));
  console.log('\n✓ Saved to missing-from-r2.json');
}

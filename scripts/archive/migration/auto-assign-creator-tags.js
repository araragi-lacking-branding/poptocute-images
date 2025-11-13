/**
 * Auto-Assign Creator Tags Based on Credits
 * 
 * This helper script assigns creator tags to images based on their existing
 * credit information. It's useful for bulk-tagging images that already have
 * credits but no creator tags.
 * 
 * Usage:
 *   node scripts/migration/auto-assign-creator-tags.js        (local)
 *   node scripts/migration/auto-assign-creator-tags.js --remote  (production)
 */

const fs = require('fs');
const path = require('path');
const DATABASE_NAME = process.argv[2] || 'DB';
const IS_REMOTE = process.argv.includes('--remote');

console.log(`\n🏷️  Auto-assigning creator tags based on credits...`);
console.log(`Database: ${DATABASE_NAME}`);
console.log(`Environment: ${IS_REMOTE ? 'REMOTE (production)' : 'LOCAL'}\n`);

const { execSync } = require('child_process');

function executeSQL(sql, description) {
  console.log(`\n📊 ${description}...`);
  
  const tempFile = path.join(__dirname, '.temp-query.sql');
  fs.writeFileSync(tempFile, sql, 'utf-8');
  
  const command = IS_REMOTE
    ? `wrangler d1 execute ${DATABASE_NAME} --remote --file="${tempFile}"`
    : `wrangler d1 execute ${DATABASE_NAME} --local --file="${tempFile}"`;
  
  try {
    const result = execSync(command, { encoding: 'utf-8' });
    console.log(result);
    
    fs.unlinkSync(tempFile);
    return result;
  } catch (error) {
    if (fs.existsSync(tempFile)) {
      fs.unlinkSync(tempFile);
    }
    
    console.error(`❌ Error: ${error.message}`);
    if (error.stdout) console.log(error.stdout);
    if (error.stderr) console.error(error.stderr);
    throw error;
  }
}

async function main() {
  try {
    // Step 1: Find images with credits linked to artists but no creator tags
    console.log('\n📋 Step 1: Finding images that need creator tags...');
    const findImagesSQL = `
      SELECT 
        i.id as image_id,
        i.filename,
        c.name as credit_name,
        a.id as artist_id,
        a.name as artist_name,
        a.display_name as artist_display
      FROM images i
      JOIN credits c ON i.credit_id = c.id
      JOIN artists a ON c.artist_id = a.id
      WHERE i.status = 'active'
        AND a.status = 'active'
        AND NOT EXISTS (
          SELECT 1 
          FROM image_tags it
          JOIN tags t ON it.tag_id = t.id
          JOIN tag_categories tc ON t.category_id = tc.id
          WHERE it.image_id = i.id AND tc.name = 'creator'
        )
      ORDER BY i.id;
    `;
    
    executeSQL(findImagesSQL, 'Finding images needing creator tags');
    
    // Step 2: Auto-assign creator tags based on credit artist links
    console.log('\n📋 Step 2: Auto-assigning creator tags...');
    const assignTagsSQL = `
      INSERT OR IGNORE INTO image_tags (image_id, tag_id, added_by, confidence)
      SELECT 
        i.id as image_id,
        at.tag_id,
        'auto-assign-script',
        1.0
      FROM images i
      JOIN credits c ON i.credit_id = c.id
      JOIN artists a ON c.artist_id = a.id
      JOIN artist_tags at ON a.id = at.artist_id
      WHERE i.status = 'active'
        AND a.status = 'active'
        AND NOT EXISTS (
          SELECT 1 
          FROM image_tags it2
          WHERE it2.image_id = i.id AND it2.tag_id = at.tag_id
        );
    `;
    
    executeSQL(assignTagsSQL, 'Assigning creator tags');
    
    // Step 3: Verify the results
    console.log('\n📋 Step 3: Verifying tag assignments...');
    const verifySQL = `
      SELECT 
        i.id,
        i.filename,
        c.name as credit_name,
        a.display_name as artist_name,
        GROUP_CONCAT(t.display_name, ', ') as creator_tags
      FROM images i
      LEFT JOIN credits c ON i.credit_id = c.id
      LEFT JOIN artists a ON c.artist_id = a.id
      LEFT JOIN image_tags it ON i.id = it.image_id
      LEFT JOIN tags t ON it.tag_id = t.id 
        AND t.category_id = (SELECT id FROM tag_categories WHERE name = 'creator')
      WHERE i.status = 'active'
      GROUP BY i.id
      ORDER BY i.id
      LIMIT 20;
    `;
    
    executeSQL(verifySQL, 'Verification - showing first 20 images');
    
    // Step 4: Summary statistics
    console.log('\n📋 Step 4: Summary statistics...');
    const statsSQL = `
      SELECT 
        COUNT(DISTINCT i.id) as total_active_images,
        COUNT(DISTINCT CASE 
          WHEN EXISTS (
            SELECT 1 FROM image_tags it 
            JOIN tags t ON it.tag_id = t.id 
            JOIN tag_categories tc ON t.category_id = tc.id
            WHERE it.image_id = i.id AND tc.name = 'creator'
          ) THEN i.id 
        END) as images_with_creator_tags
      FROM images i
      WHERE i.status = 'active';
    `;
    
    executeSQL(statsSQL, 'Summary statistics');
    
    console.log('\n✅ Creator tag auto-assignment complete!\n');
    console.log('Next steps:');
    console.log('1. Verify tags appear correctly on images');
    console.log('2. Check front page for proper credit display');
    console.log('3. Manually tag any remaining images without credits\n');
    
  } catch (error) {
    console.error('\n❌ Script failed:', error.message);
    process.exit(1);
  }
}

main();

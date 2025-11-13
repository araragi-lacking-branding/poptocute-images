/**
 * Sync Credits from Creator Tags
 * 
 * This script automatically:
 * 1. Finds images with creator tags
 * 2. Links those images to the appropriate credit record via the artist profile
 * 3. Creates credit records if they don't exist
 * 
 * This solves the issue where creator information exists in tags but isn't
 * reflected in the credits displayed on the front page.
 */

const fs = require('fs');
const path = require('path');
const DATABASE_NAME = process.argv[2] || 'DB';
const IS_REMOTE = process.argv.includes('--remote');

console.log(`\n🔄 Syncing credits from creator tags...`);
console.log(`Database: ${DATABASE_NAME}`);
console.log(`Environment: ${IS_REMOTE ? 'REMOTE (production)' : 'LOCAL'}\n`);

// Using wrangler d1 execute for database access
const { execSync } = require('child_process');

function executeSQL(sql, description) {
  console.log(`\n📊 ${description}...`);
  
  // Write SQL to temp file
  const tempFile = path.join(__dirname, '.temp-query.sql');
  fs.writeFileSync(tempFile, sql, 'utf-8');
  
  const command = IS_REMOTE
    ? `wrangler d1 execute ${DATABASE_NAME} --remote --file="${tempFile}"`
    : `wrangler d1 execute ${DATABASE_NAME} --local --file="${tempFile}"`;
  
  try {
    const result = execSync(command, { encoding: 'utf-8' });
    console.log(result);
    
    // Clean up temp file
    fs.unlinkSync(tempFile);
    
    return result;
  } catch (error) {
    // Clean up temp file even on error
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
    // Step 1: Get images with creator tags that don't have credits linked to artists
    console.log('\n📋 Step 1: Finding images with creator tags...');
    const findImagesSQL = `
      SELECT DISTINCT
        i.id as image_id,
        i.filename,
        i.credit_id,
        t.id as creator_tag_id,
        t.name as creator_tag_name,
        t.display_name as creator_display,
        a.id as artist_id,
        a.name as artist_name,
        a.display_name as artist_display_name
      FROM images i
      JOIN image_tags it ON i.id = it.image_id
      JOIN tags t ON it.tag_id = t.id
      JOIN tag_categories tc ON t.category_id = tc.id
      LEFT JOIN artist_tags at ON t.id = at.tag_id
      LEFT JOIN artists a ON at.artist_id = a.id
      WHERE tc.name = 'creator'
        AND i.status = 'active'
        AND (a.id IS NULL OR a.status = 'active')
      ORDER BY i.id;
    `;
    
    executeSQL(findImagesSQL, 'Finding images with creator tags');
    
    // Step 2: Ensure credits exist for all artists with creator tags
    console.log('\n📋 Step 2: Creating missing credit records for artists...');
    const createCreditsSQL = `
      INSERT OR IGNORE INTO credits (name, artist_id, verified, notes)
      SELECT 
        COALESCE(a.display_name, a.name) as name,
        a.id as artist_id,
        a.verified,
        'Auto-created from artist profile for creator tag linking'
      FROM artists a
      WHERE a.status = 'active'
        AND NOT EXISTS (
          SELECT 1 FROM credits c WHERE c.artist_id = a.id
        );
    `;
    
    executeSQL(createCreditsSQL, 'Creating credit records');
    
    // Step 3: Update images to use the correct credit_id based on their creator tags
    console.log('\n📋 Step 3: Linking images to artist credits via creator tags...');
    const updateImageCreditsSQL = `
      UPDATE images
      SET credit_id = (
        SELECT c.id
        FROM image_tags it
        JOIN tags t ON it.tag_id = t.id
        JOIN tag_categories tc ON t.category_id = tc.id
        JOIN artist_tags at ON t.id = at.tag_id
        JOIN credits c ON at.artist_id = c.artist_id
        WHERE it.image_id = images.id
          AND tc.name = 'creator'
          AND c.artist_id IS NOT NULL
        LIMIT 1
      )
      WHERE EXISTS (
        SELECT 1
        FROM image_tags it
        JOIN tags t ON it.tag_id = t.id
        JOIN tag_categories tc ON t.category_id = tc.id
        WHERE it.image_id = images.id
          AND tc.name = 'creator'
      )
      AND images.status = 'active';
    `;
    
    executeSQL(updateImageCreditsSQL, 'Updating image credit links');
    
    // Step 4: Verify the results
    console.log('\n📋 Step 4: Verifying results...');
    const verifySQL = `
      SELECT 
        i.id,
        i.filename,
        c.name as credit_name,
        a.name as artist_name,
        a.display_name as artist_display,
        GROUP_CONCAT(t.display_name, ', ') as creator_tags
      FROM images i
      LEFT JOIN credits c ON i.credit_id = c.id
      LEFT JOIN artists a ON c.artist_id = a.id
      LEFT JOIN image_tags it ON i.id = it.image_id
      LEFT JOIN tags t ON it.tag_id = t.id AND t.category_id = (SELECT id FROM tag_categories WHERE name = 'creator')
      WHERE i.status = 'active'
      GROUP BY i.id
      ORDER BY i.id
      LIMIT 20;
    `;
    
    executeSQL(verifySQL, 'Verification - showing first 20 images');
    
    // Step 5: Summary statistics
    console.log('\n📋 Step 5: Summary statistics...');
    const statsSQL = `
      SELECT 
        COUNT(*) as total_active_images,
        SUM(CASE WHEN credit_id IS NOT NULL THEN 1 ELSE 0 END) as images_with_credits,
        SUM(CASE WHEN c.artist_id IS NOT NULL THEN 1 ELSE 0 END) as credits_linked_to_artists
      FROM images i
      LEFT JOIN credits c ON i.credit_id = c.id
      WHERE i.status = 'active';
    `;
    
    executeSQL(statsSQL, 'Summary statistics');
    
    console.log('\n✅ Credit sync complete!\n');
    console.log('Next steps:');
    console.log('1. Verify credits display on the front page');
    console.log('2. Assign creator tags to images via the admin UI');
    console.log('3. Re-run this script when new creator tags are added\n');
    
  } catch (error) {
    console.error('\n❌ Script failed:', error.message);
    process.exit(1);
  }
}

main();

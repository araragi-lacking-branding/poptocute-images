// Migration script to create and link Unknown Artist tag
export default {
  async fetch(request, env, ctx) {
    if (request.method !== 'POST') {
      return new Response('Method not allowed', { status: 405 });
    }

    const steps = [];
    try {
      // Step 1: Get creator category ID (verification)
      const creatorCategory = await env.DB.prepare(
        `SELECT id FROM tag_categories WHERE name = 'creator' LIMIT 1`
      ).first();

      if (!creatorCategory) {
        throw new Error('Creator category not found');
      }
      steps.push('✅ Verified creator category exists');

      // Step 2: Create Unknown Artist tag if it doesn't exist
      let unknownArtistTag = await env.DB.prepare(
        `SELECT id FROM tags WHERE name = 'Unknown Artist' AND category_id = ? LIMIT 1`
      ).bind(creatorCategory.id).first();

      if (!unknownArtistTag) {
        const result = await env.DB.prepare(`
          INSERT INTO tags (name, category_id, display_name, description)
          VALUES (?, ?, ?, ?)
          RETURNING id
        `).bind(
          'Unknown Artist',
          creatorCategory.id,
          'Unknown Artist',
          'Default tag for unattributed works'
        ).first();
        
        unknownArtistTag = { id: result.id };
        steps.push('✅ Created Unknown Artist tag');
      } else {
        steps.push('ℹ️ Unknown Artist tag already exists');
      }

      // Step 3: Get images that need the tag
      const untaggedImages = await env.DB.prepare(`
        SELECT i.id 
        FROM images i
        JOIN credits c ON i.credit_id = c.id
        WHERE c.name = 'Unknown Artist'
        AND NOT EXISTS (
          SELECT 1 FROM image_tags it
          JOIN tags t ON it.tag_id = t.id
          WHERE it.image_id = i.id
          AND t.category_id = ?
        )
      `).bind(creatorCategory.id).all();

      steps.push(`ℹ️ Found ${untaggedImages.results.length} images needing Unknown Artist tag`);

      // Step 4: Link images to the Unknown Artist tag
      if (untaggedImages.results.length > 0) {
        const stmt = await env.DB.prepare(
          `INSERT INTO image_tags (image_id, tag_id) VALUES (?, ?)`
        );
        
        const batch = untaggedImages.results.map(img => 
          stmt.bind(img.id, unknownArtistTag.id)
        );
        
        await env.DB.batch(batch);
        steps.push(`✅ Linked ${untaggedImages.results.length} images to Unknown Artist tag`);
      }

      // Step 5: Verify the links
      const verifyCount = await env.DB.prepare(`
        SELECT COUNT(*) as count
        FROM image_tags it
        JOIN tags t ON it.tag_id = t.id
        WHERE t.name = 'Unknown Artist'
        AND t.category_id = ?
      `).bind(creatorCategory.id).first();

      steps.push(`✅ Verification: ${verifyCount.count} images now have Unknown Artist tag`);

      // Step 6: Create sync trigger if it doesn't exist
      await env.DB.prepare(`
        CREATE TRIGGER IF NOT EXISTS sync_credit_to_creator_tag
        AFTER UPDATE OF credit_id ON images
        BEGIN
          -- Remove old creator tags
          DELETE FROM image_tags 
          WHERE image_id = NEW.id
          AND tag_id IN (
            SELECT id FROM tags 
            WHERE category_id = (
              SELECT id FROM tag_categories 
              WHERE name = 'creator' LIMIT 1
            )
          );
          
          -- Add new creator tag based on credit
          INSERT INTO image_tags (image_id, tag_id)
          SELECT NEW.id, t.id
          FROM credits c
          JOIN tags t ON t.name = c.name
          WHERE c.id = NEW.credit_id
          AND t.category_id = (
            SELECT id FROM tag_categories 
            WHERE name = 'creator' LIMIT 1
          );
        END;
      `).run();
      
      steps.push('✅ Created/verified credit sync trigger');

      return new Response(steps.join('\\n'), {
        headers: { 'Content-Type': 'text/plain' }
      });

    } catch (error) {
      steps.push(`❌ Error: ${error.message}`);
      console.error('Migration error:', error);
      
      return new Response(steps.join('\\n'), { 
        status: 500,
        headers: { 'Content-Type': 'text/plain' }
      });
    }
  }
}
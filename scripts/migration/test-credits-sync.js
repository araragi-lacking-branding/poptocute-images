// Local test for credits-to-tags sync
export default {
  async fetch(request, env, ctx) {
    if (request.method !== 'POST') {
      return new Response('Method not allowed', { status: 405 });
    }

    try {
      // Test 1: Check creator category exists
      const creatorCategory = await env.DB.prepare(
        `SELECT id FROM tag_categories WHERE name = 'creator' LIMIT 1`
      ).first();
      
      const results = [];
      
      if (!creatorCategory) {
        results.push('❌ Creator category not found');
      } else {
        results.push('✅ Found creator category');
      }

      // Test 2: Check Unknown Artist credit exists
      const unknownCredit = await env.DB.prepare(
        `SELECT id FROM credits WHERE name = 'Unknown Artist' LIMIT 1`
      ).first();
      
      if (!unknownCredit) {
        results.push('❌ Unknown Artist credit not found');
      } else {
        results.push('✅ Found Unknown Artist credit');
      }

      // Test 3: Count images with Unknown Artist credit
      const unknownArtistImages = await env.DB.prepare(
        `SELECT COUNT(*) as count
         FROM images i
         JOIN credits c ON i.credit_id = c.id
         WHERE c.name = 'Unknown Artist'`
      ).first();
      
      results.push(`ℹ️ Found ${unknownArtistImages.count} images with Unknown Artist credit`);

      // Test 4: Check for existing Unknown Artist tag
      const unknownArtistTag = await env.DB.prepare(
        `SELECT id FROM tags WHERE name = 'Unknown Artist' AND category_id = ? LIMIT 1`
      ).bind(creatorCategory.id).first();
      
      if (!unknownArtistTag) {
        results.push('ℹ️ Unknown Artist tag does not exist yet');
      } else {
        results.push('✅ Found existing Unknown Artist tag');
      }

      return new Response(results.join('\\n'), {
        headers: { 'Content-Type': 'text/plain' }
      });
      
    } catch (error) {
      console.error('Test error:', error);
      return new Response(`Error during test: ${error.message}`, { 
        status: 500,
        headers: { 'Content-Type': 'text/plain' }
      });
    }
  }
}
// src/admin/sync.js
// Handles D1 → KV synchronization

export async function handleSync(env) {
  try {
    console.log('Starting D1 → KV sync...');

    // Query D1 for all active images
    const results = await env.DB.prepare(`
      SELECT filename 
      FROM images 
      WHERE status = 'active'
      ORDER BY created_at DESC
    `).all();

    if (!results.success) {
      throw new Error('Database query failed');
    }

    const filenames = results.results.map(r => r.filename);
    const count = filenames.length;

    console.log(`Found ${count} active images in D1`);

    // Update KV cache with both list and count
    await env.IMAGES_CACHE.put('images-list', JSON.stringify(filenames), {
      expirationTtl: 86400 // 24 hours
    });
    
    // Cache count for fast random selection
    await env.IMAGES_CACHE.put('active-count', count.toString(), {
      expirationTtl: 3600 // 1 hour
    });

    console.log('KV cache updated successfully');

    return new Response(JSON.stringify({
      success: true,
      count: count,
      timestamp: new Date().toISOString()
    }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' }
    });

  } catch (error) {
    console.error('Sync error:', error);
    
    return new Response(JSON.stringify({
      success: false,
      error: error.message || 'Sync failed'
    }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    });
  }
}

// src/admin/sync.js
// Handles D1 → KV synchronization

/**
 * Core sync function that updates KV cache with D1 data
 * Can be called from multiple places (upload, scheduled, manual)
 */
export async function syncKVCache(env) {
  console.log('Starting D1 → KV sync...');

  // Query D1 for all eligible active images (excluding hidden artists/tags)
  const results = await env.DB.prepare(`
    SELECT i.filename
    FROM images i
    LEFT JOIN credits c ON i.credit_id = c.id
    LEFT JOIN artists a ON c.artist_id = a.id
    WHERE i.status = 'active'
      AND (a.id IS NULL OR a.status = 'active')
      AND i.id NOT IN (
        SELECT DISTINCT it.image_id
        FROM image_tags it
        JOIN tags t ON it.tag_id = t.id
        WHERE t.status IN ('hidden', 'deleted')
      )
    ORDER BY i.created_at DESC
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
  
  // Store last sync timestamp
  await env.IMAGES_CACHE.put('last-sync', new Date().toISOString(), {
    expirationTtl: 86400 // 24 hours
  });

  console.log('KV cache updated successfully');
  
  return { count, timestamp: new Date().toISOString() };
}

/**
 * HTTP handler for manual sync requests
 */
export async function handleSync(env) {
  try {
    const result = await syncKVCache(env);

    return new Response(JSON.stringify({
      success: true,
      count: result.count,
      timestamp: result.timestamp
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

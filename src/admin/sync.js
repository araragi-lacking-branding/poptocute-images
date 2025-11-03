// src/admin/sync.js
// Handles D1 → KV synchronization

/**
 * Core sync function that updates KV cache with D1 data
 * Can be called from multiple places (upload, scheduled, manual)
 */
export async function syncKVCache(env) {
  console.log('Starting D1 → KV sync...');

  // Step 1: Sync credits for artists with creator tags but no credit records
  console.log('Syncing credits for artists with creator tags...');
  await env.DB.prepare(`
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
      )
  `).run();

  // Step 2: Link images to artist credits based on their creator tags
  console.log('Linking images to artist credits via creator tags...');
  await env.DB.prepare(`
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
    AND images.status = 'active'
  `).run();

  // Step 3: Query D1 for all eligible active images (excluding hidden artists/tags)
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
 * Also triggers metadata backfill for all images
 */
export async function handleSync(env) {
  try {
    // Import metadata functions
    const { validateMetadata, backfillMetadata } = await import('./metadata-sync.js');
    
    // 1. Sync KV cache
    const syncResult = await syncKVCache(env);
    console.log(`✅ KV sync: ${syncResult.count} images`);

    // 2. Validate and backfill metadata
    const validation = await validateMetadata(env);
    console.log(`📊 Metadata validation: ${validation.needsBackfill} images need backfill`);
    
    let backfillResult = null;
    if (validation.needsBackfill > 0) {
      backfillResult = await backfillMetadata(env, { 
        dryRun: false, 
        limit: undefined, 
        forceAll: false 
      });
      console.log(`✅ Metadata backfill: ${backfillResult.updated} images updated`);
    }

    return new Response(JSON.stringify({
      success: true,
      count: syncResult.count,
      timestamp: syncResult.timestamp,
      metadata: {
        validated: validation.total,
        backfilled: backfillResult?.updated || 0,
        failed: backfillResult?.failed || 0
      }
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

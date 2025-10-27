// src/admin/routes.js
// Admin API routes and authentication

import { generateAdminUI } from './ui.js';
import { handleUpload } from './upload.js';

// Handle admin routes
export async function handleAdminRequest(request, env, url) {
  const path = url.pathname;

  // Serve admin UI
  if (path === '/admin' || path === '/admin/') {
    return new Response(generateAdminUI(), {
      headers: {
        'Content-Type': 'text/html;charset=UTF-8',
        'Cache-Control': 'no-store, no-cache, must-revalidate'
      }
    });
  }

  // Admin API routes
  if (path.startsWith('/api/admin/')) {
    return handleAdminAPI(request, env, url);
  }

  return new Response('Not Found', { status: 404 });
}

// Handle admin API endpoints
async function handleAdminAPI(request, env, url) {
  const path = url.pathname.replace('/api/admin', '');
  const method = request.method;

  const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Content-Type': 'application/json'
  };

  if (method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    // GET /api/admin/tags - Get all tags organized by category
    if (path === '/tags' && method === 'GET') {
      return await getAllTags(env, corsHeaders);
    }

    // POST /api/admin/tags - Create new tag
    if (path === '/tags' && method === 'POST') {
      return await createTag(request, env, corsHeaders);
    }

    // GET /api/admin/images/:id - Get image with full metadata
    if (path.match(/^\/images\/\d+$/) && method === 'GET') {
      const imageId = path.split('/').pop();
      return await getImageDetails(env, imageId, corsHeaders);
    }

    // PUT /api/admin/images/:id - Update image metadata
    if (path.match(/^\/images\/\d+$/) && method === 'PUT') {
      const imageId = path.split('/').pop();
      return await updateImageMetadata(request, env, imageId, corsHeaders);
    }

    // POST /api/admin/upload - Upload new image
    if (path === '/upload' && method === 'POST') {
      return await handleUpload(request, env);
    }

    // POST /api/admin/sync-kv - Sync D1 to KV cache
    if (path === '/sync-kv' && method === 'POST') {
      return await syncKVCache(env, corsHeaders);
    }

    return new Response(JSON.stringify({ error: 'Not found' }), {
      status: 404,
      headers: corsHeaders
    });

  } catch (error) {
    console.error('Admin API Error:', error);
    return new Response(JSON.stringify({ error: 'Internal server error' }), {
      status: 500,
      headers: corsHeaders
    });
  }
}

// Get all tags organized by category
async function getAllTags(env, corsHeaders) {
  const results = await env.DB.prepare(`
    SELECT
      t.id,
      t.name,
      t.display_name,
      tc.name as category,
      COUNT(it.image_id) as usage_count
    FROM tags t
    JOIN tag_categories tc ON t.category_id = tc.id
    LEFT JOIN image_tags it ON t.id = it.tag_id
    GROUP BY t.id
    ORDER BY tc.sort_order, t.name
  `).all();

  // Organize by category
  const organized = {
    content: [],
    character: [],
    creator: [],
    source: []
  };

  results.results.forEach(tag => {
    if (organized[tag.category]) {
      organized[tag.category].push(tag);
    }
  });

  return new Response(JSON.stringify(organized), { headers: corsHeaders });
}

// Create new tag
async function createTag(request, env, corsHeaders) {
  const { name, category, display_name } = await request.json();

  if (!name || !category) {
    return new Response(JSON.stringify({ error: 'Name and category required' }), {
      status: 400,
      headers: corsHeaders
    });
  }

  // Get category ID
  const categoryResult = await env.DB.prepare(
    `SELECT id FROM tag_categories WHERE name = ?`
  ).bind(category).first();

  if (!categoryResult) {
    return new Response(JSON.stringify({ error: 'Invalid category' }), {
      status: 400,
      headers: corsHeaders
    });
  }

  // Create tag
  const result = await env.DB.prepare(`
    INSERT INTO tags (name, display_name, category_id)
    VALUES (?, ?, ?)
  `).bind(
    name.toLowerCase().replace(/\s+/g, '-'),
    display_name || name,
    categoryResult.id
  ).run();

  return new Response(JSON.stringify({
    success: true,
    id: result.meta.last_row_id
  }), {
    headers: corsHeaders
  });
}

// Get detailed image information
async function getImageDetails(env, imageId, corsHeaders) {
  // Get image data
  const image = await env.DB.prepare(`
    SELECT
      i.*,
      c.name as credit_name,
      c.url as credit_url,
      c.social_handle as credit_social,
      c.platform as credit_platform,
      c.license as credit_license
    FROM images i
    LEFT JOIN credits c ON i.credit_id = c.id
    WHERE i.id = ?
  `).bind(imageId).first();

  if (!image) {
    return new Response(JSON.stringify({ error: 'Image not found' }), {
      status: 404,
      headers: corsHeaders
    });
  }

  // Get tags for this image
  const tags = await env.DB.prepare(`
    SELECT
      t.id,
      t.name,
      t.display_name,
      tc.name as category
    FROM image_tags it
    JOIN tags t ON it.tag_id = t.id
    JOIN tag_categories tc ON t.category_id = tc.id
    WHERE it.image_id = ?
    ORDER BY tc.sort_order, t.name
  `).bind(imageId).all();

  return new Response(JSON.stringify({
    ...image,
    tags: tags.results
  }), {
    headers: corsHeaders
  });
}

// Update image metadata (tags and credit)
async function updateImageMetadata(request, env, imageId, corsHeaders) {
  const { tags, credit } = await request.json();

  try {
    // Start by handling credit
    let creditId = null;
    if (credit && credit.name) {
      // Check if credit already exists
      const existingCredit = await env.DB.prepare(`
        SELECT id FROM credits
        WHERE name = ? AND url = ?
      `).bind(credit.name, credit.url || null).first();

      if (existingCredit) {
        creditId = existingCredit.id;
      } else {
        // Create new credit
        const result = await env.DB.prepare(`
          INSERT INTO credits (name, url, social_handle, platform, license, verified)
          VALUES (?, ?, ?, ?, ?, 0)
        `).bind(
          credit.name,
          credit.url || null,
          credit.social_handle || null,
          credit.platform || null,
          credit.license || 'Unknown'
        ).run();
        creditId = result.meta.last_row_id;
      }

      // Update image with credit
      await env.DB.prepare(`
        UPDATE images
        SET credit_id = ?, updated_at = datetime('now')
        WHERE id = ?
      `).bind(creditId, imageId).run();
    }

    // Handle tags
    if (Array.isArray(tags)) {
      // Remove all existing tags
      await env.DB.prepare(`
        DELETE FROM image_tags WHERE image_id = ?
      `).bind(imageId).run();

      // Add new tags
      if (tags.length > 0) {
        const values = tags.map(tagId => `(${imageId}, ${tagId})`).join(',');
        await env.DB.prepare(`
          INSERT INTO image_tags (image_id, tag_id)
          VALUES ${values}
        `).run();
      }
    }

    return new Response(JSON.stringify({ success: true }), {
      headers: corsHeaders
    });

  } catch (error) {
    console.error('Error updating metadata:', error);
    return new Response(JSON.stringify({
      error: 'Failed to update metadata',
      details: error.message
    }), {
      status: 500,
      headers: corsHeaders
    });
  }
}

// Sync images list from D1 to KV cache
async function syncKVCache(env, corsHeaders) {
  try {
    // Query D1 for all active images
    const results = await env.DB.prepare(`
      SELECT filename FROM images WHERE status = 'active'
    `).all();
    
    const filenames = results.results.map(r => r.filename);
    
    // Write to KV
    await env.IMAGES_CACHE.put('images-list', JSON.stringify(filenames), {
      expirationTtl: 86400 // 24 hours
    });
    
    return new Response(JSON.stringify({
      success: true,
      count: filenames.length,
      message: `Successfully synced ${filenames.length} images to KV cache`
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
  } catch (error) {
    console.error('KV sync error:', error);
    return new Response(JSON.stringify({
      success: false,
      error: error.message
    }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
  }
}

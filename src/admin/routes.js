// src/admin/routes.js
// Admin API routes and authentication

import { generateAdminUI } from './ui.js';
import { handleSync } from './sync.js';
import { handleUpload } from './upload.js';
import {
  getAllArtists,
  getArtistById,
  createArtist,
  updateArtist,
  deleteArtist,
  linkArtistTag,
  unlinkArtistTag,
  getArtistImages
} from './artists.js';

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

  // CORS configuration with allowed origins
  const origin = request.headers.get('Origin');
  const allowedOrigins = [
    'https://cutetopop.com',
    'https://www.cutetopop.com',
    'http://localhost:8787',      // Wrangler dev
    'http://127.0.0.1:8787',
    'http://localhost:3000',       // Alternative dev server
    'http://127.0.0.1:3000'
  ];

  // Check if origin matches allowed list or is a subdomain of cutetopop.com
  const isAllowed = origin && (
    allowedOrigins.includes(origin) ||
    origin.match(/^https:\/\/([a-z0-9-]+\.)?cutetopop\.com$/)
  );

  const corsHeaders = {
    'Access-Control-Allow-Origin': isAllowed ? origin : 'https://cutetopop.com',
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
    // POST /api/admin/sync - Sync D1 to KV
    if (path === '/sync' && method === 'POST') {
      return handleSync(env);
    }

    // POST /api/admin/sync-kv - Sync D1 to KV cache
    if (path === '/sync-kv' && method === 'POST') {
      return await syncKVCache(env, corsHeaders);
    }

    // ============================================
    // ARTIST ROUTES
    // ============================================

    // GET /api/admin/artists - Get all artists
    if (path === '/artists' && method === 'GET') {
      return await handleGetArtists(env, url, corsHeaders);
    }

    // POST /api/admin/artists - Create new artist
    if (path === '/artists' && method === 'POST') {
      return await handleCreateArtist(request, env, corsHeaders);
    }

    // GET /api/admin/artists/:id - Get artist by ID
    if (path.match(/^\/artists\/\d+$/) && method === 'GET') {
      const artistId = parseInt(path.split('/').pop());
      return await handleGetArtist(env, artistId, corsHeaders);
    }

    // PUT /api/admin/artists/:id - Update artist
    if (path.match(/^\/artists\/\d+$/) && method === 'PUT') {
      const artistId = parseInt(path.split('/').pop());
      return await handleUpdateArtist(request, env, artistId, corsHeaders);
    }

    // DELETE /api/admin/artists/:id - Delete artist
    if (path.match(/^\/artists\/\d+$/) && method === 'DELETE') {
      const artistId = parseInt(path.split('/').pop());
      return await handleDeleteArtist(env, artistId, corsHeaders);
    }

    // GET /api/admin/artists/:id/images - Get artist's images
    if (path.match(/^\/artists\/\d+\/images$/) && method === 'GET') {
      const artistId = parseInt(path.split('/')[2]);
      return await handleGetArtistImages(env, artistId, url, corsHeaders);
    }

    // POST /api/admin/artists/:id/tags - Link tag to artist
    if (path.match(/^\/artists\/\d+\/tags$/) && method === 'POST') {
      const artistId = parseInt(path.split('/')[2]);
      return await handleLinkArtistTag(request, env, artistId, corsHeaders);
    }

    // DELETE /api/admin/artists/:artistId/tags/:tagId - Unlink tag from artist
    if (path.match(/^\/artists\/\d+\/tags\/\d+$/) && method === 'DELETE') {
      const parts = path.split('/');
      const artistId = parseInt(parts[2]);
      const tagId = parseInt(parts[4]);
      return await handleUnlinkArtistTag(env, artistId, tagId, corsHeaders);
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
  try {
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

    const tagSlug = name.toLowerCase().replace(/\s+/g, '-');

    // Create tag
    const result = await env.DB.prepare(`
      INSERT INTO tags (name, display_name, category_id)
      VALUES (?, ?, ?)
    `).bind(
      tagSlug,
      display_name || name,
      categoryResult.id
    ).run();

    const tagId = result.meta.last_row_id;

    // If this is a creator tag, auto-create/link an artist profile
    if (category === 'creator') {
      try {
        // Check if artist already exists with this name
        const existingArtist = await env.DB.prepare(
          `SELECT id FROM artists WHERE name = ?`
        ).bind(tagSlug).first();

        let artistId;
        if (existingArtist) {
          artistId = existingArtist.id;
        } else {
          // Create new artist profile
          const artistResult = await env.DB.prepare(`
            INSERT INTO artists (name, display_name, verified, featured, updated_at)
            VALUES (?, ?, 0, 0, datetime('now'))
          `).bind(tagSlug, display_name || name).run();
          
          artistId = artistResult.meta.last_row_id;
        }

        // Link artist to creator tag
        await env.DB.prepare(`
          INSERT OR IGNORE INTO artist_tags (artist_id, tag_id)
          VALUES (?, ?)
        `).bind(artistId, tagId).run();
      } catch (error) {
        console.error('Failed to create/link artist profile:', error);
        // Don't fail the tag creation if artist creation fails
      }
    }

    return new Response(JSON.stringify({
      success: true,
      id: tagId
    }), {
      headers: corsHeaders
    });
  } catch (error) {
    console.error('Error creating tag:', error);
    return new Response(JSON.stringify({ 
      error: 'Internal server error',
      details: error.message 
    }), {
      status: 500,
      headers: corsHeaders
    });
  }
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

// ============================================
// ARTIST API HANDLERS
// ============================================

// GET /api/admin/artists
async function handleGetArtists(env, url, corsHeaders) {
  try {
    const searchParams = url.searchParams;
    const options = {
      featured: searchParams.get('featured') === 'true' ? true : searchParams.get('featured') === 'false' ? false : undefined,
      search: searchParams.get('search') || undefined,
      limit: parseInt(searchParams.get('limit')) || 50,
      offset: parseInt(searchParams.get('offset')) || 0
    };

    const artists = await getAllArtists(env, options);

    return new Response(JSON.stringify({
      success: true,
      artists,
      count: artists.length
    }), {
      headers: corsHeaders
    });
  } catch (error) {
    console.error('Error getting artists:', error);
    return new Response(JSON.stringify({
      success: false,
      error: error.message
    }), {
      status: 500,
      headers: corsHeaders
    });
  }
}

// GET /api/admin/artists/:id
async function handleGetArtist(env, artistId, corsHeaders) {
  try {
    const artist = await getArtistById(env, artistId);

    if (!artist) {
      return new Response(JSON.stringify({
        success: false,
        error: 'Artist not found'
      }), {
        status: 404,
        headers: corsHeaders
      });
    }

    return new Response(JSON.stringify({
      success: true,
      artist
    }), {
      headers: corsHeaders
    });
  } catch (error) {
    console.error('Error getting artist:', error);
    return new Response(JSON.stringify({
      success: false,
      error: error.message
    }), {
      status: 500,
      headers: corsHeaders
    });
  }
}

// POST /api/admin/artists
async function handleCreateArtist(request, env, corsHeaders) {
  try {
    const artistData = await request.json();
    const artist = await createArtist(env, artistData);

    return new Response(JSON.stringify({
      success: true,
      artist,
      message: 'Artist created successfully'
    }), {
      status: 201,
      headers: corsHeaders
    });
  } catch (error) {
    console.error('Error creating artist:', error);
    return new Response(JSON.stringify({
      success: false,
      error: error.message
    }), {
      status: 400,
      headers: corsHeaders
    });
  }
}

// PUT /api/admin/artists/:id
async function handleUpdateArtist(request, env, artistId, corsHeaders) {
  try {
    const updates = await request.json();
    const artist = await updateArtist(env, artistId, updates);

    return new Response(JSON.stringify({
      success: true,
      artist,
      message: 'Artist updated successfully'
    }), {
      headers: corsHeaders
    });
  } catch (error) {
    console.error('Error updating artist:', error);
    const status = error.message === 'Artist not found' ? 404 : 400;
    return new Response(JSON.stringify({
      success: false,
      error: error.message
    }), {
      status,
      headers: corsHeaders
    });
  }
}

// DELETE /api/admin/artists/:id
async function handleDeleteArtist(env, artistId, corsHeaders) {
  try {
    await deleteArtist(env, artistId);

    return new Response(JSON.stringify({
      success: true,
      message: 'Artist deleted successfully'
    }), {
      headers: corsHeaders
    });
  } catch (error) {
    console.error('Error deleting artist:', error);
    return new Response(JSON.stringify({
      success: false,
      error: error.message
    }), {
      status: 400,
      headers: corsHeaders
    });
  }
}

// GET /api/admin/artists/:id/images
async function handleGetArtistImages(env, artistId, url, corsHeaders) {
  try {
    const searchParams = url.searchParams;
    const options = {
      limit: parseInt(searchParams.get('limit')) || 50,
      offset: parseInt(searchParams.get('offset')) || 0,
      status: searchParams.get('status') || 'active'
    };

    const images = await getArtistImages(env, artistId, options);

    return new Response(JSON.stringify({
      success: true,
      images,
      count: images.length
    }), {
      headers: corsHeaders
    });
  } catch (error) {
    console.error('Error getting artist images:', error);
    return new Response(JSON.stringify({
      success: false,
      error: error.message
    }), {
      status: 500,
      headers: corsHeaders
    });
  }
}

// POST /api/admin/artists/:id/tags
async function handleLinkArtistTag(request, env, artistId, corsHeaders) {
  try {
    const { tag_id } = await request.json();

    if (!tag_id) {
      throw new Error('tag_id is required');
    }

    await linkArtistTag(env, artistId, tag_id);

    return new Response(JSON.stringify({
      success: true,
      message: 'Tag linked to artist successfully'
    }), {
      headers: corsHeaders
    });
  } catch (error) {
    console.error('Error linking artist tag:', error);
    return new Response(JSON.stringify({
      success: false,
      error: error.message
    }), {
      status: 400,
      headers: corsHeaders
    });
  }
}

// DELETE /api/admin/artists/:artistId/tags/:tagId
async function handleUnlinkArtistTag(env, artistId, tagId, corsHeaders) {
  try {
    await unlinkArtistTag(env, artistId, tagId);

    return new Response(JSON.stringify({
      success: true,
      message: 'Tag unlinked from artist successfully'
    }), {
      headers: corsHeaders
    });
  } catch (error) {
    console.error('Error unlinking artist tag:', error);
    return new Response(JSON.stringify({
      success: false,
      error: error.message
    }), {
      status: 400,
      headers: corsHeaders
    });
  }
}


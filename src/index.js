import { handleAdminRequest } from './admin/routes.js';
import { syncKVCache } from './admin/sync.js';

// src/index.js - Worker with Image Transformations via fetch
export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    
    // Fast path: Block aggressive polling bot (check first for early return)
    const userAgent = request.headers.get('User-Agent') || '';
    if (userAgent.includes('curly')) {
      // Log asynchronously to not block response
      ctx.waitUntil(
        Promise.resolve().then(() => {
          const ip = request.headers.get('CF-Connecting-IP') || 'Unknown';
          const country = request.headers.get('CF-IPCountry') || 'Unknown';
          console.log(`[BLOCKED] ${ip} | ${country} | curly-0.0.1`);
        })
      );
      return new Response('Rate limit exceeded. Please reduce request frequency.', { 
        status: 429,
        headers: {
          'Retry-After': '300',
          'Content-Type': 'text/plain'
        }
      });
    }
    
    // Admin routes
    if (url.pathname.startsWith('/admin')) {
      return handleAdminRequest(request, env, url);
    }

    // Admin API routes
    if (url.pathname.startsWith('/api/admin/')) {
      return handleAdminRequest(request, env, url);
    }

    // Public API Routes
    if (url.pathname.startsWith('/api/')) {
      return handleAPI(request, env, url);
    }

    // Dynamic images.json generation
    if (url.pathname === '/images.json') {
      return getImagesList(env);
    }

    // Root path
    if (url.pathname === '/') {
      return serveMainPage(env);
    }

    // Serve images from R2
    // Support /cdn-cgi/image/ paths for Cloudflare Image Resizing
    if (url.pathname.startsWith('/images/') || url.pathname.includes('/cdn-cgi/image/')) {
      // Extract actual image path
      let filename;
      
      if (url.pathname.includes('/cdn-cgi/image/')) {
        // Path like: /cdn-cgi/image/format=webp/images/abc.png
        // Extract: images/abc.png
        const match = url.pathname.match(/\/images\/.+$/);
        if (match) {
          filename = match[0].substring(1); // Remove leading slash
        } else {
          return new Response('Invalid cdn-cgi path', { status: 400 });
        }
      } else {
        // Regular path: /images/abc.png
        filename = url.pathname.substring(1); // Remove leading slash
      }
      
      try {
        const object = await env.IMAGES.get(filename);
        if (!object) {
          return new Response('Image not found', { status: 404 });
        }
        
        return new Response(object.body, {
          headers: {
            'Content-Type': object.httpMetadata?.contentType || 'image/png',
            'Cache-Control': 'public, max-age=31536000'
          }
        });
        
      } catch (error) {
        console.error('Image serve error:', error);
        return new Response('Error: ' + error.message, { status: 500 });
      }
    }
    
    // Fall back to static assets
    if (env.ASSETS) {
      return env.ASSETS.fetch(request);
    }
    
    return new Response('Not Found', { status: 404 });
  },

  /**
   * Scheduled event handler for Cron Triggers
   * Runs daily sync at 3 AM UTC
   */
  async scheduled(event, env, ctx) {
    console.log('Scheduled sync triggered at', new Date().toISOString());
    
    try {
      // Sync KV cache with D1 data
      const result = await syncKVCache(env);
      console.log(`Scheduled sync completed: ${result.count} images synced at ${result.timestamp}`);
    } catch (error) {
      console.error('Scheduled sync failed:', error);
      // Don't throw - we don't want to mark the scheduled event as failed
    }
  }
};

// ============================================
// FAST IMAGES LIST FROM KV
// ============================================

async function getImagesList(env) {
  try {
    const cached = await env.IMAGES_CACHE.get('images-list', 'json');
    
    if (cached && Array.isArray(cached)) {
      return new Response(JSON.stringify(cached), {
        headers: {
          'Content-Type': 'application/json',
          'Cache-Control': 'public, max-age=3600',
          'X-Source': 'kv-cache'
        }
      });
    }
    
    console.log('KV cache miss - falling back to D1');
    const results = await env.DB.prepare(`
      SELECT filename FROM images WHERE status = 'active'
    `).all();

    const filenames = results.results.map(r => r.filename);
    
    env.IMAGES_CACHE.put('images-list', JSON.stringify(filenames), {
      expirationTtl: 86400
    });

    return new Response(JSON.stringify(filenames), {
      headers: {
        'Content-Type': 'application/json',
        'Cache-Control': 'public, max-age=3600',
        'X-Source': 'database-fallback'
      }
    });
  } catch (error) {
    console.error('Error getting images list:', error);
    return new Response(JSON.stringify([]), {
      status: 200,
      headers: { 
        'Content-Type': 'application/json',
        'Cache-Control': 'no-cache'
      }
    });
  }
}

// ============================================
// PUBLIC API HANDLERS
// ============================================

async function handleAPI(request, env, url) {
  const path = url.pathname.replace('/api', '');
  
  const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
  };

  if (request.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    switch (path) {
      case '/random':
        return await getRandomImage(env, corsHeaders);
      
      case '/images':
        return await getImages(env, url.searchParams, corsHeaders);
      
      case '/stats':
        return await getStats(env, corsHeaders);
      
      case '/artists':
        return await getPublicArtists(env, url.searchParams, corsHeaders);
      
      default:
        // Check for /artists/:id pattern
        const artistMatch = path.match(/^\/artists\/(\d+)$/);
        if (artistMatch) {
          const artistId = parseInt(artistMatch[1]);
          return await getPublicArtist(env, artistId, corsHeaders);
        }
        
        return new Response(JSON.stringify({ error: 'Not found' }), {
          status: 404,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
    }
  } catch (error) {
    console.error('API Error:', error);
    return new Response(JSON.stringify({ error: 'Internal server error' }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
  }
}

async function getRandomImage(env, corsHeaders) {
  try {
    // PERFORMANCE: Use random OFFSET instead of ORDER BY RANDOM()
    // ORDER BY RANDOM() creates temp B-tree and is very slow
    // Random offset is O(1) instead of O(n log n)
    
    // Get count from KV cache (updated periodically)
    let count = await env.IMAGES_CACHE.get('active-count', 'text');
    if (!count) {
      // Cache miss - likely first request after deployment
      console.warn('KV cache miss - triggering sync');
      
      // Immediate fallback to DB query (don't block request)
      const countResult = await env.DB.prepare(`
        SELECT COUNT(*) as count FROM images WHERE status = 'active'
      `).first();
      count = countResult.count;
      
      // Cache for 1 hour
      await env.IMAGES_CACHE.put('active-count', count.toString(), { expirationTtl: 3600 });
      
      // Trigger full sync in background (non-blocking)
      // This will sync the full images list too
      syncKVCache(env).catch(err => console.error('Background sync failed:', err));
    } else {
      count = parseInt(count);
    }
    
    // Generate random offset
    const randomOffset = Math.floor(Math.random() * count);
    
    // Get random image using OFFSET (much faster than ORDER BY RANDOM())
    const result = await env.DB.prepare(`
      SELECT
        i.id,
        i.filename,
        i.alt_text,
        i.title,
        i.source,
        i.license,
        i.permissions,
        i.notes,
        i.file_hash,
        i.file_size,
        i.width,
        i.height,
        i.mime_type,
        i.created_at,
        c.name AS credit_name,
        c.url AS credit_url,
        c.social_handle AS credit_social_handle,
        c.platform AS credit_platform,
        c.license AS credit_license,
        c.artist_id,
        a.name AS artist_name,
        a.display_name AS artist_display_name,
        a.avatar_url AS artist_avatar,
        a.website_url AS artist_website,
        a.twitter_handle AS artist_twitter,
        a.verified AS artist_verified
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
      LIMIT 1 OFFSET ?
    `).bind(randomOffset).first();

    if (!result) {
      return new Response(JSON.stringify({ error: 'No images available' }), {
        status: 404,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    // Get tags separately - fast indexed lookup (only active tags)
    const tagsResult = await env.DB.prepare(`
      SELECT t.name, t.display_name, tc.name as category
      FROM image_tags it
      JOIN tags t ON it.tag_id = t.id
      JOIN tag_categories tc ON t.category_id = tc.id
      WHERE it.image_id = ? AND t.status = 'active'
      ORDER BY tc.sort_order, t.name
    `).bind(result.id).all();

    // CREDITS FIX: Get all creators from creator tags
    // This supports multiple creators per image
    const creatorsFromTags = await env.DB.prepare(`
      SELECT 
        a.id AS artist_id,
        a.name AS artist_name,
        a.display_name AS artist_display_name,
        a.avatar_url AS artist_avatar,
        a.website_url AS artist_website,
        a.twitter_handle AS artist_twitter,
        a.instagram_handle AS artist_instagram,
        a.verified AS artist_verified
      FROM image_tags it
      JOIN tags t ON it.tag_id = t.id
      JOIN tag_categories tc ON t.category_id = tc.id
      JOIN artist_tags at ON t.id = at.tag_id
      JOIN artists a ON at.artist_id = a.id
      WHERE it.image_id = ?
        AND tc.name = 'creator'
        AND a.status = 'active'
      ORDER BY a.display_name
    `).bind(result.id).all();

    // Build creators array with all creator information
    result.creators = creatorsFromTags.results || [];

    // For backwards compatibility, also set single artist fields from first creator
    if (result.creators.length > 0 && (!result.artist_id || !result.artist_name)) {
      const firstCreator = result.creators[0];
      result.artist_id = firstCreator.artist_id;
      result.artist_name = firstCreator.artist_name;
      result.artist_display_name = firstCreator.artist_display_name;
      result.artist_avatar = firstCreator.artist_avatar;
      result.artist_website = firstCreator.artist_website;
      result.artist_twitter = firstCreator.artist_twitter;
      result.artist_verified = firstCreator.artist_verified;
    }

    // Generate optimized image URLs using Cloudflare Image Resizing
    // These only work in production (not local dev)
    const baseUrl = '/cdn-cgi/image';
    const imagePath = `/${result.filename}`;
    
    const urls = {
      // Original (for backwards compatibility)
      original: imagePath,
      
      // Optimized variants with WebP/AVIF auto-format
      mobile: `${baseUrl}/width=640,quality=85,format=auto${imagePath}`,
      tablet: `${baseUrl}/width=1024,quality=85,format=auto${imagePath}`,
      desktop: `${baseUrl}/width=1920,quality=85,format=auto${imagePath}`,
      thumbnail: `${baseUrl}/width=320,quality=80,format=auto${imagePath}`,
      
      // Default optimized (good for most cases)
      optimized: `${baseUrl}/width=1024,quality=85,format=auto${imagePath}`
    };

    return new Response(JSON.stringify({
      ...result,
      tags: tagsResult.results || [],
      urls: urls
    }), {
      headers: { 
        ...corsHeaders, 
        'Content-Type': 'application/json',
        'Cache-Control': 'no-cache'
      }
    });
  } catch (error) {
    console.error('Error fetching random image:', error);
    throw error;
  }
}

async function getImages(env, params, corsHeaders) {
  const limit = Math.min(parseInt(params.get('limit') || '20'), 100);
  const offset = parseInt(params.get('offset') || '0');

  try {
    const results = await env.DB.prepare(`
      SELECT 
        i.id,
        i.filename,
        i.alt_text,
        i.status,
        i.created_at,
        c.name AS credit_name,
        c.artist_id,
        a.name AS artist_name,
        a.display_name AS artist_display_name,
        a.avatar_url AS artist_avatar,
        a.verified AS artist_verified
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
      LIMIT ? OFFSET ?
    `).bind(limit, offset).all();

    return new Response(JSON.stringify({
      images: results.results,
      count: results.results.length,
      limit,
      offset
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
  } catch (error) {
    console.error('Error fetching images:', error);
    throw error;
  }
}

async function getStats(env, corsHeaders) {
  try {
    // Count only eligible images (active, not hidden by tags/artists)
    const imageCount = await env.DB.prepare(`
      SELECT COUNT(*) as count 
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
    `).first();

    const tagCount = await env.DB.prepare(
      `SELECT COUNT(*) as count FROM tags WHERE status = 'active'`
    ).first();

    const creditCount = await env.DB.prepare(
      `SELECT COUNT(*) as count FROM credits WHERE id != 1`
    ).first();

    const artistCount = await env.DB.prepare(
      `SELECT COUNT(*) as count FROM artists WHERE status = 'active'`
    ).first();

    return new Response(JSON.stringify({
      total_images: imageCount.count,
      total_tags: tagCount.count,
      credited_artists: creditCount.count,
      total_artists: artistCount.count
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
  } catch (error) {
    console.error('Error fetching stats:', error);
    throw error;
  }
}

// ============================================
// PUBLIC ARTIST API HANDLERS
// ============================================

async function getPublicArtists(env, searchParams, corsHeaders) {
  try {
    const featured = searchParams.get('featured');
    const limit = Math.min(parseInt(searchParams.get('limit')) || 50, 100);
    const offset = parseInt(searchParams.get('offset')) || 0;

    let query = `
      SELECT 
        a.id,
        a.name,
        a.display_name,
        a.bio,
        a.avatar_url,
        a.website_url,
        a.twitter_handle,
        a.instagram_handle,
        a.pixiv_id,
        a.deviantart_username,
        a.verified,
        a.featured,
        COUNT(DISTINCT i.id) AS images_count
      FROM artists a
      LEFT JOIN credits c ON a.id = c.artist_id
      LEFT JOIN images i ON c.id = i.credit_id AND i.status = 'active'
    `;

    const params = [];
    if (featured === 'true') {
      query += ' WHERE a.featured = 1';
    }

    query += `
      GROUP BY a.id
      ORDER BY a.featured DESC, images_count DESC, a.name ASC
      LIMIT ? OFFSET ?
    `;
    params.push(limit, offset);

    const result = await env.DB.prepare(query).bind(...params).all();

    return new Response(JSON.stringify({
      artists: result.results,
      count: result.results.length,
      limit,
      offset
    }), {
      headers: { 
        ...corsHeaders, 
        'Content-Type': 'application/json',
        'Cache-Control': 'public, max-age=1800' // Cache for 30 minutes
      }
    });
  } catch (error) {
    console.error('Error fetching artists:', error);
    return new Response(JSON.stringify({ error: 'Failed to fetch artists' }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
  }
}

async function getPublicArtist(env, artistId, corsHeaders) {
  try {
    const artist = await env.DB.prepare(`
      SELECT 
        a.id,
        a.name,
        a.display_name,
        a.bio,
        a.avatar_url,
        a.website_url,
        a.twitter_handle,
        a.instagram_handle,
        a.pixiv_id,
        a.deviantart_username,
        a.verified,
        a.featured,
        COUNT(DISTINCT c.id) AS credits_count,
        COUNT(DISTINCT i.id) AS images_count
      FROM artists a
      LEFT JOIN credits c ON a.id = c.artist_id
      LEFT JOIN images i ON c.id = i.credit_id AND i.status = 'active'
      WHERE a.id = ?
      GROUP BY a.id
    `).bind(artistId).first();

    if (!artist) {
      return new Response(JSON.stringify({ error: 'Artist not found' }), {
        status: 404,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    // Get associated creator tags
    const tags = await env.DB.prepare(`
      SELECT t.id, t.name, t.display_name
      FROM artist_tags at
      JOIN tags t ON at.tag_id = t.id
      WHERE at.artist_id = ?
    `).bind(artistId).all();

    // Get sample images
    const images = await env.DB.prepare(`
      SELECT 
        i.id,
        i.filename,
        i.alt_text,
        i.width,
        i.height
      FROM images i
      JOIN credits c ON i.credit_id = c.id
      WHERE c.artist_id = ? AND i.status = 'active'
      ORDER BY i.created_at DESC
      LIMIT 12
    `).bind(artistId).all();

    return new Response(JSON.stringify({
      ...artist,
      creator_tags: tags.results,
      sample_images: images.results
    }), {
      headers: { 
        ...corsHeaders, 
        'Content-Type': 'application/json',
        'Cache-Control': 'public, max-age=1800' // Cache for 30 minutes
      }
    });
  } catch (error) {
    console.error('Error fetching artist:', error);
    return new Response(JSON.stringify({ error: 'Failed to fetch artist' }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
  }
}

// ============================================
// HTML PAGE WITH SSR
// ============================================

async function serveMainPage(env) {
  // SSR: Fetch initial image data during HTML generation for better LCP
  // This eliminates the client-side API call delay
  let initialImageData = null;
  let preloadLink = '';
  
  try {
    // getRandomImage returns a Response object, so we need to extract the JSON
    const response = await getRandomImage(env, {});
    const responseText = await response.text();
    initialImageData = JSON.parse(responseText);
    
    // Generate preload hint for the LCP image
    if (initialImageData?.urls?.optimized) {
      preloadLink = `<link rel="preload" as="image" href="${initialImageData.urls.optimized}" fetchpriority="high">`;
    } else if (initialImageData?.filename) {
      const imagePath = initialImageData.filename.startsWith('images/')
        ? `/${initialImageData.filename}`
        : `/images/${initialImageData.filename}`;
      preloadLink = `<link rel="preload" as="image" href="${imagePath}" fetchpriority="high">`;
    }
  } catch (error) {
    console.error('SSR image fetch failed, will fallback to client-side:', error);
    // Graceful degradation - page will work, just slower LCP
  }
  
  return new Response(`
    <!DOCTYPE html>
    <html lang="en">
    <head>
      <meta charset="UTF-8" />
      <meta name="viewport" content="width=device-width, initial-scale=1.0" />
      <title>*cute* and *pop*</title>
      <link rel="icon" type="image/x-icon" href="favicon.ico">
      <link rel="preconnect" href="https://cutetopop.com">
      ${preloadLink}
      <style>
        * {
          box-sizing: border-box;
        }

        html, body {
          height: 100%;
          margin: 0;
          font-family: "Heisei Mincho", "MS Mincho", "SimSun", serif;
          background: #fff;
          overflow-y: auto;
        }

        body {
          display: flex;
          flex-direction: column;
          min-height: 100vh;
          padding: 1rem;
        }

        .main-content {
          flex: 1;
          display: flex;
          flex-direction: column;
          justify-content: center;
          align-items: center;
          max-width: 100%;
        }

        .footer-content {
          margin-top: auto;
          padding-top: 1rem;
        }

        .image-container {
          position: relative;
          width: 100%;
          max-width: 900px;
          max-height: 85vh;
          margin: 0 auto 0.75rem;
          background: #f5f5f5;
          border-radius: 12px;
          overflow: hidden;
          box-shadow: 0 6px 30px rgba(0,0,0,.15);
          display: flex;
          align-items: center;
          justify-content: center;
          /* Default aspect ratio prevents CLS - will be overridden by inline style */
          aspect-ratio: 4 / 3;
          min-height: 300px;
        }

        #randomImage {
          max-width: 100%;
          max-height: 85vh;
          height: auto;
          object-fit: contain;
          opacity: 0;
          transition: opacity 0.3s ease-out;
          display: block;
        }

        #randomImage.loaded {
          opacity: 1;
        }

        /* Mobile optimizations */
        @media (max-width: 768px) {
          .image-container {
            width: 95vw;
            min-height: 250px;
            max-height: 60vh;
            margin-bottom: 0.5rem;
          }

          #randomImage {
            max-height: 60vh;
          }
        }

        /* Tablet/medium screens */
        @media (min-width: 769px) and (max-width: 1200px) {
          .image-container {
            width: 90vw;
            min-height: 300px;
            max-height: 70vh;
            max-width: 800px;
          }

          #randomImage {
            max-height: 70vh;
          }
        }

        /* Large desktop screens */
        @media (min-width: 1201px) {
          .image-container {
            width: 85vw;
            min-height: 350px;
            max-height: 80vh;
            max-width: 1200px;
          }

          #randomImage {
            max-height: 80vh;
          }
        }

        /* Tag Overlay - Bottom positioned */
        .tag-overlay {
          position: absolute;
          bottom: 0;
          left: 0;
          right: 0;
          background: linear-gradient(to top, rgba(0,0,0,0.85), rgba(0,0,0,0.5) 50%, transparent);
          padding: 2rem 1rem 1rem;
          opacity: 0;
          transform: translateY(10px);
          transition: opacity 0.3s ease, transform 0.3s ease;
          pointer-events: none;
        }

        .tag-overlay.visible {
          opacity: 1;
          transform: translateY(0);
          pointer-events: auto;
        }

        /* Desktop hover behavior */
        @media (hover: hover) {
          .image-container:hover .tag-overlay,
          .image-container:focus-within .tag-overlay {
            opacity: 1;
            transform: translateY(0);
            pointer-events: auto;
          }
        }

        .tag-preview {
          display: flex;
          flex-wrap: wrap;
          gap: 0.5rem;
          margin-bottom: 0.5rem;
          align-items: center;
        }

        .tag {
          display: inline-block;
          padding: 0.25rem 0.75rem;
          background: rgba(255, 255, 255, 0.9);
          color: #333;
          border-radius: 20px;
          font-size: 0.85rem;
          font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
          white-space: nowrap;
          backdrop-filter: blur(4px);
          box-shadow: 0 2px 4px rgba(0,0,0,0.1);
        }

        .tag[data-category="content"] { border-left: 3px solid #ff6b9d; }
        .tag[data-category="character"] { border-left: 3px solid #4ecdc4; }
        .tag[data-category="creator"] { border-left: 3px solid #95e1d3; }
        .tag[data-category="source"] { border-left: 3px solid #ffa07a; }

        .expand-btn {
          display: inline-flex;
          align-items: center;
          gap: 0.25rem;
          padding: 0.25rem 0.75rem;
          background: rgba(255, 255, 255, 0.95);
          color: #333;
          border: none;
          border-radius: 20px;
          font-size: 0.85rem;
          font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
          cursor: pointer;
          backdrop-filter: blur(4px);
          box-shadow: 0 2px 4px rgba(0,0,0,0.1);
          transition: background 0.2s ease, transform 0.1s ease;
        }

        .expand-btn:hover {
          background: rgba(255, 255, 255, 1);
          transform: scale(1.05);
        }

        .expand-btn:focus {
          outline: 2px solid #4ecdc4;
          outline-offset: 2px;
        }

        .expand-btn::after {
          content: '▼';
          font-size: 0.7rem;
          transition: transform 0.3s ease;
        }

        .expand-btn.expanded::after {
          transform: rotate(180deg);
        }

        /* Expanded Metadata View */
        .metadata-panel {
          position: fixed;
          bottom: 0;
          left: 0;
          right: 0;
          background: #fff;
          border-top: 1px solid #ddd;
          box-shadow: 0 -4px 20px rgba(0,0,0,0.15);
          max-height: 60vh;
          overflow-y: auto;
          padding: 1.5rem;
          transform: translateY(100%);
          transition: transform 0.3s ease-in-out;
          z-index: 1000;
        }

        .metadata-panel.open {
          transform: translateY(0);
        }

        .metadata-header {
          display: flex;
          justify-content: space-between;
          align-items: center;
          margin-bottom: 1rem;
        }

        .metadata-header h2 {
          margin: 0;
          font-size: 1.25rem;
          font-weight: 500;
          color: #333;
        }

        .close-btn {
          background: none;
          border: none;
          font-size: 1.5rem;
          cursor: pointer;
          color: #666;
          padding: 0.25rem;
          line-height: 1;
          transition: color 0.2s ease;
        }

        .close-btn:hover {
          color: #000;
        }

        .close-btn:focus {
          outline: 2px solid #4ecdc4;
          outline-offset: 2px;
        }

        .metadata-section {
          margin-bottom: 1.5rem;
        }

        .metadata-section h3 {
          font-size: 1rem;
          font-weight: 500;
          color: #666;
          margin: 0 0 0.75rem 0;
          text-transform: uppercase;
          letter-spacing: 0.05em;
          font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
        }

        .tag-category {
          margin-bottom: 1rem;
        }

        .tag-category-name {
          font-size: 0.9rem;
          font-weight: 600;
          color: #555;
          margin-bottom: 0.5rem;
          font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
        }

        .tag-list {
          display: flex;
          flex-wrap: wrap;
          gap: 0.5rem;
        }

        .metadata-info {
          display: grid;
          grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
          gap: 1rem;
          font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
          font-size: 0.9rem;
        }

        .metadata-item {
          display: flex;
          flex-direction: column;
          gap: 0.25rem;
        }

        .metadata-label {
          font-weight: 600;
          color: #666;
        }

        .metadata-value {
          color: #333;
        }

        .metadata-value a {
          color: #4ecdc4;
          text-decoration: none;
        }

        .metadata-value a:hover {
          text-decoration: underline;
        }

        /* Skeleton loading animation */
        .skeleton-text {
          display: inline-block;
          background: linear-gradient(90deg, #f0f0f0 25%, #e0e0e0 50%, #f0f0f0 75%);
          background-size: 200% 100%;
          animation: skeleton-loading 1.5s ease-in-out infinite;
          border-radius: 4px;
          color: transparent;
          user-select: none;
        }

        @keyframes skeleton-loading {
          0% { background-position: 200% 0; }
          100% { background-position: -200% 0; }
        }

        /* Artist Credit Display */
        .artist-credit {
          text-align: center;
          margin: 0 auto 0.5rem;
          max-width: 600px;
          min-height: 80px;
          font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
        }

        .artist-credit-label {
          font-size: 0.75rem;
          color: #888;
          text-transform: uppercase;
          letter-spacing: 0.1em;
          margin-bottom: 0.25rem;
        }

        .artist-credit-name {
          font-size: 1.1rem;
          font-weight: 600;
          color: #333;
          margin-bottom: 0.25rem;
        }

        .artist-credit-name a {
          color: #333;
          text-decoration: none;
          transition: color 0.2s ease;
        }

        .artist-credit-name a:hover {
          color: #4ecdc4;
        }

        .artist-credit-social {
          font-size: 0.9rem;
          color: #666;
          display: flex;
          align-items: center;
          justify-content: center;
          gap: 0.35rem;
        }

        .artist-credit-social a {
          color: #4ecdc4;
          text-decoration: none;
          display: inline-flex;
          align-items: center;
          gap: 0.25rem;
          transition: color 0.2s ease;
        }

        .artist-credit-social a:hover {
          color: #3ab5ac;
          text-decoration: underline;
        }

        .artist-credit-social::before {
          content: '→';
          font-size: 0.9rem;
          color: #999;
        }

        .artist-credit-help {
          font-size: 0.85rem;
          color: #888;
          font-style: italic;
        }

        .artist-credit-help a {
          color: #4ecdc4;
          text-decoration: none;
          font-style: normal;
        }

        .artist-credit-help a:hover {
          text-decoration: underline;
        }

        .artist-unknown {
          color: #888;
          font-style: italic;
        }

        .disclaimer {
          font-size: 0.85rem;
          color: #888;
          text-align: center;
          max-width: 600px;
          line-height: 1.4;
          margin: 0.75rem auto 0;
          opacity: 0.8;
        }

        .footer-link {
          font-size: 0.75rem;
          color: #999;
          text-align: center;
          margin: 0.5rem auto 0;
        }

        .footer-link a {
          color: #999;
          text-decoration: none;
          transition: color 0.2s ease;
        }

        .footer-link a:hover {
          color: #4ecdc4;
        }

        .loading {
          position: absolute;
          top: 50%;
          left: 50%;
          transform: translate(-50%, -50%);
          color: #666;
          font-size: 0.9rem;
          display: none;
        }

        /* Accessibility - High Contrast Mode */
        @media (prefers-contrast: high) {
          .tag, .expand-btn {
            background: #fff;
            border: 2px solid #000;
          }
        }

        /* Accessibility - Reduced Motion */
        @media (prefers-reduced-motion: reduce) {
          *,
          *::before,
          *::after {
            animation-duration: 0.01ms !important;
            animation-iteration-count: 1 !important;
            transition-duration: 0.01ms !important;
            scroll-behavior: auto !important;
          }
        }

        /* Responsive adjustments */
        @media (max-width: 600px) {
          .metadata-panel {
            max-height: 85vh;
            padding: 1rem;
            border-radius: 16px 16px 0 0;
          }

          .metadata-header {
            position: sticky;
            top: 0;
            background: white;
            padding: 0.5rem 0;
            margin-bottom: 0.75rem;
            z-index: 2;
          }

          .tag-preview {
            gap: 0.4rem;
          }

          .tag {
            font-size: 0.8rem;
            padding: 0.35rem 0.75rem;
          }

          .expand-btn {
            font-size: 0.85rem;
            padding: 0.4rem 0.8rem;
            margin-top: 0.25rem;
          }
          
          /* Better touch targets */
          .close-btn {
            padding: 0.5rem;
            margin: -0.5rem;
            font-size: 1.75rem;
          }
        }

        /* Tablet-specific adjustments */
        @media (min-width: 601px) and (max-width: 1024px) {
          .metadata-panel {
            max-height: 75vh;
            padding: 1.25rem;
            border-radius: 20px 20px 0 0;
          }

          .tag-preview {
            gap: 0.45rem;
          }

          .tag {
            font-size: 0.85rem;
            padding: 0.3rem 0.8rem;
          }
        }

        /* Overlay backdrop when panel is open */
        .backdrop {
          display: none;
          position: fixed;
          top: 0;
          left: 0;
          right: 0;
          bottom: 0;
          background: rgba(0, 0, 0, 0.3);
          z-index: 999;
        }

        .backdrop.visible {
          display: block;
        }
      </style>
    </head>
    <body>
      <div class="main-content">
        <div class="image-container" role="img" aria-label="Random cute image" ${
          initialImageData?.width && initialImageData?.height
            ? `style="aspect-ratio: ${initialImageData.width} / ${initialImageData.height};"`
            : ''
        }>
          <div class="loading" aria-live="polite">Loading...</div>
          <img id="randomImage" alt="${initialImageData?.alt_text || ''}" loading="eager" fetchpriority="high" ${
            initialImageData?.width && initialImageData?.height
              ? `width="${initialImageData.width}" height="${initialImageData.height}"`
              : ''
          } />

          <div class="tag-overlay" id="tagOverlay" aria-label="Image tags">
            <div class="tag-preview" id="tagPreview" role="navigation" aria-label="Quick tags"></div>
            <button
              class="expand-btn"
              id="expandBtn"
              aria-expanded="false"
              aria-controls="metadataPanel"
            >View all</button>
          </div>
        </div>
      </div>

      <div class="footer-content">
        <div class="artist-credit" id="artistCredit">
          <div class="artist-credit-label">Artist</div>
          <div class="artist-credit-name" id="artistName">
            <span class="skeleton-text">Loading artist...</span>
          </div>
          <div class="artist-credit-social" id="artistSocial">
            <span class="skeleton-text">Loading details...</span>
          </div>
        </div>

        <div class="disclaimer">
          This website displays images that do not belong to us. We are working on adding proper attribution and reporting features.
        </div>

        <div class="footer-link">
          <a href="https://github.com/araragi-lacking-branding/poptocute-images" target="_blank" rel="noopener noreferrer">GitHub</a>
        </div>
      </div>

      <div class="backdrop" id="backdrop" aria-hidden="true"></div>

      <aside
        class="metadata-panel"
        id="metadataPanel"
        role="complementary"
        aria-label="Image metadata"
      >
        <div class="metadata-header">
          <h2>Image Details</h2>
          <button class="close-btn" id="closeBtn" aria-label="Close metadata panel">×</button>
        </div>
        <div id="metadataContent"></div>
      </aside>

      <script>
        // SSR data - image info embedded at render time for instant display (better LCP)
        const INITIAL_IMAGE_DATA = ${initialImageData ? JSON.stringify(initialImageData).replace(/</g, '\\u003c').replace(/>/g, '\\u003e') : 'null'};
        
        // HTML escape utility for security
        function escapeHtml(text) {
          const div = document.createElement('div');
          div.textContent = text;
          return div.innerHTML;
        }

        // Format file size
        function formatFileSize(bytes) {
          if (!bytes) return 'Unknown';
          if (bytes < 1024) return bytes + ' B';
          if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
          return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
        }

        // Group tags by category
        function groupTagsByCategory(tags) {
          const grouped = {};
          tags.forEach(tag => {
            if (!grouped[tag.category]) {
              grouped[tag.category] = [];
            }
            grouped[tag.category].push(tag);
          });
          return grouped;
        }

        // Create tag element
        function createTagElement(tag) {
          const tagEl = document.createElement('span');
          tagEl.className = 'tag';
          tagEl.textContent = tag.display_name || tag.name;
          tagEl.setAttribute('data-category', tag.category);
          tagEl.setAttribute('data-tag-id', tag.name);
          return tagEl;
        }

        // Build metadata panel content
        function buildMetadataPanel(data) {
          const content = [];

          // Tags section
          if (data.tags && data.tags.length > 0) {
            const grouped = groupTagsByCategory(data.tags);
            const categoryOrder = ['content', 'character', 'creator', 'source'];

            content.push('<div class="metadata-section"><h3>Tags</h3>');
            categoryOrder.forEach(category => {
              if (grouped[category]) {
                content.push(\`<div class="tag-category">
                  <div class="tag-category-name">\${escapeHtml(category.charAt(0).toUpperCase() + category.slice(1))}</div>
                  <div class="tag-list">\`);
                grouped[category].forEach(tag => {
                  content.push(\`<span class="tag" data-category="\${escapeHtml(category)}" data-tag-id="\${escapeHtml(tag.name)}">\${escapeHtml(tag.display_name || tag.name)}</span>\`);
                });
                content.push('</div></div>');
              }
            });
            content.push('</div>');
          }

          // Image info section
          content.push('<div class="metadata-section"><h3>Image Information</h3>');
          content.push('<div class="metadata-info">');

          if (data.width && data.height) {
            content.push(\`<div class="metadata-item">
              <span class="metadata-label">Dimensions</span>
              <span class="metadata-value">\${data.width} × \${data.height}px</span>
            </div>\`);
          }

          if (data.file_size) {
            content.push(\`<div class="metadata-item">
              <span class="metadata-label">File Size</span>
              <span class="metadata-value">\${formatFileSize(data.file_size)}</span>
            </div>\`);
          }

          if (data.mime_type) {
            content.push(\`<div class="metadata-item">
              <span class="metadata-label">Format</span>
              <span class="metadata-value">\${escapeHtml(data.mime_type.split('/')[1].toUpperCase())}</span>
            </div>\`);
          }

          if (data.credit_name) {
            content.push(\`<div class="metadata-item">
              <span class="metadata-label">Credit</span>
              <span class="metadata-value">\${
                data.credit_url
                  ? \`<a href="\${escapeHtml(data.credit_url)}" target="_blank" rel="noopener noreferrer">\${escapeHtml(data.credit_name)}</a>\`
                  : escapeHtml(data.credit_name)
              }</span>
            </div>\`);
          }

          if (data.credit_license) {
            content.push(\`<div class="metadata-item">
              <span class="metadata-label">License</span>
              <span class="metadata-value">\${escapeHtml(data.credit_license)}</span>
            </div>\`);
          }

          content.push('</div></div>');

          return content.join('');
        }

        // Main load function
        async function loadRandomImage() {
          const loadingEl = document.querySelector('.loading');
          const img = document.getElementById('randomImage');
          const imageContainer = document.querySelector('.image-container');
          const tagOverlay = document.getElementById('tagOverlay');
          const tagPreview = document.getElementById('tagPreview');
          const expandBtn = document.getElementById('expandBtn');
          const metadataContent = document.getElementById('metadataContent');

          // Double tap detection for mobile
          let lastTap = 0;
          let tapTimeout;

          imageContainer.addEventListener('touchend', (e) => {
            const currentTime = new Date().getTime();
            const tapLength = currentTime - lastTap;
            
            clearTimeout(tapTimeout);
            
            if (tapLength < 500 && tapLength > 0) {
              // Double tap detected
              e.preventDefault();
              tagOverlay.classList.toggle('visible');
            } else {
              // Single tap
              tapTimeout = setTimeout(() => {
                lastTap = 0;
              }, 500);
            }
            
            lastTap = currentTime;
          });

          // Hide overlay when tapping elsewhere
          document.addEventListener('touchend', (e) => {
            if (!imageContainer.contains(e.target) && tagOverlay.classList.contains('visible')) {
              tagOverlay.classList.remove('visible');
            }
          });

          try {
            let data;
            
            // Use SSR data if available (much faster - no API call needed!)
            if (INITIAL_IMAGE_DATA) {
              data = INITIAL_IMAGE_DATA;
              console.log('Using SSR data - instant load');
            } else {
              // Fallback: fetch from API
              console.log('SSR data not available - fetching from API');
              const response = await fetch('/api/random', {
                headers: {
                  'Accept': 'application/json'
                },
                priority: 'high'
              });
              
              if (!response.ok) throw new Error('Failed to fetch image');
              data = await response.json();
            }

            if (!data.filename) {
              throw new Error('No image available');
            }

            // Set image dimensions BEFORE loading to prevent layout shift
            if (data.width && data.height) {
              // Set explicit dimensions on img element
              // Browser will reserve correct space based on these
              img.width = data.width;
              img.height = data.height;
              
              // Set container aspect ratio immediately to prevent CLS
              // This locks in the exact space needed before image loads
              const aspectRatio = data.width / data.height;
              imageContainer.style.aspectRatio = \`\${aspectRatio}\`;
              
              // The CSS max-height: 85vh (or responsive values) will automatically
              // constrain the container if the aspect ratio would make it too tall.
              // The img element's object-fit: contain ensures the image fits perfectly
              // within the container without being cut off.
            }

            // Set alt text immediately
            img.alt = data.alt_text || 'Random cute image';

            // Preload image using decode() API for smooth rendering
            // This prevents flickering by ensuring the image is fully decoded before display
            const preloadImage = new Image();
            
            // Set up responsive images with srcset
            if (data.urls) {
              preloadImage.srcset = \`
                \${data.urls.mobile} 640w,
                \${data.urls.tablet} 1024w,
                \${data.urls.desktop} 1920w
              \`.trim();
              preloadImage.sizes = '(max-width: 768px) 640px, (max-width: 1200px) 1024px, 1920px';
              preloadImage.src = data.urls.optimized;
            } else {
              // Legacy fallback if urls field not present
              const imagePath = data.filename.startsWith('images/')
                ? \`/\${data.filename}\`
                : \`/images/\${data.filename}\`;
              preloadImage.src = imagePath;
            }

            // Use decode() API if available (modern browsers)
            // Falls back to onload for older browsers
            const imageReady = preloadImage.decode ? 
              preloadImage.decode().catch(() => {
                // Decode failed, wait for onload instead
                return new Promise((resolve, reject) => {
                  preloadImage.onload = resolve;
                  preloadImage.onerror = reject;
                });
              }) :
              new Promise((resolve, reject) => {
                preloadImage.onload = resolve;
                preloadImage.onerror = reject;
              });

            imageReady
              .then(() => {
                // Image is fully loaded and decoded - transfer to display element
                if (data.urls) {
                  img.srcset = preloadImage.srcset;
                  img.sizes = preloadImage.sizes;
                }
                img.src = preloadImage.src;
                
                // Trigger smooth fade-in
                requestAnimationFrame(() => {
                  img.classList.add('loaded');
                });

                // Pre-warm Cloudflare cache for next random image
                setTimeout(() => {
                  fetch('/api/random', {
                    headers: { 'Accept': 'application/json' },
                    priority: 'low'
                  })
                  .then(res => res.json())
                  .then(nextData => {
                    if (nextData.urls) {
                      const prefetchLink = document.createElement('link');
                      prefetchLink.rel = 'prefetch';
                      prefetchLink.as = 'image';
                      prefetchLink.href = nextData.urls.optimized;
                      document.head.appendChild(prefetchLink);
                    }
                  })
                  .catch(() => {}); // Silent fail - this is just optimization
                }, 1000);
              })
              .catch((error) => {
                // Image failed to load
                console.error('Image load error:', error);
                loadingEl.textContent = 'Failed to load image';
                loadingEl.style.display = 'block';
              });

            // Build tag preview (show top 5 tags)
            tagPreview.innerHTML = '';
            if (data.tags && data.tags.length > 0) {
              const previewTags = data.tags.slice(0, 5);
              previewTags.forEach(tag => {
                tagPreview.appendChild(createTagElement(tag));
              });

              // Show expand button only if there are more tags or metadata
              if (data.tags.length > 5 || data.credit_name || data.width) {
                expandBtn.style.display = 'inline-flex';
              } else {
                expandBtn.style.display = 'none';
              }
            } else {
              // Show "No tags" message when no tags are available
              const noTagsMsg = document.createElement('span');
              noTagsMsg.textContent = 'No Current Tags';
              noTagsMsg.style.color = 'rgba(255, 255, 255, 0.9)';
              noTagsMsg.style.fontSize = '0.9rem';
              noTagsMsg.style.fontWeight = '600';
              noTagsMsg.style.fontFamily = '-apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif';
              tagPreview.appendChild(noTagsMsg);
              expandBtn.style.display = 'none';
            }

            // Display artist credit - always visible for transparency
            const artistCredit = document.getElementById('artistCredit');
            const artistName = document.getElementById('artistName');
            const artistSocial = document.getElementById('artistSocial');

            // Check if we have creators data
            const creators = data.creators || [];
            const hasCreators = creators.length > 0;

            if (!hasCreators) {
              // Show unknown artist with help option
              artistName.innerHTML = \`<span class="artist-unknown">Unknown Artist</span>\`;

              // Build email body - short and simple for universal compatibility
              const emailBody = encodeURIComponent(
                \`Thank you for helping properly credit art for ID: \${data.filename}. Please let us know your request (attribution, removal, or anything else), and we'll take action ASAP. If you'd like to help us provide as much credit as possible, knowing the artist name, social, link to their art page, and anything similar, we're happy to update. We appreciate you immensely.\`
              );

              artistSocial.innerHTML = \`<span class="artist-credit-help">Know who created this? <a href="mailto:lambda@cutetopop.com?subject=Artist Attribution - \${encodeURIComponent(data.filename)}&body=\${emailBody}">Help us attribute</a></span>\`;
            } else if (creators.length === 1) {
              // Single creator - display name and profile info
              const creator = creators[0];
              const displayName = creator.artist_display_name || creator.artist_name;
              
              // Show creator name (no hyperlink)
              artistName.innerHTML = escapeHtml(displayName);

              // Build profile links
              const profileLinks = [];
              
              if (creator.artist_website) {
                profileLinks.push(\`<a href="\${escapeHtml(creator.artist_website)}" target="_blank" rel="noopener noreferrer">Website</a>\`);
              }
              
              if (creator.artist_twitter) {
                profileLinks.push(\`<a href="https://twitter.com/\${escapeHtml(creator.artist_twitter)}" target="_blank" rel="noopener noreferrer">Twitter</a>\`);
              }
              
              if (creator.artist_instagram) {
                profileLinks.push(\`<a href="https://instagram.com/\${escapeHtml(creator.artist_instagram)}" target="_blank" rel="noopener noreferrer">Instagram</a>\`);
              }
              
              // Display profile links if available
              if (profileLinks.length > 0) {
                artistSocial.innerHTML = profileLinks.join(' · ');
              } else {
                artistSocial.innerHTML = '';
              }
            } else {
              // Multiple creators - show names, with expandable profile info
              const creatorNames = creators.map(c => escapeHtml(c.artist_display_name || c.artist_name)).join(', ');
              artistName.innerHTML = creatorNames;

              // Build expandable profile section - show ALL creators, even without links
              const profileSections = creators.map(creator => {
                const displayName = escapeHtml(creator.artist_display_name || creator.artist_name);
                const links = [];
                
                if (creator.artist_website) {
                  links.push(\`<a href="\${escapeHtml(creator.artist_website)}" target="_blank" rel="noopener noreferrer">Website</a>\`);
                }
                if (creator.artist_twitter) {
                  links.push(\`<a href="https://twitter.com/\${escapeHtml(creator.artist_twitter)}" target="_blank" rel="noopener noreferrer">Twitter</a>\`);
                }
                if (creator.artist_instagram) {
                  links.push(\`<a href="https://instagram.com/\${escapeHtml(creator.artist_instagram)}" target="_blank" rel="noopener noreferrer">Instagram</a>\`);
                }
                
                if (links.length > 0) {
                  return \`<span class="creator-profile"><strong>\${displayName}</strong>: \${links.join(' · ')}</span>\`;
                } else {
                  return \`<span class="creator-profile"><strong>\${displayName}</strong>: <em>Profile information pending</em></span>\`;
                }
              });

              artistSocial.innerHTML = \`<details class="creator-profiles"><summary>View profiles</summary>\${profileSections.join('<br>')}</details>\`;
            }

            // Build full metadata panel
            metadataContent.innerHTML = buildMetadataPanel(data);

          } catch (err) {
            console.error('Failed to load random image', err);
            loadingEl.textContent = 'Error loading image';
            img.alt = 'Error loading image';
          }
        }

        // Toggle metadata panel
        const expandBtn = document.getElementById('expandBtn');
        const closeBtn = document.getElementById('closeBtn');
        const metadataPanel = document.getElementById('metadataPanel');
        const backdrop = document.getElementById('backdrop');

        function openPanel() {
          metadataPanel.classList.add('open');
          backdrop.classList.add('visible');
          expandBtn.classList.add('expanded');
          expandBtn.setAttribute('aria-expanded', 'true');
          backdrop.setAttribute('aria-hidden', 'false');
        }

        function closePanel() {
          metadataPanel.classList.remove('open');
          backdrop.classList.remove('visible');
          expandBtn.classList.remove('expanded');
          expandBtn.setAttribute('aria-expanded', 'false');
          backdrop.setAttribute('aria-hidden', 'true');
        }

        expandBtn.addEventListener('click', (e) => {
          e.stopPropagation();
          if (metadataPanel.classList.contains('open')) {
            closePanel();
          } else {
            openPanel();
          }
        });

        closeBtn.addEventListener('click', closePanel);
        backdrop.addEventListener('click', closePanel);

        // Keyboard navigation
        document.addEventListener('keydown', (e) => {
          if (e.key === 'Escape' && metadataPanel.classList.contains('open')) {
            closePanel();
          }
        });

        // Initialize immediately - start loading before DOM is fully ready
        loadRandomImage();
      </script>
    </body>
    </html>
  `, {
    headers: {
      'Content-Type': 'text/html;charset=UTF-8',
      // No-cache for SSR HTML - each request gets a fresh random image
      'Cache-Control': 'no-cache, no-store, must-revalidate',
      'Pragma': 'no-cache',
      'Expires': '0',
      // Security headers
      'X-Frame-Options': 'SAMEORIGIN',
      'X-Content-Type-Options': 'nosniff',
      'Referrer-Policy': 'strict-origin-when-cross-origin',
      'Permissions-Policy': 'geolocation=(), microphone=(), camera=()'
    }
  });
}

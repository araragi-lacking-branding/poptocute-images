import { handleAdminRequest } from './admin/routes.js';

// src/index.js - Worker with Image Transformations via fetch
export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    
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
      return serveMainPage();
    }

    // Serve images from R2
    // For WebP, users/browsers should request via /cdn-cgi/image/ path directly
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
      
      default:
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
    const result = await env.DB.prepare(`
      SELECT 
        i.id,
        i.filename,
        i.alt_text,
        i.file_size,
        i.width,
        i.height,
        i.mime_type,
        i.created_at,
        c.name AS credit_name,
        c.url AS credit_url,
        c.license AS credit_license
      FROM images i
      LEFT JOIN credits c ON i.credit_id = c.id
      WHERE i.status = 'active'
      ORDER BY RANDOM()
      LIMIT 1
    `).first();

    if (!result) {
      return new Response(JSON.stringify({ error: 'No images available' }), {
        status: 404,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    const tags = await env.DB.prepare(`
      SELECT t.name, t.display_name, tc.name as category
      FROM image_tags it
      JOIN tags t ON it.tag_id = t.id
      JOIN tag_categories tc ON t.category_id = tc.id
      WHERE it.image_id = ?
      ORDER BY tc.sort_order, t.name
    `).bind(result.id).all();

    return new Response(JSON.stringify({
      ...result,
      tags: tags.results || []
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
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
        c.name AS credit_name
      FROM images i
      LEFT JOIN credits c ON i.credit_id = c.id
      WHERE i.status = 'active'
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
    const imageCount = await env.DB.prepare(
      `SELECT COUNT(*) as count FROM images WHERE status = 'active'`
    ).first();

    const tagCount = await env.DB.prepare(
      `SELECT COUNT(*) as count FROM tags`
    ).first();

    const creditCount = await env.DB.prepare(
      `SELECT COUNT(*) as count FROM credits WHERE id != 1`
    ).first();

    return new Response(JSON.stringify({
      total_images: imageCount.count,
      total_tags: tagCount.count,
      credited_artists: creditCount.count
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
  } catch (error) {
    console.error('Error fetching stats:', error);
    throw error;
  }
}

// ============================================
// HTML PAGE
// ============================================

async function serveMainPage() {
  return new Response(`
    <!DOCTYPE html>
    <html lang="en">
    <head>
      <meta charset="UTF-8" />
      <meta name="viewport" content="width=device-width, initial-scale=1.0" />
      <title>*cute* and *pop*</title>
      <link rel="icon" type="image/x-icon" href="favicon.ico">
      <style>
        html, body {
          height: 100%;
          margin: 0;
          font-family: "Heisei Mincho", "MS Mincho", "SimSun", serif;
          background: #fff;
          display: flex;
          flex-direction: column;
          justify-content: center;
          align-items: center;
          padding: 1rem;
          box-sizing: border-box;
        }

        .image-container {
          width: 100%;
          max-width: min(90vw, 70vh);
          aspect-ratio: 1 / 1;
          position: relative;
          margin-bottom: 0.75rem;
          background: #f5f5f5;
          border-radius: 12px;
          overflow: hidden;
          box-shadow: 0 6px 30px rgba(0,0,0,.15);
        }

        #randomImage {
          position: absolute;
          top: 50%;
          left: 50%;
          transform: translate(-50%, -50%);
          max-width: 100%;
          max-height: 100%;
          width: auto;
          height: auto;
          object-fit: contain;
          opacity: 0;
          transition: opacity 0.3s ease-in-out;
        }
        
        #randomImage.loaded {
          opacity: 1;
        }

        .disclaimer {
          font-size: 0.9rem;
          color: #444;
          text-align: center;
          max-width: 600px;
          line-height: 1.4;
          margin-top: 0.75rem;
        }
      </style>
    </head>
    <body>
      <div class="image-container">
        <img id="randomImage" alt="Random image" loading="eager" />
      </div>

      <div class="disclaimer">
        This website displays images that do not belong to us. We are working on adding proper attribution and reporting features.
      </div>

      <script>
        async function loadRandomImage() {
          try {
            const response = await fetch('images.json', {cache: 'default'});
            const images = await response.json();
            if (!images || images.length === 0) {
              document.getElementById('randomImage').alt = 'No images found';
              return;
            }
            
            const randomImage = images[Math.floor(Math.random() * images.length)];
            const img = document.getElementById('randomImage');
            
            const tempImg = new Image();
            tempImg.onload = () => {
              img.src = tempImg.src;
              img.alt = 'Random image - ' + randomImage.split('/').pop();
              requestAnimationFrame(() => {
                img.classList.add('loaded');
              });
            };
            tempImg.src = randomImage;
            
          } catch (err) {
            console.error('Failed to load images.json', err);
            document.getElementById('randomImage').alt = 'Error loading image list';
          }
        }

        loadRandomImage();
      </script>
    </body>
    </html>
  `, {
    headers: {
      'Content-Type': 'text/html;charset=UTF-8',
      'Cache-Control': 'public, max-age=300'
    }
  });
}

import { handleAdminRequest } from './admin/routes.js';

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
      return serveMainPage();
    }

    // Serve images from R2
    // DO NOT handle /cdn-cgi/image/ paths - let Cloudflare handle those by fetching from /images/
    if (url.pathname.startsWith('/images/')) {
      const filename = url.pathname.substring(1); // Remove leading slash: "images/abc.png"
      
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
        c.social_handle AS credit_social_handle,
        c.platform AS credit_platform,
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
      <link rel="preconnect" href="https://cutetopop.com">
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
          min-height: 300px;
          max-height: 85vh;
          margin: 0 auto 0.75rem;
          background: #f5f5f5;
          border-radius: 12px;
          overflow: hidden;
          box-shadow: 0 6px 30px rgba(0,0,0,.15);
          display: flex;
          align-items: center;
          justify-content: center;
        }

        .image-container::before {
          content: "";
          position: absolute;
          top: 50%;
          left: 50%;
          width: 40px;
          height: 40px;
          margin: -20px 0 0 -20px;
          border: 3px solid #f3f3f3;
          border-top: 3px solid #555;
          border-radius: 50%;
          opacity: 0;
          transition: opacity 0.2s ease 0.3s;
          animation: spin 1s linear infinite;
        }

        .image-container.loading::before {
          opacity: 1;
        }

        @keyframes spin {
          0% { transform: translate(-50%, -50%) rotate(0deg); }
          100% { transform: translate(-50%, -50%) rotate(360deg); }
        }

        #randomImage {
          max-width: 100%;
          max-height: 85vh;
          height: auto;
          object-fit: contain;
          opacity: 0;
          visibility: hidden;
          transition: opacity 0.2s ease-out, visibility 0s linear 0.2s;
          display: block;
        }

        #randomImage.loaded {
          opacity: 1;
          visibility: visible;
          transition: opacity 0.2s ease-out, visibility 0s linear 0s;
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
        <div class="image-container" role="img" aria-label="Random cute image">
          <div class="loading" aria-live="polite">Loading...</div>
          <img id="randomImage" alt="" loading="eager" fetchpriority="high" />

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
            // Start image fetch ASAP with high priority
            // Fetch random image - server returns no-cache to ensure fresh results
            const fetchPromise = fetch('/api/random', {
              headers: {
                'Accept': 'application/json'
              },
              priority: 'high'
            });
            
            const response = await fetchPromise;
            if (!response.ok) throw new Error('Failed to fetch image');

            const data = await response.json();

            if (!data.filename) {
              throw new Error('No image available');
            }

            // Set image dimensions BEFORE loading to prevent layout shift
            if (data.width && data.height) {
              // Set explicit width and height attributes
              // This tells the browser to reserve the correct space
              img.width = data.width;
              img.height = data.height;
              
              // Set aspect ratio on container to prevent resize
              const aspectRatio = data.width / data.height;
              imageContainer.style.aspectRatio = aspectRatio.toString();
            }

            // Set alt text immediately
            img.alt = data.alt_text || 'Random cute image';

            // Load image
            // Handle filenames that may or may not include 'images/' prefix
            const imagePath = data.filename.startsWith('images/')
              ? \`/\${data.filename}\`
              : \`/images/\${data.filename}\`;

            // Add loading state with delay for spinner
            imageContainer.classList.add('loading');
            
            // Use onload for faster perceived performance
            img.onload = () => {
              // Remove loading state and show image
              imageContainer.classList.remove('loading');
              img.classList.add('loaded');
            };

            img.onerror = () => {
              imageContainer.classList.remove('loading');
              loadingEl.textContent = 'Failed to load image';
              loadingEl.style.display = 'block';
            };
            
            // Set source to trigger load
            img.src = imagePath;

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
              expandBtn.style.display = 'none';
            }

            // Display artist credit - always visible for transparency
            const artistCredit = document.getElementById('artistCredit');
            const artistName = document.getElementById('artistName');
            const artistSocial = document.getElementById('artistSocial');

            // Determine if artist is unknown
            const isUnknown = !data.credit_name || data.credit_name === 'Unknown Artist';

            if (isUnknown) {
              // Show unknown artist with help option
              artistName.innerHTML = \`<span class="artist-unknown">Unknown Artist</span>\`;

              // Build email body - short and simple for universal compatibility
              const emailBody = encodeURIComponent(
                \`Thank you for helping properly credit art for ID: \${data.filename}. Please let us know your request (attribution, removal, or anything else), and we'll take action ASAP. If you'd like to help us provide as much credit as possible, knowing the artist name, social, link to their art page, and anything similar, we're happy to update. We appreciate you immensely.\`
              );

              artistSocial.innerHTML = \`<span class="artist-credit-help">Know who created this? <a href="mailto:lambda@cutetopop.com?subject=Artist Attribution - \${encodeURIComponent(data.filename)}&body=\${emailBody}">Help us attribute</a></span>\`;
            } else {
              // Build artist name (with or without link)
              if (data.credit_url) {
                artistName.innerHTML = \`<a href="\${escapeHtml(data.credit_url)}" target="_blank" rel="noopener noreferrer">\${escapeHtml(data.credit_name)}</a>\`;
              } else {
                artistName.innerHTML = escapeHtml(data.credit_name);
              }

              // Build social media link - only if available
              if (data.credit_social_handle && data.credit_platform) {
                const platformDisplay = data.credit_platform.charAt(0).toUpperCase() + data.credit_platform.slice(1);
                artistSocial.innerHTML = \`<a href="\${escapeHtml(data.credit_url || '#')}" target="_blank" rel="noopener noreferrer">@\${escapeHtml(data.credit_social_handle)} on \${escapeHtml(platformDisplay)}</a>\`;
              } else if (data.credit_url) {
                artistSocial.innerHTML = \`<a href="\${escapeHtml(data.credit_url)}" target="_blank" rel="noopener noreferrer">View Profile</a>\`;
              } else {
                artistSocial.innerHTML = '';
              }
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
      'Cache-Control': 'public, max-age=300'
    }
  });
}

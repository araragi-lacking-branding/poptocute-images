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
        * {
          box-sizing: border-box;
        }

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

        /* Tag Overlay - Bottom positioned */
        .tag-overlay {
          position: absolute;
          bottom: 0;
          left: 0;
          right: 0;
          background: linear-gradient(to top, rgba(0,0,0,0.75), transparent);
          padding: 2rem 1rem 1rem;
          opacity: 0;
          transform: translateY(10px);
          transition: opacity 0.3s ease, transform 0.3s ease;
          pointer-events: none;
        }

        .image-container:hover .tag-overlay,
        .image-container:focus-within .tag-overlay {
          opacity: 1;
          transform: translateY(0);
          pointer-events: auto;
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

        .disclaimer {
          font-size: 0.9rem;
          color: #444;
          text-align: center;
          max-width: 600px;
          line-height: 1.4;
          margin-top: 0.75rem;
        }

        .loading {
          position: absolute;
          top: 50%;
          left: 50%;
          transform: translate(-50%, -50%);
          color: #666;
          font-size: 0.9rem;
        }

        /* Accessibility - High Contrast Mode */
        @media (prefers-contrast: high) {
          .tag, .expand-btn {
            background: #fff;
            border: 2px solid #000;
          }
        }

        /* Responsive adjustments */
        @media (max-width: 600px) {
          .metadata-panel {
            max-height: 70vh;
            padding: 1rem;
          }

          .tag-preview {
            gap: 0.35rem;
          }

          .tag, .expand-btn {
            font-size: 0.75rem;
            padding: 0.2rem 0.6rem;
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
      <div class="image-container" role="img" aria-label="Random cute image">
        <div class="loading" aria-live="polite">Loading...</div>
        <img id="randomImage" alt="" loading="eager" />

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

      <div class="disclaimer">
        This website displays images that do not belong to us. We are working on adding proper attribution and reporting features.
      </div>

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
          const tagOverlay = document.getElementById('tagOverlay');
          const tagPreview = document.getElementById('tagPreview');
          const expandBtn = document.getElementById('expandBtn');
          const metadataContent = document.getElementById('metadataContent');

          try {
            const response = await fetch('/api/random', {cache: 'default'});
            if (!response.ok) throw new Error('Failed to fetch image');

            const data = await response.json();

            if (!data.filename) {
              throw new Error('No image available');
            }

            // Load image
            // Handle filenames that may or may not include 'images/' prefix
            const imagePath = data.filename.startsWith('images/')
              ? \`/\${data.filename}\`
              : \`/images/\${data.filename}\`;
            const tempImg = new Image();

            tempImg.onload = () => {
              img.src = tempImg.src;
              img.alt = data.alt_text || 'Random cute image';
              loadingEl.style.display = 'none';

              requestAnimationFrame(() => {
                img.classList.add('loaded');
              });
            };

            tempImg.onerror = () => {
              loadingEl.textContent = 'Failed to load image';
            };

            tempImg.src = imagePath;

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

        // Initialize
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

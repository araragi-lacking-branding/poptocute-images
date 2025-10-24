// src/index.js - D1-powered worker for cutetopop
export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);

    // API Routes
    if (url.pathname.startsWith('/api/')) {
      return handleAPI(request, env, url);
    }

    // Root path - serve the main page
    if (url.pathname === '/') {
      return serveMainPage(env);
    }

    // Static assets (images, favicon, etc.)
    return env.ASSETS.fetch(request);
  },
};

// ============================================
// API HANDLERS
// ============================================

async function handleAPI(request, env, url) {
  const path = url.pathname.replace('/api', '');
  
  // CORS headers for API requests
  const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
  };

  // Handle OPTIONS preflight
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

// Get random active image with metadata
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

    // Get tags for this image
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

// Get list of images with optional filters
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

// Get database statistics
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
// HTML PAGE GENERATION
// ============================================

async function serveMainPage(env) {
  // Pre-fetch first image to reduce perceived load time
  let initialImage = null;
  try {
    initialImage = await env.DB.prepare(`
      SELECT 
        i.id,
        i.filename,
        i.alt_text,
        c.name AS credit_name,
        c.url AS credit_url
      FROM images i
      LEFT JOIN credits c ON i.credit_id = c.id
      WHERE i.status = 'active'
      ORDER BY RANDOM()
      LIMIT 1
    `).first();
  } catch (error) {
    console.error('Error pre-fetching image:', error);
  }

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

        .container {
          text-align: center;
          max-width: 90%;
        }

        #randomImage {
          max-width: 100%;
          max-height: 70vh;
          border-radius: 12px;
          box-shadow: 0 6px 30px rgba(0,0,0,.15);
          opacity: 0;
          transition: opacity 0.3s ease;
        }

        #randomImage.loaded {
          opacity: 1;
        }

        .loading {
          color: #666;
          font-size: 1.1em;
          margin: 20px 0;
        }

        .image-info {
          margin-top: 20px;
          font-size: 0.9rem;
          color: #666;
        }

        .credit {
          margin: 10px 0;
          font-style: italic;
          color: #444;
        }

        .credit a {
          color: #0066cc;
          text-decoration: none;
        }

        .credit a:hover {
          text-decoration: underline;
        }

        .tags {
          display: flex;
          justify-content: center;
          flex-wrap: wrap;
          gap: 5px;
          margin: 10px 0;
        }

        .tag {
          background: #f0f0f0;
          padding: 3px 10px;
          border-radius: 15px;
          font-size: 0.8em;
          color: #555;
        }

        .controls {
          margin-top: 20px;
          display: flex;
          gap: 10px;
          justify-content: center;
          flex-wrap: wrap;
        }

        button {
          padding: 10px 20px;
          border: 1px solid #ddd;
          background: white;
          border-radius: 25px;
          cursor: pointer;
          font-family: inherit;
          font-size: 0.9em;
          transition: all 0.2s ease;
        }

        button:hover:not(:disabled) {
          background: #f5f5f5;
          border-color: #bbb;
        }

        button:disabled {
          opacity: 0.5;
          cursor: not-allowed;
        }

        .disclaimer {
          position: fixed;
          bottom: 0;
          left: 0;
          right: 0;
          padding: 15px;
          text-align: center;
          font-size: 0.8rem;
          color: #888;
          background: rgba(255,255,255,0.95);
          border-top: 1px solid #eee;
        }

        .error {
          color: #cc0000;
          margin: 20px 0;
        }

        @media (max-width: 600px) {
          body { padding: 0.5rem; }
          .controls { margin-top: 15px; }
          button { padding: 8px 16px; font-size: 0.85em; }
        }
      </style>
    </head>
    <body>
      <div class="container">
        <div id="loading" class="loading">Loading...</div>
        <div id="error" class="error" style="display: none;"></div>
        
        <div id="imageContainer" style="display: none;">
          <img id="randomImage" alt="Random cute image" />
          
          <div class="image-info">
            <div id="tags" class="tags"></div>
            <div id="credit" class="credit"></div>
            
            <div class="controls">
              <button onclick="loadNewImage()" id="nextBtn">Next Image</button>
            </div>
          </div>
        </div>
      </div>

      <div class="disclaimer">
        ※ Images displayed may not belong to this site. We are working on proper attribution.
        <br>Help us credit creators correctly!
      </div>

      <script>
        let currentImage = null;
        const INITIAL_IMAGE = ${initialImage ? JSON.stringify(initialImage) : 'null'};
        
        async function loadNewImage(useInitial = false) {
          const nextBtn = document.getElementById('nextBtn');
          const loading = document.getElementById('loading');
          const error = document.getElementById('error');
          const imageContainer = document.getElementById('imageContainer');
          const img = document.getElementById('randomImage');
          
          // Show loading state
          nextBtn.disabled = true;
          nextBtn.textContent = 'Loading...';
          loading.style.display = 'block';
          error.style.display = 'none';
          imageContainer.style.display = 'none';
          img.classList.remove('loaded');

          try {
            // Use pre-fetched initial image on first load
            if (useInitial && INITIAL_IMAGE) {
              currentImage = INITIAL_IMAGE;
            } else {
              const response = await fetch('/api/random');
              if (!response.ok) {
                throw new Error('Failed to fetch image');
              }
              currentImage = await response.json();
            }

            // Preload image
            const tempImg = new Image();
            tempImg.onload = () => {
              img.src = tempImg.src;
              img.alt = currentImage.alt_text || 'Random image';
              
              // Display tags
              const tagsContainer = document.getElementById('tags');
              tagsContainer.innerHTML = '';
              if (currentImage.tags && currentImage.tags.length > 0) {
                currentImage.tags.forEach(tag => {
                  const tagEl = document.createElement('span');
                  tagEl.className = 'tag';
                  tagEl.textContent = tag.display_name || tag.name;
                  tagsContainer.appendChild(tagEl);
                });
              }
              
              // Display credit
              const creditContainer = document.getElementById('credit');
              if (currentImage.credit_name && currentImage.credit_name !== 'Unknown Artist') {
                const creditText = currentImage.credit_url 
                  ? \`Credit: <a href="\${currentImage.credit_url}" target="_blank" rel="noopener">\${currentImage.credit_name}</a>\`
                  : \`Credit: \${currentImage.credit_name}\`;
                creditContainer.innerHTML = creditText;
              } else {
                creditContainer.innerHTML = 'Credit: Unknown - Help us find the creator!';
              }
              
              loading.style.display = 'none';
              imageContainer.style.display = 'block';
              
              setTimeout(() => {
                img.classList.add('loaded');
              }, 10);

              nextBtn.disabled = false;
              nextBtn.textContent = 'Next Image';
            };
            
            tempImg.onerror = () => {
              throw new Error('Failed to load image file');
            };
            
            tempImg.src = '/' + currentImage.filename;

          } catch (err) {
            console.error('Error loading image:', err);
            loading.style.display = 'none';
            error.textContent = 'Error loading image. Please try again.';
            error.style.display = 'block';
            nextBtn.disabled = false;
            nextBtn.textContent = 'Try Again';
          }
        }

        // Load initial image with pre-fetched data
        document.addEventListener('DOMContentLoaded', () => loadNewImage(true));

        // Keyboard navigation
        document.addEventListener('keydown', (e) => {
          if (e.code === 'Space' || e.code === 'ArrowRight') {
            e.preventDefault();
            const nextBtn = document.getElementById('nextBtn');
            if (!nextBtn.disabled) {
              loadNewImage();
            }
          }
        });
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
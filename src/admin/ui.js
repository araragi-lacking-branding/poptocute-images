// src/admin/ui.js
// Generates the admin tagging interface HTML

export function generateAdminUI(activeView = 'images') {
  const isImagesActive = activeView === 'images';
  const isArtistsActive = activeView === 'artists';
  
  return `
    <!DOCTYPE html>
    <html lang="en">
    <head>
      <meta charset="UTF-8" />
      <meta name="viewport" content="width=device-width, initial-scale=1.0" />
      <title>Admin - *cute* and *pop*</title>
      <link rel="icon" type="image/x-icon" href="/favicon.ico">
      <style>
        * {
          margin: 0;
          padding: 0;
          box-sizing: border-box;
        }

        body {
          font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
          background: #f5f5f5;
          color: #333;
          padding: 20px;
        }

        .header {
          background: white;
          padding: 20px;
          border-radius: 8px;
          box-shadow: 0 2px 4px rgba(0,0,0,0.1);
          margin-bottom: 20px;
        }

        .header h1 {
          font-size: 24px;
          margin-bottom: 15px;
        }

        .header .nav-tabs {
          display: flex;
          gap: 10px;
          margin-bottom: 15px;
        }

        .header .nav-tab {
          padding: 8px 16px;
          border: none;
          background: #f0f0f0;
          color: #666;
          border-radius: 6px 6px 0 0;
          cursor: pointer;
          font-size: 14px;
          font-weight: 500;
          transition: all 0.2s;
          text-decoration: none;
          display: inline-block;
        }

        .header .nav-tab:hover {
          background: #e0e0e0;
        }

        .header .nav-tab.active {
          background: white;
          color: #4ecdc4;
          font-weight: 600;
          border-bottom: 2px solid #4ecdc4;
        }

        .header .stats {
          display: flex;
          gap: 20px;
          font-size: 14px;
          color: #666;
        }

        .view-content {
          display: none;
        }

        .view-content.active {
          display: block;
        }

        .main-content {
          display: grid;
          grid-template-columns: 1fr 400px;
          gap: 20px;
        }

        .image-viewer {
          background: white;
          padding: 20px;
          border-radius: 8px;
          box-shadow: 0 2px 4px rgba(0,0,0,0.1);
        }

        .image-container {
          text-align: center;
          margin-bottom: 20px;
        }

        .image-container img {
          max-width: 100%;
          max-height: 500px;
          border-radius: 8px;
          box-shadow: 0 4px 12px rgba(0,0,0,0.15);
        }

        .image-info {
          margin-top: 15px;
          padding: 15px;
          background: #f9f9f9;
          border-radius: 6px;
          text-align: left;
        }

        .image-info dl {
          display: grid;
          grid-template-columns: 120px 1fr;
          gap: 8px;
          font-size: 14px;
        }

        .image-info dt {
          font-weight: 600;
          color: #666;
        }

        .image-info dd {
          color: #333;
        }

        .controls {
          display: flex;
          gap: 10px;
          margin-top: 15px;
        }

        .btn {
          padding: 10px 20px;
          border: none;
          border-radius: 6px;
          font-size: 14px;
          cursor: pointer;
          transition: all 0.2s;
        }

        .btn-primary {
          background: #4ecdc4;
          color: white;
        }

        .btn-primary:hover {
          background: #3db8af;
        }

        .btn-secondary {
          background: #f0f0f0;
          color: #333;
        }

        .btn-secondary:hover {
          background: #e0e0e0;
        }

        .tagging-panel {
          background: white;
          padding: 20px;
          border-radius: 8px;
          box-shadow: 0 2px 4px rgba(0,0,0,0.1);
          max-height: calc(100vh - 120px);
          overflow-y: auto;
        }

        .tagging-panel h2 {
          font-size: 18px;
          margin-bottom: 15px;
          color: #333;
        }

        .tag-category {
          margin-bottom: 25px;
        }

        .tag-category h3 {
          font-size: 14px;
          font-weight: 600;
          margin-bottom: 10px;
          padding: 8px 12px;
          border-radius: 4px;
          background: #f9f9f9;
        }

        .tag-category.content h3 { background: #e8f9f8; color: #2c8a83; }
        .tag-category.character h3 { background: #ebe9fe; color: #6c63c4; }
        .tag-category.creator h3 { background: #fed9e5; color: #c94373; }
        .tag-category.source h3 { background: #fef4e0; color: #d4a438; }

        .tag-list {
          display: flex;
          flex-wrap: wrap;
          gap: 8px;
          margin-top: 10px;
        }

        .tag {
          padding: 6px 12px;
          border-radius: 16px;
          font-size: 13px;
          border: 2px solid transparent;
          cursor: pointer;
          transition: all 0.2s;
          background: #f0f0f0;
          color: #666;
        }

        .tag:hover {
          background: #e0e0e0;
        }

        .tag.active {
          font-weight: 600;
          color: white;
        }

        .tag-category.content .tag.active { 
          background: #4ecdc4; 
          border-color: #3db8af;
        }
        .tag-category.character .tag.active { 
          background: #a29bfe; 
          border-color: #8882e8;
        }
        .tag-category.creator .tag.active { 
          background: #fd79a8; 
          border-color: #fc5c91;
        }
        .tag-category.source .tag.active { 
          background: #fdcb6e; 
          border-color: #f8b739;
        }

        .add-tag-form {
          margin-top: 10px;
          display: flex;
          gap: 8px;
        }

        .add-tag-form input {
          flex: 1;
          padding: 8px 12px;
          border: 1px solid #ddd;
          border-radius: 4px;
          font-size: 13px;
        }

        .add-tag-form button {
          padding: 8px 16px;
          background: #4ecdc4;
          color: white;
          border: none;
          border-radius: 4px;
          font-size: 13px;
          cursor: pointer;
        }

        .add-tag-form button:hover {
          background: #3db8af;
        }

        .credit-section {
          margin-top: 25px;
          padding-top: 25px;
          border-top: 1px solid #eee;
        }

        .credit-section h3 {
          font-size: 16px;
          margin-bottom: 15px;
        }

        .credit-form input, .credit-form select {
          width: 100%;
          padding: 10px;
          margin-bottom: 10px;
          border: 1px solid #ddd;
          border-radius: 4px;
          font-size: 14px;
        }

        .save-section {
          margin-top: 25px;
          padding-top: 25px;
          border-top: 1px solid #eee;
        }

        .btn-save {
          width: 100%;
          padding: 12px;
          background: #4ecdc4;
          color: white;
          border: none;
          border-radius: 6px;
          font-size: 16px;
          font-weight: 600;
          cursor: pointer;
          transition: all 0.2s;
        }

        .btn-save:hover {
          background: #3db8af;
        }

        @media (max-width: 1024px) {
          .main-content {
            grid-template-columns: 1fr;
          }
        }

        .upload-section {
          background: white;
          padding: 20px;
          border-radius: 8px;
          box-shadow: 0 2px 4px rgba(0,0,0,0.1);
          margin-bottom: 20px;
        }
        .upload-area {
          border: 2px dashed #ddd;
          border-radius: 8px;
          padding: 30px;
          text-align: center;
          cursor: pointer;
          transition: all 0.2s;
        }
        .upload-area:hover { border-color: #4ecdc4; background: #f9fffe; }
        .upload-text { font-size: 16px; font-weight: 600; margin-bottom: 8px; }
        .upload-hint { font-size: 13px; color: #999; }
        #preview-list { margin: 15px 0; font-size: 14px; text-align: left; }
        .upload-preview { display: flex; flex-direction: column; gap: 15px; align-items: center; }
        .upload-progress { padding: 20px; }
        .progress-bar { width: 100%; height: 8px; background: #f0f0f0; border-radius: 4px; overflow: hidden; margin-bottom: 10px; }
        .progress-fill { height: 100%; background: #4ecdc4; transition: width 0.3s; width: 0%; }
        #upload-status { font-size: 14px; color: #666; }

        /* Artist Management Styles */
        .artist-management {
          display: grid;
          grid-template-columns: 350px 1fr;
          gap: 20px;
        }

        .artist-list-panel {
          background: white;
          padding: 20px;
          border-radius: 8px;
          box-shadow: 0 2px 4px rgba(0,0,0,0.1);
          max-height: calc(100vh - 200px);
          overflow-y: auto;
        }

        .artist-list-panel h2 {
          font-size: 18px;
          margin-bottom: 15px;
        }

        .artist-search {
          width: 100%;
          padding: 10px;
          margin-bottom: 15px;
          border: 1px solid #ddd;
          border-radius: 6px;
          font-size: 14px;
        }

        .artist-filters {
          display: flex;
          gap: 8px;
          margin-bottom: 15px;
          flex-wrap: wrap;
        }

        .filter-chip {
          padding: 6px 12px;
          border-radius: 16px;
          font-size: 12px;
          border: 1px solid #ddd;
          background: white;
          cursor: pointer;
          transition: all 0.2s;
        }

        .filter-chip:hover {
          background: #f0f0f0;
        }

        .filter-chip.active {
          background: #4ecdc4;
          color: white;
          border-color: #4ecdc4;
        }

        .artist-item {
          padding: 12px;
          margin-bottom: 8px;
          border-radius: 6px;
          cursor: pointer;
          transition: all 0.2s;
          border: 1px solid #eee;
        }

        .artist-item:hover {
          background: #f9f9f9;
          border-color: #4ecdc4;
        }

        .artist-item.selected {
          background: #e8f9f8;
          border-color: #4ecdc4;
        }

        .artist-item-header {
          display: flex;
          align-items: center;
          gap: 10px;
          margin-bottom: 4px;
        }

        .artist-avatar {
          width: 32px;
          height: 32px;
          border-radius: 50%;
          background: #f0f0f0;
          object-fit: cover;
        }

        .artist-name {
          font-weight: 600;
          font-size: 14px;
          flex: 1;
        }

        .artist-badge {
          font-size: 12px;
          padding: 2px 8px;
          border-radius: 12px;
          background: #4ecdc4;
          color: white;
        }

        .artist-badge.featured {
          background: #fdcb6e;
        }

        .artist-meta {
          font-size: 12px;
          color: #999;
          margin-left: 42px;
        }

        .artist-detail-panel {
          background: white;
          padding: 20px;
          border-radius: 8px;
          box-shadow: 0 2px 4px rgba(0,0,0,0.1);
          max-height: calc(100vh - 200px);
          overflow-y: auto;
        }

        .artist-form {
          display: flex;
          flex-direction: column;
          gap: 15px;
        }

        .form-group {
          display: flex;
          flex-direction: column;
          gap: 5px;
        }

        .form-group label {
          font-size: 13px;
          font-weight: 600;
          color: #666;
        }

        .form-group input,
        .form-group textarea,
        .form-group select {
          padding: 10px;
          border: 1px solid #ddd;
          border-radius: 6px;
          font-size: 14px;
          font-family: inherit;
        }

        .form-group textarea {
          min-height: 80px;
          resize: vertical;
        }

        .form-row {
          display: grid;
          grid-template-columns: 1fr 1fr;
          gap: 15px;
        }

        .checkbox-group {
          display: flex;
          align-items: center;
          gap: 8px;
        }

        .checkbox-group input[type="checkbox"] {
          width: 18px;
          height: 18px;
          cursor: pointer;
        }

        .artist-tags-section {
          border-top: 1px solid #eee;
          padding-top: 15px;
          margin-top: 15px;
        }

        .artist-tags-list {
          display: flex;
          flex-wrap: wrap;
          gap: 8px;
          margin-top: 10px;
        }

        .artist-tag {
          padding: 6px 12px;
          border-radius: 16px;
          font-size: 12px;
          background: #fd79a8;
          color: white;
          display: flex;
          align-items: center;
          gap: 6px;
        }

        .artist-tag button {
          background: none;
          border: none;
          color: white;
          cursor: pointer;
          font-size: 14px;
          padding: 0;
          line-height: 1;
        }

        .artist-images-section {
          border-top: 1px solid #eee;
          padding-top: 15px;
          margin-top: 15px;
        }

        .artist-images-grid {
          display: grid;
          grid-template-columns: repeat(auto-fill, minmax(100px, 100px));
          gap: 8px;
          margin-top: 10px;
          max-width: 100%;
        }

        .artist-image-thumb {
          width: 100%;
          height: 100px;
          border-radius: 6px;
          object-fit: cover;
          border: 2px solid transparent;
          cursor: pointer;
          transition: all 0.2s;
        }

        .artist-image-thumb:hover {
          border-color: #4ecdc4;
        }

        .form-actions {
          display: flex;
          gap: 10px;
          padding-top: 15px;
          border-top: 1px solid #eee;
        }

        .btn-danger {
          background: #ff6b6b;
          color: white;
        }

        .btn-danger:hover {
          background: #ee5a52;
        }

        .empty-state {
          text-align: center;
          padding: 40px 20px;
          color: #999;
        }

        .empty-state h3 {
          font-size: 16px;
          margin-bottom: 8px;
        }

        .empty-state p {
          font-size: 14px;
        }
      </style>
    </head>
    <body>
      <div class="header">
        <h1>*cute* and *pop* — Admin</h1>
        <div class="nav-tabs">
          <a href="/admin/images" class="nav-tab ${isImagesActive ? 'active' : ''}">📸 Images & Tags</a>
          <a href="/admin/artists" class="nav-tab ${isArtistsActive ? 'active' : ''}">👤 Artist Profiles</a>
        </div>
        <div class="stats">
          <span id="stat-images">Loading...</span>
          <span id="stat-tags">Loading...</span>
          <span id="stat-credits">Loading...</span>
          <span id="stat-artists">Loading...</span>
          <button class="btn btn-primary" onclick="syncDatabase()" id="sync-button" style="margin-left: 20px;">Sync DB</button>
          <span id="sync-status" style="margin-left: 10px; font-size: 12px;"></span>
        </div>
      </div>

      <!-- Images View -->
      <div id="view-images" class="view-content ${isImagesActive ? 'active' : ''}">

      <div class="main-content">
        <div class="image-viewer">
          <div class="image-container">
            <img id="current-image" alt="Loading..." />
          </div>
          
          <div class="image-info" id="image-info">
            <dl>
              <dt>Filename:</dt>
              <dd id="info-filename">—</dd>
              <dt>Size:</dt>
              <dd id="info-size">—</dd>
              <dt>Dimensions:</dt>
              <dd id="info-dimensions">—</dd>
              <dt>Status:</dt>
              <dd id="info-status">—</dd>
            </dl>
          </div>

          <div class="controls">
            <button class="btn btn-primary" onclick="loadNextImage()">Next Image →</button>
            <button class="btn btn-secondary" onclick="loadPreviousImage()">← Previous</button>
            <button class="btn btn-secondary" onclick="skipToRandom()">Random ⟳</button>
          </div>
        </div>

        
        <div class="upload-section">
          <h2>📤 Upload New Images</h2>
          <div class="upload-area" id="upload-area">
            <input type="file" id="file-input" accept="image/*" multiple style="display: none;" />
            <div class="upload-placeholder" id="upload-placeholder">
              <p class="upload-text">Tap or click to select images</p>
              <p class="upload-hint">JPG, PNG, GIF, WEBP • Max 10MB each • Up to 20 files</p>
            </div>
            <div class="upload-preview" id="upload-preview" style="display: none;">
              <div id="preview-list"></div>
              <button class="btn btn-secondary" onclick="cancelUpload()">Cancel</button>
              <button class="btn btn-primary" onclick="uploadImages()">Upload</button>
            </div>
            <div class="upload-progress" id="upload-progress" style="display: none;">
              <div class="progress-bar"><div class="progress-fill" id="progress-fill"></div></div>
              <p id="upload-status">Uploading...</p>
            </div>
          </div>
        </div>
<div class="tagging-panel" id="tagging-panel">
          <h2>Tags & Attribution</h2>
          
          <div class="tag-category content">
            <h3>Content</h3>
            <div class="tag-list" id="tags-content"></div>
            <div class="add-tag-form">
              <input type="text" placeholder="Add new content tag..." id="new-tag-content" />
              <button onclick="addNewTag('content')">+</button>
            </div>
          </div>

          <div class="tag-category character">
            <h3>Character</h3>
            <div class="tag-list" id="tags-character"></div>
            <div class="add-tag-form">
              <input type="text" placeholder="Add new character tag..." id="new-tag-character" />
              <button onclick="addNewTag('character')">+</button>
            </div>
          </div>

          <div class="tag-category creator">
            <h3>Creator</h3>
            <div class="tag-list" id="tags-creator"></div>
            <div class="add-tag-form">
              <input type="text" placeholder="Add new creator tag..." id="new-tag-creator" />
              <button onclick="addNewTag('creator')">+</button>
            </div>
          </div>

          <div class="tag-category source">
            <h3>Source</h3>
            <div class="tag-list" id="tags-source"></div>
            <div class="add-tag-form">
              <input type="text" placeholder="Add new source tag..." id="new-tag-source" />
              <button onclick="addNewTag('source')">+</button>
            </div>
          </div>

          <div class="credit-section">
            <h3>Credit Attribution</h3>
            <div class="credit-form">
              <input type="text" id="credit-name" placeholder="Artist/Creator Name" />
              <input type="url" id="credit-url" placeholder="Profile URL (optional)" />
              <input type="text" id="credit-social" placeholder="Social Handle (optional)" />
              <select id="credit-platform">
                <option value="">Select Platform</option>
                <option value="twitter">Twitter/X</option>
                <option value="pixiv">Pixiv</option>
                <option value="instagram">Instagram</option>
                <option value="artstation">ArtStation</option>
                <option value="deviantart">DeviantArt</option>
                <option value="other">Other</option>
              </select>
              <select id="credit-license">
                <option value="Unknown">License Unknown</option>
                <option value="All Rights Reserved">All Rights Reserved</option>
                <option value="CC BY">CC BY</option>
                <option value="CC BY-SA">CC BY-SA</option>
                <option value="CC BY-NC">CC BY-NC</option>
                <option value="CC BY-NC-SA">CC BY-NC-SA</option>
                <option value="Public Domain">Public Domain</option>
              </select>
            </div>
          </div>

          <div class="save-section">
            <button class="btn-save" onclick="saveImageMetadata()">💾 Save Changes</button>
          </div>
        </div>
      </div>
      </div>

      <!-- Artists View -->
      <div id="view-artists" class="view-content ${isArtistsActive ? 'active' : ''}">
        <div class="artist-management">
          <div class="artist-list-panel">
            <h2>Artist Profiles</h2>
            <input type="text" class="artist-search" id="artist-search" placeholder="Search artists..." />
            
            <div class="artist-filters">
              <button class="filter-chip active" data-filter="all" onclick="filterArtists('all')">All</button>
              <button class="filter-chip" data-filter="verified" onclick="filterArtists('verified')">✓ Verified</button>
              <button class="filter-chip" data-filter="featured" onclick="filterArtists('featured')">⭐ Featured</button>
            </div>

            <button class="btn btn-primary" onclick="createNewArtist()" style="width: 100%; margin-bottom: 15px;">
              + New Artist Profile
            </button>

            <div id="artist-list">
              <div class="empty-state">
                <h3>No artists yet</h3>
                <p>Create your first artist profile</p>
              </div>
            </div>
          </div>

          <div class="artist-detail-panel">
            <div id="artist-detail-content">
              <div class="empty-state">
                <h3>Select an artist</h3>
                <p>Choose an artist from the list or create a new one</p>
              </div>
            </div>
          </div>
        </div>
      </div>

      <script>
        let currentImageId = null;
        let allImages = [];
        let currentIndex = 0;
        let allTags = {};
        let activeTags = new Set();

        document.addEventListener('DOMContentLoaded', async () => {
          await loadStats();
          
          // Load data based on active view
          const artistsView = document.getElementById('view-artists');
          if (artistsView && artistsView.classList.contains('active')) {
            // On artists page
            await loadArtists();
          } else {
            // On images page
            await loadAllTags();
            await loadImageList();
            await loadImage();
          }
        });

        async function loadStats() {
          try {
            const response = await fetch('/api/stats');
            const stats = await response.json();
            document.getElementById('stat-images').textContent = \`Images: \${stats.total_images}\`;
            document.getElementById('stat-tags').textContent = \`Tags: \${stats.total_tags}\`;
            document.getElementById('stat-credits').textContent = \`Credits: \${stats.credited_artists}\`;
            document.getElementById('stat-artists').textContent = \`Artists: \${stats.total_artists}\`;
          } catch (error) {
            console.error('Failed to load stats:', error);
          }
        }

        async function loadAllTags() {
          try {
            const response = await fetch('/api/admin/tags');
            allTags = await response.json();
            renderTagLists();
          } catch (error) {
            console.error('Failed to load tags:', error);
          }
        }

        function renderTagLists() {
          ['content', 'character', 'creator', 'source'].forEach(category => {
            const container = document.getElementById(\`tags-\${category}\`);
            const tags = allTags[category] || [];
            
            container.innerHTML = tags.map(tag => 
              \`<span class="tag" data-tag-id="\${tag.id}" onclick="toggleTag(\${tag.id}, '\${category}')">\${tag.display_name || tag.name}</span>\`
            ).join('');
          });
        }

        function toggleTag(tagId, category) {
          const tagElement = document.querySelector(\`[data-tag-id="\${tagId}"]\`);
          tagElement.classList.toggle('active');
          
          if (activeTags.has(tagId)) {
            activeTags.delete(tagId);
          } else {
            activeTags.add(tagId);
          }
        }

        async function addNewTag(category) {
          const input = document.getElementById(\`new-tag-\${category}\`);
          const tagName = input.value.trim();
          
          if (!tagName) return;
          
          try {
            const response = await fetch('/api/admin/tags', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ name: tagName, category })
            });
            
            if (response.ok) {
              input.value = '';
              await loadAllTags();
            }
          } catch (error) {
            console.error('Failed to add tag:', error);
          }
        }

        async function loadImageList() {
          try {
            const response = await fetch('/api/images?limit=1000');
            const data = await response.json();
            allImages = data.images;
          } catch (error) {
            console.error('Failed to load image list:', error);
          }
        }

        async function loadImage() {
          if (allImages.length === 0) return;
          
          const image = allImages[currentIndex];
          currentImageId = image.id;
          
          try {
            const response = await fetch(\`/api/admin/images/\${currentImageId}\`);
            const data = await response.json();
            
            document.getElementById('current-image').src = '/' + data.filename;
            document.getElementById('info-filename').textContent = data.filename;
            document.getElementById('info-size').textContent = formatFileSize(data.file_size);
            document.getElementById('info-dimensions').textContent = 
              data.width && data.height ? \`\${data.width} × \${data.height}\` : '—';
            document.getElementById('info-status').textContent = data.status;
            
            activeTags.clear();
            (data.tags || []).forEach(tag => activeTags.add(tag.id));
            updateActiveTagsUI();
            
            document.getElementById('credit-name').value = data.credit_name || '';
            document.getElementById('credit-url').value = data.credit_url || '';
            document.getElementById('credit-social').value = data.credit_social || '';
            document.getElementById('credit-platform').value = data.credit_platform || '';
            document.getElementById('credit-license').value = data.credit_license || 'Unknown';
            
          } catch (error) {
            console.error('Failed to load image:', error);
          }
        }

        function updateActiveTagsUI() {
          document.querySelectorAll('.tag').forEach(el => {
            const tagId = parseInt(el.dataset.tagId);
            if (activeTags.has(tagId)) {
              el.classList.add('active');
            } else {
              el.classList.remove('active');
            }
          });
        }

        function loadNextImage() {
          currentIndex = (currentIndex + 1) % allImages.length;
          loadImage();
        }

        function loadPreviousImage() {
          currentIndex = (currentIndex - 1 + allImages.length) % allImages.length;
          loadImage();
        }

        function skipToRandom() {
          currentIndex = Math.floor(Math.random() * allImages.length);
          loadImage();
        }

        async function saveImageMetadata() {
          if (!currentImageId) return;
          
          const data = {
            tags: Array.from(activeTags),
            credit: {
              name: document.getElementById('credit-name').value,
              url: document.getElementById('credit-url').value,
              social_handle: document.getElementById('credit-social').value,
              platform: document.getElementById('credit-platform').value,
              license: document.getElementById('credit-license').value
            }
          };
          
          try {
            const response = await fetch(\`/api/admin/images/\${currentImageId}\`, {
              method: 'PUT',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify(data)
            });
            
            if (response.ok) {
              alert('✓ Saved successfully!');
              loadStats();
            } else {
              alert('Failed to save changes');
            }
          } catch (error) {
            console.error('Failed to save:', error);
            alert('Error saving changes');
          }
        }

        function formatFileSize(bytes) {
          if (!bytes) return '—';
          if (bytes < 1024) return bytes + ' B';
          if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
          return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
        }

        let selectedFiles = [];
        const MAX_FILES = 20;
        
        document.getElementById('upload-area').addEventListener('click', function() {
          document.getElementById('file-input').click();
        });
        
        document.getElementById('file-input').addEventListener('change', function(e) {
          handleFiles(Array.from(e.target.files));
        });
        
        function handleFiles(files) {
          if (files.length > MAX_FILES) {
            alert('Maximum 20 files allowed');
            return;
          }
          
          var valid = files.filter(function(f) {
            if (!f.type.startsWith('image/')) return false;
            if (f.size > 10 * 1024 * 1024) return false;
            return true;
          });
          
          if (valid.length === 0) {
            alert('No valid images selected');
            return;
          }
          
          selectedFiles = valid;
          document.getElementById('preview-list').textContent = valid.length + ' file(s) selected';
          document.getElementById('upload-placeholder').style.display = 'none';
          document.getElementById('upload-preview').style.display = 'block';
        }
        
        function cancelUpload() {
          selectedFiles = [];
          document.getElementById('file-input').value = '';
          document.getElementById('upload-placeholder').style.display = 'block';
          document.getElementById('upload-preview').style.display = 'none';
        }
        
        async function uploadImages() {
          if (selectedFiles.length === 0) return;
          
          document.getElementById('upload-preview').style.display = 'none';
          document.getElementById('upload-progress').style.display = 'block';
          
          var uploaded = 0;
          for (var i = 0; i < selectedFiles.length; i++) {
            document.getElementById('progress-fill').style.width = ((i / selectedFiles.length) * 100) + '%';
            document.getElementById('upload-status').textContent = 'Uploading ' + (i + 1) + ' of ' + selectedFiles.length;
            
            var formData = new FormData();
            formData.append('file', selectedFiles[i]);
            
            try {
              var res = await fetch('/api/admin/upload', { method: 'POST', body: formData });
              if (res.ok) uploaded++;
            } catch (e) { 
              console.error('Upload error:', e); 
            }
          }
          
          document.getElementById('progress-fill').style.width = '100%';
          document.getElementById('upload-status').textContent = 'Uploaded ' + uploaded + ' of ' + selectedFiles.length + ' images';
          
          await loadImageList();
          await loadStats();
          
          setTimeout(function() {
            cancelUpload();
            document.getElementById('upload-progress').style.display = 'none';
            document.getElementById('upload-placeholder').style.display = 'block';
            document.getElementById('progress-fill').style.width = '0%';
          }, 2000);
        }
        async function syncDatabase() {
          const button = document.getElementById('sync-button');
          const status = document.getElementById('sync-status');
          
          button.disabled = true;
          button.textContent = 'Syncing...';
          status.textContent = 'Working...';
          
          try {
            const response = await fetch('/api/admin/sync', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' }
            });
            
            const result = await response.json();
            
            if (response.ok) {
              status.textContent = 'Synced ' + result.count + ' images';
              status.style.color = '#388e3c';
              await loadStats();
            } else {
              status.textContent = 'Failed';
              status.style.color = '#c62828';
            }
          } catch (error) {
            console.error('Sync error:', error);
            status.textContent = 'Error';
            status.style.color = '#c62828';
          } finally {
            button.disabled = false;
            button.textContent = 'Sync DB';
          }
        }

        // Artist Management
        let allArtists = [];
        let selectedArtistId = null;
        let currentFilter = 'all';
        let allCreatorTags = [];

        async function loadArtists() {
          try {
            const response = await fetch('/api/admin/artists');
            const data = await response.json();
            allArtists = data.artists || data; // Handle both {artists: []} and [] responses
            
            // Load creator tags for linking
            const tagsResponse = await fetch('/api/admin/tags');
            const allTagsData = await tagsResponse.json();
            allCreatorTags = allTagsData.creator || [];
            
            renderArtistList();
          } catch (error) {
            console.error('Failed to load artists:', error);
          }
        }

        function filterArtists(filter) {
          currentFilter = filter;
          
          // Update filter chips
          document.querySelectorAll('.filter-chip').forEach(chip => {
            chip.classList.toggle('active', chip.dataset.filter === filter);
          });
          
          renderArtistList();
        }

        function renderArtistList() {
          let filtered = allArtists;
          
          // Apply filters
          if (currentFilter === 'verified') {
            filtered = allArtists.filter(a => a.verified === 1);
          } else if (currentFilter === 'featured') {
            filtered = allArtists.filter(a => a.featured === 1);
          }
          
          // Apply search
          const searchTerm = (document.getElementById('artist-search')?.value || '').toLowerCase();
          if (searchTerm) {
            filtered = filtered.filter(a => 
              (a.name || '').toLowerCase().includes(searchTerm) ||
              (a.display_name || '').toLowerCase().includes(searchTerm) ||
              (a.bio || '').toLowerCase().includes(searchTerm)
            );
          }
          
          const container = document.getElementById('artist-list');
          
          if (filtered.length === 0) {
            container.innerHTML = '<div class="empty-state"><h3>No artists found</h3><p>Try adjusting your filters</p></div>';
            return;
          }
          
          container.innerHTML = filtered.map(artist => \`
            <div class="artist-item \${selectedArtistId === artist.id ? 'selected' : ''}" onclick="selectArtist(\${artist.id})">
              <div class="artist-item-header">
                \${artist.avatar_url ? 
                  \`<img src="\${artist.avatar_url}" class="artist-avatar" alt="\${artist.display_name || artist.name}" />\` :
                  \`<div class="artist-avatar"></div>\`
                }
                <span class="artist-name">\${artist.display_name || artist.name}</span>
                \${artist.verified ? '<span class="artist-badge">✓</span>' : ''}
                \${artist.featured ? '<span class="artist-badge featured">⭐</span>' : ''}
              </div>
              <div class="artist-meta">\${artist.images_count || 0} images</div>
            </div>
          \`).join('');
        }

        async function selectArtist(artistId) {
          selectedArtistId = artistId;
          renderArtistList();
          
          try {
            const response = await fetch(\`/api/admin/artists/\${artistId}\`);
            const data = await response.json();
            const artist = data.artist || data; // Handle both {artist: {}} and {} responses
            
            // Get artist's images
            const imagesResponse = await fetch(\`/api/admin/artists/\${artistId}/images\`);
            const imagesData = await imagesResponse.json();
            const images = imagesData.images || imagesData; // Handle both {images: []} and [] responses
            
            renderArtistDetail(artist, images);
          } catch (error) {
            console.error('Failed to load artist details:', error);
          }
        }

        function renderArtistDetail(artist, images) {
          const container = document.getElementById('artist-detail-content');
          
          container.innerHTML = \`
            <h2>\${artist.id ? 'Edit' : 'New'} Artist Profile</h2>
            <form class="artist-form" onsubmit="saveArtist(event)">
              <div class="form-row">
                <div class="form-group">
                  <label>Internal Name *</label>
                  <input type="text" id="artist-name" value="\${artist.name || ''}" required placeholder="lowercase-slug" />
                </div>
                <div class="form-group">
                  <label>Display Name *</label>
                  <input type="text" id="artist-display-name" value="\${artist.display_name || ''}" required placeholder="Display Name" />
                </div>
              </div>

              <div class="form-group">
                <label>Bio</label>
                <textarea id="artist-bio" placeholder="Short bio about the artist...">\${artist.bio || ''}</textarea>
              </div>

              <div class="form-group">
                <label>Avatar URL</label>
                <input type="url" id="artist-avatar" value="\${artist.avatar_url || ''}" placeholder="https://..." />
              </div>

              <div class="form-row">
                <div class="form-group">
                  <label>Website</label>
                  <input type="url" id="artist-website" value="\${artist.website_url || ''}" placeholder="https://..." />
                </div>
                <div class="form-group">
                  <label>Twitter</label>
                  <input type="text" id="artist-twitter" value="\${artist.twitter_handle || ''}" placeholder="@username" />
                </div>
              </div>

              <div class="form-row">
                <div class="form-group">
                  <label>Pixiv ID</label>
                  <input type="text" id="artist-pixiv" value="\${artist.pixiv_id || ''}" placeholder="12345678" />
                </div>
                <div class="form-group">
                  <label>Instagram</label>
                  <input type="text" id="artist-instagram" value="\${artist.instagram_handle || ''}" placeholder="@username" />
                </div>
              </div>

              <div class="form-row">
                <div class="form-group">
                  <label>DeviantArt</label>
                  <input type="text" id="artist-deviantart" value="\${artist.deviantart_username || ''}" placeholder="username" />
                </div>
                <div class="form-group">
                  <label>ArtStation</label>
                  <input type="text" id="artist-artstation" value="\${artist.artstation_username || ''}" placeholder="username" />
                </div>
              </div>

              <div class="form-row">
                <div class="checkbox-group">
                  <input type="checkbox" id="artist-verified" \${artist.verified ? 'checked' : ''} />
                  <label for="artist-verified">✓ Verified Artist</label>
                </div>
                <div class="checkbox-group">
                  <input type="checkbox" id="artist-featured" \${artist.featured ? 'checked' : ''} />
                  <label for="artist-featured">⭐ Featured Artist</label>
                </div>
              </div>

              <div class="artist-tags-section">
                <h3>Creator Tags</h3>
                <div class="artist-tags-list" id="artist-tags-list">
                  \${(artist.tags || []).map(tag => \`
                    <span class="artist-tag">
                      \${tag.display_name || tag.name}
                      <button type="button" onclick="unlinkTag(\${artist.id}, \${tag.id})">×</button>
                    </span>
                  \`).join('')}
                </div>
                <div class="add-tag-form">
                  <select id="artist-tag-select">
                    <option value="">Link to creator tag...</option>
                    \${allCreatorTags.filter(tag => 
                      !(artist.tags || []).some(t => t.id === tag.id)
                    ).map(tag => \`
                      <option value="\${tag.id}">\${tag.display_name || tag.name}</option>
                    \`).join('')}
                  </select>
                  <button type="button" onclick="linkTag(\${artist.id})">Link</button>
                </div>
              </div>

              <div class="artist-images-section">
                <h3>Images (\${images.length})</h3>
                <div class="artist-images-grid">
                  \${images.map(img => \`
                    <img src="/\${img.filename}" class="artist-image-thumb" alt="" title="\${img.filename}" />
                  \`).join('')}
                </div>
              </div>

              <div class="form-actions">
                <button type="submit" class="btn btn-primary">💾 Save Artist</button>
                \${artist.id ? \`<button type="button" class="btn btn-danger" onclick="deleteArtist(\${artist.id})">🗑️ Delete</button>\` : ''}
                <button type="button" class="btn btn-secondary" onclick="cancelArtistEdit()">Cancel</button>
              </div>
            </form>
          \`;
        }

        function createNewArtist() {
          selectedArtistId = null;
          renderArtistDetail({}, []);
        }

        function cancelArtistEdit() {
          selectedArtistId = null;
          renderArtistList();
          document.getElementById('artist-detail-content').innerHTML = \`
            <div class="empty-state">
              <h3>Select an artist</h3>
              <p>Choose an artist from the list or create a new one</p>
            </div>
          \`;
        }

        async function saveArtist(event) {
          event.preventDefault();
          
          const artistData = {
            name: document.getElementById('artist-name').value.trim(),
            display_name: document.getElementById('artist-display-name').value.trim(),
            bio: document.getElementById('artist-bio').value.trim() || null,
            avatar_url: document.getElementById('artist-avatar').value.trim() || null,
            website_url: document.getElementById('artist-website').value.trim() || null,
            twitter_handle: document.getElementById('artist-twitter').value.trim() || null,
            pixiv_id: document.getElementById('artist-pixiv').value.trim() || null,
            instagram_handle: document.getElementById('artist-instagram').value.trim() || null,
            deviantart_username: document.getElementById('artist-deviantart').value.trim() || null,
            artstation_username: document.getElementById('artist-artstation').value.trim() || null,
            verified: document.getElementById('artist-verified').checked ? 1 : 0,
            featured: document.getElementById('artist-featured').checked ? 1 : 0
          };

          try {
            const url = selectedArtistId 
              ? \`/api/admin/artists/\${selectedArtistId}\`
              : '/api/admin/artists';
            
            const method = selectedArtistId ? 'PUT' : 'POST';
            
            const response = await fetch(url, {
              method,
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify(artistData)
            });

            if (response.ok) {
              const result = await response.json();
              alert(selectedArtistId ? 'Artist updated!' : 'Artist created!');
              await loadArtists();
              if (!selectedArtistId) {
                selectArtist(result.id);
              }
            } else {
              const error = await response.json();
              alert('Error: ' + error.error);
            }
          } catch (error) {
            console.error('Save error:', error);
            alert('Failed to save artist');
          }
        }

        async function linkTag(artistId) {
          const tagId = document.getElementById('artist-tag-select').value;
          if (!tagId) return;

          try {
            const response = await fetch(\`/api/admin/artists/\${artistId}/tags/\${tagId}\`, {
              method: 'POST'
            });

            if (response.ok) {
              await selectArtist(artistId);
            } else {
              alert('Failed to link tag');
            }
          } catch (error) {
            console.error('Link tag error:', error);
          }
        }

        async function unlinkTag(artistId, tagId) {
          if (!confirm('Unlink this tag from the artist?')) return;

          try {
            const response = await fetch(\`/api/admin/artists/\${artistId}/tags/\${tagId}\`, {
              method: 'DELETE'
            });

            if (response.ok) {
              await selectArtist(artistId);
            } else {
              alert('Failed to unlink tag');
            }
          } catch (error) {
            console.error('Unlink tag error:', error);
          }
        }

        async function deleteArtist(artistId) {
          if (!confirm('Are you sure you want to delete this artist profile? This will not delete their images.')) {
            return;
          }

          try {
            const response = await fetch(\`/api/admin/artists/\${artistId}\`, {
              method: 'DELETE'
            });

            if (response.ok) {
              alert('Artist deleted');
              await loadArtists();
              cancelArtistEdit();
            } else {
              alert('Failed to delete artist');
            }
          } catch (error) {
            console.error('Delete error:', error);
          }
        }

        // Add search event listener
        document.addEventListener('DOMContentLoaded', () => {
          const searchInput = document.getElementById('artist-search');
          if (searchInput) {
            searchInput.addEventListener('input', renderArtistList);
          }
        });
      </script>
    </body>
    </html>
  `;
}


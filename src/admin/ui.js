// src/admin/ui.js
// Generates the admin tagging interface HTML

export function generateAdminUI() {
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
          margin-bottom: 10px;
        }

        .header .stats {
          display: flex;
          gap: 20px;
          font-size: 14px;
          color: #666;
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
      </style>
    </head>
    <body>
      <div class="header">
        <h1>*cute* and *pop* — Admin</h1>
        <div class="stats">
          <span id="stat-images">Loading...</span>
          <span id="stat-tags">Loading...</span>
          <span id="stat-credits">Loading...</span>
        </div>
      </div>

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

      <script>
        let currentImageId = null;
        let allImages = [];
        let currentIndex = 0;
        let allTags = {};
        let activeTags = new Set();

        document.addEventListener('DOMContentLoaded', async () => {
          await loadStats();
          await loadAllTags();
          await loadImageList();
          await loadImage();
        });

        async function loadStats() {
          try {
            const response = await fetch('/api/stats');
            const stats = await response.json();
            document.getElementById('stat-images').textContent = \`Images: \${stats.total_images}\`;
            document.getElementById('stat-tags').textContent = \`Tags: \${stats.total_tags}\`;
            document.getElementById('stat-credits').textContent = \`Credits: \${stats.credited_artists}\`;
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
      </script>
    </body>
    </html>
  `;
}
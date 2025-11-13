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
              <span class="metadata-value">\${data.credit_url ? \`<a href="\${escapeHtml(data.credit_url)}" target="_blank" rel="noopener noreferrer">\${escapeHtml(data.credit_name)}</a>\` : escapeHtml(data.credit_name)}</span>
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

            // When we have SSR data, the browser already has a preload hint from HTML
            // So we can directly set src/srcset on the img element for faster display
            if (INITIAL_IMAGE_DATA && data.urls) {
              // Browser already started fetching via preload - just set the img attributes
              img.srcset = \`
                \${data.urls.mobile} 640w,
                \${data.urls.tablet} 1024w,
                \${data.urls.desktop} 1920w
              \`.trim();
              // Sizes should match CSS: 95vw mobile, 90vw tablet, 85vw desktop
              img.sizes = '(max-width: 768px) 95vw, (max-width: 1200px) 90vw, 85vw';
              img.src = data.urls.optimized;

              // Use decode() for smooth rendering if available
              if (img.decode) {
                img.decode()
                  .then(() => {
                    img.classList.add('loaded');
                  })
                  .catch(() => {
                    // Decode failed, just show the image anyway
                    img.classList.add('loaded');
                  });
              } else {
                // Older browsers - use onload event
                img.onload = () => img.classList.add('loaded');
              }
            } else {
              // No SSR data - need to preload manually
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
                // Sizes should match CSS: 95vw mobile, 90vw tablet, 85vw desktop
                preloadImage.sizes = '(max-width: 768px) 95vw, (max-width: 1200px) 90vw, 85vw';
                preloadImage.src = data.urls.optimized;
              } else {
                // Legacy fallback if urls field not present
                const imagePath = data.filename.startsWith('images/') ? \`/\${data.filename}\` : \`/images/\${data.filename}\`;
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
                })
                .catch((error) => {
                  // Image failed to load
                  console.error('Image load error:', error);
                  loadingEl.textContent = 'Failed to load image';
                  loadingEl.style.display = 'block';
                });
            }

            // Pre-warm Cloudflare cache for next random image (performance optimization)
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
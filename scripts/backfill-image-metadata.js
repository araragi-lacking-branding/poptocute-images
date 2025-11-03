// scripts/backfill-image-metadata.js
// Backfill metadata (dimensions, format, etc.) for existing images in R2
// Usage: node scripts/backfill-image-metadata.js [--dry-run] [--limit=N]

/**
 * Extract image dimensions by parsing file headers
 * Identical to upload.js getImageDimensionsSync()
 */
function getImageDimensionsSync(buffer) {
  try {
    const view = new DataView(buffer);
    
    // PNG (starts with 0x89504E47)
    if (view.getUint32(0, false) === 0x89504E47) {
      return {
        width: view.getUint32(16, false),
        height: view.getUint32(20, false),
        format: 'PNG'
      };
    }
    
    // JPEG (starts with 0xFFD8)
    if (view.getUint16(0, false) === 0xFFD8) {
      let offset = 2;
      while (offset < view.byteLength - 8) {
        if (view.getUint8(offset) !== 0xFF) break;
        const marker = view.getUint8(offset + 1);
        const size = view.getUint16(offset + 2, false);
        
        // SOF markers
        if (marker >= 0xC0 && marker <= 0xCF && 
            marker !== 0xC4 && marker !== 0xC8 && marker !== 0xCC) {
          return {
            height: view.getUint16(offset + 5, false),
            width: view.getUint16(offset + 7, false),
            format: 'JPEG'
          };
        }
        offset += 2 + size;
      }
    }
    
    // GIF (starts with GIF87a or GIF89a)
    const gifHeader = new Uint8Array(buffer, 0, 6);
    const gifString = String.fromCharCode(...gifHeader);
    if (gifString.startsWith('GIF')) {
      // Check if animated (look for NETSCAPE2.0 extension)
      const isAnimated = checkGifAnimated(buffer);
      return {
        width: view.getUint16(6, true),
        height: view.getUint16(8, true),
        format: 'GIF',
        isAnimated
      };
    }
    
    // WebP (starts with RIFF....WEBP)
    const riffHeader = String.fromCharCode(...new Uint8Array(buffer, 0, 4));
    const webpHeader = String.fromCharCode(...new Uint8Array(buffer, 8, 4));
    if (riffHeader === 'RIFF' && webpHeader === 'WEBP') {
      // WebP parsing is more complex - basic detection
      return {
        width: 0, // TODO: Implement WebP dimension parsing
        height: 0,
        format: 'WebP'
      };
    }
    
    return { width: 0, height: 0, format: 'Unknown' };
  } catch (e) {
    console.error('Dimension detection error:', e);
    return { width: 0, height: 0, format: 'Unknown' };
  }
}

/**
 * Check if GIF is animated by looking for multiple image descriptors
 */
function checkGifAnimated(buffer) {
  try {
    const view = new DataView(buffer);
    let frameCount = 0;
    let offset = 13; // Skip header and logical screen descriptor
    
    while (offset < buffer.byteLength - 1) {
      const block = view.getUint8(offset);
      
      // Image descriptor (0x2C)
      if (block === 0x2C) {
        frameCount++;
        if (frameCount > 1) return true;
        offset += 10; // Skip image descriptor
      }
      // Extension block (0x21)
      else if (block === 0x21) {
        offset += 2;
        // Skip sub-blocks
        let blockSize = view.getUint8(offset);
        while (blockSize > 0) {
          offset += blockSize + 1;
          if (offset >= buffer.byteLength) break;
          blockSize = view.getUint8(offset);
        }
        offset++;
      }
      // Trailer (0x3B)
      else if (block === 0x3B) {
        break;
      }
      else {
        offset++;
      }
    }
    
    return false;
  } catch (e) {
    return false;
  }
}

/**
 * Backfill metadata for images
 * This is a Cloudflare Worker script that can be run via wrangler
 */
export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const dryRun = url.searchParams.get('dry-run') === 'true';
    const limit = parseInt(url.searchParams.get('limit') || '0');
    
    console.log(`Starting metadata backfill (dry-run: ${dryRun}, limit: ${limit || 'none'})`);
    
    try {
      // Get all images with missing dimensions
      let query = `
        SELECT id, filename, mime_type, file_size
        FROM images 
        WHERE width IS NULL OR height IS NULL OR width = 0 OR height = 0
        ORDER BY id ASC
      `;
      
      if (limit > 0) {
        query += ` LIMIT ${limit}`;
      }
      
      const images = await env.DB.prepare(query).all();
      
      console.log(`Found ${images.results.length} images needing metadata`);
      
      const results = {
        total: images.results.length,
        processed: 0,
        updated: 0,
        failed: 0,
        skipped: 0,
        errors: []
      };
      
      for (const image of images.results) {
        try {
          console.log(`Processing ${image.filename} (ID: ${image.id})...`);
          
          // Fetch image from R2
          const r2Object = await env.IMAGES.get(image.filename);
          
          if (!r2Object) {
            console.warn(`  ⚠️  Image not found in R2: ${image.filename}`);
            results.skipped++;
            results.errors.push({
              id: image.id,
              filename: image.filename,
              error: 'Not found in R2'
            });
            continue;
          }
          
          // Get buffer
          const buffer = await r2Object.arrayBuffer();
          
          // Extract metadata
          const metadata = getImageDimensionsSync(buffer);
          
          if (metadata.width === 0 || metadata.height === 0) {
            console.warn(`  ⚠️  Could not extract dimensions: ${image.filename}`);
            results.failed++;
            results.errors.push({
              id: image.id,
              filename: image.filename,
              error: 'Dimension extraction failed',
              format: metadata.format
            });
            continue;
          }
          
          console.log(`  ✅ ${metadata.width}x${metadata.height} (${metadata.format}${metadata.isAnimated ? ', animated' : ''})`);
          
          // Update database
          if (!dryRun) {
            await env.DB.prepare(`
              UPDATE images 
              SET width = ?,
                  height = ?,
                  updated_at = datetime('now')
              WHERE id = ?
            `).bind(metadata.width, metadata.height, image.id).run();
            
            results.updated++;
          }
          
          results.processed++;
          
          // Rate limiting: small delay every 10 images
          if (results.processed % 10 === 0) {
            await new Promise(resolve => setTimeout(resolve, 100));
          }
          
        } catch (error) {
          console.error(`  ❌ Error processing ${image.filename}:`, error);
          results.failed++;
          results.errors.push({
            id: image.id,
            filename: image.filename,
            error: error.message
          });
        }
      }
      
      console.log('\n=== Backfill Complete ===');
      console.log(`Total: ${results.total}`);
      console.log(`Processed: ${results.processed}`);
      console.log(`Updated: ${results.updated}`);
      console.log(`Failed: ${results.failed}`);
      console.log(`Skipped: ${results.skipped}`);
      
      return new Response(JSON.stringify(results, null, 2), {
        headers: { 'Content-Type': 'application/json' }
      });
      
    } catch (error) {
      console.error('Backfill failed:', error);
      return new Response(JSON.stringify({
        error: error.message,
        stack: error.stack
      }), {
        status: 500,
        headers: { 'Content-Type': 'application/json' }
      });
    }
  }
};

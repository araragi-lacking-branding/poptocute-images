// src/admin/upload.js
// Handle image uploads to R2 with validation and deduplication
// WebP conversion happens on serve via Cloudflare Image Resizing API

import { syncKVCache } from './sync.js';

export async function handleUpload(request, env) {
  try {
    const formData = await request.formData();
    const file = formData.get('file');
    
    if (!file) {
      return new Response(JSON.stringify({ error: 'No file provided' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    // Validation: File size (max 10MB)
    const maxSize = 10 * 1024 * 1024;
    if (file.size > maxSize) {
      return new Response(JSON.stringify({ 
        error: 'File too large. Maximum size is 10MB' 
      }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    // Validation: File type
    const allowedTypes = ['image/jpeg', 'image/png', 'image/gif', 'image/webp', 'image/avif'];
    if (!allowedTypes.includes(file.type)) {
      return new Response(JSON.stringify({ 
        error: 'Invalid file type. Allowed: JPG, PNG, GIF, WEBP, AVIF' 
      }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    // Get file data
    const buffer = await file.arrayBuffer();
    const fileSize = buffer.byteLength;

    console.log(`Processing upload: ${file.name} (${fileSize} bytes, ${file.type})`);

    // Generate content hash for deduplication
    const hashBuffer = await crypto.subtle.digest('SHA-256', buffer);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    const hashHex = hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
    const shortHash = hashHex.substring(0, 16);

    // Check for duplicate
    const existing = await env.DB.prepare(`
      SELECT id, filename FROM images WHERE file_hash = ?
    `).bind(hashHex).first();

    if (existing) {
      return new Response(JSON.stringify({ 
        error: 'Duplicate image already exists',
        existing_id: existing.id,
        existing_filename: existing.filename
      }), {
        status: 409,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    // Get image dimensions from file headers
    const dimensions = getImageDimensionsSync(buffer);

    // Generate filename with hash and original extension
    const ext = file.name.split('.').pop().toLowerCase();
    const filename = `images/${shortHash}.${ext}`;

    // Upload to R2
    await env.IMAGES.put(filename, buffer, {
      httpMetadata: {
        contentType: file.type,
        cacheControl: 'public, max-age=31536000'
      },
    });

    console.log(`Uploaded to R2: ${filename}`);

    // Save to database
    const result = await env.DB.prepare(`
      INSERT INTO images (
        filename, 
        original_filename, 
        file_size, 
        width,
        height,
        mime_type, 
        file_hash,
        status, 
        credit_id,
        created_at,
        updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, 'active', 1, datetime('now'), datetime('now'))
    `).bind(
      filename,
      file.name,
      fileSize,
      dimensions.width,
      dimensions.height,
      file.type,
      hashHex
    ).run();

    console.log(`Saved to database: ID ${result.meta.last_row_id}`);

    // Trigger KV sync after successful upload
    try {
      await syncKVCache(env);
      console.log('KV cache synced after upload');
    } catch (syncError) {
      console.error('KV sync failed (non-fatal):', syncError);
      // Don't fail the upload if sync fails
    }

    return new Response(JSON.stringify({ 
      success: true,
      id: result.meta.last_row_id,
      filename: filename,
      size: fileSize,
      dimensions: dimensions,
      message: 'Image uploaded successfully. WebP conversion on serve via Cloudflare.'
    }), {
      headers: { 'Content-Type': 'application/json' }
    });

  } catch (error) {
    console.error('Upload error:', error);
    return new Response(JSON.stringify({ 
      error: 'Upload failed',
      details: error.message 
    }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    });
  }
}

/**
 * Get image dimensions by parsing file headers
 * Simple synchronous function - no external dependencies
 */
function getImageDimensionsSync(buffer) {
  try {
    const view = new DataView(buffer);
    
    // PNG (starts with 0x89504E47)
    if (view.getUint32(0, false) === 0x89504E47) {
      return {
        width: view.getUint32(16, false),
        height: view.getUint32(20, false)
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
            width: view.getUint16(offset + 7, false)
          };
        }
        offset += 2 + size;
      }
    }
    
    // GIF (starts with GIF87a or GIF89a)
    const gifHeader = new Uint8Array(buffer, 0, 6);
    const gifString = String.fromCharCode(...gifHeader);
    if (gifString.startsWith('GIF')) {
      return {
        width: view.getUint16(6, true),
        height: view.getUint16(8, true)
      };
    }
    
    return { width: 0, height: 0 };
  } catch (e) {
    console.error('Dimension detection error:', e);
    return { width: 0, height: 0 };
  }
}

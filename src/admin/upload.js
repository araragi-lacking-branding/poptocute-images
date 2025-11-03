// src/admin/upload.js
// Handle image uploads to R2 with validation and deduplication
// WebP conversion happens on serve via Cloudflare Image Resizing API

import { syncKVCache } from './sync.js';
import { extractImageMetadata, sanitizeMetadata } from '../lib/metadata-extractor.js';

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

    // Extract comprehensive metadata (EXIF, dimensions, color space, etc.)
    const rawMetadata = extractImageMetadata(buffer, file.type, file.name);
    const metadata = sanitizeMetadata(rawMetadata);
    
    console.log(`Metadata extracted: ${metadata.width}x${metadata.height}, ${metadata.format}, ${metadata.color_space}`);

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

    // Save to database with comprehensive metadata
    const result = await env.DB.prepare(`
      INSERT INTO images (
        filename, 
        original_filename, 
        file_size, 
        width,
        height,
        mime_type, 
        file_hash,
        format,
        color_space,
        bit_depth,
        has_alpha,
        is_animated,
        frame_count,
        orientation,
        aspect_ratio,
        date_taken,
        dpi_x,
        dpi_y,
        exif_data,
        status, 
        credit_id,
        created_at,
        updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'active', 1, datetime('now'), datetime('now'))
    `).bind(
      filename,
      file.name,
      fileSize,
      metadata.width,
      metadata.height,
      file.type,
      hashHex,
      metadata.format,
      metadata.color_space,
      metadata.bit_depth,
      metadata.has_alpha,
      metadata.is_animated,
      metadata.frame_count,
      metadata.orientation,
      metadata.aspect_ratio,
      metadata.date_taken,
      metadata.dpi_x,
      metadata.dpi_y,
      metadata.exif_data
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
      metadata: {
        dimensions: `${metadata.width}x${metadata.height}`,
        format: metadata.format,
        colorSpace: metadata.color_space,
        bitDepth: metadata.bit_depth,
        hasAlpha: metadata.has_alpha === 1,
        isAnimated: metadata.is_animated === 1,
        orientation: metadata.orientation,
        aspectRatio: metadata.aspect_ratio
      },
      message: 'Image uploaded with comprehensive metadata. WebP conversion on serve via Cloudflare.'
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

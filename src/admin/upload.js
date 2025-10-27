// src/admin/upload.js
// Handle image uploads to R2 with WebP conversion, validation and abuse prevention

import { convertToWebP, getImageDimensions, calculateSavings } from './image-converter.js';

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
    const maxSize = 10 * 1024 * 1024; // 10MB
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

    // Get original file data
    const originalBuffer = await file.arrayBuffer();
    const originalSize = originalBuffer.byteLength;

    console.log(`Processing upload: ${file.name} (${originalSize} bytes, ${file.type})`);

    // Generate content hash for deduplication
    const hashBuffer = await crypto.subtle.digest('SHA-256', originalBuffer);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    const hashHex = hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
    const shortHash = hashHex.substring(0, 16);

    // Check for duplicate by hash
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

    // Get image dimensions before conversion
    const dimensions = await getImageDimensions(originalBuffer);

    // Convert to WebP (unless already WebP)
    let finalBuffer = originalBuffer;
    let finalMimeType = file.type;
    let finalSize = originalSize;
    let savings = 0;
    let conversionApplied = false;

    if (file.type !== 'image/webp' && file.type !== 'image/avif') {
      console.log('Converting to WebP...');
      try {
        const webpBuffer = await convertToWebP(originalBuffer, 85); // 85% quality
        finalBuffer = webpBuffer;
        finalSize = webpBuffer.byteLength;
        finalMimeType = 'image/webp';
        savings = calculateSavings(originalSize, finalSize);
        conversionApplied = true;
        console.log(`WebP conversion complete: ${finalSize} bytes (${savings}% smaller)`);
      } catch (conversionError) {
        console.error('WebP conversion failed, using original:', conversionError.message);
        // Fall back to original if conversion fails
        conversionApplied = false;
      }
    }

    // Generate filename: images/[hash].[ext]
    const extension = conversionApplied ? 'webp' : file.name.split('.').pop().toLowerCase();
    const filename = `images/${shortHash}.${extension}`;

    // Upload to R2
    await env.IMAGES.put(filename, finalBuffer, {
      httpMetadata: {
        contentType: finalMimeType,
        cacheControl: 'public, max-age=31536000'
      },
    });

    console.log(`Uploaded to R2: ${filename}`);

    // Add to D1 database
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
      finalSize,
      dimensions.width,
      dimensions.height,
      finalMimeType,
      hashHex
    ).run();

    console.log(`Saved to database: ID ${result.meta.last_row_id}`);

    // Build response message
    let message = 'Image uploaded successfully';
    if (conversionApplied) {
      message = `Image uploaded and converted to WebP (${savings}% size reduction)`;
    }

    return new Response(JSON.stringify({ 
      success: true,
      id: result.meta.last_row_id,
      filename: filename,
      original_size: originalSize,
      final_size: finalSize,
      size: finalSize, // backwards compatibility
      savings_percent: savings,
      dimensions: dimensions,
      converted: conversionApplied,
      message: message
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

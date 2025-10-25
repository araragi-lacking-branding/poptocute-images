// src/admin/upload.js
// Handle image uploads to R2 with validation and abuse prevention

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

    // Generate unique filename
    const timestamp = Date.now();
    const extension = file.name.split('.').pop().toLowerCase();
    const sanitizedName = file.name.replace(/[^a-zA-Z0-9.-]/g, '_');
    const filename = `IMG_${timestamp}_${sanitizedName}`;
    const r2Key = `images/${filename}`;

    // Upload to R2
    await env.IMAGES.put(r2Key, file.stream(), {
      httpMetadata: {
        contentType: file.type,
      },
    });

    // Add to D1 database
    const result = await env.DB.prepare(`
      INSERT INTO images (
        filename, 
        original_filename, 
        file_size, 
        mime_type, 
        status, 
        credit_id,
        created_at,
        updated_at
      ) VALUES (?, ?, ?, ?, 'active', 1, datetime('now'), datetime('now'))
    `).bind(
      r2Key,
      file.name,
      file.size,
      file.type
    ).run();

    return new Response(JSON.stringify({ 
      success: true,
      id: result.meta.last_row_id,
      filename: r2Key,
      size: file.size,
      message: 'Image uploaded successfully'
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

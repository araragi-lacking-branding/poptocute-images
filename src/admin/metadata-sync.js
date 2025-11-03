// src/admin/metadata-sync.js
// Backfill and sync metadata for existing images
// Can be triggered manually or via cron schedule

import { extractImageMetadata, sanitizeMetadata } from '../lib/metadata-extractor.js';

/**
 * Backfill metadata for images missing data
 * @param {Object} env - Worker environment bindings
 * @param {Object} options - { dryRun, limit, forceAll }
 * @returns {Promise<Object>} Results summary
 */
export async function backfillMetadata(env, options = {}) {
  const { dryRun = false, limit = 0, forceAll = false } = options;
  
  console.log(`Starting metadata backfill (dry-run: ${dryRun}, limit: ${limit || 'none'}, forceAll: ${forceAll})`);
  
  try {
    // Get images needing metadata
    let query = `
      SELECT id, filename, mime_type, file_size, width, height
      FROM images 
      WHERE ${forceAll ? '1=1' : 'width IS NULL OR height IS NULL OR width = 0 OR height = 0'}
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
      errors: [],
      startTime: new Date().toISOString()
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
        
        // Extract comprehensive metadata
        const rawMetadata = extractImageMetadata(buffer, image.mime_type, image.filename);
        const metadata = sanitizeMetadata(rawMetadata);
        
        if (!metadata.width || !metadata.height || metadata.width === 0 || metadata.height === 0) {
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
        
        console.log(`  ✅ ${metadata.width}x${metadata.height}, ${metadata.format}, ${metadata.color_space}${metadata.is_animated ? ', animated' : ''}`);
        
        // Update database with comprehensive metadata
        if (!dryRun) {
          await env.DB.prepare(`
            UPDATE images 
            SET width = ?,
                height = ?,
                format = ?,
                color_space = ?,
                bit_depth = ?,
                has_alpha = ?,
                is_animated = ?,
                frame_count = ?,
                orientation = ?,
                aspect_ratio = ?,
                date_taken = ?,
                dpi_x = ?,
                dpi_y = ?,
                exif_data = ?,
                updated_at = datetime('now')
            WHERE id = ?
          `).bind(
            metadata.width,
            metadata.height,
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
            metadata.exif_data,
            image.id
          ).run();
          
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
    
    results.endTime = new Date().toISOString();
    results.duration = new Date(results.endTime) - new Date(results.startTime);
    
    console.log('\n=== Metadata Backfill Complete ===');
    console.log(`Total: ${results.total}`);
    console.log(`Processed: ${results.processed}`);
    console.log(`Updated: ${results.updated}`);
    console.log(`Failed: ${results.failed}`);
    console.log(`Skipped: ${results.skipped}`);
    console.log(`Duration: ${results.duration}ms`);
    
    return results;
    
  } catch (error) {
    console.error('Backfill failed:', error);
    throw error;
  }
}

/**
 * HTTP handler for metadata backfill requests
 */
export async function handleMetadataBackfill(request, env, url) {
  const dryRun = url.searchParams.get('dry-run') === 'true';
  const limit = parseInt(url.searchParams.get('limit') || '0');
  const forceAll = url.searchParams.get('force-all') === 'true';
  
  try {
    const results = await backfillMetadata(env, { dryRun, limit, forceAll });
    
    return new Response(JSON.stringify(results, null, 2), {
      status: 200,
      headers: { 'Content-Type': 'application/json' }
    });
    
  } catch (error) {
    console.error('Metadata backfill error:', error);
    
    return new Response(JSON.stringify({
      error: 'Metadata backfill failed',
      message: error.message,
      stack: error.stack
    }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    });
  }
}

/**
 * Validate metadata completeness across all images
 * Returns statistics about metadata coverage
 */
export async function validateMetadata(env) {
  try {
    const stats = await env.DB.prepare(`
      SELECT 
        COUNT(*) as total,
        COUNT(width) as has_width,
        COUNT(height) as has_height,
        COUNT(format) as has_format,
        COUNT(color_space) as has_color_space,
        COUNT(bit_depth) as has_bit_depth,
        COUNT(aspect_ratio) as has_aspect_ratio,
        COUNT(exif_data) as has_exif,
        COUNT(CASE WHEN is_animated = 1 THEN 1 END) as animated_count,
        COUNT(CASE WHEN has_alpha = 1 THEN 1 END) as alpha_count
      FROM images
      WHERE status = 'active'
    `).first();
    
    const completeness = {
      total: stats.total,
      coverage: {
        dimensions: `${stats.has_width}/${stats.total} (${((stats.has_width / stats.total) * 100).toFixed(1)}%)`,
        format: `${stats.has_format}/${stats.total} (${((stats.has_format / stats.total) * 100).toFixed(1)}%)`,
        colorSpace: `${stats.has_color_space}/${stats.total} (${((stats.has_color_space / stats.total) * 100).toFixed(1)}%)`,
        bitDepth: `${stats.has_bit_depth}/${stats.total} (${((stats.has_bit_depth / stats.total) * 100).toFixed(1)}%)`,
        aspectRatio: `${stats.has_aspect_ratio}/${stats.total} (${((stats.has_aspect_ratio / stats.total) * 100).toFixed(1)}%)`,
        exif: `${stats.has_exif}/${stats.total} (${((stats.has_exif / stats.total) * 100).toFixed(1)}%)`
      },
      features: {
        animated: stats.animated_count,
        hasAlpha: stats.alpha_count
      },
      needsBackfill: stats.total - stats.has_width
    };
    
    return completeness;
    
  } catch (error) {
    console.error('Metadata validation error:', error);
    throw error;
  }
}

/**
 * HTTP handler for metadata validation
 */
export async function handleMetadataValidation(env) {
  try {
    const stats = await validateMetadata(env);
    
    return new Response(JSON.stringify(stats, null, 2), {
      status: 200,
      headers: { 'Content-Type': 'application/json' }
    });
    
  } catch (error) {
    console.error('Validation error:', error);
    
    return new Response(JSON.stringify({
      error: 'Validation failed',
      message: error.message
    }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    });
  }
}

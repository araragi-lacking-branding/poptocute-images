// src/handlers/random.js
// Handles random image selection and related API logic
// Goal: Extract from main index.js for better code organization and maintainability

import { syncKVCache } from '../admin/sync.js';

async function getRandomImage(env, corsHeaders) {
  try {
    // PERFORMANCE: Use random OFFSET instead of ORDER BY RANDOM()
    // ORDER BY RANDOM() creates temp B-tree and is very slow
    // Random offset is O(1) instead of O(n log n)

    // Get count from KV cache (updated periodically)
    let count = await env.IMAGES_CACHE.get('active-count', 'text');
    if (!count) {
      // Cache miss - likely first request after deployment
      console.warn('KV cache miss - triggering sync');

      // Immediate fallback to DB query (don't block request)
      const countResult = await env.DB.prepare(`
        SELECT COUNT(*) as count FROM images WHERE status = 'active'
      `).first();
      count = countResult.count;

      // Cache for 1 hour
      await env.IMAGES_CACHE.put('active-count', count.toString(), { expirationTtl: 3600 });

      // Trigger full sync in background (non-blocking)
      // This will sync the full images list too
      syncKVCache(env).catch(err => console.error('Background sync failed:', err));
    } else {
      count = parseInt(count);
    }

    // Generate random offset
    const randomOffset = Math.floor(Math.random() * count);

    // Get random image using OFFSET (much faster than ORDER BY RANDOM())
    const result = await env.DB.prepare(`
      SELECT
        i.id,
        i.filename,
        i.alt_text,
        i.title,
        i.source,
        i.license,
        i.permissions,
        i.notes,
        i.file_hash,
        i.file_size,
        i.width,
        i.height,
        i.mime_type,
        i.created_at,
        c.name AS credit_name,
        c.url AS credit_url,
        c.social_handle AS credit_social_handle,
        c.platform AS credit_platform,
        c.license AS credit_license,
        c.artist_id,
        a.name AS artist_name,
        a.display_name AS artist_display_name,
        a.avatar_url AS artist_avatar,
        a.website_url AS artist_website,
        a.twitter_handle AS artist_twitter,
        a.verified AS artist_verified
      FROM images i
      LEFT JOIN credits c ON i.credit_id = c.id
      LEFT JOIN artists a ON c.artist_id = a.id
      WHERE i.status = 'active'
        AND (a.id IS NULL OR a.status = 'active')
        AND i.id NOT IN (
          SELECT DISTINCT it.image_id
          FROM image_tags it
          JOIN tags t ON it.tag_id = t.id
          WHERE t.status IN ('hidden', 'deleted')
        )
      LIMIT 1 OFFSET ?
    `).bind(randomOffset).first();

    if (!result) {
      return new Response(JSON.stringify({ error: 'No images available' }), {
        status: 404,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    // Get tags separately - fast indexed lookup (only active tags)
    const tagsResult = await env.DB.prepare(`
      SELECT t.name, t.display_name, tc.name as category
      FROM image_tags it
      JOIN tags t ON it.tag_id = t.id
      JOIN tag_categories tc ON t.category_id = tc.id
      WHERE it.image_id = ? AND t.status = 'active'
      ORDER BY tc.sort_order, t.name
    `).bind(result.id).all();

    // CREDITS FIX: Get all creators from creator tags
    // This supports multiple creators per image
    const creatorsFromTags = await env.DB.prepare(`
      SELECT
        a.id AS artist_id,
        a.name AS artist_name,
        a.display_name AS artist_display_name,
        a.avatar_url AS artist_avatar,
        a.website_url AS artist_website,
        a.twitter_handle AS artist_twitter,
        a.instagram_handle AS artist_instagram,
        a.verified AS artist_verified
      FROM image_tags it
      JOIN tags t ON it.tag_id = t.id
      JOIN tag_categories tc ON t.category_id = tc.id
      JOIN artist_tags at ON t.id = at.tag_id
      JOIN artists a ON at.artist_id = a.id
      WHERE it.image_id = ?
        AND tc.name = 'creator'
        AND a.status = 'active'
      ORDER BY a.display_name
    `).bind(result.id).all();

    // Build creators array with all creator information
    result.creators = creatorsFromTags.results || [];

    // For backwards compatibility, also set single artist fields from first creator
    if (result.creators.length > 0 && (!result.artist_id || !result.artist_name)) {
      const firstCreator = result.creators[0];
      result.artist_id = firstCreator.artist_id;
      result.artist_name = firstCreator.artist_name;
      result.artist_display_name = firstCreator.artist_display_name;
      result.artist_avatar = firstCreator.artist_avatar;
      result.artist_website = firstCreator.artist_website;
      result.artist_twitter = firstCreator.artist_twitter;
      result.artist_verified = firstCreator.artist_verified;
    }

    // Generate optimized image URLs using Cloudflare Image Resizing
    // These only work in production (not local dev)
    const baseUrl = '/cdn-cgi/image';
    const imagePath = `/${result.filename}`;

    const urls = {
      // Original (for backwards compatibility)
      original: imagePath,

      // Optimized variants with WebP/AVIF auto-format
      mobile: `${baseUrl}/width=640,quality=85,format=auto${imagePath}`,
      tablet: `${baseUrl}/width=1024,quality=85,format=auto${imagePath}`,
      desktop: `${baseUrl}/width=1920,quality=85,format=auto${imagePath}`,
      thumbnail: `${baseUrl}/width=320,quality=80,format=auto${imagePath}`,

      // Default optimized (good for most cases)
      optimized: `${baseUrl}/width=1024,quality=85,format=auto${imagePath}`
    };

    return new Response(JSON.stringify({
      ...result,
      tags: tagsResult.results || [],
      urls: urls
    }), {
      headers: {
        ...corsHeaders,
        'Content-Type': 'application/json',
        'Cache-Control': 'no-cache'
      }
    });
  } catch (error) {
    console.error('Error fetching random image:', error);
    throw error;
  }
}

export { getRandomImage };
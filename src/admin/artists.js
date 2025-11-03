// src/admin/artists.js
// Artist profile management operations

/**
 * Normalize text for consistent storage and comparison
 * Prevents duplicates from whitespace, special dashes, and other variations
 * @param {string} text - Text to normalize
 * @returns {string} Normalized text
 */
function normalizeText(text) {
  if (!text) return '';
  
  return text
    .trim()                          // Remove leading/trailing whitespace
    .replace(/\s+/g, ' ')            // Collapse multiple spaces to single space
    .replace(/[_\u2013\u2014]/g, '-') // Replace underscore, en-dash (–) and em-dash (—) with hyphen
    .replace(/[\u2018\u2019]/g, "'") // Replace smart single quotes with straight quotes
    .replace(/[\u201C\u201D]/g, '"') // Replace smart double quotes with straight quotes
    .replace(/\s*-\s*/g, '-')        // Remove spaces around hyphens: "studio - gainax" → "studio-gainax"
    .toLowerCase();                  // Lowercase for case-insensitive comparison
}

/**
 * Get all artist profiles with optional filtering
 * @param {Object} env - Worker environment bindings
 * @param {Object} options - Query options (featured, search, limit, offset)
 * @returns {Promise<Array>} Array of artist profiles
 */
export async function getAllArtists(env, options = {}) {
  const { featured, search, limit = 50, offset = 0 } = options;
  
  let query = `
    SELECT 
      a.id,
      a.name,
      a.display_name,
      a.bio,
      a.avatar_url,
      a.website_url,
      a.twitter_handle,
      a.instagram_handle,
      a.pixiv_id,
      a.deviantart_username,
      a.other_links,
      a.verified,
      a.featured,
      a.created_at,
      a.updated_at,
      COUNT(DISTINCT c.id) AS credits_count,
      COUNT(DISTINCT i.id) AS images_count
    FROM artists a
    LEFT JOIN credits c ON a.id = c.artist_id
    LEFT JOIN images i ON c.id = i.credit_id AND i.status = 'active'
  `;
  
  const conditions = [];
  const params = [];
  
  if (featured !== undefined) {
    conditions.push('a.featured = ?');
    params.push(featured ? 1 : 0);
  }
  
  if (search) {
    conditions.push('(a.name LIKE ? OR a.display_name LIKE ? OR a.bio LIKE ?)');
    const searchPattern = `%${search}%`;
    params.push(searchPattern, searchPattern, searchPattern);
  }
  
  if (conditions.length > 0) {
    query += ' WHERE ' + conditions.join(' AND ');
  }
  
  query += `
    GROUP BY a.id
    ORDER BY a.featured DESC, images_count DESC, a.name ASC
    LIMIT ? OFFSET ?
  `;
  
  params.push(limit, offset);
  
  const stmt = env.DB.prepare(query);
  const result = await stmt.bind(...params).all();
  
  // Parse other_links JSON if present
  return result.results.map(artist => ({
    ...artist,
    other_links: artist.other_links ? JSON.parse(artist.other_links) : []
  }));
}

/**
 * Get a single artist profile by ID
 * @param {Object} env - Worker environment bindings
 * @param {number} artistId - Artist ID
 * @returns {Promise<Object|null>} Artist profile or null if not found
 */
export async function getArtistById(env, artistId) {
  const result = await env.DB.prepare(`
    SELECT 
      a.*,
      COUNT(DISTINCT c.id) AS credits_count,
      COUNT(DISTINCT i.id) AS images_count
    FROM artists a
    LEFT JOIN credits c ON a.id = c.artist_id
    LEFT JOIN images i ON c.id = i.credit_id AND i.status = 'active'
    WHERE a.id = ?
    GROUP BY a.id
  `).bind(artistId).first();
  
  if (!result) return null;
  
  // Get associated tags
  const tags = await env.DB.prepare(`
    SELECT t.id, t.name, t.display_name
    FROM tags t
    INNER JOIN artist_tags at ON t.id = at.tag_id
    WHERE at.artist_id = ?
  `).bind(artistId).all();
  
  return {
    ...result,
    other_links: result.other_links ? JSON.parse(result.other_links) : [],
    tags: tags.results || []
  };
}

/**
 * Get artist by name
 * @param {Object} env - Worker environment bindings
 * @param {string} name - Artist name
 * @returns {Promise<Object|null>} Artist profile or null if not found
 */
export async function getArtistByName(env, name) {
  const normalizedName = normalizeText(name);
  
  // Search for artists with matching normalized names
  const result = await env.DB.prepare(`
    SELECT * FROM artists
  `).all();
  
  // Find match by comparing normalized names
  const match = result.results.find(artist => 
    normalizeText(artist.name) === normalizedName
  );
  
  if (!match) return null;
  
  return {
    ...match,
    other_links: match.other_links ? JSON.parse(match.other_links) : []
  };
}

/**
 * Create a new artist profile
 * @param {Object} env - Worker environment bindings
 * @param {Object} artistData - Artist profile data
 * @returns {Promise<Object>} Created artist profile
 */
export async function createArtist(env, artistData) {
  const {
    name,
    display_name,
    bio,
    avatar_url,
    website_url,
    twitter_handle,
    instagram_handle,
    pixiv_id,
    deviantart_username,
    other_links = [],
    verified = false,
    featured = false,
    notes
  } = artistData;
  
  // Validate required fields
  if (!name) {
    throw new Error('Artist name is required');
  }
  
  // Clean the name (trim and remove excessive whitespace) but preserve intentional formatting
  const cleanedName = name
    .trim()
    .replace(/\s+/g, ' ');  // Only collapse multiple spaces to single space
  
  // Check if artist already exists using normalized comparison (but don't store normalized)
  const existing = await getArtistByName(env, cleanedName);
  if (existing) {
    throw new Error(`Artist with name "${cleanedName}" already exists (found as "${existing.name}")`);
  }
  
  const result = await env.DB.prepare(`
    INSERT INTO artists (
      name, display_name, bio, avatar_url, website_url,
      twitter_handle, instagram_handle, pixiv_id, deviantart_username,
      other_links, verified, featured, notes, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))
  `).bind(
    cleanedName,  // Store the cleaned name (preserves underscores, hyphens, etc.)
    display_name || null,
    bio || null,
    avatar_url || null,
    website_url || null,
    twitter_handle || null,
    instagram_handle || null,
    pixiv_id || null,
    deviantart_username || null,
    JSON.stringify(other_links),
    verified ? 1 : 0,
    featured ? 1 : 0,
    notes || null
  ).run();
  
  if (!result.success) {
    throw new Error('Failed to create artist');
  }

  const artistId = result.meta.last_row_id;

  // Auto-create and link a creator tag
  try {
    // Check if creator tag already exists
    const creatorCategory = await env.DB.prepare(
      `SELECT id FROM tag_categories WHERE name = 'creator'`
    ).first();

    if (creatorCategory) {
      const existingTag = await env.DB.prepare(
        `SELECT id FROM tags WHERE name = ? AND category_id = ?`
      ).bind(cleanedName, creatorCategory.id).first();

      let tagId;
      if (existingTag) {
        tagId = existingTag.id;
      } else {
        // Create creator tag with cleaned name (preserves original formatting)
        const tagResult = await env.DB.prepare(`
          INSERT INTO tags (name, display_name, category_id)
          VALUES (?, ?, ?)
        `).bind(cleanedName, display_name || name.trim(), creatorCategory.id).run();
        
        tagId = tagResult.meta.last_row_id;
      }

      // Link artist to creator tag
      await env.DB.prepare(`
        INSERT OR IGNORE INTO artist_tags (artist_id, tag_id)
        VALUES (?, ?)
      `).bind(artistId, tagId).run();
    }
  } catch (error) {
    console.error('Failed to create/link creator tag:', error);
    // Don't fail the artist creation if tag creation fails
  }
  
  return await getArtistById(env, artistId);
}

/**
 * Update an artist profile
 * @param {Object} env - Worker environment bindings
 * @param {number} artistId - Artist ID
 * @param {Object} updates - Fields to update
 * @returns {Promise<Object>} Updated artist profile
 */
export async function updateArtist(env, artistId, updates) {
  // Verify artist exists
  const existing = await getArtistById(env, artistId);
  if (!existing) {
    throw new Error('Artist not found');
  }
  
  // If updating name, clean it and check for conflicts
  if (updates.name) {
    const cleanedName = updates.name
      .trim()
      .replace(/\s+/g, ' ');  // Only collapse multiple spaces
    
    // Check if another artist has this name (using normalized comparison)
    const conflict = await getArtistByName(env, cleanedName);
    if (conflict && conflict.id !== artistId) {
      throw new Error(`Artist with name "${cleanedName}" already exists (found as "${conflict.name}")`);
    }
    
    updates.name = cleanedName;  // Store cleaned name (preserves original formatting)
  }
  
  const allowedFields = [
    'name', 'display_name', 'bio', 'avatar_url', 'website_url',
    'twitter_handle', 'instagram_handle', 'pixiv_id', 'deviantart_username',
    'other_links', 'verified', 'featured', 'notes'
  ];
  
  const updateFields = [];
  const params = [];
  
  for (const [key, value] of Object.entries(updates)) {
    if (allowedFields.includes(key)) {
      updateFields.push(`${key} = ?`);
      
      // Handle special cases
      if (key === 'other_links' && Array.isArray(value)) {
        params.push(JSON.stringify(value));
      } else if (key === 'verified' || key === 'featured') {
        params.push(value ? 1 : 0);
      } else {
        params.push(value);
      }
    }
  }
  
  if (updateFields.length === 0) {
    return existing; // No valid updates
  }
  
  // Always update the updated_at timestamp
  updateFields.push('updated_at = datetime(\'now\')');
  
  const query = `
    UPDATE artists 
    SET ${updateFields.join(', ')}
    WHERE id = ?
  `;
  
  params.push(artistId);
  
  const result = await env.DB.prepare(query).bind(...params).run();
  
  if (!result.success) {
    throw new Error('Failed to update artist');
  }

  // If display_name was updated, sync it to the creator tag
  if (updates.display_name) {
    try {
      await env.DB.prepare(`
        UPDATE tags
        SET display_name = ?
        WHERE id IN (
          SELECT tag_id FROM artist_tags WHERE artist_id = ?
        ) AND category_id = (
          SELECT id FROM tag_categories WHERE name = 'creator'
        )
      `).bind(updates.display_name, artistId).run();
    } catch (error) {
      console.error('Failed to sync display_name to creator tag:', error);
    }
  }
  
  return await getArtistById(env, artistId);
}

/**
 * Delete an artist profile
 * @param {Object} env - Worker environment bindings
 * @param {number} artistId - Artist ID
 * @returns {Promise<boolean>} Success status
 */
export async function deleteArtist(env, artistId) {
  // Check if artist has any credits
  const creditsCheck = await env.DB.prepare(`
    SELECT COUNT(*) as count FROM credits WHERE artist_id = ?
  `).bind(artistId).first();
  
  if (creditsCheck.count > 0) {
    throw new Error('Cannot delete artist with existing credits. Remove credits first.');
  }
  
  const result = await env.DB.prepare(`
    DELETE FROM artists WHERE id = ?
  `).bind(artistId).run();
  
  return result.success;
}

/**
 * Link a creator tag to an artist
 * @param {Object} env - Worker environment bindings
 * @param {number} artistId - Artist ID
 * @param {number} tagId - Tag ID (must be a creator tag)
 * @returns {Promise<boolean>} Success status
 */
export async function linkArtistTag(env, artistId, tagId) {
  // Verify the tag is a creator tag
  const tag = await env.DB.prepare(`
    SELECT t.id, tc.name as category
    FROM tags t
    JOIN tag_categories tc ON t.category_id = tc.id
    WHERE t.id = ?
  `).bind(tagId).first();
  
  if (!tag) {
    throw new Error('Tag not found');
  }
  
  if (tag.category !== 'creator') {
    throw new Error('Can only link creator tags to artists');
  }
  
  // Insert or ignore if already exists
  const result = await env.DB.prepare(`
    INSERT OR IGNORE INTO artist_tags (artist_id, tag_id)
    VALUES (?, ?)
  `).bind(artistId, tagId).run();
  
  return result.success;
}

/**
 * Unlink a creator tag from an artist
 * @param {Object} env - Worker environment bindings
 * @param {number} artistId - Artist ID
 * @param {number} tagId - Tag ID
 * @returns {Promise<boolean>} Success status
 */
export async function unlinkArtistTag(env, artistId, tagId) {
  const result = await env.DB.prepare(`
    DELETE FROM artist_tags 
    WHERE artist_id = ? AND tag_id = ?
  `).bind(artistId, tagId).run();
  
  return result.success;
}

/**
 * Get all images by an artist
 * @param {Object} env - Worker environment bindings
 * @param {number} artistId - Artist ID
 * @param {Object} options - Query options
 * @returns {Promise<Array>} Array of images
 */
export async function getArtistImages(env, artistId, options = {}) {
  const { limit = 50, offset = 0, status = 'active' } = options;
  
  const result = await env.DB.prepare(`
    SELECT 
      i.id,
      i.filename,
      i.alt_text,
      i.width,
      i.height,
      i.status,
      i.created_at,
      c.name as credit_name
    FROM images i
    JOIN credits c ON i.credit_id = c.id
    WHERE c.artist_id = ? AND i.status = ?
    ORDER BY i.created_at DESC
    LIMIT ? OFFSET ?
  `).bind(artistId, status, limit, offset).all();
  
  return result.results;
}

-- Migration: Add Artist Profiles
-- Date: 2025-11-02
-- Description: Adds artist profile tables and updates credits to link to artists

-- ============================================
-- STEP 1: Create artists table
-- ============================================
CREATE TABLE IF NOT EXISTS artists (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL UNIQUE,
  display_name TEXT,
  bio TEXT,
  avatar_url TEXT,
  website_url TEXT,
  twitter_handle TEXT,
  instagram_handle TEXT,
  pixiv_id TEXT,
  deviantart_username TEXT,
  other_links TEXT,
  verified BOOLEAN DEFAULT 0,
  featured BOOLEAN DEFAULT 0,
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now')),
  notes TEXT
);

-- ============================================
-- STEP 2: Add artist_id column to credits
-- ============================================
-- Check if column exists first (SQLite doesn't have IF NOT EXISTS for columns)
-- This will fail silently if column already exists
ALTER TABLE credits ADD COLUMN artist_id INTEGER REFERENCES artists(id);

-- ============================================
-- STEP 3: Create artist_tags junction table
-- ============================================
CREATE TABLE IF NOT EXISTS artist_tags (
  artist_id INTEGER NOT NULL,
  tag_id INTEGER NOT NULL,
  created_at TEXT DEFAULT (datetime('now')),
  PRIMARY KEY (artist_id, tag_id),
  FOREIGN KEY (artist_id) REFERENCES artists(id) ON DELETE CASCADE,
  FOREIGN KEY (tag_id) REFERENCES tags(id) ON DELETE CASCADE
);

-- ============================================
-- STEP 4: Create indexes
-- ============================================
CREATE INDEX IF NOT EXISTS idx_credits_artist ON credits(artist_id);
CREATE INDEX IF NOT EXISTS idx_artists_name ON artists(name);
CREATE INDEX IF NOT EXISTS idx_artists_featured ON artists(featured);
CREATE INDEX IF NOT EXISTS idx_artist_tags_artist ON artist_tags(artist_id);
CREATE INDEX IF NOT EXISTS idx_artist_tags_tag ON artist_tags(tag_id);

-- ============================================
-- STEP 5: Update v_images_active view
-- ============================================
-- Drop and recreate the view with artist information
DROP VIEW IF EXISTS v_images_active;

CREATE VIEW v_images_active AS
SELECT 
  i.id,
  i.filename,
  i.alt_text,
  i.status,
  i.created_at,
  i.updated_at,
  c.name AS credit_name,
  c.url AS credit_url,
  c.license AS credit_license,
  c.verified AS credit_verified,
  c.artist_id,
  a.name AS artist_name,
  a.display_name AS artist_display_name,
  a.avatar_url AS artist_avatar,
  i.width,
  i.height,
  i.mime_type
FROM images i
LEFT JOIN credits c ON i.credit_id = c.id
LEFT JOIN artists a ON c.artist_id = a.id
WHERE i.status = 'active';

-- ============================================
-- STEP 6: Create new artist profile view
-- ============================================
CREATE VIEW IF NOT EXISTS v_artist_profiles AS
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
GROUP BY a.id
ORDER BY a.featured DESC, images_count DESC, a.name ASC;

-- ============================================
-- Migration complete!
-- ============================================

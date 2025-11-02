-- schema.sql
-- D1 Database Schema for cutetopop image management
-- Created: 2025-10-24
-- Revised: Fixed table creation order

-- ============================================
-- ARTISTS TABLE
-- Artist profile information
-- Created first (no dependencies)
-- ============================================
CREATE TABLE artists (
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
  other_links TEXT, -- JSON array of additional links
  verified BOOLEAN DEFAULT 0,
  featured BOOLEAN DEFAULT 0,
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now')),
  notes TEXT
);

-- ============================================
-- CREDITS TABLE
-- Artist/source attribution information
-- Created second (depends on artists for optional linking)
-- ============================================
CREATE TABLE credits (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  url TEXT,
  social_handle TEXT,
  platform TEXT,
  license TEXT,
  artist_id INTEGER, -- Link to artist profile if available
  verified BOOLEAN DEFAULT 0,
  created_at TEXT DEFAULT (datetime('now')),
  notes TEXT,
  FOREIGN KEY (artist_id) REFERENCES artists(id)
);

-- ============================================
-- TAG_CATEGORIES TABLE
-- Define available tag categories (mutable)
-- Created second (no dependencies)
-- ============================================
CREATE TABLE tag_categories (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL UNIQUE,
  display_name TEXT NOT NULL,
  description TEXT,
  color TEXT,
  sort_order INTEGER DEFAULT 0,
  created_at TEXT DEFAULT (datetime('now'))
);

-- ============================================
-- IMAGES TABLE
-- Core table storing all image metadata
-- Created third (depends on credits)
-- ============================================
CREATE TABLE images (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  filename TEXT NOT NULL UNIQUE,
  alt_text TEXT,
  original_filename TEXT,
  file_size INTEGER,
  width INTEGER,
  height INTEGER,
  mime_type TEXT,
  file_hash TEXT,
  status TEXT DEFAULT 'active' CHECK (status IN ('active', 'hidden', 'pending', 'deleted')),
  credit_id INTEGER,
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now')),
  notes TEXT,
  FOREIGN KEY (credit_id) REFERENCES credits(id)
);

-- ============================================
-- TAGS TABLE
-- Available tags for categorization
-- Created fourth (depends on tag_categories)
-- ============================================
CREATE TABLE tags (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  display_name TEXT,
  category_id INTEGER NOT NULL,
  description TEXT,
  color TEXT,
  created_at TEXT DEFAULT (datetime('now')),
  UNIQUE(name, category_id),
  FOREIGN KEY (category_id) REFERENCES tag_categories(id)
);

-- ============================================
-- IMAGE_TAGS TABLE
-- Many-to-many: APPROVED tags actively on images
-- Created fifth (depends on images and tags)
-- ============================================
CREATE TABLE image_tags (
  image_id INTEGER NOT NULL,
  tag_id INTEGER NOT NULL,
  added_by TEXT DEFAULT 'admin',
  confidence REAL DEFAULT 1.0,
  created_at TEXT DEFAULT (datetime('now')),
  PRIMARY KEY (image_id, tag_id),
  FOREIGN KEY (image_id) REFERENCES images(id) ON DELETE CASCADE,
  FOREIGN KEY (tag_id) REFERENCES tags(id) ON DELETE CASCADE
);

-- ============================================
-- ARTIST_TAGS TABLE
-- Links creator tags to artist profiles
-- Created sixth (depends on tags and artists)
-- ============================================
CREATE TABLE artist_tags (
  artist_id INTEGER NOT NULL,
  tag_id INTEGER NOT NULL,
  created_at TEXT DEFAULT (datetime('now')),
  PRIMARY KEY (artist_id, tag_id),
  FOREIGN KEY (artist_id) REFERENCES artists(id) ON DELETE CASCADE,
  FOREIGN KEY (tag_id) REFERENCES tags(id) ON DELETE CASCADE
);

-- ============================================
-- FEEDBACK TABLE
-- User submissions SEPARATE from active tags
-- Created sixth (depends on images)
-- ============================================
CREATE TABLE feedback (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  image_id INTEGER NOT NULL,
  type TEXT NOT NULL CHECK (type IN ('tag', 'credit', 'report', 'general')),
  data TEXT NOT NULL,
  status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected', 'processed')),
  submitter_ip TEXT,
  user_agent TEXT,
  created_at TEXT DEFAULT (datetime('now')),
  processed_at TEXT,
  processed_by TEXT,
  admin_notes TEXT,
  FOREIGN KEY (image_id) REFERENCES images(id) ON DELETE CASCADE
);

-- ============================================
-- INDEXES
-- Created after all tables exist
-- ============================================

CREATE INDEX idx_images_status ON images(status);
CREATE INDEX idx_images_filename ON images(filename);
CREATE INDEX idx_images_created_at ON images(created_at DESC);
CREATE INDEX idx_images_credit ON images(credit_id);

CREATE INDEX idx_credits_artist ON credits(artist_id);

CREATE INDEX idx_artists_name ON artists(name);
CREATE INDEX idx_artists_featured ON artists(featured);

CREATE INDEX idx_feedback_status ON feedback(status);
CREATE INDEX idx_feedback_type ON feedback(type);
CREATE INDEX idx_feedback_image ON feedback(image_id);
CREATE INDEX idx_feedback_created_at ON feedback(created_at DESC);
CREATE INDEX idx_feedback_ip ON feedback(submitter_ip);

CREATE INDEX idx_image_tags_image ON image_tags(image_id);
CREATE INDEX idx_image_tags_tag ON image_tags(tag_id);

CREATE INDEX idx_artist_tags_artist ON artist_tags(artist_id);
CREATE INDEX idx_artist_tags_tag ON artist_tags(tag_id);

CREATE INDEX idx_tags_name ON tags(name);
CREATE INDEX idx_tags_category ON tags(category_id);
CREATE INDEX idx_tags_name_category ON tags(name, category_id);

-- ============================================
-- INITIAL SEED DATA
-- Insert after tables and indexes are created
-- ============================================

INSERT INTO credits (id, name, url, license, verified, notes) VALUES 
  (1, 'Unknown Artist', NULL, 'Unknown', 0, 'Default credit for images without known attribution');

INSERT INTO tag_categories (name, display_name, description, color, sort_order) VALUES
  ('content', 'Content', 'What is depicted in the image', '#4ecdc4', 1),
  ('character', 'Character', 'Specific characters shown', '#a29bfe', 2),
  ('creator', 'Creator', 'Original artist or studio', '#fd79a8', 3),
  ('source', 'Source', 'Original media or franchise', '#fdcb6e', 4);

-- ============================================
-- USEFUL VIEWS
-- Created last (depend on all tables)
-- ============================================

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

CREATE VIEW v_image_tags_by_category AS
SELECT 
  it.image_id,
  tc.name AS category,
  tc.display_name AS category_display,
  GROUP_CONCAT(t.name, ',') AS tags,
  GROUP_CONCAT(t.display_name, ',') AS display_tags
FROM image_tags it
JOIN tags t ON it.tag_id = t.id
JOIN tag_categories tc ON t.category_id = tc.id
GROUP BY it.image_id, tc.id
ORDER BY tc.sort_order;

CREATE VIEW v_feedback_pending AS
SELECT 
  f.id AS feedback_id,
  f.image_id,
  i.filename,
  f.type,
  f.data,
  f.created_at,
  f.submitter_ip,
  COUNT(*) OVER (PARTITION BY f.image_id) AS feedback_count_for_image
FROM feedback f
JOIN images i ON f.image_id = i.id
WHERE f.status = 'pending'
ORDER BY f.created_at ASC;

CREATE VIEW v_tag_stats AS
SELECT 
  t.id,
  t.name,
  t.display_name,
  tc.name AS category,
  tc.display_name AS category_display,
  COUNT(it.image_id) AS usage_count
FROM tags t
JOIN tag_categories tc ON t.category_id = tc.id
LEFT JOIN image_tags it ON t.id = it.tag_id
GROUP BY t.id
ORDER BY usage_count DESC, t.name ASC;

-- Artist profile with image count and tag association
CREATE VIEW v_artist_profiles AS
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
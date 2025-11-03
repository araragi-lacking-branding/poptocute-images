-- Migration: Add case-insensitive UNIQUE constraint on artist names
-- This prevents duplicates like "studio-gainax" and "Studio-Gainax"

-- SQLite doesn't support modifying constraints directly, so we need to:
-- 1. Create a new table with the correct constraint
-- 2. Copy data
-- 3. Drop old table (requires handling foreign keys)
-- 4. Rename new table

-- First, let's check for any existing case-duplicates that would violate the constraint
SELECT 
    LOWER(name) as normalized_name,
    GROUP_CONCAT(name, ', ') as variations,
    COUNT(*) as count
FROM artists
GROUP BY LOWER(name)
HAVING COUNT(*) > 1;

-- If the above query returns any rows, those need to be manually resolved before running this migration

-- Disable foreign key constraints temporarily
PRAGMA foreign_keys = OFF;

-- Create new table with case-insensitive constraint
CREATE TABLE artists_new (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL UNIQUE COLLATE NOCASE,  -- NOCASE makes it case-insensitive
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
  notes TEXT,
  status TEXT DEFAULT 'active' CHECK (status IN ('active', 'hidden', 'deleted'))
);

-- Copy data from old table
INSERT INTO artists_new SELECT * FROM artists;

-- Drop old table
DROP TABLE artists;

-- Rename new table
ALTER TABLE artists_new RENAME TO artists;

-- Re-enable foreign key constraints
PRAGMA foreign_keys = ON;

-- Verify the constraint works
SELECT 'Migration complete. Artist names now case-insensitive.' as status;
SELECT * FROM artists ORDER BY id;

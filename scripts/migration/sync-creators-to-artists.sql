-- Migration: Sync existing Creator tags to Artist profiles
-- Creates artist profiles for all existing creator tags that don't have them yet

-- Create artists for creator tags that don't have artist profiles
INSERT INTO artists (name, display_name, verified, featured, updated_at)
SELECT 
  t.name,
  t.display_name,
  0, -- not verified by default
  0, -- not featured by default
  datetime('now')
FROM tags t
INNER JOIN tag_categories tc ON t.category_id = tc.id
WHERE tc.name = 'creator'
  AND NOT EXISTS (
    SELECT 1 FROM artists a WHERE a.name = t.name
  );

-- Link newly created artists to their creator tags
INSERT OR IGNORE INTO artist_tags (artist_id, tag_id)
SELECT 
  a.id,
  t.id
FROM tags t
INNER JOIN tag_categories tc ON t.category_id = tc.id
INNER JOIN artists a ON a.name = t.name
WHERE tc.name = 'creator';

-- Verify results
SELECT 
  'Creator Tags' as type,
  COUNT(*) as count
FROM tags t
INNER JOIN tag_categories tc ON t.category_id = tc.id
WHERE tc.name = 'creator'

UNION ALL

SELECT 
  'Artist Profiles' as type,
  COUNT(*) as count
FROM artists

UNION ALL

SELECT 
  'Linked (artist_tags)' as type,
  COUNT(*) as count
FROM artist_tags;

-- Migration: Link existing credits to artist profiles
-- This script creates or updates credits to link them to artist profiles based on creator tags
-- Run this after artists are set up with creator tags in the artist_tags table

-- Step 1: For each artist with a creator tag, ensure there's a matching credit record
-- This will create credits if they don't exist, or update existing ones

-- Create credits for artists that don't have them yet
INSERT OR IGNORE INTO credits (name, artist_id, verified, notes)
SELECT 
    a.display_name,
    a.id,
    1,
    'Auto-generated from artist profile'
FROM artists a
WHERE a.status = 'active'
AND NOT EXISTS (
    SELECT 1 FROM credits c WHERE c.artist_id = a.id
);

-- Step 2: Update existing credits that match artist names but aren't linked
UPDATE credits
SET artist_id = (
    SELECT a.id 
    FROM artists a 
    WHERE a.name = credits.name 
       OR a.display_name = credits.name
    LIMIT 1
)
WHERE artist_id IS NULL
AND EXISTS (
    SELECT 1 
    FROM artists a 
    WHERE (a.name = credits.name OR a.display_name = credits.name)
      AND a.status = 'active'
);

-- Step 3: Report on credits that are now linked
SELECT 
    c.id,
    c.name as credit_name,
    a.name as artist_name,
    a.display_name,
    'Linked successfully' as status
FROM credits c
JOIN artists a ON c.artist_id = a.id
ORDER BY c.id;

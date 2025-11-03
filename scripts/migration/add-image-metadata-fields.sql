-- Add image-specific metadata fields
-- Migration: Add title, source, and license fields to images table

-- Add title field for image titles
ALTER TABLE images ADD COLUMN title TEXT;

-- Add source field for where the image came from
ALTER TABLE images ADD COLUMN source TEXT;

-- Add license field for image-specific licensing
ALTER TABLE images ADD COLUMN license TEXT;

-- Verify the changes
SELECT 'Migration complete. New fields added to images table.' as status;

-- Migration: Add image metadata fields (title, source, license)
-- These fields allow storing image-specific metadata separate from artist attribution

ALTER TABLE images ADD COLUMN title TEXT;
ALTER TABLE images ADD COLUMN source TEXT;
ALTER TABLE images ADD COLUMN license TEXT;

SELECT 'Added metadata fields to images table' as status;

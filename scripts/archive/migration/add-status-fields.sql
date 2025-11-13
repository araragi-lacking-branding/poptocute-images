-- Migration: Add status fields to tags and artists
-- Created: 2025-11-02
-- Purpose: Enable show/hide/delete functionality for tags and artists

-- Add status column to tags table
-- Values: 'active' (visible), 'hidden' (not visible to end users), 'deleted' (soft delete)
ALTER TABLE tags ADD COLUMN status TEXT DEFAULT 'active' CHECK (status IN ('active', 'hidden', 'deleted'));

-- Add status column to artists table
-- Values: 'active' (visible), 'hidden' (not visible to end users), 'deleted' (soft delete)
ALTER TABLE artists ADD COLUMN status TEXT DEFAULT 'active' CHECK (status IN ('active', 'hidden', 'deleted'));

-- Create index for better query performance on hidden/deleted items
CREATE INDEX IF NOT EXISTS idx_tags_status ON tags(status);
CREATE INDEX IF NOT EXISTS idx_artists_status ON artists(status);
CREATE INDEX IF NOT EXISTS idx_images_status ON images(status);

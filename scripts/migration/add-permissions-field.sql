-- Add permissions field to images table
-- Migration: Add permissions field for tracking usage rights

ALTER TABLE images ADD COLUMN permissions TEXT;

-- Verify the change
SELECT 'Migration complete. Permissions field added to images table.' as status;

-- Migration: Add permissions field for explicit usage rights tracking

ALTER TABLE images ADD COLUMN permissions TEXT;

SELECT 'Added permissions field to images table' as status;

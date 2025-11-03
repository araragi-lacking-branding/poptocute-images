-- Migration: Add comprehensive image metadata fields
-- Created: 2025-11-03
-- Purpose: Store EXIF and MediaInfo standard metadata for all images

-- Add EXIF/MediaInfo standard fields
ALTER TABLE images ADD COLUMN exif_data TEXT;           -- Full EXIF metadata as JSON
ALTER TABLE images ADD COLUMN color_space TEXT;         -- sRGB, RGB, Adobe RGB, CMYK, etc.
ALTER TABLE images ADD COLUMN bit_depth INTEGER;        -- 8, 16, 24, 32 bits per channel
ALTER TABLE images ADD COLUMN orientation INTEGER DEFAULT 1;  -- EXIF orientation 1-8
ALTER TABLE images ADD COLUMN date_taken TEXT;          -- When photo was taken (from EXIF)

-- Add computed/technical fields
ALTER TABLE images ADD COLUMN aspect_ratio REAL;        -- width/height for responsive layouts
ALTER TABLE images ADD COLUMN has_alpha BOOLEAN DEFAULT 0;  -- Has transparency channel
ALTER TABLE images ADD COLUMN is_animated BOOLEAN DEFAULT 0;  -- Animated GIF/WebP/APNG
ALTER TABLE images ADD COLUMN frame_count INTEGER DEFAULT 1;  -- Number of frames

-- Add format detection field (derived from mime_type but more specific)
ALTER TABLE images ADD COLUMN format TEXT;              -- JPEG, PNG, GIF, WebP, AVIF

-- Optional: DPI for print-quality images
ALTER TABLE images ADD COLUMN dpi_x INTEGER;
ALTER TABLE images ADD COLUMN dpi_y INTEGER;

-- Create indexes for commonly queried metadata
CREATE INDEX IF NOT EXISTS idx_images_dimensions ON images(width, height);
CREATE INDEX IF NOT EXISTS idx_images_format ON images(format);
CREATE INDEX IF NOT EXISTS idx_images_is_animated ON images(is_animated);
CREATE INDEX IF NOT EXISTS idx_images_date_taken ON images(date_taken);
CREATE INDEX IF NOT EXISTS idx_images_aspect_ratio ON images(aspect_ratio);

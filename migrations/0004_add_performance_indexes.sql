-- Migration: 0004_add_performance_indexes.sql
-- Goal: Improve query performance for random image selection, stats, and artist/tag lookups
-- as the database grows, ensuring scalability without affecting the random user experience.

-- Index for active images (used in random selection and stats)
CREATE INDEX idx_images_status_active ON images(status) WHERE status = 'active';

-- Index for image tags (used in random selection filtering)
CREATE INDEX idx_image_tags_image_id ON image_tags(image_id);

-- Index for active artists (used in artist API and filtering)
CREATE INDEX idx_artists_status_active ON artists(status) WHERE status = 'active';

-- Index for tag categories (used in tag grouping and filtering)
CREATE INDEX idx_tags_category_status ON tags(category_id, status) WHERE status = 'active';

-- Index for credits with artist linkage (used in attribution queries)
CREATE INDEX idx_credits_artist_id ON credits(artist_id);
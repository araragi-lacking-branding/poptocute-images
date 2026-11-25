-- Migration: drop the unused visitor IP and user-agent columns from feedback
-- They were meant for rate limiting, which Cloudflare's rate-limiting rules now
-- do at the edge without storing anything. No code writes them, and production
-- had 0 feedback rows when this was written (2026-11-25), so nothing is lost.
--
-- Apply with `wrangler d1 execute cutetopop-db --file migrations/0006_drop_feedback_ip_columns.sql`
-- (--local, then --remote). Not `d1 migrations apply` (see README). Runs once:
-- a second run fails at DROP COLUMN because the columns are already gone.

-- The view and index mention submitter_ip, and SQLite won't drop a column
-- that is still used, so remove them first and rebuild the view without it
DROP VIEW IF EXISTS v_feedback_pending;
DROP INDEX IF EXISTS idx_feedback_ip;

ALTER TABLE feedback DROP COLUMN submitter_ip;
ALTER TABLE feedback DROP COLUMN user_agent;

CREATE VIEW v_feedback_pending AS
SELECT
  f.id AS feedback_id,
  f.image_id,
  i.filename,
  f.type,
  f.data,
  f.created_at,
  COUNT(*) OVER (PARTITION BY f.image_id) AS feedback_count_for_image
FROM feedback f
JOIN images i ON f.image_id = i.id
WHERE f.status = 'pending'
ORDER BY f.created_at ASC;

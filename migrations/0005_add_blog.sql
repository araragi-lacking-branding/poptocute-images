-- Migration: blog posts that reference the main tag tables
-- Additive only: two new tables and their indexes. Nothing existing changes.
--
-- Apply with `wrangler d1 execute cutetopop-db --file migrations/0005_add_blog.sql`
-- (--local for wrangler dev, --remote for production). Do NOT use
-- `wrangler d1 migrations apply`: d1_migrations is empty on both databases
-- because 0001-0004 were applied by hand, so it would try to re-run them.

CREATE TABLE IF NOT EXISTS posts (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  slug TEXT NOT NULL UNIQUE,
  title TEXT NOT NULL,
  summary TEXT,
  body TEXT NOT NULL DEFAULT '',
  status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'published', 'hidden')),
  published_at TEXT,
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_posts_status_published ON posts(status, published_at DESC);

-- Many-to-many: which existing tags (content, character, creator, source) a post is about
CREATE TABLE IF NOT EXISTS post_tags (
  post_id INTEGER NOT NULL,
  tag_id INTEGER NOT NULL,
  created_at TEXT DEFAULT (datetime('now')),
  PRIMARY KEY (post_id, tag_id),
  FOREIGN KEY (post_id) REFERENCES posts(id) ON DELETE CASCADE,
  FOREIGN KEY (tag_id) REFERENCES tags(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_post_tags_tag ON post_tags(tag_id);

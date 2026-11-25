// src/blog/data.js
// D1 access for the blog: posts, post_tags, and lookups into the main tag tables.
//
// Public reads only ever return published posts and active tags, so hiding or
// deleting a tag (e.g. for a takedown) removes it from every blog page as well.

import { isValidSlug, slugify, normalizeTagName, stripControlChars } from '../lib/markdown.js';

export const POST_STATUSES = ['draft', 'published', 'hidden'];
export const LIMITS = { title: 200, summary: 500, body: 100_000, tags: 50, refs: 50 };
const BIND_CHUNK = 90;

// Until migrations/0005_add_blog.sql has been applied, D1 reports "no such table".
// Public pages treat that as "no posts yet" instead of failing.
export function isMissingTable(error) {
  return /no such table/i.test(String(error?.message ?? error));
}

export function tagHref(category, name) {
  return `/blog/tag/${encodeURIComponent(category)}/${encodeURIComponent(name)}`;
}

const POST_FIELDS = 'p.id, p.slug, p.title, p.summary, p.status, p.published_at, p.created_at, p.updated_at';

// ---------- public reads ----------

// Lists only need the start of each body (for the teaser); the feed asks for
// whole bodies with fullBody.
export async function listPublishedPosts(env, { tagId = null, limit = 20, offset = 0, fullBody = false } = {}) {
  const where = tagId
    ? `WHERE p.status = 'published' AND p.id IN (SELECT post_id FROM post_tags WHERE tag_id = ?)`
    : `WHERE p.status = 'published'`;
  const binds = tagId ? [tagId, limit + 1, offset] : [limit + 1, offset];
  const { results } = await env.DB.prepare(`
    SELECT ${POST_FIELDS}, ${fullBody ? 'p.body' : 'substr(p.body, 1, 4000) AS body'}
    FROM posts p
    ${where}
    ORDER BY p.published_at DESC, p.id DESC
    LIMIT ? OFFSET ?
  `).bind(...binds).all();
  const hasMore = results.length > limit;
  const posts = results.slice(0, limit);
  await attachTags(env, posts);
  return { posts, hasMore };
}

export async function getPublishedPost(env, slug) {
  const post = await env.DB.prepare(`
    SELECT ${POST_FIELDS}, p.body FROM posts p WHERE p.slug = ? AND p.status = 'published'
  `).bind(slug).first();
  if (post) await attachTags(env, [post]);
  return post ?? null;
}

// Active tags on each post, in category order (content, character, creator, source)
export async function attachTags(env, posts, { includeInactive = false } = {}) {
  for (const p of posts) p.tags = [];
  if (!posts.length) return posts;
  const byId = new Map(posts.map((p) => [p.id, p]));
  const ids = posts.map((p) => p.id);
  // D1 allows at most 100 bound parameters per query
  for (let start = 0; start < ids.length; start += BIND_CHUNK) {
    const chunk = ids.slice(start, start + BIND_CHUNK);
    const { results } = await env.DB.prepare(`
      SELECT pt.post_id, t.id, t.name, t.display_name, t.status, tc.name AS category
      FROM post_tags pt
      JOIN tags t ON t.id = pt.tag_id
      JOIN tag_categories tc ON tc.id = t.category_id
      WHERE pt.post_id IN (${chunk.map(() => '?').join(', ')}) ${includeInactive ? '' : `AND t.status = 'active'`}
      ORDER BY tc.sort_order, t.name
    `).bind(...chunk).all();
    for (const row of results) {
      const { post_id, ...tag } = row;
      byId.get(post_id)?.tags.push({ ...tag, href: tagHref(tag.category, tag.name) });
    }
  }
  return posts;
}

// Resolve [[tag]] references from a post body against active tags in one query.
// An un-prefixed name that exists in several categories resolves to the first
// category in sort order; [[creator:name]] picks one explicitly.
export async function resolveTagRefs(env, refs) {
  const resolved = new Map();
  const names = [...new Set(refs.map((r) => r.name))].slice(0, LIMITS.refs);
  if (!names.length) return resolved;
  const { results } = await env.DB.prepare(`
    SELECT t.name, t.display_name, tc.name AS category
    FROM tags t JOIN tag_categories tc ON tc.id = t.category_id
    WHERE t.status = 'active' AND LOWER(t.name) IN (${names.map(() => '?').join(', ')})
    ORDER BY tc.sort_order
  `).bind(...names).all();
  for (const row of results) {
    const name = normalizeTagName(row.name);
    const tag = { category: row.category, label: row.display_name || row.name, href: tagHref(row.category, row.name) };
    resolved.set(`${row.category}:${name}`, tag);
    if (!resolved.has(`:${name}`)) resolved.set(`:${name}`, tag);
  }
  return resolved;
}

export function refKey(ref) {
  return `${ref.category ?? ''}:${ref.name}`;
}

// A tag page: the tag, how many visible images carry it, and the credited
// artist for creator tags (attribution comes from the existing artist profiles)
export async function getPublicTag(env, category, name) {
  const tag = await env.DB.prepare(`
    SELECT t.id, t.name, t.display_name, t.description, tc.name AS category, tc.display_name AS category_display
    FROM tags t JOIN tag_categories tc ON tc.id = t.category_id
    WHERE tc.name = ? AND LOWER(t.name) = ? AND t.status = 'active'
  `).bind(category, normalizeTagName(name)).first();
  if (!tag) return null;

  const images = await env.DB.prepare(`
    SELECT COUNT(*) AS count
    FROM image_tags it
    JOIN images i ON i.id = it.image_id
    LEFT JOIN credits c ON i.credit_id = c.id
    LEFT JOIN artists a ON c.artist_id = a.id
    WHERE it.tag_id = ?
      AND i.status = 'active'
      AND (a.id IS NULL OR a.status = 'active')
      AND i.id NOT IN (
        SELECT it2.image_id FROM image_tags it2 JOIN tags t2 ON t2.id = it2.tag_id
        WHERE t2.status IN ('hidden', 'deleted')
      )
  `).bind(tag.id).first();
  tag.image_count = images?.count ?? 0;

  tag.artists = [];
  if (tag.category === 'creator') {
    const { results } = await env.DB.prepare(`
      SELECT a.id, a.name, a.display_name, a.website_url
      FROM artist_tags at JOIN artists a ON a.id = at.artist_id
      WHERE at.tag_id = ? AND a.status = 'active'
      ORDER BY a.name
    `).bind(tag.id).all();
    tag.artists = results;
  }
  return tag;
}

// ---------- admin ----------

export async function listAllPosts(env) {
  const { results } = await env.DB.prepare(`
    SELECT ${POST_FIELDS} FROM posts p
    ORDER BY CASE p.status WHEN 'draft' THEN 0 ELSE 1 END, COALESCE(p.published_at, p.created_at) DESC, p.id DESC
  `).all();
  await attachTags(env, results, { includeInactive: true });
  return results;
}

export async function getPostById(env, id, { includeInactiveTags = true } = {}) {
  const post = await env.DB.prepare(`SELECT ${POST_FIELDS}, p.body FROM posts p WHERE p.id = ?`).bind(id).first();
  if (post) await attachTags(env, [post], { includeInactive: includeInactiveTags });
  return post ?? null;
}

/**
 * Check and normalise an editor submission. The editor always sends the whole
 * post, so create and update share this.
 * @returns {{ ok: true, value: object } | { ok: false, errors: string[] }}
 */
export function validatePostInput(input, { now = new Date() } = {}) {
  const errors = [];
  if (!input || typeof input !== 'object' || Array.isArray(input)) return { ok: false, errors: ['Body must be a JSON object'] };

  // Text fields must be strings when present; control characters are dropped
  // (they would make the Atom feed invalid XML)
  const text = (field, label) => {
    const value = input[field];
    if (value === undefined || value === null) return '';
    if (typeof value !== 'string') { errors.push(`${label} must be text`); return ''; }
    return stripControlChars(value);
  };

  const title = text('title', 'Title').trim();
  if (!title) errors.push('Title is required');
  else if (title.length > LIMITS.title) errors.push(`Title must be at most ${LIMITS.title} characters`);

  let slug = text('slug', 'Slug').trim().toLowerCase();
  if (!slug) slug = slugify(title) || `post-${now.toISOString().slice(0, 19).replace(/\D/g, '')}`;
  if (!isValidSlug(slug)) errors.push('Slug may only use a-z, 0-9 and single hyphens (max 80)');

  const summary = text('summary', 'Summary').trim();
  if (summary.length > LIMITS.summary) errors.push(`Summary must be at most ${LIMITS.summary} characters`);

  const body = text('body', 'Body').replace(/\r\n?/g, '\n');
  if (body.length > LIMITS.body) errors.push(`Body must be at most ${LIMITS.body} characters`);

  const status = input.status === undefined ? 'draft' : input.status;
  if (!POST_STATUSES.includes(status)) errors.push(`Status must be one of ${POST_STATUSES.join(', ')}`);

  const rawTags = input.tag_ids === undefined ? [] : input.tag_ids;
  let tagIds = [];
  if (!Array.isArray(rawTags) || !rawTags.every((t) => Number.isInteger(t) && t > 0)) {
    errors.push('tag_ids must be an array of tag ids');
  } else {
    tagIds = [...new Set(rawTags)];
    if (tagIds.length > LIMITS.tags) errors.push(`At most ${LIMITS.tags} tags per post`);
  }

  if (errors.length) return { ok: false, errors };
  return { ok: true, value: { title, slug, summary: summary || null, body, status, tag_ids: tagIds } };
}

export function isUniqueSlugError(error) {
  return /UNIQUE constraint failed: posts\.slug/i.test(String(error?.message ?? error));
}

// Post row and tag links are written in one D1 batch (one transaction), so a
// failure can't leave a post with half its tags. INSERT ... SELECT skips tag
// ids that don't exist instead of failing.
export async function createPost(env, value) {
  const postId = '(SELECT id FROM posts WHERE slug = ?)';
  const [inserted] = await env.DB.batch([
    env.DB.prepare(`
      INSERT INTO posts (slug, title, summary, body, status, published_at)
      VALUES (?, ?, ?, ?, ?, CASE WHEN ? = 'published' THEN datetime('now') END)
      RETURNING id
    `).bind(value.slug, value.title, value.summary, value.body, value.status, value.status),
    ...value.tag_ids.map((tagId) => env.DB.prepare(
      `INSERT OR IGNORE INTO post_tags (post_id, tag_id) SELECT ${postId}, id FROM tags WHERE id = ?`,
    ).bind(value.slug, tagId)),
  ]);
  return getPostById(env, inserted.results[0].id);
}

// Returns null when the post doesn't exist. published_at is set the first time a
// post is published and kept after that (re-publishing a hidden post keeps its date).
export async function updatePost(env, id, value) {
  const [updated] = await env.DB.batch([
    env.DB.prepare(`
      UPDATE posts SET
        slug = ?, title = ?, summary = ?, body = ?, status = ?,
        published_at = CASE WHEN ? = 'published' AND published_at IS NULL THEN datetime('now') ELSE published_at END,
        updated_at = datetime('now')
      WHERE id = ?
    `).bind(value.slug, value.title, value.summary, value.body, value.status, value.status, id),
    env.DB.prepare('DELETE FROM post_tags WHERE post_id = ?').bind(id),
    ...value.tag_ids.map((tagId) => env.DB.prepare(
      'INSERT OR IGNORE INTO post_tags (post_id, tag_id) SELECT ?, id FROM tags WHERE id = ? AND EXISTS (SELECT 1 FROM posts WHERE id = ?)',
    ).bind(id, tagId, id)),
  ]);
  if (!updated.meta?.changes) return null;
  return getPostById(env, id);
}

export async function deletePost(env, id) {
  const [, del] = await env.DB.batch([
    env.DB.prepare('DELETE FROM post_tags WHERE post_id = ?').bind(id),
    env.DB.prepare('DELETE FROM posts WHERE id = ?').bind(id),
  ]);
  return (del.meta?.changes ?? 0) > 0;
}

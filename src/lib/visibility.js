// src/lib/visibility.js
// One definition of "this image may be shown to the public", used by every
// public path (random image, image list, image files, artist samples) so a
// takedown applies everywhere at once.
//
// An image is public when it is active, its credited artist (if any) is
// active, and none of its tags is hidden or deleted.

// FROM clause the condition below expects (aliases i, c, a)
export const PUBLIC_IMAGE_FROM = `
  images i
  LEFT JOIN credits c ON i.credit_id = c.id
  LEFT JOIN artists a ON c.artist_id = a.id`;

export const PUBLIC_IMAGE_WHERE = `
  i.status = 'active'
  AND (a.id IS NULL OR a.status = 'active')
  AND i.id NOT IN (
    SELECT it.image_id
    FROM image_tags it
    JOIN tags t ON it.tag_id = t.id
    WHERE t.status IN ('hidden', 'deleted')
  )`;

// R2 keys look like "images/<hash>.<ext>"; nothing else is ever served
export function isImageKey(key) {
  return typeof key === 'string' && /^images\/[A-Za-z0-9_-]{1,100}\.[A-Za-z0-9]{1,5}$/.test(key) && !key.includes('..');
}

// Is the image stored under this R2 key public right now? (one indexed D1 read)
export async function isImagePublic(env, key) {
  const row = await env.DB.prepare(`
    SELECT 1 AS ok FROM ${PUBLIC_IMAGE_FROM}
    WHERE (i.filename = ? OR i.filename = ?) AND ${PUBLIC_IMAGE_WHERE}
    LIMIT 1
  `).bind(key, key.replace(/^images\//, '')).first();
  return Boolean(row);
}

// test/hardening.test.mjs
// Fixes from the 2026-11-25 security audit of the existing code, tested through
// the real Worker with an in-memory D1 (test/helpers/d1.mjs) and stub R2/KV.
import { test, before, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { createD1, PROD_SCHEMA } from './helpers/d1.mjs';

const PROD = 'https://cutetopop.com';
const ctx = { waitUntil() {} };
let worker, isCrossSiteWrite, pageParams, generateAdminUI;

before(async () => {
  globalThis.fetch = async (url) => { throw new Error(`unexpected network call: ${url}`); };
  worker = (await import('../src/index.js')).default;
  ({ pageParams } = await import('../src/index.js'));
  ({ isCrossSiteWrite } = await import('../src/lib/request-guards.js'));
  ({ generateAdminUI } = await import('../src/admin/ui.js'));
});

beforeEach(() => {
  console.warn = () => {};
  console.log = () => {};
  console.error = () => {};
});

// Categories: content=1, character=2, creator=3, source=4
const SEED = `
  INSERT INTO artists (id, name, display_name, website_url) VALUES
    (1, 'shown', 'Shown Artist', 'https://example.com'),
    (2, 'gone', 'Hidden Artist', 'https://example.com/gone');
  UPDATE artists SET status = 'hidden' WHERE id = 2;
  INSERT INTO credits (id, name, artist_id) VALUES (2, 'Shown', 1), (3, 'Gone', 2);
  INSERT INTO tags (id, name, display_name, category_id) VALUES
    (1, 'ok', 'ok', 1), (2, 'secret', 'secret', 1), (3, 'shown', 'Shown Artist', 3);
  UPDATE tags SET status = 'hidden' WHERE id = 2;
  INSERT INTO artist_tags (artist_id, tag_id) VALUES (1, 3), (1, 2);
  INSERT INTO images (id, filename, credit_id, status, alt_text, notes, permissions, file_hash) VALUES
    (1, 'images/aaaa000000000001.png', 2, 'active', 'x" onerror="alert(1)', 'INTERNAL NOTE', 'private', 'deadbeef'),
    (2, 'images/aaaa000000000002.png', 1, 'hidden', NULL, NULL, NULL, NULL),
    (3, 'images/aaaa000000000003.png', 1, 'deleted', NULL, NULL, NULL, NULL),
    (4, 'images/aaaa000000000004.png', 3, 'active', NULL, NULL, NULL, NULL),
    (5, 'images/aaaa000000000005.png', 2, 'active', NULL, NULL, NULL, NULL);
  INSERT INTO image_tags (image_id, tag_id) VALUES (1, 1), (5, 2);
`;
// image 1 public; 2 hidden; 3 deleted; 4 by a hidden artist; 5 has a hidden tag
const KEY = (n) => `images/aaaa00000000000${n}.png`;

function makeEnv({ bypass = false, r2Error = false } = {}) {
  const DB = createD1({ files: PROD_SCHEMA });
  DB.raw.exec(SEED);
  const puts = [];
  const IMAGES = {
    async get(key) {
      if (r2Error) throw new Error('R2 internal detail xyz');
      return { body: `bytes of ${key}`, httpMetadata: { contentType: 'image/png' } };
    },
    async put(key, _value, options) { puts.push({ key, options }); },
  };
  const kv = new Map();
  const IMAGES_CACHE = { get: async (k) => kv.get(k) ?? null, put: async (k, v) => { kv.set(k, v); } };
  const env = { DB, IMAGES, IMAGES_CACHE, ACCESS_TEAM_DOMAIN: 'kageki.cloudflareaccess.com', ACCESS_AUD: 'aud' };
  if (bypass) env.ACCESS_DEV_BYPASS = 'true';
  return { env, puts };
}

const call = (env, path, init = {}) => worker.fetch(new Request(PROD + path, init), env, ctx);

// ---------- CSRF ----------

test('isCrossSiteWrite: only same-origin writes pass', () => {
  const url = new URL(`${PROD}/api/admin/tags`);
  const req = (method, headers = {}) => new Request(url, { method, headers });
  assert.equal(isCrossSiteWrite(req('GET', { Origin: 'https://evil.example' }), {}, url), false, 'reads are not writes');
  assert.equal(isCrossSiteWrite(req('POST', { Origin: PROD }), {}, url), false);
  assert.equal(isCrossSiteWrite(req('POST', { Origin: 'https://evil.example' }), {}, url), true);
  assert.equal(isCrossSiteWrite(req('DELETE', { Origin: 'https://www.cutetopop.com' }), {}, url), true, 'subdomains are other origins');
  assert.equal(isCrossSiteWrite(req('POST', { Origin: 'null' }), {}, url), true);
  assert.equal(isCrossSiteWrite(req('POST', { 'Sec-Fetch-Site': 'cross-site' }), {}, url), true);
  assert.equal(isCrossSiteWrite(req('POST', { 'Sec-Fetch-Site': 'same-origin' }), {}, url), false);
  assert.equal(isCrossSiteWrite(req('POST'), {}, url), false, 'non-browser clients send neither header');
  // localhost is trusted only when the dev bypass is on
  assert.equal(isCrossSiteWrite(req('POST', { Origin: 'http://localhost:8787' }), {}, url), true);
  assert.equal(isCrossSiteWrite(req('POST', { Origin: 'http://localhost:8787' }), { ACCESS_DEV_BYPASS: 'true' }, url), false);
});

test('a cross-site form post to the admin API is refused before any handler runs', async () => {
  const { env } = makeEnv({ bypass: true });
  const before = env.DB.raw.prepare('SELECT COUNT(*) AS n FROM tags').get().n;
  const res = await call(env, '/api/admin/tags', {
    method: 'POST',
    headers: { Origin: 'https://evil.example', 'Content-Type': 'text/plain' },
    body: JSON.stringify({ name: 'pwned', category: 'content' }),
  });
  assert.equal(res.status, 403);
  assert.equal(env.DB.raw.prepare('SELECT COUNT(*) AS n FROM tags').get().n, before);
});

test('admin responses cannot be framed or sniffed', async () => {
  const { env } = makeEnv({ bypass: true });
  for (const path of ['/admin/images', '/admin/artists', '/api/admin/tags']) {
    const res = await call(env, path);
    assert.equal(res.headers.get('X-Frame-Options'), 'DENY', path);
    assert.match(res.headers.get('Content-Security-Policy'), /frame-ancestors 'none'/, path);
    assert.equal(res.headers.get('X-Content-Type-Options'), 'nosniff', path);
  }
  const redirect = await call(env, '/admin');
  assert.equal(redirect.status, 302);
  assert.equal(redirect.headers.get('X-Frame-Options'), 'DENY');
});

// ---------- SQL injection ----------

test('image tag update binds tag ids and rejects non-integers', async () => {
  const { env } = makeEnv({ bypass: true });
  const put = (tags) => call(env, '/api/admin/images/2', {
    method: 'PUT', headers: { Origin: PROD, 'Content-Type': 'application/json' }, body: JSON.stringify({ tags }),
  });
  assert.equal((await put(['1), (1, 3'])).status, 400);
  assert.equal((await put([1.5])).status, 400);
  assert.equal(env.DB.raw.prepare('SELECT COUNT(*) AS n FROM image_tags WHERE image_id = 1').get().n, 1, 'no injected rows');
  assert.equal((await put([1, 3, 999])).status, 200);
  const rows = env.DB.raw.prepare('SELECT tag_id FROM image_tags WHERE image_id = 2 ORDER BY tag_id').all().map((r) => r.tag_id);
  assert.deepEqual(rows, [1, 3], 'unknown tag 999 skipped');
  assert.equal((await put([3])).status, 200);
  assert.deepEqual(env.DB.raw.prepare('SELECT tag_id FROM image_tags WHERE image_id = 2').all().map((r) => r.tag_id), [3]);
});

// ---------- takedowns ----------

test('only public images are served; hidden, deleted and taken-down ones 404', async () => {
  const { env } = makeEnv();
  const ok = await call(env, `/${KEY(1)}`);
  assert.equal(ok.status, 200);
  assert.equal(ok.headers.get('X-Content-Type-Options'), 'nosniff');
  assert.equal(ok.headers.get('Cache-Control'), 'public, max-age=86400');
  for (const n of [2, 3, 4, 5]) {
    assert.equal((await call(env, `/${KEY(n)}`)).status, 404, `image ${n}`);
    assert.equal((await call(env, `/cdn-cgi/image/format=webp/${KEY(n)}`)).status, 404, `resized image ${n}`);
  }
  assert.equal((await call(env, `/cdn-cgi/image/format=webp/${KEY(1)}`)).status, 200);
  for (const bad of ['/images/..%2Fadmin', '/images/x', '/images/a.png/b', '/images/notindb00000000.png']) {
    assert.equal((await call(env, bad)).status, 404, bad);
  }
  assert.equal((await call(env, `/${KEY(1)}`, { method: 'POST' })).status, 405);
});

test('image errors do not leak internals', async () => {
  const { env } = makeEnv({ r2Error: true });
  const res = await call(env, `/${KEY(1)}`);
  assert.equal(res.status, 500);
  assert.ok(!(await res.text()).includes('xyz'));
});

test('admins still see every image through the admin file route', async () => {
  const { env } = makeEnv({ bypass: true });
  for (const n of [1, 2, 3, 4, 5]) {
    const res = await call(env, `/api/admin/files/${KEY(n)}`);
    assert.equal(res.status, 200, `image ${n}`);
    assert.equal(res.headers.get('Cache-Control'), 'private, no-store');
  }
  assert.equal((await call(env, '/api/admin/files/images/../x')).status, 404);
  const { env: noLogin } = makeEnv();
  assert.equal((await call(noLogin, `/api/admin/files/${KEY(2)}`)).status, 403);
});

test('/api/random never returns admin-only fields', async () => {
  const { env } = makeEnv();
  for (let i = 0; i < 5; i++) {
    const data = await (await call(env, '/api/random')).json();
    assert.equal(data.filename, KEY(1), 'the only public image');
    for (const field of ['notes', 'permissions', 'file_hash']) assert.ok(!(field in data), field);
  }
  // the count fallback uses the same filters (1 public image, not 4 active)
  assert.equal(await env.IMAGES_CACHE.get('active-count'), '1');
});

test('public artist API hides hidden artists, hidden tags and non-public images', async () => {
  const { env } = makeEnv();
  const list = await (await call(env, '/api/artists')).json();
  assert.deepEqual(list.artists.map((a) => a.id), [1]);
  assert.equal((await call(env, '/api/artists/2')).status, 404);
  const one = await (await call(env, '/api/artists/1')).json();
  assert.deepEqual(one.creator_tags.map((t) => t.id), [3]);
  assert.deepEqual(one.sample_images.map((i) => i.filename), [KEY(1)]);
});

test('/images.json fallback applies the takedown filters', async () => {
  const { env } = makeEnv();
  const list = await (await call(env, '/images.json')).json();
  assert.deepEqual(list, [KEY(1)]);
});

test('page parameters are clamped', () => {
  const p = (q) => pageParams(new URLSearchParams(q), 20);
  assert.deepEqual(p(''), { limit: 20, offset: 0 });
  assert.deepEqual(p('limit=-1&offset=-5'), { limit: 20, offset: 0 });
  assert.deepEqual(p('limit=abc'), { limit: 20, offset: 0 });
  assert.deepEqual(p('limit=0'), { limit: 1, offset: 0 });
  assert.deepEqual(p('limit=5000&offset=40'), { limit: 100, offset: 40 });
});

// ---------- escaping ----------

test('main page escapes database values in attributes', async () => {
  const { env } = makeEnv();
  const html = await (await call(env, '/')).text();
  assert.ok(html.includes('alt="x&quot; onerror=&quot;alert(1)"'), 'alt text escaped');
  assert.ok(!html.includes('onerror="alert(1)"'));

  // The page's own browser helpers: escapeHtml covers quotes, safeUrl only allows http(s)
  const start = html.indexOf('function escapeHtml');
  const end = html.indexOf('// Format file size');
  const helpers = vm.runInNewContext(`${html.slice(start, end)}; ({ escapeHtml, safeUrl })`, { URL });
  assert.equal(helpers.escapeHtml(`a"b'c<d>&`), 'a&quot;b&#39;c&lt;d&gt;&amp;');
  assert.equal(helpers.safeUrl('javascript:alert(1)'), null);
  assert.equal(helpers.safeUrl('data:text/html,x'), null);
  assert.equal(helpers.safeUrl('https://example.com/a'), 'https://example.com/a');
});

test('admin page scripts still compile and escape what they render', () => {
  for (const view of ['images', 'artists']) {
    const html = generateAdminUI(view);
    const scripts = [...html.matchAll(/<script>([\s\S]*?)<\/script>/g)].map((m) => m[1]);
    assert.ok(scripts.length > 0);
    for (const s of scripts) new vm.Script(s); // throws on a syntax error
    const esc = vm.runInNewContext(`${html.slice(html.indexOf('function esc('), html.indexOf('function renderTagLists'))}; esc`);
    assert.equal(esc(`<img src=x onerror="a">'`), '&lt;img src=x onerror=&quot;a&quot;&gt;&#39;');
    assert.ok(html.includes("'/api/admin/files/' + data.filename"));
  }
});

test('uploads take the extension from the image type, not the file name', async () => {
  const { env, puts } = makeEnv({ bypass: true });
  // 1x1 PNG
  const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==', 'base64');
  const form = new FormData();
  form.append('file', new File([png], 'a.b/evil" onload="x', { type: 'image/png' }));
  const res = await call(env, '/api/admin/upload', { method: 'POST', headers: { Origin: PROD }, body: form });
  assert.ok(res.status < 300, `upload status ${res.status}`);
  assert.equal(puts.length, 1);
  assert.match(puts[0].key, /^images\/[0-9a-f]{16}\.png$/);
});

// test/blog.test.mjs
// The blog end to end through the real Worker (src/index.js): admin API behind
// the Access gate, public pages, tag references into the main tag tables, and
// hidden tags staying hidden. D1 is Node's SQLite with the project's real schema
// (test/helpers/d1.mjs). No network or Cloudflare account needed.
import { test, before, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';
import { build } from 'esbuild'; // installed with wrangler; same bundler Wrangler uses
import { createD1, PROD_SCHEMA } from './helpers/d1.mjs';

const ORIGIN = 'http://localhost:8787';
const ctx = { waitUntil() {} };
const kv = { get: async () => null, put: async () => {} };
let worker;

before(async () => {
  globalThis.fetch = async (url) => { throw new Error(`unexpected network call: ${url}`); };
  worker = (await import('../src/index.js')).default;
});

beforeEach(() => {
  console.warn = () => {}; // the dev bypass warns on every admin request by design
});

// Categories from schema.sql: content=1, character=2, creator=3, source=4
const SEED = `
  INSERT INTO artists (id, name, display_name, website_url) VALUES
    (1, 'shaft', 'Studio SHAFT', 'https://example.com/shaft');
  INSERT INTO credits (id, name, artist_id) VALUES (2, 'SHAFT', 1);
  INSERT INTO tags (id, name, display_name, category_id) VALUES
    (1, 'seifuku', 'seifuku', 1),
    (2, 'studio-shaft', 'Studio SHAFT', 4),
    (3, 'studio-shaft', 'Studio SHAFT', 3),
    (4, 'secret-character', 'Secret Character', 2);
  UPDATE tags SET status = 'hidden' WHERE id = 4;
  INSERT INTO artist_tags (artist_id, tag_id) VALUES (1, 3);
  INSERT INTO images (id, filename, credit_id) VALUES
    (1, 'images/a.jpg', 2), (2, 'images/b.jpg', 2), (3, 'images/c.jpg', 1);
  INSERT INTO image_tags (image_id, tag_id) VALUES (1, 3), (2, 3), (2, 4), (3, 1);
`;

function makeEnv({ blogTables = true, seed = true } = {}) {
  const DB = createD1({ files: blogTables ? [...PROD_SCHEMA, 'migrations/0005_add_blog.sql'] : PROD_SCHEMA });
  if (seed) DB.raw.exec(SEED);
  const env = { DB, IMAGES_CACHE: kv, ACCESS_TEAM_DOMAIN: 'kageki.cloudflareaccess.com', ACCESS_AUD: 'aud' };
  return { env, adminEnv: { ...env, ACCESS_DEV_BYPASS: 'true' } };
}

async function get(env, path, origin = ORIGIN) {
  const res = await worker.fetch(new Request(origin + path), env, ctx);
  return { res, text: await res.text() };
}

async function admin(adminEnv, method, path, body) {
  const init = { method, headers: { 'Content-Type': 'application/json' } };
  if (body !== undefined) init.body = typeof body === 'string' ? body : JSON.stringify(body);
  const res = await worker.fetch(new Request(`${ORIGIN}/api/admin${path}`, init), adminEnv, ctx);
  return { status: res.status, data: await res.json() };
}

const BODY = 'Made by [[studio-shaft]], also a [[source:studio-shaft|source]]. Not [[secret-character]].\n\n![still](/images/a.jpg)';

test('the Access gate covers every new admin route', async () => {
  const { env } = makeEnv();
  for (const path of ['/admin/blog', '/admin/blog/preview/1', '/api/admin/posts', '/api/admin/posts/1']) {
    const { res } = await get(env, path, 'https://cutetopop.com');
    assert.equal(res.status, 403, path);
  }
  const res = await worker.fetch(new Request('https://cutetopop.com/api/admin/posts', {
    method: 'POST', body: '{"title":"x"}', headers: { 'Content-Type': 'application/json' },
  }), env, ctx);
  assert.equal(res.status, 403);
});

test('draft -> published -> hidden lifecycle, and what the public sees', async () => {
  const { env, adminEnv } = makeEnv();

  const created = await admin(adminEnv, 'POST', '/posts', { title: 'First Notes!', body: BODY, tag_ids: [3, 1, 4] });
  assert.equal(created.status, 201);
  const post = created.data.post;
  assert.equal(post.slug, 'first-notes');
  assert.equal(post.status, 'draft');
  assert.equal(post.published_at, null);
  assert.deepEqual(post.tags.map((t) => t.id).sort(), [1, 3, 4], 'admin sees all attached tags, hidden included');

  // Drafts aren't public
  assert.equal((await get(env, '/blog/first-notes')).res.status, 404);
  assert.ok(!(await get(env, '/blog')).text.includes('First Notes'));

  // ...but admins can preview them
  const preview = await get(adminEnv, `/admin/blog/preview/${post.id}`);
  assert.equal(preview.res.status, 200);
  assert.match(preview.text, /Preview · status: draft/);
  assert.equal(preview.res.headers.get('Cache-Control'), 'no-store');

  const published = await admin(adminEnv, 'PUT', `/posts/${post.id}`, { ...post, status: 'published', tag_ids: [3, 1, 4] });
  assert.equal(published.status, 200);
  const firstPublishedAt = published.data.post.published_at;
  assert.ok(firstPublishedAt);

  const list = await get(env, '/blog');
  assert.equal(list.res.status, 200);
  assert.match(list.text, /href="\/blog\/first-notes">First Notes!/);

  const page = await get(env, '/blog/first-notes');
  assert.equal(page.res.status, 200);
  // Pills: active tags only, in category order
  assert.match(page.text, /data-category="content" title="content" href="\/blog\/tag\/content\/seifuku">seifuku</);
  assert.match(page.text, /data-category="creator" title="creator" href="\/blog\/tag\/creator\/studio-shaft">Studio SHAFT</);
  assert.ok(!page.text.includes('Secret Character'), 'hidden tag must not appear anywhere');
  assert.ok(!page.text.includes('/blog/tag/character/secret-character'));
  // Inline references: un-prefixed picks the first category in sort order (creator before source)
  assert.match(page.text, /Made by <a class="tag" data-category="creator" href="\/blog\/tag\/creator\/studio-shaft">Studio SHAFT<\/a>/);
  assert.match(page.text, /<a class="tag" data-category="source" href="\/blog\/tag\/source\/studio-shaft">source<\/a>/);
  assert.match(page.text, /<span class="tag-ref missing">secret-character<\/span>/);
  assert.match(page.text, /<img src="\/images\/a\.jpg" alt="still"/);
  // Public pages carry no scripts and a strict CSP
  assert.ok(!page.text.includes('<script'));
  assert.match(page.res.headers.get('Content-Security-Policy'), /default-src 'none'/);

  // Hide it: gone from the public site; publishing again keeps the original date
  await admin(adminEnv, 'PUT', `/posts/${post.id}`, { ...post, status: 'hidden' });
  assert.equal((await get(env, '/blog/first-notes')).res.status, 404);
  const again = await admin(adminEnv, 'PUT', `/posts/${post.id}`, { ...post, status: 'published' });
  assert.equal(again.data.post.published_at, firstPublishedAt);
});

test('tag pages: attribution for creator tags, counts that respect hidden tags', async () => {
  const { env, adminEnv } = makeEnv();
  await admin(adminEnv, 'POST', '/posts', { title: 'About SHAFT', body: 'hi', status: 'published', tag_ids: [3] });
  await admin(adminEnv, 'POST', '/posts', { title: 'Unrelated draft', body: 'hi', tag_ids: [3] });

  const page = await get(env, '/blog/tag/creator/studio-shaft');
  assert.equal(page.res.status, 200);
  assert.match(page.text, /Artist: <a href="https:\/\/example\.com\/shaft" rel="noopener noreferrer">Studio SHAFT<\/a>/);
  // images 1 and 2 carry the tag, but image 2 also has a hidden tag
  assert.match(page.text, /1 image on the site · 1 post/);
  assert.match(page.text, /About SHAFT/);
  assert.ok(!page.text.includes('Unrelated draft'));

  // The source tag of the same name is a separate page with no artist line
  const source = await get(env, '/blog/tag/source/studio-shaft');
  assert.equal(source.res.status, 200);
  assert.ok(!source.text.includes('Artist:'));

  for (const path of ['/blog/tag/character/secret-character', '/blog/tag/creator/nobody', '/blog/tag/bogus/seifuku', '/blog/tag/creator/%E0%A4%A']) {
    assert.equal((await get(env, path)).res.status, 404, path);
  }
});

test('admin API validation and errors', async () => {
  const { adminEnv } = makeEnv();
  assert.equal((await admin(adminEnv, 'POST', '/posts', { body: 'no title' })).status, 400);
  assert.equal((await admin(adminEnv, 'POST', '/posts', { title: 'x', slug: 'Bad Slug' })).status, 400);
  assert.equal((await admin(adminEnv, 'POST', '/posts', { title: 'x', status: 'live' })).status, 400);
  assert.equal((await admin(adminEnv, 'POST', '/posts', { title: 'x', tag_ids: ['3'] })).status, 400);
  assert.equal((await admin(adminEnv, 'POST', '/posts', { title: 'x', body: 'y'.repeat(100_001) })).status, 400);
  assert.equal((await admin(adminEnv, 'POST', '/posts', 'not json')).status, 400);
  assert.equal((await admin(adminEnv, 'POST', '/posts', [1, 2])).status, 400);

  // Japanese-only title: falls back to a date slug
  const jp = await admin(adminEnv, 'POST', '/posts', { title: '魔法少女' });
  assert.equal(jp.status, 201);
  assert.match(jp.data.post.slug, /^post-\d{14}$/);

  // Unknown tag ids are skipped rather than failing the save
  const ghost = await admin(adminEnv, 'POST', '/posts', { title: 'Ghost tags', tag_ids: [1, 999] });
  assert.deepEqual(ghost.data.post.tags.map((t) => t.id), [1]);

  assert.equal((await admin(adminEnv, 'POST', '/posts', { title: 'Ghost tags' })).status, 409, 'duplicate slug');
  assert.equal((await admin(adminEnv, 'PUT', '/posts/999', { title: 'x' })).status, 404);
  assert.equal((await admin(adminEnv, 'GET', '/posts/999')).status, 404);
  assert.equal((await admin(adminEnv, 'PATCH', '/posts/1', {})).status, 405);
});

test('delete removes the post and its tag links', async () => {
  const { adminEnv, env } = makeEnv();
  const { data } = await admin(adminEnv, 'POST', '/posts', { title: 'Temp', tag_ids: [1, 3] });
  assert.equal((await admin(adminEnv, 'DELETE', `/posts/${data.post.id}`)).status, 200);
  assert.equal((await admin(adminEnv, 'GET', `/posts/${data.post.id}`)).status, 404);
  assert.equal((await admin(adminEnv, 'DELETE', `/posts/${data.post.id}`)).status, 404);
  assert.equal(env.DB.raw.prepare('SELECT COUNT(*) AS n FROM post_tags').get().n, 0);
  // The tags themselves are untouched
  assert.equal(env.DB.raw.prepare('SELECT COUNT(*) AS n FROM tags').get().n, 4);
});

test('pagination and the Atom feed', async () => {
  const { env, adminEnv } = makeEnv();
  for (let i = 1; i <= 12; i++) {
    await admin(adminEnv, 'POST', '/posts', { title: `Post ${i}`, body: `See [[creator:studio-shaft]] #${i}`, status: 'published', tag_ids: [3] });
  }
  const first = await get(env, '/blog');
  assert.equal((first.text.match(/class="title"/g) || []).length, 10);
  assert.match(first.text, /href="\/blog\?page=2">older →/);
  const second = await get(env, '/blog?page=2');
  assert.equal((second.text.match(/class="title"/g) || []).length, 2);
  assert.match(second.text, /href="\/blog">← newer/);
  assert.equal((await get(env, '/blog?page=3')).res.status, 404);
  assert.equal((await get(env, '/blog?page=abc')).res.status, 200);

  const feed = await get(env, '/blog/feed.xml');
  assert.match(feed.res.headers.get('Content-Type'), /application\/atom\+xml/);
  assert.equal((feed.text.match(/<entry>/g) || []).length, 12);
  assert.match(feed.text, /<link href="http:\/\/localhost:8787\/blog\/post-12"\/>/);
  // Links inside the escaped HTML content are made absolute
  assert.match(feed.text, /href=&quot;http:\/\/localhost:8787\/blog\/tag\/creator\/studio-shaft&quot;/);
  assert.match(feed.text, /<category term="studio-shaft" label="Studio SHAFT"\/>/);
});

test('before the migration is applied: an empty blog, not an error', async () => {
  const { env, adminEnv } = makeEnv({ blogTables: false });
  const list = await get(env, '/blog');
  assert.equal(list.res.status, 200);
  assert.match(list.text, /No posts yet/);
  assert.equal((await get(env, '/blog/anything')).res.status, 404);
  const api = await admin(adminEnv, 'GET', '/posts');
  assert.equal(api.status, 503);
  assert.match(api.data.error, /0005_add_blog\.sql/);
});

test('routing details: methods, trailing slash, main page link', async () => {
  const { env } = makeEnv();
  const post = await worker.fetch(new Request(`${ORIGIN}/blog`, { method: 'POST' }), env, ctx);
  assert.equal(post.status, 405);
  assert.equal((await get(env, '/blog/')).res.status, 200);
  assert.equal((await get(env, '/blog/Not_A_Slug')).res.status, 404);
  // Non-blog paths that merely start with "blog" are untouched
  const { text: main } = await get(env, '/');
  assert.match(main, /<a href="\/blog">blog<\/a>/);
});

// The editor's browser code is serialised with Function.toString(). Wrangler's
// bundler (esbuild keepNames) inserts __name(...) calls into it, which would throw
// in the browser without the shim. Bundle the same way and run the script against
// a permissive fake DOM to prove it starts cleanly.
test('the admin editor script survives bundling and starts without errors', async () => {
  const bundled = await build({
    entryPoints: [fileURLToPath(new URL('../src/admin/blog.js', import.meta.url))],
    bundle: true, format: 'esm', keepNames: true, write: false, platform: 'neutral',
  });
  const code = bundled.outputFiles[0].text;
  assert.ok(code.includes('__name('), 'keepNames should be wrapping functions, or this test proves nothing');
  const mod = await import(`data:text/javascript;base64,${Buffer.from(code).toString('base64')}`);
  const html = mod.generateBlogAdminUI();
  const script = html.match(/<script>([\s\S]*?)<\/script>/)[1];

  const run = async (source) => {
    const any = new Proxy(function () {}, {
      get: (_, key) => (key === 'then' ? undefined : key === Symbol.toPrimitive ? () => '' : any),
      set: () => true,
      apply: () => any,
    });
    const elements = new Map();
    const element = (id) => {
      if (!elements.has(id)) {
        const store = { value: '' };
        elements.set(id, { store, proxy: new Proxy(function () {}, {
          get: (_, key) => (key in store ? store[key] : key === 'then' ? undefined : any),
          set: (_, key, value) => { store[key] = value; return true; },
        }) });
      }
      return elements.get(id).proxy;
    };
    const document = new Proxy({}, { get: (_, key) => (key === 'getElementById' ? element : key === 'createElement' ? () => any : any) });
    const responses = { '/api/admin/tags': { content: [{ id: 1, name: 'seifuku', category: 'content', usage_count: 2 }] }, '/api/admin/posts': { posts: [] } };
    const context = vm.createContext({
      document, window: any, confirm: () => true, location: { search: '' }, URLSearchParams,
      fetch: async (url) => ({ ok: true, json: async () => responses[url] }),
    });
    new vm.Script(source).runInContext(context);
    await new Promise((resolve) => setTimeout(resolve, 20));
    return elements.get('saveStatus')?.store;
  };

  const status = await run(script);
  assert.equal(status.textContent, '', `editor reported: ${status.textContent}`);
  assert.equal(status.className, 'save-status ');

  // Without the shim the same bundle fails, which is what this test guards against
  await assert.rejects(run(script.replace('const __name = (fn) => fn;', '')), /__name is not defined/);
});

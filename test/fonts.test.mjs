// test/fonts.test.mjs
// The self-hosted site font (src/lib/fonts.js, public/fonts/): every slice the CSS
// names exists and is WOFF2, nothing points off-site, and every page that uses the
// Mincho stack links the font and allows it under its CSP.
import { test, before } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { FONT_CSS_PATH, FONT_LATIN_PATH, FONT_HEAD, MINCHO_STACK } from '../src/lib/fonts.js';
import { createD1, PROD_SCHEMA } from './helpers/d1.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const pub = (p) => path.join(root, 'public', p);
const ctx = { waitUntil() {} };
const kv = { get: async () => null, put: async () => {} };
let worker;

before(async () => {
  globalThis.fetch = async (url) => { throw new Error(`unexpected network call: ${url}`); };
  worker = (await import('../src/index.js')).default;
});

test('the font CSS only names slices that exist here, all WOFF2', () => {
  const css = readFileSync(pub(FONT_CSS_PATH), 'utf8');
  const urls = [...css.matchAll(/url\(([^)]+)\)/g)].map(m => m[1]);
  assert.ok(urls.length > 100, `expected the full slice set, got ${urls.length}`);
  for (const u of urls) {
    assert.match(u, /^\/fonts\/[a-z0-9-]+\/\d{3}\.woff2$/, `same-origin slice path: ${u}`);
    const bytes = readFileSync(pub(u));
    assert.equal(bytes.subarray(0, 4).toString('latin1'), 'wOF2', u);
  }
  const dir = path.dirname(pub(urls[0]));
  const onDisk = readdirSync(dir).filter(f => f.endsWith('.woff2'));
  assert.equal(onDisk.length, new Set(urls).size, 'no unreferenced slices');
  assert.ok(existsSync(path.join(dir, 'OFL.txt')), 'licence ships with the font');
  assert.ok(!/https?:/.test(css.replace(/\/\*[\s\S]*?\*\//g, '')), 'no absolute URLs in the font CSS');
});

test('the preloaded slice is the Basic Latin one', () => {
  const css = readFileSync(pub(FONT_CSS_PATH), 'utf8');
  const rule = css.split('\n').find(l => l.includes(FONT_LATIN_PATH));
  assert.ok(rule, 'latin slice is referenced');
  assert.match(rule, /unicode-range:U\+0000-00FF/);
});

test('the stack starts with the served font and ends with a generic serif', () => {
  assert.match(MINCHO_STACK, /^"cutetopop Mincho", /);
  assert.match(MINCHO_STACK, /"Hiragino Mincho ProN"/);
  assert.match(MINCHO_STACK, /"Noto Serif JP"/);
  assert.match(MINCHO_STACK, /, serif$/);
});

test('fonts are cached for a year (immutable paths)', () => {
  const headers = readFileSync(pub('_headers'), 'utf8');
  assert.match(headers, /^\/fonts\/\*\r?\n\s+Cache-Control: public, max-age=31536000, immutable/m);
});

test('main page, blog and editor link the font; the blog CSP allows it', async () => {
  const DB = createD1({ files: [...PROD_SCHEMA, 'migrations/0005_add_blog.sql'] });
  const env = { DB, IMAGES_CACHE: kv, ACCESS_TEAM_DOMAIN: 't.cloudflareaccess.com', ACCESS_AUD: 'aud' };
  const pages = [
    ['/', env],
    ['/blog', env],
    ['/admin/blog', { ...env, ACCESS_DEV_BYPASS: 'true' }],
  ];
  for (const [p, e] of pages) {
    const res = await worker.fetch(new Request('http://localhost:8787' + p), e, ctx);
    const html = await res.text();
    assert.equal(res.status, 200, p);
    assert.ok(html.includes(FONT_HEAD), `${p} links the font`);
    assert.ok(html.includes('"cutetopop Mincho"'), `${p} uses the stack`);
    assert.ok(!/fonts\.(googleapis|gstatic)\.com/.test(html), `${p} has no third-party font`);
    const csp = res.headers.get('Content-Security-Policy') || '';
    if (/default-src 'none'/.test(csp)) {
      assert.match(csp, /font-src 'self'/, `${p} CSP font-src`);
      assert.match(csp, /style-src 'self'/, `${p} CSP style-src`);
    }
  }
});

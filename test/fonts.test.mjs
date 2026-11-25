// test/fonts.test.mjs
// The self-hosted site fonts (src/lib/fonts.js, public/fonts/): every slice each CSS
// names exists and is WOFF2, nothing points off-site, every page links the fonts it
// uses and allows them under its CSP.
import { test, before } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { FONT_FILES, BODY_STACK, DISPLAY_STACK, fontHead } from '../src/lib/fonts.js';
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

for (const [name, f] of Object.entries(FONT_FILES)) {
  test(`${name} font: the CSS only names slices that exist here, all WOFF2`, () => {
    const css = readFileSync(pub(f.css), 'utf8');
    const urls = [...css.matchAll(/url\(([^)]+)\)/g)].map(m => m[1]);
    assert.ok(urls.length > 100, `expected the full slice set, got ${urls.length}`);
    for (const u of urls) {
      assert.match(u, /^\/fonts\/[a-z0-9-]+\/\d{3}\.woff2$/, `same-origin slice path: ${u}`);
      const bytes = readFileSync(pub(u));
      assert.equal(bytes.subarray(0, 4).toString('latin1'), 'wOF2', u);
    }
    const dir = path.dirname(pub(urls[0]));
    const onDisk = readdirSync(dir).filter(x => x.endsWith('.woff2'));
    assert.equal(onDisk.length, new Set(urls).size, 'no unreferenced slices');
    assert.ok(existsSync(path.join(dir, 'OFL.txt')), 'licence ships with the font');
    assert.ok(!/https?:/.test(css.replace(/\/\*[\s\S]*?\*\//g, '')), 'no absolute URLs in the font CSS');
  });

  test(`${name} font: the preloaded slice is the Basic Latin one`, () => {
    const css = readFileSync(pub(f.css), 'utf8');
    const rule = css.split('\n').find(l => l.includes(f.latin));
    assert.ok(rule, 'latin slice is referenced');
    assert.match(rule, /unicode-range:U\+0000-00FF/);
  });
}

test('only the fonts in use are shipped', () => {
  const inUse = new Set(Object.values(FONT_FILES).flatMap(f => [path.basename(f.css), path.basename(f.css, '.css')]));
  assert.deepEqual(readdirSync(pub('fonts')).sort(), [...inUse].sort());
});

test('stacks start with the served font and end with a generic serif', () => {
  assert.match(BODY_STACK, /^"cutetopop Noto Serif JP", /);
  assert.match(DISPLAY_STACK, /^"cutetopop Hina Mincho", /);
  assert.ok(DISPLAY_STACK.endsWith(BODY_STACK), 'titles fall back to the body font');
  assert.match(BODY_STACK, /"Hiragino Mincho ProN"/);
  assert.match(BODY_STACK, /, serif$/);
  assert.doesNotMatch(BODY_STACK, /"MS Mincho"|"BIZ UDMincho"/, 'no fixed-width Latin fallbacks');
});

test('fonts are cached for a year (immutable paths)', () => {
  const headers = readFileSync(pub('_headers'), 'utf8');
  assert.match(headers, /^\/fonts\/\*\r?\n\s+Cache-Control: public, max-age=31536000, immutable/m);
});

test('blog text is all Mincho: sans-serif only on tag pills and the preview banner', () => {
  const src = readFileSync(path.join(root, 'src', 'blog', 'pages.js'), 'utf8');
  const styles = src.slice(src.indexOf('const STYLES'), src.indexOf('`;', src.indexOf('const STYLES')));
  const sansRules = [...styles.matchAll(/([^{}]+)\{[^}]*sans-serif[^}]*\}/g)].map(m => m[1].trim());
  assert.deepEqual(sansRules, ['.tag', '.preview-banner']);
});

test('blog CSP: no scripts of our own (Cloudflare adds its nonce), Web Analytics may report', async () => {
  const DB = createD1({ files: [...PROD_SCHEMA, 'migrations/0005_add_blog.sql'] });
  const res = await worker.fetch(new Request('http://localhost:8787/blog'), { DB, IMAGES_CACHE: kv }, ctx);
  const csp = Object.fromEntries(res.headers.get('Content-Security-Policy').split(';').map(d => {
    const [k, ...v] = d.trim().split(/\s+/); return [k, v];
  }));
  assert.deepEqual(csp['default-src'], ["'none'"]);
  assert.equal(csp['script-src'], undefined, 'Cloudflare appends a nonce-only script-src; a second one would be ignored');
  assert.deepEqual(csp['connect-src'], ["'self'", 'https://cloudflareinsights.com']);
});

test('main page, blog and editor link the fonts they use; the blog CSP allows them', async () => {
  const DB = createD1({ files: [...PROD_SCHEMA, 'migrations/0005_add_blog.sql'] });
  const env = { DB, IMAGES_CACHE: kv, ACCESS_TEAM_DOMAIN: 't.cloudflareaccess.com', ACCESS_AUD: 'aud' };
  const pages = [
    ['/', env, false],
    ['/blog', env, true],
    ['/admin/blog', { ...env, ACCESS_DEV_BYPASS: 'true' }, true],
  ];
  for (const [p, e, display] of pages) {
    const res = await worker.fetch(new Request('http://localhost:8787' + p), e, ctx);
    const html = await res.text();
    assert.equal(res.status, 200, p);
    assert.ok(html.includes(fontHead({ display })), `${p} links its fonts`);
    assert.equal(html.includes(FONT_FILES.DISPLAY.css), display, `${p} loads the title font only if it shows titles`);
    assert.ok(html.includes('"cutetopop Noto Serif JP"'), `${p} uses the body stack`);
    if (display) assert.ok(html.includes('"cutetopop Hina Mincho"'), `${p} uses the title stack`);
    assert.ok(!/fonts\.(googleapis|gstatic)\.com/.test(html), `${p} has no third-party font`);
    const csp = res.headers.get('Content-Security-Policy') || '';
    if (/default-src 'none'/.test(csp)) {
      assert.match(csp, /font-src 'self'/, `${p} CSP font-src`);
      assert.match(csp, /style-src 'self'/, `${p} CSP style-src`);
    }
  }
});

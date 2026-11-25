// test/markdown.test.mjs
// The blog's Markdown subset (src/lib/markdown.js): output safety first, then syntax.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  escapeHtml, extractTagRefs, isValidSlug, parseTagRef, plainSummary, renderMarkdown, slugify,
} from '../src/lib/markdown.js';

const resolveTag = (ref) => (ref.name === 'studio-shaft' && ref.category !== 'source'
  ? { category: 'creator', label: 'Studio SHAFT', href: '/blog/tag/creator/studio-shaft' }
  : null);

// ---------- safety ----------

test('raw HTML is escaped, never emitted', () => {
  const html = renderMarkdown('<script>alert(1)</script>\n\n<img src=x onerror=alert(1)>');
  assert.ok(!html.includes('<script'), html);
  assert.ok(!html.includes('<img'), html);
  assert.ok(html.includes('&lt;script&gt;'));
});

test('only http(s), site-relative and #anchor links become links', () => {
  for (const bad of ['javascript:alert(1)', 'JAVASCRIPT:alert(1)', 'data:text/html,x', '//evil.example/x', 'vbscript:x']) {
    const html = renderMarkdown(`[click](${bad})`);
    assert.ok(!html.includes('<a'), `${bad} -> ${html}`);
    assert.ok(html.includes('click'));
  }
  assert.match(renderMarkdown('[a](https://example.com/?a=1&b=2)'), /<a href="https:\/\/example\.com\/\?a=1&amp;b=2" rel="noopener noreferrer">a<\/a>/);
  assert.match(renderMarkdown('[home](/)'), /<a href="\/">home<\/a>/);
  assert.match(renderMarkdown('[top](#top)'), /<a href="#top">top<\/a>/);
});

test('a link target cannot break out of its attribute', () => {
  const html = renderMarkdown('[x](https://a.example/"onmouseover="alert(1))');
  assert.ok(!/"\s*onmouseover/.test(html), html);
});

test('images only from the site\'s own /images/ path', () => {
  assert.match(renderMarkdown('![a cat](/images/abc123.jpg)'), /<img src="\/images\/abc123\.jpg" alt="a cat" loading="lazy"/);
  for (const bad of ['https://tracker.example/p.gif', '/images/../admin', '//evil/images/x.png', '/other/x.png']) {
    const html = renderMarkdown(`![alt](${bad})`);
    assert.ok(!html.includes('<img'), `${bad} -> ${html}`);
  }
});

test('alt text is escaped', () => {
  const html = renderMarkdown('![" onerror="alert(1)](/images/a.jpg)');
  assert.ok(!html.includes('" onerror'), html);
});

test('NUL characters in input cannot forge placeholders', () => {
  const html = renderMarkdown('a \u00000\u0000 b `x`');
  assert.ok(!html.includes('\u0000'));
  assert.ok(html.includes('<code>x</code>'));
});

test('code is shown literally', () => {
  assert.equal(renderMarkdown('`<b>**x**</b>`'), '<p><code>&lt;b&gt;**x**&lt;/b&gt;</code></p>');
  assert.equal(renderMarkdown('```\n<i>[[studio-shaft]]</i>\n```'), '<pre><code>&lt;i&gt;[[studio-shaft]]&lt;/i&gt;</code></pre>');
});

// ---------- syntax ----------

test('blocks: headings shift down one level, lists, quotes, rules, paragraphs', () => {
  const html = renderMarkdown('# One\n## Two\n\n- a\n- b\n\n1. x\n2. y\n\n> quoted *bit*\n\n---\n\nline one\nline two');
  assert.match(html, /<h2>One<\/h2>/);
  assert.match(html, /<h3>Two<\/h3>/);
  assert.match(html, /<ul><li>a<\/li><li>b<\/li><\/ul>/);
  assert.match(html, /<ol><li>x<\/li><li>y<\/li><\/ol>/);
  assert.match(html, /<blockquote><p>quoted <em>bit<\/em><\/p><\/blockquote>/);
  assert.match(html, /<hr>/);
  assert.match(html, /<p>line one<br>\nline two<\/p>/);
});

test('emphasis, and asterisks that are not emphasis', () => {
  assert.equal(renderMarkdown('**bold** and *it*'), '<p><strong>bold</strong> and <em>it</em></p>');
  assert.equal(renderMarkdown('*cute* and *pop*'), '<p><em>cute</em> and <em>pop</em></p>');
  assert.equal(renderMarkdown('2 * 3 * 4'), '<p>2 * 3 * 4</p>');
});

// ---------- tag references ----------

test('tag references resolve to tag links, unknown ones stay plain text', () => {
  const html = renderMarkdown('by [[studio-shaft]] about [[nobody]]', { resolveTag });
  assert.match(html, /<a class="tag" data-category="creator" href="\/blog\/tag\/creator\/studio-shaft">Studio SHAFT<\/a>/);
  assert.match(html, /<span class="tag-ref missing">nobody<\/span>/);
});

test('tag reference with a label, and with no resolver', () => {
  assert.match(renderMarkdown('[[creator:studio-shaft|SHAFT]]', { resolveTag }), />SHAFT<\/a>/);
  assert.match(renderMarkdown('[[studio-shaft]]'), /<span class="tag-ref missing">studio-shaft<\/span>/);
});

test('tag reference text is escaped', () => {
  const html = renderMarkdown('[[<b>x</b>|<i>y</i>]]', { resolveTag });
  assert.ok(!html.includes('<b>') && !html.includes('<i>'), html);
});

test('parseTagRef and extractTagRefs', () => {
  assert.deepEqual(parseTagRef('Studio SHAFT'), { category: null, name: 'studio-shaft' });
  assert.deepEqual(parseTagRef('creator: studio-shaft'), { category: 'creator', name: 'studio-shaft' });
  assert.deepEqual(parseTagRef('re:zero'), { category: null, name: 're:zero' });
  assert.deepEqual(
    extractTagRefs('[[a]] [[A]] [[source:a]] `[[in-code]]`\n```\n[[fenced]]\n```'),
    [{ category: null, name: 'a' }, { category: 'source', name: 'a' }],
  );
});

// ---------- helpers ----------

test('slugify', () => {
  assert.equal(slugify('Hello, World!'), 'hello-world');
  assert.equal(slugify('Café  Crème — notes'), 'cafe-creme-notes');
  assert.equal(slugify('魔法少女'), '');
  const long = slugify('word '.repeat(40));
  assert.ok(long.length <= 80 && isValidSlug(long), long);
});

test('isValidSlug', () => {
  for (const ok of ['a', 'hello-world', 'post-20261125']) assert.ok(isValidSlug(ok), ok);
  for (const bad of ['', 'Hello', 'a--b', '-a', 'a-', 'a/b', 'a b', 'x'.repeat(81)]) assert.ok(!isValidSlug(bad), bad);
});

test('plainSummary strips syntax and truncates on a word', () => {
  assert.equal(plainSummary('# Title\n\nSee **this** [link](https://x.y) by [[creator:studio-shaft|SHAFT]].'), 'See this link by SHAFT.');
  assert.equal(plainSummary('![img](/images/a.jpg)\n\nreal text'), 'real text');
  const s = plainSummary('word '.repeat(100), 50);
  assert.ok(s.length <= 51 && s.endsWith('…'), s);
  assert.equal(plainSummary(''), '');
});

test('escapeHtml', () => {
  assert.equal(escapeHtml(`<a href="x">'&'</a>`), '&lt;a href=&quot;x&quot;&gt;&#39;&amp;&#39;&lt;/a&gt;');
  assert.equal(escapeHtml(null), '');
});

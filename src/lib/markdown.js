// src/lib/markdown.js
// A small, safe Markdown subset for blog posts.
//
// Safety model: every character of the source is HTML-escaped first, and the only
// HTML this module emits is the fixed set of elements below. Link targets must be
// http(s), site-relative (/...) or #anchors; images must come from the site's own
// /images/ path (served from R2), so a post can't embed third-party trackers.
//
// Supported:
//   blocks  - paragraphs (single newlines become <br>), # / ## / ### headings
//             (rendered as h2-h4, the page title is the h1), - or * lists,
//             1. lists, > quotes, ``` code fences, --- rules
//   inline  - **bold**, *italic*, `code`, [text](url), ![alt](/images/file)
//   tags    - [[name]], [[category:name]] or [[category:name|label]] refer to a row
//             in the main tags table. The caller resolves them (resolveTag); an
//             unknown or hidden tag renders as plain text, never as a link.

const TAG_REF = /\[\[([^\]\n|]{1,100})(?:\|([^\]\n]{1,100}))?\]\]/g;
const CATEGORIES = ['content', 'character', 'creator', 'source'];
const PH = '\u0000'; // placeholder delimiter; stripped from input first

export function escapeHtml(text) {
  return String(text ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

// "Studio SHAFT" -> "studio-shaft"; matches how tag names are stored
export function normalizeTagName(name) {
  return String(name).trim().toLowerCase().replace(/\s+/g, '-');
}

// Parse the inside of [[...]] into { category, name }. The category prefix is
// optional and only recognised for the four real categories.
export function parseTagRef(inner) {
  const text = String(inner).trim();
  const colon = text.indexOf(':');
  if (colon > 0) {
    const category = text.slice(0, colon).trim().toLowerCase();
    if (CATEGORIES.includes(category)) {
      return { category, name: normalizeTagName(text.slice(colon + 1)) };
    }
  }
  return { category: null, name: normalizeTagName(text) };
}

// Unique tag references in a post body, outside code, for one bulk lookup
export function extractTagRefs(src) {
  const seen = new Map();
  const text = stripCode(String(src ?? ''));
  for (const m of text.matchAll(TAG_REF)) {
    const ref = parseTagRef(m[1]);
    if (!ref.name) continue;
    const key = `${ref.category ?? ''}:${ref.name}`;
    if (!seen.has(key)) seen.set(key, ref);
  }
  return [...seen.values()];
}

function stripCode(text) {
  return text.replace(/```[\s\S]*?(```|$)/g, '').replace(/`[^`\n]*`/g, '');
}

// Lowercase ASCII slug from a title; '' when nothing usable is left (e.g. a
// title written only in Japanese), so the caller can fall back to a date slug.
export function slugify(title) {
  const slug = String(title ?? '')
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
  if (slug.length <= 80) return slug;
  const cut = slug.slice(0, 80);
  const lastHyphen = cut.lastIndexOf('-');
  return (lastHyphen > 40 ? cut.slice(0, lastHyphen) : cut).replace(/-+$/, '');
}

export function isValidSlug(slug) {
  return typeof slug === 'string' && slug.length <= 80 && /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug);
}

// Plain-text teaser: the first real paragraph with the syntax removed
export function plainSummary(src, max = 200) {
  // A teaser only needs the start of the post; capping the input also caps the
  // cost of the patterns below on a hostile body
  const head = stripControlChars(String(src ?? '').slice(0, 4000));
  const paragraphs = stripCodeBlocks(head.replace(/\r\n?/g, '\n')).split(/\n[ \t]*\n/);
  for (const para of paragraphs) {
    const lines = para.split('\n').filter((l) => !/^\s*(#{1,3}\s|---|\*\*\*)/.test(l));
    let text = lines.join(' ')
      .replace(/!\[[^\]\n]{0,300}\]\([^)\s]{0,500}\)/g, '')
      .replace(TAG_REF, (_, inner, label) => label || parseTagRef(inner).name)
      .replace(/\[([^\]\n]{1,300})\]\([^)\s]{0,500}\)/g, '$1')
      .replace(/[*`]/g, '')
      .replace(/^\s*(?:[-*>]|\d+[.)])\s+/gm, '')
      .replace(/\s+/g, ' ')
      .trim();
    if (!text) continue;
    if (text.length > max) {
      const cut = text.slice(0, max);
      const space = cut.lastIndexOf(' ');
      text = (space > max * 0.6 ? cut.slice(0, space) : cut).replace(/[\s.,;:!?-]+$/, '') + '…';
    }
    return text;
  }
  return '';
}

function stripCodeBlocks(text) {
  return text.replace(/```[\s\S]*?(```|$)/g, '');
}

function safeHref(escapedUrl) {
  // Backslashes are rejected everywhere: browsers read "/\evil.com" as "//evil.com"
  if (escapedUrl.includes('\\')) return null;
  if (/^https?:\/\/[^\s]+$/i.test(escapedUrl)) return { href: escapedUrl, external: true };
  if (/^\/(?!\/)[^\s]*$/.test(escapedUrl) || /^#[\w-]+$/.test(escapedUrl)) return { href: escapedUrl, external: false };
  return null;
}

function safeImageSrc(escapedUrl) {
  return /^\/images\/[A-Za-z0-9._\-/]+$/.test(escapedUrl) && !escapedUrl.includes('..') ? escapedUrl : null;
}

function emphasis(text) {
  return text
    .replace(/\*\*([^*\n]+?)\*\*/g, '<strong>$1</strong>')
    .replace(/(^|[^*\w])\*([^*\s][^*\n]*?)\*(?![*\w])/g, '$1<em>$2</em>');
}

// Every repeated part of these patterns has an upper bound, so a hostile line
// costs at most (line length x bound) steps instead of growing quadratically.
const CODE_SPAN = /`([^`\n]{1,2000})`/g;
const IMAGE = /!\[([^\]\n]{0,300})\]\(([^)\s]{1,500})\)/g;
const LINK = /\[([^\]\n]{1,300})\]\(([^)\s]{1,500})\)/g;
const SLOT = new RegExp(`${PH}(\\d+)${PH}`, 'g');

// Render one line of inline syntax. `src` is raw (unescaped) text.
function renderInline(src, resolveTag) {
  // Each held fragment has an HTML form and a plain-text form (both escaped).
  // `nest` says whether the HTML may sit inside a link label (code may, a tag
  // link may not: no links inside links). Alt text always gets the text form.
  const slots = [];
  const hold = (html, text, nest) => `${PH}${slots.push({ html, text, nest }) - 1}${PH}`;
  const restore = (s, mode) => s.replace(SLOT, (_, i) => {
    const slot = slots[Number(i)];
    if (mode === 'text') return slot.text;
    if (mode === 'label') return slot.nest ? slot.html : slot.text;
    return slot.html;
  });

  let text = src;
  // Code spans first: their contents are shown literally
  text = text.replace(CODE_SPAN, (_, code) => hold(`<code>${escapeHtml(code)}</code>`, escapeHtml(code), true));
  // Tag references, resolved against the main tags table by the caller
  text = text.replace(TAG_REF, (_, inner, label) => {
    const ref = parseTagRef(inner);
    const tag = ref.name && resolveTag ? resolveTag(ref) : null;
    const shown = escapeHtml(label ? label.trim() : (tag?.label || inner.trim()));
    if (!tag) return hold(`<span class="tag-ref missing">${shown}</span>`, shown, true);
    return hold(`<a class="tag" data-category="${escapeHtml(tag.category)}" href="${escapeHtml(tag.href)}">${shown}</a>`, shown, false);
  });
  // Everything below works on escaped text, so attribute values can't break out
  text = escapeHtml(text);
  text = text.replace(IMAGE, (whole, alt, url) => {
    const src = safeImageSrc(url);
    const altText = restore(alt, 'text');
    return src ? hold(`<img src="${src}" alt="${altText}" loading="lazy" decoding="async">`, altText, true) : altText;
  });
  text = text.replace(LINK, (whole, label, url) => {
    const link = safeHref(url);
    if (!link) return label; // the label's own fragments are restored at the end
    const rel = link.external ? ' rel="noopener noreferrer"' : '';
    const inner = restore(emphasis(label), 'label');
    return hold(`<a href="${link.href}"${rel}>${inner}</a>`, inner, false);
  });
  text = emphasis(text);
  return restore(text, 'html');
}

// C0 control characters (except tab, newline, carriage return) and DEL are
// invalid in XML and never useful in a post; NUL is also our placeholder marker.
// eslint-disable-next-line no-control-regex
const CONTROL_CHARS = /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g;
export function stripControlChars(text) {
  return String(text ?? '').replace(CONTROL_CHARS, '');
}

// "## Title ##" -> { level: 2, text: "Title" }, parsed without a backtracking regex
function parseHeading(line) {
  let hashes = 0;
  while (hashes < line.length && line[hashes] === '#') hashes++;
  if (hashes < 1 || hashes > 3 || !/\s/.test(line[hashes] || '')) return null;
  let text = line.slice(hashes).trim();
  let end = text.length;
  while (end > 0 && text[end - 1] === '#') end--;
  if (end < text.length && (end === 0 || /\s/.test(text[end - 1]))) text = text.slice(0, end).trim();
  return text ? { level: hashes + 1, text } : null;
}

const MAX_QUOTE_DEPTH = 3;

/**
 * Render a post body to HTML.
 * @param {string} src - Markdown subset (see top of file)
 * @param {{ resolveTag?: (ref: {category: string|null, name: string}) =>
 *           ({ href: string, label: string, category: string } | null) }} options
 */
export function renderMarkdown(src, { resolveTag, depth = 0 } = {}) {
  const lines = stripControlChars(src).replace(/\r\n?/g, '\n').split('\n');
  const out = [];
  const inline = (s) => renderInline(s, resolveTag);
  let para = [];

  const flushPara = () => {
    if (para.length) out.push(`<p>${para.map(inline).join('<br>\n')}</p>`);
    para = [];
  };

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    if (line.startsWith('```')) {
      flushPara();
      const code = [];
      for (i++; i < lines.length && !lines[i].startsWith('```'); i++) code.push(lines[i]);
      out.push(`<pre><code>${escapeHtml(code.join('\n'))}</code></pre>`);
      continue;
    }
    if (!line.trim()) { flushPara(); continue; }

    const heading = parseHeading(line);
    if (heading) {
      flushPara();
      out.push(`<h${heading.level}>${inline(heading.text)}</h${heading.level}>`);
      continue;
    }
    if (/^\s*(?:-{3,}|\*{3,})\s*$/.test(line)) { flushPara(); out.push('<hr>'); continue; }

    const listType = /^\s*[-*]\s+/.test(line) ? 'ul' : /^\s*\d+[.)]\s+/.test(line) ? 'ol' : null;
    if (listType) {
      flushPara();
      const marker = listType === 'ul' ? /^\s*[-*]\s+/ : /^\s*\d+[.)]\s+/;
      const items = [];
      for (; i < lines.length && marker.test(lines[i]); i++) items.push(`<li>${inline(lines[i].replace(marker, ''))}</li>`);
      i--;
      out.push(`<${listType}>${items.join('')}</${listType}>`);
      continue;
    }
    // Quotes nest a few levels deep; deeper ">" lines are shown as text, so a
    // hostile post can't exhaust the stack
    if (depth < MAX_QUOTE_DEPTH && /^\s*>/.test(line)) {
      flushPara();
      const quoted = [];
      for (; i < lines.length && /^\s*>/.test(lines[i]); i++) quoted.push(lines[i].replace(/^\s*>\s?/, ''));
      i--;
      out.push(`<blockquote>${renderMarkdown(quoted.join('\n'), { resolveTag, depth: depth + 1 })}</blockquote>`);
      continue;
    }
    para.push(line);
  }
  flushPara();
  return out.join('\n');
}

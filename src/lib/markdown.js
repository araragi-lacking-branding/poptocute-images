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
  const paragraphs = stripCodeBlocks(String(src ?? '').replace(/\r\n?/g, '\n')).split(/\n\s*\n/);
  for (const para of paragraphs) {
    const lines = para.split('\n').filter((l) => !/^\s*(#{1,3}\s|---|\*\*\*)/.test(l));
    let text = lines.join(' ')
      .replace(/!\[[^\]]*\]\([^)]*\)/g, '')
      .replace(TAG_REF, (_, inner, label) => label || parseTagRef(inner).name)
      .replace(/\[([^\]]+)\]\([^)]*\)/g, '$1')
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

// Render one line of inline syntax. `src` is raw (unescaped) text.
function renderInline(src, resolveTag) {
  const slots = [];
  const hold = (html) => `${PH}${slots.push(html) - 1}${PH}`;

  let text = src;
  // Code spans first: their contents are shown literally
  text = text.replace(/`([^`\n]+)`/g, (_, code) => hold(`<code>${escapeHtml(code)}</code>`));
  // Tag references, resolved against the main tags table by the caller
  text = text.replace(TAG_REF, (_, inner, label) => {
    const ref = parseTagRef(inner);
    const tag = ref.name && resolveTag ? resolveTag(ref) : null;
    const shown = label ? label.trim() : (tag?.label || inner.trim());
    if (!tag) return hold(`<span class="tag-ref missing">${escapeHtml(shown)}</span>`);
    return hold(`<a class="tag" data-category="${escapeHtml(tag.category)}" href="${escapeHtml(tag.href)}">${escapeHtml(shown)}</a>`);
  });
  // Everything below works on escaped text, so attribute values can't break out
  text = escapeHtml(text);
  text = text.replace(/!\[([^\]\n]*)\]\(([^)\s]+)\)/g, (whole, alt, url) => {
    const src = safeImageSrc(url);
    return src ? hold(`<img src="${src}" alt="${alt}" loading="lazy" decoding="async">`) : alt;
  });
  text = text.replace(/\[([^\]\n]+)\]\(([^)\s]+)\)/g, (whole, label, url) => {
    const link = safeHref(url);
    if (!link) return label;
    const rel = link.external ? ' rel="noopener noreferrer"' : '';
    return hold(`<a href="${link.href}"${rel}>${emphasis(label)}</a>`);
  });
  text = emphasis(text);
  // Restore held fragments (a fragment never contains another placeholder)
  return text.replace(new RegExp(`${PH}(\\d+)${PH}`, 'g'), (_, i) => slots[Number(i)]);
}

/**
 * Render a post body to HTML.
 * @param {string} src - Markdown subset (see top of file)
 * @param {{ resolveTag?: (ref: {category: string|null, name: string}) =>
 *           ({ href: string, label: string, category: string } | null) }} options
 */
export function renderMarkdown(src, { resolveTag } = {}) {
  const lines = String(src ?? '').replace(/\r\n?/g, '\n').split(PH).join('').split('\n');
  const out = [];
  const inline = (s) => renderInline(s, resolveTag);
  let para = [];

  const flushPara = () => {
    if (para.length) out.push(`<p>${para.map(inline).join('<br>\n')}</p>`);
    para = [];
  };

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    if (/^```/.test(line)) {
      flushPara();
      const code = [];
      for (i++; i < lines.length && !/^```/.test(lines[i]); i++) code.push(lines[i]);
      out.push(`<pre><code>${escapeHtml(code.join('\n'))}</code></pre>`);
      continue;
    }
    if (/^\s*$/.test(line)) { flushPara(); continue; }

    const heading = line.match(/^(#{1,3})\s+(.+?)\s*#*\s*$/);
    if (heading) {
      flushPara();
      const level = heading[1].length + 1;
      out.push(`<h${level}>${inline(heading[2])}</h${level}>`);
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
    if (/^\s*>/.test(line)) {
      flushPara();
      const quoted = [];
      for (; i < lines.length && /^\s*>/.test(lines[i]); i++) quoted.push(lines[i].replace(/^\s*>\s?/, ''));
      i--;
      out.push(`<blockquote>${renderMarkdown(quoted.join('\n'), { resolveTag })}</blockquote>`);
      continue;
    }
    para.push(line);
  }
  flushPara();
  return out.join('\n');
}

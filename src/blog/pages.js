// src/blog/pages.js
// Public blog pages, rendered on the server with no client JavaScript:
//   /blog                       newest published posts (?page=N for older ones)
//   /blog/<slug>                one post
//   /blog/tag/<category>/<name> a tag from the main tag tables and the posts about it
//   /blog/feed.xml              Atom feed of the latest posts
// The look follows the main page: white, Mincho serif, the same tag pills.

import { escapeHtml, extractTagRefs, plainSummary, renderMarkdown } from '../lib/markdown.js';
import {
  getPublicTag, getPublishedPost, isMissingTable, listPublishedPosts, refKey, resolveTagRefs,
} from './data.js';

const PAGE_SIZE = 10;
const SITE_TITLE = '*cute* and *pop*';

// No scripts, no third-party anything; images only from this site
const PAGE_HEADERS = {
  'Content-Type': 'text/html; charset=UTF-8',
  'Content-Security-Policy': "default-src 'none'; img-src 'self'; style-src 'unsafe-inline'; base-uri 'none'; form-action 'none'; frame-ancestors 'none'",
  'X-Content-Type-Options': 'nosniff',
  'Referrer-Policy': 'same-origin',
};

const STYLES = `
  * { box-sizing: border-box; }
  html, body { margin: 0; background: #fff; color: #333; }
  body { font-family: "Heisei Mincho", "MS Mincho", "SimSun", serif; line-height: 1.75; padding: 1rem; }
  a { color: #333; }
  a:hover { color: #4ecdc4; }
  .wrap { max-width: 680px; margin: 0 auto; padding: 1.5rem 0 2rem; }
  .site { display: flex; justify-content: space-between; align-items: baseline; margin-bottom: 3rem; }
  .site .home { text-decoration: none; font-size: 1.05rem; }
  .site .section { color: #999; font-size: 0.9rem; text-decoration: none; }
  h1 { font-size: 1.8rem; font-weight: normal; line-height: 1.35; margin: 0 0 0.35rem; }
  h2, h3, h4 { font-weight: normal; line-height: 1.4; margin: 2rem 0 0.5rem; }
  .meta, .pager, .empty, footer { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; }
  .meta { color: #999; font-size: 0.8rem; margin: 0 0 0.75rem; }
  .posts { list-style: none; padding: 0; margin: 0; }
  .posts li { margin: 0 0 2.5rem; }
  .posts .title { font-size: 1.3rem; text-decoration: none; }
  .posts .summary { color: #666; margin: 0.2rem 0 0.6rem; }
  .tags { display: flex; flex-wrap: wrap; gap: 0.4rem; margin: 0 0 0.5rem; }
  .tag {
    display: inline-block; padding: 0.1rem 0.7rem; border-radius: 20px; background: #fff;
    border: 1px solid #eee; border-left: 3px solid #ccc; color: #333; text-decoration: none;
    font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; font-size: 0.8rem;
    line-height: 1.6; white-space: nowrap; vertical-align: baseline;
  }
  a.tag:hover { color: #333; background: #f7f7f7; }
  .tag[data-category="content"] { border-left-color: #ff6b9d; }
  .tag[data-category="character"] { border-left-color: #4ecdc4; }
  .tag[data-category="creator"] { border-left-color: #95e1d3; }
  .tag[data-category="source"] { border-left-color: #ffa07a; }
  .tag-ref.missing { color: #999; }
  article { margin-top: 2rem; }
  article img { max-width: 100%; height: auto; border-radius: 12px; box-shadow: 0 6px 30px rgba(0,0,0,.15); }
  article hr { border: 0; border-top: 1px solid #eee; margin: 2rem 0; }
  blockquote { margin: 1.25rem 0; padding: 0 1rem; border-left: 3px solid #4ecdc4; color: #666; }
  code { background: #f5f5f5; padding: 0.1rem 0.3rem; border-radius: 4px; font-size: 0.85em; }
  pre { background: #f5f5f5; padding: 1rem; border-radius: 8px; overflow-x: auto; font-size: 0.85rem; line-height: 1.5; }
  pre code { background: none; padding: 0; }
  .credit { color: #666; margin: 0 0 1rem; }
  .empty { color: #999; font-size: 0.9rem; }
  .pager { display: flex; justify-content: space-between; font-size: 0.85rem; }
  .pager a { color: #999; text-decoration: none; }
  .preview-banner {
    font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; font-size: 0.8rem;
    background: #fff8e1; border: 1px solid #ffe08a; border-radius: 8px; padding: 0.5rem 0.75rem; margin-bottom: 1.5rem;
  }
  footer { margin-top: 4rem; text-align: center; font-size: 0.75rem; color: #999; }
  footer a { color: #999; text-decoration: none; }
`;

function page({ title, description = '', body, origin = '', status = 200, cache = 'public, max-age=300' }) {
  const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${escapeHtml(title)}</title>
  ${description ? `<meta name="description" content="${escapeHtml(description)}">` : ''}
  <link rel="icon" type="image/x-icon" href="/favicon.ico">
  <link rel="alternate" type="application/atom+xml" title="${escapeHtml(SITE_TITLE)} blog" href="${escapeHtml(origin)}/blog/feed.xml">
  <style>${STYLES}</style>
</head>
<body>
  <div class="wrap">
    <header class="site">
      <a class="home" href="/">${escapeHtml(SITE_TITLE)}</a>
      <a class="section" href="/blog">blog</a>
    </header>
    ${body}
    <footer>
      <a href="/">random image</a> · <a href="/blog">blog</a> · <a href="/blog/feed.xml">feed</a> ·
      <a href="https://github.com/araragi-lacking-branding/poptocute-images" rel="noopener noreferrer">GitHub</a>
    </footer>
  </div>
</body>
</html>`;
  return new Response(html, { status, headers: { ...PAGE_HEADERS, 'Cache-Control': cache } });
}

function formatDate(sqlDate) {
  return sqlDate ? String(sqlDate).slice(0, 10) : '';
}

function tagPills(tags) {
  if (!tags?.length) return '';
  return `<div class="tags">${tags.map((t) =>
    `<a class="tag" data-category="${escapeHtml(t.category)}" title="${escapeHtml(t.category)}" href="${escapeHtml(t.href)}">${escapeHtml(t.display_name || t.name)}</a>`).join('')}</div>`;
}

function postList(posts) {
  return `<ul class="posts">${posts.map((p) => {
    const summary = p.summary || plainSummary(p.body);
    return `<li>
      <a class="title" href="/blog/${escapeHtml(p.slug)}">${escapeHtml(p.title)}</a>
      <p class="meta"><time datetime="${escapeHtml(formatDate(p.published_at))}">${escapeHtml(formatDate(p.published_at))}</time></p>
      ${summary ? `<p class="summary">${escapeHtml(summary)}</p>` : ''}
      ${tagPills(p.tags)}
    </li>`;
  }).join('')}</ul>`;
}

async function renderBody(env, body) {
  const refs = extractTagRefs(body);
  const resolved = refs.length ? await resolveTagRefs(env, refs) : new Map();
  return renderMarkdown(body, { resolveTag: (ref) => resolved.get(refKey(ref)) ?? null });
}

function notFound(origin) {
  return page({
    title: `not found · ${SITE_TITLE}`, origin, status: 404, cache: 'public, max-age=60',
    body: `<h1>Nothing here</h1><p class="empty">That post or tag doesn't exist (or isn't public).</p>`,
  });
}

// ---------- pages ----------

async function listPage(env, url) {
  const pageNo = Math.max(1, Math.min(1000, parseInt(url.searchParams.get('page') || '1', 10) || 1));
  const { posts, hasMore } = await listPublishedPosts(env, { limit: PAGE_SIZE, offset: (pageNo - 1) * PAGE_SIZE });
  if (!posts.length && pageNo > 1) return notFound(url.origin);
  const pager = (pageNo > 1 || hasMore)
    ? `<nav class="pager">
        <span>${pageNo > 1 ? `<a href="/blog${pageNo > 2 ? `?page=${pageNo - 1}` : ''}">← newer</a>` : ''}</span>
        <span>${hasMore ? `<a href="/blog?page=${pageNo + 1}">older →</a>` : ''}</span>
      </nav>` : '';
  return page({
    title: `blog · ${SITE_TITLE}`, origin: url.origin, description: 'Notes from cutetopop.com',
    body: `<h1>blog</h1>
      <p class="meta">notes on the images, the people who made them, and building the site</p>
      ${posts.length ? postList(posts) : '<p class="empty">No posts yet.</p>'}
      ${pager}`,
  });
}

export async function renderPostPage(env, post, { origin = '', preview = false } = {}) {
  const banner = preview
    ? `<div class="preview-banner">Preview · status: ${escapeHtml(post.status)} · only admins can see this page</div>`
    : '';
  const date = formatDate(post.published_at);
  return page({
    title: `${post.title} · ${SITE_TITLE}`, origin,
    description: post.summary || plainSummary(post.body, 160),
    cache: preview ? 'no-store' : 'public, max-age=300',
    body: `${banner}<h1>${escapeHtml(post.title)}</h1>
      <p class="meta">${date ? `<time datetime="${escapeHtml(date)}">${escapeHtml(date)}</time>` : 'not published'}</p>
      ${tagPills(post.tags)}
      <article>${await renderBody(env, post.body)}</article>`,
  });
}

async function tagPage(env, url, category, name) {
  const tag = await getPublicTag(env, category, name);
  if (!tag) return notFound(url.origin);
  const { posts } = await listPublishedPosts(env, { tagId: tag.id, limit: 50 });
  const label = tag.display_name || tag.name;
  const artists = tag.artists.map((a) => {
    const shown = escapeHtml(a.display_name || a.name);
    return /^https?:\/\//i.test(a.website_url || '')
      ? `<a href="${escapeHtml(a.website_url)}" rel="noopener noreferrer">${shown}</a>`
      : shown;
  });
  return page({
    title: `${label} · blog · ${SITE_TITLE}`, origin: url.origin,
    body: `<h1><span class="tag" data-category="${escapeHtml(tag.category)}" style="font-size:1rem;vertical-align:middle">${escapeHtml(tag.category_display || tag.category)}</span> ${escapeHtml(label)}</h1>
      <p class="meta">${tag.image_count} image${tag.image_count === 1 ? '' : 's'} on the site · ${posts.length} post${posts.length === 1 ? '' : 's'}</p>
      ${artists.length ? `<p class="credit">Artist: ${artists.join(', ')}</p>` : ''}
      ${tag.description ? `<p>${escapeHtml(tag.description)}</p>` : ''}
      ${posts.length ? postList(posts) : '<p class="empty">No posts about this tag yet.</p>'}`,
  });
}

function xmlEscape(text) {
  return escapeHtml(text);
}

function atomDate(sqlDate) {
  return sqlDate ? `${String(sqlDate).replace(' ', 'T').slice(0, 19)}Z` : new Date(0).toISOString();
}

async function feed(env, url) {
  const { posts } = await listPublishedPosts(env, { limit: 20 });
  const origin = url.origin;
  const entries = [];
  for (const p of posts) {
    const html = await renderBody(env, p.body);
    // Feed readers need absolute links
    const absolute = html.replace(/(href|src)="\//g, `$1="${origin}/`);
    entries.push(`  <entry>
    <title>${xmlEscape(p.title)}</title>
    <link href="${xmlEscape(`${origin}/blog/${p.slug}`)}"/>
    <id>${xmlEscape(`${origin}/blog/${p.slug}`)}</id>
    <published>${atomDate(p.published_at)}</published>
    <updated>${atomDate(p.updated_at || p.published_at)}</updated>
    ${p.tags.map((t) => `<category term="${xmlEscape(t.name)}" label="${xmlEscape(t.display_name || t.name)}"/>`).join('')}
    <summary>${xmlEscape(p.summary || plainSummary(p.body))}</summary>
    <content type="html">${xmlEscape(absolute)}</content>
  </entry>`);
  }
  const updated = posts.length ? atomDate(posts[0].updated_at || posts[0].published_at) : new Date(0).toISOString();
  const xml = `<?xml version="1.0" encoding="utf-8"?>
<feed xmlns="http://www.w3.org/2005/Atom">
  <title>${xmlEscape(SITE_TITLE)} blog</title>
  <link href="${xmlEscape(origin)}/blog"/>
  <link rel="self" href="${xmlEscape(origin)}/blog/feed.xml"/>
  <id>${xmlEscape(origin)}/blog</id>
  <updated>${updated}</updated>
  <author><name>cutetopop.com</name></author>
${entries.join('\n')}
</feed>`;
  return new Response(xml, {
    headers: { 'Content-Type': 'application/atom+xml; charset=UTF-8', 'Cache-Control': 'public, max-age=1800', 'X-Content-Type-Options': 'nosniff' },
  });
}

// ---------- router ----------

export async function handleBlogRequest(request, env, url) {
  if (request.method !== 'GET' && request.method !== 'HEAD') {
    return new Response('Method Not Allowed', { status: 405, headers: { Allow: 'GET, HEAD' } });
  }
  const path = url.pathname.replace(/\/+$/, '') || '/blog';
  try {
    if (path === '/blog') return await listPage(env, url);
    if (path === '/blog/feed.xml') return await feed(env, url);

    const tagMatch = path.match(/^\/blog\/tag\/(content|character|creator|source)\/([^/]+)$/);
    if (tagMatch) {
      let name;
      try { name = decodeURIComponent(tagMatch[2]); } catch { return notFound(url.origin); }
      return await tagPage(env, url, tagMatch[1], name);
    }

    const postMatch = path.match(/^\/blog\/([a-z0-9]+(?:-[a-z0-9]+)*)$/);
    if (postMatch) {
      const post = await getPublishedPost(env, postMatch[1]);
      return post ? await renderPostPage(env, post, { origin: url.origin }) : notFound(url.origin);
    }
    return notFound(url.origin);
  } catch (error) {
    if (isMissingTable(error)) {
      // Blog tables not created yet: show an empty blog rather than an error
      return path === '/blog' || path === '/blog/feed.xml'
        ? page({ title: `blog · ${SITE_TITLE}`, origin: url.origin, cache: 'public, max-age=60', body: '<h1>blog</h1><p class="empty">No posts yet.</p>' })
        : notFound(url.origin);
    }
    console.error('Blog error:', error);
    return page({ title: `error · ${SITE_TITLE}`, origin: url.origin, status: 500, cache: 'no-store', body: '<h1>Something went wrong</h1><p class="empty">Please try again later.</p>' });
  }
}

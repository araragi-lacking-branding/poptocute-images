// src/admin/blog.js
// Admin side of the blog: the /api/admin/posts endpoints and the /admin/blog
// editor page. Both are only reachable through handleAdminRequest, which runs
// after the Cloudflare Access check in src/index.js.

import {
  createPost, deletePost, getPostById, isMissingTable, isUniqueSlugError, listAllPosts,
  updatePost, validatePostInput,
} from '../blog/data.js';
import { renderPostPage } from '../blog/pages.js';
import { BODY_TEXT_CSS, DISPLAY_TEXT_CSS, fontHead } from '../lib/fonts.js';

function json(data, headers, status = 200) {
  return new Response(JSON.stringify(data), { status, headers });
}

async function readJson(request) {
  try {
    return await request.json();
  } catch {
    return undefined;
  }
}

/**
 * Handle /api/admin/posts[/:id]. Returns null for paths it doesn't own.
 * `path` is the part after /api/admin.
 */
export async function handleBlogAdminAPI(request, env, path, headers) {
  const method = request.method;
  const idMatch = path.match(/^\/posts\/(\d+)$/);
  if (path !== '/posts' && !idMatch) return null;
  const id = idMatch ? parseInt(idMatch[1], 10) : null;

  try {
    if (!id && method === 'GET') return json({ posts: await listAllPosts(env) }, headers);

    if (!id && method === 'POST') {
      const checked = validatePostInput(await readJson(request));
      if (!checked.ok) return json({ error: checked.errors.join('; '), errors: checked.errors }, headers, 400);
      return json({ post: await createPost(env, checked.value) }, headers, 201);
    }

    if (id && method === 'GET') {
      const post = await getPostById(env, id);
      return post ? json({ post }, headers) : json({ error: 'Post not found' }, headers, 404);
    }

    if (id && method === 'PUT') {
      const checked = validatePostInput(await readJson(request));
      if (!checked.ok) return json({ error: checked.errors.join('; '), errors: checked.errors }, headers, 400);
      const post = await updatePost(env, id, checked.value);
      return post ? json({ post }, headers) : json({ error: 'Post not found' }, headers, 404);
    }

    if (id && method === 'DELETE') {
      return (await deletePost(env, id))
        ? json({ success: true }, headers)
        : json({ error: 'Post not found' }, headers, 404);
    }

    return json({ error: 'Method not allowed' }, headers, 405);
  } catch (error) {
    if (isUniqueSlugError(error)) return json({ error: 'Another post already uses that slug' }, headers, 409);
    if (isMissingTable(error)) {
      return json({ error: 'Blog tables are missing: apply migrations/0005_add_blog.sql to this database' }, headers, 503);
    }
    console.error('Blog admin API error:', error);
    return json({ error: 'Internal server error' }, headers, 500);
  }
}

// GET /admin/blog/preview/:id - the public post page for any status, not cached
export async function handleBlogPreview(env, url, id) {
  try {
    const post = await getPostById(env, id, { includeInactiveTags: false });
    if (!post) return new Response('Post not found', { status: 404, headers: { 'Content-Type': 'text/plain' } });
    return await renderPostPage(env, post, { origin: url.origin, preview: true });
  } catch (error) {
    if (isMissingTable(error)) return new Response('Blog tables are missing: apply migrations/0005_add_blog.sql', { status: 503 });
    throw error;
  }
}

// ---------- editor page ----------

// Browser code for the editor. Written as a real function so ESLint checks it,
// then serialised into the page. It builds every element with textContent, so
// post and tag text is never parsed as HTML.
/* global document, window, confirm */
function blogEditorClient() {
  const $ = (id) => document.getElementById(id);
  const state = { posts: [], tags: [], tagsById: new Map(), current: null, selected: new Set(), slugTouched: false, dirty: false };
  const CATEGORY_ORDER = ['content', 'character', 'creator', 'source'];

  function el(tag, props = {}, children = []) {
    const node = document.createElement(tag);
    for (const [k, v] of Object.entries(props)) {
      if (k === 'text') node.textContent = v;
      else if (k === 'on') for (const [ev, fn] of Object.entries(v)) node.addEventListener(ev, fn);
      else if (k === 'dataset') Object.assign(node.dataset, v);
      else node.setAttribute(k, v);
    }
    for (const c of children) if (c) node.append(c);
    return node;
  }

  function slugify(title) {
    return title.normalize('NFKD').replace(/[̀-ͯ]/g, '').toLowerCase()
      .replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 80).replace(/-+$/, '');
  }

  function setStatus(text, kind = '') {
    const s = $('saveStatus');
    s.textContent = text;
    s.className = 'save-status ' + kind;
  }

  async function api(path, options = {}) {
    const res = await fetch('/api/admin' + path, {
      ...options,
      headers: { 'Content-Type': 'application/json' },
      credentials: 'same-origin',
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error || ('HTTP ' + res.status));
    return data;
  }

  function renderList() {
    const list = $('postList');
    list.replaceChildren();
    if (!state.posts.length) {
      list.append(el('p', { class: 'muted', text: 'No posts yet. Write the first one →' }));
      return;
    }
    for (const p of state.posts) {
      const active = state.current && state.current.id === p.id;
      list.append(el('button', {
        class: 'post-item' + (active ? ' active' : ''),
        on: { click: () => confirmLeave() && openPost(p.id) },
      }, [
        el('span', { class: 'post-item-title', text: p.title }),
        el('span', { class: 'badge ' + p.status, text: p.status }),
        el('span', { class: 'post-item-date', text: (p.published_at || p.created_at || '').slice(0, 10) }),
      ]));
    }
  }

  function renderTagPicker() {
    const filter = $('tagFilter').value.trim().toLowerCase();
    const box = $('tagPicker');
    box.replaceChildren();
    for (const cat of CATEGORY_ORDER) {
      const tags = state.tags.filter((t) => t.category === cat &&
        (!filter || t.name.includes(filter) || (t.display_name || '').toLowerCase().includes(filter)));
      if (!tags.length) continue;
      const row = el('div', { class: 'tag-row' }, [el('div', { class: 'tag-cat', text: cat })]);
      for (const t of tags) {
        row.append(el('button', {
          type: 'button',
          class: 'chip' + (state.selected.has(t.id) ? ' on' : ''),
          dataset: { category: t.category },
          title: t.usage_count + ' image(s)',
          text: t.display_name || t.name,
          on: { click: () => { toggleTag(t.id); } },
        }));
      }
      box.append(row);
    }
    renderSelected();
  }

  function renderSelected() {
    const box = $('selectedTags');
    box.replaceChildren();
    if (!state.selected.size) {
      box.append(el('span', { class: 'muted', text: 'No tags yet: click tags below to attach them to this post.' }));
      return;
    }
    for (const id of state.selected) {
      const t = state.tagsById.get(id);
      if (!t) continue;
      box.append(el('span', { class: 'chip on', dataset: { category: t.category } }, [
        el('span', { text: t.display_name || t.name }),
        el('button', { type: 'button', class: 'mini', title: 'Insert a [[reference]] into the text', text: '↳ text',
          on: { click: () => insertRef(t) } }),
        el('button', { type: 'button', class: 'mini', title: 'Remove', text: '✕', on: { click: () => toggleTag(id) } }),
      ]));
    }
  }

  function toggleTag(id) {
    if (state.selected.has(id)) state.selected.delete(id); else state.selected.add(id);
    markDirty();
    renderTagPicker();
  }

  function insertRef(t) {
    const body = $('body');
    const ambiguous = state.tags.some((o) => o.name === t.name && o.id !== t.id);
    const ref = '[[' + (ambiguous ? t.category + ':' : '') + t.name + ']]';
    const start = body.selectionStart ?? body.value.length;
    body.setRangeText(ref, start, body.selectionEnd ?? start, 'end');
    body.focus();
    markDirty();
  }

  function markDirty() {
    state.dirty = true;
    setStatus('Unsaved changes');
  }

  function confirmLeave() {
    return !state.dirty || confirm('Discard unsaved changes?');
  }

  function fillForm(post) {
    state.current = post;
    state.selected = new Set((post?.tags || []).map((t) => t.id));
    state.slugTouched = Boolean(post);
    $('title').value = post?.title || '';
    $('slug').value = post?.slug || '';
    $('summary').value = post?.summary || '';
    $('body').value = post?.body || '';
    $('status').value = post?.status || 'draft';
    $('editorHeading').textContent = post ? 'Edit post' : 'New post';
    $('previewBtn').disabled = !post;
    $('deleteBtn').disabled = !post;
    const live = $('liveLink');
    live.hidden = !(post && post.status === 'published');
    if (post) live.href = '/blog/' + post.slug;
    state.dirty = false;
    setStatus(post ? 'Saved ' + (post.updated_at || '').slice(0, 16) + ' UTC' : '');
    renderTagPicker();
    renderList();
  }

  async function openPost(id) {
    try {
      const { post } = await api('/posts/' + id);
      fillForm(post);
    } catch (e) {
      setStatus(e.message, 'error');
    }
  }

  async function loadPosts() {
    const { posts } = await api('/posts');
    state.posts = posts;
    renderList();
  }

  async function save() {
    const payload = {
      title: $('title').value,
      slug: $('slug').value,
      summary: $('summary').value,
      body: $('body').value,
      status: $('status').value,
      tag_ids: [...state.selected],
    };
    setStatus('Saving…');
    try {
      const { post } = state.current
        ? await api('/posts/' + state.current.id, { method: 'PUT', body: JSON.stringify(payload) })
        : await api('/posts', { method: 'POST', body: JSON.stringify(payload) });
      await loadPosts();
      fillForm(post);
      setStatus('Saved', 'ok');
    } catch (e) {
      setStatus(e.message, 'error');
    }
  }

  async function remove() {
    if (!state.current || !confirm('Delete "' + state.current.title + '" permanently? (Set it to hidden instead to keep it.)')) return;
    try {
      await api('/posts/' + state.current.id, { method: 'DELETE' });
      state.dirty = false;
      await loadPosts();
      fillForm(null);
      setStatus('Deleted', 'ok');
    } catch (e) {
      setStatus(e.message, 'error');
    }
  }

  $('title').addEventListener('input', () => {
    if (!state.slugTouched) $('slug').value = slugify($('title').value);
    markDirty();
  });
  $('slug').addEventListener('input', () => { state.slugTouched = $('slug').value.trim() !== ''; markDirty(); });
  for (const id of ['summary', 'body', 'status']) $(id).addEventListener('input', markDirty);
  $('tagFilter').addEventListener('input', renderTagPicker);
  $('newBtn').addEventListener('click', () => confirmLeave() && fillForm(null));
  $('saveBtn').addEventListener('click', save);
  $('deleteBtn').addEventListener('click', remove);
  $('previewBtn').addEventListener('click', () => {
    if (state.current) window.open('/admin/blog/preview/' + state.current.id, '_blank', 'noopener');
  });
  document.addEventListener('keydown', (e) => {
    if ((e.ctrlKey || e.metaKey) && e.key === 's') { e.preventDefault(); save(); }
  });
  window.addEventListener('beforeunload', (e) => { if (state.dirty) e.preventDefault(); });

  (async () => {
    try {
      const organized = await api('/tags');
      state.tags = Object.values(organized).flat();
      state.tagsById = new Map(state.tags.map((t) => [t.id, t]));
      await loadPosts();
      const wanted = parseInt(new URLSearchParams(location.search).get('id') || '', 10);
      if (wanted) await openPost(wanted); else fillForm(null);
    } catch (e) {
      setStatus(e.message, 'error');
    }
  })();
}

export function generateBlogAdminUI() {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Blog - Admin - *cute* and *pop*</title>
  <link rel="icon" type="image/x-icon" href="/favicon.ico">
  ${fontHead({ display: true })}
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; background: #f5f5f5; color: #333; padding: 20px; }
    .header { background: white; padding: 20px; border-radius: 8px; box-shadow: 0 2px 4px rgba(0,0,0,0.1); margin-bottom: 20px; }
    .header h1 { font-size: 24px; margin-bottom: 15px; }
    .header .nav-tabs { display: flex; gap: 10px; }
    .header .nav-tab { padding: 8px 16px; background: #f0f0f0; color: #666; border-radius: 6px 6px 0 0; font-size: 14px; font-weight: 500; text-decoration: none; }
    .header .nav-tab:hover { background: #e0e0e0; }
    .header .nav-tab.active { background: white; color: #4ecdc4; font-weight: 600; border-bottom: 2px solid #4ecdc4; }
    .layout { display: grid; grid-template-columns: 280px 1fr; gap: 20px; align-items: start; }
    .panel { background: white; border-radius: 8px; box-shadow: 0 2px 4px rgba(0,0,0,0.1); padding: 16px; }
    .panel h2 { font-size: 16px; margin-bottom: 12px; display: flex; justify-content: space-between; align-items: center; }
    .post-item { display: grid; grid-template-columns: 1fr auto; gap: 2px 8px; width: 100%; text-align: left; background: none; border: 1px solid transparent; border-radius: 6px; padding: 8px; cursor: pointer; font: inherit; }
    .post-item:hover { background: #f7f7f7; }
    .post-item.active { border-color: #4ecdc4; background: #f0fbfa; }
    .post-item-title { font-size: 14px; font-weight: 500; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
    .post-item-date { font-size: 12px; color: #999; grid-column: 1; }
    .badge { font-size: 11px; padding: 1px 6px; border-radius: 10px; background: #eee; color: #666; align-self: start; }
    .badge.published { background: #e3f8f5; color: #23877d; }
    .badge.hidden { background: #fbe9ec; color: #a33; }
    label { display: block; font-size: 12px; font-weight: 600; color: #666; margin: 14px 0 4px; }
    input[type=text], textarea, select { width: 100%; padding: 8px 10px; border: 1px solid #ddd; border-radius: 6px; font: inherit; font-size: 14px; background: #fff; }
    input:focus, textarea:focus, select:focus { outline: none; border-color: #4ecdc4; }
    #summary, #body { ${BODY_TEXT_CSS} }
    #title { ${DISPLAY_TEXT_CSS} font-size: 22px; }
    #summary { font-size: 15px; }
    #body { font-size: 16px; line-height: 1.75; min-height: 360px; resize: vertical; }
    .row { display: grid; grid-template-columns: 1fr 160px; gap: 12px; }
    .hint { font-size: 12px; color: #999; margin-top: 4px; line-height: 1.5; }
    .hint code { background: #f5f5f5; padding: 0 4px; border-radius: 3px; }
    .chips, .tag-row { display: flex; flex-wrap: wrap; gap: 6px; align-items: center; }
    .tag-row { margin-bottom: 8px; }
    .tag-cat { width: 72px; font-size: 11px; text-transform: uppercase; color: #999; letter-spacing: .04em; }
    #tagPicker { max-height: 220px; overflow-y: auto; border: 1px solid #eee; border-radius: 6px; padding: 10px; margin-top: 6px; }
    .chip { display: inline-flex; align-items: center; gap: 4px; padding: 2px 10px; border: 1px solid #e5e5e5; border-left: 3px solid #ccc; border-radius: 20px; background: #fff; font-size: 13px; cursor: pointer; font-family: inherit; color: #333; }
    .chip.on { background: #f0fbfa; border-color: #4ecdc4; }
    .chip[data-category=content] { border-left-color: #ff6b9d; }
    .chip[data-category=character] { border-left-color: #4ecdc4; }
    .chip[data-category=creator] { border-left-color: #95e1d3; }
    .chip[data-category=source] { border-left-color: #ffa07a; }
    .mini { border: none; background: none; color: #999; cursor: pointer; font-size: 11px; padding: 0 2px; }
    .mini:hover { color: #4ecdc4; }
    .actions { display: flex; gap: 8px; align-items: center; margin-top: 18px; flex-wrap: wrap; }
    .btn { padding: 8px 16px; border: none; border-radius: 6px; font-size: 14px; cursor: pointer; background: #f0f0f0; color: #333; text-decoration: none; }
    .btn:disabled { opacity: .4; cursor: default; }
    .btn-primary { background: #4ecdc4; color: white; }
    .btn-danger { background: none; color: #c44; margin-left: auto; }
    .save-status { font-size: 13px; color: #999; }
    .save-status.ok { color: #23877d; }
    .save-status.error { color: #c44; }
    .muted { color: #999; font-size: 13px; }
    @media (max-width: 800px) { .layout { grid-template-columns: 1fr; } .row { grid-template-columns: 1fr; } }
  </style>
</head>
<body>
  <div class="header">
    <h1>*cute* and *pop* — Admin</h1>
    <div class="nav-tabs">
      <a href="/admin/images" class="nav-tab">📸 Images & Tags</a>
      <a href="/admin/artists" class="nav-tab">👤 Artist Profiles</a>
      <a href="/admin/blog" class="nav-tab active">📝 Blog</a>
    </div>
  </div>

  <div class="layout">
    <div class="panel">
      <h2>Posts <button class="btn" id="newBtn" type="button">+ New</button></h2>
      <div id="postList"><p class="muted">Loading…</p></div>
      <p class="hint" style="margin-top:12px"><a href="/blog" target="_blank" rel="noopener">Open the public blog ↗</a></p>
    </div>

    <div class="panel">
      <h2 id="editorHeading">New post</h2>
      <label for="title">Title</label>
      <input type="text" id="title" maxlength="200" placeholder="A title">

      <div class="row">
        <div>
          <label for="slug">Address</label>
          <input type="text" id="slug" maxlength="80" placeholder="made-from-the-title">
          <div class="hint">cutetopop.com/blog/<em>address</em>. Lowercase letters, numbers, hyphens.</div>
        </div>
        <div>
          <label for="status">Status</label>
          <select id="status">
            <option value="draft">draft</option>
            <option value="published">published</option>
            <option value="hidden">hidden</option>
          </select>
          <div class="hint">Only published posts are public.</div>
        </div>
      </div>

      <label for="summary">Summary <span style="font-weight:normal">(optional, shown in the list)</span></label>
      <input type="text" id="summary" maxlength="500" placeholder="Left empty: the first paragraph is used">

      <label for="body">Text</label>
      <textarea id="body" placeholder="Write here."></textarea>
      <div class="hint">
        <code>**bold**</code> <code>*italic*</code> <code>[link](https://…)</code> <code># heading</code>
        <code>- list</code> <code>&gt; quote</code> <code>![alt](/images/file.jpg)</code> (site images only) ·
        <code>[[tag-name]]</code> or <code>[[creator:tag-name]]</code> links a tag from the main tag tables.
      </div>

      <label>Tags on this post</label>
      <div class="chips" id="selectedTags"></div>
      <input type="text" id="tagFilter" placeholder="Filter tags…" style="margin-top:8px">
      <div id="tagPicker"></div>

      <div class="actions">
        <button class="btn btn-primary" id="saveBtn" type="button">Save</button>
        <button class="btn" id="previewBtn" type="button" disabled>Preview ↗</button>
        <a class="btn" id="liveLink" target="_blank" rel="noopener" hidden>View live ↗</a>
        <span class="save-status" id="saveStatus"></span>
        <button class="btn btn-danger" id="deleteBtn" type="button" disabled>Delete</button>
      </div>
    </div>
  </div>

  <script>
    // Wrangler's bundler (esbuild keepNames) wraps inner functions in __name(fn, "name");
    // that helper only exists in the Worker, so give the browser a no-op one.
    const __name = (fn) => fn;
    (${blogEditorClient.toString()})();
  </script>
</body>
</html>`;
}

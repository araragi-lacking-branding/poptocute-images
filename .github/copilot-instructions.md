# Guidance for AI Coding Agents: poptocute-images

## TL;DR for AI Agents
1. **Purpose:** Maximize AI/agentic coding for learning in ethics, technical transparency, and media attribution.
2. **Act sequentially:** Announce, explain, and confirm each step before proceeding to the next.
3. **Key files:** `src/index.js`, `src/admin/routes.js`, `src/admin/upload.js`, `src/lib/metadata-extractor.js`, `scripts/backfill-image-metadata.js`, `openapi-schema.yaml`, `README.md`.
4. **Update OpenAPI and code together:** Always keep `openapi-schema.yaml` in sync with endpoint changes.
5. **Favor explicit, small changes:** Update handler, OpenAPI, and bindings in clear, stepwise commits.
6. **File manipulations:** The agent should make file changes directly, then request human review before merging or deploying.
7. **Git best practices:** All changes should follow standard git workflows (clear commit messages, atomic commits, and PRs for review).

---

## 1. Statement of Purpose
This project is an experiment in agentic, AI-driven coding: the goal is to maximize the use of AI agents for all development, with minimal human intervention. The site and its workflows are designed to test and learn about the boundaries of autonomous coding, with a focus on ethics, technical transparency, and media attribution. Every change should be made with the intent to document, explain, and reflect on the agent's process, supporting learning in compliance, attribution, and responsible automation.

## 2. Project Summary
This repo hosts a Cloudflare Workers-based image site. The Worker serves public APIs, an admin UI, stores images in R2, metadata in D1, and uses KV for fast caches. All development should be performed by AI agents acting stepwise and sequentially, with each action explained and confirmed before proceeding to the next.

## 3. Key Files and Directories
* `src/index.js` — main Worker entry (exports default with `fetch` and `scheduled`). Most public API logic lives here (see `handleAPI`, `getRandomImage`, `getImagesList`).
* `src/admin/routes.js` — admin UI routes and `/api/admin/*` handlers.
* `src/admin/upload.js` — upload flow, R2 put, deduplication (SHA-256 into `images.file_hash`), metadata extraction.
* `src/lib/metadata-extractor.js` — canonical metadata parsing logic used by upload and backfills.
* `scripts/backfill-image-metadata.js` — example batch script and parsing utilities used in backfills.
* `openapi-schema.yaml` — the API contract. Keep this in sync when you add/modify endpoints.
* `README.md` — operational notes (wrangler, DB commands, deployment flow).

## 4. Runtime Patterns and Conventions
* **Cloudflare bindings:** Use `env.DB` for D1, `env.IMAGES` for R2, `env.IMAGES_CACHE` (KV) for cached lists. Modify `wrangler.toml` if you add bindings.
* **KV keys:** `images-list` (JSON array of filenames) and `active-count` (text count) are used by `getImagesList`/`getRandomImage`.
* **DB access:** Use `env.DB.prepare(...).all()/first()/run()`; SQL is inline. Prefer indexed lookups and avoid `ORDER BY RANDOM()` — use OFFSET for random selection (see `getRandomImage`).
* **Upload rules:** Max 10MB and allowed MIME types `['image/jpeg','image/png','image/gif','image/webp','image/avif']` (see `src/admin/upload.js`). Deduplication checks `images.file_hash`.
* **Tag categories:** `content`, `character`, `creator`, `source`. Creating a `creator` tag auto-creates/links an `artists` row (see `routes.js:createTag`).
* **Image serving:** Images served from R2 via `env.IMAGES.get(filename)`; production uses Cloudflare Image Resizing at `/cdn-cgi/image/...`.
* **Error & background handling:** Scheduled tasks should log errors but avoid throwing (see `scheduled` in `src/index.js`); non-fatal background work is triggered with `ctx.waitUntil` or fire-and-forget `syncKVCache(env).catch(...)`.

## 5. Developer Workflows (Commands)
* **Local dev:** `npx wrangler dev` (Worker dev server). See `README.md` for D1 commands; prefer `wrangler` for D1 queries.
* **Deploy:** `wrangler deploy` (or `npm run deploy`).
* **Manual KV sync:** POST `/api/admin/sync` or run `node scripts/sync-kv.js`.
* **Backfill metadata:** Run the Worker version or `node scripts/backfill-image-metadata.js` (accepts `--dry-run` and `--limit`).

## 6. Stepwise Endpoint Changes (Agentic Policy)
1. **Announce intent and plan:** Clearly state the goal and the sequence of steps you will take.
2. **Update `openapi-schema.yaml`:** Add or modify the path and response schema for the new endpoint, explaining the change.
3. **Implement handler:** Add the handler in either `src/index.js` (`/api/*` public) or `src/admin/routes.js` (`/api/admin/*`), using existing patterns. Explain each code change and confirm completion before moving on.
4. **Update bindings if needed:** If new env bindings are required, update `wrangler.toml` and ensure `env.*` usage matches binding names. Confirm the update.
5. **Test locally:** Run the Worker locally (`npx wrangler dev`) and exercise the endpoint. Report results and confirm before proceeding.
6. **Validate DB effects:** Run a quick D1 query with `npx wrangler d1 execute <db> --command "SELECT ..."` if needed. Confirm results.
7. **Summarize and document:** At each step, explain what was done and why, and confirm before moving to the next action.

## 7. Performance & Query Tips
* To pick a random row, use a two-step approach: read count (from KV if possible) and `SELECT ... LIMIT 1 OFFSET X`. See `getRandomImage` for an example.
* When iterating large sets, use small batches + short sleeps (see backfill script).

## 8. Policy for AI Edits (Strict)
1. Preserve existing public behavior unless asked to change it. If you change API shapes, update `openapi-schema.yaml` and `README.md`.
2. Do not add external network calls or new third-party services without noting config and credentials changes (this repo runs on Cloudflare bindings).
3. **Always act sequentially:** Explain each action, confirm completion, and only proceed when the previous step is done. This is essential for traceability and learning in agentic coding.
4. **File manipulations:** The agent should make file changes directly, then request human review before merging or deploying.
5. **Git best practices:** All changes should follow standard git workflows (clear commit messages, atomic commits, and PRs for review).

## 9. Example Prompts
* "Add a GET `/api/health` endpoint returning DB connectivity and KV status; register it in `openapi-schema.yaml` and implement in `src/index.js` following current CORS and error patterns." (Include test steps: `npx wrangler dev`, curl the endpoint.)
* "Optimize tag count query used by admin tags: replace JOIN+GROUP BY with an indexed count subquery and keep response shape identical." (Use `env.DB.prepare(...).all()` and ensure ordering by `tc.sort_order` is preserved.)

## 10. If Anything Is Unclear
Point to these files in a short question (file + line/context) and ask for the missing operational detail (e.g., Cloudflare account names, D1 database id in `wrangler.toml`) before making changes requiring credentials. Always explain your reasoning and confirm each step as you go.

---



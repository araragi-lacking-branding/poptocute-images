# Guidance for AI coding agents: poptocute-images

This file is for any AI agent working in this repository (Claude Code reads it through `CLAUDE.md`). It replaces the earlier `.github/copilot-instructions.md`.

## Purpose
This project is an experiment in AI-driven development. The maintainer intends almost all code, review and deployment to be done by AI agents, as a way to study ethics, technical transparency and media attribution in practice. The README's human-written sections on art attribution, takedowns, funding and tracking are the project's commitments. Changes must not work against them. That means no ads or monetization, minimal tracking, crediting artists, and honoring takedown requests, including in backups.

Work so that a person can follow it later: explain what you're changing and why, make small focused commits with clear messages, and say plainly what you verified and what you didn't.

## How changes reach production
1. Work on a branch and open a PR. `main` is protected: no direct pushes, no force-pushes, no deletion, and the `checks` CI job must pass.
2. CI (`.github/workflows/ci.yml`) runs `npm ci`, `npm run lint`, `npm test` and `wrangler deploy --dry-run`. It uses no Cloudflare credentials.
3. **Merging to `main` deploys to production** through Cloudflare Workers Builds, but only when the merge touches a watched path: `src/`, `public/`, `wrangler.toml`, `schema.sql`, `package.json` or `package-lock.json`. Docs, CI, script and test changes merge without a deploy.
4. The maintainer allows an agent to merge its own PRs **after auditing them**. Review the full diff, confirm CI passed, look for risky patterns (secrets, new network calls, weaker auth, destructive commands), and state what will ship. After a deploy, check the live site (`/`, `/api/random`, `/admin` → Access login, `www` → redirect) and report the deployed version. The rollback is `npx wrangler rollback`.
5. Always confirm with the maintainer first before history rewrites, force-pushes, deleting data or Cloudflare resources, or changing tokens or Access.

## Key files
- `src/index.js`: main Worker entry (`fetch` and `scheduled`). Holds the routing, the public API (`handleAPI`, `getImagesList`), the `www` → apex redirect, and the admin gate.
- `src/lib/access.js`: verifies the Cloudflare Access JWT on every `/admin` and `/api/admin/*` request.
- `src/admin/routes.js`: admin UI routes and `/api/admin/*` handlers.
- `src/admin/upload.js`: upload flow (R2 put, SHA-256 deduplication into `images.file_hash`, metadata extraction).
- `src/handlers/random.js`: random image selection.
- `src/lib/metadata-extractor.js`: image metadata parsing used by uploads and backfills.
- `openapi-schema.yaml`: the API contract. Keep it in sync with endpoint changes.
- `wrangler.toml`: bindings, routes, cron, and the Access identifiers (`ACCESS_TEAM_DOMAIN`, `ACCESS_AUD`).
- `test/`: offline `node:test` suites. They need no network or Cloudflare account.
- `scripts/backup-d1.mjs`: D1 backup, verified restore, and `--restore-local` for dev data.

## Security rules
- `/admin` and `/api/admin/*` are protected twice: by Cloudflare Access at the edge (on `cutetopop.com` only), and by the Worker's own JWT check. Never remove or weaken either one, and never add a code path that serves admin handlers without `verifyAccessRequest`.
- The only public hostname is `cutetopop.com`. `www.cutetopop.com` redirects to it in the Worker, and `workers_dev` and `preview_urls` are off. Don't add routes, custom domains or subdomains without covering admin for them.
- `ACCESS_DEV_BYPASS` belongs only in `.dev.vars` for local development. Never put it in `wrangler.toml` or production.
- No secrets in the repo. Cloudflare bindings and the Access IDs in `wrangler.toml` are public identifiers.
- Don't add external network calls or third-party services without saying so and documenting their configuration. The Worker's only outbound call is the Access certificates fetch.

## Runtime patterns and conventions
- **Bindings:** `env.DB` (D1), `env.IMAGES` (R2), `env.IMAGES_CACHE` (KV). Update `wrangler.toml` if you add one.
- **KV keys:** `images-list` (JSON array of filenames) and `active-count` (text count), used by `getImagesList` and `getRandomImage`.
- **DB access:** `env.DB.prepare(...).all()/first()/run()` with inline SQL. Prefer indexed lookups. For random rows, avoid `ORDER BY RANDOM()`: read the count (from KV if possible), then `SELECT ... LIMIT 1 OFFSET X`.
- **Uploads:** max 10 MB; MIME types `image/jpeg`, `image/png`, `image/gif`, `image/webp`, `image/avif` (`src/admin/upload.js`). Deduplication uses `images.file_hash`.
- **Tag categories:** `content`, `character`, `creator`, `source`. Creating a `creator` tag also creates or links an `artists` row (`routes.js: createTag`).
- **Images** are served from R2 via `env.IMAGES.get(filename)`; production uses Cloudflare Image Resizing at `/cdn-cgi/image/...`.
- **Scheduled and background work** logs errors but doesn't throw. Use `ctx.waitUntil` or a fire-and-forget `syncKVCache(env).catch(...)`.
- When iterating large sets, use small batches with short pauses (see `scripts/backfill-image-metadata.js`).

## Commands
- `npm ci`, then `npm run lint` and `npm test`: the same checks as CI.
- `npx wrangler dev`: local Worker. It has no Access in front, so `/admin` returns 403 unless `.dev.vars` contains `ACCESS_DEV_BYPASS = "true"`.
- Local data: `node scripts/backup-d1.mjs --verify` (export from production), then `node scripts/backup-d1.mjs --restore-local backups/d1/<file>.sql`.
- D1 queries: `npx wrangler d1 execute cutetopop-db --remote --command "SELECT ..."`. Writes to `--remote` change production; use `--local` unless production is the intent.
- `scripts/test-artist-api.js` and `scripts/test-duplicate-prevention.js` **write data**. Run them only against `wrangler dev`.
- Manual KV sync: `POST /api/admin/sync`, or `node scripts/sync-kv.js`.

## Changing an endpoint
1. State the goal and the steps.
2. Update `openapi-schema.yaml`.
3. Implement it in `src/index.js` (public `/api/*`) or `src/admin/routes.js` (`/api/admin/*`) following the existing patterns, including CORS and error handling.
4. Add or update tests in `test/` where the logic can be tested offline.
5. Run it locally with `wrangler dev` and exercise the endpoint.
6. Keep the API's existing public behavior unless the change is asked for. If response shapes change, update the README and OpenAPI.

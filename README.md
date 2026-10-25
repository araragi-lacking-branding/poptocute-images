# Hands-off AI Building of an Application as Ethics, Compliance, and Security Exploration
**it's all pretty silly, so bear with me. You'll see where the robot starts talking.**

The "simple" goal of this project is to build a site reminiscent of 2000s internet - niche, singular if broad focus, and minimal visual clutter.
Like many of the folks I grew up with then, it'll be strung together with spaghetti code and other people's work, based on suggestions from large groups of people on the internet. <br></br>
The main difference is it'll be explored by telling a large language model to build and review things without much oversight.
Mostly this is to learn through doing (in a very, very specific sense) while creating a personal critique. Specifically, beyond the tech side, it was terribly easy to get a free tool running using other people's work. **Statements on ethics, intent, and similar are below and hopefully obviously human written.**
<br></br>
So that's all this is - can I build something almost solely with AI that provides its own critique and measures for both technical and artistic integrity.
- See it live - if it's working: https://cutetopop.com

# *Why?*
I'm a compliance and risk person in the healthcare space. A large part of me has been terrified to see AI entering those spaces with minimal client review on major service providers.
I'm not a developer. I'm not an engineer in any way. As said, tech and compliance has been the majority of my career, though predominantly in front facing technical work and analysis. <br></br>
Almost none of this project will consist of personal original code and will be put up with minimal dedicated review. It could be great. It could burn horribly. I'd like to see what happens. <br></br>
I'm not attempting to be maliciously critcal of the technology being used here - I, honestly, thank it's amazing work. It's just very easy to be misued and misunderstood, and I'd like to learn and demonstrate more on that.
However, I do intend this to be a critique, in the formal sense. Taking a hypothesis on a topic, researching it, testing it, and comparing against other models, works, and theoretics to build a better understanding.

# *art & attribution ethics*
- We are currently using a small batch of images with a silly watermark to test. The goal is to delete and replace with attributed works as soon as possible.
- Specifically: an attribution system does exist on the backend - to be moved to front - to allow proper crediting and display. A proper "remove" button should be coming as well to automate takedowns.
- *if you would like an image taken down, email the project at lambda@cutetopop.com*. you don't have to be the owner, provide any proof, or anything else. Just send the filename (most should be the hash of the file) and it will be gone as soon as possible.
- the only exception to the above would be for volunteered art to the project (unless revoked by the artist, obviously), licensed stock images, or similar. Even then, any good faith message would be taken incredibly serious, and I'd like to remove the work if any claim of ownership or attribution was in quest.

# *funding, cost, and use disclosures / ethics*
- There is absolutely no outside money coming into this project. There are no ads or monetization. There is absolutely no plan to add anything like that. Minimizing tracking is also crucial.
- Observability via Cloudflare is turned on. We may explore site tags, SEO, and such in the future, but that's not a goal now, and should never be used for monetization on this site.
- If that changes, it will be disclosed immediately. It is against the ethos of the project however, and the site concept is purposefully pretty meaningless in the modern internet to avoid abuse.
- If you see a change or anything not aligning to the above, please let me know - lambda@cutetopop.com. Given the nature of the build concept, it is very possible for items to be injected or added unknowingly by the model.
- Costs should be minimal (currently only the domain registration), primarily using Cloudflare and GitHub for all services. I'll update services as they change, but everything currently is running off of Cloudflare D1 / R2 / KV / Workers and right here.
- For AI usage, Claude from Anthropic is currently in use. Prior to GitHub, I coded the original image services as a local test, then asked ChatGPT to rebuild it entirely. Then it went up here. I don't see much of my code there, so let's say it's all AI at this point besides a couple manual fixes.
- The email for the site is hosted via Proton, though this was not specific to this project. 

# if you'd like to contribute, question, or request anything, please email the site at lambda@cutetopop.com . <br></br> *And now, here's what the LLM says we're doing:*





# *cute* and *pop*

A small random-image site at **https://cutetopop.com**, with tagging and artist attribution behind it. It runs entirely on Cloudflare (Workers, D1, R2, KV), and the code lives here on GitHub. Almost all of it was written, reviewed and deployed by AI agents. See [AGENTS.md](AGENTS.md) for the rules they work under.

## Current state

- **What's live:** four test banners (the "silly watermark" images above), shown at random. Every other image was removed from the site and from Cloudflare storage in October 2026.
- **Attribution data stays:** the tag, credit and artist records (46 tags, 22 credits, 12 artists) are kept for when attributed works replace the test images.
- **Admin:** an image and artist management UI at `/admin`, for the maintainer only.

## How it works

| Piece | Cloudflare product | What it holds or does |
|---|---|---|
| Worker (`src/`) | Workers | Serves the page, the public API, the admin UI and images. Runs a daily 3 AM UTC maintenance job. |
| Images | R2 bucket `cutetopop-images` | Image files under hash-based names (`images/<hash>.jpg`). Not stored in this repository. |
| Metadata | D1 database `cutetopop-db` | Images, tags, credits, artists, feedback (9 tables, 5 views). |
| Image list cache | KV namespace | The active image list, rebuilt from D1 by the daily job or `POST /api/admin/sync`. |
| Resizing | Image Resizing | WebP conversion via `/cdn-cgi/image/...`. |
| Admin login | Cloudflare Access (Zero Trust) | Email one-time PIN in front of `/admin` and `/api/admin/*`. |

## Security

- **Admin is locked twice.** Cloudflare Access protects `/admin` and `/api/admin/*` at the edge. The Worker also verifies the Access login token itself (`src/lib/access.js`) and returns 403 without a valid one. Even if a hostname or route slips past Access, admin stays closed.
- **One public hostname.** `cutetopop.com` is the only way in. `www.cutetopop.com` redirects to it, and `workers.dev` and preview URLs are off (`wrangler.toml`).
- **No secrets in the repo.** The IDs in `wrangler.toml` (database, bucket, KV namespace, Access team and app) are public identifiers. Local-only settings go in `.dev.vars`, which is gitignored.
- **GitHub:** secret scanning with push protection, Dependabot alerts and security updates, and a protected `main` branch (pull requests and passing CI required, no force-pushes).

## API

**Public** (no login, JSON):

| Endpoint | Returns |
|---|---|
| `GET /api/random` | One random active image with its metadata, credit and artist |
| `GET /api/images?limit=&offset=` | Paged list of active images |
| `GET /api/stats` | Counts: images, tags, credited artists, artists |
| `GET /api/artists` | Artist profiles with image counts |
| `GET /api/artists/:id` | One artist profile |
| `GET /images.json` | The active image list (served from KV) |
| `GET /images/<file>` | An image file from R2 |

**Admin** (Access login required): images (list, get, update, change status), tags (list, create, change status), artists (list, create, get, update, delete, change status, their images, link and unlink tags), upload, KV sync, and metadata backfill and validation. The admin UI pages are `/admin/images` and `/admin/artists`.

The full contract is in [openapi-schema.yaml](openapi-schema.yaml) (also used for Cloudflare API Shield; see [docs/api.md](docs/api.md)). Keep it in sync with endpoint changes.

## Local development

You need Node.js 22 or later (CI uses 24) and a Cloudflare account with access to this project.

```bash
git clone https://github.com/araragi-lacking-branding/poptocute-images.git
cd poptocute-images
npm ci                      # installs the project's own Wrangler
npx wrangler login          # browser sign-in to Cloudflare

npm run lint                # the same checks CI runs on every pull request
npm test

npx wrangler dev            # local Worker at http://localhost:8787
```

- **Admin locally:** `wrangler dev` has no Access in front of it, so `/admin` returns 403. Create `.dev.vars` containing `ACCESS_DEV_BYPASS = "true"` to use it. Never put this in `wrangler.toml`.
- **Real data locally:** the local database starts empty. Load production data into it with `node scripts/backup-d1.mjs --verify`, then `node scripts/backup-d1.mjs --restore-local backups/d1/<file>.sql`.
- **Local vs production:** D1 commands without `--remote` change only your local copy. With `--remote` they change production.
- **Scripts that write data:** `scripts/test-artist-api.js` and `scripts/test-duplicate-prevention.js` create records. Run them only against `wrangler dev`.

## Making changes and deploying

1. Branch, commit, and open a pull request. `main` can't be pushed to directly.
2. CI runs lint, the offline tests and a build check. It must pass before merging.
3. **Merging to `main` deploys** through Cloudflare Workers Builds, about 2 minutes later. It deploys only when the merge touches `src/`, `public/`, `wrangler.toml`, `schema.sql`, `package.json` or `package-lock.json`. Docs, CI, script and test changes don't deploy.
4. The rollback is `npx wrangler rollback`. The manual deploy fallback is `npx wrangler deploy`.

Routes and custom domains come from `wrangler.toml`. Wrangler can't delete plain routes created in the dashboard, so remove those there.

## Backups

| Data | Primary recovery | Off-site copy |
|---|---|---|
| D1 database | D1 Time Travel: `npx wrangler d1 time-travel restore cutetopop-db --timestamp=<ISO time>` | `scripts/backup-d1.mjs` SQL dumps |
| R2 images | none (R2 has no versioning) | S3-compatible sync of the bucket with a read-only R2 token |
| KV cache | not needed: rebuilt from D1 | |

```bash
node scripts/backup-d1.mjs --verify      # export to backups/d1/, test-restore it, keep the newest 12
node scripts/backup-d1.mjs --dry-run     # show what would happen
node scripts/backup-d1.mjs --restore-local backups/d1/<file>.sql   # load a dump into the wrangler dev DB
```

- Exports only read production, so a read-only API token is enough.
- Each run appends a line to `<out>/backup-log.txt` and records its outcome in `backups/backup-d1-last-run.txt`. `backups/` is gitignored.
- D1 exports can list a table before a table its foreign keys point at. The script's restore creates every table first, then loads the dump unchanged.
- Takedowns: when an image is removed from the site, also remove it from the off-site copies.

## Data model

| Table | Holds |
|---|---|
| `images` | One row per image: file, status (`active`/`hidden`), dimensions, hash, license and notes, credit |
| `tags`, `tag_categories` | Tags in four categories: `content`, `character`, `creator`, `source` |
| `image_tags` | Which tags are on which image |
| `credits` | Attribution for an image's source |
| `artists`, `artist_tags` | Artist profiles, linked to their `creator` tags |
| `feedback` | Visitor submissions, kept separate from approved tags |

Views: `v_images_active`, `v_image_tags_by_category`, `v_tag_stats`, `v_artist_profiles`, `v_feedback_pending`. The base schema is in `schema.sql`, and later changes are in `migrations/`.

## Repository map

```
src/
  index.js                   routing, public API, page, image serving, admin gate, www redirect
  handlers/random.js         random image selection
  lib/access.js              Cloudflare Access token verification
  lib/metadata-extractor.js  image metadata parsing (uploads, backfills)
  admin/                     admin UI (ui.js), API (routes.js), upload, KV sync, artists, metadata sync
  static/                    the page's CSS and browser JavaScript
test/                        offline node:test suites (npm test)
scripts/                     backup, KV sync, metadata backfill, and local test/monitoring helpers
migrations/                  D1 schema migrations
docs/                        API Shield notes (api.md), attribution ethics (ethics.md)
.github/                     CI workflow, Dependabot config
AGENTS.md                    rules for AI agents working here (CLAUDE.md points to it)
wrangler.toml                Worker config: bindings, routes, cron, Access identifiers
openapi-schema.yaml/.json    API contract
```

The other Markdown files in the root (`IMPLEMENTATION_SUMMARY.md`, `PERFORMANCE_REPORT.md` and similar) are working notes the agents wrote during earlier changes. They're kept as part of the project's record.

## Contact

Questions, takedown requests, or anything else: **lambda@cutetopop.com**.

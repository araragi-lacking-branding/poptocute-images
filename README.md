# Hands-off AI Building of an Application as Ethics, Compliance, and Security Exploration
**it's all pretty sily, so bear with me. You'll see where the robot starts talking.**

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

A random image display site with metadata management, tagging, and attribution system powered by Cloudflare Workers, D1, R2, KV, and GitHub.

## Architecture

- **Images**: Stored in Cloudflare R2 (hash-based names) with backup in GitHub (`public/images/`)
- **Cache**: Cloudflare KV for fast global image list access
- **Metadata**: Cloudflare D1 database (tags, credits, status)
- **Image Transforms**: Cloudflare Image Resizing via `/cdn-cgi/image/` for WebP conversion
- **Worker**: Cloudflare Workers (API + HTML serving + Admin UI)
- **Deployment**: Cloudflare Pages with GitHub integration

## Current Status

✅ **Phase 1: Complete**
- 187 images migrated to R2 storage
- Random image display working with KV caching
- D1 database with full schema (6 tables, 4 views)
- Worker serving from R2 with CDN optimization
- WebP transformation via Cloudflare native handling

✅ **Phase 2: Complete**
- Tag system implemented (4 categories: content, character, creator, source)
- Credit attribution system active
- Admin UI fully functional at `/admin`
- Image upload with R2 integration
- KV sync capability for cache refresh

🚧 **Phase 3: In Progress**
- Metadata curation for existing images
- Tag management and bulk operations
- Frontend attribution display enhancement

🌐 **Phase 4: Future** (Long-term)
- Public submission system
- User feedback and contributions
- Advanced moderation workflow

## Database Schema

### Tables
- `images` - Image metadata and status
- `tags` - Available tags organized by category
- `tag_categories` - Flexible category system (content, character, creator, source)
- `image_tags` - Many-to-many: active approved tags
- `credits` - Artist/source attribution
- `feedback` - User submissions (separate from active tags)

### Tag Categories
- **content**: What's in the image (cute, cat, food, pixel-art)
- **character**: Specific characters (hello-kitty, pikachu)
- **creator**: Original artist or studio
- **source**: Original media (pokemon, sanrio, sailor-moon)

## API Endpoints

### Public API

#### `GET /api/random`
Get a random active image with metadata
```json
{
  "id": 1,
  "filename": "images/abc123def456.png",
  "alt_text": "Cute cat",
  "credit_name": "Artist Name",
  "credit_url": "https://...",
  "tags": [
    {"name": "cute", "display_name": "Cute", "category": "content"},
    {"name": "cat", "display_name": "Cat", "category": "content"}
  ]
}
```

#### `GET /api/images?limit=20&offset=0`
List images with pagination

#### `GET /api/stats`
Get database statistics
```json
{
  "total_images": 187,
  "total_tags": 0,
  "credited_artists": 0
}
```

#### `GET /images.json`
Dynamically generated list of all active images (cached in KV)

### Admin API

#### `GET /admin`
Admin dashboard UI with image management interface

#### `POST /api/admin/upload`
Upload new image to R2 with automatic database insertion

#### `POST /api/admin/sync`
Sync D1 database to KV cache for performance optimization

#### `GET /api/admin/images`
Admin-only image listing with management capabilities

## Local Development

### Prerequisites
- Node.js 16+
- Wrangler CLI (`npm install -g wrangler`)
- Cloudflare account with D1 enabled

### Setup
```bash
# Clone repository
git clone https://github.com/araragi-lacking-branding/poptocute-images.git
cd poptocute-images

# Login to Cloudflare
wrangler login

# Run locally
npx wrangler dev
```

### Database Commands

**Query database**:
```bash
npx wrangler d1 execute cutetopop-db --remote --command "SELECT COUNT(*) FROM images"
```

**View images**:
```bash
npx wrangler d1 execute cutetopop-db --remote --command "SELECT id, filename, status FROM images LIMIT 10"
```

**Add a tag** (example):
```bash
npx wrangler d1 execute cutetopop-db --remote --command "INSERT INTO tags (name, display_name, category_id) VALUES ('cute', 'Cute', 1)"
```

## Deployment

Automatic via Cloudflare Pages:
1. Push to `main` branch
2. Cloudflare builds and deploys automatically
3. Changes live in ~2 minutes

## File Structure

```
poptocute-images/
├── public/
│   ├── images/          # 187 image files (backup, served from R2)
│   └── favicon.ico
├── src/
│   ├── index.js         # Main Worker (routing, API, image serving)
│   └── admin/
│       ├── routes.js    # Admin API endpoints
│       ├── ui.js        # Admin dashboard UI
│       ├── upload.js    # R2 upload handling
│       └── sync.js      # KV sync functionality
├── scripts/
│   ├── sync-kv.js       # Active: D1 to KV sync utility
│   └── archive/
│       ├── migration/   # Historical migration scripts
│       │   ├── migrate-images.js
│       │   ├── migrate-to-r2.js
│       │   └── upload-to-r2-remote.js
│       └── verification/ # Post-migration audit scripts
│           ├── audit-r2.js
│           ├── check-db-vs-r2.js
│           ├── test-upload.js
│           ├── verify-only.js
│           └── verify-r2.js
├── schema.sql           # D1 database schema
├── wrangler.toml        # Worker config (D1, R2, KV bindings)
├── package.json
└── README.md
```

## Adding New Images

### Via Admin UI (Recommended)
1. Navigate to `/admin` on your deployed site
2. Use the upload interface to add images
3. Images are automatically uploaded to R2 and added to D1 database

### Via Script (Bulk Operations)
1. Add image files to `public/images/` (for backup)
2. Use archived migration scripts in `scripts/archive/migration/` if needed
3. Sync KV cache: `node scripts/sync-kv.js`
4. Commit and push to GitHub

**Note:** The migration to R2 is complete. New images should primarily be added via the admin UI.

## Maintenance Tasks

### Add new tag category
```sql
INSERT INTO tag_categories (name, display_name, description, sort_order) 
VALUES ('style', 'Art Style', 'Visual style and technique', 5);
```

### Tag an image
```sql
-- First, create tag if needed
INSERT INTO tags (name, display_name, category_id) 
VALUES ('kawaii', 'Kawaii', 1);

-- Then link to image
INSERT INTO image_tags (image_id, tag_id) 
VALUES (1, 1);
```

### Update image credit
```sql
-- Create credit if needed
INSERT INTO credits (name, url, platform, verified) 
VALUES ('Artist Name', 'https://...', 'twitter', 1);

-- Update image
UPDATE images SET credit_id = 2 WHERE id = 1;
```

## Troubleshooting

### Images not displaying
- Check database: `SELECT COUNT(*) FROM images WHERE status='active'`
- Verify images exist in R2 bucket (Cloudflare Dashboard → R2)
- Check KV cache: Sync using `/api/admin/sync` or `node scripts/sync-kv.js`
- Check browser console for errors
- Verify R2 binding in `wrangler.toml`

### Database connection issues
- Verify `wrangler.toml` has correct database_id
- Run `wrangler login` to refresh authentication
- Check Cloudflare dashboard for D1 database status

### KV cache out of sync
- Use admin panel: Navigate to `/admin` and click "Sync KV Cache"
- Or run: `node scripts/sync-kv.js`
- Verify KV namespace binding in `wrangler.toml`

### Build fails
- Check observability logs in Cloudflare dashboard
- Verify wrangler.toml syntax
- Ensure all bindings are configured (D1, R2, KV)
- Check that R2 bucket exists and is accessible

## Contributing

Currently admin-only. Public contribution system planned for Phase 4.

## License

Images may have various licenses. Working on proper attribution system.

## Performance

- **R2 Storage**: Images served from Cloudflare's edge network
- **KV Caching**: Image list cached globally for <50ms load times
- **WebP Optimization**: Automatic format conversion via Cloudflare Image Resizing
- **CDN**: Full Cloudflare CDN integration with aggressive caching

## Links

- **Live Site**: https://cutetopop.com
- **GitHub**: https://github.com/araragi-lacking-branding/poptocute-images
- **Cloudflare Dashboard**: https://dash.cloudflare.com

## Project History

- **Initial build**: Static site with local images
- **Phase 1**: Migration to Cloudflare Workers + D1 database
- **Phase 2**: R2 migration for image storage, KV caching implementation
- **Phase 3**: Admin panel development, upload functionality
- **Recent**: WebP optimization, repository cleanup (archived obsolete migration scripts)

All development tracked in git history. Migration scripts preserved in `scripts/archive/` for reference.

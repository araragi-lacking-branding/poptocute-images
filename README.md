# *cute* and *pop*

A random image display site with metadata management, tagging, and attribution system powered by Cloudflare Workers and D1.

## Architecture

- **Images**: Stored in GitHub (`public/images/`)
- **Metadata**: Cloudflare D1 database (tags, credits, status)
- **Worker**: Cloudflare Workers (API + HTML serving)
- **Deployment**: Cloudflare Pages (GitHub integration)

## Current Status

✅ **Phase 1: Complete**
- 187 images in database
- Random image display working
- D1 database with full schema
- Worker serving from database

🚧 **Phase 2: In Progress** (Next: ~150 images)
- Tag system ready (4 categories: content, character, creator, source)
- Credit attribution system in place
- Ready for metadata curation

📋 **Phase 3: Planned** (~300 images)
- Admin UI for tagging and crediting
- Bulk metadata operations
- Tag management interface

🌐 **Phase 4: Future** (Long-term)
- Public submission system
- User feedback and contributions
- Moderation workflow

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

### `GET /api/random`
Get a random active image with metadata
```json
{
  "id": 1,
  "filename": "images/IMG_1234.jpg",
  "alt_text": "Cute cat",
  "credit_name": "Artist Name",
  "credit_url": "https://...",
  "tags": [
    {"name": "cute", "display_name": "Cute", "category": "content"},
    {"name": "cat", "display_name": "Cat", "category": "content"}
  ]
}
```

### `GET /api/images?limit=20&offset=0`
List images with pagination

### `GET /api/stats`
Get database statistics
```json
{
  "total_images": 187,
  "total_tags": 0,
  "credited_artists": 0
}
```

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
│   ├── images/          # 187 image files
│   ├── index.html       # (Legacy, not used)
│   └── favicon.ico
├── src/
│   └── index.js         # Worker code (D1-powered)
├── scripts/
│   └── migrate-images.js # Database migration
├── schema.sql           # Database schema
├── wrangler.toml        # Worker configuration
├── package.json
└── README.md
```

## Adding New Images

1. Add image files to `public/images/`
2. Run migration script:
   ```bash
   node scripts/migrate-images.js
   ```
3. Commit and push to GitHub

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
- Verify image files exist in `public/images/`
- Check browser console for errors

### Database connection issues
- Verify `wrangler.toml` has correct database_id
- Run `wrangler login` to refresh authentication
- Check Cloudflare dashboard for database status

### Build fails
- Check observability logs in Cloudflare dashboard
- Verify wrangler.toml syntax
- Ensure D1 binding is configured

## Contributing

Currently admin-only. Public contribution system planned for Phase 4.

## License

Images may have various licenses. Working on proper attribution system.

## Links

- **Live Site**: [Your Cloudflare Pages URL]
- **GitHub**: https://github.com/araragi-lacking-branding/poptocute-images
- **Cloudflare Dashboard**: https://dash.cloudflare.com
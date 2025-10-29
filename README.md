# Hands-off AI Building of an Application as Ethics, Compliance, and Security Exploration
**it's all pretty sily, so bear with me. You'll see where the robot starts talking.**

The "simple" goal of this project is to build a site reminiscent of 2000s internet - niche, singular if broad focus, and minimal visual clutter.
Like many of the folks I grew up with then, it'll be strung together with spaghetti code and other people's work, based on suggestions from large groups of people on the internet.
The main difference is it'll be explored by telling a large language model to build and review things without much oversight.
Mostly this is to learn through doing (in a very, very specific sense) while creating a personal critique. Specifically, beyond the tech side, it was terribly easy to get a free tool running using other people's work.
So that's all this is - can I build something almost solely with AI that provides its own critique and measures for both technical and artistic integrity.

# *Why?*
I'm a compliance and risk person in the healthcare space. A large part of me has been terrified to see AI entering those spaces with minimal client review on major service providers.
I'm not a developer. I'm not an engineer in any way. As said, tech and compliance has been the majority of my career, though predominantly in front facing technical work and analysis.
Almost none of this project will consist of personal original code and will be put up with minimal dedicated review. It could be great. It could burn horribly. I'd like to see what happens.
I'm not attempting to be maliciously critcal of the technology being used here - I, honestly, thank it's amazing work. It's just very easy to be misued and misunderstood, and I'd like to learn and demonstrate more on that.
However, I do intend this to be a critique, in the formal sense. Taking a hypothesis on a topic, researching it, testing it, and comparing against other models, works, and theoretics to build a better understanding.

# *art & attribution ethics*
- We are currently using a small batch of images with a silly watermark to test. The goal is to delete and replace with attributed works as soon as possible.
- Specifically: an attribution system does exist on the backend - to be moved to front - to allow proper crediting and display. A proper "remove" button should be coming as well to automate takedowns.
- *if you would like an image taken down, email the project at lambda@cutetopop.com*. you don't have to be the owner, provide any proof, or anything else. Just send the filename (most should be the hash of the file) and it will be gone as soon as possible.
- the only exception to the above would be for volunteered art to the project (unless revoked by the artist, obviously), licensed stock images, or similar. Even then, any good faith message would be taken incredibly serious, and I'd like to remove the work if any claim of ownership or attribution was in quest.

# funding, cost, and use disclosures / ethics
- There is absolutely no outside money coming into this project. There are no ads or monetization. There is absolutely no plan to add anything like that. Minimizing tracking is also crucial.
- Observability via Cloudflare is turned on. We may explore site tags, SEO, and such in the future, but that's not a goal now, and should never be used for monetization on this site.
- If that changes, it will be disclosed immediately. It is against the ethos of the project however, and the site concept is purposefully pretty meaningless in the modern internet to avoid abuse.
- If you see a change or anything not aligning to the above, please let me know - lambda@cutetopop.com. Given the nature of the build concept, it is very possible for items to be injected or added unknowingly by the model.
- Costs should be minimal (currently only the domain registration), primarily using Cloudflare and GitHub for all services. I'll update services as they change, but everything currently is running off of Cloudflare D1 / R2 / KV / Workers and right here.
- For AI usage, Claude from Anthropic is currently in use. Prior to GitHub, I coded the original image services as a local test, then asked ChatGPT to rebuild it entirely. Then it went up here. I don't see much of my code there, so let's say it's all AI at this point besides a couple manual fixes.
- The email for the site is hosted via Proton, though this was not specific to this project. 

# if you'd like to contribute, question, or request anything, please email the site at lambda@cutetopop.com . 



# *And now, here's what the LLM says we're doing:*

# *cute* and *pop*

A random image display site with metadata management, tagging, and attribution system powered by Cloudflare Workers, D1, R2, and tied to the repo.

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

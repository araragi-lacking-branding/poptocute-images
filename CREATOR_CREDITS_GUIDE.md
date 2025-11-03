# Creator Credits System - Complete Guide

## Overview

The creator credits system allows the front page to display proper artist attribution by linking images to artist profiles through creator tags. This guide explains how the system works and how to use it.

## How It Works

### Data Flow

```
Image → Creator Tag → Artist Profile → Front Page Display
   ↓         ↓              ↓
   └─────→ Credit ──────────┘
```

### The Three Ways Credits Are Determined

Credits are displayed on the front page using a **fallback cascade**:

1. **Direct Credit Link** (Primary)
   - Image has `credit_id` set
   - Credit has `artist_id` set
   - Artist profile data is used for display

2. **Creator Tag Derivation** (Fallback)
   - Image has a creator tag assigned
   - Creator tag is linked to an artist via `artist_tags` table
   - Artist profile data is automatically pulled

3. **Generic Credit** (Last Resort)
   - Only `credit_id` is set, no artist link
   - Or no creator information at all
   - Shows "Unknown Artist" with attribution request link

## Database Schema

### Key Tables

```sql
-- Artist profiles
artists (id, name, display_name, bio, website_url, twitter_handle, ...)

-- Credit records (license, source URL)
credits (id, name, url, license, artist_id, ...)

-- Tags including creator tags
tags (id, name, display_name, category_id, ...)

-- Links creator tags to artist profiles
artist_tags (artist_id, tag_id)

-- Assigns tags to images
image_tags (image_id, tag_id)

-- Images reference credits
images (id, filename, credit_id, ...)
```

### Relationships

```
images.credit_id → credits.id
credits.artist_id → artists.id
image_tags.tag_id → tags.id (where tags.category = 'creator')
artist_tags.tag_id → tags.id
artist_tags.artist_id → artists.id
```

## Setup Workflow

### 1. Create Artist Profiles

Use the admin UI or API to create artist profiles:

```javascript
POST /api/admin/artists
{
  "name": "studio-gainax",
  "display_name": "Studio Gainax",
  "bio": "Japanese anime studio...",
  "website_url": "https://gainax.co.jp",
  "twitter_handle": "gainax_west",
  "verified": true,
  "featured": true
}
```

### 2. Create Creator Tags

Creator tags should match artist names (use lowercase with hyphens):

```sql
INSERT INTO tags (name, display_name, category_id)
VALUES ('studio-gainax', 'Studio Gainax', 
  (SELECT id FROM tag_categories WHERE name = 'creator'));
```

### 3. Link Creator Tags to Artists

Use the admin API to link tags to artists:

```javascript
POST /api/admin/artists/:artistId/tags
{
  "tag_id": 3  // The creator tag ID
}
```

Or directly in SQL:

```sql
INSERT INTO artist_tags (artist_id, tag_id)
VALUES (2, 3);  -- Links Studio Gainax artist to studio-gainax tag
```

### 4. Assign Creator Tags to Images

Use the admin UI to tag images with creator tags. The system will automatically derive credits from these tags.

### 5. Run Credit Sync (Optional)

To create/update credit records based on current artist profiles:

```bash
node scripts/migration/sync-credits-from-creator-tags.js
```

This script:
- Creates credit records for artists that don't have them
- Links images to credits based on their creator tags
- Ensures the credit chain is complete

## Front Page Display Logic

The front page JavaScript (in `src/index.js`) uses this priority:

```javascript
// 1. Prefer artist profile data
const displayName = data.artist_display_name || data.artist_name || data.credit_name;
const artistUrl = data.artist_website || data.credit_url;

// 2. Social links priority
if (data.artist_twitter) {
  // Show Twitter link
} else if (data.credit_social_handle) {
  // Fallback to credit social
}
```

## API Behavior

### GET /api/random

The API automatically derives artist information from creator tags:

```javascript
// Main query joins: images → credits → artists
SELECT ... FROM images i
LEFT JOIN credits c ON i.credit_id = c.id
LEFT JOIN artists a ON c.artist_id = a.id

// Fallback: if no artist from credits, check creator tags
if (!result.artist_id) {
  SELECT ... FROM image_tags it
  JOIN tags t ON it.tag_id = t.id
  JOIN artist_tags at ON t.id = at.tag_id
  JOIN artists a ON at.artist_id = a.id
  WHERE it.image_id = ? AND tc.name = 'creator'
}
```

This ensures credits display correctly even if:
- `credit_id` is NULL
- `credit.artist_id` is NULL
- Only creator tags are assigned

## Admin Workflows

### Adding a New Artist

1. Create artist profile in admin UI
2. Create matching creator tag (if doesn't exist)
3. Link creator tag to artist
4. Tag relevant images with creator tag
5. Credits appear automatically on front page

### Updating Artist Information

1. Edit artist profile in admin UI
2. Changes appear immediately on front page
3. No need to touch individual images

### Bulk Credit Assignment

```bash
# Run the sync script after bulk tagging
node scripts/migration/sync-credits-from-creator-tags.js

# This updates all image credit links based on current creator tags
```

## Migration Scripts

### scripts/migration/link-credits-to-artists.sql

Links existing credits to artist profiles by name matching.

```bash
wrangler d1 execute DB --local --file=scripts/migration/link-credits-to-artists.sql
```

### scripts/migration/sync-credits-from-creator-tags.js

Complete credit sync based on creator tags.

```bash
node scripts/migration/sync-credits-from-creator-tags.js        # Local
node scripts/migration/sync-credits-from-creator-tags.js --remote  # Production
```

## Troubleshooting

### Credits Not Showing on Front Page

**Check 1: Does the image have a creator tag?**
```sql
SELECT t.name, t.display_name
FROM image_tags it
JOIN tags t ON it.tag_id = t.id
JOIN tag_categories tc ON t.category_id = tc.id
WHERE it.image_id = ? AND tc.name = 'creator';
```

**Check 2: Is the creator tag linked to an artist?**
```sql
SELECT a.name, a.display_name
FROM artist_tags at
JOIN artists a ON at.artist_id = a.id
WHERE at.tag_id = ?;
```

**Check 3: Is the artist active?**
```sql
SELECT * FROM artists WHERE id = ? AND status = 'active';
```

**Check 4: Run the API query manually**
```bash
# Test the random endpoint
curl http://localhost:8787/api/random | jq '.artist_name, .credit_name'
```

### Creator Tag Not Linking to Artist

```sql
-- Check if artist_tags record exists
SELECT * FROM artist_tags WHERE artist_id = ? AND tag_id = ?;

-- Check if tag is actually a creator tag
SELECT t.*, tc.name as category
FROM tags t
JOIN tag_categories tc ON t.category_id = tc.id
WHERE t.id = ?;
```

### Credits Show But No Social Links

The front page prefers artist profile data:

```sql
-- Check artist social fields
SELECT twitter_handle, website_url, instagram_handle
FROM artists WHERE id = ?;

-- Fallback to credit fields
SELECT social_handle, platform, url
FROM credits WHERE id = ?;
```

## Best Practices

1. **Use creator tags as primary method** - They're more flexible than direct credit links
2. **Keep artist names and tag names consistent** - Use lowercase-with-hyphens format
3. **Fill out artist profiles completely** - More data = better attribution
4. **Run sync script after bulk changes** - Ensures credit table stays in sync
5. **Verify after changes** - Check front page to confirm credits display correctly

## Future Enhancements

- [ ] Auto-create artist profiles from creator tags
- [ ] Suggest artist profiles when assigning creator tags
- [ ] Validate creator tag → artist links in admin UI
- [ ] Batch tag assignment by artist
- [ ] Artist profile import from external sources

## Related Documentation

- [ARTIST_PROFILES.md](./ARTIST_PROFILES.md) - Artist profile API reference
- [API_SCHEMA_README.md](./API_SCHEMA_README.md) - Full API documentation
- [schema.sql](./schema.sql) - Database schema

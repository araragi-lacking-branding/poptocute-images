# Artist Profiles Feature

## Overview
This feature adds comprehensive artist profile management to the poptocute-images platform, allowing proper attribution and 
showcasing of creators.                                                                                                     
## Database Schema

### New Tables

#### `artists`
Stores artist profile information.

| Column | Type | Description |
|--------|------|-------------|
| id | INTEGER | Primary key |
| name | TEXT | Unique artist name (required) |
| display_name | TEXT | Display name (optional, falls back to name) |
| bio | TEXT | Artist biography/description |
| avatar_url | TEXT | URL to artist's avatar image |
| website_url | TEXT | Artist's personal website |
| twitter_handle | TEXT | Twitter username (without @) |
| instagram_handle | TEXT | Instagram username (without @) |
| pixiv_id | TEXT | Pixiv user ID |
| deviantart_username | TEXT | DeviantArt username |
| other_links | TEXT | JSON array of additional links |
| verified | BOOLEAN | Whether the artist is verified |
| featured | BOOLEAN | Whether to feature the artist |
| created_at | TEXT | Creation timestamp |
| updated_at | TEXT | Last update timestamp |
| notes | TEXT | Internal admin notes |

#### `artist_tags`
Junction table linking artists to creator tags.

| Column | Type | Description |
|--------|------|-------------|
| artist_id | INTEGER | Foreign key to artists |
| tag_id | INTEGER | Foreign key to tags (must be creator category) |
| created_at | TEXT | Creation timestamp |

### Modified Tables

#### `credits`
Added `artist_id` column to link credits to artist profiles.

## API Endpoints

### Public API

#### GET `/api/artists`
Get list of artists (public).

**Query Parameters:**
- `featured` (optional): Filter by featured status (`true`/`false`)
- `limit` (optional): Number of results (default: 50, max: 100)
- `offset` (optional): Pagination offset (default: 0)

**Response:**
```json
{
  "artists": [
    {
      "id": 1,
      "name": "artist_name",
      "display_name": "Artist Display Name",
      "bio": "Artist bio...",
      "avatar_url": "https://...",
      "website_url": "https://...",
      "twitter_handle": "username",
      "instagram_handle": "username",
      "pixiv_id": "12345",
      "deviantart_username": "username",
      "verified": true,
      "featured": true,
      "images_count": 42
    }
  ],
  "count": 10,
  "limit": 50,
  "offset": 0
}
```

#### GET `/api/artists/:id`
Get detailed artist profile with sample images.

**Response:**
```json
{
  "id": 1,
  "name": "artist_name",
  "display_name": "Artist Display Name",
  "bio": "Artist bio...",
  "avatar_url": "https://...",
  "website_url": "https://...",
  "twitter_handle": "username",
  "instagram_handle": "username",
  "pixiv_id": "12345",
  "deviantart_username": "username",
  "verified": true,
  "featured": true,
  "credits_count": 5,
  "images_count": 42,
  "creator_tags": [
    {
      "id": 10,
      "name": "tag_name",
      "display_name": "Tag Display"
    }
  ],
  "sample_images": [
    {
      "id": 1,
      "filename": "images/example.png",
      "alt_text": "...",
      "width": 1920,
      "height": 1080
    }
  ]
}
```

### Admin API

#### GET `/api/admin/artists`
Get all artists with admin details.

**Query Parameters:**
- `featured` (optional): Filter by featured status
- `search` (optional): Search in name, display_name, or bio
- `limit` (optional): Number of results (default: 50)
- `offset` (optional): Pagination offset (default: 0)

**Response:**
```json
{
  "success": true,
  "artists": [...],
  "count": 10
}
```

#### GET `/api/admin/artists/:id`
Get single artist with full admin details.

**Response:**
```json
{
  "success": true,
  "artist": {
    "id": 1,
    "name": "artist_name",
    "display_name": "Artist Display Name",
    "bio": "...",
    "avatar_url": "...",
    "website_url": "...",
    "twitter_handle": "...",
    "instagram_handle": "...",
    "pixiv_id": "...",
    "deviantart_username": "...",
    "other_links": ["https://..."],
    "verified": true,
    "featured": true,
    "created_at": "...",
    "updated_at": "...",
    "notes": "...",
    "credits_count": 5,
    "images_count": 42,
    "creator_tags": ["tag1", "tag2"]
  }
}
```

#### POST `/api/admin/artists`
Create new artist profile.

**Request Body:**
```json
{
  "name": "artist_name",
  "display_name": "Artist Display Name",
  "bio": "Artist biography...",
  "avatar_url": "https://...",
  "website_url": "https://...",
  "twitter_handle": "username",
  "instagram_handle": "username",
  "pixiv_id": "12345",
  "deviantart_username": "username",
  "other_links": ["https://link1.com", "https://link2.com"],
  "verified": false,
  "featured": false,
  "notes": "Internal notes..."
}
```

**Response:**
```json
{
  "success": true,
  "artist": {...},
  "message": "Artist created successfully"
}
```

#### PUT `/api/admin/artists/:id`
Update artist profile.

**Request Body:** (all fields optional)
```json
{
  "display_name": "New Display Name",
  "bio": "Updated bio...",
  "featured": true
}
```

**Response:**
```json
{
  "success": true,
  "artist": {...},
  "message": "Artist updated successfully"
}
```

#### DELETE `/api/admin/artists/:id`
Delete artist profile.

**Note:** Cannot delete artist with existing credits. Remove credits first.

**Response:**
```json
{
  "success": true,
  "message": "Artist deleted successfully"
}
```

#### GET `/api/admin/artists/:id/images`
Get all images by an artist.

**Query Parameters:**
- `limit` (optional): Number of results (default: 50)
- `offset` (optional): Pagination offset (default: 0)
- `status` (optional): Image status filter (default: 'active')

**Response:**
```json
{
  "success": true,
  "images": [...],
  "count": 42
}
```

#### POST `/api/admin/artists/:id/tags`
Link a creator tag to an artist.

**Request Body:**
```json
{
  "tag_id": 10
}
```

**Note:** Tag must be in the 'creator' category.

**Response:**
```json
{
  "success": true,
  "message": "Tag linked to artist successfully"
}
```

#### DELETE `/api/admin/artists/:artistId/tags/:tagId`
Unlink a tag from an artist.

**Response:**
```json
{
  "success": true,
  "message": "Tag unlinked from artist successfully"
}
```

## Usage Examples

### Creating an Artist Profile

```javascript
const response = await fetch('https://cutetopop.com/api/admin/artists', {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json'
  },
  body: JSON.stringify({
    name: 'example_artist',
    display_name: 'Example Artist',
    bio: 'A talented digital artist...',
    twitter_handle: 'exampleartist',
    verified: true,
    featured: true
  })
});

const data = await response.json();
console.log(data.artist);
```

### Linking Artist to Credit

```sql
-- Update existing credit to link to artist
UPDATE credits
SET artist_id = 1
WHERE id = 5;
```

### Linking Creator Tag to Artist

```javascript
const response = await fetch('https://cutetopop.com/api/admin/artists/1/tags', {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json'
  },
  body: JSON.stringify({
    tag_id: 10 // Must be a creator category tag
  })
});
```

## Migration Guide

### For Existing Databases

1. **Run the migration SQL:**
   ```bash
   wrangler d1 execute DB --file=./scripts/migration/add-artist-profiles.sql
   ```

2. **Create artist profiles for existing credits:**
   ```sql
   -- Example: Create artist from credit
   INSERT INTO artists (name, display_name, website_url, verified)
   SELECT name, name, url, verified
   FROM credits
   WHERE id = ?;

   -- Link credit to new artist
   UPDATE credits
   SET artist_id = (SELECT id FROM artists WHERE name = ?)
   WHERE id = ?;
   ```

3. **Link creator tags to artists:**
   ```sql
   -- Link artist to their creator tag
   INSERT INTO artist_tags (artist_id, tag_id)
   VALUES (?, ?);
   ```

## Views

### `v_images_active`
Updated to include artist information:
- `artist_id`
- `artist_name`
- `artist_display_name`
- `artist_avatar`

### `v_artist_profiles`
New view providing artist statistics:
- All artist profile fields
- `credits_count` - Number of credits linked to artist
- `images_count` - Number of active images by artist
- Sorted by featured status, image count, then name

## Best Practices

1. **Artist Names:** Use lowercase, underscore-separated names (e.g., `john_doe`)
2. **Display Names:** Use proper capitalization for display (e.g., `John Doe`)
3. **Verification:** Only mark artists as verified if identity is confirmed
4. **Featured:** Use sparingly for prominent artists
5. **Bio:** Keep concise but informative
6. **Social Handles:** Store without @ symbol
7. **Other Links:** Use JSON array for flexibility

## Future Enhancements

- [ ] Artist submission/claim system
- [ ] Artist dashboard for self-management
- [ ] Automated artist detection from image metadata
- [ ] Artist collaboration tracking
- [ ] Artist statistics and analytics
- [ ] Artist search and filtering improvements
- [ ] Integration with external artist databases
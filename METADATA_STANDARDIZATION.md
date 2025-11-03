# Image Metadata Standardization Plan
**Date:** November 3, 2025  
**Status:** Planning Phase

## Current State Analysis (Production)

### Database Audit Results
```
Total images: 246
Images with width/height: 4 (1.6%)
Images with file_hash: 246 (100%)
Images with mime_type: ~246 (assumed)
Images with file_size: ~246 (assumed)
```

### Current Schema (18 fields)
```sql
id                INTEGER PRIMARY KEY
filename          TEXT NOT NULL UNIQUE
alt_text          TEXT
original_filename TEXT
file_size         INTEGER
width             INTEGER  -- ⚠️ Missing on 98% of images
height            INTEGER  -- ⚠️ Missing on 98% of images
mime_type         TEXT
file_hash         TEXT     -- ✅ Complete
status            TEXT DEFAULT 'active'
credit_id         INTEGER (FK to credits)
created_at        TEXT
updated_at        TEXT
notes             TEXT
title             TEXT
source            TEXT
license           TEXT
permissions       TEXT
```

---

## MediaInfo Standard Fields

### Essential Technical Metadata
Based on MediaInfo standard for image files:

#### ✅ **Already Captured**
- `file_size` - Size in bytes
- `mime_type` - MIME type (image/jpeg, image/png, etc.)
- `file_hash` - SHA-256 hash for deduplication

#### ⚠️ **Partially Captured** (needs backfill)
- `width` - Image width in pixels
- `height` - Image height in pixels

#### ❌ **Missing - Should Add**
- `format` - File format (JPEG, PNG, GIF, WebP, AVIF)
- `color_space` - Color space (RGB, sRGB, CMYK, etc.)
- `bit_depth` - Bits per channel (8, 16, 24, 32)
- `has_alpha` - Boolean: Has transparency channel
- `is_animated` - Boolean: Animated (for GIFs, APNGs)
- `frame_count` - Number of frames (for animated images)
- `duration` - Duration in ms (for animated images)
- `orientation` - EXIF orientation (1-8)
- `dpi_x` / `dpi_y` - Resolution in DPI

#### 🤔 **Nice to Have**
- `icc_profile` - ICC color profile name
- `compression` - Compression method
- `encoding_date` - When file was created/encoded
- `exif_data` - JSON blob of EXIF metadata
- `aspect_ratio` - Calculated: width/height

---

## Custom Metadata Fields

### ✅ **Already Have**
- `alt_text` - Accessibility description
- `title` - Display title
- `source` - Source URL or reference
- `license` - License type
- `permissions` - Usage permissions
- `notes` - Internal notes
- `original_filename` - User's original filename
- `status` - active/hidden/pending/deleted
- `credit_id` - Link to artist/creator

### 🎯 **Additional Custom Fields to Consider**
- `description` - Longer description (vs alt_text)
- `date_taken` - When photo was taken (from EXIF)
- `location` - Geographic location (from EXIF GPS)
- `rating` - Internal quality rating (1-5)
- `view_count` - Popularity metric
- `featured` - Boolean: Featured image
- `nsfw_level` - Content rating (safe/questionable/explicit)
- `dominant_colors` - JSON array of hex colors
- `blurhash` - BlurHash for placeholders

---

## Proposed Schema Changes

### Phase 1: Essential Technical Metadata (Immediate)
Add these fields to capture standard technical info:

```sql
-- New columns to add
ALTER TABLE images ADD COLUMN format TEXT;           -- JPEG, PNG, GIF, WebP, AVIF
ALTER TABLE images ADD COLUMN color_space TEXT;      -- RGB, sRGB, etc.
ALTER TABLE images ADD COLUMN bit_depth INTEGER;     -- 8, 16, 24, 32
ALTER TABLE images ADD COLUMN has_alpha BOOLEAN DEFAULT 0;
ALTER TABLE images ADD COLUMN is_animated BOOLEAN DEFAULT 0;
ALTER TABLE images ADD COLUMN frame_count INTEGER;   -- For GIFs
ALTER TABLE images ADD COLUMN orientation INTEGER DEFAULT 1;  -- EXIF orientation
```

### Phase 2: Enhanced Metadata (Future)
```sql
ALTER TABLE images ADD COLUMN aspect_ratio REAL;     -- width/height
ALTER TABLE images ADD COLUMN dpi_x INTEGER;
ALTER TABLE images ADD COLUMN dpi_y INTEGER;
ALTER TABLE images ADD COLUMN exif_data TEXT;        -- JSON blob
ALTER TABLE images ADD COLUMN dominant_colors TEXT;  -- JSON array
ALTER TABLE images ADD COLUMN blurhash TEXT;         -- For lazy loading
```

---

## Implementation Strategy

### Step 1: Fix Dimension Extraction Bug
**Current Issue:** `upload.js` has dimension extraction but it's not working for most images.

**Action:**
- Review `getImageDimensionsSync()` function
- Test against various image formats
- Add fallback methods (maybe use Cloudflare Image Resizing API info)

### Step 2: Enhance Metadata Extraction
**Goal:** Extract comprehensive metadata on upload

**Changes to `upload.js`:**
```javascript
// Current: Basic dimensions only
const dimensions = getImageDimensionsSync(buffer);

// Enhanced: Full metadata extraction
const metadata = extractImageMetadata(buffer, file.type);
// Returns: { width, height, format, colorSpace, bitDepth, hasAlpha, 
//            isAnimated, frameCount, orientation, ... }
```

### Step 3: Create Backfill Script
**Goal:** Populate metadata for existing 246 images

**Approach:**
1. Fetch all images from R2
2. Extract metadata from binary data
3. Update D1 records in batches
4. Log successes/failures

**Script:** `scripts/backfill-image-metadata.js`

### Step 4: API Integration
**Goal:** Return complete metadata in API responses

Update `/api/random` and `/api/images` to include:
- All technical metadata
- Responsive image URLs with proper dimensions
- Aspect ratio for layout calculations

---

## Metadata Extraction Methods

### Browser-based (Current - Limited)
```javascript
// Simple header parsing - works for PNG, JPEG, GIF
function getImageDimensionsSync(buffer) {
  // Parse file headers
  // Limited format support
  // No color space, bit depth, etc.
}
```

### Enhanced (Proposal)
```javascript
// Use multiple detection methods
function extractImageMetadata(buffer, mimeType) {
  const metadata = {
    width: null,
    height: null,
    format: getFormatFromMime(mimeType),
    colorSpace: null,
    bitDepth: null,
    hasAlpha: false,
    isAnimated: false,
    frameCount: 1,
    orientation: 1
  };
  
  // Format-specific parsers
  if (mimeType === 'image/png') {
    return parsePNG(buffer, metadata);
  } else if (mimeType === 'image/jpeg') {
    return parseJPEG(buffer, metadata);
  } else if (mimeType === 'image/gif') {
    return parseGIF(buffer, metadata);
  } else if (mimeType === 'image/webp') {
    return parseWebP(buffer, metadata);
  }
  
  return metadata;
}
```

### Alternative: Cloudflare Image Resizing API
If we can't reliably extract metadata, use Cloudflare's API:
```javascript
// Upload to R2 first
await env.IMAGES.put(filename, buffer);

// Get metadata from Cloudflare
const response = await fetch(`https://cutetopop.com/${filename}`, {
  cf: { image: { metadata: 'json' } }
});
const cfMetadata = await response.json();
// Returns: width, height, format, etc.
```

---

## Testing Plan

### Test Cases
1. **PNG** - Standard RGB, with alpha, various bit depths
2. **JPEG** - With EXIF, different orientations
3. **GIF** - Static and animated
4. **WebP** - Static and animated, lossy and lossless
5. **AVIF** - New format support

### Validation
- Upload test images
- Verify metadata captured correctly
- Check API response includes all fields
- Test backfill on sample of existing images

---

## Migration Timeline

### Week 1: Investigation & Setup
- [ ] Test current dimension extraction on all formats
- [ ] Research best metadata extraction libraries
- [ ] Design enhanced extraction functions
- [ ] Create migration file for new columns

### Week 2: Implementation
- [ ] Implement enhanced metadata extraction
- [ ] Update upload.js
- [ ] Test with various image formats
- [ ] Update API responses

### Week 3: Backfill
- [ ] Create backfill script
- [ ] Test on sample (10-20 images)
- [ ] Run full backfill on production
- [ ] Validate completeness

### Week 4: Optimization
- [ ] Add indexes on new columns if needed
- [ ] Update documentation
- [ ] Monitor performance impact
- [ ] Plan Phase 2 enhancements

---

## Success Metrics

### Immediate Goals
- ✅ 100% of images have width/height
- ✅ 100% of images have format
- ✅ 95%+ of images have color_space
- ✅ Animated GIFs identified correctly

### Quality Metrics
- Upload process completes in <2 seconds
- Metadata extraction adds <100ms overhead
- Zero upload failures due to metadata extraction
- API response time unchanged (<250ms)

---

## Questions to Resolve

1. **Do we need EXIF data?** (camera info, GPS, etc.)
   - Pro: Useful for photography sites
   - Con: Privacy concerns, large JSON blobs
   
2. **Should we extract dominant colors?**
   - Pro: Can generate color-based search/filters
   - Con: CPU intensive, may need separate worker
   
3. **BlurHash for lazy loading?**
   - Pro: Better UX with progressive loading
   - Con: Additional computation on upload
   
4. **Cloudflare API vs custom extraction?**
   - Cloudflare: Reliable, limited fields, network call
   - Custom: Complete control, more complex, browser-only

---

## Next Actions

1. ✅ Run production audit (completed)
2. [ ] Test current extraction on various formats
3. [ ] Create migration file with essential fields
4. [ ] Implement enhanced extraction
5. [ ] Create and test backfill script

# Database Optimization Analysis
**Date:** November 3, 2025  
**Current State Analysis**

## Current Architecture

### Storage Systems in Use

#### 1. **D1 Database (SQLite)** - Relational metadata
- **Tables:** 10 tables
  - `images` (6 records)
  - `tags` (20 records)
  - `tag_categories`
  - `credits`
  - `artists`
  - `artist_tags`
  - `image_tags`
  - `feedback`
- **Purpose:** Structured metadata, relationships, and queryable data
- **Access Pattern:** Complex queries with JOINs across multiple tables

#### 2. **KV Namespace** (`IMAGES_CACHE`)
- **Keys Stored:**
  - `images-list` - Array of active image filenames (TTL: 24h)
  - `active-count` - Count for random selection (TTL: 1h)
  - `last-sync` - Sync timestamp (TTL: 24h)
- **Purpose:** Fast read cache for frequently accessed data
- **Access Pattern:** Simple key-value lookups

#### 3. **R2 Bucket** (`IMAGES`)
- **Content:** Actual image files (binary data)
- **Path Structure:** `images/{hash}.{ext}`
- **Purpose:** Object storage for large files
- **Access Pattern:** Direct file retrieval by key

---

## Usage Analysis

### How Data Flows

#### 1. **Image Upload Flow**
```
Upload → R2 (binary) → D1 (metadata) → Sync to KV (cache)
```
- File stored in R2 with content hash
- Metadata in D1: filename, dimensions, hash, credit_id, status
- KV cache updated with new image list

#### 2. **Random Image API Flow**
```
Request → KV (get count) → D1 (query with OFFSET) → Response
                ↓
         (if cache miss: sync from D1)
```
- Uses KV cached count for O(1) random offset
- Single D1 query with complex JOINs (images + credits + artists + tags)
- Returns full metadata + tag array + creator array

#### 3. **Image Serving Flow**
```
Request → R2 (get file) → Cloudflare Image Resizing → Response
```
- Direct R2 fetch by filename
- Cloudflare CDN handles transformations
- No D1 query needed

---

## Current Data in D1

### What's Actually Stored

Based on schema analysis, D1 stores:

1. **Image Core Metadata**
   - `filename`, `original_filename`, `file_hash`
   - `file_size`, `width`, `height`, `mime_type`
   - `status` (active/hidden/pending/deleted)
   - `alt_text`, `notes`
   - `created_at`, `updated_at`

2. **Relationships**
   - `credit_id` → links to `credits` table
   - Via `image_tags` → links to multiple tags
   - Via credits → links to `artists`

3. **Tag System**
   - Tag categories (content, character, creator, source)
   - Individual tags with display names
   - Many-to-many relationships via `image_tags`

4. **Artist Profiles**
   - Comprehensive social media links
   - Bio, avatar, verification status
   - Linked via `credits` table

5. **User Feedback**
   - Pending tag suggestions
   - Credit corrections
   - Reports

---

## Performance Characteristics

### Current Query Patterns

#### Most Frequent Query (Random Image)
```sql
-- 3 separate queries per random image request:
1. SELECT filename FROM images WHERE status = 'active' -- (cached in KV)
2. Complex JOIN: images + credits + artists (main data)
3. SELECT tags WHERE image_id = ? -- (tag lookup)
4. SELECT creators via tags + artist_tags -- (creator lookup)
```

**Time:** ~220-250ms total
- KV lookup: <5ms
- Main query: ~150-180ms (5+ table JOINs, NOT IN subquery)
- Tag query: ~30-40ms
- Creator query: ~30-40ms

#### Admin Queries
- Image list with filters: Multiple JOINs
- Artist management: Moderate complexity
- Tag statistics: Aggregations across relations

---

## Optimization Opportunities

### 🔴 Critical Issues

1. **N+1 Query Pattern in Random Image**
   - Currently: 1 main query + 2 separate queries per image
   - Could be: Single query with JSON aggregation

2. **Complex NOT IN Subquery**
   ```sql
   WHERE i.id NOT IN (
     SELECT DISTINCT it.image_id FROM image_tags it
     JOIN tags t ON it.tag_id = t.id
     WHERE t.status IN ('hidden', 'deleted')
   )
   ```
   - Scans ALL image_tags for every request
   - Better: LEFT JOIN with WHERE NULL

3. **Missing Denormalization**
   - Tag lists rebuilt on every query
   - Creator info fetched separately
   - No cached aggregate data

### 🟡 Moderate Issues

4. **KV Cache Not Fully Utilized**
   - Only caching filename list
   - Could cache: full image metadata, popular queries
   - Could cache: tag statistics, artist lists

5. **Status Filtering Everywhere**
   - Every query filters status = 'active'
   - Considered: Separate active/archive tables?
   - Trade-off: Simpler queries vs migration complexity

6. **Metadata in D1 vs KV Decision**
   - D1 good for: Relations, complex queries, writes
   - KV good for: Fast reads, simple data, high traffic
   - Currently: Everything in D1, minimal KV cache

### 🟢 Minor Improvements

7. **Index Optimization**
   - Has good indexes on frequently queried columns
   - Could add: Composite indexes for common JOIN patterns
   - Could add: Covering indexes for SELECT-only queries

8. **View Usage**
   - Has views defined but **not used in code**
   - `v_images_active` could simplify many queries
   - `v_artist_profiles` already has aggregations

---

## Recommendations by Priority

### Phase 1: Query Optimization (No Schema Changes)
- [ ] Use JSON aggregation to eliminate N+1 queries
- [ ] Replace NOT IN with LEFT JOIN
- [ ] Utilize existing views in queries
- [ ] Add composite indexes for common JOIN patterns

**Impact:** Reduce query time from 250ms → 100-120ms

### Phase 2: KV Cache Expansion
- [ ] Cache full metadata for recently served images
- [ ] Cache tag statistics (updated on sync)
- [ ] Cache artist directory (updated on artist changes)
- [ ] Implement stale-while-revalidate pattern

**Impact:** Reduce cache miss queries by 60-80%

### Phase 3: Schema Optimization (Requires Migration)
- [ ] Add JSON column for denormalized tags
- [ ] Add JSON column for denormalized creators
- [ ] Update sync process to maintain denormalized data
- [ ] Keep relational data for admin/editing

**Impact:** Reduce query complexity, enable faster reads

### Phase 4: Advanced Caching
- [ ] Move hot metadata to KV entirely
- [ ] Use D1 as write store, KV as read store
- [ ] Implement proper cache invalidation
- [ ] Consider Cloudflare Cache API for edge caching

**Impact:** Sub-50ms responses for cached data

---

## What Should NOT Change

✅ **Keep in D1:**
- Relational data (images ↔ tags ↔ artists)
- Admin operations (CRUD)
- Complex filtering and search
- User feedback queue
- Any data requiring transactions

✅ **Keep in R2:**
- Original image files
- Binary data
- Large objects

✅ **Keep Current Architecture:**
- Cloudflare Image Resizing for transformations
- Scheduled sync jobs
- Status-based filtering
- Artist profile system

---

## Next Steps

1. **Create optimization branch**
2. **Start with Phase 1** (query optimization)
3. **Benchmark each change**
4. **Test thoroughly before merging**
5. **Document performance improvements**

---

## Wrangler Configuration Note

**Current Warning:**
```
▲ [WARNING] Processing wrangler.toml configuration:
  - Unexpected fields found in observability field: "persist"
```

**Issue:** The `persist` field is not valid in `[observability.logs]` and `[observability.traces]`

**Fix:** Remove `persist` lines from wrangler.toml (doesn't affect functionality, just a warning)

# Duplicate Prevention Implementation Summary

## Problem Statement

The system experienced duplicate Studio Gainax artist entries (IDs 2 and 3) despite having database UNIQUE constraints. Investigation revealed the duplicates had subtle differences in formatting:
- `studio_gainax` (underscore)
- `studio-gainax` (hyphen) 
- `studio - gainax` (spaces around hyphen)

These variations bypassed the case-sensitive UNIQUE constraint and weren't caught by existing validation logic.

## Root Causes

1. **Database constraint limitations**: SQLite's UNIQUE constraint is case-sensitive and doesn't normalize special characters
2. **No text normalization for comparison**: Names were compared literally without accounting for formatting variations
3. **Names stored directly**: Input was stored as-is without cleaning leading/trailing spaces

## Solution Implemented

### 1. Text Normalization for Duplicate Detection

Created `normalizeText()` function in `src/admin/artists.js` that:
- Trims leading/trailing whitespace
- Collapses multiple spaces to single space
- Converts underscores, en-dashes (–), and em-dashes (—) to hyphens
- Replaces smart quotes with straight quotes
- Removes spaces around hyphens ("studio - gainax" → "studio-gainax")
- Converts to lowercase for case-insensitive comparison

**Important**: Normalization is used **only for comparison**, not storage. This preserves intentional formatting like:
- `this_is_a_test` (stored with underscores)
- `hello-world` (stored with hyphens)

### 2. Updated Artist Creation (`createArtist`)

**Before**:
```javascript
const existing = await getArtistByName(env, name);
// Case-sensitive exact match only
```

**After**:
```javascript
const cleanedName = name.trim().replace(/\s+/g, ' ');
const existing = await getArtistByName(env, cleanedName);
// getArtistByName() uses normalizeText() for comparison
// Store cleanedName (preserves original formatting)
```

### 3. Updated Artist Lookup (`getArtistByName`)

**Before**:
```javascript
SELECT * FROM artists WHERE LOWER(name) = LOWER(?)
// Only lowercase comparison
```

**After**:
```javascript
SELECT * FROM artists
// Fetch all, compare using normalizeText()
const match = results.find(artist => 
  normalizeText(artist.name) === normalizeText(searchName)
);
```

### 4. Updated Artist Updates (`updateArtist`)

Added same normalization logic to prevent duplicates when renaming artists.

### 5. Tag Creation Normalization

Updated `createTag()` in `src/admin/routes.js` to:
- Normalize tag slugs (underscores → hyphens, collapse spaces, etc.)
- Use cleaned display names
- Auto-create artist profiles with normalized names

### 6. Database Schema Enhancement

Updated `schema.sql`:
```sql
name TEXT NOT NULL UNIQUE COLLATE NOCASE
```
Added `COLLATE NOCASE` for case-insensitive uniqueness in future databases.

## Test Coverage

### Unit Tests (`scripts/test-normalization-v2.js`)
- 20 normalization test cases
- 3 duplicate detection scenarios
- **Result**: 20/20 passed, 3/3 scenarios passed

### Integration Tests (`scripts/test-duplicate-prevention.js`)
Tests artist creation API with:
- Exact duplicates
- Case variations (Studio-Gainax vs studio-gainax)
- Whitespace variations (leading/trailing spaces)
- Special character variations (en-dash, em-dash)
- Underscore vs hyphen (`studio_gainax` vs `studio-gainax`)
- Intentional formatting preservation (`this_is_a_test` stored as-is, but `this-is-a-test` rejected as duplicate)

**Result**: 10/10 tests passed

## Examples of Duplicate Prevention

### Caught as Duplicates:
```
studio-gainax
Studio-Gainax
studio_gainax
studio–gainax (en-dash)
studio—gainax (em-dash)
studio - gainax
  Studio  -  Gainax  
```
All normalize to `studio-gainax` for comparison.

### Preserved Formatting:
```
Input: "this_is_a_test"
Stored: "this_is_a_test" (underscores preserved)
Normalized for comparison: "this-is-a-test"

Input: "this-is-a-test"
Rejected: Duplicate of above (both normalize to "this-is-a-test")
```

## Migration Notes

### Database Cleanup Performed:
```sql
-- Normalized studio_gainax to studio-gainax
UPDATE artists SET name = 'studio-gainax' WHERE id = 2;
UPDATE tags SET name = 'studio-gainax' WHERE name = 'studio_gainax';

-- Removed duplicate entries (IDs 9, 10)
DELETE FROM artist_tags WHERE artist_id IN (9, 10);
DELETE FROM artists WHERE id IN (9, 10);
```

### For Future Databases:
Run `scripts/migration/add-case-insensitive-artist-name.sql` to add COLLATE NOCASE constraint (currently fails due to foreign key constraints during rebuild - manual recreation required).

## Files Modified

1. `src/admin/artists.js`
   - Added `normalizeText()` function
   - Updated `getArtistByName()` to use normalized comparison
   - Updated `createArtist()` to clean and validate names
   - Updated `updateArtist()` to prevent duplicate renames

2. `src/admin/routes.js`
   - Updated `createTag()` to normalize tag names

3. `schema.sql`
   - Added `COLLATE NOCASE` to artists.name field

4. Test scripts created:
   - `scripts/test-normalization-v2.js`
   - `scripts/test-duplicate-prevention.js`

## Deployment Checklist

- [x] Local testing complete
- [x] All tests passing
- [x] Database cleanup performed locally
- [ ] Commit changes to feature branch
- [ ] Test on production database (read-only verification)
- [ ] Run cleanup scripts on production
- [ ] Deploy updated code
- [ ] Verify no new duplicates can be created

## Future Improvements

1. Add database migration script that works with foreign key constraints
2. Consider adding uniqueness validation at UI level (client-side warning)
3. Add bulk duplicate detection/cleanup tool for production maintenance
4. Consider adding similar normalization to other entity types (tags, etc.)

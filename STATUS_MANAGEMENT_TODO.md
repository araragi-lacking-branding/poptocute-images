# Status Management Implementation - Continuation Plan

## ✅ Completed (Commit 412e19a)
1. Database migration adding status fields to tags and artists
2. Updated all public API queries to filter out hidden content
3. Sync function updated to only cache eligible images
4. Stats endpoint counts only visible content

## ⏳ Still Needed for Full Feature

### Backend API Endpoints (src/admin/routes.js)

Add these routes:

```javascript
// PATCH /api/admin/images/:id/status
// Body: { status: 'active' | 'hidden' | 'deleted' }
handleUpdateImageStatus(request, env, imageId, corsHeaders)

// PATCH /api/admin/tags/:id/status  
// Body: { status: 'active' | 'hidden' | 'deleted' }
handleUpdateTagStatus(request, env, tagId, corsHeaders)

// PATCH /api/admin/artists/:id/status
// Body: { status: 'active' | 'hidden' | 'deleted' }
handleUpdateArtistStatus(request, env, artistId, corsHeaders)

// DELETE /api/admin/images/:id (hard delete)
handlePermanentlyDeleteImage(env, imageId, corsHeaders)

// DELETE /api/admin/tags/:id (hard delete)
handlePermanentlyDeleteTag(env, tagId, corsHeaders)

// DELETE /api/admin/artists/:id (hard delete)
handlePermanentlyDeleteArtist(env, artistId, corsHeaders)
```

### UI Components (src/admin/ui.js)

Add status controls to:

1. **Image Detail Panel**
   - Show/Hide/Delete buttons
   - Current status indicator
   - Confirmation dialogs

2. **Tag Lists** 
   - Status badge per tag
   - Quick actions dropdown
   - Confirmation dialogs

3. **Artist Detail Panel**
   - Status toggle buttons
   - Impact warning (shows # of affected images)
   - Confirmation dialogs

### Confirmation Dialog Pattern

```javascript
async function confirmStatusChange(type, item, newStatus) {
  const messages = {
    hidden: `Hide "${item.name}"? This will exclude ${item.imageCount || 'all'} images from public view.`,
    active: `Show "${item.name}"? This will make ${item.imageCount || 'all'} images visible again.`,
    deleted: `DELETE "${item.name}"? This cannot be undone and will remove all database records.`
  };
  
  if (!confirm(messages[newStatus])) return false;
  
  // For delete, require second confirmation
  if (newStatus === 'deleted') {
    if (!confirm('Are you ABSOLUTELY SURE? This is permanent.')) return false;
  }
  
  return true;
}
```

### Admin Panel UI Updates

1. **Status Badges**
   ```css
   .status-badge {
     padding: 2px 8px;
     border-radius: 12px;
     font-size: 11px;
     font-weight: 500;
   }
   .status-active { background: #4caf50; color: white; }
   .status-hidden { background: #ff9800; color: white; }
   .status-deleted { background: #f44336; color: white; }
   ```

2. **Action Buttons**
   - Show (status -> 'active')
   - Hide (status -> 'hidden')
   - Delete (status -> 'deleted' or hard delete)

3. **Filters**
   - Add "Show Hidden" toggle to admin views
   - By default, show only active items
   - Allow viewing hidden/deleted for recovery

## Implementation Priority

1. **High**: Image status controls (most common use case)
2. **Medium**: Tag status controls (affects multiple images)
3. **Medium**: Artist status controls (affects all artist's images)
4. **Low**: Hard delete functionality (soft delete sufficient for most cases)

## Testing Checklist

- [ ] Hide image → not in random selection
- [ ] Hide tag → all tagged images excluded
- [ ] Hide artist → all artist images excluded  
- [ ] Show (un-hide) → images return to rotation
- [ ] Delete tag → confirm prompt appears twice
- [ ] Admin panel still shows all statuses
- [ ] Stats count excludes hidden content
- [ ] Sync triggers after status change

## Notes

- All status changes should trigger `syncKVCache()` to update cache
- Soft delete (status='deleted') preferred over hard DELETE for data integrity
- Consider adding "deleted_at" timestamp for audit trail
- May want status change history table for compliance

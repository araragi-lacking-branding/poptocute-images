<#
scripts/upload-samples.ps1

Uploads all image files from a local folder to the remote R2 bucket configured in `wrangler.toml`, inserts minimal image rows into the remote D1 database, and tags them with the "samples" tag.

Usage (PowerShell):
  1. Save your sample images into a folder `local-samples\` at the repo root.
  2. Ensure you are logged into Wrangler and have access to the same Cloudflare account used by the project.
  3. Run: `pwsh ./scripts/upload-samples.ps1 -FolderPath "local-samples"`

Notes:
  - The script uses `wrangler r2 object put --binding IMAGES <bucket> <key> <file>` to upload files. This requires `wrangler` v2+ and the same `wrangler.toml` bindings as the repo.
  - After upload the script will insert a minimal record into D1 using `npx wrangler d1 execute <db> --remote --command "..."`.
  - The script computes a full SHA-256 and a short 16-char hex prefix for filename generation (matching upload handler behavior).
  - The script is idempotent: if a filename already exists in `images`, it will skip the DB insert and still ensure tagging.
  - You can review the SQL before running by passing `-DryRun`.
#>
param(
    [string]$FolderPath = "local-samples",
    [string]$DBName = "cutetopop-db",
    [switch]$DryRun
)

function Get-ShortHash($hex) {
    return $hex.Substring(0,16)
}

if (-not (Test-Path $FolderPath)) {
    Write-Error "Folder '$FolderPath' does not exist. Create it and add sample images, then re-run."; exit 1
}

# Ensure wrangler is available
try { npx --version > $null } catch { Write-Error "npx not found in PATH. Install Node.js and wrangler (npm i -g wrangler) and try again."; exit 1 }

# Map extension to mime
$mimeMap = @{ ".jpg" = "image/jpeg"; ".jpeg" = "image/jpeg"; ".png" = "image/png"; ".gif" = "image/gif"; ".webp" = "image/webp"; ".avif" = "image/avif" }

$files = Get-ChildItem -Path $FolderPath -File | Where-Object { $mimeMap.ContainsKey($_.Extension.ToLower()) }
if ($files.Count -eq 0) { Write-Output "No supported image files found in $FolderPath"; exit 0 }

if (-not $DryRun) {
    # Get samples tag id from remote DB
    $tagQuery = "SELECT id FROM tags WHERE name = 'samples' LIMIT 1;"
    $tagResult = & npx wrangler d1 execute $DBName --remote --command "$tagQuery" | Out-String
    # Parse numeric ID from table output (takes the last numeric token)
    $nums = [regex]::Matches($tagResult, '\d+') | ForEach-Object { $_.Value }
    if ($nums.Count -gt 0) { $samplesTagId = $nums[$nums.Count - 1] } else {
        Write-Error "Could not find 'samples' tag ID in DB. Ensure 'samples' tag exists."; exit 1
    }
    Write-Output "samples tag id = $samplesTagId"
} else {
    Write-Output "DRY RUN: skipping remote tag lookup; using placeholder for samples tag id"
    $samplesTagId = '<SAMPLES_TAG_ID>'
}

foreach ($f in $files) {
    Write-Output "\nProcessing $($f.Name)"

    # Compute SHA-256
    $hash = Get-FileHash -Algorithm SHA256 -Path $f.FullName
    $hashHex = $hash.Hash.ToLower()
    $shortHash = Get-ShortHash $hashHex
    $ext = $f.Extension.TrimStart('.').ToLower()
    $r2Key = "images/$shortHash.$ext"

    # Upload to R2
    $uploadCmd = "npx wrangler r2 object put --binding IMAGES cutetopop-images $r2Key `"$($f.FullName)`" --quiet"
    Write-Output "Uploading to R2 as $r2Key"
    if (-not $DryRun) {
        $up = Invoke-Expression $uploadCmd
    } else {
        Write-Output "DRY RUN: $uploadCmd"
    }

    # Prepare DB insert (idempotent)
    $fileSize = $f.Length
    $mime = $mimeMap[$f.Extension.ToLower()]

    # Use parameterized-looking SQL but we will interpolate safely by escaping single quotes
    $orig = $f.Name.Replace("'","''")
    $filenameEsc = $r2Key.Replace("'","''")
    $hashEsc = $hashHex

        $insertSql = @"
INSERT OR IGNORE INTO images (
    filename, original_filename, file_size, mime_type, file_hash, status, credit_id, created_at, updated_at
) VALUES (
    '$filenameEsc', '$orig', $fileSize, '$mime', '$hashEsc', 'active', 1, datetime('now'), datetime('now')
);
"@

    $selectIdSql = "SELECT id FROM images WHERE filename = '$filenameEsc' LIMIT 1;"

    if ($DryRun) {
        Write-Output "DRY RUN SQL:\n$insertSql\n$selectIdSql"; continue
    }

    Write-Output "Inserting image row into D1 for $r2Key"
    & npx wrangler d1 execute $DBName --remote --command "$insertSql" | Out-Null

    # Retrieve image id
    $idOut = & npx wrangler d1 execute $DBName --remote --command "$selectIdSql" | Out-String
    $idNums = [regex]::Matches($idOut, '\d+') | ForEach-Object { $_.Value }
    if ($idNums.Count -gt 0) { $imageId = $idNums[$idNums.Count - 1] } else { Write-Warning "Could not read inserted image id for $r2Key. Skipping tagging."; continue }

    Write-Output "Inserted/Found image id: $imageId"

    # Tag with samples tag
    $tagSql = "INSERT OR IGNORE INTO image_tags (image_id, tag_id, added_by, confidence) VALUES ($imageId, $samplesTagId, 'admin', 1.0);"
    Write-Output "Tagging image id $imageId with samples (tag id $samplesTagId)"
    & npx wrangler d1 execute $DBName --remote --command "$tagSql" | Out-Null

    Write-Output "Done: $($f.Name) -> $r2Key (id: $imageId)"
}

Write-Output "\nAll files processed. To verify totals run: npx wrangler d1 execute $DBName --remote --command \"SELECT COUNT(*) FROM images;\""
Write-Output "Then run the KV sync endpoint or: node scripts/sync-kv.js to refresh cache."
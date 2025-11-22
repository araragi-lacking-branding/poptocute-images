param(
    [string]$FolderPath = "local-samples",
    [string]$DBName = "cutetopop-db",
    [int]$SamplesTagId = 38
)

if (-not (Test-Path $FolderPath)) {
    Write-Error "Folder '$FolderPath' does not exist. Create it and add sample images, then re-run."; exit 1
}

$mimeMap = @{ ".jpg" = "image/jpeg"; ".jpeg" = "image/jpeg"; ".png" = "image/png"; ".gif" = "image/gif"; ".webp" = "image/webp"; ".avif" = "image/avif" }

$files = Get-ChildItem -Path $FolderPath -File | Where-Object { $mimeMap.ContainsKey($_.Extension.ToLower()) }
if ($files.Count -eq 0) { Write-Output "No supported image files found in $FolderPath"; exit 0 }

function Get-ShortHash($hex) { return $hex.Substring(0,16) }

foreach ($f in $files) {
    Write-Output "\nProcessing $($f.Name)"

    $hash = Get-FileHash -Algorithm SHA256 -Path $f.FullName
    $hashHex = $hash.Hash.ToLower()
    $shortHash = Get-ShortHash $hashHex
    $ext = $f.Extension.TrimStart('.').ToLower()
    $r2Key = "images/$shortHash.$ext"

    Write-Output "Uploading to R2 as $r2Key"
    $uploadCmd = "npx wrangler r2 object put cutetopop-images/$r2Key -f `"$($f.FullName)`" --remote"
    Write-Output $uploadCmd
    $u = Invoke-Expression $uploadCmd

    $fileSize = $f.Length
    $mime = $mimeMap[$f.Extension.ToLower()]
    $orig = $f.Name.Replace("'","''")
    $filenameEsc = $r2Key.Replace("'","''")
    $hashEsc = $hashHex

    $insertSql = "INSERT OR IGNORE INTO images (filename, original_filename, file_size, mime_type, file_hash, status, credit_id, created_at, updated_at) VALUES ('$filenameEsc', '$orig', $fileSize, '$mime', '$hashEsc', 'active', 1, datetime('now'), datetime('now'));"

    Write-Output "Writing temp SQL and inserting image row into D1 for $r2Key"
    $tmpInsert = [System.IO.Path]::Combine([System.IO.Path]::GetTempPath(), [System.Guid]::NewGuid().ToString() + '.sql')
    Set-Content -LiteralPath $tmpInsert -Value $insertSql -Encoding UTF8
    npx wrangler d1 execute $DBName --remote --file $tmpInsert | Out-Null
    Remove-Item $tmpInsert -ErrorAction SilentlyContinue

    $selectSql = "SELECT id FROM images WHERE filename = '$filenameEsc' LIMIT 1;"
    $tmpSelect = [System.IO.Path]::Combine([System.IO.Path]::GetTempPath(), [System.Guid]::NewGuid().ToString() + '.sql')
    Set-Content -LiteralPath $tmpSelect -Value $selectSql -Encoding UTF8
    $selectOut = npx wrangler d1 execute $DBName --remote --file $tmpSelect --json | Out-String
    Remove-Item $tmpSelect -ErrorAction SilentlyContinue
    # Extract JSON array from possible leading logs
    $firstBracket = $selectOut.IndexOf('[')
    $lastBracket = $selectOut.LastIndexOf(']')
    if ($firstBracket -ge 0 -and $lastBracket -ge $firstBracket) {
        $json = $selectOut.Substring($firstBracket, $lastBracket - $firstBracket + 1)
        try {
            $parsed = $json | ConvertFrom-Json
            if ($parsed[0].rows -and $parsed[0].rows.Count -gt 0) {
                $imageId = $parsed[0].rows[0][0]
            } elseif ($parsed[0].results -and $parsed[0].results.Count -gt 0) {
                $imageId = $parsed[0].results[0].id
            } else { Write-Warning "No id returned for $r2Key"; continue }
        } catch {
            Write-Warning "Could not parse JSON output for select; raw output:\n$selectOut"; continue
        }
    } else {
        Write-Warning "Could not locate JSON output in wrangler response for select; raw output:\n$selectOut"; continue
    }

    Write-Output "Inserted/Found image id: $imageId"

    $tagSql = "INSERT OR IGNORE INTO image_tags (image_id, tag_id, added_by, confidence) VALUES ($imageId, $SamplesTagId, 'admin', 1.0);"
    $tmpTag = [System.IO.Path]::Combine([System.IO.Path]::GetTempPath(), [System.Guid]::NewGuid().ToString() + '.sql')
    Set-Content -LiteralPath $tmpTag -Value $tagSql -Encoding UTF8
    npx wrangler d1 execute $DBName --remote --file $tmpTag | Out-Null
    Remove-Item $tmpTag -ErrorAction SilentlyContinue

    Write-Output "Done: $($f.Name) -> $r2Key (id: $imageId)"
}

Write-Output "\nAll files processed. To verify totals run: npx wrangler d1 execute $DBName --remote --command 'SELECT COUNT(*) FROM images;'"
Write-Output "Then run the KV sync endpoint or: node scripts/sync-kv.js to refresh cache."

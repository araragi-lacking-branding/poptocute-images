# Verifies presence and integrity of sample images in R2 vs local files
param(
    [string]$Bucket = 'cutetopop-images'
)

mkdir -Force .\tmp | Out-Null

$entries = @(
    @{ key = 'images/f242f680a28f1339.jpg'; local = 'local-samples\\cute pop cute witch banner low.jpg' },
    @{ key = 'images/d0b6437cc58d20f1.jpg'; local = 'local-samples\\cute pop cute witch text.jpg' },
    @{ key = 'images/81f5c4bd907a2e7c.jpg'; local = 'local-samples\\cute pop text umi back.jpg' },
    @{ key = 'images/9a24048119526f98.jpg'; local = 'local-samples\\pop cute text umi back.jpg' }
)

foreach ($e in $entries) {
    $key = $e.key
    $local = $e.local
    Write-Output "`n=== CHECK: $key ==="
    Write-Output "Local file: $local"
    if (-not (Test-Path $local)) { Write-Output "LOCAL MISSING: $local"; continue }

    $out = Join-Path -Path .\tmp -ChildPath ($key -replace '/','_')
    Write-Output "Downloading R2 object to: $out"
    npx wrangler r2 object get $Bucket/$key -f $out --remote
    if ($LASTEXITCODE -ne 0) { Write-Output "R2 MISSING: $key (exit $LASTEXITCODE)"; continue }

    $r2size = (Get-Item $out).Length
    $r2hash = (Get-FileHash -Algorithm SHA256 -Path $out).Hash.ToLower()
    $localsize = (Get-Item $local).Length
    $localhash = (Get-FileHash -Algorithm SHA256 -Path $local).Hash.ToLower()

    Write-Output "R2 -> $out size=$r2size sha256=$r2hash"
    Write-Output "LOCAL -> $local size=$localsize sha256=$localhash"
    if ($r2hash -eq $localhash) { Write-Output "RESULT: MATCH" } else { Write-Output "RESULT: MISMATCH" }
}

Write-Output "\nVerification complete. Tmp files are in .\tmp\" 

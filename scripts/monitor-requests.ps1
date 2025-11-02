# Monitor request patterns and bot blocks
# Usage: .\scripts\monitor-requests.ps1 [duration_in_seconds]

param(
    [int]$Duration = 60  # Default: monitor for 60 seconds
)

Write-Host "🔍 Monitoring requests for $Duration seconds..." -ForegroundColor Cyan
Write-Host "Press Ctrl+C to stop early`n" -ForegroundColor Gray

$blockedCount = 0
$requestCount = 0
$uniqueIPs = @{}
$countries = @{}

$job = Start-Job -ScriptBlock {
    wrangler tail --format pretty 2>&1
}

$endTime = (Get-Date).AddSeconds($Duration)

while ((Get-Date) -lt $endTime) {
    $output = Receive-Job -Job $job 2>&1
    
    if ($output) {
        foreach ($line in $output) {
            $lineStr = $line.ToString()
            
            # Count blocked bots
            if ($lineStr -match '\[BLOCKED-BOT\].*IP: ([\d\.]+).*Country: (\w+)') {
                $blockedCount++
                $ip = $Matches[1]
                $country = $Matches[2]
                
                if (-not $uniqueIPs.ContainsKey($ip)) {
                    $uniqueIPs[$ip] = @{ Count = 0; Type = "BOT"; Country = $country }
                }
                $uniqueIPs[$ip].Count++
                
                if (-not $countries.ContainsKey($country)) {
                    $countries[$country] = @{ Legitimate = 0; Blocked = 0 }
                }
                $countries[$country].Blocked++
            }
            
            # Count legitimate requests
            if ($lineStr -match '\[REQUEST\] ([\d\.]+) \| (\w+) \|') {
                $requestCount++
                $ip = $Matches[1]
                $country = $Matches[2]
                
                if (-not $uniqueIPs.ContainsKey($ip)) {
                    $uniqueIPs[$ip] = @{ Count = 0; Type = "USER"; Country = $country }
                }
                $uniqueIPs[$ip].Count++
                
                if (-not $countries.ContainsKey($country)) {
                    $countries[$country] = @{ Legitimate = 0; Blocked = 0 }
                }
                $countries[$country].Legitimate++
            }
        }
    }
    
    Start-Sleep -Milliseconds 500
}

Stop-Job -Job $job
Remove-Job -Job $job

# Display results
Write-Host "`n═══════════════════════════════════════════════" -ForegroundColor Cyan
Write-Host "📊 REQUEST SUMMARY ($Duration seconds)" -ForegroundColor Cyan
Write-Host "═══════════════════════════════════════════════`n" -ForegroundColor Cyan

Write-Host "Total Requests:    " -NoNewline
Write-Host "$requestCount" -ForegroundColor Green
Write-Host "Blocked Bots:      " -NoNewline
Write-Host "$blockedCount" -ForegroundColor Red
Write-Host "Unique IPs:        " -NoNewline
Write-Host "$($uniqueIPs.Count)" -ForegroundColor Yellow

# Calculate rate per hour
$requestsPerHour = [math]::Round(($requestCount / $Duration) * 3600)
$blocksPerHour = [math]::Round(($blockedCount / $Duration) * 3600)

Write-Host "`nProjected per hour:" -ForegroundColor Gray
Write-Host "  Requests: ~$requestsPerHour/hr" -ForegroundColor Green
Write-Host "  Blocks:   ~$blocksPerHour/hr" -ForegroundColor Red

if ($uniqueIPs.Count -gt 0) {
    Write-Host "`n─────────────────────────────────────────────" -ForegroundColor Gray
    Write-Host "🌍 TOP IPs" -ForegroundColor Cyan
    Write-Host "─────────────────────────────────────────────" -ForegroundColor Gray
    
    $uniqueIPs.GetEnumerator() | 
        Sort-Object { $_.Value.Count } -Descending | 
        Select-Object -First 10 | 
        ForEach-Object {
            $type = if ($_.Value.Type -eq "BOT") { "[BOT]" } else { "[USER]" }
            $color = if ($_.Value.Type -eq "BOT") { "Red" } else { "Green" }
            
            Write-Host "  $type " -ForegroundColor $color -NoNewline
            Write-Host "$($_.Key) ($($_.Value.Country)) - $($_.Value.Count) requests"
        }
}

if ($countries.Count -gt 0) {
    Write-Host "`n─────────────────────────────────────────────" -ForegroundColor Gray
    Write-Host "🗺️  BY COUNTRY" -ForegroundColor Cyan
    Write-Host "─────────────────────────────────────────────" -ForegroundColor Gray
    
    $countries.GetEnumerator() | 
        Sort-Object { $_.Value.Legitimate + $_.Value.Blocked } -Descending | 
        Select-Object -First 10 | 
        ForEach-Object {
            $total = $_.Value.Legitimate + $_.Value.Blocked
            Write-Host "  $($_.Key): " -NoNewline
            Write-Host "$($_.Value.Legitimate) legitimate" -ForegroundColor Green -NoNewline
            Write-Host " / " -NoNewline
            Write-Host "$($_.Value.Blocked) blocked" -ForegroundColor Red
        }
}

Write-Host "`n═══════════════════════════════════════════════`n" -ForegroundColor Cyan

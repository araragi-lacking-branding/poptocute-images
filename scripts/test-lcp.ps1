Write-Host "`n🎯 Testing LCP Performance with SSR`n" -ForegroundColor Cyan

# Test HTML+Data Load Time (TTFB + HTML generation)
Write-Host "1. HTML Load Time (includes SSR data generation):" -ForegroundColor Yellow
$htmlTimes = @()
for ($i=1; $i -le 10; $i++) {
    $time = Measure-Command { curl -s -o /dev/null https://cutetopop.com/ }
    $ms = [math]::Round($time.TotalMilliseconds)
    $htmlTimes += $ms
    Write-Host "  Test ${i}: ${ms}ms"
}
$avgHtml = [math]::Round(($htmlTimes | Measure-Object -Average).Average)
$p75Html = $htmlTimes | Sort-Object | Select-Object -Index 7
Write-Host "  Average: ${avgHtml}ms, P75: ${p75Html}ms`n" -ForegroundColor Green

# Test API Load Time (for comparison)
Write-Host "2. API Response Time (for comparison):" -ForegroundColor Yellow
$apiTimes = @()
for ($i=1; $i -le 10; $i++) {
    $time = Measure-Command { curl -s -o /dev/null https://cutetopop.com/api/random }
    $ms = [math]::Round($time.TotalMilliseconds)
    $apiTimes += $ms
    Write-Host "  Test ${i}: ${ms}ms"
}
$avgApi = [math]::Round(($apiTimes | Measure-Object -Average).Average)
$p75Api = $apiTimes | Sort-Object | Select-Object -Index 7
Write-Host "  Average: ${avgApi}ms, P75: ${p75Api}ms`n" -ForegroundColor Green

# Calculate estimated LCP
Write-Host "3. Estimated LCP (assuming 200KB image = 200ms download):" -ForegroundColor Yellow
$estimatedLCP_p50 = $avgHtml + 200
$estimatedLCP_p75 = $p75Html + 250
$estimatedLCP_p99 = ($htmlTimes | Sort-Object -Descending | Select-Object -First 1) + 400
Write-Host "  P50: ~${estimatedLCP_p50}ms" -ForegroundColor Green
Write-Host "  P75: ~${estimatedLCP_p75}ms" -ForegroundColor Green
Write-Host "  P99: ~${estimatedLCP_p99}ms`n" -ForegroundColor Green

Write-Host "4. Time Saved vs Old Method:" -ForegroundColor Yellow
$oldMethod = $avgHtml + $avgApi
$newMethod = $avgHtml
$saved = $oldMethod - $newMethod
Write-Host "  Old (HTML + API): ~${oldMethod}ms"
Write-Host "  New (SSR): ~${newMethod}ms"
Write-Host "  Saved: ${saved}ms ($([math]::Round(($saved/$oldMethod)*100))% faster)`n" -ForegroundColor Green

# Comparison to baseline
Write-Host "5. Comparison to Baseline Metrics:" -ForegroundColor Yellow
Write-Host "  Baseline P50: 548ms -> Estimated: ${estimatedLCP_p50}ms ($(548 - $estimatedLCP_p50)ms faster)" -ForegroundColor $(if ((548 - $estimatedLCP_p50) -gt 0) { "Green" } else { "Red" })
Write-Host "  Baseline P75: 772ms -> Estimated: ${estimatedLCP_p75}ms ($(772 - $estimatedLCP_p75)ms faster)" -ForegroundColor $(if ((772 - $estimatedLCP_p75) -gt 0) { "Green" } else { "Red" })
Write-Host "  Baseline P99: 2180ms -> Estimated: ${estimatedLCP_p99}ms ($(2180 - $estimatedLCP_p99)ms faster)`n" -ForegroundColor $(if ((2180 - $estimatedLCP_p99) -gt 0) { "Green" } else { "Red" })

Write-Host "📊 Next Steps:" -ForegroundColor Cyan
Write-Host "  1. Check Cloudflare Analytics RUM metrics in 1-2 hours"
Write-Host "  2. Compare real-world P50/P75/P99 LCP values"
Write-Host "  3. Monitor for 24 hours to see full impact`n"

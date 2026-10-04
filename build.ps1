$ErrorActionPreference = "Stop"
$root = $PSScriptRoot
$dist = Join-Path $root "dist"
New-Item -ItemType Directory -Force -Path $dist, (Join-Path $dist "server") | Out-Null
foreach ($file in @("index.html", "styles.css", "app.js", "cards.css", "cards.js", "auth.css", "auth.js", "favicon.svg")) {
  Copy-Item -LiteralPath (Join-Path $root $file) -Destination $dist -Force
}
Copy-Item -LiteralPath (Join-Path $root "server/index.js") -Destination (Join-Path $dist "server/index.js") -Force
Write-Output "Built Tenderdesk in dist/"

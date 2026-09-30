$ErrorActionPreference = "Stop"
$root = $PSScriptRoot
$dist = Join-Path $root "dist"
New-Item -ItemType Directory -Force -Path $dist, (Join-Path $dist "server") | Out-Null
Copy-Item -LiteralPath (Join-Path $root "index.html") -Destination $dist -Force
Copy-Item -LiteralPath (Join-Path $root "styles.css") -Destination $dist -Force
Copy-Item -LiteralPath (Join-Path $root "app.js") -Destination $dist -Force
Copy-Item -LiteralPath (Join-Path $root "favicon.svg") -Destination $dist -Force
Copy-Item -LiteralPath (Join-Path $root "server/index.js") -Destination (Join-Path $dist "server/index.js") -Force
Write-Output "Built Tenderdesk in dist/"

#!/usr/bin/env bash
set -euo pipefail
project_root=$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)
dist_root="$project_root/dist"
rm -rf "$dist_root"
mkdir -p "$dist_root/server" "$dist_root/.openai" "$dist_root/assets"
cp "$project_root/worker/index.js" "$dist_root/server/index.js"
cp "$project_root/.openai/hosting.json" "$dist_root/.openai/hosting.json"
cp "$project_root/index.html" "$project_root/styles.css" "$project_root/app.js" "$project_root/cards.css" "$project_root/cards.js" "$project_root/auth.css" "$project_root/auth.js" "$project_root/favicon.svg" "$dist_root/"

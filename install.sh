#!/bin/sh
set -eu
command -v node >/dev/null 2>&1 || { echo 'Install Node.js 20+ first.' >&2; exit 1; }
command -v npm >/dev/null 2>&1 || { echo 'Install npm first.' >&2; exit 1; }
command -v claude >/dev/null 2>&1 || { echo 'Install Claude Code first.' >&2; exit 1; }
node -e 'if (Number(process.versions.node.split(".")[0]) < 20) { console.error("Node.js 20+ is required"); process.exit(1); }'
source_directory=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)
temporary_directory=$(mktemp -d)
archive=''
cleanup() {
    if [ -n "$archive" ]; then rm -f -- "$archive"; fi
    rmdir -- "$temporary_directory" 2>/dev/null || true
}
trap cleanup EXIT HUP INT TERM
archive_name=$(npm pack "$source_directory" --pack-destination "$temporary_directory" --silent --ignore-scripts)
archive="$temporary_directory/$(basename -- "$archive_name")"
npm install --global "$archive" --ignore-scripts --no-audit --no-fund
echo 'Installed claude-ab. Next: claude-ab --setup'

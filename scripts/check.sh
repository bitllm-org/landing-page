#!/bin/sh
# Checks the files Cloudflare publishes. Run from the repository root.
set -eu
cd "$(dirname "$0")/.."

FILES="public/index.html public/docs/index.html public/llms.txt public/install.sh public/install.ps1"
for f in $FILES; do
  [ -s "$f" ] || { echo "check: $f is missing or empty" >&2; exit 1; }
done
sh -n public/install.sh
node --check src/index.js

if grep -n 'bitllm-network' $FILES; then
  echo "check: public links must use bitllm-org, not bitllm-network" >&2
  exit 1
fi

python3 - <<'PY'
import pathlib, re, sys

base = pathlib.Path("public")
pages = [base / "index.html", base / "docs" / "index.html"]
missing = []
for page in pages:
    html = page.read_text(encoding="utf-8")
    for ref in re.findall(r'(?:href|src)="([^"]+)"', html):
        if ref.startswith(("#", "http://", "https://", "mailto:", "data:")):
            continue
        path = ref.split("?")[0].split("#")[0].lstrip("/")
        if not path:
            continue
        if not (base / path).exists():
            missing.append(f"{page}: {ref}")
if missing:
    print("check: pages reference files that are not here:", file=sys.stderr)
    for ref in missing:
        print("  " + ref, file=sys.stderr)
    sys.exit(1)
PY

grep -q '"directory": "./public"' wrangler.jsonc || {
  echo "check: wrangler.jsonc must publish ./public" >&2
  exit 1
}

echo "check: ok"

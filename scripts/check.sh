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
    ids = re.findall(r'\sid="([^"]+)"', html)
    for dup in sorted({i for i in ids if ids.count(i) > 1}):
        missing.append(f"{page}: duplicate id {dup}")
css = (base / "site.css").read_text(encoding="utf-8")
for ref in re.findall(r'url\("?([^")]+)"?\)', css):
    if not (base / ref.lstrip("/")).exists():
        missing.append(f"public/site.css: {ref}")
if missing:
    print("check: broken references or duplicate ids:", file=sys.stderr)
    for ref in missing:
        print("  " + ref, file=sys.stderr)
    sys.exit(1)
PY

if grep -n '—' public/index.html public/docs/index.html public/llms.txt; then
  echo "check: user-facing copy has no em dashes (see AGENTS.md in bitllm-org/bitllm)" >&2
  exit 1
fi

# The site follows the dashboard's tokens. A difference is a warning, because
# the two repositories merge separately; silent drift is what this catches.
python3 - <<'TOKENS' || true
import pathlib, re, urllib.request

URL = "https://raw.githubusercontent.com/bitllm-org/bitllm/main/internal/assets/ui.html"
def tokens(text):
    return dict(re.findall(r"(--[a-z0-9-]+):\s*([^;]+);", re.search(r":root\s*{(.*?)}", text, re.S).group(1)))
try:
    theirs = tokens(urllib.request.urlopen(URL, timeout=10).read().decode("utf-8"))
except Exception as e:
    print(f"check: could not read the dashboard tokens ({e}); skipping the comparison")
    raise SystemExit
ours = tokens(pathlib.Path("public/site.css").read_text(encoding="utf-8"))
for name in sorted(theirs.keys() | ours.keys()):
    if theirs.get(name) != ours.get(name):
        print(f"::warning::{name} differs from the dashboard: site {ours.get(name)}, dashboard {theirs.get(name)}")
TOKENS

grep -q '"directory": "./public"' wrangler.jsonc || {
  echo "check: wrangler.jsonc must publish ./public" >&2
  exit 1
}

echo "check: ok"

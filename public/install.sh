#!/bin/sh
# BitLLM installer for macOS and Linux. Downloads the latest release binary
# for this machine, checks it against the release's SHA256SUMS, and puts it in
# ~/.local/bin (override with BITLLM_DIR). If the check cannot be done, nothing
# is installed. No sudo needed.
#
# BITLLM_BASE overrides where the release files come from. The tests in
# scripts/test-install.sh point it at a local server.
#
#   curl -fsSL https://bitllm.org/install.sh | sh
set -eu

REPO=bitllm-org/bitllm
DIR=${BITLLM_DIR:-$HOME/.local/bin}
BASE=${BITLLM_BASE:-https://github.com/$REPO/releases/latest/download}

os=$(uname -s)
arch=$(uname -m)
case "$os" in
  Darwin) os=darwin ;;
  Linux) os=linux ;;
  *) echo "bitllm: unsupported OS $os (on Windows use: irm https://bitllm.org/install.ps1 | iex)" >&2; exit 1 ;;
esac
case "$arch" in
  x86_64 | amd64) arch=amd64 ;;
  arm64 | aarch64) arch=arm64 ;;
  *) echo "bitllm: unsupported CPU $arch" >&2; exit 1 ;;
esac
if [ "$os-$arch" = darwin-amd64 ]; then
  echo "bitllm: Intel Macs have no build yet (Apple silicon only)" >&2; exit 1
fi
name=bitllm-$os-$arch
command -v sha256sum >/dev/null 2>&1 || command -v shasum >/dev/null 2>&1 || {
  echo "bitllm: need sha256sum or shasum to check the download, not installing" >&2; exit 1
}

# Work inside the destination directory, so the final mv is a rename on one
# filesystem and an interrupted install cannot leave a truncated binary.
mkdir -p "$DIR"
tmp=$(mktemp -d "$DIR/.bitllm-install.XXXXXX")
trap 'rm -rf "$tmp"' EXIT
trap 'exit 1' HUP INT TERM
echo "downloading $name"
curl -fsSL -o "$tmp/bitllm" "$BASE/$name"
curl -fsSL -o "$tmp/SHA256SUMS" "$BASE/SHA256SUMS" 2>/dev/null || {
  echo "bitllm: could not download SHA256SUMS from $BASE, not installing" >&2; exit 1
}
want=$(awk -v n="$name" '$2 == n || $2 == "*"n {print $1}' "$tmp/SHA256SUMS")
if [ -z "$want" ]; then
  echo "bitllm: SHA256SUMS has no entry for $name, not installing" >&2; exit 1
fi
got=$( (sha256sum "$tmp/bitllm" 2>/dev/null || shasum -a 256 "$tmp/bitllm") | awk '{print $1}')
if [ "$want" != "$got" ]; then
  echo "bitllm: checksum mismatch for $name, not installing" >&2; exit 1
fi
echo "checksum ok"
chmod +x "$tmp/bitllm"
mv -f "$tmp/bitllm" "$DIR/bitllm"
"$DIR/bitllm" --version

case ":$PATH:" in
  *":$DIR:"*) cmd=bitllm ;;
  *) cmd="$DIR/bitllm"; echo "note: $DIR is not on your PATH" ;;
esac
echo
echo "Installed. Start it with:  $cmd"
echo "Then open http://127.0.0.1:7778, or read https://bitllm.org/llms.txt (steps for agents)."

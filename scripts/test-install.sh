#!/bin/sh
# Runs public/install.sh against a fake release on 127.0.0.1 and checks that it
# installs only a download it could verify. Touches nothing outside a temp
# directory and talks to nothing but loopback.
#
#   sh scripts/test-install.sh [path/to/install.sh]
set -eu
cd "$(dirname "$0")/.."

installer=${1:-public/install.sh}
# Without the override the script would download from the live release.
grep -q BITLLM_BASE "$installer" || {
  echo "test-install: $installer has no BITLLM_BASE override, refusing to run it" >&2
  exit 1
}
if command -v sha256sum >/dev/null 2>&1; then sha="sha256sum"; else sha="shasum -a 256"; fi
export NO_PROXY=127.0.0.1 no_proxy=127.0.0.1

work=$(mktemp -d)
server=
trap 'if [ -n "$server" ]; then kill "$server" 2>/dev/null || true; fi; rm -rf "$work"' EXIT
trap 'exit 1' HUP INT TERM
www=$work/www
mkdir -p "$www"
cp "$installer" "$www/install.sh"

# Each fake binary leaves a mark when it runs, so a test can tell it ran.
fake() {
  printf '#!/bin/sh\necho ran >> "%s"\necho "bitllm %s"\n' "$work/$1-ran" "$2" > "$work/$1-bitllm"
  chmod +x "$work/$1-bitllm"
}
fake new v9.9.9-new
fake old v0.0.1-old

assets="bitllm-darwin-arm64 bitllm-linux-amd64 bitllm-linux-arm64"
hash_of() { $sha "$1" | awk '{print $1}'; }
new_hash=$(hash_of "$work/new-bitllm")
old_hash=$(hash_of "$work/old-bitllm")

# release NAME HASH SUFFIX: a release whose SHA256SUMS lists every asset under
# HASH and name+SUFFIX. With no HASH there is no SHA256SUMS at all.
release() {
  mkdir -p "$www/$1"
  for a in $assets; do
    cp "$work/new-bitllm" "$www/$1/$a"
    if [ -n "$2" ]; then printf '%s  %s%s\n' "$2" "$a" "$3" >> "$www/$1/SHA256SUMS"; fi
  done
}
release good "$new_hash" ""
release nosums "" ""
release noentry "$new_hash" ".sig"
release mismatch "$old_hash" ""

python3 -u -m http.server 0 --bind 127.0.0.1 --directory "$www" > "$work/server.log" 2>&1 &
server=$!
port=
i=0
while [ -z "$port" ] && [ "$i" -lt 100 ]; do
  port=$(sed -n 's/^Serving HTTP on .* port \([0-9]*\) .*/\1/p' "$work/server.log")
  [ -n "$port" ] || sleep 0.1
  i=$((i + 1))
done
[ -n "$port" ] || { echo "test-install: the fake release server did not start" >&2; exit 1; }
url=http://127.0.0.1:$port

# Stand-ins for commands the installer runs, used by single cases below.
mkdir -p "$work/log-mv" "$work/interrupt" "$work/no-sha"
printf '#!/bin/sh\necho "$@" >> "%s"\nexec "%s" "$@"\n' "$work/mv.log" "$(command -v mv)" > "$work/log-mv/mv"
cat > "$work/interrupt/curl" <<'EOF'
#!/bin/sh
# Writes part of a download, then interrupts the installer.
while [ $# -gt 0 ]; do
  if [ "$1" = -o ]; then printf partial > "$2"; fi
  shift
done
kill -TERM "$PPID"
exit 1
EOF
chmod +x "$work/log-mv/mv" "$work/interrupt/curl"
for tool in awk chmod curl mkdir mktemp mv rm uname; do
  ln -s "$(command -v "$tool")" "$work/no-sha/$tool"
done

failures=0
check() {
  what=$1
  shift
  if "$@"; then
    echo "ok    $label: $what"
  else
    echo "FAIL  $label: $what"
    failures=$((failures + 1))
  fi
}
failed() { [ "$rc" -ne 0 ]; }
succeeded() { [ "$rc" -eq 0 ]; }
absent() { [ ! -e "$1" ]; }
empty_dir() { [ -z "$(ls -A "$1" 2>/dev/null)" ]; }
only_bitllm() { [ "$(ls -A "$dir")" = bitllm ]; }
said() { grep -qF "$1" "$out"; }
one_line_error() { [ "$(grep -c '' "$err")" = 1 ] && grep -qF "bitllm: $1" "$err"; }
stayed_in_dir() {
  case $(cat "$work/mv.log") in
    *" $dir/"*" $dir/bitllm") return 0 ;;
  esac
  return 1
}

setup() {
  label=$1
  dir=$work/cases/$label/home/.local/bin
  tmpd=$work/cases/$label/tmp
  out=$work/cases/$label/out
  err=$work/cases/$label/err
  mkdir -p "$tmpd"
  rm -f "$work/new-ran" "$work/old-ran" "$work/mv.log"
  run_path=$PATH
}
preinstall() {
  mkdir -p "$dir"
  cp "$work/old-bitllm" "$dir/bitllm"
}
# run RELEASE: what a newcomer runs, curl piped into sh.
run() {
  if curl -fsS "$url/install.sh" |
    env PATH="$run_path" BITLLM_BASE="$url/$1" BITLLM_DIR="$dir" TMPDIR="$tmpd" "$(command -v sh)" > "$out" 2> "$err"; then
    rc=0
  else
    rc=$?
  fi
}
installed_new() {
  check "exits 0" succeeded
  check "installs the new binary" cmp -s "$work/new-bitllm" "$dir/bitllm"
  check "the binary is executable" test -x "$dir/bitllm"
  check "leaves no temp files" only_bitllm
  check "leaves no temp files in TMPDIR" empty_dir "$tmpd"
  check "prints the download line" said "downloading bitllm-"
  check "prints checksum ok" said "checksum ok"
  check "prints the version" said "bitllm v9.9.9-new"
  check "prints the PATH note" said "is not on your PATH"
  check "prints how to start" said "Installed. Start it with:"
  check "moves within the destination directory" stayed_in_dir
}
refused_common() {
  check "exits non-zero" failed
  check "runs nothing new" absent "$work/new-ran"
  check "runs nothing old" absent "$work/old-ran"
  check "leaves no temp files in TMPDIR" empty_dir "$tmpd"
}
refused_with_old() {
  refused_common
  check "leaves the existing binary unchanged" cmp -s "$work/old-bitllm" "$dir/bitllm"
  check "leaves nothing else behind" only_bitllm
}
refused_fresh() {
  refused_common
  check "installs nothing" empty_dir "$dir"
}

setup good-fresh
run_path=$work/log-mv:$PATH
run good
installed_new

setup good-over-existing
run_path=$work/log-mv:$PATH
preinstall
run good
installed_new

# refused CASE RELEASE MESSAGE [PATH]: with and without an existing install.
refused() {
  setup "$1-existing"
  run_path=${4:-$PATH}
  preinstall
  run "$2"
  refused_with_old
  check "says why in one line" one_line_error "$3"

  setup "$1-fresh"
  run_path=${4:-$PATH}
  run "$2"
  refused_fresh
  check "says why in one line" one_line_error "$3"
}
refused missing-sums nosums "could not download SHA256SUMS"
refused no-entry noentry "SHA256SUMS has no entry for bitllm-"
refused mismatch mismatch "checksum mismatch for bitllm-"
refused no-sha-tool good "need sha256sum or shasum" "$work/no-sha"

setup interrupted
run_path=$work/interrupt:$PATH
preinstall
run good
refused_with_old

if [ "$failures" -ne 0 ]; then
  echo "test-install: $failures failed" >&2
  exit 1
fi
echo "test-install: ok"

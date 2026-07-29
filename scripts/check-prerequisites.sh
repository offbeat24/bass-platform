#!/bin/sh

# Node-independent macOS prerequisite check for the optional BASS NAN Edition.
# This script never installs packages or changes system settings.

NODE_DOWNLOAD_URL="https://nodejs.org/en/download"
NODE_BIN="${BASS_NODE_BIN:-node}"
NPM_BIN="${BASS_NPM_BIN:-npm}"
FAILED=0
CHECK_UNITY=0
TARGETS="web"

while [ "$#" -gt 0 ]; do
  case "$1" in
    --unity) CHECK_UNITY=1 ;;
    --targets)
      shift
      TARGETS="${1:-web}"
      ;;
    --help)
      echo "usage: ./scripts/check-prerequisites.sh [--unity] [--targets web,android,ios,macos]"
      exit 0
      ;;
    *)
      echo "[FAIL] unknown option: $1"
      exit 2
      ;;
  esac
  shift
done

install_help() {
  echo ""
  echo "Node.js/npm setup:"
  echo "  1. Recommended: install Node.js 24 LTS for macOS from $NODE_DOWNLOAD_URL"
  echo "  2. If Homebrew is already installed: brew install node@24"
  echo "  3. Reopen Terminal, then run ./scripts/check-prerequisites.sh again."
  echo "BASS does not install Node.js, npm, or Homebrew automatically."
}

OS_NAME="$(uname -s 2>/dev/null || echo unknown)"
CPU_ARCH="$(uname -m 2>/dev/null || echo unknown)"
if [ "$OS_NAME" = "Darwin" ]; then
  echo "[PASS] macOS ($CPU_ARCH)"
else
  echo "[FAIL] supported host is macOS; detected $OS_NAME ($CPU_ARCH)"
  FAILED=1
fi

if command -v git >/dev/null 2>&1; then
  echo "[PASS] Git: $(git --version 2>/dev/null)"
else
  echo "[FAIL] Git is missing. Install the Apple Command Line Tools with: xcode-select --install"
  FAILED=1
fi

NODE_OK=0
if command -v "$NODE_BIN" >/dev/null 2>&1; then
  NODE_VERSION="${BASS_NODE_VERSION_OVERRIDE:-$("$NODE_BIN" -p 'process.versions.node' 2>/dev/null || echo 0.0.0)}"
  NODE_MAJOR="$(echo "$NODE_VERSION" | cut -d. -f1)"
  case "$NODE_MAJOR" in
    ''|*[!0-9]*)
      echo "[FAIL] could not parse Node.js version: $NODE_VERSION"
      FAILED=1
      ;;
    *)
      if [ "$NODE_MAJOR" -ge 20 ]; then
        echo "[PASS] Node.js: v$NODE_VERSION"
        NODE_OK=1
      else
        echo "[FAIL] Node.js 20+ is required; detected v$NODE_VERSION"
        FAILED=1
      fi
      ;;
  esac
else
  echo "[FAIL] Node.js is missing."
  FAILED=1
fi

if command -v "$NPM_BIN" >/dev/null 2>&1; then
  echo "[PASS] npm: $("$NPM_BIN" --version 2>/dev/null)"
else
  echo "[FAIL] npm is missing."
  FAILED=1
fi

if [ "${BASS_SKIP_NETWORK_CHECK:-0}" = "1" ]; then
  echo "[SKIP] network check disabled by BASS_SKIP_NETWORK_CHECK"
elif command -v curl >/dev/null 2>&1 \
  && curl -IsS --max-time 8 "$NODE_DOWNLOAD_URL" >/dev/null 2>&1 \
  && curl -IsS --max-time 8 "https://registry.npmjs.org/" >/dev/null 2>&1; then
  echo "[PASS] network: nodejs.org and registry.npmjs.org reachable"
else
  echo "[FAIL] online setup requires access to nodejs.org and the npm registry."
  FAILED=1
fi

if [ "$CHECK_UNITY" -eq 1 ]; then
  UNITY_ROOT="/Applications/Unity/Hub/Editor"
  if [ -d "$UNITY_ROOT" ] && find "$UNITY_ROOT" -mindepth 1 -maxdepth 1 -type d | grep -q .; then
    echo "[PASS] Unity Editor found"
    OLD_IFS="$IFS"
    IFS=","
    for target in $TARGETS; do
      case "$target" in
        web) module="WebGLSupport" ;;
        android) module="AndroidPlayer" ;;
        ios) module="iOSSupport" ;;
        macos) module="MacStandaloneSupport" ;;
        *)
          echo "[FAIL] unknown Unity target: $target"
          FAILED=1
          continue
          ;;
      esac
      if find "$UNITY_ROOT" -path "*/PlaybackEngines/$module" -type d | grep -q .; then
        echo "[PASS] Unity module: $target ($module)"
      else
        echo "[WARN] Unity module not found: $target ($module) — target remains not-verified"
      fi
    done
    IFS="$OLD_IFS"
  else
    echo "[WARN] Unity Editor not found — Unity runtime remains not-verified"
  fi
fi

if [ "$NODE_OK" -ne 1 ] || ! command -v "$NPM_BIN" >/dev/null 2>&1; then
  install_help
fi

if [ "$FAILED" -ne 0 ]; then
  echo ""
  echo "Prerequisite check FAILED. Resolve the items above and rerun this command."
  exit 1
fi

echo ""
echo "Prerequisite check PASS."
echo "Next: npm ci && npm run build && npm run bass -- init --preset nan2026"

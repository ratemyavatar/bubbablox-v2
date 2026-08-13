#!/usr/bin/env bash
# RCCService launcher for Termux/Android.
#
# The repo's RCCService2020/RCCService.exe is a Windows x86 binary. If you
# drop a native Linux RCC binary here instead, this wrapper runs it - directly
# if it's aarch64, or via box64 if it's x86_64.
#
# The renderer (renderer/) spawns this script with:
#   run-rcc.sh -console -verbose -port <port>
#
# Usage:
#   1. Put your Linux RCC binary in this folder as "RCCService" (chmod +x)
#   2. If it's x86_64, install box64 (pkg install box64) - the wrapper uses it
#      automatically. If it's aarch64, it runs natively.
#   3. Set "rccexe": "run-rcc.sh" in renderer/config.json
#
set -e
DIR="$(cd "$(dirname "$0")" && pwd)"
RCC="$DIR/RCCService"

if [ ! -x "$RCC" ]; then
  echo "RCCService binary not found in $DIR" >&2
  exit 1
fi

ARCH="$(uname -m)"
if [ "$ARCH" = "aarch64" ] || [ "$ARCH" = "arm64" ]; then
  # x86_64 ELF needs box64; aarch64 ELF runs natively
  if head -c4 "$RCC" | od -An -tx1 | grep -q "7f 45 4c 46 02"; then
    # ELF64 - could be x86_64 or aarch64
    if file "$RCC" 2>/dev/null | grep -qi "aarch64"; then
      exec "$RCC" "$@"
    else
      exec box64 "$RCC" "$@"
    fi
  else
    exec box64 "$RCC" "$@"
  fi
else
  exec "$RCC" "$@"
fi

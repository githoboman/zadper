#!/usr/bin/env bash
set -euo pipefail

script_dir=$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)
binary=${X402_FACILITATOR_BINARY:-${script_dir}/bin/x402-facilitator}
checksum_file=${X402_FACILITATOR_CHECKSUM_FILE:-${script_dir}/x402-facilitator.sha256}

if [[ ! -f "$binary" || ! -x "$binary" ]]; then
  echo "facilitator binary is missing or not executable: $binary" >&2
  exit 64
fi
if [[ ! -f "$checksum_file" ]]; then
  echo "facilitator checksum file is missing: $checksum_file" >&2
  exit 64
fi

expected=$(awk 'NF >= 2 && $1 !~ /^#/ { print tolower($1); exit }' "$checksum_file")
if [[ ! "$expected" =~ ^[0-9a-f]{64}$ ]]; then
  echo "checksum file does not contain a SHA-256 digest" >&2
  exit 65
fi
actual=$(sha256sum "$binary" | awk '{print tolower($1)}')
if [[ "$actual" != "$expected" ]]; then
  echo "facilitator SHA-256 mismatch" >&2
  echo "expected: $expected" >&2
  echo "actual:   $actual" >&2
  exit 65
fi

printf 'facilitator binary: %s\n' "$binary"
printf 'facilitator sha256: %s\n' "$actual"
stat --printf='facilitator mode: %A\n' "$binary" 2>/dev/null || true

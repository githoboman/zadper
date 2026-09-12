#!/usr/bin/env bash
set -euo pipefail

binary=${X402_FACILITATOR_BINARY_PATH:-/usr/local/bin/x402-facilitator}
expected=${X402_FACILITATOR_SHA256:?X402_FACILITATOR_SHA256 must be set}
secret_key=${CASPER_SECRET_KEY_PATH:?CASPER_SECRET_KEY_PATH must point to the facilitator key}

if [[ ! -f "$binary" || ! -x "$binary" ]]; then
  echo "x402 facilitator binary is missing or not executable" >&2
  exit 64
fi
if [[ ! -r "$secret_key" ]]; then
  echo "x402 facilitator key is missing or unreadable" >&2
  exit 64
fi

actual=$(sha256sum "$binary" | awk '{print $1}')
if [[ "$actual" != "$expected" ]]; then
  echo "x402 facilitator SHA-256 mismatch" >&2
  exit 65
fi

# These defaults match the supplied Casper Testnet artifact.  The binary is
# deliberately kept outside the image: its checksum and source provenance are
# checked immediately before it is executed.
export CASPER_NETWORKS=${CASPER_NETWORKS:-casper:casper-test}
export SECRET_KEY_ALGO_CASPER_CASPER_TEST=${SECRET_KEY_ALGO_CASPER_CASPER_TEST:-secp256k1}
export RPCURL_CASPER_CASPER_TEST=${RPCURL_CASPER_CASPER_TEST:-${CASPER_RPC_URL:-https://node.testnet.casper.network/rpc}}
export PORT=${PORT:-4022}
export SECRET_KEY_PEM_CASPER_CASPER_TEST=$(<"$secret_key")

exec "$binary"

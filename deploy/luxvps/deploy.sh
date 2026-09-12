#!/usr/bin/env bash
set -euo pipefail

usage() {
  cat >&2 <<'USAGE'
Usage: deploy.sh [--execute] [--expected-commit SHA]
                 [--compose-env-file FILE] [--project-name NAME]

The default is a read-only plan.  --execute builds the pinned images, takes a
quiesced SQLite snapshot, recreates the four services, and runs only internal
health checks.  It never edits Caddy, copies secrets, or runs a paid quote.
USAGE
}

execute=0
script_dir=$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)
repo_root=$(cd -- "$script_dir/../.." && pwd)
compose_file=${AGENTPAY_COMPOSE_FILE:-"$script_dir/compose.yaml"}
compose_env_file=${AGENTPAY_COMPOSE_ENV_FILE:-/home/agentops/agentpay/runtime/compose.env}
expected_commit=${AGENTPAY_EXPECTED_COMMIT:-d1f99977b78a473b826b70023ca103c07261f982}
project_name=${AGENTPAY_COMPOSE_PROJECT:-agentpay}

while (($#)); do
  case "$1" in
    --execute) execute=1 ;;
    --expected-commit) shift; expected_commit=${1:?missing value for --expected-commit} ;;
    --compose-env-file) shift; compose_env_file=${1:?missing value for --compose-env-file} ;;
    --project-name) shift; project_name=${1:?missing value for --project-name} ;;
    -h|--help) usage; exit 0 ;;
    *) echo "unknown argument: $1" >&2; usage; exit 64 ;;
  esac
  shift
done

if [[ ! "$expected_commit" =~ ^[0-9a-fA-F]{40}$ ]]; then
  echo "expected commit must be a 40-character SHA" >&2
  exit 64
fi
if [[ ! -f "$compose_file" ]]; then
  echo "Compose file is missing: $compose_file" >&2
  exit 66
fi

branch=$(git -C "$repo_root" branch --show-current)
commit=$(git -C "$repo_root" rev-parse --verify HEAD)
if [[ "$branch" != "main" ]]; then
  echo "refusing deployment from branch '$branch' (expected main)" >&2
  exit 65
fi
if ! git -C "$repo_root" cat-file -e "$expected_commit^{commit}" 2>/dev/null \
  || ! git -C "$repo_root" merge-base --is-ancestor "$expected_commit" HEAD; then
  echo "refusing checkout that does not contain reviewed source: $expected_commit" >&2
  echo "current: $commit" >&2
  exit 65
fi
if ! git -C "$repo_root" diff --quiet || ! git -C "$repo_root" diff --cached --quiet; then
  echo "refusing deployment with a dirty worktree" >&2
  exit 65
fi

if [[ ! -f "$compose_env_file" ]]; then
  if ((execute)); then
    echo "Compose interpolation file is missing: $compose_env_file" >&2
    echo "Copy compose.env.example to this path and review it." >&2
    exit 66
  fi
  echo "DRY RUN: Compose interpolation file not found yet: $compose_env_file"
fi

compose=(docker compose --project-name "$project_name" -f "$compose_file")
if [[ -f "$compose_env_file" ]]; then
  compose=(docker compose --project-name "$project_name" --env-file "$compose_env_file" -f "$compose_file")
fi

compose_value() {
  local key=$1
  [[ -f "$compose_env_file" ]] || return 0
  awk -F= -v wanted="$key" '
    $1 == wanted { sub(/^[^=]*=/, ""); print; exit }
  ' "$compose_env_file"
}

state_dir=${AGENTPAY_STATE_DIR:-$(compose_value AGENTPAY_STATE_DIR)}
key_dir=${AGENTPAY_KEY_DIR:-$(compose_value AGENTPAY_KEY_DIR)}
facilitator_binary=${X402_FACILITATOR_BINARY:-$(compose_value X402_FACILITATOR_BINARY)}
casper_client=${CASPER_CLIENT_BINARY:-$(compose_value CASPER_CLIENT_BINARY)}
state_dir=${state_dir:-/home/agentops/agentpay/runtime/state}
key_dir=${key_dir:-/home/agentops/agentpay/runtime/keys}
facilitator_binary=${facilitator_binary:-/home/agentops/agentpay/runtime/bin/x402-facilitator}
casper_client=${casper_client:-/home/agentops/agentpay/runtime/bin/casper-client}
checksum_file=${X402_FACILITATOR_CHECKSUM_FILE:-$script_dir/x402-facilitator.sha256}
caddy_network=${CADDY_NETWORK:-public_proxy}

if (( ! execute )); then
  cat <<PLAN
DRY RUN: no images, services, database, or proxy configuration will change.
Source revision: $commit
Would verify these host inputs:
  state directory: $state_dir
  key directory:   $key_dir
  casper-client:   $casper_client
  facilitator:     $facilitator_binary
  Caddy network:    $caddy_network
Would run:
  $script_dir/verify-facilitator.sh
  ${compose[*]} config --quiet
  ${compose[*]} build --pull=false report-api mcp facilitator web
  $script_dir/snapshot-sqlite.sh --execute --compose-env-file $compose_env_file
  ${compose[*]} up -d --no-build report-api mcp facilitator web
  ${compose[*]} ps
Only in-container /health and /supported checks are planned; no paid quote or
production settlement check is included.
PLAN
  exit 0
fi

for required_dir in "$state_dir" "$key_dir"; do
  [[ -d "$required_dir" ]] || { echo "required directory is missing: $required_dir" >&2; exit 66; }
done
for required_file in "$casper_client" "$facilitator_binary" "$checksum_file"; do
  [[ -f "$required_file" ]] || { echo "required file is missing: $required_file" >&2; exit 66; }
done
[[ -x "$casper_client" ]] || { echo "casper-client is not executable: $casper_client" >&2; exit 66; }
[[ -x "$facilitator_binary" ]] || { echo "facilitator is not executable: $facilitator_binary" >&2; exit 66; }

X402_FACILITATOR_BINARY="$facilitator_binary" \
  X402_FACILITATOR_CHECKSUM_FILE="$checksum_file" \
  "$script_dir/verify-facilitator.sh"

"${compose[@]}" config --quiet
if ! docker network inspect "$caddy_network" >/dev/null 2>&1; then
  echo "required external Caddy network does not exist: $caddy_network" >&2
  exit 66
fi

"${compose[@]}" build --pull=false report-api mcp facilitator web
snapshot_args=(--execute --state-dir "$state_dir" --compose-file "$compose_file" --project-name "$project_name")
if [[ -f "$compose_env_file" ]]; then
  snapshot_args+=(--compose-env-file "$compose_env_file")
fi
"$script_dir/snapshot-sqlite.sh" "${snapshot_args[@]}"
"${compose[@]}" up -d --no-build report-api mcp facilitator web

"${compose[@]}" ps
for endpoint in \
  'http://127.0.0.1:4022/health' \
  'http://127.0.0.1:4021/health' \
  'http://127.0.0.1:3001/health'; do
  service=facilitator
  [[ "$endpoint" == *4021* ]] && service=report-api
  [[ "$endpoint" == *3001* ]] && service=mcp
  "${compose[@]}" exec -T "$service" node -e \
    "fetch('$endpoint').then(r => { if (!r.ok) process.exit(1) }).catch(() => process.exit(1))"
done
"${compose[@]}" exec -T facilitator node -e \
  "fetch('http://127.0.0.1:4022/supported').then(r => { if (!r.ok) process.exit(1) }).catch(() => process.exit(1))"
echo "AgentPay deployment completed for $commit; public routing remains a separate Caddy change."

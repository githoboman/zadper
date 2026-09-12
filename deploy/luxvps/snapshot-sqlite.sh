#!/usr/bin/env bash
set -euo pipefail

usage() {
  cat >&2 <<'USAGE'
Usage: snapshot-sqlite.sh [--execute] [--state-dir DIR] [--output FILE]
                         [--compose-file FILE] [--compose-env-file FILE]
                         [--project-name NAME]

The default is a dry run.  --execute stops only the currently running
report-api and mcp services, archives agentpay.sqlite plus any -wal/-shm
sidecars, and starts the same services again.
USAGE
}

execute=0
script_dir=$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)
state_dir=${AGENTPAY_STATE_DIR:-"$script_dir/state"}
output=${AGENTPAY_SQLITE_SNAPSHOT:-"$script_dir/snapshots/agentpay-sqlite-$(date -u +%Y%m%dT%H%M%SZ).tar.gz"}
compose_file=${AGENTPAY_COMPOSE_FILE:-"$script_dir/compose.yaml"}
compose_env_file=${AGENTPAY_COMPOSE_ENV_FILE:-/home/agentops/agentpay/runtime/compose.env}
project_name=${AGENTPAY_COMPOSE_PROJECT:-agentpay}

while (($#)); do
  case "$1" in
    --execute) execute=1 ;;
    --state-dir) shift; state_dir=${1:?missing value for --state-dir} ;;
    --output) shift; output=${1:?missing value for --output} ;;
    --compose-file) shift; compose_file=${1:?missing value for --compose-file} ;;
    --compose-env-file) shift; compose_env_file=${1:?missing value for --compose-env-file} ;;
    --project-name) shift; project_name=${1:?missing value for --project-name} ;;
    -h|--help) usage; exit 0 ;;
    *) echo "unknown argument: $1" >&2; usage; exit 64 ;;
  esac
  shift
done

if [[ ! -d "$state_dir" ]]; then
  if ((execute)); then
    echo "state directory does not exist: $state_dir" >&2
    exit 66
  fi
  echo "DRY RUN: would require state directory $state_dir"
fi
if [[ "$state_dir" == "/" || -z "$state_dir" || "$state_dir" == "." ]]; then
  echo "refusing an unsafe state directory: $state_dir" >&2
  exit 64
fi

compose=(docker compose --project-name "$project_name" -f "$compose_file")
if [[ -n "$compose_env_file" ]]; then
  compose=(docker compose --project-name "$project_name" --env-file "$compose_env_file" -f "$compose_file")
fi

if (( ! execute )); then
  cat <<PLAN
DRY RUN: no services or files will be changed.
Would quiesce report-api and mcp via:
  ${compose[*]} stop --timeout 30 report-api mcp
Would archive these exact files under:
  $state_dir/agentpay.sqlite
  $state_dir/agentpay.sqlite-wal (when present)
  $state_dir/agentpay.sqlite-shm (when present)
Would write a mode-0600 archive to:
  $output
PLAN
  exit 0
fi

if [[ ! -f "$state_dir/agentpay.sqlite" || -L "$state_dir/agentpay.sqlite" ]]; then
  echo "SQLite database is missing or is a symlink: $state_dir/agentpay.sqlite" >&2
  exit 66
fi
mkdir -p -- "$(dirname -- "$output")"
umask 077
stage=$(mktemp -d "${TMPDIR:-/tmp}/agentpay-snapshot.XXXXXX")
cleanup() { rm -rf -- "$stage"; }

mapfile -t running_services < <(
  "${compose[@]}" ps --services --status running 2>/dev/null |
    awk '$1 == "report-api" || $1 == "mcp" { print $1 }'
)
quiesced=0
restart_services() {
  local rc=$?
  if ((quiesced)) && ((${#running_services[@]})); then
    if ! "${compose[@]}" start "${running_services[@]}"; then
      echo "failed to restart previously running AgentPay services" >&2
      ((rc == 0)) && rc=1
    fi
  fi
  cleanup
  exit "$rc"
}
trap restart_services EXIT

if ((${#running_services[@]})); then
  quiesced=1
  "${compose[@]}" stop --timeout 30 "${running_services[@]}"
fi

cp --preserve=mode,timestamps -- "$state_dir/agentpay.sqlite" "$stage/agentpay.sqlite"
for sidecar in agentpay.sqlite-wal agentpay.sqlite-shm; do
  if [[ -f "$state_dir/$sidecar" && ! -L "$state_dir/$sidecar" ]]; then
    cp --preserve=mode,timestamps -- "$state_dir/$sidecar" "$stage/$sidecar"
  fi
done
(
  cd -- "$stage"
  sha256sum agentpay.sqlite agentpay.sqlite-wal agentpay.sqlite-shm 2>/dev/null > SHA256SUMS ||
    sha256sum agentpay.sqlite > SHA256SUMS
)
printf 'format=agentpay-sqlite-v1\ncreated_at=%s\n' "$(date -u +%Y-%m-%dT%H:%M:%SZ)" > "$stage/MANIFEST"
archive_tmp="$output.tmp.$$"
tar -czf "$archive_tmp" -C "$stage" MANIFEST SHA256SUMS agentpay.sqlite agentpay.sqlite-wal agentpay.sqlite-shm 2>/dev/null ||
  tar -czf "$archive_tmp" -C "$stage" MANIFEST SHA256SUMS agentpay.sqlite
chmod 0600 "$archive_tmp"
mv -f -- "$archive_tmp" "$output"
echo "SQLite snapshot written: $output"

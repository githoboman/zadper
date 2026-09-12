#!/usr/bin/env bash
set -euo pipefail

usage() {
  cat >&2 <<'USAGE'
Usage: restore-sqlite.sh --archive FILE --confirm-restore [--execute]
                         [--state-dir DIR] [--compose-file FILE]
                         [--compose-env-file FILE] [--project-name NAME]
                         [--state-owner UID:GID]

The default is a dry run.  A restore is intentionally refused unless both
--execute and --confirm-restore are supplied.  The existing database files
are copied into state/backups before replacement.
USAGE
}

execute=0
confirmed=0
script_dir=$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)
archive=${AGENTPAY_SQLITE_SNAPSHOT:-}
state_dir=${AGENTPAY_STATE_DIR:-"$script_dir/state"}
compose_file=${AGENTPAY_COMPOSE_FILE:-"$script_dir/compose.yaml"}
compose_env_file=${AGENTPAY_COMPOSE_ENV_FILE:-/home/agentops/agentpay/runtime/compose.env}
project_name=${AGENTPAY_COMPOSE_PROJECT:-agentpay}
state_owner=${AGENTPAY_STATE_OWNER:-}

while (($#)); do
  case "$1" in
    --execute) execute=1 ;;
    --confirm-restore) confirmed=1 ;;
    --archive) shift; archive=${1:?missing value for --archive} ;;
    --state-dir) shift; state_dir=${1:?missing value for --state-dir} ;;
    --compose-file) shift; compose_file=${1:?missing value for --compose-file} ;;
    --compose-env-file) shift; compose_env_file=${1:?missing value for --compose-env-file} ;;
    --project-name) shift; project_name=${1:?missing value for --project-name} ;;
    --state-owner) shift; state_owner=${1:?missing value for --state-owner} ;;
    -h|--help) usage; exit 0 ;;
    *) echo "unknown argument: $1" >&2; usage; exit 64 ;;
  esac
  shift
done

if [[ -z "$archive" ]]; then
  echo "--archive is required" >&2
  usage
  exit 64
fi
if [[ "$state_dir" == "/" || -z "$state_dir" || "$state_dir" == "." ]]; then
  echo "refusing an unsafe state directory: $state_dir" >&2
  exit 64
fi
if [[ ! -f "$archive" || -L "$archive" ]]; then
  echo "snapshot archive is missing or is a symlink: $archive" >&2
  exit 66
fi

compose=(docker compose --project-name "$project_name" -f "$compose_file")
if [[ -n "$compose_env_file" ]]; then
  compose=(docker compose --project-name "$project_name" --env-file "$compose_env_file" -f "$compose_file")
fi

if (( ! execute || ! confirmed )); then
  cat <<PLAN
DRY RUN: no services or files will be changed.
Would validate and restore this archive:
  $archive
Would quiesce only report-api and mcp, back up existing SQLite files under:
  $state_dir/backups/pre-restore-<UTC>
and replace agentpay.sqlite plus any archived -wal/-shm sidecars.
Would restart services that were running before the restore via:
  ${compose[*]} start report-api mcp
Pass both --execute and --confirm-restore to perform the restore.
PLAN
  exit 0
fi

if [[ ! -d "$state_dir" ]]; then
  mkdir -p -- "$state_dir"
fi
umask 077
stage=$(mktemp -d "${TMPDIR:-/tmp}/agentpay-restore.XXXXXX")
cleanup() { rm -rf -- "$stage"; }
trap cleanup EXIT

mapfile -t archive_entries < <(tar -tzf "$archive")
for entry in "${archive_entries[@]}"; do
  case "$entry" in
    MANIFEST|SHA256SUMS|agentpay.sqlite|agentpay.sqlite-wal|agentpay.sqlite-shm) ;;
    *) echo "snapshot contains an unexpected path: $entry" >&2; exit 65 ;;
  esac
done
for required in MANIFEST SHA256SUMS agentpay.sqlite; do
  if ! printf '%s\n' "${archive_entries[@]}" | grep -Fxq "$required"; then
    echo "snapshot is missing required entry: $required" >&2
    exit 65
  fi
done
tar -xzf "$archive" -C "$stage" --no-same-owner --no-same-permissions
for required in MANIFEST SHA256SUMS agentpay.sqlite; do
  [[ -f "$stage/$required" && ! -L "$stage/$required" ]] || {
    echo "snapshot entry is not a regular file: $required" >&2
    exit 65
  }
done
if ! grep -Fxq 'format=agentpay-sqlite-v1' "$stage/MANIFEST"; then
  echo "unsupported SQLite snapshot format" >&2
  exit 65
fi
if ! (cd -- "$stage" && sha256sum -c SHA256SUMS >/dev/null); then
  echo "snapshot checksum verification failed" >&2
  exit 65
fi
for sidecar in agentpay.sqlite-wal agentpay.sqlite-shm; do
  if [[ -e "$stage/$sidecar" && ! -f "$stage/$sidecar" ]]; then
    echo "snapshot sidecar is not a regular file: $sidecar" >&2
    exit 65
  fi
done

mapfile -t running_services < <(
  "${compose[@]}" ps --services --status running 2>/dev/null |
    awk '$1 == "report-api" || $1 == "mcp" { print $1 }'
)
quiesced=0
backup_dir="$state_dir/backups/pre-restore-$(date -u +%Y%m%dT%H%M%SZ)"
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

mkdir -p -- "$backup_dir"
for name in agentpay.sqlite agentpay.sqlite-wal agentpay.sqlite-shm; do
  source_file="$state_dir/$name"
  if [[ -e "$source_file" ]]; then
    [[ -f "$source_file" && ! -L "$source_file" ]] || {
      echo "refusing to touch non-regular state file: $source_file" >&2
      exit 65
    }
    cp --preserve=mode,timestamps -- "$source_file" "$backup_dir/$name"
  fi
done

install_file() {
  local name=$1
  local source_file="$stage/$name"
  local target_file="$state_dir/$name"
  [[ -f "$source_file" && ! -L "$source_file" ]] || return 0
  if [[ -e "$target_file" && -L "$target_file" ]]; then
    echo "refusing to replace symlink: $target_file" >&2
    exit 65
  fi
  local temporary="$state_dir/.${name}.restore.$$"
  cp --preserve=mode,timestamps -- "$source_file" "$temporary"
  mv -f -- "$temporary" "$target_file"
}
install_file agentpay.sqlite
for sidecar in agentpay.sqlite-wal agentpay.sqlite-shm; do
  if [[ -f "$stage/$sidecar" ]]; then
    install_file "$sidecar"
  else
    [[ ! -L "$state_dir/$sidecar" ]] || {
      echo "refusing to remove symlink: $state_dir/$sidecar" >&2
      exit 65
    }
    rm -f -- "$state_dir/$sidecar"
  fi
done
if [[ -n "$state_owner" ]]; then
  chown "$state_owner" "$state_dir/agentpay.sqlite" "$state_dir/agentpay.sqlite-wal" "$state_dir/agentpay.sqlite-shm" 2>/dev/null ||
    chown "$state_owner" "$state_dir/agentpay.sqlite"
fi
echo "SQLite restore complete; pre-restore backup: $backup_dir"

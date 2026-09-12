# AgentPay LuxVPS bundle

This bundle packages the reviewed AgentPay revision
`d1f99977b78a473b826b70023ca103c07261f982` with Node 22.23.1 and pnpm
11.3.0.  The runtime image contains the report API and MCP bridge; the web
image contains the built static bundle and a private Nginx gateway.  The x402
facilitator and `botchain-client` remain host-supplied, checksum-verified/read-only
mounts.

The report API, MCP bridge, and facilitator are separate containers but share
the facilitator network namespace.  This is intentional: the application
currently permits a plain HTTP facilitator URL only on loopback, so the report
API uses `http://127.0.0.1:4022` without publishing port 4022.  The facilitator
namespace is attached to the private `agentpay_internal` network and a separate
outbound network for chain/API access. Only the Nginx gateway joins both the
private network and the existing `public_proxy` network; no application or
facilitator port is published. The gateway serves the SPA and performs `/api`
and `/bridge` path stripping, rate limiting, and long upstream timeouts before
proxying to the private aliases.

## Host preparation

Run these steps on the AgentPay host, keeping the filled files outside Git:

```bash
runtime=/home/agentops/agentpay/runtime
install -d -m 0750 "$runtime"/state "$runtime"/keys "$runtime"/bin
cp deploy/luxvps/compose.env.example "$runtime"/compose.env
cp deploy/luxvps/agentpay.env.example "$runtime"/agentpay.env
chmod 0600 "$runtime"/agentpay.env "$runtime"/compose.env
```

Fill `/home/agentops/agentpay/runtime/agentpay.env` with the real Bot Chain, x402,
registry, and bearer-token
values.  Put distinct buyer, facilitator, and registry-recorder keys in
`/home/agentops/agentpay/runtime/keys` as `buyer-secret.pem`,
`facilitator-secret.pem` (the supplied `funded_secret_key.pem`),
`funded_public_key`, and `registry-recorder-secret.pem`.  Each key must be
readable by UID/GID 10001;
never paste a key into Compose YAML or this repository.  When the host account
cannot create numeric UID/GID 10001 files directly, use a one-off helper scoped
to this runtime directory:

```bash
docker run --rm --user 0:0 \
  -v /home/agentops/agentpay/runtime:/runtime \
  alpine:3.21 sh -c \
  'chown -R 10001:10001 /runtime/state /runtime/keys \
   && chmod 0700 /runtime/keys \
   && chmod 0600 /runtime/keys/* \
   && chmod 0755 /runtime/bin/*'
```

Leave `runtime/bin` owned by the deployment account so the host-side checksum
verifier can traverse it; the mounted binaries themselves are world-executable
but not writable by the container user.

Copy the exact externally built binaries to
`/home/agentops/agentpay/runtime/bin/botchain-client` and
`/home/agentops/agentpay/runtime/bin/x402-facilitator`, then verify the
facilitator before starting:

```bash
X402_FACILITATOR_BINARY=/home/agentops/agentpay/runtime/bin/x402-facilitator \
  deploy/luxvps/verify-facilitator.sh
```

The pinned digest is recorded in `x402-facilitator.sha256` for the
botchain-x402 commit `3ee705ecfff44795bd502b101991964ce4dc037d` (linux/amd64,
Go 1.26.5).  A changed binary must have new provenance and a deliberate
checksum update before deployment.

The external network named by `CADDY_NETWORK` (default `public_proxy`) must
already exist.  This bundle does not create or modify Caddy and does not copy
secrets between hosts.

## Build and start

Every mutating helper is dry-run by default.  Review the plan first:

```bash
deploy/luxvps/deploy.sh
```

The guarded execution performs a frozen-lockfile multi-stage build, verifies
the source commit and facilitator digest, takes a quiesced SQLite snapshot,
recreates the four services, and checks only private `/health` and
`/supported` endpoints:

```bash
deploy/luxvps/deploy.sh --execute
```

The build selectively copies tracked source trees, so root `.env` files, keys,
and unrelated output are not sent to the Docker daemon.  Runtime containers
run as UID/GID 10001 with a read-only root, dropped capabilities, a temporary
`/tmp`, and no-new-privileges.  SQLite is writable only through the explicit
`/var/lib/agentpay` bind mount.

## Caddy routing

Attach the Caddy container to the same external network and proxy the whole
host to the private Nginx gateway.  Nginx strips `/api` and `/bridge`, keys its
rate limits on Caddy's `X-Forwarded-For`, and preserves the existing API and
bridge timeout budgets:

```caddyfile
agentpay.timidan.xyz {
    reverse_proxy agentpay-web:8080 {
        transport http {
            response_header_timeout 240s
        }
    }
}
```

The gateway's API timeout is longer than the report settlement timeout (65
seconds), and its bridge timeout preserves the existing long-running tool
allowance.  Do not add a public route to `agentpay-facilitator:4022`.

## SQLite snapshots and restore

Snapshots stop only report-api and mcp, copy the main database together with
any `-wal`/`-shm` files, record SHA-256 checksums, and restart only services
that were running before the operation.  The default is a plan:

```bash
deploy/luxvps/snapshot-sqlite.sh
deploy/luxvps/snapshot-sqlite.sh --execute \
  --compose-env-file /home/agentops/agentpay/runtime/compose.env
```

Restore is more strongly guarded.  It validates an allow-listed archive,
checks every checksum, backs up the current three SQLite files under
`/home/agentops/agentpay/runtime/state/backups/pre-restore-<UTC>`, and requires both flags below:

```bash
deploy/luxvps/restore-sqlite.sh --archive /path/to/snapshot.tar.gz
deploy/luxvps/restore-sqlite.sh --execute --confirm-restore \
  --archive /path/to/snapshot.tar.gz \
  --compose-env-file /home/agentops/agentpay/runtime/compose.env \
  --state-owner 10001:10001
```

## Verification and rollback

After the guarded start, inspect the stack and private checks:

```bash
docker compose --env-file /home/agentops/agentpay/runtime/compose.env \
  -f deploy/luxvps/compose.yaml ps
docker compose --env-file /home/agentops/agentpay/runtime/compose.env \
  -f deploy/luxvps/compose.yaml exec -T report-api \
  node -e "fetch('http://127.0.0.1:4021/health').then(r => { if (!r.ok) process.exit(1) })"
curl -fsS https://agentpay.timidan.xyz/api/health
curl -fsS https://agentpay.timidan.xyz/bridge/health
curl -fsS -X POST https://agentpay.timidan.xyz/bridge/tools/payment_status \
  -H 'content-type: application/json' -d '{}'
```

Check `registry_status` only after the required Bot Chain client, keys, and
registry values are present.  Do not use a paid quote or settlement as a
deployment health check.

For rollback, keep the prior immutable image tag and Caddy configuration.  Set
`AGENTPAY_IMAGE`/`AGENTPAY_WEB_IMAGE` back to the prior tags and run
`docker compose up -d --no-build`; if state must be reverted, use the guarded
restore command above and its pre-restore backup.  Revert the Caddy snippet
separately.  Do not delete the state directory or remove the old image until
the replacement has passed its acceptance checks.

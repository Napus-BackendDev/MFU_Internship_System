# Production Deployment and Recovery Runbook

## 1. Status and authority

This runbook is an executable handoff template, not authorization to deploy. A named release owner must approve the change window, image digest, migration report, backup, rollback target, and traffic enablement. Never copy credentials from the legacy repository.

## 2. Required Production services

- TLS reverse proxy/load balancer routing the public web domain to loopback `8080` and the API path/domain to loopback `8081`.
- MongoDB replica set or managed cluster with TLS, least-privilege application/migration users, monitoring, PITR/backup, and tested restore.
- Redis with persistence, `maxmemory-policy=noeviction`, authentication/TLS, monitoring, and a dedicated namespace/instance.
- Private S3-compatible bucket with encryption, blocked public access, lifecycle/retention policy, scoped credentials, and CORS disabled unless explicitly needed.
- Approved SMTP provider/account with DKIM/SPF/DMARC, sender verification, rate limits, suppression handling, and non-Production separation.
- Approved MFU OIDC client, secret rotation, allowed callback/logout URLs, issuer metadata, and claim-to-role mapping.
- Container registry, secret manager, centralized logs/metrics/traces, alerting, and incident contacts.

## 3. Release preflight

Record every item in the release ticket:

1. Owner decisions in `AI_HANDOFF.md` resolved or explicitly excluded with risk acceptance.
2. `pnpm install --frozen-lockfile && pnpm verify` passes on the release commit.
3. OpenAPI, database/index changes, migration version, and image digests reviewed.
4. Secret, dependency, SAST, and container scans contain no unaccepted Critical/High finding.
5. Authorization negative/cross-scope suite, WCAG core flow, baseline load test, and PDF visual regression pass.
6. Current backup and isolated restore/reconciliation drill pass approved RPO/RTO.
7. UAT approval exists for Staff, Coordinator, Student, and Evaluator representatives.
8. Rollback image tag/digest and compatible database rollback/forward-fix plan are recorded.

## 4. Configuration

Use `.env.production` only as the variable inventory. Inject real values from the platform secret manager; do not write them into the repository, shell history, CI logs, Compose file, or release ticket.

Mandatory groups:

- remote `MONGODB_URI` and `REDIS_URL`;
- public HTTPS web/API/CORS values;
- independent random JWT secret and invitation pepper;
- complete OIDC issuer/client/callback values;
- SMTP credentials/sender and independent 64-hex-character `SMTP_SETTINGS_ENCRYPTION_KEY`;
- private S3 endpoint/bucket/credentials;
- approved immutable image references `API_IMAGE`, `WORKER_IMAGE`, and `WEB_IMAGE`, each in `repository@sha256:<64 lowercase hex>` form and injected by the release platform;
- `IMAGE_PREFIX` and `IMAGE_TAG` only for the separate optional local build manifest; never use its mutable tags as Production runtime references;
- optional loopback bind/port values for the approved reverse proxy.

Production transport requirements are enforced at startup: `MONGODB_URI` must use `mongodb+srv://` (TLS by default, but explicit `tls=false`/`ssl=false` and TLS certificate/hostname-validation bypass flags are rejected) or `mongodb://` with `tls=true` or `ssl=true`; `REDIS_URL` must use `rediss://`; `S3_ENDPOINT` must use `https://`. Public web/API URLs and OIDC issuer/callback URLs must use HTTPS and must not point to loopback. Every `CORS_ORIGINS` entry must be an exact HTTPS origin without a path or loopback host. Development may use local plaintext MongoDB/Redis, local HTTP object storage, and localhost CORS. The API and worker fail before serving if Production contains a placeholder, localhost dependency, unsupported service URL scheme, insecure MongoDB/Redis/S3 transport or certificate validation, insecure public/OIDC/CORS URL or cookie, capture mail mode, or incomplete credentials.

Environment SMTP remains the default. Production delivery uses implicit TLS when `secure=true`; when `secure=false`, the Worker requires STARTTLS and fails rather than downgrade to plaintext. A System Administrator may activate the encrypted database override from `/app/settings/smtp`; the password is write-only and encrypted with AES-256-GCM. Store the encryption key only in Secret Manager, inject the same value into API and Worker, back it up separately, and do not rotate it until existing SMTP ciphertext has been re-encrypted through an approved procedure. Test sending in Production is an external side effect and requires an approved recipient.

## 5. Build and stage

Production runtime Compose is digest-only and has no `build:` configuration. The protected `publish-images.yaml` workflow runs only by explicit dispatch from `main` with confirmation and the `production-images` environment. Configure that GitHub Environment to require approval by a separate release owner; protect `main` with required CI checks, reviewed changes, and restricted direct pushes before enabling the workflow. It runs the full quality gate, Gitleaks history scan and CodeQL analysis; publishes commit/run-tagged GHCR candidates with BuildKit max-level provenance and SBOM; scans each exact pushed digest for HIGH/CRITICAL vulnerabilities; then keylessly signs and verifies that digest with Cosign. A failed scan or signature step may leave an unsigned candidate in GHCR; it is not deployable and must not be copied into Production configuration. Review the per-image digest summary and retain the run and scan evidence with the release record.

The Production wrapper accepts only the three exact approved GHCR repositories and digest references. Before `pull` or `up`, it verifies each image signature against the pinned `publish-images.yaml` workflow identity on `main` and GitHub Actions OIDC issuer; any missing, mismatched, or unverifiable signature fails closed before Docker Compose runs. Install an approved Cosign `3.0.6`-compatible verifier on the operator host and authenticate Docker to GHCR with a read-only credential provisioned outside `.env.production`. `config` validates without registry access; `ps` only reads runtime state.

An approved operator may build local images with the separate manifest; this does not publish or authorize those images:

```bash
docker compose -f infrastructure/compose.production.build.yaml build --pull
```

Inject the three verified digest references from the approved workflow summary through the deployment environment. Validate them and the runtime Compose model without exposing resolved secrets:

```bash
node infrastructure/production-compose.mjs config
node infrastructure/production-compose.mjs pull
```

Use this wrapper for every Production runtime `config`, `pull`, `up`, and `ps` operation. It validates exact repository/digest references before invoking Compose, verifies signatures before `pull`/`up`, limits actions to the listed safe commands, forces quiet config rendering, and prevents builds during `up`. Do not substitute direct `docker compose` commands for runtime actions.

Never run plain `docker compose ... config` with Production environment values: Compose prints the fully resolved model, including interpolated secrets. `config --quiet` validates the model without printing it. If the platform requires configuration review, use an approved redaction-safe view and never persist or share raw rendered output. Record the verified image digests and provenance in the release record.

Run migrations/seed-like Production actions only through a separately approved, idempotent migration job. Never run `seed:development` against Production.

The audited report-export indexes use `REPORT_EXPORT_MIGRATION_URI`. The migration CLI verifies the connected database name against `--confirm-db=<exact-database>` and defaults to a read-only dry-run. In an approved isolated migration job, inspect the dry-run first:

```bash
pnpm --filter @internship/api migrate:report-export-indexes -- --confirm-db=your_exact_database_name
```

Only after the release owner approves the reviewed result, run the same command with `--apply`. Replace `your_exact_database_name` with the exact database name resolved from the protected migration URI. This task did not run the CLI or create indexes in any application database. Report-export snapshots and objects are retained for at most 24 hours; signed download URLs expire within 300 seconds. Keep the bucket private, encrypted, and lifecycle-managed; never expose bucket credentials or public object URLs.

System email template writes depend on unique indexes for template codes and template-version numbers. `GET /email-templates/system` is read-only and returns built-in content without creating records; invitation workflows create the published version transactionally on first use. Before enabling correspondence, run the `migrate:email-template-indexes` dry-run using `EMAIL_TEMPLATE_INDEX_MIGRATION_URI`; it blocks on duplicate or malformed legacy rows. Review and resolve the report before an approved apply:

```bash
pnpm --filter @internship/api migrate:email-template-indexes
pnpm --filter @internship/api migrate:email-template-indexes -- --apply --confirm-db=your_exact_database_name
```

The second command writes indexes only after exact database-name confirmation. This task did not run the migration against an application database.

## 6. Deploy

```bash
node infrastructure/production-compose.mjs up
node infrastructure/production-compose.mjs ps
```

Keep public traffic disabled until the following pass from the private network:

```bash
curl --fail --silent --show-error http://127.0.0.1:8081/api/v2/health/live
curl --fail --silent --show-error http://127.0.0.1:8081/api/v2/health/ready
curl --fail --silent --show-error http://127.0.0.1:8080/
node infrastructure/production-compose.mjs ps
```

The Worker exposes health only on container loopback port `8082`; Compose probes `/health/ready` and marks the service unhealthy unless MongoDB, Redis, and all email, document, and report-export consumers are ready. Do not publish this port externally. Confirm the Worker is `healthy` before enabling traffic. Confirm queued report exports recover after Worker restart and that expiry cleanup runs against the approved private bucket before enabling export traffic.

Before enabling staff or student OIDC login, provision the intended accounts and rehearse identity mapping on staging. A System Admin must map each account to the exact, case-sensitive `sub` obtained from the approved MFU identity administration process; the API binds it to the configured/discovered issuer and intentionally does not match by email. Enter a meaningful reason in User Manager and verify the `users.oidc_identity.linked` audit event and `oidcLinked` state. If a request outcome is uncertain, retry with the same idempotency key and identical subject/reason; do not change the payload or attempt to rebind. Existing accounts without an issuer-bound identity cannot authenticate until this mapping is complete. Reconcile the approved mapping inventory against staging results before production cutover; do not place raw subjects in tickets or general logs.

Before public traffic, verify browser security headers at the public TLS origin, including the edge/CDN response rather than only the container response. Validate the Content Security Policy against Nuxt SSR hydration and approved OIDC/API origins in staging with Report-Only first; enforce only after reviewing violations. Do not add `unsafe-inline` or `unsafe-eval` as a compatibility shortcut. HSTS and any subdomain/preload policy require an explicit TLS-topology review and rollback approval.

Then test through TLS:

- web security headers and login redirect;
- OIDC login/logout/refresh with approved test identities;
- one scoped read for every role and negative cross-scope attempts;
- invitation exchange and Draft save without sending to a real recipient unless approved;
- queue/worker health, test email, private PDF generation, and expiring download;
- dashboard counts and audit event visibility.

Enable traffic gradually using the platform's health-aware rollout. Watch readiness, 5xx/4xx changes, MongoDB/Redis saturation, queue lag/failures, SMTP errors, latency, and authentication failures.

## 7. Rollback

Rollback immediately when a stop condition is met: failed readiness, data corruption/loss risk, authorization bypass, credential exposure, incompatible migration, sustained error/latency breach, uncontrolled duplicate email/document effect, or an unaccepted Critical/High finding.

1. Disable or drain public traffic and pause campaign creation.
2. Preserve logs, request IDs, audit events, job states, and database evidence; do not delete failed records.
3. Inject all three digest references from the recorded compatible release, then run `node infrastructure/production-compose.mjs config`, `pull`, and `up` in that order.
4. Do not reverse a data migration unless its approved rollback was rehearsed. Prefer a compatible forward fix when rollback would destroy new data.
5. Re-run readiness and smoke checks before restoring traffic.
6. Open an incident, rotate any exposed credential, reconcile queued side effects, and document the decision/timeline.

## 8. Backup and restore

Back up MongoDB with a method consistent across the replica set and retain encryption/key access separately. Redis is a queue/recovery dependency, not the system of record; preserve AOF/config but reconcile business records in MongoDB after recovery. Protect S3 version/object metadata and retention policy.

A restore drill must use an isolated environment and verify:

- collection/document counts and required indexes;
- School/Program/Student/placement references;
- assignment/final-evaluation uniqueness and immutable versions;
- audit continuity and generated-document keys/checksums;
- queue reconciliation without duplicate email or PDF effects;
- measured RPO/RTO against approved targets.

Never restore Production PII into Development. Use approved anonymized fixtures.

## 9. Routine operations

- Daily: readiness, error rate, queue lag/failures, delivery suppression, storage and database capacity.
- Weekly: failed/retry reconciliation, audit anomalies, dependency/security alerts, backup success.
- Per release: restore sample, key/secret age, access review, image/package scan, index/query review.
- Scheduled: OIDC/JWT/SMTP/S3/database credential rotation and full disaster-recovery drill.

Retention, deletion, alert thresholds, escalation contacts, maintenance window, RPO, and RTO remain owner-controlled values and must be added to the protected operations system before go-live.

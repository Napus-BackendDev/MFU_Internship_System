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
- immutable `IMAGE_PREFIX` and `IMAGE_TAG`;
- optional loopback bind/port values for the approved reverse proxy.

The API and worker fail before serving if Production contains a placeholder, localhost dependency, insecure public URL/cookie, capture mail mode, or incomplete credentials.

Environment SMTP remains the default. A System Administrator may activate the encrypted database override from `/app/settings/smtp`; the password is write-only and encrypted with AES-256-GCM. Store the encryption key only in Secret Manager, inject the same value into API and Worker, back it up separately, and do not rotate it until existing SMTP ciphertext has been re-encrypted through an approved procedure. Test sending in Production is an external side effect and requires an approved recipient.

## 5. Build and stage

Prefer CI-built, signed, scanned images. If the approved platform builds with Compose:

```bash
docker compose --env-file .env.production -f infrastructure/compose.production.yaml build --pull
docker compose --env-file .env.production -f infrastructure/compose.production.yaml config
```

Inspect the rendered configuration in a protected environment. Confirm that secrets are not printed or persisted by the platform. Pin the resulting digests in the release record.

Run migrations/seed-like Production actions only through a separately approved, idempotent migration job. Never run `seed:development` against Production.

## 6. Deploy

```bash
docker compose --env-file .env.production -f infrastructure/compose.production.yaml up -d --no-build
docker compose --env-file .env.production -f infrastructure/compose.production.yaml ps
```

Keep public traffic disabled until the following pass from the private network:

```bash
curl --fail --silent --show-error http://127.0.0.1:8081/api/v2/health/live
curl --fail --silent --show-error http://127.0.0.1:8081/api/v2/health/ready
curl --fail --silent --show-error http://127.0.0.1:8080/
```

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
3. Repoint `IMAGE_TAG` to the recorded compatible release and run the same `up -d --no-build` command.
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

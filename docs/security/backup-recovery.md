# Backup and recovery procedure

Targets: 99.9% availability, recovery within four hours, and no more than one hour of data loss.

## Backup set

- PostgreSQL application database: encrypted hourly incremental/WAL plus daily full backup.
- Keycloak database: same recovery class as the application database.
- Tenant protocol/research files: encrypted versioned object/filesystem backup.
- Keycloak realm export, deployment configuration and migration hashes: after every approved change.
- Audit export: frequent append-only copy under a separately controlled account/key.

## Recovery test

1. Start the clock and provision an isolated clean environment.
2. Restore Keycloak DB, application DB and files to the same recovery point.
3. Apply only migrations recorded for that backup.
4. Validate Keycloak issuer/keys, tenant claims and MFA.
5. Run database consistency checks and HMAC audit-chain verification.
6. Run two-tenant positive/negative API tests and sample protocol downloads.
7. Measure recovery point and total recovery time.
8. Record gaps, owner and due date. A test exceeding one-hour RPO or four-hour RTO blocks release readiness.

Backups must be encrypted, access-logged, periodically restored, and retained according to GDPR plus grant/consortium obligations.

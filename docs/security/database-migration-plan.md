# Database migration plan

1. Take an encrypted database backup and test restoration in an isolated environment.
2. Create a least-privilege runtime role (recommended name `chemat_app`) that does not own tables and has no `BYPASSRLS`.
3. Apply `backend/migrations/001_secure_foundation.sql` with the migration-owner role.
4. Create consortium organisations and export their generated IDs for review.
5. Produce a signed mapping of every legacy test, category, protocol and link to its owning organisation.
6. Run a dry report: counts by source table, proposed organisation and unresolved reason.
7. Obtain data-owner approval. Backfill only approved mappings inside a transaction.
8. Run `backend/migrations/verify_rls.sql` as the application role for at least two test tenants.
9. Prove cross-tenant negative access at API and direct-SQL levels.
10. When unresolved counts are zero, apply `002_enforce_tenant_not_null.sql`.
11. Record migration hashes, operator, approver, timestamps and validation evidence.

Never default unknown records to Eurskem or the first organisation. Unknown data stays quarantined and invisible.

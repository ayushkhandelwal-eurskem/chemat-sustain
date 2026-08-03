# Secure-foundation release checklist

- [ ] Exposed SMTP credential revoked; provider activity reviewed.
- [ ] Git history cleanup approved and completed, or risk formally accepted pending cleanup.
- [ ] Keycloak image pinned by digest and scanned.
- [ ] Production secrets injected outside source control.
- [ ] `APP_ENV=production`, `AUTH_MODE=keycloak`, `ENABLE_LEGACY_API=false`, `ENABLE_AUTO_DDL=false`.
- [ ] User and machine tokens contain reviewed tenant, audience, roles and scopes.
- [ ] Legacy ownership mapping approved; no unresolved rows before NOT NULL migration.
- [ ] Runtime DB role is non-owner, no `BYPASSRLS`; RLS verification passes for two tenants.
- [ ] Positive and negative authorization paths pass.
- [ ] File traversal, symlink, type, size and malware checks pass.
- [ ] Secret, SAST, dependency, image and DAST gates pass; SBOM archived.
- [ ] Audit append, chain verification and immutable export tested.
- [ ] Gateway rate, body-size and timeout limits tested.
- [ ] Backup recovery demonstrates RPO ≤ 1 hour and RTO ≤ 4 hours.
- [ ] GDPR, grant and consortium controls reviewed by accountable owners.
- [ ] Manual penetration test completed; high/critical findings closed or formally excepted.
- [ ] Rollback owner, communication path and incident contacts confirmed.

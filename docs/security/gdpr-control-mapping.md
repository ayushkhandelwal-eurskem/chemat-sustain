# GDPR and consortium-control mapping

| Requirement | Control | Evidence |
|---|---|---|
| Lawfulness and purpose limitation | Phase 1 catalogue, explicit scope requests and justification | Access request + approval records |
| Data minimisation | Tenant isolation, field-limited list endpoints, least scopes | API inventory and role/scope matrix |
| Accuracy | Data-owner approval and reviewed ownership migration | Signed mapping and migration report |
| Storage limitation | Grant expiry, revocation and documented retention schedule | Grant/audit records |
| Integrity/confidentiality | MFA, short tokens, RLS, secure files, TLS expectation | Token/RLS/file tests |
| Accountability | HMAC-chained audit and independent approvals | Audit export and approval trail |
| Data subject rights | Organisation-level search/export/correction procedure | Operational ticket and audit record |
| Breach response | Incident runbook and credential rotation | Incident timeline and notification decision |
| Processor/subprocessor control | IONOS/Keycloak/Cloudflare inventory and DPA review | Approved vendor register |
| International transfer control | EU/EEA data-residency review | Hosting and backup evidence |

Grant and consortium agreements may impose stricter confidentiality, ownership, embargo and publication rules than GDPR. Encode those restrictions in data classification and scope decisions; do not assume GDPR compliance alone authorises consortium sharing.

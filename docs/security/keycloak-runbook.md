# Keycloak configuration runbook

1. Pin a reviewed Keycloak container digest; do not use `latest`.
2. Generate independent random values for Keycloak DB, bootstrap admin and provisioning service account.
3. Start `docker-compose.yml` plus `docker-compose.secure.yml` in an isolated environment.
4. Import `keycloak/realm-chemat-sustain.json` once; subsequent changes use reviewed realm configuration updates.
5. Create organisation groups or managed organisations. Set every user attribute `organisation_id` to the approved database organisation UUID.
6. Assign least-privilege realm roles. Initially, `ayush.khandelwal@eurskem.com` may hold platform/admin/owner/approver roles, but decisions remain separate.
7. Create confidential service client `chemat-provisioner`, enable its service account, grant only client query/manage and service-account user update permissions, and inject its secret outside Git.
8. Set `KEYCLOAK_ALLOWED_AZP=chemat-portal`. Machine clients are created only by the provisioner with the reserved `chemat-app-` prefix; keep `KEYCLOAK_MACHINE_AZP_PREFIX` aligned and restrict client-management permission to that service account.
9. Confirm MFA is required, direct grants are disabled, PKCE S256 is enforced, token lifetime is five minutes, redirect URIs are exact and wildcard origins are absent.
10. Test human and machine tokens: `iss`, `aud=chemat-api`, `azp`, `organisation_id`, roles and scopes.

The imported realm contains no users, working credentials or confidential client secrets.

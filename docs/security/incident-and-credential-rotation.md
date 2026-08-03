# Incident and credential-rotation procedure

## Exposed SMTP credential

1. Revoke the exposed app password at the email provider immediately.
2. Review provider sign-in and sending logs from the earliest Git exposure through revocation.
3. Record indicators, affected mailbox, possible recipients and evidence timestamps.
4. Create a new credential only if the legacy flow is still required; store it in the deployment secret mechanism, never Git.
5. Test delivery without logging OTPs or provider errors to clients.
6. Use a history-rewrite tool on a protected clone, coordinate with every contributor, force-push only with an approved recovery plan, and invalidate old clones/releases.
7. Re-run secret scanning against the full rewritten history.
8. Assess GDPR, grant and consortium notification duties and document the decision.

## OAuth client compromise

1. Identify client ID, tenant, scopes, last known legitimate use and token TTL.
2. Revoke the active grant and disable the Keycloak client.
3. Search audit/gateway logs by client ID, tenant and request correlation ID.
4. Preserve evidence; do not delete suspicious audit events.
5. Reapprove only after root cause and containment. Rotate credentials and increment the recorded credential version.

Never publish a real secret in an incident report or support ticket.

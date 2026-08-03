-- Interim partner API credentials, issued directly by an administrator.
--
-- Independent of the Keycloak flow in 001. That remains the target: developer
-- applications, an access request, three independent approvals, then a grant.
-- It is not usable yet - it needs the OIDC cutover and an approval UI - and
-- partners need access before that lands. This table is the bridge.
--
-- Safe to run on a live database: creates one new table, touches nothing else.

BEGIN;

CREATE TABLE IF NOT EXISTS api_clients (
    id                  varchar(36) PRIMARY KEY,
    client_id           varchar(64)  NOT NULL UNIQUE,
    -- bcrypt hash. The plaintext secret is shown once at issuance and is not
    -- recoverable; this column must never hold a reversible value.
    client_secret_hash  varchar(255) NOT NULL,
    name                varchar(160) NOT NULL,
    organisation_id     varchar(36)  REFERENCES organisations(id),
    -- The partner user this was issued for. ON DELETE SET NULL so removing a
    -- user does not delete the credential record and its audit history; the
    -- credential should be disabled explicitly at offboarding.
    user_id             integer      REFERENCES users(id) ON DELETE SET NULL,
    scopes              jsonb        NOT NULL DEFAULT '[]'::jsonb,
    is_active           boolean      NOT NULL DEFAULT TRUE,
    note                text         NOT NULL DEFAULT '',
    created_by          varchar(160) NOT NULL DEFAULT '',
    created_at          timestamptz  NOT NULL DEFAULT now(),
    last_used_at        timestamptz,
    secret_version      integer      NOT NULL DEFAULT 1
);

CREATE INDEX IF NOT EXISTS api_clients_client_id_idx      ON api_clients (client_id);
CREATE INDEX IF NOT EXISTS api_clients_organisation_idx   ON api_clients (organisation_id);
CREATE INDEX IF NOT EXISTS api_clients_user_idx           ON api_clients (user_id);

-- Row-level security is deliberately NOT enabled here.
--
-- Tenant tables carry rows belonging to one organisation, and RLS keeps tenants
-- apart. api_clients is administrative metadata about credentials, read during
-- authentication - before any tenant context exists to filter on. Enabling RLS
-- would make the lookup return nothing and every API key would fail to
-- authenticate. Access is restricted by GRANT instead.
--
-- The secret hash column is the sensitive part; treat SELECT on this table as
-- equivalent to reading the password table.

COMMIT;

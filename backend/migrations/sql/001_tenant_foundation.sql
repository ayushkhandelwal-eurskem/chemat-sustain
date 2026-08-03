-- ===========================================================================
-- 001_tenant_foundation.sql  (Phase 5)
--
-- Creates the tenant/portal tables, seeds the consortium organisations, and
-- creates the non-superuser application role that Row-Level Security depends
-- on. Purely additive: touches no existing data.
--
-- Idempotent (IF NOT EXISTS / ON CONFLICT DO NOTHING) - safe to re-run.
--
-- Run as a superuser (role creation and grants require it):
--   docker compose exec -T db psql -U "$POSTGRES_USER" -d "$POSTGRES_DB" \
--     -v ON_ERROR_STOP=1 -f 001_tenant_foundation.sql
--
-- AFTER running this, set the application role's password OUT OF BAND - it is
-- deliberately not in this file, and must not be committed anywhere:
--   ALTER ROLE chemat_app WITH PASSWORD '<generate: openssl rand -base64 24>';
-- then point the backend's DATABASE_URL at chemat_app.
-- See docs/security/tenant-isolation-design.md and deployment-readiness.md.
-- ===========================================================================

-- ---------------------------------------------------------------------------
-- Organisations: the tenant root.
--
-- `slug` is the canonical tenant key and MUST equal the Keycloak Organization
-- alias, because the access token's organisation_id claim carries that alias.
-- Same string end-to-end, no translation layer to drift.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS organisations (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    slug        TEXT NOT NULL UNIQUE,
    name        TEXT NOT NULL,
    acronym     TEXT,
    country     TEXT,
    is_partner  BOOLEAN NOT NULL DEFAULT TRUE,
    status      TEXT NOT NULL DEFAULT 'active'
                CHECK (status IN ('active', 'suspended')),
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- The 11 consortium partners (chematsustain.eu/partners/), plus a quarantine
-- tenant. `unassigned` deliberately has no members, so anything landing there
-- is unreachable by every partner - records are never guessed into a real
-- tenant.
INSERT INTO organisations (slug, name, acronym, country, is_partner) VALUES
    ('haw',        'University of Applied Sciences Hamburg',        'HAW',    'Germany',        TRUE),
    ('ulodz',      'University of Lodz',                           'ULODZ',  'Poland',         TRUE),
    ('eurskem',    'EURSKEM B.V.',                                 'EKE',    'Netherlands',    TRUE),
    ('tul',        'Lodz University of Technology',                'TUL',    'Poland',         TRUE),
    ('dtu',        'Technical University of Denmark',              'DTU',    'Denmark',        TRUE),
    ('unibo',      'Alma Mater Studiorum-Universita di Bologna',   'UNIBO',  'Italy',          TRUE),
    ('protoqsar',  'ProtoQSAR',                                    'PQSAR',  'Spain',          TRUE),
    ('uniurb',     'Universita degli studi di Urbino Carlo Bo',    'UNIURB', 'Italy',          TRUE),
    ('ivl',        'Swedish Environmental Research Institute',      'IVL',    'Sweden',         TRUE),
    ('awi',        'Alfred Wegener Institute',                     'AWI',    'Germany',        TRUE),
    ('mmu',        'Manchester Metropolitan University',            'MMU',    'United Kingdom', TRUE),
    ('unassigned', 'Unassigned (quarantine - no members, no access)', NULL,   NULL,             FALSE)
ON CONFLICT (slug) DO NOTHING;

-- ---------------------------------------------------------------------------
-- Identity linkage: Keycloak subject -> organisation (and to the legacy user
-- row during the cutover, so the two systems can be reconciled).
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS keycloak_identities (
    id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    keycloak_subject TEXT NOT NULL UNIQUE,
    organisation_id  UUID NOT NULL REFERENCES organisations (id),
    email            TEXT,
    legacy_user_id   INTEGER,
    created_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_keycloak_identities_org
    ON keycloak_identities (organisation_id);

CREATE TABLE IF NOT EXISTS organisation_memberships (
    id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organisation_id  UUID NOT NULL REFERENCES organisations (id),
    keycloak_subject TEXT NOT NULL,
    role             TEXT NOT NULL CHECK (role IN (
                         'platform_admin', 'api_owner', 'data_owner',
                         'security_approver', 'organisation_admin',
                         'researcher', 'developer', 'auditor')),
    granted_by       TEXT,
    granted_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
    revoked_at       TIMESTAMPTZ,
    UNIQUE (organisation_id, keycloak_subject, role)
);
CREATE INDEX IF NOT EXISTS idx_org_memberships_org
    ON organisation_memberships (organisation_id);

-- ---------------------------------------------------------------------------
-- API scopes. `requires_three_stage_approval` drives the API-owner ->
-- data-owner -> security-approver workflow for restricted data.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS api_scopes (
    scope          TEXT PRIMARY KEY,
    description    TEXT NOT NULL,
    classification TEXT NOT NULL DEFAULT 'restricted'
                   CHECK (classification IN ('public', 'internal', 'confidential',
                                             'restricted', 'highly_restricted')),
    requires_three_stage_approval BOOLEAN NOT NULL DEFAULT TRUE
);

-- All 327 existing tests are is_public = false, so every data scope is
-- treated as restricted and requires the full three-stage approval.
INSERT INTO api_scopes (scope, description, classification, requires_three_stage_approval) VALUES
    ('tests:read',                  'Read research test records',              'restricted', TRUE),
    ('experimental-data:read',       'Read raw/processed experimental data',    'restricted', TRUE),
    ('protocol-files:read',          'Read protocol/SOP metadata',             'confidential', TRUE),
    ('protocol-files:download',      'Download protocol/SOP file contents',    'restricted', TRUE),
    ('files:navigate',              'Browse the tenant file tree',             'confidential', TRUE),
    ('files:read',                  'Read file contents/metadata',             'restricted', TRUE),
    ('audit:read-own-organisation', 'Read own organisation audit history',     'internal',   FALSE)
ON CONFLICT (scope) DO NOTHING;

-- ---------------------------------------------------------------------------
-- OAuth client registry - the record of issued machine-to-machine credentials,
-- managed from the admin section (enable / disable / delete).
--
-- Every credential is bound to exactly ONE organisation: whoever holds the
-- secret acts as that organisation and sees exactly that organisation's data.
-- A secret must never be shared between organisations.
--
-- IMPORTANT: status='disabled' here does NOT by itself stop access - Keycloak
-- issues the tokens. Disabling must also be applied via the Keycloak Admin API
-- (authoritative), with the backend additionally checking this table per
-- request on the token's azp (defence in depth). See the design doc.
--
-- 'delete' from the admin UI maps to status='revoked', never a hard DELETE -
-- the row is retained so the audit trail survives.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS oauth_clients (
    id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    client_id          TEXT NOT NULL UNIQUE,
    organisation_id    UUID NOT NULL REFERENCES organisations (id),
    display_name       TEXT NOT NULL,
    description        TEXT,
    status             TEXT NOT NULL DEFAULT 'enabled'
                       CHECK (status IN ('enabled', 'disabled', 'revoked')),
    -- Hash only. The plaintext secret is shown once at issuance and never again.
    client_secret_hash TEXT,
    secret_issued_at   TIMESTAMPTZ,
    secret_expires_at  TIMESTAMPTZ,
    created_by         TEXT NOT NULL,
    created_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
    last_used_at       TIMESTAMPTZ,
    disabled_at        TIMESTAMPTZ,
    disabled_by        TEXT,
    disabled_reason    TEXT,
    revoked_at         TIMESTAMPTZ,
    revoked_by         TEXT,
    revoked_reason     TEXT
);
CREATE INDEX IF NOT EXISTS idx_oauth_clients_org    ON oauth_clients (organisation_id);
CREATE INDEX IF NOT EXISTS idx_oauth_clients_status ON oauth_clients (status);

-- ---------------------------------------------------------------------------
-- Access request + approval workflow.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS access_requests (
    id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organisation_id  UUID NOT NULL REFERENCES organisations (id),
    requested_by     TEXT NOT NULL,
    oauth_client_id  UUID REFERENCES oauth_clients (id),
    requested_scopes TEXT[] NOT NULL,
    justification    TEXT NOT NULL,
    status           TEXT NOT NULL DEFAULT 'pending'
                     CHECK (status IN ('pending', 'approved', 'rejected',
                                       'withdrawn', 'expired')),
    created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
    decided_at       TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS idx_access_requests_org
    ON access_requests (organisation_id);

-- One row per stage, so the same person holding api_owner + data_owner +
-- security_approver produces three separate, independently attributable
-- decisions rather than one collapsed "admin approved". role_used records
-- which role was exercised.
CREATE TABLE IF NOT EXISTS approval_decisions (
    id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    access_request_id UUID NOT NULL REFERENCES access_requests (id),
    stage             TEXT NOT NULL CHECK (stage IN ('api_owner', 'data_owner',
                                                     'security_approver')),
    actor_subject     TEXT NOT NULL,
    role_used         TEXT NOT NULL,
    decision          TEXT NOT NULL CHECK (decision IN ('approved', 'rejected',
                                              'scopes_reduced',
                                              'clarification_requested')),
    reason            TEXT NOT NULL,
    granted_scopes    TEXT[],
    decided_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (access_request_id, stage)
);

-- Separation of duties, enforced in the database rather than only in
-- application code: a requester can never approve their own request at any
-- stage, regardless of how many roles they hold.
CREATE OR REPLACE FUNCTION enforce_separation_of_duties()
RETURNS TRIGGER AS $$
DECLARE
    requester TEXT;
BEGIN
    SELECT requested_by INTO requester
      FROM access_requests WHERE id = NEW.access_request_id;
    IF requester IS NOT NULL AND requester = NEW.actor_subject THEN
        RAISE EXCEPTION
            'separation of duties violated: subject % cannot approve their own access request %',
            NEW.actor_subject, NEW.access_request_id;
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_separation_of_duties ON approval_decisions;
CREATE TRIGGER trg_separation_of_duties
    BEFORE INSERT OR UPDATE ON approval_decisions
    FOR EACH ROW EXECUTE FUNCTION enforce_separation_of_duties();

CREATE TABLE IF NOT EXISTS active_grants (
    id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organisation_id   UUID NOT NULL REFERENCES organisations (id),
    oauth_client_id   UUID REFERENCES oauth_clients (id),
    access_request_id UUID REFERENCES access_requests (id),
    scope             TEXT NOT NULL REFERENCES api_scopes (scope),
    granted_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
    expires_at        TIMESTAMPTZ,
    UNIQUE (oauth_client_id, scope)
);
CREATE INDEX IF NOT EXISTS idx_active_grants_org ON active_grants (organisation_id);

CREATE TABLE IF NOT EXISTS revocations (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    subject_type    TEXT NOT NULL CHECK (subject_type IN ('grant', 'oauth_client',
                                                          'membership')),
    subject_id      UUID NOT NULL,
    organisation_id UUID NOT NULL REFERENCES organisations (id),
    revoked_by      TEXT NOT NULL,
    reason          TEXT NOT NULL,
    revoked_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ---------------------------------------------------------------------------
-- Audit trail: append-only and tamper-evident.
--
-- Append-only is enforced by GRANT (no UPDATE/DELETE for chemat_app), not by
-- application convention. Tamper-evidence comes from a hash chain: each row's
-- entry_hash covers the previous row's hash, so removing or altering any row
-- breaks the chain detectably.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS audit_events (
    id              BIGSERIAL PRIMARY KEY,
    occurred_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
    actor_subject   TEXT,
    actor_role      TEXT,
    action          TEXT NOT NULL,
    target_type     TEXT,
    target_id       TEXT,
    organisation_id UUID REFERENCES organisations (id),
    result          TEXT NOT NULL CHECK (result IN ('success', 'denied', 'error')),
    correlation_id  TEXT,
    source_ip       INET,
    policy_decision TEXT,
    reason          TEXT,
    detail          JSONB,
    prev_hash       TEXT,
    entry_hash      TEXT
);
CREATE INDEX IF NOT EXISTS idx_audit_events_org  ON audit_events (organisation_id);
CREATE INDEX IF NOT EXISTS idx_audit_events_time ON audit_events (occurred_at);

-- Credentials and raw tokens must never be recorded. This is a coarse
-- backstop against the obvious mistakes; callers are still responsible for
-- not passing sensitive values in.
CREATE OR REPLACE FUNCTION audit_chain_and_guard()
RETURNS TRIGGER AS $$
DECLARE
    last_hash TEXT;
    payload   TEXT;
BEGIN
    IF NEW.detail IS NOT NULL THEN
        IF NEW.detail::text ~* '"(password|client_secret|otp_secret|access_token|refresh_token|authorization)"\s*:' THEN
            RAISE EXCEPTION 'audit_events.detail must not contain credential or token fields';
        END IF;
    END IF;

    SELECT entry_hash INTO last_hash
      FROM audit_events ORDER BY id DESC LIMIT 1;

    NEW.prev_hash := last_hash;
    payload := coalesce(last_hash, '') || '|' ||
               coalesce(NEW.occurred_at::text, '') || '|' ||
               coalesce(NEW.actor_subject, '') || '|' ||
               coalesce(NEW.actor_role, '') || '|' ||
               coalesce(NEW.action, '') || '|' ||
               coalesce(NEW.target_type, '') || '|' ||
               coalesce(NEW.target_id, '') || '|' ||
               coalesce(NEW.organisation_id::text, '') || '|' ||
               coalesce(NEW.result, '') || '|' ||
               coalesce(NEW.correlation_id, '') || '|' ||
               coalesce(NEW.detail::text, '');
    NEW.entry_hash := encode(sha256(convert_to(payload, 'UTF8')), 'hex');
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_audit_chain ON audit_events;
CREATE TRIGGER trg_audit_chain
    BEFORE INSERT ON audit_events
    FOR EACH ROW EXECUTE FUNCTION audit_chain_and_guard();

-- ---------------------------------------------------------------------------
-- Application role.
--
-- RLS is bypassed unconditionally by superusers and (unless FORCED) by the
-- table owner. The application therefore MUST NOT connect as `postgres`, which
-- is what it does today - see the design doc. This role is deliberately
-- NOSUPERUSER / NOBYPASSRLS and does not own the tables.
--
-- No password is set here on purpose: set it out of band after running this
-- file (see the header), so no credential ever lands in version control.
-- ---------------------------------------------------------------------------
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'chemat_app') THEN
        CREATE ROLE chemat_app LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE
                               NOINHERIT NOREPLICATION NOBYPASSRLS;
    ELSE
        ALTER ROLE chemat_app NOSUPERUSER NOCREATEDB NOCREATEROLE
                              NOREPLICATION NOBYPASSRLS;
    END IF;
END $$;

GRANT USAGE ON SCHEMA public TO chemat_app;

GRANT SELECT, INSERT, UPDATE, DELETE ON
    tests, users, sessions, protocols, protocol_tests,
    organisations, keycloak_identities, organisation_memberships,
    oauth_clients, access_requests, approval_decisions,
    active_grants, revocations
TO chemat_app;

-- Shared consortium taxonomy: readable by the app, writable only by admins
-- via a privileged connection.
GRANT SELECT ON categories TO chemat_app;
GRANT SELECT ON api_scopes TO chemat_app;

-- Append-only: INSERT and SELECT only. No UPDATE, no DELETE, at the grant
-- level - so tampering fails in the database even if application code is
-- compromised or buggy.
GRANT SELECT, INSERT ON audit_events TO chemat_app;
GRANT USAGE, SELECT ON SEQUENCE audit_events_id_seq TO chemat_app;

-- Existing integer-PK tables need their sequences too.
DO $$
DECLARE seq RECORD;
BEGIN
    FOR seq IN
        SELECT sequence_name FROM information_schema.sequences
        WHERE sequence_schema = 'public' AND sequence_name <> 'audit_events_id_seq'
    LOOP
        EXECUTE format('GRANT USAGE, SELECT ON SEQUENCE public.%I TO chemat_app', seq.sequence_name);
    END LOOP;
END $$;

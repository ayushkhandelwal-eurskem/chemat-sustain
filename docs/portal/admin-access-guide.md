# Admin guide: granting and revoking partner access

Audience: you, as platform administrator. Every step here is done in a web UI —
no SSH commands beyond opening the tunnel, no SQL, no API calls.

Companion document: [partner-getting-started.md](partner-getting-started.md) —
that one is written to be sent to the partner as-is.

---

## 0. What is live today, and what is not

Read this first. It determines which parts of this guide you can act on now.

| Capability | Status | Where |
|---|---|---|
| Create a person's account, set MFA, assign organisation and role | **Live** | Keycloak admin console |
| Enable / disable a person's access | **Live** | Keycloak admin console |
| Issue machine-to-machine credentials to a partner system | **Live** | Keycloak admin console |
| Partner-facing portal page (`/developer`) | **Not deployed** — returns 404 | needs the pending deploy |
| Token-protected data API (`/api/v1/tests`, `/protocols`, `/files`) | **Not deployed** — returns 404 | needs the pending deploy |
| Admin screen to approve requests / rotate / revoke API credentials | **No UI exists** | see [section 7](#7-what-has-no-ui-yet) |

Consequence worth being explicit about: **you can onboard a person today and
they can obtain a token, but there is no protected API for them to call yet.**
The public catalogue (`/api/tests/catalog`) and the website work; the partner
data API does not. Until the pending deploy happens, onboarding is useful for
getting accounts and MFA in place ahead of time, not for delivering data.

### There are currently two separate account systems

This will cause confusion if you do not know it up front.

| | Where accounts live | Used for |
|---|---|---|
| **Legacy** | `users` table in Postgres | the login form at `database.eurskem.com/login` |
| **Keycloak** | the `chematsustain` realm | everything in this guide |

The website's login page still authenticates against the **legacy** table. So a
person you create in Keycloak **cannot log in to the main website yet** — those
credentials will simply be rejected there.

What they *can* do today is use the Keycloak account console, which is publicly
reachable and is where they change their password and enrol MFA:

```
https://auth.eurskem.com/realms/chematsustain/account/
```

The two systems converge when the pending deploy switches the site's login to
OIDC. The 19 existing legacy users have not been migrated into Keycloak yet.
Until that happens, do not delete anyone's legacy account on the assumption their
Keycloak account replaces it.

---

## 1. Open the admin console

The admin console is deliberately **not reachable from the internet** — it is the
identity trust root, and whoever reaches it can mint credentials for any tenant.
It is reached over an SSH tunnel.

In a terminal, leave this running:

```
ssh -L 8081:127.0.0.1:8081 root@<server-ip>
```

Then in your browser:

```
http://localhost:8081/admin/master/console/
```

Log in as the admin user and complete the TOTP prompt.

Two things that will look like faults but are not:

- `https://auth.eurskem.com/admin/...` returns **403**. That is the block working.
- The URL is `http://localhost`, not https. Traffic is encrypted by SSH; the
  browser only sees the local end of the tunnel.

**Switch realm before doing anything.** Top-left realm selector → **chematsustain**.
The `master` realm holds only your own admin account. Creating a partner in
`master` would give them administrative rights over the whole identity server.

---

## 2. One-time per institution: create the organisation

Each partner institution is a tenant. The organisation is what scopes their data
access, so it must exist before any of their people do.

Currently only **eurskem** and **example-partner** exist. Every other partner
institution needs creating.

1. Left menu → **Organizations** → **Create organization**
2. **Name** — the institution's display name, e.g. `University of Lodz`
3. **Alias** — short lowercase identifier, e.g. `ulodz`
4. **Domain** — the institution's email domain, e.g. `uni.lodz.pl`
5. **Create**

The alias is what lands in the `organisation_id` token claim and what the
database's row-level security matches on. **Choose it carefully — treat it as
permanent.** Changing it later orphans that partner from their own rows.

Planned aliases from the consortium mapping: `tul`, `ulodz`, `eurskem`, `mmu`.

---

## 3. Give a person access

Left menu → **Users** → **Add user**.

**Step 1 — identity**

| Field | Value |
|---|---|
| Username | their work email address |
| Email | same |
| Email verified | **On** (you are vouching for them; there is no self-service email flow) |
| First / last name | fill in — these appear in the audit trail |

**Create**.

**Step 2 — a password they must immediately change**

**Credentials** tab → **Set password**.

- Enter a generated password — use your password manager's generator, never a
  pattern like `Welcome2026`.
- **Temporary: On.** This forces a change at first login, so the value you send
  them stops being valid the moment they use it.
- **Save**.

Send this password over a channel separate from the username — a password
manager share link, or a phone call. Not the same email that carries the link.

**Step 3 — require MFA**

**Details** tab → **Required user actions** → add **Configure OTP** → **Save**.

They cannot complete a login without enrolling an authenticator app. Do not skip
this — the account gives access to consortium research data.

**Step 4 — put them in their organisation**

**Organizations** → their institution → **Members** tab → **Add member** →
**Add existing user** → select them.

Skipping this is the single most common onboarding failure. Without membership
the token carries no `organisation_id`, and every data request they make will be
refused. It fails closed, which is correct, but it looks like a broken account.

**Step 5 — assign a role**

Back in **Users** → the user → **Role mapping** tab → **Assign role** → switch
the filter to **Filter by realm roles**.

| Role | Give it to | What it means |
|---|---|---|
| `researcher` | most partner scientists | Read their own organisation's data, plus everything publicly released |
| `developer` | partner technical staff | As `researcher`, plus registering applications for API credentials |
| `organisation_admin` | one trusted lead per institution | Manages their own institution's people only |
| `auditor` | reviewers, compliance | Read the audit trail; no data access |
| `platform_admin` | you only | Full administration |
| `api_owner` / `data_owner` / `security_approver` | approval duties | Separate approval roles — see the caution below |

Assign exactly one of the first four in normal onboarding. **Default to
`researcher`**; it is the least privilege that still lets someone do useful work.

> **Do not combine the approval roles on one account.** `api_owner`,
> `data_owner` and `security_approver` exist so that releasing data requires
> three independent decisions. Holding two of them on one login collapses that
> into one, which defeats the control — including for your own accounts, where
> the separation is a deliberate requirement.

---

## 4. Disable someone's access

This is the part to get right, because the obvious action alone is not sufficient.

### To block someone

**Users** → the user → **Details** → **Enabled** toggle **Off** → **Save**.

This stops all new logins immediately.

### Then also kill their live sessions

**Users** → the user → **Sessions** tab → **Sign out** (or **Logout all sessions**).

**Why both are needed.** Access tokens are self-contained bearer tokens. The API
validates them by signature, without calling back to Keycloak, so a token issued
one minute before you disabled the account stays valid until it expires. In this
realm:

| | |
|---|---|
| Access token lifespan | **5 minutes** |
| SSO session idle timeout | 30 minutes |
| SSO session max lifespan | 10 hours |

So disabling alone leaves **up to a 5-minute window** where an already-issued
token still works, and the refresh token keeps working for longer. Signing out
the sessions closes the refresh path; the 5 minutes is unavoidable and by
design. For a routine offboarding that is fine. **For a suspected compromise,
treat those 5 minutes as real** and do both steps, in this order.

### Choosing the right level

| Situation | Action |
|---|---|
| Left the project; keep the audit trail | Disable + sign out sessions. **Preferred.** |
| Suspected compromise | Disable + sign out, then reset password and re-require OTP |
| Wrong tenant assigned | **Organizations** → org → **Members** → remove |
| Too much privilege | **Role mapping** → select role → **Unassign** |
| GDPR erasure request | Delete the user — but see below |

**Prefer disabling to deleting.** Deleting removes the account that audit
records point at, which weakens your ability to reconstruct who did what. Under
GDPR, disabling is generally the correct response to a withdrawal of access;
deletion is for an actual erasure request, and the audit trail's lawful basis
should be checked before acting on one.

### To restore access

Set **Enabled** back to **On**. Roles and organisation membership survive
disabling, so access returns exactly as it was — which is also the reason to
review those two tabs before re-enabling anyone.

---

## 5. Machine-to-machine credentials

For a partner *system* that calls the API unattended, rather than a person.

Left menu → **Clients** → **Create client**.

1. **Client ID** — `partner-<alias>`, e.g. `partner-ulodz`
2. **Client authentication: On** (this makes it confidential; a public client
   cannot hold a secret safely)
3. **Authentication flow** — tick **Service accounts roles** only. Untick
   **Standard flow** and **Direct access grants**: a machine client needs
   neither, and leaving them on widens the credential's reach for no benefit.
4. **Save**

Then:

- **Credentials** tab → copy the client secret. Send it through a password
  manager, never email or chat.
- **Service accounts roles** tab → **Assign role** → give it `researcher`.
- **Organizations** → the institution → **Members** → add the client's service
  account user (`service-account-partner-<alias>`).

That last step is required and easy to miss — without it the client's token has
no `organisation_id` and every call fails.

**To disable a machine client:** **Clients** → the client → **Settings** →
**Enabled** off. To rotate instead, **Credentials** tab → **Regenerate** — which
invalidates the old secret immediately, so coordinate timing with the partner.

---

## 6. A note on the client secret

You will be able to re-read a client secret in the admin console. That is
Keycloak's behaviour, not the intended posture for this platform: the design
requires that a secret be shown once at issuance and stored only as a hash
afterwards. The portal's own credential system (`router_portal.py`) does hash
them — but it is not deployed, and it has no UI.

Practical implication for now: **treat the Keycloak client secret as the
sensitive long-lived credential it is.** Do not paste it into a ticket, a
document, or a chat message on the assumption it can be revoked cheaply later.

---

## 7. What has no UI yet

Being direct, so you do not go looking for buttons that are not there.

The backend for the approval and credential workflow exists — endpoints for
access requests, three-role approvals, credential rotation, grant revocation and
the audit trail are all written in `backend/api/router_portal.py`. **The
`/developer` page only wires up four of the ten.** There is no screen for:

- approving or rejecting an access request
- rotating an application's credentials
- revoking a grant
- viewing the audit trail
- creating or managing app users (`/backoffice/users` is a read-only list)

Two consequences:

1. Until the portal ships, **partner access is administered entirely in
   Keycloak** — which is what sections 1–5 describe, and which is sufficient for
   granting, enabling and disabling people.
2. The three-role approval workflow is **not yet enforceable through a UI**. If
   you need a data release approved before then, record the three approvals
   outside the system and note that the enforcement is pending.

To close this gap the pending work is: push and deploy the 5 outstanding
commits, then build the admin screens (Phase 8).

---

## 8. Onboarding checklist

Per person:

- [ ] Realm is **chematsustain**, not `master`
- [ ] Organisation exists for their institution
- [ ] User created; email verified set
- [ ] Temporary password set, sent separately from the username
- [ ] **Configure OTP** in required user actions
- [ ] Added as a **member of their organisation**
- [ ] Exactly one role assigned; approval roles not combined
- [ ] Partner sent [partner-getting-started.md](partner-getting-started.md)

Per offboarding:

- [ ] **Enabled** → Off
- [ ] Sessions signed out
- [ ] Disabled rather than deleted, unless erasure was requested

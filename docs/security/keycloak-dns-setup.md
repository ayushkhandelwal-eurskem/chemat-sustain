# Publishing Keycloak at auth.eurskem.com (Cloudflare)

Keycloak is already running in production; it is simply unreachable from outside because no DNS record points at it. This is the whole remaining task.

## Verified starting state

| Fact | Value | How it was checked |
|---|---|---|
| DNS provider | **Cloudflare** — `dean.ns.cloudflare.com`, `martha.ns.cloudflare.com` | `dig NS eurskem.com` |
| `database.eurskem.com` | `104.21.1.152`, `172.67.129.114` → Cloudflare, i.e. **proxied** | `dig +short`, `whois` → `CLOUDFLARENET` |
| Origin server | `217.154.65.136` | the IONOS host |
| Origin certificate | Cloudflare Origin CA, SANs `*.eurskem.com, eurskem.com`, valid to 2041 | `openssl x509 -noout -text` on the host |
| `auth.eurskem.com` | does not resolve | `dig +short auth.eurskem.com` |

No IONOS DNS changes are needed, and no new certificate is needed — the existing wildcard already covers `auth`.

---

## Step 1 — Add the DNS record

Cloudflare dashboard → select the **eurskem.com** zone → **DNS** → **Records** → **Add record**:

| Field | Value |
|---|---|
| Type | `A` |
| Name | `auth` |
| IPv4 address | `217.154.65.136` |
| Proxy status | **Proxied** (orange cloud) |
| TTL | Auto |

### Why "Proxied" is mandatory, not a preference

`/etc/ssl/certs/origin.pem` is a **Cloudflare Origin CA** certificate. Those are trusted *only* by Cloudflare's edge — they are not in any browser or OS trust store. So:

- **Proxied (orange):** browser → Cloudflare (publicly trusted edge cert) → origin (Origin CA cert, trusted by Cloudflare). Works.
- **DNS-only (grey):** browser → origin directly → browser sees the Origin CA cert and **rejects it**. Every user gets a certificate error, and every OIDC redirect fails.

This bites even though the certificate correctly covers `*.eurskem.com`; coverage is not the problem, trust is. `database.eurskem.com` is already proxied, so this just matches the existing pattern.

## Step 2 — Confirm the SSL/TLS mode

**SSL/TLS → Overview** → encryption mode should be **Full (strict)**.

This is almost certainly already correct, since `database.eurskem.com` works. Worth confirming because the failure mode is confusing: on **Flexible**, Cloudflare connects to the origin over plain HTTP on port 80, nginx answers with its `return 301 https://...` redirect, Cloudflare follows it back to itself, and you get an infinite redirect loop rather than an obvious error.

## Step 3 — Bypass cache for the auth hostname

**Rules → Cache Rules → Create rule**

- If: `Hostname` `equals` `auth.eurskem.com`
- Then: **Bypass cache**

OIDC flows carry single-use authorization codes plus `state` and `nonce` values. A cached authorization response served to a second user would be both a broken login and a genuine security problem. Cloudflare does not cache dynamic responses by default, so this is defence in depth rather than a fix for a known bug — but it is cheap and the downside of getting it wrong is severe.

## Step 4 — Verify

Once the record is added (Cloudflare is usually near-instant):

```bash
# 1. resolves, and to Cloudflare rather than the origin (confirms proxying)
dig +short auth.eurskem.com

# 2. TLS is publicly trusted - note NO -k flag; it must pass on its own
curl -sSI https://auth.eurskem.com/realms/chematsustain | head -1

# 3. the realm is actually served, and advertises https URLs
curl -s https://auth.eurskem.com/realms/chematsustain/.well-known/openid-configuration \
  | python3 -m json.tool | grep -E '"(issuer|authorization_endpoint|jwks_uri)"'
```

Expected from (3):

```
"issuer": "https://auth.eurskem.com/realms/chematsustain",
"authorization_endpoint": "https://auth.eurskem.com/realms/chematsustain/protocol/openid-connect/auth",
"jwks_uri": "https://auth.eurskem.com/realms/chematsustain/protocol/openid-connect/certs",
```

The `https://` scheme in those values is what `KC_HOSTNAME: https://auth.eurskem.com` and `KC_PROXY_HEADERS: xforwarded` produce; it was verified locally before deployment. If they come back as `http://` or as an internal hostname, the forwarded headers are not reaching Keycloak and the backend's issuer validation will reject every token.

## Step 5 — Restrict the admin console (recommended, not required for login)

`https://auth.eurskem.com/admin` is the identity trust root: whoever reaches it can mint roles and clients for every tenant. It should not be openly exposed.

Options, cheapest first:

1. **Cloudflare Access** (Zero Trust) policy on `auth.eurskem.com/admin*`, restricted to named accounts. Strongest, no origin changes.
2. **Cloudflare WAF custom rule:** block `/admin*` on that hostname unless the source IP is on an allowlist.
3. **nginx:** add a `location /admin` block with `allow`/`deny`. Note this must match on `CF-Connecting-IP` rather than `$remote_addr`, because behind Cloudflare every request appears to come from a Cloudflare IP.

Not done here — option 1 or 2 needs Cloudflare dashboard access, and option 3 changes production nginx, which after the 2026-08-03 outage I would rather not do in the same change as a DNS cutover.

## After DNS is live

Keycloak becomes reachable but nothing depends on it yet — the backend still authenticates via the legacy session path, so this step is non-breaking and reversible (delete the record to undo). The remaining sequence is in `deployment-readiness.md`: provision the 19 existing users into the realm, migrate the frontend to the PKCE flow, then switch the backend to OIDC enforcement behind a feature flag.

---

## Post-DNS verification (performed 2026-08-03)

| Check | Result |
|---|---|
| `dig +short auth.eurskem.com` | `172.67.129.114`, `104.21.1.152` — Cloudflare, proxied (matches `database.eurskem.com`, not the origin) |
| TLS without `-k` | `HTTP/2 200`; edge cert `CN=eurskem.com` from Google Trust Services (Cloudflare Universal SSL) — browser-trusted |
| OIDC discovery | `200`; issuer/authorization/token/jwks all `https://auth.eurskem.com/...` — forwarded headers are reaching Keycloak |
| HTTP → HTTPS | `301` |
| Issuer vs backend config | matches `KEYCLOAK_ISSUER_URL` already in the server's `.env` |
| PKCE | `S256` advertised |

### Deprecated flows — now blocked realm-wide

Discovery advertised `implicit`, `password` (ROPC) and `plain` PKCE, which the brief forbids. Those entries are Keycloak advertising *server capabilities* and cannot be removed from the discovery document, so enforcement is applied through a **client policy** instead:

- Profile `chematsustain-secure-flows` → executors `reject-implicit-grant`, `reject-ropc-grant`, `pkce-enforcer`
- Policy `chematsustain-enforce-secure-flows` → condition `any-client`

Deliberately a **minimal subset** of the built-in `oauth-2-1-*` profiles. Applying those wholesale was tested and would have broken production: `secure-redirect-uris-enforcer` (OAuth 2.1 forbids the wildcard redirect URIs `portal-frontend` uses), `dpop-bind-enforcer` (the frontend does not implement DPoP), and `secure-client-authenticator` (would force private-key JWT, breaking `m2m-test-client`'s secret auth). Those three remain valid future hardening, each requiring a client-side change first.

Verified by probe: clients created requesting `implicitFlowEnabled: true` and `directAccessGrantsEnabled: true` were **auto-corrected** to `false` with `pkce=S256`. Note the mechanism is correction, not rejection — arguably stronger, since it cannot be worked around, but it means the API returns `201` rather than an error. Probes deleted afterwards; `portal-frontend` and `m2m-test-client` confirmed unchanged.

Client policies apply on create/update, **not retroactively**, so `admin-cli` in this realm kept its password grant and was disabled explicitly. Admin access is unaffected: it authenticates against the `master` realm.

### ⚠️ Organisation membership is NOT carried by the realm export

The m2m token initially came back with **`organisation_id: null`**, which `security/auth.py` rejects with a 403 — so every partner API call would have failed.

Cause: the realm export recreates the *organisations* and the membership *mapper*, but **not the memberships themselves**. A fresh import therefore produces empty organisations, and the claim the entire tenant model depends on is silently absent. Fixed by adding the service account to `eurskem`; re-issued token now carries `organisation_id: "eurskem"`.

**This applies to every identity, and is the single easiest way to break partner access:**

```bash
# for each user or service account, after creating it:
POST /admin/realms/chematsustain/organizations/{organisationId}/members
Body: "{userId}"     # raw JSON string, not an object
```

When the 19 existing users are provisioned into Keycloak, each must be added to their organisation per the mapping in `tenant-isolation-design.md` (`tul` 10, `ulodz` 4, `eurskem` 4, `mmu` 1). A user without a membership authenticates successfully and then gets 403 on every request — which looks like a broken API rather than missing provisioning, so check this first when diagnosing.

### Still outstanding

The **admin console is publicly reachable** — `/admin/master/console/` returns `200` to the internet. It is login-gated, but it is the identity trust root, so brute-force attempts and any future Keycloak admin CVE are internet-facing. Restrict via Cloudflare Access or a WAF rule on `auth.eurskem.com/admin*` (dashboard access required).

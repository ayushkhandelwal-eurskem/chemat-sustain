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

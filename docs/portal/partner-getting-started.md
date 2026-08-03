# CheMatSustain — getting started

Welcome. This guide takes you from the account you have just been given to your
first authenticated request.

You should have received two things, through two different channels:

- your **username** (your work email address)
- a **temporary password**

If you only received one of them, stop and ask your CheMatSustain contact for the
other. They are sent separately on purpose.

---

## Before you start: what is available today

Being straightforward about this so you do not spend time debugging something
that is not yet switched on.

| | |
|---|---|
| Your account, login and MFA enrolment | **Available now** |
| Public research catalogue | **Available now** — no login needed |
| Authenticated data API for your organisation's records | **Not yet enabled** |
| Self-service developer portal | **Not yet enabled** |

So: **complete the account setup below now**, and your contact will confirm when
the data API opens. Getting MFA enrolled early means you are ready on day one
rather than doing it under time pressure.

Browse the public catalogue meanwhile: <https://database.eurskem.com>

---

## Step 1 — Set up your account

Go to:

```
https://auth.eurskem.com/realms/chematsustain/account/
```

Sign in with your username and temporary password.

> **Not the main website.** The login form at `database.eurskem.com/login` is the
> older system and will **not** accept these credentials — it is a separate,
> pre-existing set of accounts. Use the address above. Your contact will tell you
> when the main site switches over to this login.

You will be asked to do two things straight away.

**Set your own password.** The temporary one stops working immediately. Minimum
14 characters. Use a password manager and let it generate one — this account
reaches consortium research data, so please do not reuse a password from
elsewhere.

**Enrol an authenticator app.** You will see a QR code.

1. Install an authenticator if you do not have one — Google Authenticator, Microsoft
   Authenticator, Aegis, or your password manager's built-in TOTP feature.
2. Scan the QR code.
3. Enter the 6-digit code it shows.

> **Save your recovery option while the QR code is on screen.** Click
> "Unable to scan?" to reveal the setup key as text, and store that in your
> password manager. If you lose your phone without it, your access cannot be
> recovered — an administrator has to reset your enrolment, and you will be
> locked out until they do.

From now on every login needs your password plus a current 6-digit code.

---

## Step 2 — Know your access

Two things determine what you can see.

**Your organisation.** You belong to one partner institution. You can read your
own institution's records, plus anything the consortium has publicly released.
You cannot see another institution's unreleased data — this is enforced in the
database itself, not just in the interface.

**Your role.** Most people have `researcher` — read access to the above.
Technical staff may have `developer`, which additionally allows registering an
application for API credentials.

If something you expect to see is missing, it is more likely a permissions
question than a fault. Ask your contact rather than assuming data is absent.

---

## Step 3 — Programmatic access

*This section applies once your contact confirms the API is enabled.*

For an unattended system — a pipeline or scheduled job, rather than a person at a
browser — you will be issued a **client ID** and **client secret**.

**Exchange them for a token:**

```bash
curl -X POST https://auth.eurskem.com/realms/chematsustain/protocol/openid-connect/token \
  -d 'grant_type=client_credentials' \
  -d "client_id=$CHEMAT_CLIENT_ID" \
  -d "client_secret=$CHEMAT_CLIENT_SECRET"
```

**Use it:**

```bash
curl https://database.eurskem.com/api/v1/tests \
  -H "Authorization: Bearer $ACCESS_TOKEN"
```

Endpoints available to you:

| Endpoint | Returns |
|---|---|
| `GET /api/v1/tests` | Test records your organisation can read |
| `GET /api/v1/experimental-data/{test_id}` | Experimental data for one test |
| `GET /api/v1/protocols` | Protocol documents |
| `GET /api/v1/protocols/{id}/download` | A protocol file |
| `GET /api/v1/files` | File navigation |

**Tokens last 5 minutes.** Do not fetch one per request — cache it and refresh
when it expires. Equally, do not assume a cached token is still valid; handle a
`401` by fetching a new one and retrying once.

### Looking after the secret

- Keep it in an environment variable or a secret manager. Never in source code —
  and note that a secret committed to a repository must be treated as
  compromised even after the commit is removed, because the history retains it.
- Never send it over email or chat.
- It authenticates your whole institution's system, not one person. Anyone
  holding it can read your organisation's data.
- If it may have been exposed, **tell your contact immediately.** Rotating a
  secret takes minutes; an unreported exposure is a reportable data breach. You
  will not be blamed for reporting one.

---

## Troubleshooting

| Symptom | Cause | What to do |
|---|---|---|
| `404` on any `/api/v1/...` path | The API is not enabled yet | Expected today — check with your contact |
| `401 Unauthorized` | Token expired or missing | Fetch a fresh token; check the `Bearer ` prefix |
| `403 Forbidden` | Your role or organisation lacks access | Ask your contact — do not retry |
| `403` on `auth.eurskem.com/admin` | Administrative area, deliberately closed | Not for partner use; nothing is wrong |
| Empty results, no error | Working correctly, nothing visible to you | Confirm the data has been released to you |
| "Account is not fully set up" | MFA enrolment unfinished | Complete step 1 in a browser |
| "Invalid authenticator code" | Clock drift on your phone | Enable automatic time sync |
| Locked out after failed attempts | Brute-force protection | Wait, or ask your contact to unlock |

---

## Getting help

Contact: **ayush.khandelwal@eurskem.com**

Please include what you were doing, the endpoint, the HTTP status, and the
approximate time. **Never include your password, client secret, or a full access
token** in a message — a token fragment (first 10 characters) is enough to trace
a request.

Report anything that looks like a security problem straight away, including if
you suspect you caused it. Early reports are cheap to fix.

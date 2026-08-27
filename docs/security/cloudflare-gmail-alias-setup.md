# Recovered Cloudflare DNS + Google sender setup

This runbook restores CheMatSustain OTP delivery using the infrastructure that
previously sent successfully as `database@eurskem.com`.

## What the evidence proves

The Cloudflare zone and public DNS contain Google MX records, SPF authorization
for Google (`include:_spf.google.com`), and a Google Workspace DKIM key at
`google._domainkey.eurskem.com`.

A successfully delivered OTP from February 15, 2026 contains:

```text
Received: from [172.18.0.3] ([217.154.65.136])
  by smtp.gmail.com with ESMTPSA
Return-Path: <database@eurskem.com>
From: database@eurskem.com
SPF: PASS
```

The source code at the time logged in using `sender_email`, which was
`database@eurskem.com`. The working path was therefore:

```text
CheMatSustain backend on 217.154.65.136
  -> smtp.gmail.com:587 with STARTTLS
  -> authenticated as database@eurskem.com
  -> arbitrary OTP recipient
```

Cloudflare hosts DNS but does not send or receive these messages. Do not enable
Cloudflare Email Routing or replace the Google MX records.

## 1. Recover the Google identity

The historical Google credential was committed to Git and must be considered
compromised. Never retrieve or reuse it.

1. Sign in to Google as `database@eurskem.com`.
2. If sign-in is unavailable, ask the `eurskem.com` Google Workspace
   administrator to reset the account or confirm whether it became an alias.
   This cannot be repaired in Cloudflare DNS.
3. Enable 2-Step Verification for the account if required.
4. Create a new app password named `CheMatSustain production SMTP`.
5. Store it only in `/home/chematsustain/.env`. Do not place it in source
   control, documentation, shell history, tickets, or chat.

If `database@eurskem.com` is now only an alias, its owning Workspace user can be
used as `SMTP_USERNAME` only after that user can manually send as
`database@eurskem.com`. In that fallback case set
`SMTP_GMAIL_ALIAS_VERIFIED=true`. A personal `@gmail.com` login is less
desirable because some recipients may expose it as the underlying sender.

## 2. Configure production

Edit `/home/chematsustain/.env`:

```dotenv
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_SECURITY=starttls
SMTP_SENDER=database@eurskem.com
SMTP_USERNAME=database@eurskem.com
SMTP_PASSWORD=<new Google app password>
```

Confirm the settings without printing the password:

```bash
cd /home/chematsustain
grep -E '^SMTP_(HOST|PORT|SECURITY|SENDER|USERNAME)=' .env
grep -Eq '^SMTP_PASSWORD=.+$' .env && echo 'SMTP_PASSWORD is populated'
```

Deploy:

```bash
cd /home/chematsustain
git pull --ff-only origin main
bash scripts/deploy.sh
```

If delivery fails, inspect only filtered logs:

```bash
docker compose logs --tail=300 backend 2>&1 \
  | grep -Ei 'SMTP|OTP delivery|authentication|BadCredentials|535|sender denied'
```

`535 BadCredentials` means Google rejected the login credential. It is not an
MX, SPF, DKIM, DMARC, Cloudflare proxy, or recipient problem.

## 3. Verify delivery

Request an OTP to an external mailbox and use **Show original** to confirm:

```text
From: database@eurskem.com
Return-Path: database@eurskem.com
SPF: PASS
DKIM: PASS
DMARC: PASS
```

Also confirm the `Received` chain shows authenticated submission through
`smtp.gmail.com` from the production server.

## 4. Repair domain authentication

The February sample passed SPF but failed DMARC because Google signed with the
fallback domain `eurskem-com.20230601.gappssmtp.com`, which did not align with
the visible `eurskem.com` From domain.

In Google Admin, open **Apps -> Google Workspace -> Gmail -> Authenticate
email**, select `eurskem.com`, and ensure DKIM authentication is started using
the selector published in Cloudflare (currently `google`). A new OTP should then
be signed with an aligned `eurskem.com` domain.

The Cloudflare zone also contains two TXT records at `_dmarc.eurskem.com`:

```text
v=DMARC1; p=none; pct=50;
v=DMARC1; p=none
```

Multiple DMARC records are invalid. After coordinating with all systems that
send as `eurskem.com`, replace them with exactly one monitoring record, for
example:

```text
v=DMARC1; p=none; pct=100
```

Verify aligned SPF or DKIM for all legitimate senders before progressing to
`p=quarantine` and then `p=reject`.

## Unrelated/stale DNS records

The zone contains Hostinger autoconfiguration and DKIM CNAME records, but no
Hostinger MX record and no Hostinger SPF authorization. They are not part of the
proven OTP path. Do not switch SMTP to Hostinger without confirming a mailbox
exists and correcting SPF/DKIM. Mail-related records should ordinarily be
DNS-only rather than Cloudflare-proxied.
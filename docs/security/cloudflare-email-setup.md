# Cloudflare outbound email setup

This runbook configures CheMatSustain login OTP and password-reset messages to
send as `database@eurskem.com` through Cloudflare Email Sending.

## Why the Gmail configuration cannot work

The production application previously authenticated to Gmail as
`ayush.us255@gmail.com`. Gmail does not allow that personal account to send as
an unrelated `@eurskem.com` identity, so it rewrites the visible sender. Setting
only `SMTP_SENDER=database@eurskem.com` cannot override the SMTP provider.

Cloudflare **Email Sending** is the outbound transactional service. Cloudflare
**Email Routing** is the separate inbound forwarding service. OTP delivery to
arbitrary application users requires the Workers Paid plan; Cloudflare includes
3,000 outbound messages per account each month and then charges according to
its current Email Service pricing.

## 1. Enable outbound sending for `eurskem.com`

1. Open the Cloudflare dashboard for the account that owns `eurskem.com`.
2. Ensure the account is on the Workers Paid plan. The Free plan can send only
   to verified destination addresses, not arbitrary login users.
3. Go to **Compute → Email Service → Email Sending**.
4. Select **Onboard Domain** and choose `eurskem.com`.
5. Review and approve the DNS records Cloudflare offers to create:
   - MX records on `cf-bounce.eurskem.com` for bounce handling;
   - SPF TXT on `cf-bounce.eurskem.com`;
   - DKIM TXT using the `cf-bounce._domainkey` selector;
   - DMARC TXT on `_dmarc.eurskem.com`.
6. Wait until Email Sending reports the domain as verified. Cloudflare states
   that this usually takes 5–15 minutes but can take up to 24 hours.

These sending records use the `cf-bounce` subdomain and can coexist with
Cloudflare Email Routing records used for incoming mail. Do not manually delete
existing root-domain MX records while onboarding Email Sending.

## 2. Create the SMTP token

Create an account-owned Cloudflare API token with only the
**Email Sending: Edit** permission. Account-owned is preferred over a personal
user token so OTP delivery does not depend on an employee account.

Treat this token as a production secret. Never paste it into source code,
documentation, shell history, tickets, or chat.

## 3. Update production

Edit `/home/chematsustain/.env` on the server:

```dotenv
SMTP_HOST=smtp.mx.cloudflare.net
SMTP_PORT=465
SMTP_SECURITY=implicit_tls
SMTP_SENDER=database@eurskem.com
SMTP_USERNAME=api_token
SMTP_PASSWORD=<Cloudflare API token with Email Sending: Edit>
```

Cloudflare supports SMTP submission only with implicit TLS on port 465. It does
not support STARTTLS on port 587. The SMTP username must be the literal value
`api_token`; the API token itself goes in `SMTP_PASSWORD`.

Confirm the non-secret settings without printing the token:

```bash
cd /home/chematsustain
grep -E '^SMTP_(HOST|PORT|SECURITY|SENDER|USERNAME)=' .env
grep -Eq '^SMTP_PASSWORD=.+$' .env && echo 'SMTP_PASSWORD is set'
```

Expected output:

```text
SMTP_HOST=smtp.mx.cloudflare.net
SMTP_PORT=465
SMTP_SECURITY=implicit_tls
SMTP_SENDER=database@eurskem.com
SMTP_USERNAME=api_token
SMTP_PASSWORD is set
```

## 4. Deploy and verify

```bash
cd /home/chematsustain
git pull --ff-only origin main
sudo bash scripts/deploy.sh
```

The deployment now refuses to proceed when it detects the historical personal
Gmail configuration.

Request a login OTP, then verify:

1. The visible From address is `database@eurskem.com`.
2. The message headers show SPF, DKIM, and DMARC passing for `eurskem.com`.
3. Cloudflare **Email Service → Email Sending → Activity / Logs** shows the
   delivery and no sender-domain rejection.

Cloudflare returns `550 5.7.1 Sender denied` when `eurskem.com` has not been
onboarded in the same account as the API token. It returns `535 5.7.8` when the
username is not `api_token`, the token lacks Email Sending permission, or the
token is invalid.

## Official references

- <https://developers.cloudflare.com/email-service/get-started/send-emails/>
- <https://developers.cloudflare.com/email-service/api/send-emails/smtp/>
- <https://developers.cloudflare.com/email-service/configuration/domains/>
- <https://developers.cloudflare.com/email-service/platform/pricing/>
# Existing Cloudflare + Gmail sender setup

This setup reuses the existing Cloudflare account and Gmail mailbox so OTPs use
`database@eurskem.com` as the visible From address. It does not require
Cloudflare Email Sending or Workers Paid.

## Important limitations

- An A record controls website traffic only. The existing
  `database.eurskem.com` A record remains unchanged but cannot receive or send
  email.
- Cloudflare Email Routing handles incoming verification mail; Gmail handles
  outbound SMTP.
- Google states that Gmail support for third-party **Send mail as** addresses
  ends in January 2027. This is a temporary existing-services solution.
- Some receiving clients may show
  `database@eurskem.com on behalf of ayush.us255@gmail.com`.
- Personal Gmail cannot DKIM-sign as `eurskem.com`, so this has weaker domain
  authentication and deliverability than Cloudflare Email Sending or Google
  Workspace.

## 1. Create the receiving alias in Cloudflare

1. Keep the current `database.eurskem.com` A record exactly as it is.
2. In Cloudflare, go to **Compute → Email Service → Email Routing**.
3. Select **Onboard Domain** and choose `eurskem.com` if routing is not enabled.
4. Allow Cloudflare to add the proposed root-domain MX, SPF, and DKIM records.
   Review existing mail records carefully; enabling routing changes where
   incoming `@eurskem.com` messages are delivered.
5. Open **Destination Addresses** and add `ayush.us255@gmail.com`.
6. Open the verification email in Gmail and verify the destination.
7. Under `eurskem.com` → **Routing Rules**, create:
   - Custom address: `database@eurskem.com`
   - Action: Send to an email
   - Destination: `ayush.us255@gmail.com`
8. Send a test message from another account to `database@eurskem.com` and
   confirm that it reaches Gmail.

## 2. Verify the From alias in Gmail

1. In desktop Gmail, open **Settings → See all settings**.
2. Open **Accounts and Import**.
3. Under **Send mail as**, select **Add another email address**.
4. Enter the desired display name and `database@eurskem.com`.
5. Keep **Treat as an alias** enabled.
6. If Gmail requests SMTP details, use:
   - Server: `smtp.gmail.com`
   - Port: `587`
   - Username: `ayush.us255@gmail.com`
   - Password: the Gmail app password, not the normal account password
   - Secured connection using TLS
7. Gmail sends a confirmation to `database@eurskem.com`. Cloudflare routes it
   to the existing inbox. Open it and confirm the alias.
8. Back in **Send mail as**, confirm `database@eurskem.com` is listed as a
   verified address. Optionally make it the default From address.

Do not set `SMTP_GMAIL_ALIAS_VERIFIED=true` until this verification is complete.
Without it, Gmail rewrites or rejects the custom sender.

## 3. Configure production

Edit `/home/chematsustain/.env`:

```dotenv
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_SECURITY=starttls
SMTP_SENDER=database@eurskem.com
SMTP_USERNAME=ayush.us255@gmail.com
SMTP_PASSWORD=<existing Gmail app password>
SMTP_GMAIL_ALIAS_VERIFIED=true
```

Deploy:

```bash
cd /home/chematsustain
git pull --ff-only origin main
sudo bash scripts/deploy.sh
```

Request an OTP and inspect the actual message headers. The `From` header should
be `database@eurskem.com`; the underlying Gmail account may still appear in a
`Sender` header or as “on behalf of” in some clients.

## Official references

- Gmail Send mail as: <https://support.google.com/mail/answer/22370>
- Cloudflare Email Routing: <https://developers.cloudflare.com/email-service/get-started/route-emails/>
- Cloudflare routing addresses: <https://developers.cloudflare.com/email-service/configuration/email-routing-addresses/>
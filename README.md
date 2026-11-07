# Mayma Clocking — PHP + Supabase PostgreSQL

Member dashboard, race registration, barcode clocking, history, and provisional
results backed by **Supabase PostgreSQL**. PHP sessions and password hashes still
handle admin/member login; Supabase Auth is not used.

This remains a prototype: barcode/SMS receipt time is not independently verified
pigeon arrival. See [REVIEW.md](REVIEW.md) for remaining security findings.

## Hosting requirements

- PHP 8.1+ with PDO and `pdo_pgsql`, HTTPS, and a trusted CA bundle.
- A Supabase project and a server-side database password.
- PHP hosting is required. GitHub stores the source; GitHub Pages cannot execute
  PHP. Switching to Supabase does not turn this into a static GitHub Pages site.
- Node.js is only needed to run the optional PostgreSQL regression tests.

## Connect your Supabase project

Project: `ddwzrjvlatdbwaiagxhp` (API URL:
`https://ddwzrjvlatdbwaiagxhp.supabase.co`).

1. In that project's SQL Editor, run [schema.sql](schema.sql) as the database owner
   on a fresh database. It creates the eight application tables, indexes, update
   triggers and row-level security. It does not drop tables or import MySQL data.
2. In **Connect**, select the direct connection or **Session pooler**. For hosts
   without IPv6, use the Session pooler and copy its exact host and username.
   The pooler username is normally `postgres.<project-ref>`; do not invent a
   region/host. Use session mode because PHP uses prepared statements and
   transactions.
3. Set these **server environment variables** on your PHP host:

   | Variable | Direct connection value |
   | --- | --- |
   | `DB_HOST` | `db.ddwzrjvlatdbwaiagxhp.supabase.co` |
   | `DB_PORT` | `5432` |
   | `DB_NAME` | `postgres` |
   | `DB_USER` | `postgres` |
   | `DB_PASSWORD` | Your project's database password, entered privately |
   | `DB_SSLROOTCERT` | Path to your host's trusted CA bundle or the Supabase database CA |

   The connection enforces `sslmode=verify-full`. Install the correct trusted
   certificate if verification fails; do not disable TLS verification. Linux
   defaults to `/etc/ssl/certs/ca-certificates.crt`. For a pooler connection,
   replace the direct host/user/port with the values in **Connect**.
4. Restrict access to `setup.php` while creating the first administrator. Then
   disable public access to setup. Open `login.php` for admin login; issue member
   passwords through **Member Access**, then use `member_login.php`.
5. Keep SQL files, tests, Git metadata and local configuration inaccessible from
   the public web. Only the PHP host receives database credentials.

[.env.example](.env.example) lists the variables. PHP does **not** automatically
load `.env` files: configure the process environment using your hosting controls.
Never commit a real `.env` or put a database password in browser JavaScript.

`NEXT_PUBLIC_SUPABASE_URL` and the publishable key are intended for a JavaScript
client. They are not PostgreSQL credentials and are not used by this PHP server.
No Supabase service-role key is needed. RLS is enabled without browser access
policies; anonymous/authenticated API clients cannot read these application
tables. The server connects as the database owner, which bypasses RLS, so all
member authorization continues to be enforced in PHP.

## Existing installations

The old MySQL upgrade scripts are retained under `migrations/legacy_mysql/` for
reference only. **Do not run them in Supabase.** This version uses a fresh
PostgreSQL schema; it does not automatically migrate an existing MySQL database.
For existing production data, back it up and plan a separate transfer preserving
IDs, foreign keys, UTC timestamps and password hashes, then reset identity
sequences. Do not switch a populated installation until that transfer is tested.

## Development and validation

After setting the server environment and installing `pdo_pgsql`, a local-only
server can run with `php -S 127.0.0.1:8000 -t .`. For deployment, use HTTPS and a
production PHP web server; do not expose the development server publicly.

- PHP syntax: `find . -path ./node_modules -prune -o -name '*.php' -exec php -l {} \;`
- Database regression tests: `npm ci && npm test`.

Tests use PGlite's embedded PostgreSQL engine and SQL extracted from application
files. They exercise schema installation/repeatability, member ownership and
case-sensitive barcodes, receipt IDs, duplicate clocks/SMS, password upserts,
dashboard/history/results queries, update triggers, constraints and Data API
role restrictions. They do not establish live Supabase connectivity, PHP PDO
compatibility, camera behavior or SMS delivery; verify these on the PHP host.

## SMS setup (NOT ACTIVE until connected to a provider)

Rent or connect a **two-way SMS-capable phone number** with a provider or GSM modem gateway. The current project provides a secure **generic adapter**, not a built-in commercial provider connection; provider-specific webhook mapping and outgoing replies must be configured separately.

- Configure an environment variable named `SMS_WEBHOOK_SECRET` to a high-entropy string with **at least 32 characters**, kept outside web-accessible PHP files.
- Configure the provider/gateway to POST JSON to `https://YOUR-SITE/sms_webhook.php` with `Content-Type: application/json`.
- Required JSON object: `{"from":"+639123456789","text":"CLOCK 12 MyRaceCode","message_id":"provider-unique-message-id"}`.
- Gateway must sign the exact raw request body using HMAC SHA-256 with the shared secret. Add request header `X-Clock-Signature: sha256=<lowercase hex HMAC>`.
- The phone number must exactly correspond to the phone registered for that member in `members.php`, after common Philippine number normalization (`09...`, `+639...`, `639...`). Each SMS sender number should be used by **one member only**.
- Example SMS text (replace with real values): `CLOCK 12 ABC123XYZ` where **12 is the race ID**, not the member ID.
- A valid submission returns JSON `ok`, `message`, `receipt` to the gateway. **This is not an outgoing SMS to the member**. To send acknowledgments, configure your provider to convert this response into a reply, or add its send-SMS API later.
- SMS network delays are unavoidable: the application uses its **database server receipt time**, not the handset or claimed SMS sent time. All entries are provisional.

### Test webhook signature from a gateway service

Example Python HMAC computation for your integration test (run in your own secure gateway environment):

```python
import json, hmac, hashlib
raw = json.dumps({"from":"+639123456789","text":"CLOCK 12 ABC123XYZ","message_id":"test-001"}, separators=(',', ':')).encode()
secret = b"a-secret-of-at-least-32-random-characters"
signature = "sha256=" + hmac.new(secret, raw, hashlib.sha256).hexdigest()
# POST the raw bytes with X-Clock-Signature header set to signature
```

## Security and limitations

- The existing review's public bootstrap, login throttling, session revocation
  and concurrent entry-edit findings remain outstanding. The duplicate PHP tag
  in `clock.php` was corrected during this migration.
- All receipt timestamps are generated by PostgreSQL in UTC; display uses
  Asia/Manila. Barcodes are compared case-sensitively and remain private.
- SMS needs a real inbound provider and a high-entropy `SMS_WEBHOOK_SECRET`.
- Test authentication and race workflows before public deployment.

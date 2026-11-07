# v1.7 Member Dashboard update

After login, members land on `member_dashboard.php`, with tabs **Home**, **Clocking**, and **Clocking History**. The **Clocking** tab (`member_clock.php`) lets members select their open, registered race, **scan** a QR/barcode with a supported browser camera (HTTPS or localhost required), or **type** the exact code. Submit clocking to record a server-side provisional receipt. History lists clocking receipts. This uses the existing v1.6 member_auth and clocking service; **no new SQL migration** is required when upgrading from v1.6.

For earlier installations, apply your missing migrations in order before using this version. Continue to follow the v1.6 SMS integration documentation below. A live inbound SMS provider/number is still **not connected**; a signed generic SMS webhook exists but needs a configured provider.

---

# Pigeon Racing Clocking System — PHP v1.6 (Member Scan + SMS)

This is a **PHP/MySQL prototype**, not a certified electronic timing system. Member barcode submissions and SMS submissions record the server's receipt time, **not independently verified pigeon arrival**. Club officials must approve any competition use and verification rules.

## Existing workflow

1. Admin registers members and loft coordinates (DMS).
2. Admin creates race points (DMS) and a race schedule.
3. Admin registers each race entry with a ring number and a **race-specific barcode**.
4. Admin sets the race status to **Open**.
5. Members scan/enter barcodes on the member page or text the code to a gateway number.
6. The server logs the first valid receipt and provisional results use the stored distance / elapsed time.

## New version 1.6 features

- **Member Access** (`member_access.php`): admin issues/resets a member clocking password; only the hash is stored, password shown once. Share it privately.
- **Member login** (`member_login.php`): member ID + password.
- **Member scan page** (`member_clock.php`): selects an open race, uses the camera when the browser supports `BarcodeDetector`, or allows typing a code, and shows receipts. Chrome/Android with HTTPS is recommended; not all browsers support the built-in scanner.
- **Shared clocking service** (`clocking_service.php`): validates member, race status, release time, exact-case barcode; retains the first clock for a race entry and rejects duplicates.
- **Generic SMS gateway receiver** (`sms_webhook.php`): authenticated HMAC-signed JSON request for member-registered phone numbers. Requires a configured SMS number/provider that forwards inbound SMS.
- No physical RFID hardware is required.

## Upgrade existing v1.5 installation

1. **Back up** the database and application.
2. Replace application PHP/CSS files, preserving your configured `config.php`.
3. Import `migrations/005_member_clocking_sms.sql` **once**, after earlier migrations.
4. In the admin dashboard, use **Member Access** to issue passwords.
5. Ask members to open `https://YOUR-SITE/member_login.php` and sign in. Public HTTPS is essential for production and camera access.
6. Open a race schedule, then register race entries with unique barcodes and test the member scan page.

For a **fresh install**, import `schema.sql`, run `setup.php`, and create an admin.

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

- Barcodes are **race-specific secrets**. Do not publish, print on public results, or expose them to other members before release.
- Member password login has basic session-based attempt throttling. **Add a shared/IP-based rate limiter and MFA before a public, high-stakes deployment**.
- Never treat a scanned barcode as automatic physical arrival verification. A copied or exposed barcode can be submitted remotely. Club supervision and evidence are still needed.
- Never take the handset clock or SMS sent time as an authoritative race clock.
- SMS webhook requires a 32-character secret and signed messages. Do not remove signature verification.
- For high traffic, use a provider message-ID queue, monitoring, rate limits, and stronger audit logging.
- PHP syntax checks can be run with `php -l`. This environment did not have PDO MySQL installed, so database integration is not yet verified.

## Previous migrations

`002_race_points.sql`, `003_members_manager.sql`, `004_race_entries_manager.sql` are for upgrades from earlier releases; do not rerun them on a v1.5 database. Fresh installations only need `schema.sql`.

# Code review — uploaded v1.7 prototype

Reviewed 2026-11-07. Application files are preserved byte-for-byte from
`pigeon-clock-php-v1.7-member-dashboard.zip`, placed at the repository root.
Added this report and `.gitignore`; no application fixes are included.

## Findings

1. **High: initial administrator creation is public** — `setup.php:3-13`.
   Anyone who reaches a fresh installation can obtain their own CSRF token and
   create the first administrator. Checking for an existing admin and inserting
   are also separate operations, so concurrent requests can create multiple
   administrators. Restrict setup to an operator-only bootstrap command or a
   server-configured setup token, and enforce initialization atomically before
   exposing the application publicly.

2. **High: authentication lacks effective shared throttling** — `login.php:8-16`
   and `member_login.php:7-20`. Admin login has no attempt limiter. Member login
   stores its limiter only in the session, allowing a client to obtain a fresh
   session and keep guessing. Implement shared account/IP throttling with
   bounded lockouts and audit logging. The member limitation is already noted
   in the uploaded README.

3. **Medium: password reset does not revoke authenticated member sessions** —
   `member_access.php:13-14`, `member_clock.php:4-11`, and
   `member_history.php:4-7`. Resetting updates only the password hash; existing
   sessions retain their member ID and can continue clocking or reading history.
   Store an authentication version or issuance timestamp in the session and
   validate it on every protected member request so resets revoke prior access.

4. **Medium: clocked-entry edit protection has a race condition** —
   `race_entries.php:38-41`. The clock-count check and entry update do not share
   a transaction or row lock. A member can submit between those statements,
   after which an admin edit can change the member, race, ring or distance of an
   already clocked entry and alter the associated results/history. Lock the entry
   in a transaction using the same locking protocol as `clock_submission`, then
   check clock events and perform the update atomically.

5. **Low: duplicate opening tag emits literal text** — `clock.php:28` contains
   `<?php<?php`. PHP treats the first sequence as inline output because it lacks
   the whitespace needed after an opening tag, so this passes lint but emits
   stray `<?php` text. Replace it with one opening tag.

## Validation and limits

- Inspected all 21 PHP files, schema, migrations, stylesheet and documentation.
- PHP 8.5.12 CLI via WordPress Playground PHP-WASM: `-l` passed on all 21 PHP files.
  This validates parsing, not database behavior or production compatibility.
- Inspected for embedded credentials/private keys: none identified. Database
  defaults contain no password; configure a dedicated database user through the
  supported environment variables rather than using the default root account.
- No automated application test suite is supplied. MySQL integration, HTTP flows,
  concurrent submissions, camera scanning and live SMS delivery were not tested.
- The generic SMS adapter still requires a provider and server-side secret, as
  documented upstream. A signed request is not independent pigeon-arrival proof.

Resolve the high-priority findings and validate database and authentication
workflows before public deployment. This review is not a deployment approval.

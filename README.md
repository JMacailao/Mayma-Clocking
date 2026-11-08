# Mayma Clocking

A static club clocking app built with HTML, CSS, JavaScript and **Supabase only**
(Supabase Auth + PostgreSQL). People sign in with a **username and password**, never
an email address.

## How accounts work

- **Superadmin**: created once, on first run of a fresh database. The superadmin
  manages club accounts and the global barcode sticker registry. It cannot see any
  club's members or races.
- **Club administrator**: created by the superadmin with a club name, username and
  password. It manages its club's records and can create more administrators or staff.
- **Staff**: created by a club administrator. Staff can manage routine member, race,
  entry and clocking records, but cannot create or manage accounts.
- **Member**: created by the club account. Members see only their own records.

Every club-owned row carries a `club_id`, and Supabase row-level security enforces it,
so one club can never read, change or clock another club's data, even by editing
requests in the browser.

## Set up

1. Open your Supabase project (`utfxtwgqdbjkbxlooolr`) → **SQL Editor** and run, in order:
   1. `schema.sql` — **only for a brand-new database** (skip if you already ran it)
   2. `supabase-auth.sql` — skip if you already ran it
   3. `multi-club.sql` — adds clubs, `club_id`, roles and team-account management. Run
      it again after future SQL updates; it is safe to re-run.
   4. `account-credentials.sql` — lets club admins change same-club usernames and
      passwords. Run it after `multi-club.sql`; it is safe to re-run.
   5. `public-results.sql` — enables the public Results tab. Run it after the other
      scripts; it is safe to re-run after future result changes.
   6. `sticker-barcodes.sql` — enables global barcode registration, optional batch
      registration, and registered-barcode checks on race entries. Run it after
      `multi-club.sql`; it is safe to re-run. Re-run the updated file on existing
      databases to enable the register-or-skip choice in Generate Sticker.
   7. `race-release-time.sql` — allows schedules to be saved before their release time
      is known, while requiring a release time before a race can be opened. Run it
      for existing databases; it is safe to re-run.
2. Open the site. On a fresh database the login page asks you to **create the superadmin
   account** (username + password, 8+ characters). This screen appears only once.
   If you already had an administrator, that account becomes the superadmin.
3. As superadmin, open **Club accounts** and create a login for each club.
4. Each club administrator signs in, creates staff or additional administrators on
   **Team accounts**, then manages the club's members and races.
5. Publish with GitHub Pages: repository **Settings → Pages**, branch `main`, `/ (root)`.

No Supabase Auth settings need changing and no email is used. Supabase Auth needs an
email-shaped identifier internally, so the app uses `username@users.mayma.invalid`
behind the scenes. The superadmin resets club passwords; club administrators can
change usernames and passwords for their own member and team accounts.

The coordinate picker uses Google Maps JavaScript API in the browser. Restrict its
browser key to the deployed website referrer and the Maps JavaScript API only; the
static app must include that public browser key in `assets/js/app.js`.

Data that existed before clubs were introduced is kept in a club named **Default club**.
Create a club account with exactly that name to hand the old data to that club.

## Pages

- `index.html`: club portal landing page.
- `pages/login/index.html`: shared admin/member sign-in.
- `pages/superadmin/clubs/`: create and manage club accounts.
- `pages/superadmin/stickers/register/`: scan or enter existing barcode numbers in
  the global registry.
- `pages/superadmin/stickers/generate/`: generate unique barcode batches and choose
  whether to register them for club use immediately, then export a 20-per-A4 Word
  sheet or print it.
- `pages/admin/dashboard/`: club overview.
- `pages/admin/members/`: member and loft records, with `.xlsx`, `.xls`, and `.csv`
  import. The Excel template lists required columns; imports validate duplicates and
  coordinates before saving and do not create login accounts. The template uses
  latitude/longitude hemisphere, degrees, minutes, and seconds; decimal coordinate
  columns are also accepted.
- `pages/admin/users/`: create, edit credentials, disable and reactivate administrator or staff accounts.
- `pages/admin/race-points/`: release locations.
- `pages/admin/races/`: race schedules and status.
- `pages/admin/entries/`: registered pigeons and barcodes, with photo/PDF race-sheet
  OCR, barcode decoding, Excel template export/import, an editable review table, and
  checks for registered members and stickers. Photo/PDF scans and `.xlsx`, `.xls`, or
  `.csv` imports use the same review flow; invalid rows remain visible with their
  errors highlighted before saving.
- `pages/admin/clocking/`: admin receipts.
- `pages/admin/results/`: provisional leaderboard.
- `pages/member/dashboard/`: a member's open races.
- `pages/member/clocking/`: member barcode clocking and camera scan.
- `pages/member/history/`: that member's receipts.
- `pages/member/results/`: public club and date-filtered race results.
- `pages/member/settings/`: member profile and password settings.

## Important

- Row-level security scopes staff and administrators to their own club. Only an
  administrator can manage team accounts; members only see their own record, entries
  and receipts. Users cannot promote themselves. A club must keep one active admin.
- `submit_member_clock` and `admin_record_clock` check the member, barcode, race
  status and release time, then write a server timestamp.
- Generated sticker numbers can be registered in Supabase in the same transaction
  as batch creation or generated without registration. Registered barcodes are global
  and can be used by any club. Race entries reject numbers that are not registered by
  Super Admin. Existing entry barcodes are imported when `sticker-barcodes.sql` is
  first run.
- Clocking receipts are provisional evidence of server receipt time.
- The login page's public Results tab needs no account. It shows non-rejected result
  fields for a chosen club and Philippines-local race date; each club's other data
  remains protected by row-level security.
- Never put a service-role key in browser code.

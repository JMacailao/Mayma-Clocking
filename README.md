# AvilonX Clocking

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
      databases to enable the register-or-skip choice in Generate Sticker and
      scratch-off clocking codes.
   7. `race-release-time.sql` — allows schedules to be saved before their release time
      is known, while requiring a release time before a race can be opened. Run it
      for existing databases; it is safe to re-run.
   8. `race-schedule-dates.sql` — adds open and end dates to schedules. Run it for
      existing databases; it is safe to re-run.
   9. `nfc-tags.sql` — enables NFC tag clocking: race entries can store each pigeon's
      NFC tag ID instead of (or as well as) a sticker, and members clock by tapping
      the tag. Run it after `sticker-barcodes.sql`; it is safe to re-run.
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
- `pages/superadmin/stickers/register/`: scan or enter an existing sticker number and
  its hidden scratch code in the global registry.
- `pages/superadmin/nfc/`: register NFC tags in the global registry by tapping them
  on a USB NFC reader or Android phone.
- `pages/superadmin/stickers/generate/`: generate unique barcode batches and choose
  whether to register them for club use immediately, then export a Word sheet of 42 tickets per A4 page (two columns of 21; each ticket is 91 × 13 mm: a reference stub with a barcode of the sticker number for registering the race entry and, after a grey dashed line, one piece with a copy of the number joined to the secret barcode for clocking)
  sheet or print it.
- `pages/admin/dashboard/`: club overview.
- `pages/admin/members/`: member and loft records, with `.xlsx`, `.xls`, and `.csv`
  import. The Excel template lists required columns; imports validate duplicates and
  coordinates before saving and do not create login accounts. The template uses
  latitude/longitude hemisphere, degrees, minutes, and seconds; decimal coordinate
  columns are also accepted.
- `pages/admin/users/`: create, edit credentials, disable and reactivate administrator or staff accounts.
- `pages/admin/race-points/`: release locations.
- `pages/admin/races/`: race schedules, open/end dates, release time, and status.
- `pages/admin/entries/`: registered pigeons and barcodes, with photo/PDF race-sheet
  OCR for printed and handwritten IDs/rings, barcode decoding, Excel template
  export/import, an editable review table, and checks for registered members and
  stickers. Photo/PDF scans and `.xlsx`, `.xls`, or
  `.csv` imports use the same review flow; embedded barcode pictures in the `.xlsx`
  Barcode Number column are decoded into their rows. Invalid rows remain visible with
  their errors highlighted before saving.
- `pages/admin/clocking/`: admin receipts.
- `pages/admin/results/`: provisional leaderboard.
- `pages/member/dashboard/`: a member's open races.
- `pages/member/clocking/`: member clocking by tapping the pigeon's NFC tag (Android
  phone or USB NFC reader), or with the sticker's scratch code, typed or scanned with
  the camera.
- `pages/member/history/`: that member's receipts.
- `pages/member/results/`: public club and date-filtered race results.
- `pages/member/settings/`: member profile and password settings.

## Important

- Row-level security scopes staff and administrators to their own club. Only an
  administrator can manage team accounts; members only see their own record, entries
  and receipts. Users cannot promote themselves. A club must keep one active admin.
- `submit_member_clock` and `admin_record_clock` check the member, barcode, race
  status and release time, then write a server timestamp.
- **NFC tags.** The Super Admin first registers each tag on **Register NFC** (tap tags
  one after another on a USB reader); clubs cannot use unregistered tags. At basketing, the club taps each pigeon's NFC tag in **Race entries**
  to save its tag ID on the entry. When the pigeon arrives, the member taps the same
  tag on the **Clocking** page and the server records the time. Members do not need
  to choose a race unless the tag is entered in more than one open race. Tags work
  with Chrome on Android phones (Web NFC, HTTPS only) or with a USB NFC reader in
  keyboard mode on any device. Set USB readers to output the UID in **hex**, so they
  match what phones read. A tag's ID is not secret: anyone can read it with an NFC
  app and type it into the reader field, so NFC clocking proves less than it seems
  unless the club checks birds or uses cryptographic tags (for example NTAG 424 DNA).
- **ACS ACR122U and other PC/SC readers** do not type like a keyboard, so browsers
  cannot see them. On Windows, run `tools/nfc-reader/acr122u-keyboard.ps1`
  (right-click → **Run with PowerShell**, nothing to install) and keep its window
  open. It types each tapped tag's ID and Enter into the focused field. Every NFC
  reader field links to it.
- Each sticker has a visible number (for example `12345`) and a hidden scratch code
  (for example `4567`). Each code prints as two pieces: on the left a number piece (logo, label text and the sticker number) for registering the race entry, and on the right, after a solid divider line, a barcode piece (barcode of the secret code with the decoded secret code underneath) for clocking. Keep the barcode piece hidden until clocking. Cover that box
  with scratch-off foil before handing stickers out. Race entries use the visible
  number; members clock with the scratch code, and the server maps it back to the
  sticker number. A sticker with a scratch code cannot be clocked with its visible
  number. Scratch codes are never readable through the app or API, so print or export
  a generated batch before leaving the page. Older stickers without a scratch code
  still clock with their number; register the same number again with a scratch code
  to add one.
- **Sticker numbers.** Each new sticker gets an 8-digit reference number (a 6-digit
  serial that restarts each year, followed by the 2-digit year, e.g. `00012326`) and
  a random 6-digit secret code for clocking. The Super Admin can start a new season on **Register
  Sticker**, which archives the current stickers so they stop working (refused while
  any draft or open race still uses stickers).
  As a safeguard, a race entry is refused if its sticker clashes with
  another sticker the same member has in that race, and a member who enters 10 wrong
  codes in a race can no longer clock it (the club records the clocking instead).
  Stickers generated without registering are saved but inactive until registered.
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

## JavaScript structure

- `assets/js/app.js` handles startup, authentication checks, and page routing.
- `assets/js/shared.js` contains shared Supabase, formatting, and UI helpers.
- Each page's behavior lives beside its HTML in `page.js` and is loaded on demand. Race-entry scanning and imports are in `pages/admin/entries/page.js`.
- Shared admin member and race-point forms live in `pages/admin/crud.js`; public results are shared from `pages/results/public.js`.

## Install AvilonX on Android

After publishing the latest files over HTTPS, open the site in Chrome on Android.
Use **Install AvilonX** when Chrome offers installation, or Chrome's menu →
**Add to Home screen** → **Install** (wording depends on the Chrome version).
Launch AvilonX from its home-screen icon; it opens in a standalone window.
The manifest uses relative paths and works under the GitHub Pages repository path
as well as a custom domain. The repository does not need renaming.

Installation does not enable offline clocking. Authentication, records and clock
submissions still require internet access. The service worker caches only a public
offline notice, never credentials, API responses or clock submissions. If a page
cannot be reached, reconnect and press **Try again**. Existing open-page requests
continue to use their normal network error handling. Service worker updates take
effect after the old app windows are closed; they do not reload an active race.

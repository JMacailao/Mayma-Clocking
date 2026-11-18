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

**Quick way (recommended):** in the Supabase **SQL Editor** run `schema.sql` and
`supabase-auth.sql` once (brand-new database only), then run **`avilonx-update.sql`**.
That one file contains every other setup file below, in the right order, and is safe
to run again: run it after every AvilonX update. The Super Admin's **Setup checklist**
page shows which parts are done. (`avilonx-update.sql` is built from the separate
files by `tools/build-update-sql.sh`; rebuild it after changing any of them.)

The separate files, for reference:

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
  10. `rfid-devices.sql` — enables external ESP8266 + RC522 RFID readers. The
      Super Admin registers each reader by serial number for a club on **Register
      RFID reader**; unregistered readers are refused. Run it after `nfc-tags.sql`; it is safe to re-run.
  11. `entry-remarks.sql` — lets the club administrator build a list of remarks
      (**Entry remarks**) that appear as tick boxes when registering a pigeon on
      Race entries. The ticked remarks are shown after the ring number, for
      example `12345 P1/P2/P3`, on entries, clocking, results and public results.
      Safe to re-run; run it again after re-running `public-results.sql`.
  12. `bird-bonding.sql` — **Bird bonding**: before a bird can be entered in a race,
      the club admin or staff bonds it with its ring number, RFID tag, loft name,
      bird name, colour and a photo (stored in the private `pigeon-photos`
      Supabase Storage bucket this file creates). Race entries then choose one of
      the member's bonded birds by tapping the bird's bonded RFID tag (every
      bonded bird needs one); the ring and RFID come from the bond. Run it after
      `nfc-tags.sql`; safe to re-run.
  13. `show-up.sql` — **Show up**: after a pigeon is clocked, its owner brings it
      to the club and the admin or staff taps its RFID tag on the Show up page
      to verify the result. When the race is closed, a clocked pigeon that has
      not shown up is disqualified and left out of the results (Race schedules
      warns before closing). Run it after `nfc-tags.sql`, and run
      `entry-remarks.sql` again so public results leave out disqualified
      pigeons. Members get a pop-up with the result whenever one of their
      pigeons is clocked, including by their loft RFID reader.
  14. `rfid-tag-in-use.sql` — each RFID tag can be entered **once per race**, and a
      tag still active in another race (that race is not closed and the tag has
      not expired there) cannot be entered in a new race. Run it after
      `nfc-tags.sql`.
  15. `bird-ring-only.sql` — Bird bonding gets a **Ring number only (sticker)**
      tab: bond a bird without an RFID tag (ring, loft, name, colour, photo). It
      is entered on Race entries → **Sticker entries** (ring + sticker) and
      clocked with its sticker. Run it after `bird-bonding.sql`.
  16. `race-day.sql` — change history (who changed races, entries, clocks and
      birds, and when), practice races, instant result pop-ups (Supabase
      Realtime) and the Setup checklist. Run it last.
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
  whether to register them for club use immediately, then export or print an A4
  sheet, portrait by default or landscape. By default each sticker set is 6.3 × 0.5 cm
  (112 per A4 portrait, 152 landscape): a 2.85 cm reference stub and a 3.45 × 0.5 cm clocking label, each with a dashed
  box inside, the AvilonX mark, sticker number and barcode. Under **Show sticker size**,
  pick a preset (XS 0.5 × 6.3 cm up to XXL 2.54 × 12.7 cm), or choose a height and
  whole width, or custom left and right column widths, in cm;
  barcodes and text scale to fit, and sizes too small to scan are refused.
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
  the camera. After each clocking a pop-up shows the race, release point,
  release date and time, arrival time, flying time, distance and speed (m/min).
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
- **iPhone.** No iPhone browser can read NFC tags, so each tag can carry a web link
  to the member Clocking page with its ID. When **Register NFC** is used on an Android
  phone it writes that link onto each tag; otherwise use **Copy link** in the list and
  write it as a URL record with any NFC writer app. Members hold the top of an
  unlocked iPhone (XS or newer) to the tag and tap the notification; the page opens
  (after sign-in if needed) and clocks the pigeon. Keyboard-type USB NFC readers also
  work on iPhone and iPad through a USB-C or Lightning camera adapter. Every NFC page
  has a **Reader setup help** section with these steps.
- **Phones with an external reader.** Keyboard-type NFC readers (USB with an OTG,
  USB-C or Lightning camera adapter, or Bluetooth paired as a keyboard) work on
  Android and iPhone; the NFC pages listen for them anywhere on the page.
- **ACS ACR122U and other PC/SC readers** do not type like a keyboard, so browsers
  cannot see them. On Windows there are two helpers in `tools/nfc-reader/`
  (nothing to install; double-click the `.cmd` file so Windows does not block the
  script, and keep its window open):
  - **Start ACR122U for AvilonX.cmd** (recommended): nothing to register. It
    hands each tap to the AvilonX page open on the same computer (it listens only
    on 127.0.0.1, port 47321, for AvilonX pages), so it works whatever window is in
    front. On Race entries, Bird bonding and Show up choose **Wired**; the page shows
    "ACR122U helper connected". The first time, the browser asks to let the site
    access apps and devices on this computer: choose **Allow**. Admin Clocking and
    Register NFC use it too. The download is on RFID readers and Race entries.
  - **Start ACR122U keyboard helper.cmd**: types each tag's ID and Enter into the
    window in front (choose **Wired**). Click the browser page after starting it.
- **ESP8266 + RC522 RFID reader** (`tools/rfid-reader/avilonx-rfid-reader/`). The
  reader sends every tag over Wi-Fi straight to AvilonX, so no phone or computer is
  needed beside it. Upload the sketch, join the reader's Wi-Fi `RFID-READER`
  (password `RFID12345`; change it in the sketch), open `http://192.168.4.1` and copy
  its **Device serial**. The Super Admin registers that serial for the club on
  **Register RFID reader**, which gives a one-time device key; enter the key and the
  internet Wi-Fi on the reader's page. The Super Admin chooses the club first,
  then who uses the reader, and that decides what it does:
  - **Club admin**: the reader only **registers** pigeons. Each tap fills the RFID
    tag field on the open Race entries page (and is offered on Register NFC). It
    never clocks.
  - **A member**: the reader is that member's loft clock and only **clocks**, and
    only that member's own pigeons' RFID tags. It never registers.
  On Race entries, members with a loft clock are marked **RFID reader**; add
  their pigeons' RFID tag so the reader can clock them. Club admins see their
  readers on **Admin → RFID readers**.
- **Reader online status.** While it has internet, each reader sends AvilonX a
  short signal about every minute. **Admin → RFID readers** and **Register RFID
  reader** show each reader as **Online** (signal in the last 3 minutes, with any
  taps still waiting to send), **Offline** (last online time) or **Never
  connected**, refreshed every 30 seconds. Needs the latest `rfid-devices.sql`
  and reader sketch.
- **Three ways to clock one pigeon**: the member's loft RFID reader (uses the tap
  time, also offline), an Android phone (**Start phone NFC** on Clocking) and the
  sticker scratch code. The phone and sticker use the time they reach AvilonX.
  Whichever reaches AvilonX first is the pigeon's receipt; a later one is not
  used (a reader that was offline then shows "already clocked … with its
  sticker"). Race entries shows each pigeon's ways in **Clock with**.
- **Registering a pigeon's RFID tag** (Race entries) asks which reader is used:
  **Wireless** (ESP8266 Wi-Fi reader in register mode), **Wired** (USB reader) or
  **Android phone**; only that reader fills the tag field. The tag can **expire**
  after 1, 2, 3, 5, 7 or 14 days, or a custom number of days. After that it no
  longer clocks the pigeon by reader or phone (a reader tap saved offline before
  the expiry still counts); the sticker still works. Run the latest
  `nfc-tags.sql`, then `rfid-devices.sql`, for these.
  Without Wi-Fi or internet the reader saves taps in its flash (up to 150, kept
  through a power cut) and sends them when the internet is back. AvilonX then clocks
  each pigeon at the time its tag was tapped, using the reader's clock, which is set
  from the internet after power-up; power the reader on with internet before the
  race and keep it powered. Taps more than 3 days old, or from a reader clock that
  is ahead of the server, are not trusted. Receipts timed this way say
  **Reader tap time**.
  Add a **DS1302** clock module (CLK/DAT/RST pins, with a CR2032 coin cell) so
  tap times stay accurate even after the reader is switched off: DS1302 CLK → D3,
  DAT → D4, RST → D8, VCC → 3V3, GND → GND (the RC522 stays on D1/D2 and the
  reset button on D0). If the board sometimes fails to start, add 4.7 kΩ
  pull-ups from D3 and D4 to 3.3V. Power the reader on with internet once to
  set the DS1302; after that it keeps the time on its own and is corrected
  whenever the reader is online.
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

## Race day and everyday tools

- **Race day** (club admin): one screen per race with the release and closing
  timers, live arrivals, members' loft readers (with an alert when a reader is
  offline while its pigeons are still flying), show-ups still waiting, and buttons
  for **Big screen** (a full-screen leaderboard for the clubhouse TV), **Export
  Excel** and **Print / PDF**. Results can be exported from **Results** too.
- **Practice races**: tick *Practice race* on Race schedules to try readers and
  phones; practice races never appear in the public results.
- **Change history**: every change to race schedules, entries, clocks and bonded
  birds, with who made it and when.
- **Members**: results pop up the moment a pigeon is clocked (live), phone
  notifications can be turned on from the dashboard, reminders for show-ups and open
  races, and a **My pigeons** page (photo, ring, RFID, races, best speed).
- **Race entries**: tapping an RFID tag on Sticker entries switches to RFID entries
  by itself; the member's birds from their last race are one click away; a tag
  still active in another race is flagged before saving; Category, Race type and
  Pooling are under *More options*.
- **Bird bonding** shows bonded birds as a list; click a photo to see it full size.
- **English / Tagalog** switch in the menu.
- **Updates**: when a new version is published, a notice offers to reload it.
- **ACR122U on Windows**: in the helper zip, *Install AvilonX ACR122U helper* sets it
  to start with Windows; nothing to keep open.

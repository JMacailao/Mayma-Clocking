# How AvilonX is built

AvilonX is a static website (HTML, CSS and plain JavaScript modules, no build
step) served by GitHub Pages, with **Supabase** as the only backend: Supabase
Auth for accounts, PostgreSQL for the data and its rules, Storage for bird
photos and Realtime for live updates.

## Folders

| Folder | What is in it |
|---|---|
| `index.html`, `offline.html`, `sw.js`, `manifest.webmanifest` | Home page, offline notice, service worker and app manifest (installable app). |
| `assets/css/app.css` | All styles. |
| `assets/js/` | Code shared by every page (below). |
| `pages/<role>/<page>/` | One folder per page: `index.html` (the shell) and `page.js` (the page). Roles: `admin` (club admin and staff), `member`, `superadmin`. |
| `pages/login/` | Sign-in page with the public results. |
| `pages/results/public.js` | Public race results (login page and member Results). |
| `*.sql` | Database setup, one file per feature; `avilonx-update.sql` is all of them in one file. See [DATABASE.md](DATABASE.md). |
| `tools/rfid-reader/` | ESP8266 + RC522 loft reader sketch (Arduino). |
| `tools/nfc-reader/` | Windows helper for the ACS ACR122U USB reader, with installer. |
| `tools/build-update-sql.sh` | Builds `avilonx-update.sql` from the separate SQL files. |
| `tests/` | Automatic tests. See [TESTING.md](TESTING.md). |

## Shared code (`assets/js/`)

| File | Job |
|---|---|
| `app.js` | Sign-in check, the menu (sidebar and phone bar), page routing without full reloads, and the list of pages (`routes`). Every page's `index.html` loads it. |
| `supabase.js` | The Supabase client (publishable key; row-level security protects the data). |
| `shared.js` | Helpers: messages (toasts with sound), dates in Philippine time, numbers, tables, `ringLabel`, database error texts. |
| `nfc.js` | RFID/NFC: tag IDs, phone NFC (Web NFC), keyboard-type USB readers, the ACR122U helper, ESP8266 register-mode taps. |
| `race-export.js` | Race ranking (speed, show-up, disqualification) shared by Race day, Results and My pigeons, and the Excel export. |
| `member-results-watch.js` | Members: the result pop-up and phone notification when a pigeon is clocked (live, plus a check every 15 seconds). |
| `i18n.js` | English / Tagalog switch. |
| `update-check.js` | "AvilonX was updated" notice and a reload that fetches fresh files. |
| `device-session.js` | One device per account: this browser's device id, the question at sign-in, signing out when another device took over. |
| `pwa.js` | Install button and service worker registration. |

## Pages

Admin (`pages/admin/`):

| Page | Folder | Notes |
|---|---|---|
| Overview | `dashboard` | |
| Race day | `raceday` | Timers, live arrivals, reader alerts, show-ups, big screen, export, print. |
| Members, Race points | `members`, `race-points` | Both built by `crud.js`. |
| Bird bonding | `birds` | `page.js` (list and Bond a bird form) and `photos.js` (colours, private photo links, photo shrinking; also used by Race entries, Show up and My pigeons). |
| Races | `races` | Race schedules: release, dates, status, practice, RFID tag expiry. |
| Race entries | `entries` | Split by job, below. |
| Entry remarks, Clocking, Show up, RFID readers, Results, Change history, Team accounts | `remarks`, `clocking`, `showup`, `readers`, `results`, `history`, `users` | |
| Club settings | `settings` | Club administrator only: whether RFID entries need the sticker, and one device per account. |

Race entries (`pages/admin/entries/`):

| File | Job |
|---|---|
| `page.js` | The entry form: RFID entries and Sticker entries, readers, bonded birds, last-race birds, rules shown before saving. |
| `sheet-import.js` | The Scan race sheet and Import Excel tabs: preview with the found grid, camera with guide, review table with cell pictures, saving. |
| `sheet-reader.js` | Reading a photo or PDF: rotation, finding the loading form's table, **Align on guide** (the form's layout `FORM_GUIDE`, straightening the table from 4 corners, rows from the guide), reading handwriting cell by cell (Tesseract), decoding sticker barcodes (ZXing). |
| `sheet-parse.js` | Pure rules with no browser code: remarks (P1/P2/P3), member IDs, matching rings to bonded birds, sticker numbers. |
| `loading-form.js` | The **AvilonX loading form**: its layout (`FORM_LAYOUT`, shared by printing and reading) and the printable page (Print loading form). |
| `excel-import.js` | Reading Excel files, including barcode pictures inside cells. |
| `entry-helpers.js` | Small helpers: tag expiry, ways to clock, distance. |

Member (`pages/member/`): My races (`dashboard`), My clocking history, Clocking,
My pigeons, Results, Settings. Super Admin (`pages/superadmin/`): Club accounts,
Register Sticker, Register NFC, Register RFID reader, Generate Sticker, Setup
checklist.

## Adding a page

1. Create `pages/<role>/<name>/index.html` (copy one) with `data-view`, `data-role` and `data-active`.
2. Create `page.js` exporting `render(view, identity, setCleanup)`.
3. In `assets/js/app.js`: add it to the menu (`adminNav`, `memberNav` or `superadminNav`), to `routes`, and to `renderPage`.
4. Add it to `tests/browser/pages-open.browser.cjs`.

## Data rules live in the database

The browser never decides on its own whether a clock counts. Rules such as
"first receipt wins", "RFID tag once per race", "tag expiry from the race",
"ring-only birds need a sticker" and "disqualified if not shown up when the race
is closed" are enforced by PostgreSQL triggers and functions, and row-level
security keeps each club's data to itself. Pages show the same rules earlier,
as warnings, so people are not surprised when they save.

## Devices

- **ESP8266 loft reader** (`tools/rfid-reader/`): sends taps to the
  `device_rfid_scan` function with its serial and device key; keeps taps made
  offline with their time (DS1302 clock) and sends them later.
- **ACR122U on Windows** (`tools/nfc-reader/`): the helper reads tags and hands
  them to the AvilonX page on the same computer at `http://127.0.0.1:47321`.
- **Phones**: Web NFC (Chrome on Android) and the camera for stickers.

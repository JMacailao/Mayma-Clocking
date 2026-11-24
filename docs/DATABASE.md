# Database setup files

Run in the Supabase **SQL Editor**. A brand-new database first needs
`schema.sql` and `supabase-auth.sql` (once). After that, run
**`avilonx-update.sql`** after every AvilonX update: it contains all the files
below in this order and is safe to run again. The Super Admin's **Setup
checklist** page shows which parts are done.

| File | Adds |
|---|---|
| `schema.sql` | Tables: members, race points, races, race entries, clock events (new database only). |
| `supabase-auth.sql` | Username sign-in, profiles, first Super Admin (new database only). |
| `multi-club.sql` | Clubs, `club_id` everywhere, roles, team accounts, row-level security per club. |
| `account-credentials.sql` | Club admins change usernames and passwords in their club. |
| `public-results.sql` | Public results by club and date. |
| `sticker-barcodes.sql` | Global sticker registry and scratch codes. |
| `race-release-time.sql` | Races saved before their release time. |
| `race-schedule-dates.sql` | Open and end dates. |
| `nfc-tags.sql` | RFID/NFC tags, registered tags, phone clocking by tag. |
| `rfid-devices.sql` | ESP8266 readers: registration, device keys, taps, heartbeats, offline taps with their time. |
| `entry-remarks.sql` | Remarks list and remarks per entry; practice races and the per-race Show up needed option (`requires_show_up`); public results with remarks, without practice races. |
| `bird-bonding.sql` | Bonded birds with photo (private storage bucket); entries must use a bonded bird. |
| `show-up.sql` | Show up verification; disqualified when the race is closed without it. |
| `rfid-tag-in-use.sql` | A tag once per race, and not while active in another race. |
| `bird-ring-only.sql` | Birds bonded by ring number only (sticker entries). |
| `race-tag-expiry.sql` | RFID tag expiry per race, applied to its entries. |
| `club-settings.sql` | Club settings: whether RFID entries need the sticker (required or optional). |
| `account-devices.sql` | One device per account (Club settings): signing in elsewhere asks first and signs the other device out. |
| `telegram.sql` | Results on Telegram for members who own a loft reader (see [TELEGRAM.md](TELEGRAM.md)). |
| `clock-videos.sql` | Short video per clocking: `clock_videos`, private `clock-videos` bucket, `member_save_clock_video()`. Members see their own, the club sees all of its own. |
| `race-point-recalc.sql` | Editing a race point's location or coordinates moves the races using it and recalculates every entry's distance (so speeds and ranks), clocked birds included. |
| `race-day.sql` | Change history, practice races, live updates (Realtime), `setup_status()`. |

Rebuild `avilonx-update.sql` after changing any file:

```bash
sh tools/build-update-sql.sh
```

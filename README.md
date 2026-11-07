# Mayma Clocking

A static club clocking app built with HTML, CSS, JavaScript and **Supabase only**
(Supabase Auth + PostgreSQL). People sign in with a **username and password**, never
an email address.

## How accounts work

- **Superadmin**: created once, on first run of a fresh database. The superadmin only
  manages club accounts (Club accounts page). It cannot see any club's members or races.
- **Club account** (administrator): created by the superadmin with a club name, username
  and password. It manages its own members, race points, races, entries and clocking.
- **Member**: created by the club account. Members see only their own records.

Every club-owned row carries a `club_id`, and Supabase row-level security enforces it,
so one club can never read, change or clock another club's data, even by editing
requests in the browser.

## Set up

1. Open your Supabase project (`ddwzrjvlatdbwaiagxhp`) → **SQL Editor** and run, in order:
   1. `schema.sql` — **only for a brand-new database** (skip if you already ran it)
   2. `supabase-auth.sql` — skip if you already ran it
   3. `multi-club.sql` — adds clubs, `club_id` and the superadmin module
2. Open the site. On a fresh database the login page asks you to **create the superadmin
   account** (username + password, 8+ characters). This screen appears only once.
   If you already had an administrator, that account becomes the superadmin.
3. As superadmin, open **Club accounts** and create a login for each club.
4. Each club signs in with its own username and password and adds its members.
5. Publish with GitHub Pages: repository **Settings → Pages**, branch `main`, `/ (root)`.

No Supabase Auth settings need changing and no email is used. Supabase Auth needs an
email-shaped identifier internally, so the app uses `username@users.mayma.invalid`
behind the scenes. Passwords are reset by the person above them: the superadmin resets
club passwords, a club resets its members' passwords.

Data that existed before clubs were introduced is kept in a club named **Default club**.
Create a club account with exactly that name to hand the old data to that club.

## Pages

- `index.html`: club portal landing page.
- `pages/login/index.html`: shared admin/member sign-in.
- `pages/admin/dashboard/`: club overview.
- `pages/admin/members/`: member and loft records.
- `pages/admin/race-points/`: release locations.
- `pages/admin/races/`: race schedules and status.
- `pages/admin/entries/`: registered pigeons and barcodes.
- `pages/admin/clocking/`: admin receipts.
- `pages/admin/results/`: provisional leaderboard.
- `pages/member/dashboard/`: a member's open races.
- `pages/member/clocking/`: member barcode clocking and camera scan.
- `pages/member/history/`: that member's receipts.

## Important

- Row-level security: administrators manage everything; members only see their own
  record, entries and receipts. Members cannot promote themselves.
- `submit_member_clock` and `admin_record_clock` check the member, barcode, race
  status and release time, then write a server timestamp.
- Clocking receipts are provisional evidence of server receipt time.
- Never put a service-role key in browser code.

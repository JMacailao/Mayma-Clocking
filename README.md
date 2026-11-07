# Mayma Clocking

A static club clocking app built with HTML, CSS, JavaScript and **Supabase only**
(Supabase Auth + PostgreSQL). People sign in with a **username and password**, never
an email address.

## Set up

1. Open your Supabase project (`ddwzrjvlatdbwaiagxhp`) → **SQL Editor**.
2. **Fresh database:** run `schema.sql`, then `supabase-auth.sql`.
   **Already ran the Firebase version:** just run `supabase-auth.sql`; it switches
   everything back to Supabase Auth. Firebase is no longer used and can be ignored.
3. Open the site. On a fresh database the login page asks you to **create the
   superadmin account** (username + password, 8+ characters). This screen appears only
   once, while the database has no administrator. After that there is no public
   registration.
4. Publish with GitHub Pages: repository **Settings → Pages**, branch `main`, `/ (root)`.

No Supabase Auth settings need changing: no email provider, no "Confirm email" switch.

## Using it
- **Add members:** Admin → Members. Fill in the details and an optional login
  username and password, or use **Create login** / **Reset password** in the list.
  Deleting a member deletes their login.
- Usernames are lowercase, 3–32 characters: letters, numbers, dots, underscores or hyphens.
- Supabase Auth needs an email-shaped identifier internally, so the app uses
  `username@users.mayma.invalid` behind the scenes. Those addresses cannot receive
  email; an administrator resets passwords from the Members page.
- Logins created in the Firebase version stop working; the superadmin is created again.

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

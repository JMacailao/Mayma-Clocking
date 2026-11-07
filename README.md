# Mayma Clocking

A static club clocking app built with HTML, CSS, JavaScript and Supabase. It has
separate folders for club administration and member pages. It uses Supabase
Auth for sign-in and PostgreSQL row-level security for data access. No PHP
server, Node runtime or database password is used by the browser app.

## Set up Supabase

The project is configured in `assets/js/supabase.js` with the provided project
URL and publishable key. Publishable keys are meant for browser use. Keep secret
and service-role keys out of this repository.

1. In the Supabase SQL Editor for project `ddwzrjvlatdbwaiagxhp`, run `schema.sql`.
   It enables RLS, creates role/profile helpers and restricts member clock
   submissions to the database function. Existing member/race records are kept.
2. Create a Supabase Auth user for each person. Use the username-only account method below.
   Create member rows from the admin app before creating a member account.
3. In Authentication → Users, copy the user's UUID. Assign the admin role in SQL:

   ```sql
   insert into public.app_profiles (id, username, role, member_id)
   values ('AUTH_USER_UUID', 'clubadmin', 'admin', null);
   ```

   Assign a member account to a member row with:

   ```sql
   insert into public.app_profiles (id, username, role, member_id)
   values ('AUTH_USER_UUID', 'member01', 'member', 1);
   ```

   Replace the example UUID, username and member ID with actual values. Usernames
   are lowercase, 3–32 letters, numbers, dots, underscores or hyphens. Profiles
   can only be created or changed by the database owner in SQL Editor, so users
   cannot grant themselves admin access.
4. Publish this repository with GitHub Pages: repository **Settings → Pages**,
   select deploy from the `main` branch and `/ (root)`. The `index.html` landing
   page and folder pages will then be served as a static site.

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

- Sign-in asks only for a username and password. Supabase Auth requires an email
  identifier underneath, so the app maps each username to the reserved,
  non-deliverable address `username@users.mayma.invalid`. Users never enter or
  see this address. In Authentication → Users, create the Auth account using
  that exact synthetic address and mark it confirmed; do not use a real email.
  Password resets must be done by an administrator in the Supabase dashboard
  because the synthetic address cannot receive email. The app has no public
  sign-up flow.
- The SQL policies grant admin access only to profiles assigned `admin` by the
  database owner. Members can see their own profile, member record, race entries
  and clock receipts. The `submit_member_clock` function checks the member,
  barcode, race status and release time, then writes a server timestamp.
- Clocking receipts are provisional evidence of server receipt time, not
  independently verified pigeon arrival.
- Existing PHP/MySQL files and SMS support have been removed. Supabase schema
  setup preserves existing race data but does not transfer old password hashes;
  create new Supabase Auth users and assign their profiles as above.

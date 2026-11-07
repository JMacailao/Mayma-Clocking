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
2. In Supabase **Authentication → Users**, create an account for the club admin.
   Create the member rows from the admin app after an admin signs in. Create
   member accounts in Auth only after their member row exists.
3. In Authentication → Users, copy the user's UUID. Assign the admin role in SQL:

   ```sql
   insert into public.app_profiles (id, role, member_id)
   values ('AUTH_USER_UUID', 'admin', null);
   ```

   Assign a member account to a member row with:

   ```sql
   insert into public.app_profiles (id, role, member_id)
   values ('AUTH_USER_UUID', 'member', 1);
   ```

   Replace the example UUID and member ID with the actual values. Profiles can
   only be created or changed by the database owner in SQL Editor. This prevents
   users from granting themselves admin access.
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

- Supabase Auth accounts are managed in the Supabase dashboard. Sign-in uses
  email and password; the app does not offer public sign-up.
- The SQL policies grant admin access only to profiles assigned `admin` by the
  database owner. Members can see their own profile, member record, race entries
  and clock receipts. The `submit_member_clock` function checks the member,
  barcode, race status and release time, then writes a server timestamp.
- Clocking receipts are provisional evidence of server receipt time, not
  independently verified pigeon arrival.
- Existing PHP/MySQL files and SMS support have been removed. Supabase schema
  setup preserves existing race data but does not transfer old password hashes;
  create new Supabase Auth users and assign their profiles as above.

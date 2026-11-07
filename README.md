# Mayma Clocking

A static club clocking app built with HTML, CSS, JavaScript and Supabase. It has
separate folders for club administration and member pages. It uses Supabase
Auth for sign-in and PostgreSQL row-level security for data access. No PHP
server, Node runtime or database password is used by the browser app.

## Set up Supabase

The project URL and publishable key are configured in `assets/js/supabase.js`.
The publishable key is safe in browser code; never add a service-role key.

1. In the Supabase SQL Editor for project `ddwzrjvlatdbwaiagxhp`, run `schema.sql`.
   It creates the app tables when the database is fresh, enables row-level
   security, and adds protected clocking and first-admin setup functions.
2. In **Authentication → Sign In / Providers → Email**, enable email sign-ups
   and turn **Confirm email** off. This lets the first admin create an account
   without waiting for email delivery.
3. Open the site and choose a username and password (8 or more characters).
   The first confirmed account becomes the administrator. Once setup finishes,
   turn email confirmation back on if desired. Do the first setup while you
   control access to the site: the first person to claim an empty database
   becomes its administrator.
4. Create member records in the admin app. In **Authentication → Users**, add
   each member using `<lowercase-username>@users.mayma.invalid` and a temporary
   password, then mark the account confirmed. Assign the Auth user to the member
   row in SQL Editor:

   ```sql
   insert into public.app_profiles (id, username, role, member_id)
   select id, 'member01', 'member', 1
   from auth.users
   where email = 'member01@users.mayma.invalid';
   ```

   Replace the example username and member ID. Usernames are lowercase,
   3–32 characters using letters, numbers, dots, underscores or hyphens. Profile
   changes are restricted to the database owner, so members cannot promote
   themselves to admin.
5. Publish this repository with GitHub Pages: repository **Settings → Pages**,
   select deploy from the `main` branch and `/ (root)`.

Supabase Auth needs an email identifier internally, so the app uses the reserved
address `username@users.mayma.invalid` behind the scenes. Users only enter their
username and password. These addresses cannot receive password-reset emails;
an administrator must reset passwords in the Supabase dashboard.


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

- The first-admin form is shown only while the database has no admin profile.
  Configure Supabase Auth email confirmation as described above before setup;
  the first signed-in account claims the admin role exactly once.
- The SQL policies grant admin access only to profiles assigned `admin` by the
  database owner. Members can see their own profile, member record, race entries
  and clock receipts. The `submit_member_clock` function checks the member,
  barcode, race status and release time, then writes a server timestamp.
- Clocking receipts are provisional evidence of server receipt time, not
  independently verified pigeon arrival.
- Existing PHP/MySQL files and SMS support have been removed. Supabase schema
  setup preserves existing race data but does not transfer old password hashes;
  create new Supabase Auth users and assign member profiles as above.

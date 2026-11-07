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
   security and adds the protected clocking and first-admin setup functions.
   Existing race and member records are kept.
2. In Supabase **Authentication → URL Configuration**, add the deployed login
   page to the allowed redirect URLs. For GitHub Pages, it ends with
   `/Mayma-Clocking/pages/login/index.html`. Keep email sign-up and email
   confirmation enabled so the first administrator proves access to their email.
3. Open the site. With no admin in the database, it displays **Create your
   admin** and asks for a username, email and password. Confirm the email link to
   finish setup. After setup, the account signs in with username and password.
4. Create member records in the admin app. For each member, create a Supabase Auth
   user in **Authentication → Users** using
   `<lowercase-username>@users.mayma.invalid` and a temporary password. Mark the
   account confirmed. Then copy the Auth user's UUID and assign the member row:

   ```sql
   insert into public.app_profiles (id, username, role, member_id)
   values ('AUTH_USER_UUID', 'member01', 'member', 1);
   ```

   Replace the example UUID, username and member ID. Usernames are lowercase,
   3–32 characters using letters, numbers, dots, underscores or hyphens. Profile
   changes are restricted to the database owner, so a member cannot promote
   themselves to admin.
5. Publish this repository with GitHub Pages: repository **Settings → Pages**,
   select deploy from the `main` branch and `/ (root)`.

Supabase Auth uses an email identifier underneath username sign-in. Once the
first admin verifies their real email, the database securely changes the Auth
identifier to a non-deliverable username alias. Members use the same alias when
their Auth account is created. Users only see and enter their username. An
administrator must reset passwords in the Supabase dashboard because the alias
cannot receive password recovery emails.

If `schema.sql` was already run from an earlier version, run it again to add the
username column and first-admin function. Existing profile rows need usernames.
For each existing account, change its Auth email to
`<lowercase-username>@users.mayma.invalid` in Authentication → Users, confirm it,
and update `app_profiles.username` in SQL Editor before using username sign-in.

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

- The first admin setup is shown only while the database has no admin profile.
  Supabase email confirmation verifies the initial real email before the setup
  function grants admin access. Later sign-in asks for username and password.
- The SQL policies grant admin access only to profiles assigned `admin` by the
  database owner. Members can see their own profile, member record, race entries
  and clock receipts. The `submit_member_clock` function checks the member,
  barcode, race status and release time, then writes a server timestamp.
- Clocking receipts are provisional evidence of server receipt time, not
  independently verified pigeon arrival.
- Existing PHP/MySQL files and SMS support have been removed. Supabase schema
  setup preserves existing race data but does not transfer old password hashes;
  create new Supabase Auth users and assign member profiles as above.

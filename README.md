# Mayma Clocking

A static club clocking app built with HTML, CSS, and JavaScript. Firebase
Authentication handles usernames and passwords; Supabase PostgreSQL stores the
race data and enforces row-level security using Firebase ID tokens. No PHP
server or database password is used in the browser.

## Connect Firebase and Supabase

1. In Firebase Console, create or select a project and register a **Web app**.
   This app's public Web config is set in `assets/js/firebase.js`. If you use a
   different Firebase project, replace its `apiKey`, `authDomain`, `projectId`,
   and `appId`. Never put a Firebase service-account key in this site.
2. In Firebase **Authentication → Sign-in method**, enable **Email/Password**.
   Add your GitHub Pages host (for example, `jmacailao.github.io`) to Firebase's
   authorized domains.
3. In Supabase SQL Editor for project `ddwzrjvlatdbwaiagxhp`, run `schema.sql`.
   This creates the tables, row-level policies, and protected clocking RPCs.
4. In Supabase **Authentication → Third-Party Auth**, connect the same Firebase
   project ID. This makes Supabase verify Firebase ID tokens before applying
   database policies.
5. Open the site. If no admin profile exists, create the first admin with a
   username and password. Firebase uses a private internal alias address for
   Email/Password accounts; users only enter their username and password. The
   first account to claim an empty database receives the admin role.
6. Create member records in the admin app. In Firebase **Authentication → Users**,
   add each member with email `<lowercase-username>@users.mayma.invalid` and a
   temporary password. Copy the Firebase user's UID, then assign the member
   profile in Supabase SQL Editor:

   ```sql
   insert into public.app_profiles (id, username, role, member_id)
   values ('FIREBASE_USER_UID', 'member01', 'member', 1);
   ```

   Replace the sample UID, username, and member ID. Usernames are lowercase,
   3–32 characters using letters, numbers, dots, underscores, or hyphens.
   Profiles can only be created by the database owner, so members cannot grant
   themselves admin access. Since the internal alias cannot receive mail, reset
   a member's password from Firebase Authentication → Users.
7. Publish this repository using GitHub Pages: **Settings → Pages**, deploy from
   `main` and `/(root)`.

## Pages

- `index.html`: club portal landing page.
- `pages/login/index.html`: first-admin setup or username/password sign-in.
- `pages/admin/dashboard/`: club overview.
- `pages/admin/members/`: member and loft records.
- `pages/admin/race-points/`: release locations.
- `pages/admin/races/`: race schedules and status.
- `pages/admin/entries/`: registered pigeons and barcodes.
- `pages/admin/clocking/`: admin receipts.
- `pages/admin/results/`: provisional leaderboard.
- `pages/member/dashboard/`: a member's open races.
- `pages/member/clocking/`: barcode clocking and camera scan.
- `pages/member/history/`: that member's receipts.

## Account and data notes

- Firebase authentication is linked to Supabase as a third-party identity.
  `app_profiles.id` stores Firebase UIDs as text; old Supabase Auth accounts do
  not automatically become Firebase accounts. Recreate users in Firebase and
  update their profile UIDs if migrating an existing installation.
- The first person to create an admin while `app_profiles` has no admin profile
  becomes the administrator. Configure the Firebase project before publishing
  the site for general access.
- Members can see only their own profile, member record, race entries, and clock
  receipts. The `submit_member_clock` database function validates the member,
  barcode, race status, and release time, then writes the server receipt time.
- Clocking receipts are provisional evidence of server receipt time, not
  independently verified pigeon arrival.
- Supabase's publishable key and Firebase Web app config are client settings.
  Never put a Supabase service-role key or Firebase service-account credential
  in browser code.

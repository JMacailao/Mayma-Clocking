# Forgot password by email

Members, club administrators and the Super Admin who forget their password tap
**Forgot password?** on the sign-in page (Member or Club team tab), enter their
username, and get an email with a link to choose a new password. Everything here
is free (Resend free plan: 100 emails a day).

## How it works

1. **The account's email.** A **confirmation link** is sent to it; only a
   confirmed email gets reset links.
   - **Members:** the club administrator adds it on **Members** (field *Email (for
     password reset)*), or the member on **Settings → Email for password reset**.
     Members shows each email as *✓ Confirmed* or *Not confirmed* (with **Send
     link again**).
   - **Club administrators:** **Club settings → Email for password reset**.
   - **Super Admin:** **Setup → Email for password reset**.
   - **One email, one account:** the same email cannot be on two members or two
     accounts (AvilonX says "This email is already used by another account").
2. **Forgot password?** sends a reset link to the confirmed email. The answer on
   screen is always the same, so nobody can find out which usernames exist.
3. **The link** (works once, for 1 hour) opens *Choose a new password*. Saving
   signs the account out on every phone and computer and frees the one-device
   lock. The reset is in the **Change history**.
4. **Limits:** 3 reset emails and 3 confirmation emails per member per day. A new
   link replaces the previous one. Changing the email cancels links sent to the
   old one and needs a new confirmation.
5. **No email, or no access to it?** The club administrator resets a member's
   password on Members → **Reset password**, and a staff account's on Team
   accounts, as before; the Super Admin resets a club administrator's on Clubs.

Links are stored only as SHA-256 hashes; the Resend key and the Supabase service
key are kept in the Edge Function, never in the website.

## Setup (once)

### 1. Resend (sends the emails)

1. Sign up at **resend.com** (free).
2. **Domains → Add Domain** → `avilonx.site`, region **Tokyo (ap-northeast-1)**.
3. Add the records Resend shows where the domain is managed (DNS):
   - **DKIM** — TXT `resend._domainkey` (required)
   - **SPF** — MX `send` (priority 10) and TXT `send` (required)
   - **DMARC** — TXT `_dmarc` (recommended; skip if one exists already)
   - Do **not** add the *Receiving* MX record, and don't touch the GitHub Pages
     records (`@` A records, `www` CNAME).
   Then **Verify** in Resend until it shows *Verified*.
4. **API Keys → Create API Key**: name `avilonx-password-reset`, permission
   **Sending access**, domain `avilonx.site`. Copy the key (`re_…`); it is shown
   once. Never put it in the website or in a chat.

### 2. Database

Supabase → **SQL Editor** → run **`avilonx-update.sql`** (as after every update).
If it shows the notice *Some members share an email*, give each of those members
its own email on Members and run it again.
Super Admin → **Setup** then shows *Forgot password by email* as done.

### 3. Edge Function

1. Supabase → **Edge Functions → Deploy a new function → Via Editor**.
2. Name: **`avilonx-password-reset`**. Paste the whole of
   `supabase/functions/avilonx-password-reset/index.ts`. **Deploy**.
3. In the function's **Details / Settings**, turn **Verify JWT** (Enforce JWT
   verification) **OFF**: members who forgot their password are not signed in.
   The function checks the sign-in itself where it is needed.
4. **Edge Functions → Secrets** (Manage secrets), add:
   - `RESEND_API_KEY` = the `re_…` key
   - `RESET_FROM` = `AvilonX <noreply@avilonx.site>`
   - (optional) `SITE_URL` = `https://www.avilonx.site` (the default)

No redirect URL is needed in Authentication settings: the links open
`https://www.avilonx.site/pages/reset-password/index.html` and the database checks
them.

### 4. Test

1. Members → edit a test member → put your own email → **Save**. Open the
   confirmation email → *Email confirmed ✓*. Members shows *✓ Confirmed*.
2. Sign out → **Member** tab → **Forgot password?** → that member's username →
   **Send reset link**. Open the email → choose a new password → sign in with it.

**After an AvilonX update that changes the function** (like the one adding club
administrators and the Super Admin), open the function → **Code**, paste the new
`index.ts` again and **Deploy**. The secrets stay.

## When it doesn't work

| What you see | Check |
|---|---|
| "Reset by email is not available right now" | The function is not deployed, or its name is not exactly `avilonx-password-reset`, or Verify JWT is still on |
| "Confirmation email not sent: … not set up yet" | Same as above, or `RESEND_API_KEY` is missing |
| No email arrives | Spam folder; Resend → **Emails** shows each email and any error; the domain must show *Verified*; the member's email must be *Confirmed* (Members) |
| "This reset link has expired or was already used" | Ask for a new one (links work once, for 1 hour; a newer link replaces older ones) |
| "Three confirmation emails were already sent today" | Wait until tomorrow, or open the last email that came |

Supabase → Edge Functions → `avilonx-password-reset` → **Logs** shows errors
from Resend.

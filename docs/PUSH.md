# Push notifications

Members, club administrators and staff can get notifications on their phone or
computer, in the browser and in the AvilonX Android app.

| Who | When |
| --- | --- |
| Member | One of their pigeons is clocked; the club opens a race |
| Club administrator, staff | Any pigeon in the club is clocked |

Each person turns them on per device: **Settings → Notifications** (members),
**Club settings → Notifications** (administrators), the **Overview** page (staff).
On iPhone this works only after "Add to Home Screen" (iOS 16.4 or newer).

## Setup (once)

1. Run `avilonx-update.sql` in the Supabase SQL Editor (it includes `push.sql`).
2. Deploy the Edge Function `supabase/functions/avilonx-push` as **avilonx-push**
   with **Verify JWT turned off**.

No secrets are needed: the first time someone turns notifications on, the
function creates the Web Push keys and saves them in the database.
Optional secrets: `PUSH_CONTACT` (e.g. `mailto:you@gmail.com`) and `SITE_URL`.

## How it works

A database trigger (`push.sql`) queues each notification in `push_outbox` and
calls the Edge Function with `pg_net`. The function encrypts it for each of the
person's devices (Web Push, VAPID) and sends it. Devices the push service says
are gone are removed. A notification problem never stops a clocking from saving.

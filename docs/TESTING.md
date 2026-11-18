# Automatic tests

Three kinds of test run on every push (GitHub Actions, `.github/workflows/tests.yml`).

| Command | What it tests | Needs |
|---|---|---|
| `npm test` | **Unit tests** (`tests/unit/*.test.mjs`, `tests/*.test.cjs`): rules with no page around them, such as reading remarks and member IDs from a race sheet, matching rings to bonded birds, tag IDs from USB readers, race ranking and disqualification, menu routing. | Node 22 |
| `npm run test:browser` | **Browser tests** (`tests/browser/*.browser.cjs`): real pages in Chromium with a stand-in for Supabase (`tests/browser/fake-supabase.js`) and sample data (`sample-race.cjs`). Includes opening every page for every role, and finding the table in a real loading-form photo (`tests/fixtures/loading-form.webp`). | Node 22, Playwright Chromium |
| `npm run test:sql` | **Database tests** (`tests/sql/`): a fresh PostgreSQL database set up like Supabase (`supabase-stub.sql`), then `schema.sql`, `supabase-auth.sql` and `avilonx-update.sql` **twice** (it must be safe to run again), then the rules in `checks.sql`. | `psql` and an empty PostgreSQL 16 database (`PGHOST`, `PGUSER`, ...) |

## Running them on your computer

```bash
npm install
```

```bash
npx playwright install chromium
```

```bash
npm test
```

```bash
npm run test:browser
```

Run one browser test file by part of its name:

```bash
node tests/browser/run-all.cjs race-entries
```

Database tests, with Docker for the database:

```bash
docker run --rm -d --name avilonx-db -e POSTGRES_PASSWORD=postgres -p 5432:5432 postgres:16
```

```bash
PGHOST=localhost PGUSER=postgres PGPASSWORD=postgres PGDATABASE=postgres npm run test:sql
```

## Writing a browser test

A file `tests/browser/<name>.browser.cjs` exports `async (page, ctx) => {}`:

- `ctx.open(module, setup, opts)` renders one page module. `setup` is JavaScript
  that fills the stand-in database, e.g. `F.tables.races=[...]` or
  `F.rpc.setup_status={...}`; `opts.fn` picks the exported function.
- `ctx.app(setup)` prepares the stand-in for full pages (sign-in, menu); then
  `page.goto(ctx.BASE + '/repo/pages/...')`.
- `ctx.check(condition, 'what should be true')` records a failure and carries on.
- `ctx.sample` is the sample race data; `ctx.toast()` the latest message.
- The stand-in records writes in `window.FAKE.ops`, and live-update listeners in
  `window.FAKE.channels`.

Page errors in the browser fail the test too.

## When you change the database

Edit the separate `.sql` file, run `sh tools/build-update-sql.sh` to rebuild
`avilonx-update.sql`, add a check to `tests/sql/checks.sql`, and commit both.
The database job fails if `avilonx-update.sql` is out of date.

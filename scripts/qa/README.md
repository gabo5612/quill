# QA harness

Drives the real UI in a real browser as a signed-in user, then checks what the
pipeline actually wrote to the database. It exists because every defect found
in this app so far was invisible from the outside: the article looked fine in
the editor while the stored document had lost its heading levels, and a
billing error was reported as a schema failure.

Not part of the build. Playwright is not a project dependency — install it
when you need it:

```bash
npm i --no-save playwright && npx playwright install chromium
```

## Running it

The scripts read `.env.local` for the Supabase URL and service-role key.

```bash
# 1. Mint a browser session for the QA user, without going through Google OAuth.
QA_USER_PASSWORD='<throwaway>' node scripts/qa/session.mjs

# 2. Walk the whole product: create a brand article, watch it generate, edit it,
#    reload, export it. Add BASE=https://… to run against production.
node scripts/qa/journey.mjs
BASE=https://content-tool-rho.vercel.app node scripts/qa/journey.mjs

# 3. Read the result out of the database and check its structure, SEO and JSON-LD.
node scripts/qa/inspect.mjs scripts/qa/last-article-id.txt
```

`session.mjs` sets a password on `qa-bot@example.com` via the admin API so the
browser can sign in without Google. The password comes from the environment and
is never stored here. `session.json` and the screenshots the run produces are
gitignored.

## repair-headings.mjs

A one-off. Articles saved before the `toPlainDoc` fix lost every `attrs` bag,
which collapsed their heading hierarchy. It rebuilds the ProseMirror document
from `body_markdown`, which the pipeline wrote and which was never damaged.

```bash
node scripts/qa/repair-headings.mjs           # dry run
node scripts/qa/repair-headings.mjs --apply
```

## Unit tests

No runner is wired up; they run directly and exit non-zero on failure.

```bash
npx tsx tests/markdown-to-prosemirror.test.ts   # 24 cases
npx tsx tests/schemas.test.ts                   # 36 cases
```

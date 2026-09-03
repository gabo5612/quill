# Quill

Brand-aware editorial platform: retrieval-augmented article generation with a
human review step. Multi-tenant, with per-brand document corpora, role-based
access control, an audit trail and a per-generation cost ledger.

## Stack

| Layer | Choice |
|---|---|
| Framework | Next.js 16 (App Router, Turbopack, React 19) |
| Database & auth | Supabase (Postgres + RLS + Google OAuth + Storage + pgvector) |
| Background jobs | Inngest |
| LLMs | Anthropic (Claude) and OpenAI via the Vercel AI SDK |
| Editor | Tiptap (ProseMirror) |

## How it works

**Ingestion** — `lib/ingestion/`: documents are parsed (`.docx` via mammoth),
chunked, embedded in batches of 100, and stored in `app.document_chunks`.
Batching keeps a single failure from losing a whole document.

**Retrieval** — `lib/rag/`: `text-embedding-3-large` is requested at 1536
dimensions rather than its default 3072, to match the `halfvec(1536)` column and
the `app.match_brand_chunks` similarity function. Ingestion and retrieval import
the model and dimension from the same module, because if they ever diverge
cosine distance becomes meaningless.

**Generation** — `lib/ai/steps/`: `outline` → `draft` → `images` → `proofread` →
`seo`, run as an Inngest workflow with a trace per article.

**Governance** — a server-side model allowlist (`lib/ai/registry.ts`) mirrors
`app.ai_models` so background jobs can validate a model without a round trip and
a database outage can't widen what the app is willing to call. Every generation
writes a costed row to `app.generations`; every privileged action writes to the
audit log.

## Access control

Sign-in is restricted to Google Workspace accounts on a single domain, enforced
in three places: the OAuth `hd` parameter, the `/auth/callback` handler, and the
`app.check_email_domain` trigger on `app.profiles`. Set the domain in
`lib/auth/constants.ts`.

Permissions are the product of a global role (admin / editor / viewer) and a
per-brand role (owner / editor / viewer) — see `lib/auth/permissions.ts`.

## Running it

The whole stack runs locally in Docker — Postgres with pgvector, auth, storage
and the job runner. Nothing but the model API leaves your machine.

```bash
npm install
cp .env.example .env.local          # add an OpenAI and/or Anthropic key

supabase start                      # Postgres + pgvector + auth + storage,
                                    # migrations applied automatically
npx inngest-cli@latest dev -u http://localhost:3000/api/inngest
npm run dev
```

`supabase start` prints the local API URL, anon key and service role key — copy
those three into `.env.local`. Set `INNGEST_DEV=1` and the Inngest cloud keys
are not needed.

At least one of `ANTHROPIC_API_KEY` or `OPENAI_API_KEY` must be set; the
generation pipeline runs on whichever is configured. Embeddings are OpenAI-only,
so document search needs that one specifically. `GET /api/health` reports what
is configured and what each missing variable disables.

### Signing in locally

The only shipped auth method is Google OAuth against a single Workspace domain,
which cannot be completed against a local Supabase. Set `LOCAL_DEV_USER` and the
app mints a real session for that address instead of showing the login screen —
creating the account on first run. The session is a genuine JWT, so Row Level
Security, permissions and the audit log are exercised exactly as in production.
The bypass refuses to engage unless Supabase is running on this machine.

Database migrations live in `supabase/migrations/`.

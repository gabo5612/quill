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

```bash
npm install
cp .env.example .env.local   # fill in Supabase, Anthropic, OpenAI, Inngest
npm run dev
```

Database migrations live in `supabase/migrations/`.

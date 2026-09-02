-- ─────────────────────────────────────────────────────────────────────────────
-- 0008 — Store what each generation step actually decided, not just its cost.
-- ─────────────────────────────────────────────────────────────────────────────

-- app.generations already records tokens, cost and duration per step. That
-- answers "what did this article cost" but not "why does it say what it says".
-- `payload` holds each step's structured output — the brand context that was
-- retrieved, the outline, the QA findings, the SEO decisions — so an editor can
-- audit the reasoning behind a draft instead of taking it on faith.
--
-- JSONB rather than typed columns: the shape differs per step and will keep
-- changing as the pipeline does, and nothing queries inside it.
ALTER TABLE app.generations
  ADD COLUMN IF NOT EXISTS payload JSONB;

COMMENT ON COLUMN app.generations.payload IS
  'Structured output of this pipeline step (outline, QA findings, retrieved '
  'chunks, …). Read by /articles/[id]/trace. Shape varies by step.';

-- The trace page reads every row for one article in order.
CREATE INDEX IF NOT EXISTS idx_generations_article_created_asc
  ON app.generations (article_id, created_at);

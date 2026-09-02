-- ─────────────────────────────────────────────────────────────────────────────
-- 0009 — Requested article length.
-- ─────────────────────────────────────────────────────────────────────────────

-- The outline model was choosing its own length, so two articles with the same
-- brief could come back at 600 and 2,400 words. Make it an explicit input.
ALTER TABLE app.articles
  ADD COLUMN IF NOT EXISTS target_words INTEGER
  CHECK (target_words IS NULL OR (target_words BETWEEN 300 AND 4000));

COMMENT ON COLUMN app.articles.target_words IS
  'Requested article length in words. NULL means "let the model decide", which is the pre-existing behaviour.';

ALTER TABLE app.schedule_entries
  ADD COLUMN IF NOT EXISTS target_words INTEGER
  CHECK (target_words IS NULL OR (target_words BETWEEN 300 AND 4000));

-- Semantic search for RAG — needs search_path = public for halfvec operators
CREATE OR REPLACE FUNCTION app.match_brand_chunks(
  p_brand_id UUID,
  p_embedding halfvec(1536),
  p_top_k INTEGER DEFAULT 10
)
RETURNS TABLE (
  id UUID,
  content TEXT,
  source TEXT,
  similarity FLOAT
)
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    dc.id,
    dc.content,
    dc.source::TEXT,
    (1 - (dc.embedding <=> p_embedding))::FLOAT AS similarity
  FROM app.document_chunks dc
  WHERE dc.brand_id = p_brand_id
    AND dc.embedding IS NOT NULL
  ORDER BY dc.embedding <=> p_embedding
  LIMIT p_top_k;
$$;

-- FK indexes for performance (covering all unindexed foreign keys)
CREATE INDEX IF NOT EXISTS idx_articles_brand_id        ON app.articles (brand_id);
CREATE INDEX IF NOT EXISTS idx_articles_author_id       ON app.articles (author_id);
CREATE INDEX IF NOT EXISTS idx_article_body_article_id  ON app.article_body (article_id);
CREATE INDEX IF NOT EXISTS idx_brand_members_user_id    ON app.brand_members (user_id);
CREATE INDEX IF NOT EXISTS idx_brand_profiles_brand_id  ON app.brand_profiles (brand_id);
CREATE INDEX IF NOT EXISTS idx_brand_documents_brand_id ON app.brand_documents (brand_id);
CREATE INDEX IF NOT EXISTS idx_document_chunks_doc_id   ON app.document_chunks (document_id);
CREATE INDEX IF NOT EXISTS idx_keywords_brand_id        ON app.keywords (brand_id);
CREATE INDEX IF NOT EXISTS idx_schedule_entries_brand_id   ON app.schedule_entries (brand_id);
CREATE INDEX IF NOT EXISTS idx_schedule_entries_author_id  ON app.schedule_entries (author_id);
CREATE INDEX IF NOT EXISTS idx_schedule_entries_article_id ON app.schedule_entries (article_id);
CREATE INDEX IF NOT EXISTS idx_generations_brand_id     ON app.generations (brand_id);
CREATE INDEX IF NOT EXISTS idx_generations_article_id   ON app.generations (article_id);
CREATE INDEX IF NOT EXISTS idx_audit_log_actor_id       ON app.audit_log (actor_id);
CREATE INDEX IF NOT EXISTS idx_audit_log_brand_id       ON app.audit_log (brand_id);

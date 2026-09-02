-- ─────────────────────────────────────────────────────────────────────────────
-- 0007 — Storage for AI-generated article illustrations.
-- ─────────────────────────────────────────────────────────────────────────────

-- Public bucket, unlike brand-documents. Generated images are embedded in the
-- article body as plain <img src> and travel with the HTML/Markdown exports, so
-- they have to be fetchable without a session. Nothing confidential goes here —
-- these are illustrations the model drew from a prompt.
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'article-images',
  'article-images',
  TRUE,
  10485760, -- 10 MB
  ARRAY['image/png', 'image/jpeg', 'image/webp']
)
ON CONFLICT (id) DO UPDATE
  SET public = EXCLUDED.public,
      file_size_limit = EXCLUDED.file_size_limit,
      allowed_mime_types = EXCLUDED.allowed_mime_types;

-- Object keys are `articles/<article_id>/<n>-<slug>.png`.
CREATE OR REPLACE FUNCTION app.storage_article_id(object_name TEXT)
RETURNS UUID LANGUAGE plpgsql IMMUTABLE
SET search_path = ''
AS $$
DECLARE
  parts TEXT[];
BEGIN
  parts := string_to_array(object_name, '/');
  IF array_length(parts, 1) < 2 OR parts[1] <> 'articles' THEN
    RETURN NULL;
  END IF;
  RETURN parts[2]::UUID;
EXCEPTION WHEN others THEN
  RETURN NULL;
END;
$$;

DROP POLICY IF EXISTS article_images_read   ON storage.objects;
DROP POLICY IF EXISTS article_images_delete ON storage.objects;

-- Reads are public (the bucket is public); this policy only covers the
-- authenticated listing path.
CREATE POLICY article_images_read ON storage.objects
  FOR SELECT TO authenticated, anon
  USING (bucket_id = 'article-images');

-- Writes happen exclusively through the service role inside the Inngest job,
-- so `authenticated` gets no INSERT. Deletes are allowed for anyone who can
-- write the owning article, so removing an image from a draft cleans up.
CREATE POLICY article_images_delete ON storage.objects
  FOR DELETE TO authenticated
  USING (
    bucket_id = 'article-images'
    AND EXISTS (
      SELECT 1 FROM app.articles a
      WHERE a.id = app.storage_article_id(storage.objects.name)
        AND app.can_write_brand(a.brand_id)
    )
  );

-- The cost ledger records image generation as its own step.
ALTER TABLE app.generations DROP CONSTRAINT IF EXISTS generations_step_check;
ALTER TABLE app.generations
  ADD CONSTRAINT generations_step_check
  CHECK (step IS NULL OR step IN ('outline','draft','images','qa','seo','done'));

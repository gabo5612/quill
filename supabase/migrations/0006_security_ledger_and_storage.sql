-- ─────────────────────────────────────────────────────────────────────────────
-- 0006 — Re-enable RLS, fix a privilege escalation, add the cost-ledger step
--        column, grant schema access, create the document bucket, and refresh
--        the model allowlist.
-- ─────────────────────────────────────────────────────────────────────────────

-- ── 0. Re-enable Row Level Security ──────────────────────────────────────────
-- Found DISABLED on all 13 tables in production even though 0003's policies are
-- present, so someone turned it off after the fact (most likely during the
-- "disable auth for testing" work). With RLS off, every policy below is inert
-- and the anon key can read and write every row.
--
-- This runs first, before the grants further down, so there is never a window
-- where the tables are both reachable and unprotected.
ALTER TABLE app.profiles         ENABLE ROW LEVEL SECURITY;
ALTER TABLE app.brands           ENABLE ROW LEVEL SECURITY;
ALTER TABLE app.brand_members    ENABLE ROW LEVEL SECURITY;
ALTER TABLE app.brand_profiles   ENABLE ROW LEVEL SECURITY;
ALTER TABLE app.brand_documents  ENABLE ROW LEVEL SECURITY;
ALTER TABLE app.document_chunks  ENABLE ROW LEVEL SECURITY;
ALTER TABLE app.articles         ENABLE ROW LEVEL SECURITY;
ALTER TABLE app.article_body     ENABLE ROW LEVEL SECURITY;
ALTER TABLE app.keywords         ENABLE ROW LEVEL SECURITY;
ALTER TABLE app.schedule_entries ENABLE ROW LEVEL SECURITY;
ALTER TABLE app.generations      ENABLE ROW LEVEL SECURITY;
ALTER TABLE app.audit_log        ENABLE ROW LEVEL SECURITY;
ALTER TABLE app.ai_models        ENABLE ROW LEVEL SECURITY;

-- ── 1. Privilege escalation via app.profiles ─────────────────────────────────
-- `profiles_self ... FOR ALL USING (id = auth.uid())` let any signed-in user
-- UPDATE their own row — including global_role — and promote themselves to
-- admin. Split it: self-service is read plus name-only writes; role changes go
-- through the service-role admin action.

DROP POLICY IF EXISTS profiles_self ON app.profiles;

CREATE POLICY profiles_self_read ON app.profiles
  FOR SELECT USING (id = auth.uid());

CREATE POLICY profiles_self_update ON app.profiles
  FOR UPDATE USING (id = auth.uid()) WITH CHECK (id = auth.uid());

-- WITH CHECK cannot see the OLD row, so the immutability of global_role/email
-- is enforced by a trigger instead.
CREATE OR REPLACE FUNCTION app.guard_profile_self_update()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  -- Service role / superuser (auth.uid() IS NULL) and admins bypass the guard.
  IF auth.uid() IS NULL OR app.is_admin() THEN
    RETURN NEW;
  END IF;

  IF NEW.global_role IS DISTINCT FROM OLD.global_role THEN
    RAISE EXCEPTION 'global_role can only be changed by an administrator';
  END IF;

  IF NEW.email IS DISTINCT FROM OLD.email THEN
    RAISE EXCEPTION 'email is managed by the identity provider';
  END IF;

  IF NEW.id IS DISTINCT FROM OLD.id THEN
    RAISE EXCEPTION 'id is immutable';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS guard_profile_self_update ON app.profiles;
CREATE TRIGGER guard_profile_self_update
  BEFORE UPDATE ON app.profiles
  FOR EACH ROW EXECUTE FUNCTION app.guard_profile_self_update();

-- Non-admins must not delete profile rows either.
REVOKE DELETE ON app.profiles FROM authenticated;


-- ── 2. Cost ledger: which pipeline step produced the row ─────────────────────
-- /api/articles/[id]/status reads the newest generations row to report
-- progress, and the ledger is useless for per-step cost analysis without it.
ALTER TABLE app.generations
  ADD COLUMN IF NOT EXISTS step TEXT
  CHECK (step IS NULL OR step IN ('outline','draft','qa','seo','done'));

CREATE INDEX IF NOT EXISTS idx_generations_article_created
  ON app.generations (article_id, created_at DESC);


-- ── 3. Schema and table grants ───────────────────────────────────────────────
-- RLS policies are irrelevant if the PostgREST roles lack USAGE on the schema.
-- Idempotent, so safe to re-run.
GRANT USAGE ON SCHEMA app TO anon, authenticated, service_role;

GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA app TO authenticated;
GRANT SELECT ON ALL TABLES IN SCHEMA app TO anon;
GRANT ALL ON ALL TABLES IN SCHEMA app TO service_role;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA app TO authenticated, service_role;
GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA app TO authenticated, service_role;

ALTER DEFAULT PRIVILEGES IN SCHEMA app
  GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO authenticated;
ALTER DEFAULT PRIVILEGES IN SCHEMA app
  GRANT ALL ON TABLES TO service_role;
ALTER DEFAULT PRIVILEGES IN SCHEMA app
  GRANT EXECUTE ON FUNCTIONS TO authenticated, service_role;

-- Append-only ledgers: writes happen through the service role only.
REVOKE INSERT, UPDATE, DELETE ON app.audit_log    FROM authenticated;
REVOKE INSERT, UPDATE, DELETE ON app.generations  FROM authenticated;
REVOKE INSERT, UPDATE, DELETE ON app.document_chunks FROM authenticated;
REVOKE INSERT, UPDATE, DELETE ON app.ai_models    FROM authenticated;
GRANT SELECT ON app.audit_log, app.generations, app.document_chunks, app.ai_models
  TO authenticated;


-- ── 4. Brand document storage ────────────────────────────────────────────────
-- Private bucket; the app uploads and downloads through the server with the
-- caller's session, so access is governed by the policies below.
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'brand-documents',
  'brand-documents',
  FALSE,
  20971520, -- 20 MB, matching the server action's limit
  ARRAY[
    'application/pdf',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'text/markdown',
    'text/plain'
  ]
)
ON CONFLICT (id) DO UPDATE
  SET public = EXCLUDED.public,
      file_size_limit = EXCLUDED.file_size_limit,
      allowed_mime_types = EXCLUDED.allowed_mime_types;

-- Object keys are `brands/<brand_id>/docs/<file>`, so the brand id is the
-- second path segment.
CREATE OR REPLACE FUNCTION app.storage_brand_id(object_name TEXT)
RETURNS UUID LANGUAGE plpgsql IMMUTABLE
SET search_path = ''
AS $$
DECLARE
  parts TEXT[];
BEGIN
  parts := string_to_array(object_name, '/');
  IF array_length(parts, 1) < 2 OR parts[1] <> 'brands' THEN
    RETURN NULL;
  END IF;
  RETURN parts[2]::UUID;
EXCEPTION WHEN others THEN
  RETURN NULL;
END;
$$;

DROP POLICY IF EXISTS brand_documents_read   ON storage.objects;
DROP POLICY IF EXISTS brand_documents_insert ON storage.objects;
DROP POLICY IF EXISTS brand_documents_delete ON storage.objects;

CREATE POLICY brand_documents_read ON storage.objects
  FOR SELECT TO authenticated
  USING (
    bucket_id = 'brand-documents'
    AND app.can_read_brand(app.storage_brand_id(name))
  );

CREATE POLICY brand_documents_insert ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'brand-documents'
    AND app.can_read_brand(app.storage_brand_id(name))
  );

CREATE POLICY brand_documents_delete ON storage.objects
  FOR DELETE TO authenticated
  USING (
    bucket_id = 'brand-documents'
    AND app.can_write_brand(app.storage_brand_id(name))
  );


-- ── 5. Refresh the model allowlist ───────────────────────────────────────────
-- The seeded IDs predate the current Claude generation. Keep this in sync with
-- DEFAULT_MODELS in lib/ai/registry.ts.
UPDATE app.ai_models SET active = FALSE, is_flagship = FALSE;

INSERT INTO app.ai_models (provider, model_id, label, capabilities, active, is_flagship) VALUES
  ('anthropic', 'claude-opus-5',    'Claude Opus 5',    ARRAY['text','vision'], TRUE, TRUE),
  ('anthropic', 'claude-sonnet-5',  'Claude Sonnet 5',  ARRAY['text','vision'], TRUE, FALSE),
  ('anthropic', 'claude-haiku-4-5', 'Claude Haiku 4.5', ARRAY['text'],          TRUE, FALSE),
  ('openai',    'gpt-4o',           'GPT-4o',           ARRAY['text','vision'], TRUE, FALSE),
  ('openai',    'gpt-4o-mini',      'GPT-4o Mini',      ARRAY['text'],          TRUE, FALSE)
ON CONFLICT (model_id) DO UPDATE
  SET provider     = EXCLUDED.provider,
      label        = EXCLUDED.label,
      capabilities = EXCLUDED.capabilities,
      active       = EXCLUDED.active,
      is_flagship  = EXCLUDED.is_flagship;


-- ── 6. Keep app.profiles.name in sync with the Google profile ────────────────
-- handle_new_user only fires on INSERT, so a user who signs in before their
-- Google name is available keeps an empty name forever.
CREATE OR REPLACE FUNCTION app.handle_new_user()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  INSERT INTO app.profiles (id, email, name, global_role)
  VALUES (
    NEW.id,
    NEW.email,
    COALESCE(NEW.raw_user_meta_data->>'full_name', NEW.raw_user_meta_data->>'name', ''),
    -- Both CASE branches are untyped literals, so PostgreSQL resolves the
    -- result to `text`; assigning text to an enum column is not an implicit
    -- cast, hence SQLSTATE 42804. The cast has to be explicit.
    (CASE WHEN NEW.email = 'owner@example.com' THEN 'admin' ELSE 'editor' END)::app.global_role
  )
  ON CONFLICT (id) DO UPDATE
    SET name = COALESCE(
          NULLIF(EXCLUDED.name, ''),
          app.profiles.name
        );
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_auth_user_updated ON auth.users;
CREATE TRIGGER on_auth_user_updated
  AFTER UPDATE OF raw_user_meta_data ON auth.users
  FOR EACH ROW EXECUTE FUNCTION app.handle_new_user();


-- ── 7. Expose the `app` schema to PostgREST ──────────────────────────────────
-- Every Supabase client in this codebase uses `db: { schema: 'app' }`. If the
-- schema is not in PostgREST's exposed list, every query fails with PGRST106
-- ("The schema must be one of the following: public, graphql_public") — which
-- is the state production was found in.
--
-- Also set it in Dashboard → Settings → API → Exposed schemas; the dashboard is
-- the durable source of truth and can overwrite this role setting.
ALTER ROLE authenticator SET pgrst.db_schemas = 'public, graphql_public, app';
NOTIFY pgrst, 'reload config';
NOTIFY pgrst, 'reload schema';

CREATE SCHEMA IF NOT EXISTS app;

-- Enum types
CREATE TYPE app.global_role AS ENUM ('admin', 'editor', 'viewer');
CREATE TYPE app.brand_role AS ENUM ('owner', 'editor', 'viewer');
CREATE TYPE app.article_status AS ENUM ('draft', 'in_review', 'approved', 'exported');
CREATE TYPE app.ingestion_status AS ENUM ('pending', 'processing', 'done', 'error');
CREATE TYPE app.generation_status AS ENUM ('success', 'error');
CREATE TYPE app.schedule_status AS ENUM ('pending', 'claimed', 'generating', 'done', 'error');
CREATE TYPE app.chunk_source AS ENUM ('doc', 'profile');
CREATE TYPE app.ai_provider AS ENUM ('openai', 'anthropic');

-- profiles (mirror of auth.users)
CREATE TABLE app.profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL DEFAULT '',
  global_role app.global_role NOT NULL DEFAULT 'editor',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- brands
CREATE TABLE app.brands (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  slug TEXT NOT NULL UNIQUE,
  logo_url TEXT,
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active','archived')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- brand_members
CREATE TABLE app.brand_members (
  brand_id UUID NOT NULL REFERENCES app.brands(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES app.profiles(id) ON DELETE CASCADE,
  brand_role app.brand_role NOT NULL DEFAULT 'viewer',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (brand_id, user_id)
);

-- brand_profiles
CREATE TABLE app.brand_profiles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  brand_id UUID NOT NULL UNIQUE REFERENCES app.brands(id) ON DELETE CASCADE,
  tone_of_voice TEXT,
  audience TEXT,
  key_messages TEXT,
  dos TEXT,
  donts TEXT,
  banned_words TEXT[] DEFAULT '{}',
  language TEXT[] NOT NULL DEFAULT '{es}',
  copy_examples TEXT,
  ctas TEXT,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- brand_documents
CREATE TABLE app.brand_documents (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  brand_id UUID NOT NULL REFERENCES app.brands(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  storage_path TEXT NOT NULL,
  file_type TEXT NOT NULL,
  ingestion_status app.ingestion_status NOT NULL DEFAULT 'pending',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- document_chunks with pgvector halfvec(1536)
CREATE EXTENSION IF NOT EXISTS vector;
CREATE TABLE app.document_chunks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  brand_id UUID NOT NULL REFERENCES app.brands(id) ON DELETE CASCADE,
  document_id UUID REFERENCES app.brand_documents(id) ON DELETE CASCADE,
  content TEXT NOT NULL,
  embedding halfvec(1536),
  source app.chunk_source NOT NULL DEFAULT 'doc',
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
-- HNSW index for cosine similarity
CREATE INDEX document_chunks_embedding_idx
  ON app.document_chunks USING hnsw (embedding halfvec_cosine_ops)
  WITH (m = 16, ef_construction = 64);
-- Index on brand_id for filtered search
CREATE INDEX document_chunks_brand_id_idx ON app.document_chunks (brand_id);

-- articles
CREATE TABLE app.articles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  brand_id UUID NOT NULL REFERENCES app.brands(id) ON DELETE CASCADE,
  author_id UUID NOT NULL REFERENCES app.profiles(id),
  status app.article_status NOT NULL DEFAULT 'draft',
  model_provider app.ai_provider NOT NULL DEFAULT 'anthropic',
  model_id TEXT NOT NULL,
  objective TEXT,
  keywords TEXT[] DEFAULT '{}',
  title TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- article_body
CREATE TABLE app.article_body (
  article_id UUID PRIMARY KEY REFERENCES app.articles(id) ON DELETE CASCADE,
  body_prosemirror JSONB NOT NULL DEFAULT '{"type":"doc","content":[]}',
  body_html TEXT,
  body_markdown TEXT,
  title_tag TEXT,
  meta_description TEXT,
  slug TEXT,
  jsonld JSONB,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- keywords
CREATE TABLE app.keywords (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  brand_id UUID NOT NULL REFERENCES app.brands(id) ON DELETE CASCADE,
  term TEXT NOT NULL,
  volume INTEGER,
  difficulty INTEGER,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (brand_id, term)
);

-- schedule_entries
CREATE TABLE app.schedule_entries (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  brand_id UUID NOT NULL REFERENCES app.brands(id) ON DELETE CASCADE,
  author_id UUID NOT NULL REFERENCES app.profiles(id),
  scheduled_at TIMESTAMPTZ NOT NULL,
  objective TEXT,
  keywords TEXT[] DEFAULT '{}',
  model_provider TEXT NOT NULL DEFAULT 'anthropic',
  model_id TEXT NOT NULL DEFAULT 'claude-sonnet-4-6',
  content_type TEXT,
  notes TEXT,
  status app.schedule_status NOT NULL DEFAULT 'pending',
  article_id UUID REFERENCES app.articles(id),
  claimed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- generations (cost ledger)
CREATE TABLE app.generations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  article_id UUID REFERENCES app.articles(id) ON DELETE SET NULL,
  brand_id UUID NOT NULL REFERENCES app.brands(id) ON DELETE CASCADE,
  provider TEXT NOT NULL,
  model_id TEXT NOT NULL,
  tokens_in INTEGER,
  tokens_out INTEGER,
  cost_usd NUMERIC(10,6),
  duration_ms INTEGER,
  status app.generation_status NOT NULL DEFAULT 'success',
  error TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- audit_log (append-only)
CREATE TABLE app.audit_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  actor_id UUID REFERENCES app.profiles(id) ON DELETE SET NULL,
  action TEXT NOT NULL,
  resource_type TEXT NOT NULL,
  resource_id TEXT,
  brand_id UUID REFERENCES app.brands(id) ON DELETE SET NULL,
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ai_models (server-side allowlist)
CREATE TABLE app.ai_models (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  provider app.ai_provider NOT NULL,
  model_id TEXT NOT NULL UNIQUE,
  label TEXT NOT NULL,
  capabilities TEXT[] NOT NULL DEFAULT '{}',
  active BOOLEAN NOT NULL DEFAULT TRUE,
  is_flagship BOOLEAN NOT NULL DEFAULT FALSE
);

-- Seed ai_models
INSERT INTO app.ai_models (provider, model_id, label, capabilities, active, is_flagship) VALUES
  ('anthropic', 'claude-opus-4-8', 'Claude Opus 4.8', ARRAY['text','vision'], TRUE, TRUE),
  ('anthropic', 'claude-sonnet-4-6', 'Claude Sonnet 4.6', ARRAY['text'], TRUE, FALSE),
  ('anthropic', 'claude-haiku-4-5-20251001', 'Claude Haiku 4.5', ARRAY['text'], TRUE, FALSE),
  ('openai', 'gpt-4o', 'GPT-4o', ARRAY['text','vision'], TRUE, FALSE),
  ('openai', 'gpt-4o-mini', 'GPT-4o Mini', ARRAY['text'], TRUE, FALSE);

-- Triggers for updated_at
CREATE OR REPLACE FUNCTION app.set_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN NEW.updated_at = NOW(); RETURN NEW; END; $$;

CREATE TRIGGER brands_updated_at BEFORE UPDATE ON app.brands FOR EACH ROW EXECUTE FUNCTION app.set_updated_at();
CREATE TRIGGER articles_updated_at BEFORE UPDATE ON app.articles FOR EACH ROW EXECUTE FUNCTION app.set_updated_at();
CREATE TRIGGER article_body_updated_at BEFORE UPDATE ON app.article_body FOR EACH ROW EXECUTE FUNCTION app.set_updated_at();
CREATE TRIGGER brand_profiles_updated_at BEFORE UPDATE ON app.brand_profiles FOR EACH ROW EXECUTE FUNCTION app.set_updated_at();

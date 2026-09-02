-- Enable RLS on all tables
ALTER TABLE app.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE app.brands ENABLE ROW LEVEL SECURITY;
ALTER TABLE app.brand_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE app.brand_profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE app.brand_documents ENABLE ROW LEVEL SECURITY;
ALTER TABLE app.document_chunks ENABLE ROW LEVEL SECURITY;
ALTER TABLE app.articles ENABLE ROW LEVEL SECURITY;
ALTER TABLE app.article_body ENABLE ROW LEVEL SECURITY;
ALTER TABLE app.keywords ENABLE ROW LEVEL SECURITY;
ALTER TABLE app.schedule_entries ENABLE ROW LEVEL SECURITY;
ALTER TABLE app.generations ENABLE ROW LEVEL SECURITY;
ALTER TABLE app.audit_log ENABLE ROW LEVEL SECURITY;
ALTER TABLE app.ai_models ENABLE ROW LEVEL SECURITY;

-- profiles
CREATE POLICY profiles_self ON app.profiles FOR ALL USING (id = auth.uid());
CREATE POLICY profiles_admin ON app.profiles FOR ALL USING (app.is_admin());

-- brands
CREATE POLICY brands_read ON app.brands FOR SELECT USING (app.can_read_brand(id));
CREATE POLICY brands_write ON app.brands FOR ALL USING (app.is_admin());

-- brand_members
CREATE POLICY brand_members_read ON app.brand_members FOR SELECT USING (app.can_read_brand(brand_id));
CREATE POLICY brand_members_admin ON app.brand_members FOR ALL USING (app.is_admin());

-- brand_profiles
CREATE POLICY brand_profiles_read ON app.brand_profiles FOR SELECT USING (app.can_read_brand(brand_id));
CREATE POLICY brand_profiles_write ON app.brand_profiles FOR ALL USING (app.can_write_brand(brand_id));

-- brand_documents
CREATE POLICY brand_documents_read ON app.brand_documents FOR SELECT USING (app.can_read_brand(brand_id));
CREATE POLICY brand_documents_write ON app.brand_documents FOR ALL USING (app.can_write_brand(brand_id));

-- document_chunks (readers only; writes via service-role in Inngest)
CREATE POLICY chunks_read ON app.document_chunks FOR SELECT USING (app.can_read_brand(brand_id));

-- articles
CREATE POLICY articles_read ON app.articles FOR SELECT USING (app.can_read_brand(brand_id));
CREATE POLICY articles_write ON app.articles FOR ALL USING (app.can_write_brand(brand_id));

-- article_body
CREATE POLICY article_body_read ON app.article_body FOR SELECT
  USING (EXISTS (SELECT 1 FROM app.articles a WHERE a.id = article_id AND app.can_read_brand(a.brand_id)));
CREATE POLICY article_body_write ON app.article_body FOR ALL
  USING (EXISTS (SELECT 1 FROM app.articles a WHERE a.id = article_id AND app.can_write_brand(a.brand_id)));

-- keywords
CREATE POLICY keywords_read ON app.keywords FOR SELECT USING (app.can_read_brand(brand_id));
CREATE POLICY keywords_write ON app.keywords FOR ALL USING (app.can_write_brand(brand_id));

-- schedule_entries
CREATE POLICY schedule_read ON app.schedule_entries FOR SELECT USING (app.can_read_brand(brand_id));
CREATE POLICY schedule_write ON app.schedule_entries FOR ALL USING (app.can_write_brand(brand_id));

-- generations (read-only for users; write via service-role)
CREATE POLICY generations_read ON app.generations FOR SELECT USING (app.can_read_brand(brand_id));

-- audit_log: anyone in the team can read; only admin can see all; no UPDATE/DELETE
CREATE POLICY audit_read_own ON app.audit_log FOR SELECT USING (app.is_admin() OR actor_id = auth.uid());
-- Append-only: revoke UPDATE and DELETE
REVOKE UPDATE, DELETE ON app.audit_log FROM authenticated;

-- ai_models: readable by all authenticated
CREATE POLICY ai_models_read ON app.ai_models FOR SELECT USING (auth.uid() IS NOT NULL);

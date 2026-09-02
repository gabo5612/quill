-- Helper functions (SECURITY DEFINER to avoid RLS recursion)
CREATE OR REPLACE FUNCTION app.current_user_id()
RETURNS UUID LANGUAGE sql STABLE SECURITY DEFINER AS $$
  SELECT auth.uid();
$$;

CREATE OR REPLACE FUNCTION app.is_admin()
RETURNS BOOLEAN LANGUAGE sql STABLE SECURITY DEFINER AS $$
  SELECT COALESCE(
    (SELECT global_role = 'admin' FROM app.profiles WHERE id = auth.uid()),
    FALSE
  );
$$;

CREATE OR REPLACE FUNCTION app.brand_role(p_brand_id UUID)
RETURNS TEXT LANGUAGE sql STABLE SECURITY DEFINER AS $$
  SELECT brand_role::TEXT FROM app.brand_members
  WHERE brand_id = p_brand_id AND user_id = auth.uid()
  LIMIT 1;
$$;

CREATE OR REPLACE FUNCTION app.can_read_brand(p_brand_id UUID)
RETURNS BOOLEAN LANGUAGE sql STABLE SECURITY DEFINER AS $$
  SELECT app.is_admin() OR EXISTS (
    SELECT 1 FROM app.brand_members
    WHERE brand_id = p_brand_id AND user_id = auth.uid()
  );
$$;

CREATE OR REPLACE FUNCTION app.can_write_brand(p_brand_id UUID)
RETURNS BOOLEAN LANGUAGE sql STABLE SECURITY DEFINER AS $$
  SELECT app.is_admin() OR EXISTS (
    SELECT 1 FROM app.brand_members
    WHERE brand_id = p_brand_id AND user_id = auth.uid()
    AND brand_role IN ('owner', 'editor')
  );
$$;

-- DB trigger: reject non @example.com emails
CREATE OR REPLACE FUNCTION app.check_email_domain()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  IF NEW.email NOT LIKE '%@example.com' THEN
    RAISE EXCEPTION 'Only @example.com accounts are allowed';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER check_email_domain_on_profile
  BEFORE INSERT OR UPDATE OF email ON app.profiles
  FOR EACH ROW EXECUTE FUNCTION app.check_email_domain();

-- Auto-create profile on new user
CREATE OR REPLACE FUNCTION app.handle_new_user()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  INSERT INTO app.profiles (id, email, name, global_role)
  VALUES (
    NEW.id,
    NEW.email,
    COALESCE(NEW.raw_user_meta_data->>'full_name', ''),
    CASE WHEN NEW.email = 'owner@example.com' THEN 'admin' ELSE 'editor' END
  )
  ON CONFLICT (id) DO NOTHING;
  RETURN NEW;
END;
$$;

CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION app.handle_new_user();

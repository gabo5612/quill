-- Fix mutable search_path on all app functions (security hardening)
CREATE OR REPLACE FUNCTION app.set_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql
SET search_path = ''
AS $$
BEGIN NEW.updated_at = NOW(); RETURN NEW; END;
$$;

CREATE OR REPLACE FUNCTION app.current_user_id()
RETURNS UUID LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT auth.uid();
$$;

CREATE OR REPLACE FUNCTION app.is_admin()
RETURNS BOOLEAN LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT COALESCE(
    (SELECT global_role = 'admin' FROM app.profiles WHERE id = auth.uid()),
    FALSE
  );
$$;

CREATE OR REPLACE FUNCTION app.brand_role(p_brand_id UUID)
RETURNS TEXT LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT brand_role::TEXT FROM app.brand_members
  WHERE brand_id = p_brand_id AND user_id = auth.uid()
  LIMIT 1;
$$;

CREATE OR REPLACE FUNCTION app.can_read_brand(p_brand_id UUID)
RETURNS BOOLEAN LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT app.is_admin() OR EXISTS (
    SELECT 1 FROM app.brand_members
    WHERE brand_id = p_brand_id AND user_id = auth.uid()
  );
$$;

CREATE OR REPLACE FUNCTION app.can_write_brand(p_brand_id UUID)
RETURNS BOOLEAN LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT app.is_admin() OR EXISTS (
    SELECT 1 FROM app.brand_members
    WHERE brand_id = p_brand_id AND user_id = auth.uid()
    AND brand_role IN ('owner', 'editor')
  );
$$;

CREATE OR REPLACE FUNCTION app.check_email_domain()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  IF NEW.email NOT LIKE '%@example.com' THEN
    RAISE EXCEPTION 'Only @example.com accounts are allowed';
  END IF;
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION app.handle_new_user()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER
SET search_path = ''
AS $$
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

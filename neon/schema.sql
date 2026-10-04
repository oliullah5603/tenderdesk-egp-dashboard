-- Infinico Tender Bd account approval schema.
-- Run on the dedicated infinico-tender-bd Neon project only.

CREATE TABLE IF NOT EXISTS public.infinico_profiles (
  id text PRIMARY KEY,
  email text NOT NULL UNIQUE,
  full_name text NOT NULL,
  phone text NOT NULL,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'blocked')),
  role text NOT NULL DEFAULT 'member' CHECK (role IN ('member', 'admin')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.infinico_account_invites (
  email text PRIMARY KEY,
  full_name text NOT NULL,
  role text NOT NULL DEFAULT 'member' CHECK (role IN ('member', 'admin')),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.infinico_admin_config (
  key text PRIMARY KEY,
  value text NOT NULL
);

-- The Neon project owner account email bootstraps the first app administrator.
INSERT INTO public.infinico_admin_config(key, value)
VALUES ('bootstrap_admin_email', 'oahad5603@gmail.com')
ON CONFLICT (key) DO NOTHING;

ALTER TABLE public.infinico_profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.infinico_account_invites ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.infinico_admin_config ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION public.infinico_is_admin()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.infinico_profiles p
    WHERE p.id = auth.user_id() AND p.role = 'admin' AND p.status = 'approved'
  );
$$;

DROP POLICY IF EXISTS profile_read_self_or_admin ON public.infinico_profiles;
CREATE POLICY profile_read_self_or_admin ON public.infinico_profiles
FOR SELECT TO authenticated
USING (id = auth.user_id() OR public.infinico_is_admin());

CREATE OR REPLACE FUNCTION public.infinico_register_profile(target_name text, target_phone text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  current_id text := auth.user_id();
  current_email text;
  saved_invite public.infinico_account_invites%ROWTYPE;
  desired_status text := 'pending';
  desired_role text := 'member';
BEGIN
  IF current_id IS NULL THEN
    RAISE EXCEPTION 'A valid Neon Auth session is required';
  END IF;
  SELECT lower(u.email) INTO current_email FROM neon_auth."user" u WHERE u.id = current_id;
  IF current_email IS NULL OR current_email = '' THEN
    RAISE EXCEPTION 'Neon Auth user profile is not available yet; try again shortly';
  END IF;
  IF length(trim(coalesce(target_name, ''))) < 2 THEN
    RAISE EXCEPTION 'Enter your full name';
  END IF;
  IF length(regexp_replace(coalesce(target_phone, ''), '[^0-9]', '', 'g')) < 9 THEN
    RAISE EXCEPTION 'Enter a valid mobile number';
  END IF;

  SELECT * INTO saved_invite FROM public.infinico_account_invites WHERE email = current_email;
  IF FOUND THEN
    desired_status := 'approved';
    desired_role := saved_invite.role;
  ELSIF current_email = (SELECT value FROM public.infinico_admin_config WHERE key = 'bootstrap_admin_email') THEN
    desired_status := 'approved';
    desired_role := 'admin';
  END IF;

  INSERT INTO public.infinico_profiles(id, email, full_name, phone, status, role)
  VALUES (current_id, current_email, trim(target_name), trim(target_phone), desired_status, desired_role)
  ON CONFLICT (id) DO NOTHING;

  IF saved_invite.email IS NOT NULL THEN
    DELETE FROM public.infinico_account_invites WHERE email = current_email;
  END IF;

  RETURN (SELECT jsonb_build_object('status', p.status, 'role', p.role)
          FROM public.infinico_profiles p WHERE p.id = current_id);
END;
$$;

CREATE OR REPLACE FUNCTION public.infinico_admin_set_user_access(target_user_id text, next_status text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
BEGIN
  IF NOT public.infinico_is_admin() THEN RAISE EXCEPTION 'Administrator access required'; END IF;
  IF next_status NOT IN ('pending', 'approved', 'blocked') THEN RAISE EXCEPTION 'Invalid account status'; END IF;
  IF target_user_id = auth.user_id() AND next_status <> 'approved' THEN
    RAISE EXCEPTION 'You cannot revoke your own administrator access';
  END IF;
  UPDATE public.infinico_profiles
  SET status = next_status, updated_at = now()
  WHERE id = target_user_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Account not found'; END IF;
END;
$$;

CREATE OR REPLACE FUNCTION public.infinico_admin_create_invite(target_email text, target_name text, target_role text DEFAULT 'member')
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE normalized_email text := lower(trim(target_email));
BEGIN
  IF NOT public.infinico_is_admin() THEN RAISE EXCEPTION 'Administrator access required'; END IF;
  IF normalized_email = '' OR position('@' IN normalized_email) < 2 THEN RAISE EXCEPTION 'Enter a valid email address'; END IF;
  IF target_role NOT IN ('member', 'admin') THEN RAISE EXCEPTION 'Invalid role'; END IF;
  IF length(trim(coalesce(target_name, ''))) < 2 THEN RAISE EXCEPTION 'Enter a full name'; END IF;

  UPDATE public.infinico_profiles
  SET full_name = trim(target_name), role = target_role, status = 'approved', updated_at = now()
  WHERE email = normalized_email;

  IF NOT FOUND THEN
    INSERT INTO public.infinico_account_invites(email, full_name, role)
    VALUES (normalized_email, trim(target_name), target_role)
    ON CONFLICT (email) DO UPDATE
    SET full_name = EXCLUDED.full_name, role = EXCLUDED.role, created_at = now();
  END IF;
END;
$$;

-- Keep the account tables and bootstrap setting out of anonymous access.
REVOKE ALL ON public.infinico_profiles, public.infinico_account_invites, public.infinico_admin_config FROM PUBLIC, anon, authenticated;
GRANT USAGE ON SCHEMA public TO authenticated;
GRANT SELECT ON public.infinico_profiles TO authenticated;
REVOKE ALL ON FUNCTION public.infinico_is_admin() FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.infinico_register_profile(text, text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.infinico_admin_set_user_access(text, text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.infinico_admin_create_invite(text, text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.infinico_is_admin() TO authenticated;
GRANT EXECUTE ON FUNCTION public.infinico_register_profile(text, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.infinico_admin_set_user_access(text, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.infinico_admin_create_invite(text, text, text) TO authenticated;

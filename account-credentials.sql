-- Let club administrators change a same-club user's login name and/or password.
-- Run after multi-club.sql. Credentials remain managed by Supabase Auth.
BEGIN;

CREATE OR REPLACE FUNCTION public.admin_update_user_credentials(
  p_user_id uuid,
  p_username text,
  p_password text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  v_profile public.app_profiles%ROWTYPE;
  v_username text;
  v_email text;
BEGIN
  IF NOT public.is_app_admin() THEN
    RAISE EXCEPTION 'Club administrator account required.' USING ERRCODE = '42501';
  END IF;
  IF p_user_id IS NULL OR (p_username IS NULL AND p_password IS NULL) THEN
    RAISE EXCEPTION 'Enter a username or a new password.' USING ERRCODE = '22023';
  END IF;

  IF p_username IS NOT NULL THEN
    v_username := lower(trim(p_username));
    IF v_username !~ '^[a-z0-9][a-z0-9_.-]{2,31}$' THEN
      RAISE EXCEPTION 'Username must be 3–32 letters, numbers, dots, hyphens or underscores.' USING ERRCODE = '22023';
    END IF;
  END IF;
  IF p_password IS NOT NULL AND length(p_password) < 8 THEN
    RAISE EXCEPTION 'Password must be at least 8 characters.' USING ERRCODE = '22023';
  END IF;

  SELECT p.* INTO v_profile
  FROM public.app_profiles AS p
  WHERE p.id = p_user_id
    AND p.club_id = public.current_club_id()
    AND p.role IN ('admin', 'staff', 'member')
  FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'User account not found in your club.' USING ERRCODE = '22023';
  END IF;

  IF v_username IS NOT NULL THEN
    IF EXISTS (
      SELECT 1 FROM public.app_profiles AS p
      WHERE lower(p.username) = v_username AND p.id <> p_user_id
    ) THEN
      RAISE EXCEPTION 'That username is already in use.' USING ERRCODE = '23505';
    END IF;

    v_email := v_username || '@users.mayma.invalid';
    UPDATE auth.users AS u
      SET email = v_email,
          email_confirmed_at = COALESCE(u.email_confirmed_at, now()),
          raw_user_meta_data = COALESCE(u.raw_user_meta_data, '{}'::jsonb) || jsonb_build_object('username', v_username),
          updated_at = now()
      WHERE u.id = p_user_id;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'User account not found.' USING ERRCODE = '22023';
    END IF;
    UPDATE public.app_profiles SET username = v_username WHERE id = p_user_id;
  END IF;

  IF p_password IS NOT NULL THEN
    UPDATE auth.users
      SET encrypted_password = extensions.crypt(p_password, extensions.gen_salt('bf')),
          updated_at = now()
      WHERE id = p_user_id;
  END IF;

  RETURN jsonb_build_object(
    'status', 'updated',
    'username', COALESCE(v_username, v_profile.username)
  );
END;
$function$;

REVOKE ALL ON FUNCTION public.admin_update_user_credentials(uuid, text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_update_user_credentials(uuid, text, text) TO authenticated;

COMMENT ON FUNCTION public.admin_update_user_credentials(uuid, text, text) IS
  'Allows an active club administrator to update a member or team account in the same club.';

COMMIT;

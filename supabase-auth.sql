-- Mayma Clocking: Supabase-only (Supabase Auth + PostgreSQL).
-- Usernames + passwords only, no email. On a fresh database the app asks for a
-- superadmin account; after that there is no public registration.
--
-- Fresh database:  run schema.sql, then this file.
-- Already ran firebase-supabase.sql:  just run this file (it undoes that change).
-- Safe to re-run.
BEGIN;

-- Do not run this after multi-club.sql: it would remove the club columns.
DO $$
BEGIN
  IF to_regclass('public.clubs') IS NOT NULL AND EXISTS (
       SELECT 1 FROM information_schema.columns WHERE table_schema='public'
       AND table_name='app_profiles' AND column_name='id' AND data_type='uuid') THEN
    RAISE EXCEPTION 'multi-club.sql was already applied. Do not run supabase-auth.sql again.';
  END IF;
END $$;

-- 1. Drop every policy so column/function changes below cannot be blocked ----------
DO $$
DECLARE r record;
BEGIN
  FOR r IN SELECT schemaname, tablename, policyname FROM pg_policies
           WHERE schemaname='public' AND tablename IN
           ('app_profiles','members','race_points','races','race_entries','clock_events','clubs')
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON %I.%I', r.policyname, r.schemaname, r.tablename);
  END LOOP;
END $$;

-- 2. Undo the Firebase version if it was applied ------------------------------------
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns
             WHERE table_schema='public' AND table_name='app_profiles'
               AND column_name='id' AND data_type='text') THEN
    -- Firebase profiles point at Firebase users that no longer apply.
    DELETE FROM public.app_profiles;
    ALTER TABLE public.app_profiles DROP CONSTRAINT IF EXISTS app_profiles_id_fkey;
    ALTER TABLE public.app_profiles ALTER COLUMN id TYPE uuid USING id::uuid;
  END IF;
END $$;
ALTER TABLE public.app_profiles DROP CONSTRAINT IF EXISTS app_profiles_id_fkey;
ALTER TABLE public.app_profiles
  ADD CONSTRAINT app_profiles_id_fkey FOREIGN KEY (id) REFERENCES auth.users(id) ON DELETE CASCADE;

ALTER TABLE public.app_profiles DROP COLUMN IF EXISTS club_id;
ALTER TABLE public.members      DROP COLUMN IF EXISTS club_id;
ALTER TABLE public.race_points  DROP COLUMN IF EXISTS club_id;
ALTER TABLE public.races        DROP COLUMN IF EXISTS club_id;
DROP TABLE IF EXISTS public.clubs;
CREATE UNIQUE INDEX IF NOT EXISTS members_member_no_unique ON public.members (member_no);

DROP FUNCTION IF EXISTS public.register_club(text,text);
DROP FUNCTION IF EXISTS public.admin_link_member_login(bigint,text,text);
DROP FUNCTION IF EXISTS public.admin_get_member_uid(bigint);
DROP FUNCTION IF EXISTS public.current_club_id();
DROP FUNCTION IF EXISTS public.current_uid();
DROP FUNCTION IF EXISTS public.bootstrap_first_admin(text);

-- 3. Helper functions ------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.current_app_role()
RETURNS text LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $$
  SELECT p.role FROM public.app_profiles p WHERE p.id = (SELECT auth.uid())
$$;
CREATE OR REPLACE FUNCTION public.current_member_id()
RETURNS bigint LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $$
  SELECT p.member_id FROM public.app_profiles p WHERE p.id = (SELECT auth.uid()) AND p.role = 'member'
$$;
CREATE OR REPLACE FUNCTION public.is_app_admin()
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $$
  SELECT COALESCE(public.current_app_role() = 'admin', false)
$$;
REVOKE ALL ON FUNCTION public.current_app_role(), public.current_member_id(), public.is_app_admin() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.current_app_role(), public.current_member_id(), public.is_app_admin() TO authenticated;

-- 4. Row-level security -----------------------------------------------------------------
ALTER TABLE public.app_profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.members ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.race_points ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.races ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.race_entries ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.clock_events ENABLE ROW LEVEL SECURITY;

CREATE POLICY profile_read_self_or_admin ON public.app_profiles
  FOR SELECT TO authenticated USING (id=(SELECT auth.uid()) OR public.is_app_admin());
CREATE POLICY members_read_authorized ON public.members
  FOR SELECT TO authenticated USING (public.is_app_admin() OR id=public.current_member_id());
CREATE POLICY members_admin_write ON public.members
  FOR ALL TO authenticated USING (public.is_app_admin()) WITH CHECK (public.is_app_admin());
CREATE POLICY points_read_authenticated ON public.race_points
  FOR SELECT TO authenticated USING (true);
CREATE POLICY points_admin_write ON public.race_points
  FOR ALL TO authenticated USING (public.is_app_admin()) WITH CHECK (public.is_app_admin());
CREATE POLICY races_read_authenticated ON public.races
  FOR SELECT TO authenticated USING (true);
CREATE POLICY races_admin_write ON public.races
  FOR ALL TO authenticated USING (public.is_app_admin()) WITH CHECK (public.is_app_admin());
CREATE POLICY entries_read_authorized ON public.race_entries
  FOR SELECT TO authenticated USING (public.is_app_admin() OR member_id=public.current_member_id());
CREATE POLICY entries_admin_write ON public.race_entries
  FOR ALL TO authenticated USING (public.is_app_admin()) WITH CHECK (public.is_app_admin());
CREATE POLICY clocks_read_authorized ON public.clock_events
  FOR SELECT TO authenticated USING (
    public.is_app_admin() OR EXISTS (
      SELECT 1 FROM public.race_entries e
      WHERE e.id=clock_events.race_entry_id AND e.member_id=public.current_member_id()));
CREATE POLICY clocks_admin_write ON public.clock_events
  FOR ALL TO authenticated USING (public.is_app_admin()) WITH CHECK (public.is_app_admin());

REVOKE ALL ON public.app_profiles, public.members, public.race_points, public.races,
  public.race_entries, public.clock_events FROM anon, PUBLIC;
GRANT USAGE ON SCHEMA public TO authenticated;
GRANT SELECT ON public.app_profiles, public.members, public.race_points, public.races,
  public.race_entries, public.clock_events TO authenticated;
GRANT INSERT, UPDATE, DELETE ON public.members, public.race_points, public.races,
  public.race_entries, public.clock_events TO authenticated;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO authenticated;

-- 5. Admin clocking (no club scoping any more) ----------------------------------------------
CREATE OR REPLACE FUNCTION public.admin_record_clock(p_entry_id bigint)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  v_entry public.race_entries%ROWTYPE;
  v_race public.races%ROWTYPE;
  v_now timestamp without time zone;
  v_clock public.clock_events%ROWTYPE;
BEGIN
  IF NOT public.is_app_admin() THEN RAISE EXCEPTION 'Administrator account required.' USING ERRCODE='42501'; END IF;
  SELECT e.* INTO v_entry FROM public.race_entries e WHERE e.id=p_entry_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Race entry not found.' USING ERRCODE='22023'; END IF;
  SELECT r.* INTO v_race FROM public.races r WHERE r.id=v_entry.race_id;
  IF v_race.status <> 'open' THEN RAISE EXCEPTION 'This race is not open for clocking.' USING ERRCODE='22023'; END IF;
  v_now := clock_timestamp() AT TIME ZONE 'UTC';
  IF v_now <= v_race.release_at_utc THEN RAISE EXCEPTION 'This race has not started yet.' USING ERRCODE='22023'; END IF;
  SELECT c.* INTO v_clock FROM public.clock_events c WHERE c.race_entry_id=v_entry.id;
  IF FOUND THEN RETURN jsonb_build_object('status','duplicate','message','This pigeon already has a receipt.','receipt_id',v_clock.id); END IF;
  INSERT INTO public.clock_events(race_entry_id,pigeon_ring,received_at_utc,source,verification,created_by_admin_id)
    VALUES (v_entry.id,v_entry.pigeon_ring,v_now,'admin_manual','provisional',NULL) RETURNING * INTO v_clock;
  RETURN jsonb_build_object('status','accepted','message','Clocking received and marked provisional.','receipt_id',v_clock.id,'received_at_utc',v_clock.received_at_utc);
END;
$$;
REVOKE ALL ON FUNCTION public.admin_record_clock(bigint) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_record_clock(bigint) TO authenticated;

-- 6. Username + password accounts, created inside the database --------------------------------
CREATE EXTENSION IF NOT EXISTS pgcrypto WITH SCHEMA extensions;

CREATE OR REPLACE FUNCTION public._create_auth_user(p_username text, p_password text)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  v_username text := lower(trim(p_username));
  v_email text := lower(trim(p_username)) || '@users.mayma.invalid';
  v_id uuid := gen_random_uuid();
BEGIN
  IF v_username !~ '^[a-z0-9][a-z0-9_.-]{2,31}$' THEN
    RAISE EXCEPTION 'Username must be 3–32 letters, numbers, dots, hyphens or underscores.' USING ERRCODE='22023';
  END IF;
  IF p_password IS NULL OR length(p_password) < 8 THEN
    RAISE EXCEPTION 'Password must be at least 8 characters.' USING ERRCODE='22023';
  END IF;
  IF EXISTS (SELECT 1 FROM public.app_profiles p WHERE lower(p.username)=v_username)
     OR EXISTS (SELECT 1 FROM auth.users u WHERE lower(u.email)=v_email) THEN
    RAISE EXCEPTION 'That username is already in use.' USING ERRCODE='23505';
  END IF;
  INSERT INTO auth.users (
    instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
    raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
    confirmation_token, recovery_token, email_change_token_new, email_change,
    email_change_token_current, reauthentication_token
  ) VALUES (
    '00000000-0000-0000-0000-000000000000', v_id, 'authenticated', 'authenticated', v_email,
    extensions.crypt(p_password, extensions.gen_salt('bf')), now(),
    '{"provider":"email","providers":["email"]}'::jsonb,
    jsonb_build_object('username', v_username),
    now(), now(), '', '', '', '', '', ''
  );
  INSERT INTO auth.identities (provider_id, user_id, identity_data, provider, last_sign_in_at, created_at, updated_at)
  VALUES (v_id::text, v_id,
    jsonb_build_object('sub', v_id::text, 'email', v_email, 'email_verified', true, 'phone_verified', false),
    'email', now(), now(), now());
  RETURN v_id;
END;
$$;
REVOKE ALL ON FUNCTION public._create_auth_user(text,text) FROM PUBLIC, anon, authenticated;

-- True once a superadmin exists. The app uses this to decide whether to show first-time setup.
CREATE OR REPLACE FUNCTION public.has_admin_account()
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $$
  SELECT EXISTS (SELECT 1 FROM public.app_profiles p WHERE p.role='admin')
$$;
REVOKE ALL ON FUNCTION public.has_admin_account() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.has_admin_account() TO anon, authenticated;

-- First-time setup: works only while the database has no administrator.
CREATE OR REPLACE FUNCTION public.create_first_admin(p_username text, p_password text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE v_id uuid; v_username text := lower(trim(p_username));
BEGIN
  LOCK TABLE public.app_profiles IN EXCLUSIVE MODE;
  IF EXISTS (SELECT 1 FROM public.app_profiles p WHERE p.role='admin') THEN
    RAISE EXCEPTION 'The superadmin account has already been created.' USING ERRCODE='42501';
  END IF;
  v_id := public._create_auth_user(v_username, p_password);
  INSERT INTO public.app_profiles(id, username, role, member_id) VALUES (v_id, v_username, 'admin', NULL);
  RETURN jsonb_build_object('status','created','username',v_username);
END;
$$;
REVOKE ALL ON FUNCTION public.create_first_admin(text,text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.create_first_admin(text,text) TO anon, authenticated;

CREATE OR REPLACE FUNCTION public.admin_create_member_account(p_member_id bigint, p_username text, p_password text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE v_id uuid; v_username text := lower(trim(p_username));
BEGIN
  IF NOT public.is_app_admin() THEN RAISE EXCEPTION 'Administrator account required.' USING ERRCODE='42501'; END IF;
  IF NOT EXISTS (SELECT 1 FROM public.members m WHERE m.id=p_member_id) THEN
    RAISE EXCEPTION 'Member not found.' USING ERRCODE='22023';
  END IF;
  IF EXISTS (SELECT 1 FROM public.app_profiles p WHERE p.member_id=p_member_id) THEN
    RAISE EXCEPTION 'This member already has a login.' USING ERRCODE='23505';
  END IF;
  v_id := public._create_auth_user(v_username, p_password);
  INSERT INTO public.app_profiles(id, username, role, member_id) VALUES (v_id, v_username, 'member', p_member_id);
  RETURN jsonb_build_object('status','created','username',v_username);
END;
$$;
REVOKE ALL ON FUNCTION public.admin_create_member_account(bigint,text,text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_create_member_account(bigint,text,text) TO authenticated;

CREATE OR REPLACE FUNCTION public.admin_set_member_password(p_member_id bigint, p_password text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE v_user uuid;
BEGIN
  IF NOT public.is_app_admin() THEN RAISE EXCEPTION 'Administrator account required.' USING ERRCODE='42501'; END IF;
  IF p_password IS NULL OR length(p_password) < 8 THEN
    RAISE EXCEPTION 'Password must be at least 8 characters.' USING ERRCODE='22023';
  END IF;
  SELECT p.id INTO v_user FROM public.app_profiles p WHERE p.member_id=p_member_id AND p.role='member';
  IF v_user IS NULL THEN RAISE EXCEPTION 'This member has no login yet.' USING ERRCODE='22023'; END IF;
  UPDATE auth.users SET encrypted_password=extensions.crypt(p_password, extensions.gen_salt('bf')), updated_at=now() WHERE id=v_user;
  RETURN jsonb_build_object('status','updated');
END;
$$;
REVOKE ALL ON FUNCTION public.admin_set_member_password(bigint,text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_set_member_password(bigint,text) TO authenticated;

-- Deleting a member also deletes their login.
CREATE OR REPLACE FUNCTION public.delete_member_auth_user()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
BEGIN
  DELETE FROM auth.users WHERE id IN (SELECT p.id FROM public.app_profiles p WHERE p.member_id=OLD.id AND p.role='member');
  RETURN OLD;
END;
$$;
REVOKE ALL ON FUNCTION public.delete_member_auth_user() FROM PUBLIC, anon, authenticated;
DROP TRIGGER IF EXISTS members_delete_auth_user ON public.members;
CREATE TRIGGER members_delete_auth_user BEFORE DELETE ON public.members
  FOR EACH ROW EXECUTE FUNCTION public.delete_member_auth_user();

COMMIT;

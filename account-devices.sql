-- AvilonX Clocking: one device per account (Club settings).
--
-- When the club administrator turns on "One device per account", each of the
-- club's accounts (administrators, staff and members) can be signed in on one
-- device at a time. Signing in on another device asks first; confirming signs
-- the other device out (its Supabase sessions are ended, and the app there
-- signs out within a minute).
--
-- Each browser has a random device id (kept in that browser). The Super Admin
-- is not affected. Run after club-settings.sql. Safe to run again.

ALTER TABLE public.clubs ADD COLUMN IF NOT EXISTS single_device boolean NOT NULL DEFAULT false;

CREATE TABLE IF NOT EXISTS public.account_devices (
  user_id uuid PRIMARY KEY,
  device_id text NOT NULL CHECK (length(device_id) BETWEEN 8 AND 80),
  device_label text NOT NULL DEFAULT '' CHECK (length(device_label) <= 80),
  signed_in_at timestamptz NOT NULL DEFAULT now(),
  last_seen_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.account_devices ENABLE ROW LEVEL SECURITY;
-- No direct access: only the functions below.
REVOKE ALL ON public.account_devices FROM PUBLIC, anon, authenticated;

-- Whether the signed-in account's club uses one device per account.
CREATE OR REPLACE FUNCTION public._single_device_applies()
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $$
  SELECT coalesce((SELECT c.single_device FROM public.app_profiles AS p JOIN public.clubs AS c ON c.id = p.club_id
                   WHERE p.id = auth.uid() AND p.role <> 'superadmin'), false);
$$;
REVOKE ALL ON FUNCTION public._single_device_applies() FROM PUBLIC, anon, authenticated;

-- Called after signing in (and when the app opens).
--   ok:           this device holds the account (now recorded).
--   other_device: another device holds it; nothing changed. Call again with
--                 p_force = true to sign that device out and continue here.
CREATE OR REPLACE FUNCTION public.claim_account_device(p_device_id text, p_device_label text DEFAULT '', p_force boolean DEFAULT false)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  v_user uuid := auth.uid();
  v_row public.account_devices%ROWTYPE;
  v_session text := nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'session_id';
BEGIN
  IF v_user IS NULL THEN RAISE EXCEPTION 'Sign in first.' USING ERRCODE = '42501'; END IF;
  IF NOT public._single_device_applies() THEN RETURN jsonb_build_object('status', 'ok'); END IF;
  SELECT * INTO v_row FROM public.account_devices WHERE user_id = v_user;
  IF FOUND AND v_row.device_id <> p_device_id AND NOT p_force THEN
    RETURN jsonb_build_object('status', 'other_device', 'device_label', v_row.device_label, 'last_seen_at', v_row.last_seen_at);
  END IF;
  IF FOUND AND v_row.device_id <> p_device_id AND p_force THEN
    -- End the other device's Supabase sessions (keep this one).
    IF to_regclass('auth.sessions') IS NOT NULL THEN
      EXECUTE 'DELETE FROM auth.sessions WHERE user_id = $1 AND ($2 IS NULL OR id::text <> $2)' USING v_user, v_session;
    END IF;
  END IF;
  INSERT INTO public.account_devices (user_id, device_id, device_label, signed_in_at, last_seen_at)
  VALUES (v_user, p_device_id, left(coalesce(p_device_label, ''), 80), now(), now())
  ON CONFLICT (user_id) DO UPDATE SET device_id = EXCLUDED.device_id, device_label = EXCLUDED.device_label,
    signed_in_at = CASE WHEN public.account_devices.device_id = EXCLUDED.device_id THEN public.account_devices.signed_in_at ELSE now() END,
    last_seen_at = now();
  RETURN jsonb_build_object('status', 'ok');
END;
$$;

-- Called every minute by the app: replaced = another device took over.
CREATE OR REPLACE FUNCTION public.check_account_device(p_device_id text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  v_user uuid := auth.uid();
  v_row public.account_devices%ROWTYPE;
BEGIN
  IF v_user IS NULL OR NOT public._single_device_applies() THEN RETURN jsonb_build_object('status', 'ok'); END IF;
  SELECT * INTO v_row FROM public.account_devices WHERE user_id = v_user;
  IF NOT FOUND THEN RETURN jsonb_build_object('status', 'unclaimed'); END IF;
  IF v_row.device_id <> p_device_id THEN
    RETURN jsonb_build_object('status', 'replaced', 'device_label', v_row.device_label);
  END IF;
  UPDATE public.account_devices SET last_seen_at = now() WHERE user_id = v_user;
  RETURN jsonb_build_object('status', 'ok');
END;
$$;

-- Signing out frees the account for another device.
CREATE OR REPLACE FUNCTION public.release_account_device(p_device_id text)
RETURNS void LANGUAGE sql SECURITY DEFINER SET search_path = '' AS $$
  DELETE FROM public.account_devices WHERE user_id = auth.uid() AND device_id = p_device_id;
$$;

-- Club settings: turn one device per account on or off (club administrator).
CREATE OR REPLACE FUNCTION public.admin_set_single_device(p_on boolean)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  v_club bigint := public.current_club_id();
BEGIN
  IF NOT public.is_app_admin() OR v_club IS NULL THEN
    RAISE EXCEPTION 'Only the club administrator can change the club settings.' USING ERRCODE = '42501';
  END IF;
  UPDATE public.clubs SET single_device = coalesce(p_on, false) WHERE id = v_club;
  RETURN jsonb_build_object('single_device', coalesce(p_on, false));
END;
$$;

REVOKE ALL ON FUNCTION public.claim_account_device(text, text, boolean), public.check_account_device(text),
  public.release_account_device(text), public.admin_set_single_device(boolean) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.claim_account_device(text, text, boolean), public.check_account_device(text),
  public.release_account_device(text), public.admin_set_single_device(boolean) TO authenticated;

NOTIFY pgrst, 'reload schema';

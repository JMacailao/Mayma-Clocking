-- AvilonX Clocking: reset a forgotten password by email (members, club
-- administrators, staff and the Super Admin).
--
-- Each account can have one email for password resets, and an email belongs to
-- one account only (the same email cannot be on two accounts or two members).
-- - Members: the club administrator adds it on Members, or the member on
--   Settings (members.email).
-- - Club administrators: Club settings; the Super Admin: Setup
--   (app_profiles.email).
-- It is used only after it is confirmed with a link sent to it.
--
-- Forgot password? (sign-in page) sends a reset link to the account's confirmed
-- email. The link works once, for 1 hour. Choosing a new password signs the
-- account out everywhere and frees the one-device lock. At most 3 reset emails
-- and 3 confirmation emails per account per day.
--
-- The emails are sent by the Supabase Edge Function "avilonx-password-reset"
-- (supabase/functions/avilonx-password-reset, set up in docs/PASSWORD-RESET.md).
-- Only that function (with the service key) can create links; the links
-- themselves are stored only as SHA-256 hashes.
--
-- Run after account-devices.sql and before race-day.sql. Safe to run again.

ALTER TABLE public.members ADD COLUMN IF NOT EXISTS email text;
ALTER TABLE public.members ADD COLUMN IF NOT EXISTS email_confirmed_at timestamptz;
ALTER TABLE public.app_profiles ADD COLUMN IF NOT EXISTS email text;
ALTER TABLE public.app_profiles ADD COLUMN IF NOT EXISTS email_confirmed_at timestamptz;
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'members_email_format') THEN
    ALTER TABLE public.members ADD CONSTRAINT members_email_format
      CHECK (email IS NULL OR (length(email) <= 254 AND email ~ '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$'));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'app_profiles_email_format') THEN
    ALTER TABLE public.app_profiles ADD CONSTRAINT app_profiles_email_format
      CHECK (email IS NULL OR (length(email) <= 254 AND email ~ '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$'));
  END IF;
END $$;

-- The email is kept in lower case. A new or changed email must be confirmed
-- again, and "confirmed" can only be set by confirm_member_email().
CREATE OR REPLACE FUNCTION public._member_email_rules()
RETURNS trigger LANGUAGE plpgsql SET search_path = '' AS $$
BEGIN
  NEW.email := nullif(lower(btrim(NEW.email)), '');
  IF coalesce(current_setting('avilonx.email_confirm', true), '') <> 'on' THEN
    IF TG_OP = 'INSERT' OR NEW.email IS DISTINCT FROM OLD.email THEN
      NEW.email_confirmed_at := NULL;
    ELSE
      NEW.email_confirmed_at := OLD.email_confirmed_at;
    END IF;
  END IF;
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS members_email_rules ON public.members;
CREATE TRIGGER members_email_rules
  BEFORE INSERT OR UPDATE OF email, email_confirmed_at ON public.members
  FOR EACH ROW EXECUTE FUNCTION public._member_email_rules();
DROP TRIGGER IF EXISTS app_profiles_email_rules ON public.app_profiles;
CREATE TRIGGER app_profiles_email_rules
  BEFORE INSERT OR UPDATE OF email, email_confirmed_at ON public.app_profiles
  FOR EACH ROW EXECUTE FUNCTION public._member_email_rules();

-- One email, one account: not on another member, nor on another account.
-- (Runs after the rules above, which put the email in lower case.)
CREATE OR REPLACE FUNCTION public._email_one_account()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
BEGIN
  IF NEW.email IS NULL THEN RETURN NEW; END IF;
  PERFORM pg_advisory_xact_lock(hashtext('avilonx.email:' || NEW.email));
  IF EXISTS (SELECT 1 FROM public.members AS m
              WHERE m.email = NEW.email AND (TG_TABLE_NAME <> 'members' OR m.id::text <> NEW.id::text))
     OR EXISTS (SELECT 1 FROM public.app_profiles AS p
              WHERE p.email = NEW.email AND (TG_TABLE_NAME <> 'app_profiles' OR p.id::text <> NEW.id::text)) THEN
    RAISE EXCEPTION 'This email is already used by another account. Use a different email.' USING ERRCODE = 'P0001';
  END IF;
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION public._email_one_account() FROM PUBLIC, anon, authenticated;
DROP TRIGGER IF EXISTS members_email_unique ON public.members;
CREATE TRIGGER members_email_unique
  BEFORE INSERT OR UPDATE OF email ON public.members
  FOR EACH ROW EXECUTE FUNCTION public._email_one_account();
DROP TRIGGER IF EXISTS app_profiles_email_unique ON public.app_profiles;
CREATE TRIGGER app_profiles_email_unique
  BEFORE INSERT OR UPDATE OF email ON public.app_profiles
  FOR EACH ROW EXECUTE FUNCTION public._email_one_account();
-- Also enforced by unique indexes (skipped, with a notice, while two members
-- already share an email: change one of them on Members, then run again).
DO $$
BEGIN
  IF EXISTS (SELECT email FROM public.members WHERE email IS NOT NULL GROUP BY email HAVING count(*) > 1) THEN
    RAISE NOTICE 'Some members share an email: give each member its own email on Members, then run this file again.';
  ELSE
    CREATE UNIQUE INDEX IF NOT EXISTS members_email_unique ON public.members (email) WHERE email IS NOT NULL;
  END IF;
  CREATE UNIQUE INDEX IF NOT EXISTS app_profiles_email_unique ON public.app_profiles (email) WHERE email IS NOT NULL;
END $$;

-- One-time links (reset and confirm), stored as hashes. For a member, by the
-- member record; for other accounts, by the account. No direct access.
CREATE TABLE IF NOT EXISTS public.account_email_tokens (
  id bigint GENERATED BY DEFAULT AS IDENTITY PRIMARY KEY,
  member_id bigint REFERENCES public.members(id) ON DELETE CASCADE,
  kind text NOT NULL CHECK (kind IN ('reset', 'confirm')),
  token_hash text NOT NULL UNIQUE,
  email text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL,
  used_at timestamptz
);
ALTER TABLE public.account_email_tokens ALTER COLUMN member_id DROP NOT NULL;
ALTER TABLE public.account_email_tokens ADD COLUMN IF NOT EXISTS user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE;
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'account_email_tokens_owner') THEN
    ALTER TABLE public.account_email_tokens ADD CONSTRAINT account_email_tokens_owner
      CHECK ((member_id IS NULL) <> (user_id IS NULL));
  END IF;
END $$;
CREATE INDEX IF NOT EXISTS idx_account_email_tokens_member ON public.account_email_tokens (member_id, kind, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_account_email_tokens_user ON public.account_email_tokens (user_id, kind, created_at DESC);
ALTER TABLE public.account_email_tokens ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.account_email_tokens FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public._email_token_hash(p_token text)
RETURNS text LANGUAGE sql IMMUTABLE SET search_path = '' AS $$
  SELECT encode(extensions.digest(coalesce(p_token, ''), 'sha256'), 'hex')
$$;
REVOKE ALL ON FUNCTION public._email_token_hash(text) FROM PUBLIC, anon, authenticated;

-- Makes a new link for a member (p_member_id) or another account (p_user_id);
-- older unused ones of the same kind stop working. Returns NULL when there were
-- already 3 of this kind in the last 24 hours.
DROP FUNCTION IF EXISTS public._email_token_new(bigint, text, text, interval);
CREATE OR REPLACE FUNCTION public._email_token_new(p_member_id bigint, p_user_id uuid, p_kind text, p_email text, p_valid interval)
RETURNS text LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  v_token text := encode(extensions.gen_random_bytes(32), 'hex');
BEGIN
  IF (SELECT count(*) FROM public.account_email_tokens AS t
       WHERE t.member_id IS NOT DISTINCT FROM p_member_id AND t.user_id IS NOT DISTINCT FROM p_user_id
         AND t.kind = p_kind AND t.created_at > now() - interval '24 hours') >= 3 THEN
    RETURN NULL;
  END IF;
  UPDATE public.account_email_tokens SET used_at = now()
   WHERE member_id IS NOT DISTINCT FROM p_member_id AND user_id IS NOT DISTINCT FROM p_user_id AND kind = p_kind AND used_at IS NULL;
  INSERT INTO public.account_email_tokens (member_id, user_id, kind, token_hash, email, expires_at)
    VALUES (p_member_id, p_user_id, p_kind, public._email_token_hash(v_token), p_email, now() + p_valid);
  RETURN v_token;
END;
$$;
REVOKE ALL ON FUNCTION public._email_token_new(bigint, uuid, text, text, interval) FROM PUBLIC, anon, authenticated;

-- An account's email: for a member account the member record's, otherwise the
-- account's own. Returns (email, confirmed, member_id or NULL, name).
CREATE OR REPLACE FUNCTION public._account_email(p_user_id uuid)
RETURNS TABLE (email text, confirmed boolean, member_id bigint, name text)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $$
  SELECT CASE WHEN p.role = 'member' THEN m.email ELSE p.email END,
         CASE WHEN p.role = 'member' THEN m.email_confirmed_at IS NOT NULL ELSE p.email_confirmed_at IS NOT NULL END,
         CASE WHEN p.role = 'member' THEN m.id END,
         coalesce(m.full_name, p.username)
    FROM public.app_profiles AS p LEFT JOIN public.members AS m ON m.id = p.member_id
   WHERE p.id = p_user_id
$$;
REVOKE ALL ON FUNCTION public._account_email(uuid) FROM PUBLIC, anon, authenticated;

-- For the Edge Function only: a reset link for this username, or NULL (no
-- such account, disabled, no confirmed email, or 3 already today). The answer
-- to the visitor is the same either way.
CREATE OR REPLACE FUNCTION public.password_reset_issue(p_username text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  v_profile public.app_profiles%ROWTYPE;
  v_email text; v_confirmed boolean; v_member bigint; v_name text;
  v_token text;
BEGIN
  SELECT * INTO v_profile FROM public.app_profiles
   WHERE lower(username) = lower(btrim(coalesce(p_username, ''))) AND is_active;
  IF v_profile.id IS NULL THEN RETURN NULL; END IF;
  SELECT a.email, a.confirmed, a.member_id, a.name INTO v_email, v_confirmed, v_member, v_name FROM public._account_email(v_profile.id) AS a;
  IF v_email IS NULL OR NOT v_confirmed THEN RETURN NULL; END IF;
  v_token := public._email_token_new(v_member, CASE WHEN v_member IS NULL THEN v_profile.id END, 'reset', v_email, interval '1 hour');
  IF v_token IS NULL THEN RETURN NULL; END IF;
  RETURN jsonb_build_object('email', v_email, 'token', v_token, 'name', v_name, 'username', v_profile.username, 'role', v_profile.role);
END;
$$;
REVOKE ALL ON FUNCTION public.password_reset_issue(text) FROM PUBLIC, anon, authenticated;

-- For the Edge Function only: a confirmation link.
--   p_member_id given: a member's email, asked by that member or by an
--     administrator or staff of the member's club.
--   p_member_id NULL: the caller's own account email.
CREATE OR REPLACE FUNCTION public.email_confirm_issue(p_user_id uuid, p_member_id bigint)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  v_caller public.app_profiles%ROWTYPE;
  v_member public.members%ROWTYPE;
  v_email text; v_confirmed boolean; v_member_id bigint; v_name text;
  v_token text;
BEGIN
  SELECT * INTO v_caller FROM public.app_profiles WHERE id = p_user_id AND is_active;
  IF v_caller.id IS NULL THEN RAISE EXCEPTION 'Not allowed.' USING ERRCODE = '42501'; END IF;
  IF p_member_id IS NULL THEN
    SELECT a.email, a.confirmed, a.member_id, a.name INTO v_email, v_confirmed, v_member_id, v_name FROM public._account_email(v_caller.id) AS a;
  ELSE
    SELECT * INTO v_member FROM public.members WHERE id = p_member_id;
    IF v_member.id IS NULL
       OR NOT ((v_caller.role = 'member' AND v_caller.member_id = v_member.id)
               OR (v_caller.role IN ('admin', 'staff') AND v_caller.club_id = v_member.club_id)) THEN
      RAISE EXCEPTION 'Not allowed.' USING ERRCODE = '42501';
    END IF;
    v_email := v_member.email; v_confirmed := v_member.email_confirmed_at IS NOT NULL; v_member_id := v_member.id; v_name := v_member.full_name;
  END IF;
  IF v_email IS NULL THEN RAISE EXCEPTION 'No email saved yet.' USING ERRCODE = '22023'; END IF;
  IF v_confirmed THEN RETURN jsonb_build_object('confirmed', true, 'email', v_email); END IF;
  v_token := public._email_token_new(v_member_id, CASE WHEN v_member_id IS NULL THEN v_caller.id END, 'confirm', v_email, interval '3 days');
  IF v_token IS NULL THEN
    RAISE EXCEPTION 'Three confirmation emails were already sent today. Try again tomorrow.' USING ERRCODE = '22023';
  END IF;
  RETURN jsonb_build_object('email', v_email, 'token', v_token, 'name', v_name);
END;
$$;
REVOKE ALL ON FUNCTION public.email_confirm_issue(uuid, bigint) FROM PUBLIC, anon, authenticated;

-- The confirmation link: marks the email confirmed (if it is still the same).
CREATE OR REPLACE FUNCTION public.confirm_member_email(p_token text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  v_row public.account_email_tokens%ROWTYPE;
BEGIN
  SELECT * INTO v_row FROM public.account_email_tokens
   WHERE token_hash = public._email_token_hash(p_token) AND kind = 'confirm' AND used_at IS NULL AND expires_at > now();
  IF v_row.id IS NULL
     OR NOT (EXISTS (SELECT 1 FROM public.members WHERE id = v_row.member_id AND email = v_row.email)
             OR EXISTS (SELECT 1 FROM public.app_profiles WHERE id = v_row.user_id AND email = v_row.email)) THEN
    RAISE EXCEPTION 'This confirmation link has expired or was already used.' USING ERRCODE = '22023';
  END IF;
  PERFORM set_config('avilonx.email_confirm', 'on', true);
  UPDATE public.members SET email_confirmed_at = now() WHERE id = v_row.member_id;
  UPDATE public.app_profiles SET email_confirmed_at = now() WHERE id = v_row.user_id;
  PERFORM set_config('avilonx.email_confirm', 'off', true);
  UPDATE public.account_email_tokens SET used_at = now() WHERE id = v_row.id;
  RETURN jsonb_build_object('email', v_row.email);
END;
$$;
REVOKE ALL ON FUNCTION public.confirm_member_email(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.confirm_member_email(text) TO anon, authenticated;

-- The reset link: sets the new password, signs the account out everywhere and
-- frees the one-device lock. Recorded in the Change history.
CREATE OR REPLACE FUNCTION public.password_reset_complete(p_token text, p_password text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  v_row public.account_email_tokens%ROWTYPE;
  v_profile public.app_profiles%ROWTYPE;
  v_email text; v_confirmed boolean; v_member bigint; v_name text;
BEGIN
  IF p_password IS NULL OR length(p_password) < 8 THEN
    RAISE EXCEPTION 'Choose a password with at least 8 characters.' USING ERRCODE = '22023';
  END IF;
  IF length(p_password) > 72 THEN
    RAISE EXCEPTION 'Choose a password of at most 72 characters.' USING ERRCODE = '22023';
  END IF;
  SELECT * INTO v_row FROM public.account_email_tokens
   WHERE token_hash = public._email_token_hash(p_token) AND kind = 'reset' AND used_at IS NULL AND expires_at > now();
  IF v_row.member_id IS NOT NULL THEN
    SELECT * INTO v_profile FROM public.app_profiles WHERE member_id = v_row.member_id AND role = 'member' AND is_active;
  ELSE
    SELECT * INTO v_profile FROM public.app_profiles WHERE id = v_row.user_id AND is_active;
  END IF;
  SELECT a.email, a.confirmed, a.member_id, a.name INTO v_email, v_confirmed, v_member, v_name FROM public._account_email(v_profile.id) AS a;
  IF v_row.id IS NULL OR v_profile.id IS NULL OR v_email IS DISTINCT FROM v_row.email OR NOT coalesce(v_confirmed, false) THEN
    RAISE EXCEPTION 'This reset link has expired or was already used. Ask for a new one.' USING ERRCODE = '22023';
  END IF;
  UPDATE auth.users SET encrypted_password = extensions.crypt(p_password, extensions.gen_salt('bf')), updated_at = now()
   WHERE id = v_profile.id;
  UPDATE public.account_email_tokens SET used_at = now()
   WHERE member_id IS NOT DISTINCT FROM v_row.member_id AND user_id IS NOT DISTINCT FROM v_row.user_id AND kind = 'reset' AND used_at IS NULL;
  IF to_regclass('auth.sessions') IS NOT NULL THEN
    EXECUTE 'DELETE FROM auth.sessions WHERE user_id = $1' USING v_profile.id;
  END IF;
  IF to_regclass('public.account_devices') IS NOT NULL THEN
    EXECUTE 'DELETE FROM public.account_devices WHERE user_id = $1' USING v_profile.id;
  END IF;
  IF to_regclass('public.audit_log') IS NOT NULL AND v_profile.club_id IS NOT NULL THEN
    EXECUTE 'INSERT INTO public.audit_log (club_id, table_name, row_id, action, changed_by, changed_by_name, new_data) VALUES ($1, $2, $3, $4, $5, $6, $7)'
      USING v_profile.club_id, 'password_reset', v_member, 'update', v_profile.id, v_profile.username,
            jsonb_build_object('event', 'Password reset by email', 'member', v_name, 'email', v_row.email);
  END IF;
  RETURN jsonb_build_object('username', v_profile.username, 'role', v_profile.role);
END;
$$;
REVOKE ALL ON FUNCTION public.password_reset_complete(text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.password_reset_complete(text, text) TO anon, authenticated;

-- The signed-in account adds, changes or removes its own email (a member's
-- goes on the member record). It must then be confirmed.
CREATE OR REPLACE FUNCTION public.account_set_email(p_email text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  v_user uuid := auth.uid();
  v_profile public.app_profiles%ROWTYPE;
  v_email text := nullif(lower(btrim(coalesce(p_email, ''))), '');
BEGIN
  SELECT * INTO v_profile FROM public.app_profiles WHERE id = v_user AND is_active;
  IF v_profile.id IS NULL THEN RAISE EXCEPTION 'Sign in first.' USING ERRCODE = '42501'; END IF;
  IF v_email IS NOT NULL AND (length(v_email) > 254 OR v_email !~ '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$') THEN
    RAISE EXCEPTION 'Enter a valid email address.' USING ERRCODE = '22023';
  END IF;
  IF v_profile.role = 'member' THEN
    UPDATE public.members SET email = v_email WHERE id = v_profile.member_id;
  ELSE
    UPDATE public.app_profiles SET email = v_email WHERE id = v_user;
  END IF;
  RETURN (SELECT jsonb_build_object('email', a.email, 'confirmed', a.confirmed) FROM public._account_email(v_user) AS a);
END;
$$;
REVOKE ALL ON FUNCTION public.account_set_email(text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.account_set_email(text) TO authenticated;

-- The signed-in account's own email and whether it is confirmed.
CREATE OR REPLACE FUNCTION public.account_email_status()
RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $$
  SELECT jsonb_build_object('email', a.email, 'confirmed', a.confirmed) FROM public._account_email(auth.uid()) AS a
$$;
REVOKE ALL ON FUNCTION public.account_email_status() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.account_email_status() TO authenticated;

-- Earlier name, kept for pages already open.
CREATE OR REPLACE FUNCTION public.member_set_email(p_email text)
RETURNS jsonb LANGUAGE sql SECURITY DEFINER SET search_path = '' AS $$
  SELECT public.account_set_email(p_email)
$$;
REVOKE ALL ON FUNCTION public.member_set_email(text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.member_set_email(text) TO authenticated;

GRANT EXECUTE ON FUNCTION public.password_reset_issue(text) TO service_role;
GRANT EXECUTE ON FUNCTION public.email_confirm_issue(uuid, bigint) TO service_role;

NOTIFY pgrst, 'reload schema';

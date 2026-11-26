-- AvilonX Clocking: each club's own logo.
--
-- The club administrator uploads it on Club settings → Club logo. It shows in
-- the top bar next to the club name for the club's administrators, staff and
-- members. Logos are public images (bucket "club-logos", one folder per club);
-- only the club's administrator can add, replace or remove them.
--
-- Run after multi-club.sql. Safe to run again.

ALTER TABLE public.clubs ADD COLUMN IF NOT EXISTS logo_path text;

-- Saves (or with NULL removes) the club's logo. Returns the previous file so
-- the website can delete it.
CREATE OR REPLACE FUNCTION public.admin_set_club_logo(p_path text)
RETURNS jsonb LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  v_club bigint := public.current_club_id();
  v_old text;
BEGIN
  IF NOT public.is_app_admin() OR v_club IS NULL THEN
    RAISE EXCEPTION 'Only the club administrator can change the club logo.' USING ERRCODE = '42501';
  END IF;
  IF p_path IS NOT NULL AND (p_path NOT LIKE v_club || '/%' OR position('..' IN p_path) > 0 OR length(p_path) > 200) THEN
    RAISE EXCEPTION 'The logo was not saved in your club''s folder. Try again.' USING ERRCODE = '22023';
  END IF;
  SELECT c.logo_path INTO v_old FROM public.clubs AS c WHERE c.id = v_club;
  UPDATE public.clubs SET logo_path = p_path WHERE id = v_club;
  RETURN jsonb_build_object('logo_path', p_path, 'replaced_path', CASE WHEN v_old IS DISTINCT FROM p_path THEN v_old END);
END;
$$;
REVOKE ALL ON FUNCTION public.admin_set_club_logo(text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_set_club_logo(text) TO authenticated;

-- Public logo bucket (skipped where Supabase Storage is not installed).
DO $$
BEGIN
  IF to_regclass('storage.buckets') IS NULL OR to_regclass('storage.objects') IS NULL THEN
    RAISE NOTICE 'Supabase Storage not found: skipping the club-logos bucket.';
    RETURN;
  END IF;
  INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
  VALUES ('club-logos', 'club-logos', true, 1048576, ARRAY['image/png', 'image/jpeg', 'image/webp'])
  ON CONFLICT (id) DO UPDATE SET public = true, file_size_limit = EXCLUDED.file_size_limit, allowed_mime_types = EXCLUDED.allowed_mime_types;
  -- Write: the club administrator, in the club's own folder.
  EXECUTE 'DROP POLICY IF EXISTS club_logos_admin_insert ON storage.objects';
  EXECUTE $p$CREATE POLICY club_logos_admin_insert ON storage.objects FOR INSERT TO authenticated WITH CHECK (
    bucket_id = 'club-logos' AND public.is_app_admin() AND (storage.foldername(name))[1] = public.current_club_id()::text)$p$;
  EXECUTE 'DROP POLICY IF EXISTS club_logos_admin_delete ON storage.objects';
  EXECUTE $p$CREATE POLICY club_logos_admin_delete ON storage.objects FOR DELETE TO authenticated USING (
    bucket_id = 'club-logos' AND public.is_app_admin() AND (storage.foldername(name))[1] = public.current_club_id()::text)$p$;
END;
$$;

NOTIFY pgrst, 'reload schema';

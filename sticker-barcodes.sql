-- Global barcode sticker registry. Run after multi-club.sql in Supabase SQL Editor.
-- Generated barcode batches can be registered immediately or left unregistered.
BEGIN;

DO $$
BEGIN
  IF to_regclass('public.app_profiles') IS NULL
     OR to_regclass('public.clubs') IS NULL
     OR to_regclass('public.race_entries') IS NULL
     OR to_regprocedure('public.is_superadmin()') IS NULL THEN
    RAISE EXCEPTION 'Run schema.sql, supabase-auth.sql, and multi-club.sql before sticker-barcodes.sql.';
  END IF;
END;
$$;

CREATE SEQUENCE IF NOT EXISTS public.sticker_barcode_number_seq
  AS bigint START WITH 700000000000 INCREMENT BY 1 NO CYCLE;

CREATE TABLE IF NOT EXISTS public.barcode_stickers (
  barcode_number text COLLATE "C" PRIMARY KEY,
  source text NOT NULL CHECK (source IN ('generated','manual','legacy')),
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT barcode_stickers_number_valid CHECK (
    length(barcode_number) BETWEEN 1 AND 120
    AND barcode_number = btrim(barcode_number)
    AND barcode_number !~ '[[:space:][:cntrl:]]'
  )
);

-- Preserve barcodes already used by race entries when installing this feature.
INSERT INTO public.barcode_stickers (barcode_number, source)
SELECT DISTINCT btrim(e.barcode), 'legacy'
FROM public.race_entries AS e
WHERE e.barcode IS NOT NULL AND btrim(e.barcode) <> ''
ON CONFLICT (barcode_number) DO NOTHING;

ALTER TABLE public.barcode_stickers ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS barcode_stickers_read_registered ON public.barcode_stickers;
CREATE POLICY barcode_stickers_read_registered ON public.barcode_stickers
  FOR SELECT TO authenticated USING (true);

REVOKE ALL ON public.barcode_stickers FROM anon, PUBLIC;
GRANT SELECT ON public.barcode_stickers TO authenticated;
REVOKE ALL ON SEQUENCE public.sticker_barcode_number_seq FROM anon, PUBLIC, authenticated;

CREATE OR REPLACE FUNCTION public.superadmin_register_sticker(p_barcode_number text)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  v_number text;
  v_sticker public.barcode_stickers%ROWTYPE;
BEGIN
  IF NOT public.is_superadmin() THEN
    RAISE EXCEPTION 'Superadmin account required.' USING ERRCODE = '42501';
  END IF;

  v_number := btrim(COALESCE(p_barcode_number, ''));
  IF length(v_number) NOT BETWEEN 1 AND 120 OR v_number ~ '[[:space:][:cntrl:]]' THEN
    RAISE EXCEPTION 'Enter a barcode number with no spaces.' USING ERRCODE = '22023';
  END IF;

  INSERT INTO public.barcode_stickers (barcode_number, source, created_by)
  VALUES (v_number, 'manual', auth.uid())
  RETURNING * INTO v_sticker;

  RETURN v_sticker.barcode_number;
EXCEPTION
  WHEN unique_violation THEN
    RAISE EXCEPTION 'That barcode number is already registered.' USING ERRCODE = '23505';
END;
$function$;

REVOKE ALL ON FUNCTION public.superadmin_register_sticker(text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.superadmin_register_sticker(text) TO authenticated;

DROP FUNCTION IF EXISTS public.superadmin_generate_sticker_batch(integer, boolean);
DROP FUNCTION IF EXISTS public.superadmin_generate_sticker_batch(integer);

CREATE FUNCTION public.superadmin_generate_sticker_batch(
  p_quantity integer,
  p_register boolean DEFAULT true
)
RETURNS TABLE(barcode_number text, registered boolean)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  v_index integer;
  v_number text;
  v_should_register boolean := COALESCE(p_register, true);
BEGIN
  IF NOT public.is_superadmin() THEN
    RAISE EXCEPTION 'Superadmin account required.' USING ERRCODE = '42501';
  END IF;
  IF p_quantity IS NULL OR p_quantity NOT BETWEEN 1 AND 500 THEN
    RAISE EXCEPTION 'Choose a batch quantity from 1 to 500.' USING ERRCODE = '22023';
  END IF;

  FOR v_index IN 1..p_quantity LOOP
    LOOP
      v_number := nextval('public.sticker_barcode_number_seq')::text;
      EXIT WHEN NOT EXISTS (
        SELECT 1 FROM public.barcode_stickers AS s WHERE s.barcode_number = v_number
      ) AND NOT EXISTS (
        SELECT 1 FROM public.race_entries AS e WHERE e.barcode = v_number COLLATE "C"
      );
    END LOOP;

    IF v_should_register THEN
      INSERT INTO public.barcode_stickers (barcode_number, source, created_by)
      VALUES (v_number, 'generated', auth.uid());
    END IF;

    barcode_number := v_number;
    registered := v_should_register;
    RETURN NEXT;
  END LOOP;
END;
$function$;

REVOKE ALL ON FUNCTION public.superadmin_generate_sticker_batch(integer, boolean) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.superadmin_generate_sticker_batch(integer, boolean) TO authenticated;

-- A club can use any global barcode, but a race entry cannot introduce a code
-- that the Super Admin has not registered first.
CREATE OR REPLACE FUNCTION public.require_registered_race_barcode()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = ''
AS $function$
BEGIN
  IF NEW.barcode IS NULL OR btrim(NEW.barcode) = '' THEN
    RAISE EXCEPTION 'Choose a barcode registered by the Super Admin.' USING ERRCODE = '23514';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.barcode_stickers AS s WHERE s.barcode_number = NEW.barcode
  ) THEN
    RAISE EXCEPTION 'This barcode is not registered. Ask the Super Admin to register it first.' USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS race_entries_require_registered_barcode ON public.race_entries;
CREATE TRIGGER race_entries_require_registered_barcode
  BEFORE INSERT OR UPDATE OF barcode ON public.race_entries
  FOR EACH ROW EXECUTE FUNCTION public.require_registered_race_barcode();

COMMENT ON TABLE public.barcode_stickers IS
  'Global sticker barcode registry. Codes are not assigned to a club or member.';

COMMIT;

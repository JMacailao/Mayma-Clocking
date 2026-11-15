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

-- Hidden scratch-off code printed under the scratch area of each sticker. The
-- visible sticker number goes on the race entry; members clock with the hidden
-- code, which the server maps back to the sticker number. Stickers without a
-- scratch code (older stickers) still clock with their visible number.
ALTER TABLE public.barcode_stickers ADD COLUMN IF NOT EXISTS scratch_code text COLLATE "C";
ALTER TABLE public.barcode_stickers ADD COLUMN IF NOT EXISTS has_scratch_code boolean
  GENERATED ALWAYS AS (scratch_code IS NOT NULL) STORED;
ALTER TABLE public.barcode_stickers DROP CONSTRAINT IF EXISTS barcode_stickers_scratch_code_valid;
ALTER TABLE public.barcode_stickers ADD CONSTRAINT barcode_stickers_scratch_code_valid CHECK (
  scratch_code IS NULL OR (
    length(scratch_code) BETWEEN 4 AND 120
    AND scratch_code = btrim(scratch_code)
    AND scratch_code !~ '[[:space:][:cntrl:]]'
    AND scratch_code <> barcode_number
  )
);
CREATE UNIQUE INDEX IF NOT EXISTS barcode_stickers_scratch_code_key
  ON public.barcode_stickers (scratch_code) WHERE scratch_code IS NOT NULL;

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

-- Scratch codes are secret: no signed-in user (member, club team or superadmin)
-- may read them back. Only the clocking function compares them on the server.
REVOKE ALL ON public.barcode_stickers FROM anon, PUBLIC, authenticated;
GRANT SELECT (barcode_number, source, created_by, created_at, has_scratch_code)
  ON public.barcode_stickers TO authenticated;
REVOKE ALL ON SEQUENCE public.sticker_barcode_number_seq FROM anon, PUBLIC, authenticated;


-- Random 8-digit scratch code (10000000–99999999) from a cryptographically
-- random UUID, unique across scratch codes and sticker numbers.
CREATE OR REPLACE FUNCTION public._new_sticker_scratch_code()
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  v_code text;
BEGIN
  LOOP
    v_code := (10000000 + (('x' || substr(md5(gen_random_uuid()::text), 1, 15))::bit(60)::bigint % 90000000))::text;
    EXIT WHEN NOT EXISTS (
      SELECT 1 FROM public.barcode_stickers AS s
      WHERE s.scratch_code = v_code OR s.barcode_number = v_code
    );
  END LOOP;
  RETURN v_code;
END;
$function$;

REVOKE ALL ON FUNCTION public._new_sticker_scratch_code() FROM PUBLIC, anon, authenticated;

DROP FUNCTION IF EXISTS public.superadmin_register_sticker(text);
DROP FUNCTION IF EXISTS public.superadmin_register_sticker(text, text);

-- Registers a sticker number with the scratch-off code printed under its
-- scratch area. Registering an already-registered sticker that has no scratch
-- code yet adds the scratch code to it.
CREATE FUNCTION public.superadmin_register_sticker(
  p_barcode_number text,
  p_scratch_code text DEFAULT NULL
)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  v_number text;
  v_scratch text;
  v_existing public.barcode_stickers%ROWTYPE;
BEGIN
  IF NOT public.is_superadmin() THEN
    RAISE EXCEPTION 'Superadmin account required.' USING ERRCODE = '42501';
  END IF;

  v_number := btrim(COALESCE(p_barcode_number, ''));
  IF length(v_number) NOT BETWEEN 1 AND 120 OR v_number ~ '[[:space:][:cntrl:]]' THEN
    RAISE EXCEPTION 'Enter a barcode number with no spaces.' USING ERRCODE = '22023';
  END IF;

  v_scratch := NULLIF(btrim(COALESCE(p_scratch_code, '')), '');
  IF v_scratch IS NOT NULL THEN
    IF length(v_scratch) NOT BETWEEN 4 AND 120 OR v_scratch ~ '[[:space:][:cntrl:]]' THEN
      RAISE EXCEPTION 'Enter a scratch code of at least 4 characters with no spaces.' USING ERRCODE = '22023';
    END IF;
    IF v_scratch = v_number THEN
      RAISE EXCEPTION 'The scratch code must be different from the sticker number.' USING ERRCODE = '22023';
    END IF;
    IF EXISTS (SELECT 1 FROM public.barcode_stickers AS s WHERE s.barcode_number = v_scratch)
       OR EXISTS (SELECT 1 FROM public.barcode_stickers AS s WHERE s.scratch_code = v_scratch) THEN
      RAISE EXCEPTION 'That scratch code is already used by another sticker.' USING ERRCODE = '23505';
    END IF;
  END IF;

  SELECT s.* INTO v_existing FROM public.barcode_stickers AS s
  WHERE s.barcode_number = v_number FOR UPDATE;

  IF FOUND THEN
    IF v_scratch IS NOT NULL AND v_existing.scratch_code IS NULL THEN
      UPDATE public.barcode_stickers SET scratch_code = v_scratch WHERE barcode_number = v_number;
      RETURN v_number;
    END IF;
    RAISE EXCEPTION 'That barcode number is already registered.' USING ERRCODE = '23505';
  END IF;

  INSERT INTO public.barcode_stickers (barcode_number, scratch_code, source, created_by)
  VALUES (v_number, v_scratch, 'manual', auth.uid());

  RETURN v_number;
EXCEPTION
  WHEN unique_violation THEN
    RAISE EXCEPTION 'That barcode number or scratch code is already registered.' USING ERRCODE = '23505';
END;
$function$;

REVOKE ALL ON FUNCTION public.superadmin_register_sticker(text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.superadmin_register_sticker(text, text) TO authenticated;

DROP FUNCTION IF EXISTS public.superadmin_generate_sticker_batch(integer, boolean);
DROP FUNCTION IF EXISTS public.superadmin_generate_sticker_batch(integer);

CREATE FUNCTION public.superadmin_generate_sticker_batch(
  p_quantity integer,
  p_register boolean DEFAULT true
)
RETURNS TABLE(barcode_number text, scratch_code text, registered boolean)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  v_index integer;
  v_number text;
  v_scratch text;
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
        SELECT 1 FROM public.barcode_stickers AS s WHERE s.barcode_number = v_number OR s.scratch_code = v_number
      ) AND NOT EXISTS (
        SELECT 1 FROM public.race_entries AS e WHERE e.barcode = v_number COLLATE "C"
      );
    END LOOP;

    v_scratch := public._new_sticker_scratch_code();

    IF v_should_register THEN
      INSERT INTO public.barcode_stickers (barcode_number, scratch_code, source, created_by)
      VALUES (v_number, v_scratch, 'generated', auth.uid());
    END IF;

    barcode_number := v_number;
    scratch_code := v_scratch;
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
    -- Entries clocked by NFC tag (nfc-tags.sql) do not need a sticker. to_jsonb
    -- keeps this working before the nfc_tag column exists.
    IF NULLIF(to_jsonb(NEW) ->> 'nfc_tag', '') IS NOT NULL THEN
      NEW.barcode := NULL;
      RETURN NEW;
    END IF;
    RAISE EXCEPTION 'Choose a barcode registered by the Super Admin, or tap the pigeon''s NFC tag.' USING ERRCODE = '23514';
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


-- Members clock with the hidden scratch code. It is matched only against the
-- member's own entries in this race and mapped to the entry's sticker number.
-- Stickers registered without a scratch code still clock with their number.
CREATE OR REPLACE FUNCTION public.submit_member_clock(p_race_id bigint, p_barcode text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $function$
DECLARE
  v_member_id bigint;
  v_code text := btrim(COALESCE(p_barcode, ''));
  v_entry public.race_entries%ROWTYPE;
  v_race public.races%ROWTYPE;
  v_now timestamp without time zone;
  v_clock public.clock_events%ROWTYPE;
BEGIN
  v_member_id := public.current_member_id();
  IF v_member_id IS NULL THEN RAISE EXCEPTION 'Member account required.' USING ERRCODE='42501'; END IF;
  IF p_race_id IS NULL OR p_race_id < 1 OR length(v_code) NOT BETWEEN 1 AND 120 THEN
    RAISE EXCEPTION 'Enter a valid race and scratch code.' USING ERRCODE='22023';
  END IF;
  SELECT e.* INTO v_entry
  FROM public.race_entries AS e
  LEFT JOIN public.barcode_stickers AS s ON s.barcode_number = e.barcode
  WHERE e.race_id = p_race_id AND e.member_id = v_member_id
    AND (s.scratch_code = v_code OR (s.scratch_code IS NULL AND e.barcode = v_code))
  ORDER BY (s.scratch_code = v_code) DESC NULLS LAST, e.id
  LIMIT 1
  FOR UPDATE OF e;
  IF NOT FOUND THEN
    IF EXISTS (
      SELECT 1 FROM public.race_entries AS e
      JOIN public.barcode_stickers AS s ON s.barcode_number = e.barcode
      WHERE e.race_id = p_race_id AND e.member_id = v_member_id
        AND e.barcode = v_code AND s.scratch_code IS NOT NULL
    ) THEN
      RAISE EXCEPTION 'Use the hidden code under the scratch area, not the sticker number.' USING ERRCODE='22023';
    END IF;
    RAISE EXCEPTION 'This code does not match a sticker registered to your account for this race.' USING ERRCODE='22023';
  END IF;
  SELECT r.* INTO v_race FROM public.races AS r WHERE r.id = p_race_id;
  IF v_race.status <> 'open' THEN RAISE EXCEPTION 'This race is not open for clocking.' USING ERRCODE='22023'; END IF;
  v_now := clock_timestamp() AT TIME ZONE 'UTC';
  IF v_now <= v_race.release_at_utc THEN RAISE EXCEPTION 'This race has not started yet.' USING ERRCODE='22023'; END IF;
  SELECT c.* INTO v_clock FROM public.clock_events AS c WHERE c.race_entry_id = v_entry.id;
  IF FOUND THEN
    RETURN jsonb_build_object('status','duplicate','message','This pigeon already has a receipt.','receipt_id',v_clock.id,'received_at_utc',v_clock.received_at_utc,'pigeon_ring',v_entry.pigeon_ring,'barcode',v_entry.barcode);
  END IF;
  INSERT INTO public.clock_events(race_entry_id,pigeon_ring,received_at_utc,source,verification)
    VALUES (v_entry.id,v_entry.pigeon_ring,v_now,'barcode','provisional') RETURNING * INTO v_clock;
  RETURN jsonb_build_object('status','accepted','message','Clocking received for sticker '||v_entry.barcode||' and marked provisional.','receipt_id',v_clock.id,'received_at_utc',v_clock.received_at_utc,'pigeon_ring',v_entry.pigeon_ring,'barcode',v_entry.barcode);
END;
$function$;
REVOKE ALL ON FUNCTION public.submit_member_clock(bigint,text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.submit_member_clock(bigint,text) TO authenticated;

COMMENT ON TABLE public.barcode_stickers IS
  'Global sticker barcode registry. Codes are not assigned to a club or member.';

COMMIT;

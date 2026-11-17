-- Global barcode sticker registry. Run after multi-club.sql in Supabase SQL Editor;
-- it is safe to re-run.
--
-- Each sticker has a visible number (used to register the race entry) and a
-- secret code (printed as a barcode, used by the member to clock). New stickers
-- use an 8-digit sticker number (a 6-digit serial, restarting each year,
-- followed by the 2-digit year, e.g. 00012326) and a random 6-digit secret code. The Super Admin can start a new season, which archives the current
-- stickers so they stop working.
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

-- No longer used for new stickers; kept for older databases.
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

-- The secret code. Members clock with it; the server maps it back to the sticker
-- number on their race entry. Stickers without one (older stickers) clock with
-- their visible number. Secret codes repeat between stickers, so they are only
-- ever matched against one member's entries in one race.
ALTER TABLE public.barcode_stickers ADD COLUMN IF NOT EXISTS scratch_code text COLLATE "C";
ALTER TABLE public.barcode_stickers ADD COLUMN IF NOT EXISTS has_scratch_code boolean
  GENERATED ALWAYS AS (scratch_code IS NOT NULL) STORED;
-- Generated stickers are always saved. Those generated without registering are
-- kept inactive (clubs cannot use them) until the Super Admin registers them.
ALTER TABLE public.barcode_stickers ADD COLUMN IF NOT EXISTS is_registered boolean NOT NULL DEFAULT true;
ALTER TABLE public.barcode_stickers DROP CONSTRAINT IF EXISTS barcode_stickers_scratch_code_valid;
ALTER TABLE public.barcode_stickers ADD CONSTRAINT barcode_stickers_scratch_code_valid CHECK (
  scratch_code IS NULL OR (
    length(scratch_code) BETWEEN 1 AND 120
    AND scratch_code = btrim(scratch_code)
    AND scratch_code !~ '[[:space:][:cntrl:]]'
    AND scratch_code <> barcode_number
  )
);
-- Older secret codes may repeat, so there is no unique index; new 6-digit
-- secret codes are kept unique within a season.
DROP INDEX IF EXISTS public.barcode_stickers_scratch_code_key;

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

-- Secret codes are secret: no signed-in user (member, club team or superadmin)
-- may read them back. Only the clocking function compares them on the server.
REVOKE ALL ON public.barcode_stickers FROM anon, PUBLIC, authenticated;
GRANT SELECT (barcode_number, source, created_by, created_at, has_scratch_code, is_registered)
  ON public.barcode_stickers TO authenticated;
REVOKE ALL ON SEQUENCE public.sticker_barcode_number_seq FROM anon, PUBLIC, authenticated;

-- Stickers from earlier seasons, kept for the record. Nobody can read it from the app.
CREATE TABLE IF NOT EXISTS public.barcode_stickers_archive (
  barcode_number text COLLATE "C" NOT NULL,
  scratch_code text COLLATE "C",
  source text NOT NULL,
  is_registered boolean NOT NULL,
  created_by uuid,
  created_at timestamptz NOT NULL,
  archived_by uuid,
  archived_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.barcode_stickers_archive ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.barcode_stickers_archive FROM anon, PUBLIC, authenticated;

-- Wrong secret codes per member and race. After 10 wrong codes the member can no
-- longer clock that race; the club records the clocking instead. This stops a
-- member from guessing the short codes. Nobody can read or reset it from the app.
CREATE TABLE IF NOT EXISTS public.member_clock_attempts (
  member_id bigint NOT NULL,
  race_id bigint NOT NULL,
  failed integer NOT NULL DEFAULT 0,
  last_failed_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (member_id, race_id)
);
ALTER TABLE public.member_clock_attempts ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.member_clock_attempts FROM anon, PUBLIC, authenticated;

-- Sticker numbers and secret codes are compared without surrounding spaces.
-- Leading zeros are kept: 00012326 and 12326 are different numbers. Returns NULL
-- when blank.
CREATE OR REPLACE FUNCTION public.normalize_sticker_code(p_value text)
RETURNS text
LANGUAGE plpgsql
IMMUTABLE
SET search_path = ''
AS $function$
DECLARE
  v_code text := btrim(COALESCE(p_value, ''));
BEGIN
  RETURN NULLIF(v_code, '');
END;
$function$;
GRANT EXECUTE ON FUNCTION public.normalize_sticker_code(text) TO authenticated;

CREATE OR REPLACE FUNCTION public.is_short_sticker_code(p_value text)
RETURNS boolean
LANGUAGE sql
IMMUTABLE
SET search_path = ''
AS $function$
  SELECT COALESCE(p_value ~ '^[1-9][0-9]{0,3}$' AND p_value::integer <= 1999, false);
$function$;
GRANT EXECUTE ON FUNCTION public.is_short_sticker_code(text) TO authenticated;

-- Sticker numbers are 8 digits (6-digit serial + 2-digit year); secret codes
-- are 6 digits.
CREATE OR REPLACE FUNCTION public.is_sticker_secret_code(p_value text)
RETURNS boolean
LANGUAGE sql
IMMUTABLE
SET search_path = ''
AS $function$
  SELECT COALESCE(p_value ~ '^[0-9]{6}$', false);
$function$;
CREATE OR REPLACE FUNCTION public.is_sticker_number(p_value text)
RETURNS boolean
LANGUAGE sql
IMMUTABLE
SET search_path = ''
AS $function$
  SELECT COALESCE(p_value ~ '^[0-9]{8}$', false);
$function$;
GRANT EXECUTE ON FUNCTION public.is_sticker_number(text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_sticker_secret_code(text) TO authenticated;

-- Random 6-digit secret code (from a cryptographically random UUID), not used
-- by any other sticker this season.
DROP FUNCTION IF EXISTS public._new_sticker_scratch_code();
CREATE OR REPLACE FUNCTION public._new_sticker_scratch_code(p_number text)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  v_code text;
BEGIN
  LOOP
    v_code := lpad(((('x' || substr(md5(gen_random_uuid()::text), 1, 15))::bit(60)::bigint % 1000000))::text, 6, '0');
    EXIT WHEN v_code IS DISTINCT FROM p_number
      AND NOT EXISTS (SELECT 1 FROM public.barcode_stickers AS s WHERE s.scratch_code = v_code);
  END LOOP;
  RETURN v_code;
END;
$function$;
REVOKE ALL ON FUNCTION public._new_sticker_scratch_code(text) FROM PUBLIC, anon, authenticated;

DROP FUNCTION IF EXISTS public.superadmin_register_sticker(text);
DROP FUNCTION IF EXISTS public.superadmin_register_sticker(text, text);

-- Registers an 8-digit sticker number with its 6-digit secret code.
-- - A sticker generated without registering is activated; its saved secret code
--   is kept, so the secret code can be left blank.
-- - A registered sticker without a secret code gets the one given.
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
  v_number text := public.normalize_sticker_code(p_barcode_number);
  v_scratch text := public.normalize_sticker_code(p_scratch_code);
  v_existing public.barcode_stickers%ROWTYPE;
BEGIN
  IF NOT public.is_superadmin() THEN
    RAISE EXCEPTION 'Superadmin account required.' USING ERRCODE = '42501';
  END IF;
  IF NOT public.is_sticker_number(v_number) THEN
    RAISE EXCEPTION 'Sticker numbers are 8 digits: a 6-digit serial and the 2-digit year, for example 00012326.' USING ERRCODE = '22023';
  END IF;
  IF v_scratch IS NOT NULL THEN
    IF NOT public.is_sticker_secret_code(v_scratch) THEN
      RAISE EXCEPTION 'Secret codes are 6 digits, for example 482715.' USING ERRCODE = '22023';
    END IF;
    IF v_scratch = v_number THEN
      RAISE EXCEPTION 'The secret code must be different from the sticker number.' USING ERRCODE = '22023';
    END IF;
  END IF;

  SELECT s.* INTO v_existing FROM public.barcode_stickers AS s
  WHERE s.barcode_number = v_number FOR UPDATE;

  IF FOUND THEN
    IF NOT v_existing.is_registered THEN
      IF v_scratch IS NOT NULL AND v_existing.scratch_code IS DISTINCT FROM v_scratch THEN
        RAISE EXCEPTION 'That secret code does not match the generated sticker %. Check the sticker, or leave the secret code blank.', v_number USING ERRCODE = '22023';
      END IF;
      UPDATE public.barcode_stickers SET is_registered = true WHERE barcode_number = v_number;
      RETURN v_number;
    END IF;
    IF v_scratch IS NOT NULL AND v_existing.scratch_code IS NULL THEN
      UPDATE public.barcode_stickers SET scratch_code = v_scratch WHERE barcode_number = v_number;
      RETURN v_number;
    END IF;
    RAISE EXCEPTION 'Sticker % is already registered this season.', v_number USING ERRCODE = '23505';
  END IF;

  IF v_scratch IS NULL THEN
    RAISE EXCEPTION 'Enter the secret code (the number in the sticker''s barcode).' USING ERRCODE = '22023';
  END IF;

  INSERT INTO public.barcode_stickers (barcode_number, scratch_code, source, created_by)
  VALUES (v_number, v_scratch, 'manual', auth.uid());
  RETURN v_number;
END;
$function$;

REVOKE ALL ON FUNCTION public.superadmin_register_sticker(text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.superadmin_register_sticker(text, text) TO authenticated;

DROP FUNCTION IF EXISTS public.superadmin_generate_sticker_batch(integer, boolean);
DROP FUNCTION IF EXISTS public.superadmin_generate_sticker_batch(integer);

-- Issues the next sticker numbers for this year (6-digit serial + 2-digit year,
-- Philippine time) and gives each a random 6-digit secret code. The batch is
-- always saved, registered or not.
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
  v_year text := to_char(now() AT TIME ZONE 'Asia/Manila', 'YY');
  v_serial integer;
  v_should_register boolean := COALESCE(p_register, true);
BEGIN
  IF NOT public.is_superadmin() THEN
    RAISE EXCEPTION 'Superadmin account required.' USING ERRCODE = '42501';
  END IF;
  IF p_quantity IS NULL OR p_quantity NOT BETWEEN 1 AND 500 THEN
    RAISE EXCEPTION 'Choose a batch quantity from 1 to 500.' USING ERRCODE = '22023';
  END IF;

  -- One batch at a time, so two batches never take the same serials.
  LOCK TABLE public.barcode_stickers IN SHARE ROW EXCLUSIVE MODE;
  SELECT COALESCE(max(substr(n.number, 1, 6)::integer), 0) INTO v_serial
  FROM (
    SELECT s.barcode_number AS number FROM public.barcode_stickers AS s
    UNION ALL
    SELECT a.barcode_number FROM public.barcode_stickers_archive AS a
  ) AS n
  WHERE n.number ~ ('^[0-9]{6}' || v_year || '$');
  IF v_serial + p_quantity > 999999 THEN
    RAISE EXCEPTION 'Only % sticker numbers are left for this year.', 999999 - v_serial USING ERRCODE = '22023';
  END IF;

  FOR v_index IN 1..p_quantity LOOP
    v_number := lpad((v_serial + v_index)::text, 6, '0') || v_year;
    v_scratch := public._new_sticker_scratch_code(v_number);
    INSERT INTO public.barcode_stickers (barcode_number, scratch_code, source, created_by, is_registered)
    VALUES (v_number, v_scratch, 'generated', auth.uid(), v_should_register);

    barcode_number := v_number;
    scratch_code := v_scratch;
    registered := v_should_register;
    RETURN NEXT;
  END LOOP;
END;
$function$;

REVOKE ALL ON FUNCTION public.superadmin_generate_sticker_batch(integer, boolean) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.superadmin_generate_sticker_batch(integer, boolean) TO authenticated;

-- Archives every sticker of the current season, so they stop working. Refused while a draft or open race still uses stickers, so a
-- running race never loses its stickers.
CREATE OR REPLACE FUNCTION public.superadmin_start_sticker_season()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  v_races integer;
  v_archived integer;
BEGIN
  IF NOT public.is_superadmin() THEN
    RAISE EXCEPTION 'Superadmin account required.' USING ERRCODE = '42501';
  END IF;
  LOCK TABLE public.barcode_stickers IN SHARE ROW EXCLUSIVE MODE;

  SELECT count(DISTINCT r.id) INTO v_races
  FROM public.race_entries AS e
  JOIN public.races AS r ON r.id = e.race_id
  JOIN public.barcode_stickers AS s ON s.barcode_number = e.barcode
  WHERE r.status <> 'closed';
  IF v_races > 0 THEN
    RAISE EXCEPTION '% draft or open race(s) still use stickers. Clubs must close those races before a new sticker season starts.', v_races USING ERRCODE = '55000';
  END IF;

  INSERT INTO public.barcode_stickers_archive
    (barcode_number, scratch_code, source, is_registered, created_by, created_at, archived_by)
  SELECT s.barcode_number, s.scratch_code, s.source, s.is_registered, s.created_by, s.created_at, auth.uid()
  FROM public.barcode_stickers AS s;
  GET DIAGNOSTICS v_archived = ROW_COUNT;
  DELETE FROM public.barcode_stickers;
  RETURN v_archived;
END;
$function$;

REVOKE ALL ON FUNCTION public.superadmin_start_sticker_season() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.superadmin_start_sticker_season() TO authenticated;

-- A club can use any registered sticker, but a race entry cannot introduce a code
-- that the Super Admin has not registered first. Because secret codes repeat,
-- an entry is also refused when its sticker's codes clash with another sticker
-- the same member already has in the same race; otherwise one code could clock
-- the wrong pigeon. Runs as definer so it can compare secret codes, which no app
-- user can read.
CREATE OR REPLACE FUNCTION public.require_registered_race_barcode()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  v_sticker public.barcode_stickers%ROWTYPE;
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

  NEW.barcode := public.normalize_sticker_code(NEW.barcode);
  SELECT s.* INTO v_sticker FROM public.barcode_stickers AS s
  WHERE s.barcode_number = NEW.barcode AND s.is_registered;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Sticker % is not registered this season. Ask the Super Admin to register it first.', NEW.barcode USING ERRCODE = '23514';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.race_entries AS e
    JOIN public.barcode_stickers AS o ON o.barcode_number = e.barcode
    WHERE e.race_id = NEW.race_id AND e.member_id = NEW.member_id AND e.id IS DISTINCT FROM NEW.id
      AND (
        (v_sticker.scratch_code IS NOT NULL AND (o.scratch_code = v_sticker.scratch_code OR o.barcode_number = v_sticker.scratch_code))
        OR o.scratch_code = NEW.barcode
      )
  ) THEN
    RAISE EXCEPTION 'Sticker % clashes with another sticker this member already has in this race. Use a different sticker for this pigeon.', NEW.barcode USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS race_entries_require_registered_barcode ON public.race_entries;
CREATE TRIGGER race_entries_require_registered_barcode
  BEFORE INSERT OR UPDATE OF barcode, race_id, member_id ON public.race_entries
  FOR EACH ROW EXECUTE FUNCTION public.require_registered_race_barcode();

-- Members clock with the secret code (by scanning the sticker's barcode). It is
-- matched only against the member's own entries in this race and mapped to the
-- entry's sticker number. Stickers registered without a secret code still clock
-- with their number. A wrong code counts towards the 10-try limit; it returns a
-- 'rejected' status instead of an error so the count is saved.
CREATE OR REPLACE FUNCTION public.submit_member_clock(p_race_id bigint, p_barcode text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $function$
DECLARE
  v_member_id bigint;
  v_code text := public.normalize_sticker_code(p_barcode);
  v_entry public.race_entries%ROWTYPE;
  v_race public.races%ROWTYPE;
  v_now timestamp without time zone;
  v_clock public.clock_events%ROWTYPE;
  v_failed integer;
  v_limit constant integer := 10;
  v_message text;
BEGIN
  v_member_id := public.current_member_id();
  IF v_member_id IS NULL THEN RAISE EXCEPTION 'Member account required.' USING ERRCODE='42501'; END IF;
  IF p_race_id IS NULL OR p_race_id < 1 OR v_code IS NULL OR length(v_code) > 120 THEN
    RAISE EXCEPTION 'Enter a valid race and code.' USING ERRCODE='22023';
  END IF;

  SELECT r.* INTO v_race FROM public.races AS r
  WHERE r.id = p_race_id
    AND EXISTS (SELECT 1 FROM public.race_entries AS e WHERE e.race_id = r.id AND e.member_id = v_member_id);
  IF NOT FOUND THEN RAISE EXCEPTION 'You have no pigeons entered in this race.' USING ERRCODE='22023'; END IF;
  IF v_race.status <> 'open' THEN RAISE EXCEPTION 'This race is not open for clocking.' USING ERRCODE='22023'; END IF;
  v_now := clock_timestamp() AT TIME ZONE 'UTC';
  IF v_race.release_at_utc IS NULL OR v_now <= v_race.release_at_utc THEN
    RAISE EXCEPTION 'This race has not started yet.' USING ERRCODE='22023';
  END IF;

  SELECT a.failed INTO v_failed FROM public.member_clock_attempts AS a
  WHERE a.member_id = v_member_id AND a.race_id = p_race_id FOR UPDATE;
  IF COALESCE(v_failed, 0) >= v_limit THEN
    RETURN jsonb_build_object('status','locked','message','Too many wrong codes for this race. Ask your club to record this clocking.');
  END IF;

  SELECT e.* INTO v_entry
  FROM public.race_entries AS e
  LEFT JOIN public.barcode_stickers AS s ON s.barcode_number = e.barcode
  WHERE e.race_id = p_race_id AND e.member_id = v_member_id
    AND (s.scratch_code = v_code
         OR (s.barcode_number IS NOT NULL AND s.scratch_code IS NULL AND e.barcode = v_code))
  ORDER BY (s.scratch_code = v_code) DESC NULLS LAST, e.id
  LIMIT 1
  FOR UPDATE OF e;

  IF NOT FOUND THEN
    -- The reference barcode (the member's own sticker number) was scanned by
    -- mistake. It is not a guess, so it does not count towards the limit.
    IF EXISTS (
      SELECT 1 FROM public.race_entries AS e
      JOIN public.barcode_stickers AS s ON s.barcode_number = e.barcode
      WHERE e.race_id = p_race_id AND e.member_id = v_member_id
        AND e.barcode = v_code AND s.scratch_code IS NOT NULL
    ) THEN
      RETURN jsonb_build_object('status','rejected','message','That is the reference barcode. Scan the clocking barcode on the right-hand piece of the sticker.','tries_left',GREATEST(v_limit - COALESCE(v_failed, 0), 0));
    END IF;
    INSERT INTO public.member_clock_attempts AS a (member_id, race_id, failed, last_failed_at)
    VALUES (v_member_id, p_race_id, 1, now())
    ON CONFLICT (member_id, race_id) DO UPDATE SET failed = a.failed + 1, last_failed_at = now()
    RETURNING a.failed INTO v_failed;
    v_message := 'This code does not match a sticker registered to your account for this race.';
    IF v_failed >= v_limit THEN
      v_message := v_message || ' Too many wrong codes: ask your club to record this clocking.';
    ELSE
      v_message := v_message || ' ' || (v_limit - v_failed) || ' tries left.';
    END IF;
    RETURN jsonb_build_object('status','rejected','message',v_message,'tries_left',GREATEST(v_limit - v_failed, 0));
  END IF;

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
  'Global sticker barcode registry for the current season. Codes are not assigned to a club or member.';

COMMIT;

-- Tell the Supabase API to pick up new columns and functions straight away.
NOTIFY pgrst, 'reload schema';

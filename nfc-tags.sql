-- NFC tag clocking. Run after sticker-barcodes.sql in Supabase SQL Editor; it is
-- safe to re-run.
--
-- At basketing the club taps each pigeon's NFC tag to save its tag ID (UID) on the
-- race entry. When the pigeon arrives home, the member taps the same tag and the
-- server records the clocking time. Tag IDs are stored as uppercase hex without
-- separators, so "04:a2:3b:1c:5d:80:00" and "04A23B1C5D8000" are the same tag.
BEGIN;

DO $$
BEGIN
  IF to_regclass('public.race_entries') IS NULL
     OR to_regclass('public.barcode_stickers') IS NULL
     OR to_regprocedure('public.current_member_id()') IS NULL THEN
    RAISE EXCEPTION 'Run schema.sql, supabase-auth.sql, multi-club.sql and sticker-barcodes.sql before nfc-tags.sql.';
  END IF;
END;
$$;

-- Returns the tag ID as uppercase hex without separators, or NULL when blank.
-- Accepts 4, 7 or 10-byte UIDs written with or without ":", "-" or spaces.
CREATE OR REPLACE FUNCTION public.normalize_nfc_uid(p_value text)
RETURNS text
LANGUAGE plpgsql
IMMUTABLE
SET search_path = ''
AS $function$
DECLARE
  v_uid text := upper(regexp_replace(COALESCE(p_value, ''), '[[:space:]:-]', '', 'g'));
BEGIN
  IF v_uid = '' THEN
    RETURN NULL;
  END IF;
  IF v_uid !~ '^[0-9A-F]+$' OR length(v_uid) NOT IN (8, 14, 20) THEN
    RAISE EXCEPTION 'NFC tag ID must be 4, 7 or 10 bytes of hex, for example 04:A2:3B:1C:5D:80:00.' USING ERRCODE = '22023';
  END IF;
  RETURN v_uid;
END;
$function$;

GRANT EXECUTE ON FUNCTION public.normalize_nfc_uid(text) TO authenticated;

ALTER TABLE public.race_entries ADD COLUMN IF NOT EXISTS nfc_tag varchar(20) COLLATE "C";
ALTER TABLE public.race_entries DROP CONSTRAINT IF EXISTS race_entries_nfc_tag_valid;
ALTER TABLE public.race_entries ADD CONSTRAINT race_entries_nfc_tag_valid
  CHECK (nfc_tag IS NULL OR nfc_tag ~ '^([0-9A-F]{8}|[0-9A-F]{14}|[0-9A-F]{20})$');
-- One tag per pigeon in each race.
CREATE UNIQUE INDEX IF NOT EXISTS race_entries_race_nfc_tag_key
  ON public.race_entries (race_id, nfc_tag) WHERE nfc_tag IS NOT NULL;

CREATE OR REPLACE FUNCTION public.normalize_race_entry_nfc_tag()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = ''
AS $function$
BEGIN
  NEW.nfc_tag := public.normalize_nfc_uid(NEW.nfc_tag);
  RETURN NEW;
END;
$function$;

-- Named to run before race_entries_require_registered_barcode (triggers fire in
-- name order), so that check sees the normalized tag.
DROP TRIGGER IF EXISTS race_entries_a_normalize_nfc_tag ON public.race_entries;
CREATE TRIGGER race_entries_a_normalize_nfc_tag
  BEFORE INSERT OR UPDATE OF nfc_tag ON public.race_entries
  FOR EACH ROW EXECUTE FUNCTION public.normalize_race_entry_nfc_tag();

-- Clock receipts made by tapping an NFC tag are recorded with source 'nfc'.
ALTER TABLE public.clock_events DROP CONSTRAINT IF EXISTS clock_events_source_check;
ALTER TABLE public.clock_events ADD CONSTRAINT clock_events_source_check
  CHECK (source IN ('admin_manual', 'barcode', 'nfc'));

-- Member taps a tag. Without a race, the tag is looked up in the member's
-- entries for every open race; with a race, only in that race.
CREATE OR REPLACE FUNCTION public.submit_member_nfc_clock(p_tag text, p_race_id bigint DEFAULT NULL)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  v_member_id bigint;
  v_uid text;
  v_matches integer;
  v_entry public.race_entries%ROWTYPE;
  v_race public.races%ROWTYPE;
  v_now timestamp without time zone;
  v_clock public.clock_events%ROWTYPE;
BEGIN
  v_member_id := public.current_member_id();
  IF v_member_id IS NULL THEN
    RAISE EXCEPTION 'Member account required.' USING ERRCODE = '42501';
  END IF;
  v_uid := public.normalize_nfc_uid(p_tag);
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Tap an NFC tag first.' USING ERRCODE = '22023';
  END IF;

  SELECT count(*) INTO v_matches
  FROM public.race_entries AS e
  JOIN public.races AS r ON r.id = e.race_id
  WHERE e.member_id = v_member_id AND e.nfc_tag = v_uid
    AND (p_race_id IS NULL AND r.status = 'open' OR e.race_id = p_race_id);
  IF v_matches = 0 THEN
    RAISE EXCEPTION 'This NFC tag is not on any of your pigeons in an open race.' USING ERRCODE = '22023';
  END IF;
  IF v_matches > 1 THEN
    RAISE EXCEPTION 'This tag is entered in more than one open race. Choose the race, then tap again.' USING ERRCODE = '22023';
  END IF;

  SELECT e.* INTO v_entry
  FROM public.race_entries AS e
  JOIN public.races AS r ON r.id = e.race_id
  WHERE e.member_id = v_member_id AND e.nfc_tag = v_uid
    AND (p_race_id IS NULL AND r.status = 'open' OR e.race_id = p_race_id)
  FOR UPDATE OF e;

  SELECT r.* INTO v_race FROM public.races AS r WHERE r.id = v_entry.race_id;
  IF v_race.status <> 'open' THEN
    RAISE EXCEPTION 'This race is not open for clocking.' USING ERRCODE = '22023';
  END IF;
  v_now := clock_timestamp() AT TIME ZONE 'UTC';
  IF v_race.release_at_utc IS NULL OR v_now <= v_race.release_at_utc THEN
    RAISE EXCEPTION 'This race has not started yet.' USING ERRCODE = '22023';
  END IF;

  SELECT c.* INTO v_clock FROM public.clock_events AS c WHERE c.race_entry_id = v_entry.id;
  IF FOUND THEN
    RETURN jsonb_build_object('status', 'duplicate', 'message', 'Ring ' || v_entry.pigeon_ring || ' already has a receipt.',
      'receipt_id', v_clock.id, 'received_at_utc', v_clock.received_at_utc, 'pigeon_ring', v_entry.pigeon_ring, 'race', v_race.name);
  END IF;

  INSERT INTO public.clock_events (race_entry_id, pigeon_ring, received_at_utc, source, verification)
  VALUES (v_entry.id, v_entry.pigeon_ring, v_now, 'nfc', 'provisional')
  RETURNING * INTO v_clock;

  RETURN jsonb_build_object('status', 'accepted', 'message', 'Ring ' || v_entry.pigeon_ring || ' clocked for ' || v_race.name || '. Marked provisional.',
    'receipt_id', v_clock.id, 'received_at_utc', v_clock.received_at_utc, 'pigeon_ring', v_entry.pigeon_ring, 'race', v_race.name);
END;
$function$;

REVOKE ALL ON FUNCTION public.submit_member_nfc_clock(text, bigint) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.submit_member_nfc_clock(text, bigint) TO authenticated;

COMMIT;

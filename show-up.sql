-- AvilonX Clocking: show up (verification after clocking).
--
-- After a pigeon is clocked, its owner brings it to the club. The club admin
-- or staff taps the bird's RFID tag on the Show up page, which marks the clock
-- receipt as verified. When the race is closed (done), a receipt that was never
-- verified is disqualified: it is left out of the results.
--
-- Run after nfc-tags.sql. Safe to run again.

DO $$
BEGIN
  IF to_regprocedure('public.normalize_nfc_uid(text)') IS NULL THEN
    RAISE EXCEPTION 'Run nfc-tags.sql first, then show-up.sql.';
  END IF;
END $$;

ALTER TABLE public.clock_events ADD COLUMN IF NOT EXISTS shown_up_at timestamptz;
ALTER TABLE public.clock_events ADD COLUMN IF NOT EXISTS shown_up_by uuid;
ALTER TABLE public.clock_events ADD COLUMN IF NOT EXISTS shown_up_with text;

-- A receipt is disqualified when its race is closed and it was never verified.
DROP FUNCTION IF EXISTS public.clock_is_disqualified(text, timestamptz);
CREATE OR REPLACE FUNCTION public.clock_is_disqualified(p_verification text, p_race_status text)
RETURNS boolean LANGUAGE sql IMMUTABLE SET search_path = '' AS $$
  SELECT p_verification = 'provisional' AND p_race_status = 'closed'
$$;
GRANT EXECUTE ON FUNCTION public.clock_is_disqualified(text, text) TO anon, authenticated;

-- Club admin or staff: the bird's RFID tag was tapped on the Show up page.
CREATE OR REPLACE FUNCTION public.admin_show_up_tap(p_tag text, p_race_id bigint DEFAULT NULL, p_reader text DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  v_uid text := public.normalize_nfc_uid(p_tag);
  v_entry public.race_entries%ROWTYPE;
  v_race public.races%ROWTYPE;
  v_clock public.clock_events%ROWTYPE;
  v_when text;
BEGIN
  IF NOT public.can_manage_club_data() THEN RAISE EXCEPTION 'Club administrator or staff account required.' USING ERRCODE = '42501'; END IF;
  IF v_uid IS NULL THEN RAISE EXCEPTION 'The tag ID could not be read. Tap the tag again.' USING ERRCODE = '22023'; END IF;

  -- The latest race of this club in which this tag was entered.
  SELECT e.* INTO v_entry
  FROM public.race_entries AS e JOIN public.races AS r ON r.id = e.race_id
  WHERE e.nfc_tag = v_uid AND r.club_id = public.current_club_id() AND (p_race_id IS NULL OR e.race_id = p_race_id)
  ORDER BY r.release_at_utc DESC NULLS LAST, e.id DESC
  LIMIT 1;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('status', 'error', 'message', 'RFID tag ' || v_uid || ' is not on a pigeon in ' || CASE WHEN p_race_id IS NULL THEN 'any race of this club.' ELSE 'this race.' END);
  END IF;
  SELECT r.* INTO v_race FROM public.races AS r WHERE r.id = v_entry.race_id;

  SELECT c.* INTO v_clock FROM public.clock_events AS c WHERE c.race_entry_id = v_entry.id FOR UPDATE;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('status', 'error', 'entry_id', v_entry.id, 'pigeon_ring', v_entry.pigeon_ring, 'race', v_race.name,
      'message', 'Ring ' || v_entry.pigeon_ring || ' has not been clocked in ' || v_race.name || ', so there is no result to verify.');
  END IF;
  IF v_clock.verification = 'verified' THEN
    v_when := to_char(coalesce(v_clock.shown_up_at, now()) AT TIME ZONE 'Asia/Manila', 'Mon DD, HH12:MI AM');
    RETURN jsonb_build_object('status', 'duplicate', 'entry_id', v_entry.id, 'pigeon_ring', v_entry.pigeon_ring, 'race', v_race.name,
      'message', 'Ring ' || v_entry.pigeon_ring || ' was already verified' || CASE WHEN v_clock.shown_up_at IS NOT NULL THEN ' at ' || v_when ELSE '' END || '.');
  END IF;
  IF v_clock.verification = 'rejected' THEN
    RETURN jsonb_build_object('status', 'error', 'entry_id', v_entry.id, 'pigeon_ring', v_entry.pigeon_ring, 'race', v_race.name,
      'message', 'The result for ring ' || v_entry.pigeon_ring || ' was rejected by the club.');
  END IF;
  IF public.clock_is_disqualified(v_clock.verification, v_race.status) THEN
    RETURN jsonb_build_object('status', 'disqualified', 'entry_id', v_entry.id, 'pigeon_ring', v_entry.pigeon_ring, 'race', v_race.name,
      'message', 'Too late: ' || v_race.name || ' is closed and ring ' || v_entry.pigeon_ring || ' did not show up before it closed. This result is disqualified.');
  END IF;

  UPDATE public.clock_events AS c
  SET verification = 'verified', shown_up_at = now(), shown_up_by = (SELECT auth.uid()),
      shown_up_with = CASE WHEN p_reader IN ('wireless', 'wired', 'phone') THEN p_reader END
  WHERE c.id = v_clock.id;
  RETURN jsonb_build_object('status', 'verified', 'entry_id', v_entry.id, 'pigeon_ring', v_entry.pigeon_ring, 'race', v_race.name,
    'message', 'Ring ' || v_entry.pigeon_ring || ' showed up and is verified for ' || v_race.name || '.')
    || COALESCE(public._clock_receipt_details(v_entry.id, v_clock.id), '{}'::jsonb);
END;
$$;
REVOKE ALL ON FUNCTION public.admin_show_up_tap(text, bigint, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_show_up_tap(text, bigint, text) TO authenticated;

NOTIFY pgrst, 'reload schema';

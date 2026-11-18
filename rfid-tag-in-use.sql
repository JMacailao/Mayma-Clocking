-- AvilonX Clocking: an RFID tag is used once per race, and only in one race
-- at a time.
--
-- - In a race, each RFID tag can be entered once.
-- - A tag that is still active in another race cannot be entered in a new
--   race. Active = that race is not closed and the tag has not expired there
--   (its "RFID tag expires" time on Race entries has not passed; no expiry
--   means active until that race is closed).
-- Once the other race is closed or the tag has expired there, the tag is free
-- for the next race.
--
-- Run after nfc-tags.sql. Safe to run again.

CREATE OR REPLACE FUNCTION public.require_rfid_tag_free()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  v_other record;
  v_club bigint;
BEGIN
  IF NEW.nfc_tag IS NULL THEN
    RETURN NEW;
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.race_entries AS e
    WHERE e.race_id = NEW.race_id AND e.nfc_tag = NEW.nfc_tag AND e.id IS DISTINCT FROM NEW.id
  ) THEN
    RAISE EXCEPTION 'This RFID tag is already entered in this race. Each RFID tag can be used once per race.'
      USING ERRCODE = '23514';
  END IF;

  SELECT e.id, e.nfc_expires_at, r.name AS race_name, r.club_id
    INTO v_other
  FROM public.race_entries AS e
  JOIN public.races AS r ON r.id = e.race_id
  WHERE e.nfc_tag = NEW.nfc_tag
    AND e.race_id <> NEW.race_id
    AND e.id IS DISTINCT FROM NEW.id
    AND r.status <> 'closed'
    AND (e.nfc_expires_at IS NULL OR e.nfc_expires_at > now())
  ORDER BY e.nfc_expires_at NULLS FIRST
  LIMIT 1;

  IF FOUND THEN
    SELECT r.club_id INTO v_club FROM public.races AS r WHERE r.id = NEW.race_id;
    RAISE EXCEPTION '%',
      'This RFID tag is still active in '
      -- Name the other race only when it belongs to the same club.
      || CASE WHEN v_other.club_id = v_club THEN 'race "' || v_other.race_name || '"' ELSE 'another race' END
      || CASE WHEN v_other.nfc_expires_at IS NOT NULL
           THEN ' until ' || to_char(v_other.nfc_expires_at AT TIME ZONE 'Asia/Manila', 'Mon DD, YYYY HH12:MI AM')
           ELSE ' until that race is closed' END
      || '. It can be entered in a new race once it expires there or that race is closed.'
      USING ERRCODE = '23514';
  END IF;

  RETURN NEW;
END;
$function$;

REVOKE ALL ON FUNCTION public.require_rfid_tag_free() FROM PUBLIC, anon, authenticated;

-- Runs after the tag is normalized and checked as registered (name order).
DROP TRIGGER IF EXISTS race_entries_c_rfid_tag_free ON public.race_entries;
CREATE TRIGGER race_entries_c_rfid_tag_free
  BEFORE INSERT OR UPDATE OF nfc_tag, race_id ON public.race_entries
  FOR EACH ROW EXECUTE FUNCTION public.require_rfid_tag_free();

NOTIFY pgrst, 'reload schema';
